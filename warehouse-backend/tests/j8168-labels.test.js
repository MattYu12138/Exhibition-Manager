const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { createJ8168Labels, J8168 } = require('../services/labelSheets');

const mm = value => value * 25.4 / 72;

test('J8168 label coordinates are centred on A4 with no printable overlap', async () => {
  assert.ok(Math.abs(mm(J8168.sheetWidth) - 210) < 0.01);
  assert.ok(Math.abs(mm(J8168.sheetHeight) - 297) < 0.01);
  assert.ok(Math.abs(mm(J8168.labelWidth) - 199.6) < 0.01);
  assert.ok(Math.abs(mm(J8168.labelHeight) - 143.53) < 0.01);
  assert.ok(Math.abs(mm(J8168.left) - 5.2) < 0.01);
  assert.ok(Math.abs(mm(J8168.top) - 4.97) < 0.01);
  assert.ok(Math.abs(J8168.top * 2 + J8168.labelHeight * 2 - J8168.sheetHeight) < 0.001);

  const labels = ['L1', 'L2', 'L3'].map((id, i) => ({ id, qr_token: `qr-token-${i}`, code: `A-${String(i + 1).padStart(2, '0')}` }));
  const pdf = await createJ8168Labels(labels, 'https://warehouse.example.com.au/', 'WH00000001');
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.length > 3000);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'j8168-pdf-'));
  try {
    const file = path.join(temp, 'test.pdf');
    fs.writeFileSync(file, pdf);
    const info = spawnSync('pdfinfo', [file], { encoding: 'utf8' });
    if (!info.error) {
      assert.equal(info.status, 0, info.stderr);
      assert.match(info.stdout, /Pages:\s+2\b/);
      assert.match(info.stdout, /Page size:\s+595\.2\d* x 841\.8\d* pts \(A4\)/);
    }
    const text = spawnSync('pdftotext', [file, '-'], { encoding: 'utf8' });
    if (!text.error) {
      assert.equal(text.status, 0, text.stderr);
      assert.ok(text.stdout.indexOf('A-01') < text.stdout.indexOf('A-02'));
      assert.ok(text.stdout.indexOf('A-02') < text.stdout.indexOf('A-03'));
      assert.match(text.stdout, /WH00000001/);
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('J8168 export refuses an empty or excessive selection', async () => {
  await assert.rejects(() => createJ8168Labels([], 'https://warehouse.example.com.au', 'W1'), RangeError);
  await assert.rejects(() => createJ8168Labels(Array(501).fill({ code: 'A', qr_token: 't' }), 'https://warehouse.example.com.au', 'W1'), RangeError);
});
