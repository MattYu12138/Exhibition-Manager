const fs = require('fs');
const Database = require('../traceability-backend/node_modules/better-sqlite3');

const dbPath = '/tmp/lummi-traceability-preview.db';
fs.rmSync(dbPath, { force: true });
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE products (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    vendor TEXT,
    product_type TEXT,
    status TEXT,
    main_image TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE product_variants (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    variant_title TEXT,
    sku TEXT,
    gtin TEXT,
    image_url TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id)
  );
  CREATE TABLE traceability_records (
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
    FOREIGN KEY (product_variant_id) REFERENCES product_variants(id)
  );
  CREATE UNIQUE INDEX idx_traceability_default_variant
    ON traceability_records(product_variant_id) WHERE is_default = 1;
`);

db.prepare('INSERT INTO products (id, title, vendor, product_type, status) VALUES (?, ?, ?, ?, ?)')
  .run('P1', 'Organic Cotton Baby Swaddle Wrap - Avocados', 'Lummi in Colour', 'Swaddle Wrap', 'active');
db.prepare('INSERT INTO product_variants (id, product_id, variant_title, sku, gtin) VALUES (?, ?, ?, ?, ?)')
  .run('V1', 'P1', '110cm x 100cm', 'SW26001-AVO', '9341234567890');
db.prepare(`
  INSERT INTO traceability_records (
    id, product_variant_id, batch_no, fiber_composition_zh, fiber_composition_en,
    certification_standard, certifying_body, licence_no, production_origin_zh,
    production_origin_en, gots_verification_url, is_published
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  'TR1', 'V1', 'LIC-2026-001', '100% 有机棉', '100% Organic Cotton',
  'GOTS organic', 'Control Union Certifications', 'CU 1234567', '中国', 'China',
  'https://global-standards.org/suppliers/certified-suppliers', 1
);
db.close();
console.log(dbPath);
