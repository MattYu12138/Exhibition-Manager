const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'exhibition.db');
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
    planned_quantity INTEGER DEFAULT 0,   -- 计划带走数量
    checked INTEGER DEFAULT 0,            -- 是否已清点（0/1）
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

module.exports = db;
