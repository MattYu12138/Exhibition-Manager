const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const express = require('express');
const Database = require('better-sqlite3');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'warehouse-isolation-'));
process.env.DB_PATH = path.join(tmp, 'LIC_DB.db');
const seed = new Database(process.env.DB_PATH);
seed.exec(`
  CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT);
  INSERT INTO users VALUES ('admin-test', 'Admin');
  INSERT INTO users VALUES ('viewer-test', 'Viewer');
  CREATE TABLE platform_permissions (user_id TEXT, system TEXT, role TEXT);
  INSERT INTO platform_permissions VALUES ('viewer-test','warehouse-manager','viewer');
  CREATE TABLE products (id TEXT PRIMARY KEY, title TEXT, product_type TEXT, main_image TEXT, status TEXT);
  INSERT INTO products (id, title, status) VALUES ('P1', 'Test romper', 'active'), ('P2', 'Archived item', 'archived');
  CREATE TABLE product_variants (id TEXT, shopify_variant_id TEXT PRIMARY KEY, product_id TEXT, variant_title TEXT,
    sku TEXT, gtin TEXT, price REAL, image_url TEXT);
  INSERT INTO product_variants (id, shopify_variant_id, product_id, variant_title, sku, gtin) VALUES
    ('PV1', 'V1', 'P1', '000', 'V1-000', '01234567'),
    ('PV2', 'V2', 'P1', '00', 'V2-00', '01234567'),
    ('PV3', 'V3', 'P2', '000', 'ARCHIVE', '01234567');
  CREATE TABLE exhibitions (id TEXT PRIMARY KEY, name TEXT);
  CREATE TABLE inbound_shipments (id TEXT PRIMARY KEY, ref_no TEXT, factory TEXT, received_at TEXT, status TEXT, created_at TEXT);
  CREATE TABLE inbound_boxes (id TEXT PRIMARY KEY, shipment_id TEXT);
  CREATE TABLE inbound_box_items (id TEXT PRIMARY KEY, box_id TEXT, shopify_variant_id TEXT, received_qty INTEGER);
  INSERT INTO inbound_shipments VALUES ('SHIP1', 'SHIP1', 'Sample', '2026-10-01', 'received', '2026-10-01');
  INSERT INTO inbound_boxes VALUES ('BOX1', 'SHIP1');
  INSERT INTO inbound_box_items VALUES ('BOXITEM1', 'BOX1', 'V1', 2);
`);
seed.close();

const { db } = require('../db');
const app = express();
app.use(express.json());
app.use(require('../middleware/localizeResponse').localizeResponse);
app.use((req, res, next) => {
  req.session = req.get('X-Test-Anonymous') ? {} : req.get('X-Test-Viewer')
    ? { user: { id: 'viewer-test', role: 'staff' } }
    : { user: { id: 'admin-test', role: 'admin' } };
  next();
});
app.use('/api/layouts', require('../routes/layouts'));
app.use('/api/locations', require('../routes/locations'));
app.use('/api/picking', require('../routes/picking'));
app.use('/api/replenishment', require('../routes/replenishment'));
app.use('/api/products', require('../routes/products'));

function request(port, method, url, warehouseId, body) {
  return fetch(`http://127.0.0.1:${port}/api${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(warehouseId ? { 'X-Warehouse-Id': warehouseId } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }).then(async response => ({ status: response.status, body: await response.json() }));
}

// One serial test prevents shared SQLite state from being corrupted by parallel tests.
test('layouts, stock, picking and replenishment stay isolated by warehouse ID', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const port = server.address().port;
  const call = (method, url, warehouseId, body) => request(port, method, url, warehouseId, body);
  try {
    const created1 = await call('POST', '/layouts', null, { name: 'Same name', grid_cols: 20, grid_rows: 15 });
    const created2 = await call('POST', '/layouts', null, { name: 'Same name', grid_cols: 20, grid_rows: 15 });
    assert.equal(created1.status, 201);
    assert.equal(created2.status, 201);
    const one = created1.body.data.id, two = created2.body.data.id;
    assert.notEqual(one, two);
    assert.equal(created2.body.data.is_active, 0, 'creating a second warehouse must not silently activate it');

    const W1 = [
      { id: 'S1', type: 'shelf', code: 'A', levels: 1, cells: ['0,0'] },
      { id: 'D1', type: 'door', cells: ['18,14'] },
      { id: 'A1', type: 'aisle', cells: ['5,5', '5,6'] },
    ];
    const W2 = [{ id: 'S2', type: 'shelf', code: 'A', levels: 1, cells: ['2,2'] }];
    assert.equal((await call('PUT', `/layouts/${one}`, one, { layout_json: W1, grid_cols: 20, grid_rows: 15 })).status, 200);
    assert.equal((await call('PUT', `/layouts/${two}`, two, { layout_json: W2, grid_cols: 20, grid_rows: 15 })).status, 200);
    const saved = await call('GET', `/layouts/${one}`, one);
    assert.equal(JSON.parse(saved.body.data.layout_json).length, 3, 'non-shelf regions must survive save and reload');
    assert.deepEqual(JSON.parse(saved.body.data.layout_json)[1].cells, ['18,14']);
    const invalidGrid = await call('PUT', `/layouts/${one}`, one, { layout_json: W1, grid_cols: 10, grid_rows: 8 });
    assert.equal(invalidGrid.status, 400);
    assert.equal((await call('GET', `/layouts/${one}`, one)).body.data.grid_cols, 20);

    const list1 = await call('GET', '/locations', one);
    const list2 = await call('GET', '/locations', two);
    assert.equal(list1.body.data.length, 1);
    assert.equal(list2.body.data.length, 1);
    assert.equal(list1.body.data[0].code, 'A-01');
    assert.equal(list2.body.data[0].code, 'A-01');
    const loc1 = list1.body.data[0].id, loc2 = list2.body.data[0].id;
    assert.notEqual(loc1, loc2);
    assert.equal((await call('GET', `/locations/${loc1}`, two)).status, 404);
    assert.equal((await call('GET', `/locations?layout_id=${two}`, one)).status, 409);

    const download = (ids, selectedWarehouse, extraHeaders = {}) => fetch(`http://127.0.0.1:${port}/api/locations/qrcodes/export`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Warehouse-Id': selectedWarehouse, ...extraHeaders },
      body: JSON.stringify({ location_ids: ids }),
    });
    const labelPdf = await download([loc1], one);
    assert.equal(labelPdf.status, 200);
    assert.match(labelPdf.headers.get('content-type'), /^application\/pdf/);
    assert.match(labelPdf.headers.get('content-disposition'), /J8168\.pdf/);
    assert.equal(Buffer.from(await labelPdf.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
    assert.equal((await download([loc1, loc1], one)).status, 400, 'duplicate selected shelves cannot be printed twice accidentally');
    assert.equal((await download([], one)).status, 400);
    assert.equal((await download([loc1, loc2], one)).status, 404, 'do not export a QR token from another warehouse');
    assert.equal((await download([loc1], two)).status, 404);
    assert.equal((await download([loc1], one, { 'X-Test-Anonymous': 'yes' })).status, 401);
    assert.equal((await download([loc1], one, { 'X-Test-Viewer': 'yes' })).status, 200,
      'a warehouse viewer can export read-only shelf QR labels');

    assert.equal((await call('POST', `/locations/${loc1}/inventory`, one, {
      shopify_variant_id: 'V1', quantity: 2, stock_type: 'retail',
    })).status, 201);
    assert.equal((await call('POST', `/locations/${loc1}/inventory`, one, {
      shopify_variant_id: 'V1', quantity: 3, stock_type: 'retail_storage',
    })).status, 201);
    assert.equal((await call('POST', `/locations/${loc2}/inventory`, two, {
      shopify_variant_id: 'V1', quantity: 6, stock_type: 'retail',
    })).status, 201);
    assert.equal((await call('POST', `/locations/${loc1}/inventory`, two, {
      shopify_variant_id: 'V1', quantity: 9, stock_type: 'retail',
    })).status, 404);
    assert.equal((await call('POST', `/locations/${loc2}/transfer`, two, {
      shopify_variant_id: 'V1', quantity: 1, from_location_id: loc1,
    })).status, 404, 'internal transfers cannot cross warehouses');
    assert.equal((await call('GET', '/locations', one)).body.data[0].total_qty, 5);
    assert.equal((await call('GET', '/locations', two)).body.data[0].total_qty, 6);
    db.prepare(`INSERT INTO warehouse_trade_shipments
      (id, po_ref, invoice_ref, packing_ref, bol_ref, source_checksums, declared_units)
      VALUES ('S-TEST', 'PO-TEST', 'INV-TEST', 'PL-TEST', 'BOL-TEST', '{}', 2)`).run();
    db.prepare(`INSERT INTO warehouse_trade_shipment_lines
      (id, shipment_id, document_sku, document_title, barcode, po_quantity, invoice_quantity,
       packing_quantity, shopify_variant_id, match_method)
      VALUES ('L-EXACT', 'S-TEST', 'V1-000', 'Test romper', '01234567', 1, 1, 1, 'V1', 'exact_sku')`).run();
    db.prepare(`INSERT INTO warehouse_trade_shipment_lines
      (id, shipment_id, document_sku, document_title, barcode, po_quantity, invoice_quantity,
       packing_quantity, shopify_variant_id, match_method)
      VALUES ('L-CANDIDATE', 'S-TEST', 'NEW-SKU', 'Other style', '01234567', 1, 1, 1, NULL, 'unmatched')`).run();
    const stockedPdfResponse = await download([loc1], one);
    assert.equal(stockedPdfResponse.status, 200);
    const stockedPdf = Buffer.from(await stockedPdfResponse.arrayBuffer());
    assert.equal(stockedPdf.subarray(0, 5).toString(), '%PDF-');
    const pdfText = spawnSync('pdftotext', ['-', '-'], { input: stockedPdf, encoding: 'utf8' });
    if (!pdfText.error) {
      assert.equal(pdfText.status, 0, pdfText.stderr);
      for (const expected of ['Test romper', 'SIZE: 000', 'SKU: V1-000', '01234567']) {
        assert.ok(pdfText.stdout.includes(expected), `print ${expected} on the stocked shelf label`);
      }
      assert.equal((pdfText.stdout.match(/Test romper/g) || []).length, 1,
        'the same variant in retail and storage buckets must not be printed twice');
      assert.ok(!pdfText.stdout.includes('ARCHIVE'), 'do not print archived or unstocked products');
    }
    for (const invalid of ['1234567', '123456789', '1234567A']) {
      const response = await call('GET', `/products/barcode/${invalid}`, one);
      assert.equal(response.status, 400);
      assert.equal(response.body.code, 'INVALID_BARCODE');
    }
    assert.deepEqual((await call('GET', '/products/barcode/00000000', one)).body.data.matches, []);
    const barcodeInOne = await call('GET', '/products/barcode/01234567', one);
    const barcodeInTwo = await call('GET', '/products/barcode/01234567', two);
    assert.equal(barcodeInOne.status, 200);
    assert.equal(barcodeInOne.body.data.barcode, '01234567', 'the first zero is part of the text barcode');
    assert.equal(barcodeInOne.body.data.ambiguous, true);
    assert.equal(barcodeInOne.body.data.matches.length, 2, 'show duplicates but never mistake an archived variant for active stock');
    assert.equal(barcodeInOne.body.data.matches.find(item => item.shopify_variant_id === 'V1').total_quantity, 5);
    assert.equal(barcodeInOne.body.data.matches.find(item => item.shopify_variant_id === 'V1').locations.length, 2);
    const lineEvidence = barcodeInOne.body.data.matches.find(item => item.shopify_variant_id === 'V1');
    assert.equal(lineEvidence.trade_documents.length, 2);
    assert.equal(lineEvidence.trade_documents.find(doc => doc.document_sku === 'V1-000').relation, 'catalogue_sku_candidate');
    assert.equal(lineEvidence.trade_documents.find(doc => doc.document_sku === 'NEW-SKU').relation, 'barcode_candidate');
    assert.equal(lineEvidence.stock_source_status, 'trade_shipment_to_stock_unverified');
    assert.equal(barcodeInOne.body.data.matches.find(item => item.shopify_variant_id === 'V2').trade_documents[0].relation, 'barcode_candidate');
    assert.ok(!JSON.stringify(lineEvidence).includes('source_checksums'), 'never expose raw evidence file hashes to barcode viewers');
    const viewerResponse = await fetch(`http://127.0.0.1:${port}/api/products/barcode/01234567`, {
      headers: { 'X-Test-Viewer': 'yes', 'X-Warehouse-Id': one },
    });
    const viewerBody = await viewerResponse.json();
    assert.equal(viewerResponse.status, 200);
    assert.equal(viewerBody.data.evidence_access, false);
    assert.deepEqual(viewerBody.data.matches[0].trade_documents, []);
    assert.ok(!JSON.stringify(viewerBody).includes('PO-TEST'));
    assert.ok(db.prepare('SELECT COUNT(*) n FROM warehouse_trade_access_log').get().n >= 2,
      'admin evidence lookups should have an auditable read trail');
    assert.equal(barcodeInOne.body.data.matches.find(item => item.shopify_variant_id === 'V2').total_quantity, 0,
      'show a catalogue match even when no warehouse inventory has been entered');
    assert.equal(barcodeInTwo.body.data.layout_id, two);
    assert.equal(barcodeInTwo.body.data.matches.find(item => item.shopify_variant_id === 'V1').total_quantity, 6,
      'do not leak stock from another same-named warehouse');
    assert.equal((await call('GET', `/products/barcode/01234567?layout_id=${two}`, one)).status, 409);
    assert.equal((await call('GET', '/products/barcode/01234567', 'not-a-warehouse')).status, 404);
    const anonymous = await fetch(`http://127.0.0.1:${port}/api/products/barcode/01234567`, {
      headers: { 'X-Test-Anonymous': 'yes' },
    });
    assert.equal(anonymous.status, 401, 'product and stock locations are only available to logged-in users');
    assert.equal((await call('DELETE', `/layouts/${one}`, one)).status, 409, 'the active warehouse cannot be deleted');
    const english = await fetch(`http://127.0.0.1:${port}/api/layouts/${one}`, {
      method: 'DELETE', headers: { 'Accept-Language': 'en' },
    });
    assert.equal(english.status, 409);
    assert.match((await english.json()).message, /^The active or last warehouse/);
    assert.equal((await call('DELETE', `/layouts/${two}`, two)).status, 409, 'even zero-stock layouts must retain their locations and history');

    const movedStock = await call('PUT', `/layouts/${one}`, one, {
      layout_json: [{ ...W1[0], cells: ['1,1'] }, ...W1.slice(1)], grid_cols: 20, grid_rows: 15,
    });
    assert.equal(movedStock.status, 409, 'cannot silently relabel a stocked physical location');
    assert.equal(JSON.parse((await call('GET', `/layouts/${one}`, one)).body.data.layout_json)[0].cells[0], '0,0');

    const shortageTask = await call('POST', '/picking/tasks/from-order', one, {
      shopify_order_name: '#shortage', line_items: [{ shopify_variant_id: 'V1', quantity: 12 }],
    });
    const shortTaskId = shortageTask.body.data.id;
    const shortLine = (await call('GET', `/picking/tasks/${shortTaskId}`, one)).body.data.lines[0];
    assert.equal((await call('PATCH', `/picking/tasks/${shortTaskId}/lines/${shortLine.id}/pick`, one, { picked_qty: 12 })).status, 409);
    assert.equal((await call('GET', '/locations', one)).body.data[0].total_qty, 5, 'failed pick must roll back inventory and movements');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM warehouse_movements WHERE reference_id = ?').get(shortLine.id).count, 0);
    assert.equal((await call('DELETE', `/picking/tasks/${shortTaskId}`, one)).status, 200, 'an untouched draft task remains deletable');

    const picked = await call('POST', '/picking/tasks/from-order', one, {
      shopify_order_name: '#123', line_items: [{ shopify_variant_id: 'V1', quantity: 5 }],
    });
    assert.equal(picked.status, 201);
    const task = picked.body.data.id;
    assert.equal(picked.body.data.layout_id, one);
    assert.equal((await call('GET', `/picking/tasks/${task}`, two)).status, 404);
    const line = (await call('GET', `/picking/tasks/${task}`, one)).body.data.lines[0];
    assert.equal(line.location_id, loc1);
    assert.equal((await call('PATCH', `/picking/tasks/${task}/lines/${line.id}/pick`, one, { picked_qty: 5 })).status, 200);
    assert.equal((await call('GET', '/locations', one)).body.data[0].total_qty, 0);
    assert.equal((await call('GET', '/locations', two)).body.data[0].total_qty, 6, 'picking must not take stock from the other warehouse');
    assert.equal((await call('DELETE', `/picking/tasks/${task}`, one)).status, 409, 'completed tasks must retain their picking history');
    assert.equal((await call('PATCH', `/picking/tasks/${task}/lines/${line.id}/unpick`, one)).status, 200);
    assert.equal((await call('GET', '/locations', one)).body.data[0].total_qty, 5);
    const stockBuckets = db.prepare('SELECT stock_type, quantity FROM warehouse_inventory WHERE location_id = ? ORDER BY stock_type').all(loc1);
    assert.deepEqual(stockBuckets, [{ stock_type: 'retail', quantity: 2 }, { stock_type: 'retail_storage', quantity: 3 }]);
    assert.equal((await call('PATCH', `/picking/tasks/${task}/lines/${line.id}/pick`, one, { picked_qty: 2 })).status, 200);
    assert.equal((await call('PATCH', `/picking/tasks/${task}/lines/${line.id}/unpick`, one)).status, 200);
    assert.equal((await call('GET', '/locations', one)).body.data[0].total_qty, 5, 'repeated pick/unpick must not restore old movements twice');
    assert.equal((await call('DELETE', `/picking/tasks/${task}`, one)).status, 409, 'a task with historical picks cannot lose its audit trail');

    const result = await call('GET', '/picking/inventory-check?shopify_variant_ids=V1', two);
    assert.equal(result.body.data[0].total_qty, 6);
    assert.equal((await call('GET', '/picking/tasks', two)).body.data.length, 0);
    assert.equal((await call('GET', '/replenishment/pending-count', two)).status, 200);
    assert.equal((await call('POST', '/replenishment/bindings', one, {
      location_id: loc1, shopify_variant_id: 'V1', stock_type: 'retail_display', capacity: 10,
    })).status, 201);
    assert.equal((await call('POST', '/replenishment/bindings', two, {
      location_id: loc2, shopify_variant_id: 'V1', stock_type: 'retail_display', capacity: 10,
    })).status, 201);
    assert.equal((await call('GET', `/replenishment/bindings/${loc1}`, two)).status, 404);
    assert.equal((await call('POST', '/replenishment/bindings', one, {
      location_id: loc1, shopify_variant_id: 'V1', stock_type: 'exhibition', capacity: 10,
    })).status, 400, 'generic inbound replenishment cannot create orphaned exhibition stock');
    const generated = await call('POST', '/replenishment/generate', one, { inbound_shipment_id: 'SHIP1' });
    assert.equal(generated.status, 201);
    const replenishmentTask = generated.body.data.task_id;
    assert.equal((await call('GET', `/replenishment/tasks/${replenishmentTask}`, two)).status, 404);
    const line1 = (await call('GET', `/replenishment/tasks/${replenishmentTask}`, one)).body.data.locations[0].lines[0];
    assert.equal((await call('POST', `/replenishment/lines/${line1.id}/confirm`, two, { confirmed_qty: 2 })).status, 404);
    assert.equal((await call('POST', '/replenishment/generate', two, { inbound_shipment_id: 'SHIP1' })).status, 409);
    assert.equal((await call('POST', `/replenishment/lines/${line1.id}/confirm`, one, { confirmed_qty: 2 })).status, 200);
    assert.equal((await call('POST', `/replenishment/lines/${line1.id}/skip`, one)).status, 409, 'a confirmed line cannot be skipped');
    assert.equal((await call('POST', `/replenishment/lines/${line1.id}/confirm`, one, { confirmed_qty: 2 })).status, 409, 'a confirmed line cannot add inventory again');
    assert.equal((await call('GET', '/locations', one)).body.data[0].total_qty, 7);
    assert.equal((await call('GET', '/locations', two)).body.data[0].total_qty, 6);
    const stockRow = db.prepare('SELECT id FROM warehouse_inventory WHERE location_id = ? AND stock_type = ?').get(loc1, 'retail');
    assert.equal((await call('DELETE', `/locations/${loc1}/inventory/${stockRow.id}`, one)).status, 409, 'positive inventory must not be hard-deleted');
    assert.equal((await call('PATCH', `/locations/${loc1}/inventory/${stockRow.id}`, one, { quantity: 0, expected_quantity: 99 })).status, 409,
      'a stale adjustment must not overwrite another staff member’s stock count');
    assert.equal((await call('PATCH', `/locations/${loc1}/inventory/${stockRow.id}`, one, { quantity: 1.5 })).status, 400);
    assert.equal((await call('PATCH', `/locations/${loc1}/inventory/${stockRow.id}`, one, { quantity: 0 })).status, 200);
    assert.equal((await call('DELETE', `/locations/${loc1}/inventory/${stockRow.id}`, one)).status, 409, 'zero balance still retains movements');
    assert.ok(db.prepare('SELECT COUNT(*) AS count FROM warehouse_movements WHERE inventory_id = ?').get(stockRow.id).count > 0);

    db.prepare("INSERT INTO warehouse_replenishment_tasks (id, inbound_shipment_id, layout_id) VALUES ('pending-skip', 'LEGACY-TEST', ?)").run(one);
    db.prepare(`INSERT INTO warehouse_replenishment_lines
      (id,task_id,location_id,shopify_variant_id,stock_type,required_qty,status)
      VALUES ('skip-line','pending-skip',?,'V1','retail_display',2,'pending')`).run(loc1);
    assert.equal((await call('POST', '/replenishment/lines/skip-line/skip', one)).status, 200);
    assert.equal((await call('POST', '/replenishment/lines/skip-line/confirm', one, { confirmed_qty: 2 })).status, 409,
      'a skipped line cannot later be confirmed and silently inflate stock');

    db.prepare("INSERT INTO warehouse_replenishment_tasks (id, inbound_shipment_id, layout_id) VALUES ('pending-race', 'RACE-TEST', ?)").run(one);
    db.prepare(`INSERT INTO warehouse_replenishment_lines
      (id,task_id,location_id,shopify_variant_id,stock_type,required_qty,status)
      VALUES ('race-line','pending-race',?,'V1','retail_display',2,'pending')`).run(loc1);
    const displayBefore = db.prepare(`SELECT COALESCE(SUM(quantity),0) AS qty FROM warehouse_inventory
      WHERE location_id = ? AND stock_type = 'retail_display'`).get(loc1).qty;
    const outcomes = await Promise.all([
      call('POST', '/replenishment/lines/race-line/confirm', one, { confirmed_qty: 2 }),
      call('POST', '/replenishment/lines/race-line/confirm', one, { confirmed_qty: 2 }),
    ]);
    assert.deepEqual(outcomes.map(result => result.status).sort(), [200, 409]);
    assert.equal(db.prepare(`SELECT COALESCE(SUM(quantity),0) AS qty FROM warehouse_inventory
      WHERE location_id = ? AND stock_type = 'retail_display'`).get(loc1).qty, displayBefore + 2);

    db.prepare("INSERT INTO warehouse_pick_tasks (id, task_type) VALUES ('legacy-empty', 'order')").run();
    db.prepare("INSERT INTO warehouse_pick_tasks (id, task_type) VALUES ('legacy-mixed', 'order')").run();
    db.prepare(`INSERT INTO warehouse_pick_lines (id, task_id, shopify_variant_id, location_id)
      VALUES ('legacy-line-a', 'legacy-mixed', 'V1', ?), ('legacy-line-b', 'legacy-mixed', 'V1', ?)`)
      .run(loc1, loc2);
    db.prepare("INSERT INTO warehouse_replenishment_tasks (id, inbound_shipment_id) VALUES ('legacy-inbound', 'OLD-BATCH')").run();
    const unassigned = await call('GET', '/layouts/unassigned', one);
    assert.equal(unassigned.status, 200);
    assert.equal(unassigned.body.data.length, 3, 'unassigned tasks must be visible to admins');
    assert.deepEqual(unassigned.body.data.find(x => x.id === 'legacy-mixed').candidate_layout_ids.sort(), [one, two].sort());
    assert.equal((await call('PATCH', '/layouts/unassigned/picking/legacy-mixed', one, { layout_id: one })).status, 409,
      'mixed-warehouse tasks cannot be silently assigned to one warehouse');
    assert.equal((await call('PATCH', '/layouts/unassigned/picking/legacy-empty', one, { layout_id: one })).status, 200);
    assert.equal((await call('PATCH', '/layouts/unassigned/replenishment/legacy-inbound', one, { layout_id: two })).status, 200);
    assert.equal((await call('GET', '/layouts/unassigned', one)).body.data.length, 1);
    assert.equal((await call('GET', '/picking/tasks', one)).body.data.some(x => x.id === 'legacy-empty'), true);

    const removeRow = db.prepare(`
      SELECT id, quantity FROM warehouse_inventory
      WHERE location_id = ? AND stock_type = 'retail_storage'
    `).get(loc1);
    assert.equal(removeRow.quantity, 3);
    const removePath = `/locations/${loc1}/inventory/${removeRow.id}/remove`;
    assert.equal((await call('POST', removePath, two, { expected_quantity: 3 })).status, 404,
      'other warehouses cannot remove stock from this location');
    assert.equal((await call('POST', removePath, one, { expected_quantity: 2 })).status, 409,
      'stale removal never changes stock');
    assert.equal((await call('POST', removePath, one, { expected_quantity: 0 })).status, 400);
    const viewerRemove = await fetch(`http://127.0.0.1:${port}/api${removePath}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Warehouse-Id': one, 'X-Test-Viewer': 'yes' },
      body: JSON.stringify({ expected_quantity: 3 }),
    });
    assert.equal(viewerRemove.status, 403, 'read-only Warehouse viewers cannot remove stock');
    assert.equal(db.prepare('SELECT quantity FROM warehouse_inventory WHERE id = ?').get(removeRow.id).quantity, 3);
    const beforeRemovalMovements = db.prepare('SELECT COUNT(*) AS count FROM warehouse_movements WHERE inventory_id = ?').get(removeRow.id).count;
    const removed = await call('POST', removePath, one, { expected_quantity: 3, note: 'Found physical shortage' });
    assert.equal(removed.status, 200);
    assert.equal(removed.body.data.removed_quantity, 3);
    assert.equal(db.prepare('SELECT quantity FROM warehouse_inventory WHERE id = ?').get(removeRow.id).quantity, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM warehouse_movements WHERE inventory_id = ?').get(removeRow.id).count, beforeRemovalMovements + 1);
    const movement = db.prepare('SELECT movement_type, quantity_delta, quantity_before, quantity_after, reference_type, note FROM warehouse_movements WHERE inventory_id = ? ORDER BY operated_at DESC, rowid DESC LIMIT 1').get(removeRow.id);
    assert.deepEqual(movement, { movement_type: 'outbound', quantity_delta: -3, quantity_before: 3,
      quantity_after: 0, reference_type: 'manual_remove', note: 'Found physical shortage' });
    assert.equal((await call('POST', removePath, one, { expected_quantity: 3 })).status, 409,
      'retry cannot deduct again or write a second movement');
    assert.equal((await call('DELETE', `/locations/${loc1}/inventory/${removeRow.id}`, one)).status, 409,
      'the removed item remains as a historical zero-quantity inventory record');
    assert.equal((await call('GET', '/locations', two)).body.data[0].total_qty, 6,
      'stock removal must not modify a same-named second warehouse');
  } finally {
    await new Promise(resolve => server.close(resolve));
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
