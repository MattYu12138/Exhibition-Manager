const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Database = require('better-sqlite3');
const importer = path.join(__dirname, '../scripts/importTradeDocuments.py');
const batchLabeler = path.join(__dirname, '../scripts/assignInternalBatchLabel.py');

const fixtureSource = `
import sys
from openpyxl import Workbook
from reportlab.pdfgen import canvas
from pathlib import Path
base=Path(sys.argv[1]); base.mkdir(parents=True,exist_ok=True)
po=Workbook(); raw=Workbook(); invoice=Workbook(); pack=Workbook()
for sheet, marker in ((po.active,'LIC260001'),(raw.active,'LIC260001'),(invoice.active,'UNA260001'),(pack.active,'UNA260001')): sheet['A1']=marker
for i in range(125):
    qty=97 if i<60 else 96
    sku='SKU'+str(10000+i); barcode=str(10000000+i)
    for sheet in (po.active,raw.active):
        row=14+i;sheet.cell(row,1,sku);sheet.cell(row,2,'Product '+str(i));sheet.cell(row,4,'000');sheet.cell(row,6,qty)
    po.active.cell(14+i,10,barcode)
    row=23+i; invoice.active.cell(row,2,sku);invoice.active.cell(row,9,'Product '+str(i));invoice.active.cell(row,11,qty)
    row=15+i; pack.active.cell(row,3,sku);pack.active.cell(row,7,qty);pack.active.cell(row,8,qty)
pack.active['H141']=12060; pack.active['I141']=102; pack.active['L141']=957.2; pack.active['M141']=1038.8
for workbook,name in ((po,'enriched.xlsx'),(raw,'original.xlsx'),(invoice,'invoice.xlsx'),(pack,'packing.xlsx')):workbook.save(base/name)
pdf=canvas.Canvas(str(base/'bill.pdf'))
pdf.drawString(30,700,'SL0202302260M 2026/07/30 NANSHA MELBOURNE 1039 7.48 102')
pdf.drawString(30,680,'INTENDED VESSEL & VOY TERM MSC ODESSA V 29S DDU')
pdf.drawString(30,660,'CONTAINER NO.: XHCU5641810')
pdf.save()
`;

test('importer parses five original source files, is idempotent, rejects tampering and never certifies stock', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warehouse-trade-'));
  try {
    const generated = spawnSync('python3', ['-c', fixtureSource, dir], { encoding: 'utf8' });
    assert.equal(generated.status, 0, generated.stderr);
    const filename = path.join(dir, 'warehouse.db');
    process.env.DB_PATH = filename;
    const seed = new Database(filename);
    seed.exec(`CREATE TABLE products (id TEXT PRIMARY KEY, title TEXT, status TEXT);
      CREATE TABLE product_variants (id TEXT PRIMARY KEY, product_id TEXT, shopify_variant_id TEXT, sku TEXT, gtin TEXT);
      INSERT INTO products VALUES ('P1','Product 0','active'), ('P2','Product 1','active');
      INSERT INTO product_variants VALUES ('V1','P1','SV1','SKU10000','10000000'),
        ('V2','P2','SV2','OLD-SKU-1','10000001');`);
    seed.close();
    const init = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(path.join(__dirname, '../db'))})`],
      { env: { ...process.env, DB_PATH: filename }, encoding: 'utf8' });
    assert.equal(init.status, 0, init.stderr);
    const sources = ['enriched.xlsx','invoice.xlsx','packing.xlsx','bill.pdf','original.xlsx'].map(name => path.join(dir,name));
    const run = () => spawnSync('python3', [importer, ...sources], {
      env: { ...process.env, DB_PATH: filename }, encoding: 'utf8',
    });
    const first = run();
    assert.equal(first.status, 0, first.stderr);
    assert.deepEqual(JSON.parse(first.stdout).lines, 125);
    assert.equal(JSON.parse(first.stdout).catalogue_sku_candidates, 1);
    assert.equal(JSON.parse(run().stdout).status, 'unchanged');
    const verify = new Database(filename);
    assert.deepEqual(verify.prepare(`SELECT intended_vessel_voyage, container_no, delivery_term,
      shipped_at, reported_arrival_at FROM warehouse_trade_shipments`).get(), {
      intended_vessel_voyage: 'MSC ODESSA V 29S', container_no: 'XHCU5641810',
      delivery_term: 'DDU', shipped_at: '2026-07-30', reported_arrival_at: null,
    });
    assert.equal(verify.prepare('SELECT count(*) n FROM warehouse_trade_shipment_lines').get().n, 125);
    assert.deepEqual(verify.prepare(`SELECT document_sku, match_method, shopify_variant_id
      FROM warehouse_trade_shipment_lines ORDER BY id LIMIT 2`).all(), [
      { document_sku:'SKU10000', match_method:'exact_sku', shopify_variant_id:'SV1' },
      { document_sku:'SKU10001', match_method:'unmatched', shopify_variant_id:null },
    ]);
    assert.equal(verify.prepare('SELECT importer_version FROM warehouse_trade_shipments').get().importer_version,
      'source-verified-v1');
    // An existing record indexed under the older schema is enriched only
    // from the five unchanged originals. A user's arrival statement is kept
    // distinct from the B/L's on-board date and is audit logged.
    verify.exec(`UPDATE warehouse_trade_shipments SET intended_vessel_voyage = NULL,
      container_no = NULL, delivery_term = NULL, bol_gross_weight_kg = NULL,
      bol_measurement_cbm = NULL`);
    const reported = spawnSync('python3', [importer, ...sources, '--reported-arrival', '2026-08-20'], {
      env: { ...process.env, DB_PATH: filename, IMPORT_ACTOR: 'user-reported' }, encoding: 'utf8',
    });
    assert.equal(reported.status, 0, reported.stderr);
    assert.equal(JSON.parse(reported.stdout).status, 'document_details_indexed');
    assert.deepEqual(verify.prepare(`SELECT shipped_at, intended_vessel_voyage,
      reported_arrival_at, arrival_reported_by FROM warehouse_trade_shipments`).get(), {
      shipped_at: '2026-07-30', intended_vessel_voyage: 'MSC ODESSA V 29S',
      reported_arrival_at: '2026-08-20', arrival_reported_by: 'user-reported',
    });
    assert.equal(verify.prepare(`SELECT count(*) n FROM warehouse_trade_metadata_audit_log
      WHERE source_kind = 'user_reported_unverified'`).get().n, 1);
    assert.equal(JSON.parse(spawnSync('python3', [importer, ...sources, '--reported-arrival', '2026-08-20'], {
      env: { ...process.env, DB_PATH: filename, IMPORT_ACTOR: 'user-reported' }, encoding: 'utf8',
    }).stdout).status, 'unchanged');
    const assignGroup = (bill = 'SL0202302260M', label = 'ITG-01', correction = false) => spawnSync('python3', [batchLabeler,
      '--shipment-id', 'TRADE-UNA260001', '--po', 'LIC260001', '--invoice', 'UNA260001',
      '--bill', bill, '--label', label, '--actor', 'warehouse-owner', ...(correction ? ['--correct-existing'] : []),
    ], { env: { ...process.env, DB_PATH: filename }, encoding: 'utf8' });
    assert.equal(verify.prepare('SELECT internal_batch_label FROM warehouse_trade_shipments').get().internal_batch_label, null);
    assert.notEqual(assignGroup('WRONG-BILL').status, 0, 'must not label a different bill');
    assert.equal(assignGroup().status, 0);
    assert.equal(assignGroup().stdout.trim(), 'unchanged', 'rerun must not add another audit event');
    assert.notEqual(assignGroup('SL0202302260M', 'ITG-02').status, 0,
      'existing internal label cannot be silently rewritten');
    assert.deepEqual(verify.prepare(`SELECT internal_batch_label, internal_batch_source_kind
      FROM warehouse_trade_shipments`).get(), {
      internal_batch_label: 'ITG-01', internal_batch_source_kind: 'user_instruction_provisional',
    });
    assert.equal(verify.prepare(`SELECT COUNT(*) n FROM warehouse_trade_metadata_audit_log
      WHERE field_name = 'internal_batch_label' AND source_kind = 'user_instruction_provisional'`).get().n, 1);
    assert.equal(assignGroup('SL0202302260M', 'ITG-02', true).stdout.trim(), 'corrected_internal_group_only');
    assert.equal(verify.prepare('SELECT internal_batch_label FROM warehouse_trade_shipments').get().internal_batch_label, 'ITG-02');
    assert.deepEqual(verify.prepare(`SELECT previous_value, new_value, source_kind
      FROM warehouse_trade_metadata_audit_log WHERE field_name = 'internal_batch_label'
      ORDER BY id DESC LIMIT 1`).get(), {
      previous_value: 'ITG-01', new_value: 'ITG-02', source_kind: 'user_instruction_label_correction',
    });
    assert.equal(verify.prepare('SELECT COUNT(*) n FROM warehouse_trade_shipment_lines').get().n, 125,
      'a group label cannot modify the 125 original trade-document product lines');
    verify.close();
    const tamper = spawnSync('python3', ['-c', `from openpyxl import load_workbook; import sys
w=load_workbook(sys.argv[1]); w.active['K23']=95; w.save(sys.argv[1])`, sources[1]], { encoding:'utf8' });
    assert.equal(tamper.status, 0, tamper.stderr);
    assert.notEqual(run().status, 0, 'a changed invoice must fail before matching the existing source hash');
    const invalid = spawnSync('python3', [importer], {
      env: { ...process.env, DB_PATH: filename }, input: JSON.stringify({ lines: [] }), encoding: 'utf8',
    });
    assert.notEqual(invalid.status, 0, 'a JSON-only manifest can no longer be imported');
    assert.equal(new Database(filename).prepare('SELECT count(*) n FROM warehouse_trade_shipments').get().n, 1);
  } finally {
    delete process.env.DB_PATH;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
