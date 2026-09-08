const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const Database = require('../traceability-backend/node_modules/better-sqlite3');

const dbPath = '/tmp/lummi-traceability-test.db';
const port = 3904;
const baseUrl = `http://127.0.0.1:${port}`;

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

const insertProduct = db.prepare('INSERT INTO products (id, title, status) VALUES (?, ?, ?)');
const insertVariant = db.prepare('INSERT INTO product_variants (id, product_id, variant_title, sku, gtin) VALUES (?, ?, ?, ?, ?)');
const insertTrace = db.prepare(`
  INSERT INTO traceability_records (
    id, product_variant_id, batch_no, fiber_composition_zh, fiber_composition_en,
    certification_standard, certifying_body, licence_no, production_origin_zh,
    production_origin_en, gots_verification_url, is_published
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

insertProduct.run('P1', 'Organic Cotton Baby Wrap', 'active');
insertVariant.run('V1', 'P1', '110cm x 100cm', 'BW26001', '0123456789012');
insertTrace.run('TR1', 'V1', 'BATCH-001', '100% 有机棉', '100% Organic Cotton', 'GOTS organic', 'Test Certifier', 'LIC-001', '中国', 'China', 'https://global-standards.org/suppliers/certified-suppliers', 1);

insertProduct.run('P2', 'Draft Product', 'active');
insertVariant.run('V2', 'P2', '000', 'DP26001', '2000000000002');
insertTrace.run('TR2', 'V2', 'BATCH-DRAFT', '100% 有机棉', '100% Organic Cotton', 'GOTS organic', null, null, '中国', 'China', 'https://global-standards.org/suppliers/certified-suppliers', 0);

insertProduct.run('P3', 'Duplicate Product A', 'active');
insertProduct.run('P4', 'Duplicate Product B', 'active');
insertVariant.run('V3', 'P3', '00', 'DUP-A', '3000000000003');
insertVariant.run('V4', 'P4', '00', 'DUP-B', '3000000000003');
insertTrace.run('TR3', 'V3', 'BATCH-A', '100% 有机棉', '100% Organic Cotton', 'GOTS organic', null, null, '中国', 'China', 'https://global-standards.org/suppliers/certified-suppliers', 1);
insertTrace.run('TR4', 'V4', 'BATCH-B', '100% 有机棉', '100% Organic Cotton', 'GOTS organic', null, null, '中国', 'China', 'https://global-standards.org/suppliers/certified-suppliers', 1);
db.close();

const server = spawn(process.execPath, ['src/index.js'], {
  cwd: path.join(__dirname, '../traceability-backend'),
  env: {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(port),
    DB_PATH: dbPath,
    FRONTEND_URL: '*',
    TRACEABILITY_ANALYTICS_SALT: 'test-only-salt',
    PUBLIC_RATE_LIMIT_MAX: '100',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

server.stdout.on('data', data => process.stdout.write(data));
server.stderr.on('data', data => process.stderr.write(data));

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Traceability test server did not start');
}

async function request(barcode, lang = 'en') {
  const response = await fetch(`${baseUrl}/api/public/traceability?barcode=${encodeURIComponent(barcode)}&lang=${lang}`);
  const body = await response.json();
  return { status: response.status, body };
}

(async () => {
  try {
    await waitForServer();

    const found = await request('0123456789012', 'zh');
    assert.equal(found.status, 200);
    assert.equal(found.body.data.product_name, 'Organic Cotton Baby Wrap');
    assert.equal(found.body.data.style_number, 'BW26001');
    assert.equal(found.body.data.fiber_composition, '100% 有机棉');
    assert.equal(found.body.support_email, 'admin@lummiincolour.com.au');

    const draft = await request('2000000000002');
    assert.equal(draft.status, 404);
    assert.equal(draft.body.code, 'NOT_PUBLISHED');

    const missing = await request('4000000000004');
    assert.equal(missing.status, 404);
    assert.equal(missing.body.code, 'NOT_FOUND');

    const duplicate = await request('3000000000003');
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.code, 'AMBIGUOUS_BARCODE');

    const invalid = await request('###');
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.code, 'INVALID_BARCODE');

    const checkDb = new Database(dbPath);
    const logSummary = checkDb.prepare('SELECT result_status, COUNT(*) AS count FROM traceability_query_log GROUP BY result_status').all();
    const statuses = Object.fromEntries(logSummary.map(row => [row.result_status, row.count]));
    assert.deepEqual(statuses, { ambiguous: 1, found: 1, invalid: 1, not_found: 1, not_published: 1 });
    const visitor = checkDb.prepare('SELECT visitor_hash FROM traceability_query_log LIMIT 1').get();
    assert.ok(visitor.visitor_hash && visitor.visitor_hash.length === 32);
    checkDb.close();

    console.log('Traceability API integration tests passed.');
  } finally {
    server.kill('SIGTERM');
    fs.rmSync(dbPath, { force: true });
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
