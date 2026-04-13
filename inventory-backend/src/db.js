const Database = require('better-sqlite3');
const path = require('path');

// Shared database with platform
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/platform.db');

let db;

function getDb() {
  if (!db) {
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
