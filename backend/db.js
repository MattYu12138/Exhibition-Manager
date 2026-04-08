const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'exhibition.db');
const db = new Database(DB_PATH);

// 启用 WAL 模式提升性能
db.pragma('journal_mode = WAL');

// 初始化数据表（新建库使用雪花 ID）
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

// 迁移：为已有数据库添加新字段（若字段已存在则忽略）
const migrations = [
  'ALTER TABLE exhibition_items ADD COLUMN last_synced_quantity INTEGER DEFAULT NULL',
  'ALTER TABLE exhibition_items ADD COLUMN rack_quantity INTEGER DEFAULT 5',
  'ALTER TABLE exhibition_items ADD COLUMN stock_quantity INTEGER DEFAULT 5',
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
