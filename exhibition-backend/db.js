const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const { encrypt } = require('./utils/crypto');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/database/exhibition.db');
// 自动创建数据库目录
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);

// 启用 WAL 模式提升性能
db.pragma('journal_mode = WAL');

// 初始化数据表（所有 id 均为 TEXT 类型，支持自定义格式如 EX0001、P000000000001）
db.exec(`
  -- 展会活动表
  CREATE TABLE IF NOT EXISTS exhibitions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    date TEXT,
    location TEXT,
    status TEXT DEFAULT 'preparing',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- 展会商品清单表
  CREATE TABLE IF NOT EXISTS exhibition_items (
    id TEXT PRIMARY KEY,
    exhibition_id TEXT NOT NULL,
    shopify_product_id TEXT NOT NULL,
    shopify_variant_id TEXT NOT NULL,
    product_title TEXT NOT NULL,
    variant_title TEXT,
    sku TEXT,
    gtin TEXT,
    image_url TEXT,
    rack_quantity INTEGER DEFAULT 5,
    stock_quantity INTEGER DEFAULT 5,
    planned_quantity INTEGER DEFAULT 10,
    checked INTEGER DEFAULT 0,
    last_synced_quantity INTEGER DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (exhibition_id) REFERENCES exhibitions(id) ON DELETE CASCADE
  );

  -- 展会结束后剩余盘点表
  CREATE TABLE IF NOT EXISTS inventory_snapshots (
    id TEXT PRIMARY KEY,
    exhibition_id TEXT NOT NULL,
    shopify_variant_id TEXT NOT NULL,
    square_catalog_variation_id TEXT,
    square_quantity_before INTEGER DEFAULT 0,
    square_quantity_after INTEGER DEFAULT 0,
    sold_quantity INTEGER DEFAULT 0,
    remaining_quantity INTEGER DEFAULT 0,
    synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (exhibition_id) REFERENCES exhibitions(id) ON DELETE CASCADE
  );

  -- 用户账号表
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// 自动迁移：将旧 INTEGER id 表迁移为 TEXT id（兼容旧数据库）
function migrateTableIdToText(tableName, idPrefix, padLength, fkUpdateSql) {
  try {
    const info = db.pragma(`table_info(${tableName})`);
    const idCol = info.find(c => c.name === 'id');
    if (!idCol || idCol.type.toUpperCase() === 'TEXT') return; // 已是 TEXT，跳过

    console.log(`[DB Migration] Migrating ${tableName}.id from INTEGER to TEXT...`);
    db.pragma('foreign_keys = OFF');

    // 获取旧数据
    const rows = db.prepare(`SELECT * FROM ${tableName}`).all();

    // 重建表（TEXT id）
    const createSql = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`).get(tableName);
    const newSql = createSql.sql
      .replace(new RegExp(`(\\bid\\b\\s+)INTEGER`, 'i'), '$1TEXT')
      .replace(new RegExp(`CREATE TABLE ${tableName}`, 'i'), `CREATE TABLE ${tableName}_new`);
    db.exec(newSql);

    // 迁移数据
    if (rows.length > 0) {
      const cols = Object.keys(rows[0]);
      const placeholders = cols.map(() => '?').join(', ');
      const insert = db.prepare(`INSERT INTO ${tableName}_new (${cols.join(', ')}) VALUES (${placeholders})`);
      for (const row of rows) {
        const vals = cols.map(c => {
          if (c === 'id') return idPrefix + String(row[c]).padStart(padLength, '0');
          return row[c];
        });
        insert.run(...vals);
      }
    }

    // 更新外键引用
    if (fkUpdateSql) db.exec(fkUpdateSql);

    // 替换表
    db.exec(`DROP TABLE ${tableName}; ALTER TABLE ${tableName}_new RENAME TO ${tableName};`);
    db.pragma('foreign_keys = ON');
    console.log(`[DB Migration] ${tableName} migration complete, ${rows.length} rows migrated.`);
  } catch (e) {
    db.pragma('foreign_keys = ON');
    console.error(`[DB Migration] ${tableName} migration failed:`, e.message);
  }
}

// 执行迁移（顺序：先 exhibitions，再 exhibition_items，最后 inventory_snapshots）
migrateTableIdToText('exhibitions', 'EX', 4,
  `UPDATE exhibition_items SET exhibition_id = 'EX' || printf('%04d', CAST(exhibition_id AS INTEGER)) WHERE exhibition_id NOT LIKE 'EX%';
   UPDATE inventory_snapshots SET exhibition_id = 'EX' || printf('%04d', CAST(exhibition_id AS INTEGER)) WHERE exhibition_id NOT LIKE 'EX%';`
);
migrateTableIdToText('exhibition_items', 'P', 12, null);
migrateTableIdToText('inventory_snapshots', 'IS', 8, null);

// 迁移：为已有数据库添加新字段（若字段已存在则忽略）
const migrations = [
  'ALTER TABLE exhibition_items ADD COLUMN last_synced_quantity INTEGER DEFAULT NULL',
  'ALTER TABLE exhibition_items ADD COLUMN rack_quantity INTEGER DEFAULT 5',
  'ALTER TABLE exhibition_items ADD COLUMN stock_quantity INTEGER DEFAULT 5',
  // 新增加密密码字段（AES-256-CBC 对称加密）
  'ALTER TABLE users ADD COLUMN password_encrypted TEXT',
];
for (const sql of migrations) {
  try { db.exec(sql); } catch (e) { /* 字段已存在，忽略 */ }
}

// 初始化 admin 账号（若不存在）
const adminExists = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
if (!adminExists) {
  const hash = bcrypt.hashSync('123456', 10);
  db.prepare("INSERT INTO users (id, username, password_hash, role) VALUES (?, 'admin', ?, 'admin')").run('U0000001', hash);
  console.log('[DB] admin 账号已初始化');
}

module.exports = db;
