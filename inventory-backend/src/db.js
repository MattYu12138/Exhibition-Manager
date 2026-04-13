const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Shared database - use exhibition.db as the unified database
// Local dev default: point to exhibition-backend's database file
// Production: set DB_PATH env var to the shared path
const DB_PATH = process.env.DB_PATH || '/data/database/exhibition.db';

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

    CREATE TABLE IF NOT EXISTS inventory_products_cache (
      shopify_product_id TEXT PRIMARY KEY,
      title TEXT,
      vendor TEXT,
      product_type TEXT,
      status TEXT,
      handle TEXT,
      tags TEXT,
      raw_json TEXT NOT NULL,
      cached_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

module.exports = { getDb };
