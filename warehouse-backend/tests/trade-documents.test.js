const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Database = require('better-sqlite3');
const importer = path.join(__dirname, '../scripts/importTradeDocuments.py');

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
for workbook,name in ((po,'enriched.xlsx'),(raw,'original.xlsx'),(invoice,'invoice.xlsx'),(pack,'packing.xlsx')):workbook.save(base/name)
pdf=canvas.Canvas(str(base/'bill.pdf'))
pdf.drawString(30,700,'SL0202302260M 2026/07/30 NANSHA MELBOURNE 1039 7.48 102')
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
    assert.equal(verify.prepare('SELECT count(*) n FROM warehouse_trade_shipment_lines').get().n, 125);
    assert.deepEqual(verify.prepare(`SELECT document_sku, match_method, shopify_variant_id
      FROM warehouse_trade_shipment_lines ORDER BY id LIMIT 2`).all(), [
      { document_sku:'SKU10000', match_method:'exact_sku', shopify_variant_id:'SV1' },
      { document_sku:'SKU10001', match_method:'unmatched', shopify_variant_id:null },
    ]);
    assert.equal(verify.prepare('SELECT importer_version FROM warehouse_trade_shipments').get().importer_version,
      'source-verified-v1');
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
