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

    -- ── Inbound shipments (factory packing batches) ───────────────────────────
    -- id: SHP + 8-digit zero-padded sequential number, e.g. SHP00000001
    CREATE TABLE IF NOT EXISTS inbound_shipments (
      id            TEXT PRIMARY KEY,
      ref_no        TEXT UNIQUE NOT NULL,       -- human-readable batch ref, e.g. SHP00000001
      factory       TEXT,                       -- factory name
      note          TEXT,                       -- optional notes
      status        TEXT NOT NULL DEFAULT 'pending',
        -- pending | partial | received | cancelled
      source        TEXT NOT NULL DEFAULT 'manual',
        -- manual | form | excel
      form_token    TEXT UNIQUE,                -- token for factory form link (NULL if not used)
      form_token_expires_at DATETIME,           -- expiry for form token
      total_boxes   INTEGER NOT NULL DEFAULT 0, -- denormalised count, updated on box add/remove
      total_qty     INTEGER NOT NULL DEFAULT 0, -- denormalised total planned qty
      received_boxes INTEGER NOT NULL DEFAULT 0,
      created_by    TEXT,                       -- user_id
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      received_at   DATETIME                    -- set when status -> received
    );

    -- ── Inbound boxes (individual cartons) ───────────────────────────────────
    -- id: BX + 10-digit zero-padded sequential number, e.g. BX0000000001
    CREATE TABLE IF NOT EXISTS inbound_boxes (
      id            TEXT PRIMARY KEY,
      shipment_id   TEXT NOT NULL,
      box_no        TEXT NOT NULL,              -- e.g. "1", "2" or "A1"
      qr_token      TEXT UNIQUE NOT NULL,       -- random token encoded in QR code URL
      status        TEXT NOT NULL DEFAULT 'pending',
        -- pending | received
      note          TEXT,
      received_at   DATETIME,
      received_by   TEXT,                       -- user_id
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(shipment_id, box_no),
      FOREIGN KEY (shipment_id) REFERENCES inbound_shipments(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_inbound_boxes_shipment ON inbound_boxes(shipment_id);
    CREATE INDEX IF NOT EXISTS idx_inbound_boxes_qr_token ON inbound_boxes(qr_token);

    -- ── Inbound box items (SKU lines per box) ────────────────────────────────
    -- id: BXI + 10-digit zero-padded sequential number, e.g. BXI0000000001
    CREATE TABLE IF NOT EXISTS inbound_box_items (
      id                  TEXT PRIMARY KEY,
      box_id              TEXT NOT NULL,
      -- Factory-supplied raw data (never overwritten)
      raw_sku             TEXT,                 -- e.g. "GS26020-0000"
      raw_gtin            TEXT,
      raw_product_name    TEXT,
      raw_variant_name    TEXT,
      -- System-resolved match
      shopify_variant_id  TEXT,                 -- NULL if unmatched
      variant_title       TEXT,                 -- denormalised for display
      product_title       TEXT,                 -- denormalised for display
      match_status        TEXT NOT NULL DEFAULT 'matched',
        -- matched | unmatched | manual | ignored
      -- Quantities
      quantity            INTEGER NOT NULL CHECK(quantity > 0),
      received_qty        INTEGER NOT NULL DEFAULT 0,
      -- Ordering
      sort_order          INTEGER NOT NULL DEFAULT 0,
      created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (box_id) REFERENCES inbound_boxes(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_bxi_box        ON inbound_box_items(box_id);
    CREATE INDEX IF NOT EXISTS idx_bxi_variant    ON inbound_box_items(shopify_variant_id);

    -- ── Inbound log (receive audit trail) ────────────────────────────────────
    CREATE TABLE IF NOT EXISTS inbound_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      box_id        TEXT NOT NULL,
      shipment_id   TEXT NOT NULL,
      operated_by   TEXT,                       -- user_id
      operated_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      note          TEXT,
      variant_count INTEGER,                    -- number of distinct SKUs received
      total_qty     INTEGER                     -- total units received in this operation
    );

    CREATE INDEX IF NOT EXISTS idx_inbound_log_box      ON inbound_log(box_id);
    CREATE INDEX IF NOT EXISTS idx_inbound_log_shipment ON inbound_log(shipment_id);
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
