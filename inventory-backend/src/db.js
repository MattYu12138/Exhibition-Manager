const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Shared database - LIC_DB.db is the unified database for all services
// Local dev default: points to shared data/database directory
// Production: set DB_PATH env var to the shared path
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/database/LIC_DB.db');

let db;

function getDb() {
  if (!db) {
    // 自动创建数据库目录
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
    runMigrations();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory_sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      product_count INTEGER NOT NULL DEFAULT 0,
      variant_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'success',
      message TEXT
    );

    -- Canonical product table (replaces inventory_products_cache)
    -- id: PR + 12-digit system ID, e.g. PR000000000001
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      shopify_product_id TEXT UNIQUE,
      title TEXT NOT NULL,
      vendor TEXT,
      product_type TEXT,
      status TEXT DEFAULT 'active',
      handle TEXT,
      tags TEXT,
      main_image TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Product variant table
    -- id: V + 12-digit system ID, e.g. V000000000001
    CREATE TABLE IF NOT EXISTS product_variants (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      shopify_variant_id TEXT UNIQUE,
      shopify_product_id TEXT,
      variant_title TEXT,
      sku TEXT,
      gtin TEXT,
      price REAL,
      image_url TEXT,
      inventory_quantity INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );
  `);
}

/**
 * 数据库迁移：为旧版本数据库补充新增列
 * SQLite 不支持 IF NOT EXISTS 对列，使用 try/catch 兼容
 */
function runMigrations() {
  const migrations = [
    // products 表
    `ALTER TABLE products ADD COLUMN main_image TEXT`,
    `ALTER TABLE products ADD COLUMN handle TEXT`,
    `ALTER TABLE products ADD COLUMN tags TEXT`,
    `ALTER TABLE products ADD COLUMN vendor TEXT`,
    `ALTER TABLE products ADD COLUMN product_type TEXT`,
    `ALTER TABLE products ADD COLUMN status TEXT DEFAULT 'active'`,
    `ALTER TABLE products ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE products ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    // product_variants 表
    `ALTER TABLE product_variants ADD COLUMN image_url TEXT`,
    `ALTER TABLE product_variants ADD COLUMN shopify_product_id TEXT`,
    `ALTER TABLE product_variants ADD COLUMN variant_title TEXT`,
    `ALTER TABLE product_variants ADD COLUMN sku TEXT`,
    `ALTER TABLE product_variants ADD COLUMN gtin TEXT`,
    `ALTER TABLE product_variants ADD COLUMN price REAL`,
    `ALTER TABLE product_variants ADD COLUMN inventory_quantity INTEGER DEFAULT 0`,
    `ALTER TABLE product_variants ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE product_variants ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
  ];

  for (const sql of migrations) {
    try {
      db.exec(sql);
    } catch (e) {
      // 列已存在时会报 "duplicate column name"，忽略即可
      if (!e.message.includes('duplicate column name')) {
        console.warn('[DB Migration] Skipped:', sql.trim(), '-', e.message);
      }
    }
  }
}

module.exports = { getDb };
