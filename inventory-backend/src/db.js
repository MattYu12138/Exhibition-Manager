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
    -- ── Shopify sync log ──────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS inventory_sync_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      synced_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      product_count   INTEGER NOT NULL DEFAULT 0,
      variant_count   INTEGER NOT NULL DEFAULT 0,
      status      TEXT    NOT NULL DEFAULT 'success',
      message     TEXT
    );

    -- ── Shopify products (canonical) ─────────────────────────────────────────
    -- id: PR + 12-digit system ID, e.g. PR000000000001
    CREATE TABLE IF NOT EXISTS products (
      id                  TEXT PRIMARY KEY,
      shopify_product_id  TEXT UNIQUE,
      title               TEXT NOT NULL,
      vendor              TEXT,
      product_type        TEXT,
      status              TEXT DEFAULT 'active',
      handle              TEXT,
      tags                TEXT,
      main_image          TEXT,
      created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ── Shopify product variants ──────────────────────────────────────────────
    -- id: V + 12-digit system ID, e.g. V000000000001
    CREATE TABLE IF NOT EXISTS product_variants (
      id                  TEXT PRIMARY KEY,
      product_id          TEXT NOT NULL,
      shopify_variant_id  TEXT UNIQUE,
      shopify_product_id  TEXT,
      variant_title       TEXT,
      sku                 TEXT,
      gtin                TEXT,
      price               REAL,
      image_url           TEXT,
      inventory_quantity  INTEGER DEFAULT 0,
      created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    -- ── Square sync log ───────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS square_sync_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      synced_at     TEXT    NOT NULL DEFAULT (datetime('now')),
      item_count    INTEGER NOT NULL DEFAULT 0,
      variation_count INTEGER NOT NULL DEFAULT 0,
      status        TEXT    NOT NULL DEFAULT 'success',
      message       TEXT
    );

    -- ── Square catalog items ──────────────────────────────────────────────────
    -- Stores raw Square catalog data; refreshed on each Square sync
    CREATE TABLE IF NOT EXISTS square_products (
      id                  TEXT PRIMARY KEY,   -- Square CatalogItemVariation ID
      square_item_id      TEXT NOT NULL,       -- Square CatalogItem ID
      item_name           TEXT NOT NULL,       -- CatalogItem name
      variation_name      TEXT,                -- CatalogItemVariation name
      sku                 TEXT,
      gtin                TEXT,                -- upc field from Square
      price_amount        INTEGER,             -- in cents
      price_currency      TEXT DEFAULT 'AUD',
      synced_at           TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Index for fast SKU / GTIN lookups on square_products
    CREATE INDEX IF NOT EXISTS idx_square_products_sku  ON square_products(sku);
    CREATE INDEX IF NOT EXISTS idx_square_products_gtin ON square_products(gtin);
  `);
}

/**
 * Incremental migrations: safely add columns that may be missing in older DBs.
 * SQLite does not support IF NOT EXISTS for ALTER TABLE, so we use try/catch.
 */
function runMigrations() {
  const migrations = [
    // products table
    `ALTER TABLE products ADD COLUMN main_image TEXT`,
    `ALTER TABLE products ADD COLUMN handle TEXT`,
    `ALTER TABLE products ADD COLUMN tags TEXT`,
    `ALTER TABLE products ADD COLUMN vendor TEXT`,
    `ALTER TABLE products ADD COLUMN product_type TEXT`,
    `ALTER TABLE products ADD COLUMN status TEXT`,
    `ALTER TABLE products ADD COLUMN created_at DATETIME`,
    `ALTER TABLE products ADD COLUMN updated_at DATETIME`,
    // product_variants table
    `ALTER TABLE product_variants ADD COLUMN image_url TEXT`,
    `ALTER TABLE product_variants ADD COLUMN shopify_product_id TEXT`,
    `ALTER TABLE product_variants ADD COLUMN variant_title TEXT`,
    `ALTER TABLE product_variants ADD COLUMN sku TEXT`,
    `ALTER TABLE product_variants ADD COLUMN gtin TEXT`,
    `ALTER TABLE product_variants ADD COLUMN price REAL`,
    `ALTER TABLE product_variants ADD COLUMN inventory_quantity INTEGER`,
    `ALTER TABLE product_variants ADD COLUMN created_at DATETIME`,
    `ALTER TABLE product_variants ADD COLUMN updated_at DATETIME`,
  ];

  for (const sql of migrations) {
    try {
      db.exec(sql);
    } catch (e) {
      if (!e.message.includes('duplicate column name')) {
        console.warn('[DB Migration] Skipped:', sql.trim(), '-', e.message);
      }
    }
  }

  // Back-fill NULL timestamps for rows inserted before migration
  try {
    db.exec(`UPDATE products SET created_at = datetime('now'), updated_at = datetime('now') WHERE created_at IS NULL`);
    db.exec(`UPDATE product_variants SET created_at = datetime('now'), updated_at = datetime('now') WHERE created_at IS NULL`);
  } catch (_) {}
}

module.exports = { getDb };
