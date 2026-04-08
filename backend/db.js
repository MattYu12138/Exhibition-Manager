const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'exhibition.db');
const db = new Database(DB_PATH);

// 启用 WAL 模式提升性能
db.pragma('journal_mode = WAL');

// 初始化数据表
db.exec(`
  -- 展会活动表
  CREATE TABLE IF NOT EXISTS exhibitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    date TEXT,
    location TEXT,
    status TEXT DEFAULT 'preparing',  -- preparing / active / completed
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- 展会商品清单表（出发前选择的商品）
  CREATE TABLE IF NOT EXISTS exhibition_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exhibition_id INTEGER NOT NULL,
    shopify_product_id TEXT NOT NULL,
    shopify_variant_id TEXT NOT NULL,
    product_title TEXT NOT NULL,
    variant_title TEXT,
    sku TEXT,
    gtin TEXT,
    image_url TEXT,
    rack_quantity INTEGER DEFAULT 5,       -- 挂衣架数量
    stock_quantity INTEGER DEFAULT 5,      -- 备货数量
    planned_quantity INTEGER DEFAULT 10,   -- 计划带走总数（= rack_quantity + stock_quantity）
    checked INTEGER DEFAULT 0,            -- 是否已清点（0/1）
    last_synced_quantity INTEGER DEFAULT NULL, -- 上次同步到 Square 时的数量
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (exhibition_id) REFERENCES exhibitions(id) ON DELETE CASCADE
  );

  -- 展会结束后剩余盘点表
  CREATE TABLE IF NOT EXISTS inventory_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exhibition_id INTEGER NOT NULL,
    shopify_variant_id TEXT NOT NULL,
    square_catalog_variation_id TEXT,
    square_quantity_before INTEGER DEFAULT 0,   -- 出发前 Square 库存
    square_quantity_after INTEGER DEFAULT 0,    -- 展会结束后 Square 库存
    sold_quantity INTEGER DEFAULT 0,            -- 展会销售数量（差值）
    remaining_quantity INTEGER DEFAULT 0,       -- 剩余数量
    synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (exhibition_id) REFERENCES exhibitions(id) ON DELETE CASCADE
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

module.exports = db;
