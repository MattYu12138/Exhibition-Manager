const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/database/LIC_DB.db');

let db;

function initSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS traceability_records (
      id TEXT PRIMARY KEY,
      product_variant_id TEXT NOT NULL,
      batch_no TEXT NOT NULL,
      trace_code TEXT UNIQUE,
      is_default INTEGER NOT NULL DEFAULT 1,
      fiber_composition_zh TEXT NOT NULL,
      fiber_composition_en TEXT NOT NULL,
      certification_standard TEXT NOT NULL DEFAULT 'GOTS organic',
      certifying_body TEXT,
      licence_no TEXT,
      production_origin_zh TEXT,
      production_origin_en TEXT,
      gots_verification_url TEXT,
      is_published INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      updated_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(product_variant_id, batch_no),
      FOREIGN KEY (product_variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_traceability_default_variant
      ON traceability_records(product_variant_id) WHERE is_default = 1;
    CREATE INDEX IF NOT EXISTS idx_traceability_published
      ON traceability_records(is_published);

    CREATE TABLE IF NOT EXISTS traceability_query_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barcode TEXT NOT NULL,
      traceability_record_id TEXT,
      result_status TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'en',
      visitor_hash TEXT,
      user_agent TEXT,
      referrer TEXT,
      queried_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (traceability_record_id) REFERENCES traceability_records(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_trace_query_barcode
      ON traceability_query_log(barcode);
    CREATE INDEX IF NOT EXISTS idx_trace_query_time
      ON traceability_query_log(queried_at);
  `);
}

function getDb() {
  if (!db) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

module.exports = { getDb };
