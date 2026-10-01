const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const Database = require('better-sqlite3');

test('legacy task migration assigns only a unique real warehouse and preserves ambiguous records', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'warehouse-legacy-'));
  process.env.DB_PATH = path.join(tmp, 'old.db');
  const old = new Database(process.env.DB_PATH);
  old.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT);
    CREATE TABLE products (id TEXT PRIMARY KEY, title TEXT);
    CREATE TABLE product_variants (shopify_variant_id TEXT PRIMARY KEY, product_id TEXT);
    CREATE TABLE exhibitions (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE warehouse_layouts (id TEXT PRIMARY KEY, name TEXT NOT NULL,
      description TEXT, grid_cols INTEGER, grid_rows INTEGER, layout_json TEXT, is_active INTEGER,
      created_by TEXT, created_at DATETIME, updated_at DATETIME);
    CREATE TABLE warehouse_locations (id TEXT PRIMARY KEY, layout_id TEXT, code TEXT,
      label TEXT, zone TEXT, row_no INTEGER, col_no INTEGER, module_id TEXT, grid_x INTEGER,
      grid_y INTEGER, qr_token TEXT, is_active INTEGER, note TEXT, created_at DATETIME, updated_at DATETIME);
    CREATE TABLE warehouse_pick_tasks (id TEXT PRIMARY KEY, task_type TEXT DEFAULT 'order',
      exhibition_id TEXT, status TEXT DEFAULT 'pending');
    CREATE TABLE warehouse_pick_lines (id TEXT PRIMARY KEY, task_id TEXT, shopify_variant_id TEXT, location_id TEXT);
    CREATE TABLE warehouse_replenishment_tasks (id TEXT PRIMARY KEY, inbound_shipment_id TEXT);
    CREATE TABLE warehouse_replenishment_lines (id TEXT PRIMARY KEY, task_id TEXT, location_id TEXT);
    INSERT INTO warehouse_layouts (id,name,grid_cols,grid_rows,layout_json,is_active) VALUES
      ('W1','Same name',20,15,'[]',1), ('W2','Same name',20,15,'[]',0);
    INSERT INTO warehouse_locations (id,layout_id,code,qr_token,is_active) VALUES
      ('L1','W1','A-01','token-1',1), ('L2','W2','A-01','token-2',1), ('L3','W1','A-02','token-3',0);
    INSERT INTO warehouse_pick_tasks (id) VALUES ('single'),('mixed'),('empty'),('missing'),('mixed-missing'),('inactive');
    INSERT INTO warehouse_pick_lines (id,task_id,location_id) VALUES
      ('p1','single','L1'),('p2','mixed','L1'),('p3','mixed','L2'),('p4','missing','deleted-location'),
      ('p5','mixed-missing','L1'),('p6','mixed-missing','deleted-location'),('p7','inactive','L3');
    INSERT INTO warehouse_replenishment_tasks (id,inbound_shipment_id) VALUES
      ('one-inbound','s1'),('mixed-inbound','s2'),('empty-inbound','s3');
    INSERT INTO warehouse_replenishment_lines (id,task_id,location_id) VALUES
      ('r1','one-inbound','L2'),('r2','mixed-inbound','L1'),('r3','mixed-inbound','L2');
  `);
  old.close();
  let migrated;
  try {
    ({ db: migrated } = require('../db'));
    const pick = Object.fromEntries(migrated.prepare('SELECT id, layout_id FROM warehouse_pick_tasks').all().map(row => [row.id, row.layout_id]));
    const replenish = Object.fromEntries(migrated.prepare('SELECT id, layout_id FROM warehouse_replenishment_tasks').all().map(row => [row.id, row.layout_id]));
    assert.deepEqual(pick, { single: 'W1', mixed: null, empty: null, missing: null, 'mixed-missing': null, inactive: null });
    assert.deepEqual(replenish, { 'one-inbound': 'W2', 'mixed-inbound': null, 'empty-inbound': null });
    assert.equal(migrated.prepare('SELECT COUNT(*) AS count FROM warehouse_pick_lines').get().count, 7);
    assert.equal(migrated.prepare('SELECT COUNT(*) AS count FROM warehouse_replenishment_lines').get().count, 3);
  } finally {
    migrated?.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
