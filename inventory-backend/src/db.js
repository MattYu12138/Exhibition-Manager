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

module.exports = { getDb };
