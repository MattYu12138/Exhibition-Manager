const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Never accept a filename from the request. Originals remain on the private
// /data/lic mount, never under a frontend static directory or in Git.
const ROOT = path.resolve(process.env.PRIVATE_TRADE_DOCUMENTS_DIR || '/data/lic/private/gots');
const DOCUMENTS = Object.freeze([
  { kind: 'purchase_order', checksumKey: 'original_purchase_order', filename: 'original_purchase_order.xlsx', refField: 'po_ref', source: 'original' },
  { kind: 'invoice', checksumKey: 'invoice', filename: 'invoice.xlsx', refField: 'invoice_ref', source: 'original' },
  { kind: 'packing_list', checksumKey: 'packing_list', filename: 'packing_list.xlsx', refField: 'packing_ref', source: 'original' },
  { kind: 'bill_of_lading', checksumKey: 'bill_of_lading', filename: 'bill_of_lading.pdf', refField: 'bol_ref', source: 'original' },
  { kind: 'barcode_working_copy', checksumKey: 'barcode_enriched_working_copy', filename: 'barcode_working_copy.xlsx', refField: 'po_ref', source: 'working_copy' },
]);

function verifiedDocument(shipment, kind) {
  const definition = DOCUMENTS.find(item => item.kind === kind);
  if (!definition || !/^[A-Za-z0-9_-]{1,80}$/.test(shipment?.id || '')) return null;
  let expected;
  try {
    expected = JSON.parse(shipment.source_checksums || '{}')[definition.checksumKey];
  } catch { return null; }
  if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/i.test(expected)) return null;
  const directory = path.join(ROOT, shipment.id);
  const filename = path.join(directory, definition.filename);
  try {
    // Refuse unexpected symlink targets even inside an allowlisted directory.
    const real = fs.realpathSync(filename);
    if (!real.startsWith(fs.realpathSync(directory) + path.sep)) return null;
    const content = fs.readFileSync(real);
    const digest = crypto.createHash('sha256').update(content).digest('hex');
    if (digest.toLowerCase() !== expected.toLowerCase()) return null;
    return { ...definition, content, size_bytes: content.length, reference: shipment[definition.refField] || null };
  } catch { return null; }
}

function listDocuments(shipment) {
  return DOCUMENTS.map(item => {
    const verified = verifiedDocument(shipment, item.kind);
    return {
      kind: item.kind,
      filename: item.filename,
      reference: shipment[item.refField] || null,
      source: item.source,
      available: Boolean(verified),
      size_bytes: verified?.size_bytes || null,
    };
  });
}

module.exports = { listDocuments, verifiedDocument };
