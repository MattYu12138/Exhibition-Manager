const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const Database = require('../platform-backend/node_modules/better-sqlite3');

const dbPath = '/tmp/lummi-platform-traceability-test.db';
const sessionPath = '/tmp/lummi-platform-traceability-sessions.db';
const port = 3900;
const baseUrl = `http://127.0.0.1:${port}`;

for (const file of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`, sessionPath]) fs.rmSync(file, { force: true });
const db = new Database(dbPath);
db.exec(`
  CREATE TABLE products (
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
  CREATE TABLE product_variants (
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
    FOREIGN KEY (product_id) REFERENCES products(id)
  );
`);
db.prepare('INSERT INTO products (id, title, status) VALUES (?, ?, ?)').run('P1', 'Organic Cotton Growsuit - Avocados', 'active');
db.prepare('INSERT INTO product_variants (id, product_id, variant_title, sku, gtin) VALUES (?, ?, ?, ?, ?)')
  .run('V1', 'P1', '000', 'GS26001-000', '9341234567890');
db.close();

const server = spawn(process.execPath, ['src/index.js'], {
  cwd: path.join(__dirname, '../platform-backend'),
  env: {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(port),
    DB_PATH: dbPath,
    SESSION_DB_PATH: sessionPath,
    SESSION_SECRET: 'platform-test-secret',
    FRONTEND_URL: 'http://localhost:5174',
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
  throw new Error('Platform test server did not start');
}

async function api(url, options = {}, cookie = '') {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (cookie) headers.Cookie = cookie;
  return fetch(`${baseUrl}${url}`, { ...options, headers });
}

(async () => {
  try {
    await waitForServer();

    const unauthorized = await api('/api/traceability/records');
    assert.equal(unauthorized.status, 401);

    const login = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: '123456' }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];

    const systemsResponse = await api('/api/systems', {}, cookie);
    const systems = await systemsResponse.json();
    assert.ok(systems.some(system => system.name === 'traceability-manager' && system.url === '/admin/traceability'));

    const variantsResponse = await api('/api/traceability/variants?search=934123', {}, cookie);
    const variants = await variantsResponse.json();
    assert.equal(variants.data.length, 1);
    assert.equal(variants.data[0].product_variant_id, 'V1');

    const createResponse = await api('/api/traceability/records', {
      method: 'POST',
      body: JSON.stringify({
        product_variant_id: 'V1',
        batch_no: 'LIC-2026-001',
        fiber_composition_zh: '100% 有机棉',
        fiber_composition_en: '100% Organic Cotton',
        certification_standard: 'GOTS organic',
        certifying_body: 'Control Union Certifications',
        licence_no: 'CU 1234567',
        production_origin_zh: '中国',
        production_origin_en: 'China',
        gots_verification_url: 'https://global-standards.org/suppliers/certified-suppliers',
        is_default: true,
        is_published: false,
      }),
    }, cookie);
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();
    assert.ok(created.data.id.startsWith('TR'));

    const recordsResponse = await api('/api/traceability/records?search=Avocados', {}, cookie);
    const records = await recordsResponse.json();
    assert.equal(records.total, 1);
    assert.equal(records.data[0].barcode, '9341234567890');

    const updateResponse = await api(`/api/traceability/records/${created.data.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        ...records.data[0],
        product_variant_id: 'V1',
        batch_no: 'LIC-2026-001',
        fiber_composition_zh: '100% 有机棉',
        fiber_composition_en: '100% Organic Cotton',
        is_default: true,
        is_published: true,
      }),
    }, cookie);
    assert.equal(updateResponse.status, 200);

    const testDb = new Database(dbPath);
    testDb.prepare(`
      INSERT INTO traceability_query_log (barcode, traceability_record_id, result_status, language, visitor_hash)
      VALUES (?, ?, ?, ?, ?)
    `).run('9341234567890', created.data.id, 'found', 'en', 'anonymous-test-hash');
    testDb.close();

    const statsResponse = await api('/api/traceability/stats?days=30', {}, cookie);
    const stats = await statsResponse.json();
    assert.equal(stats.data.summary.total_records, 1);
    assert.equal(stats.data.summary.published_records, 1);
    assert.equal(stats.data.summary.total_queries, 1);

    const deleteResponse = await api(`/api/traceability/records/${created.data.id}`, { method: 'DELETE' }, cookie);
    assert.equal(deleteResponse.status, 200);

    const checkDb = new Database(dbPath);
    assert.equal(checkDb.prepare('SELECT COUNT(*) AS count FROM traceability_records').get().count, 0);
    assert.equal(checkDb.prepare('SELECT COUNT(*) AS count FROM traceability_audit_log').get().count, 3);
    checkDb.close();

    console.log('Platform traceability API integration tests passed.');
  } finally {
    server.kill('SIGTERM');
    for (const file of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`, sessionPath]) fs.rmSync(file, { force: true });
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
