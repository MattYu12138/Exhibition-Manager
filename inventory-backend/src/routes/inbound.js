/**
 * Inbound Shipment Routes
 * Handles factory inbound workflow: shipments, boxes, items, QR scan, receive
 *
 * ID conventions (matching existing snowflake.js style):
 *   inbound_shipments : SHP + 8-digit  e.g. SHP00000001
 *   inbound_boxes     : BX  + 10-digit e.g. BX0000000001
 *   inbound_box_items : BXI + 10-digit e.g. BXI0000000001
 *   purchase_orders   : PO  + 8-digit  e.g. PO00000001
 *   purchase_order_items: POI + 10-digit e.g. POI0000000001
 */
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { getDb } = require('../db');
const { requirePermission } = require('../middleware/auth');
const multer = require('multer');
const XLSX = require('xlsx');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── ID helpers ────────────────────────────────────────────────────────────────

function nextShipmentId(db) {
  const row = db.prepare("SELECT MAX(CAST(SUBSTR(id,4) AS INTEGER)) AS mx FROM inbound_shipments WHERE id LIKE 'SHP%'").get();
  const next = (row?.mx || 0) + 1;
  if (next > 99999999) throw new Error('SHP ID overflow');
  return 'SHP' + String(next).padStart(8, '0');
}

function nextBoxId(db) {
  const row = db.prepare("SELECT MAX(CAST(SUBSTR(id,3) AS INTEGER)) AS mx FROM inbound_boxes WHERE id LIKE 'BX%'").get();
  const next = (row?.mx || 0) + 1;
  if (next > 9999999999) throw new Error('BX ID overflow');
  return 'BX' + String(next).padStart(10, '0');
}

function nextBoxItemId(db) {
  const row = db.prepare("SELECT MAX(CAST(SUBSTR(id,4) AS INTEGER)) AS mx FROM inbound_box_items WHERE id LIKE 'BXI%'").get();
  const next = (row?.mx || 0) + 1;
  if (next > 9999999999) throw new Error('BXI ID overflow');
  return 'BXI' + String(next).padStart(10, '0');
}

function nextPoId(db) {
  const row = db.prepare("SELECT MAX(CAST(SUBSTR(id,3) AS INTEGER)) AS mx FROM purchase_orders WHERE id LIKE 'PO%'").get();
  const next = (row?.mx || 0) + 1;
  if (next > 99999999) throw new Error('PO ID overflow');
  return 'PO' + String(next).padStart(8, '0');
}

function nextPoItemId(db) {
  const row = db.prepare("SELECT MAX(CAST(SUBSTR(id,4) AS INTEGER)) AS mx FROM purchase_order_items WHERE id LIKE 'POI%'").get();
  const next = (row?.mx || 0) + 1;
  if (next > 9999999999) throw new Error('POI ID overflow');
  return 'POI' + String(next).padStart(10, '0');
}

function generateQrToken() {
  return crypto.randomBytes(16).toString('hex');
}

// ── SKU matcher ───────────────────────────────────────────────────────────────

/**
 * Given a raw SKU string (e.g. "GS26020-0000") and optional GTIN,
 * find the matching product_variant.
 * Returns { shopify_variant_id, variant_title, product_title, match_status }
 */
function matchSku(db, rawSku, rawGtin) {
  if (!rawSku && !rawGtin) {
    return { shopify_variant_id: null, variant_title: null, product_title: null, match_status: 'unmatched' };
  }

  let row = null;

  // 1. Exact SKU match (case-insensitive trim)
  if (rawSku) {
    row = db.prepare(`
      SELECT pv.shopify_variant_id, pv.variant_title, p.title AS product_title
      FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
      WHERE LOWER(TRIM(pv.sku)) = LOWER(TRIM(?))
      LIMIT 1
    `).get(rawSku);
  }

  // 2. Exact GTIN match (strip leading whitespace/tabs)
  if (!row && rawGtin) {
    const cleanGtin = String(rawGtin).trim().replace(/^\t/, '');
    row = db.prepare(`
      SELECT pv.shopify_variant_id, pv.variant_title, p.title AS product_title
      FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
      WHERE LOWER(TRIM(pv.gtin)) = LOWER(TRIM(?))
      LIMIT 1
    `).get(cleanGtin);
  }

  if (row) {
    return {
      shopify_variant_id: row.shopify_variant_id,
      variant_title: row.variant_title,
      product_title: row.product_title,
      match_status: 'matched',
    };
  }
  return { shopify_variant_id: null, variant_title: null, product_title: null, match_status: 'unmatched' };
}

// ── Size code extractor ───────────────────────────────────────────────────────

/**
 * Extract the size code from a size string like "0000 (0-3 weeks)" -> "0000"
 * or "XXS (0-3 months)" -> "XXS" or "OS (0-9 months)" -> "OS"
 */
function extractSizeCode(rawSize) {
  if (!rawSize) return '';
  // Take the first whitespace-delimited token, strip non-alphanumeric chars
  const token = String(rawSize).trim().split(/\s+/)[0];
  return token.replace(/[^0-9a-zA-Z]/g, '');
}

// ── Recalculate shipment denormalised totals ──────────────────────────────────

function recalcShipmentTotals(db, shipmentId) {
  const boxes = db.prepare('SELECT id, status FROM inbound_boxes WHERE shipment_id = ?').all(shipmentId);
  const totalBoxes = boxes.length;
  const receivedBoxes = boxes.filter(b => b.status === 'received').length;

  const qtyRow = db.prepare(`
    SELECT COALESCE(SUM(bxi.quantity), 0) AS total_qty
    FROM inbound_box_items bxi
    JOIN inbound_boxes b ON b.id = bxi.box_id
    WHERE b.shipment_id = ?
  `).get(shipmentId);

  const newStatus = receivedBoxes === 0 ? 'pending'
    : receivedBoxes < totalBoxes ? 'partial'
    : 'received';

  db.prepare(`
    UPDATE inbound_shipments
    SET total_boxes = ?, total_qty = ?, received_boxes = ?, status = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(totalBoxes, qtyRow.total_qty, receivedBoxes, newStatus, shipmentId);
}

// ── Remaining qty calculator ──────────────────────────────────────────────────

/**
 * For a given shipment, calculate how many units of each SKU have already been
 * allocated across all boxes. Returns a map: shopify_variant_id -> allocated_qty
 */
function getAllocatedQtyMap(db, shipmentId) {
  const rows = db.prepare(`
    SELECT bxi.shopify_variant_id, COALESCE(SUM(bxi.quantity), 0) AS allocated
    FROM inbound_box_items bxi
    JOIN inbound_boxes b ON b.id = bxi.box_id
    WHERE b.shipment_id = ? AND bxi.shopify_variant_id IS NOT NULL
    GROUP BY bxi.shopify_variant_id
  `).all(shipmentId);
  const map = {};
  for (const r of rows) {
    map[r.shopify_variant_id] = r.allocated;
  }
  return map;
}

// ── PO detail helper ──────────────────────────────────────────────────────────

function getPoDetail(db, poId) {
  const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(poId);
  if (!po) return null;
  po.items = db.prepare('SELECT * FROM purchase_order_items WHERE po_id = ? ORDER BY sort_order, id').all(poId);
  return po;
}

// ── Shipment detail helper ────────────────────────────────────────────────────

function getShipmentDetail(db, shipmentId) {
  const shipment = db.prepare('SELECT * FROM inbound_shipments WHERE id = ?').get(shipmentId);
  if (!shipment) return null;

  // Attach all linked POs
  shipment.pos = db.prepare(`
    SELECT id, po_number, factory, status, source_file_name,
      (SELECT COALESCE(SUM(ordered_qty),0) FROM purchase_order_items WHERE po_id = purchase_orders.id) AS total_ordered,
      (SELECT COALESCE(SUM(received_qty),0) FROM purchase_order_items WHERE po_id = purchase_orders.id) AS total_received,
      (SELECT COUNT(*) FROM purchase_order_items WHERE po_id = purchase_orders.id) AS item_count
    FROM purchase_orders WHERE shipment_id = ?
    ORDER BY created_at ASC
  `).all(shipmentId);

  // Attach boxes with items
  const boxes = db.prepare('SELECT * FROM inbound_boxes WHERE shipment_id = ? ORDER BY box_no').all(shipmentId);
  for (const box of boxes) {
    box.items = db.prepare('SELECT * FROM inbound_box_items WHERE box_id = ? ORDER BY sort_order').all(box.id);
  }
  shipment.boxes = boxes;

  return shipment;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHIPMENT ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/inbound/shipments
 * List all shipments with summary
 */
router.get('/shipments', requirePermission('read'), (req, res) => {
  try {
    const db = getDb();
    const shipments = db.prepare(`
      SELECT s.*,
        (SELECT GROUP_CONCAT(po_number, ', ') FROM purchase_orders WHERE shipment_id = s.id) AS po_numbers
      FROM inbound_shipments s
      ORDER BY s.created_at DESC
    `).all();
    res.json({ success: true, data: shipments });
  } catch (err) {
    console.error('[inbound] list shipments:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/inbound/shipments
 * Create a new shipment
 * Body: { factory, note }
 */
router.post('/shipments', requirePermission('write'), (req, res) => {
  try {
    const db = getDb();
    const { factory, note } = req.body;
    const id = nextShipmentId(db);
    db.prepare(`
      INSERT INTO inbound_shipments (id, ref_no, factory, note, source, created_by)
      VALUES (?, ?, ?, ?, 'manual', ?)
    `).run(id, id, factory || null, note || null, req.session?.user?.id || null);
    const shipment = db.prepare('SELECT * FROM inbound_shipments WHERE id = ?').get(id);
    res.status(201).json({ success: true, data: shipment });
  } catch (err) {
    console.error('[inbound] create shipment:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/inbound/shipments/:id
 * Full shipment detail with boxes, items, and linked POs
 */
router.get('/shipments/:id', requirePermission('read'), (req, res) => {
  try {
    const db = getDb();
    const shipment = getShipmentDetail(db, req.params.id);
    if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });
    res.json({ success: true, data: shipment });
  } catch (err) {
    console.error('[inbound] get shipment:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PATCH /api/inbound/shipments/:id
 * Update shipment metadata
 */
router.patch('/shipments/:id', requirePermission('write'), (req, res) => {
  try {
    const db = getDb();
    const { factory, note } = req.body;
    const shipment = db.prepare('SELECT id FROM inbound_shipments WHERE id = ?').get(req.params.id);
    if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });
    db.prepare(`
      UPDATE inbound_shipments SET factory = ?, note = ?, updated_at = datetime('now') WHERE id = ?
    `).run(factory || null, note || null, req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[inbound] patch shipment:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/inbound/shipments/:id
 * Delete a shipment (only if pending)
 */
router.delete('/shipments/:id', requirePermission('write'), (req, res) => {
  try {
    const db = getDb();
    const shipment = db.prepare('SELECT * FROM inbound_shipments WHERE id = ?').get(req.params.id);
    if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });
    if (shipment.status === 'received') {
      return res.status(400).json({ success: false, error: 'Cannot delete a received shipment' });
    }
    // Unlink POs before deleting
    db.prepare("UPDATE purchase_orders SET shipment_id = NULL, updated_at = datetime('now') WHERE shipment_id = ?").run(req.params.id);
    db.prepare('DELETE FROM inbound_shipments WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[inbound] delete shipment:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/inbound/shipments/:id/form-token
 * Generate (or refresh) a factory form token for this shipment
 */
router.post('/shipments/:id/form-token', requirePermission('write'), (req, res) => {
  try {
    const db = getDb();
    const shipment = db.prepare('SELECT id, form_token, form_token_expires_at FROM inbound_shipments WHERE id = ?').get(req.params.id);
    if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });

    // Reuse existing token if it is still valid (not expired)
    if (shipment.form_token && shipment.form_token_expires_at) {
      const expiresAt = new Date(shipment.form_token_expires_at + ' UTC');
      if (expiresAt > new Date()) {
        return res.json({ success: true, data: { form_token: shipment.form_token } });
      }
    }

    // Generate a new token only when none exists or it has expired
    const token = generateQrToken();
    db.prepare(`
      UPDATE inbound_shipments SET form_token = ?, form_token_expires_at = datetime('now', '+30 days'), updated_at = datetime('now') WHERE id = ?
    `).run(token, req.params.id);
    res.json({ success: true, data: { form_token: token } });
  } catch (err) {
    console.error('[inbound] form-token:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/inbound/shipments/:id/remaining-qty
 * Returns remaining-to-pack quantities for each PO item in this shipment.
 * Used by both internal UI and factory form to show how many units still need packing.
 * Response: { data: [{ shopify_variant_id, raw_sku, product_title, variant_title, ordered_qty, allocated_qty, remaining_qty }] }
 */
router.get('/shipments/:id/remaining-qty', requirePermission('read'), (req, res) => {
  try {
    const db = getDb();
    const shipment = db.prepare('SELECT id FROM inbound_shipments WHERE id = ?').get(req.params.id);
    if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });

    // Get all PO items for all POs linked to this shipment
    const poItems = db.prepare(`
      SELECT poi.shopify_variant_id, poi.raw_sku, poi.raw_product_name, poi.raw_variant_name,
             poi.product_title, poi.variant_title, poi.match_status,
             COALESCE(SUM(poi.ordered_qty), 0) AS ordered_qty,
             po.po_number
      FROM purchase_order_items poi
      JOIN purchase_orders po ON po.id = poi.po_id
      WHERE po.shipment_id = ?
      GROUP BY poi.shopify_variant_id, poi.raw_sku
      ORDER BY po.created_at ASC, poi.sort_order ASC
    `).all(req.params.id);

    // Get allocated quantities from boxes
    const allocMap = getAllocatedQtyMap(db, req.params.id);

    const result = poItems.map(item => {
      const allocated = item.shopify_variant_id ? (allocMap[item.shopify_variant_id] || 0) : 0;
      return {
        shopify_variant_id: item.shopify_variant_id,
        raw_sku: item.raw_sku,
        raw_product_name: item.raw_product_name,
        raw_variant_name: item.raw_variant_name,
        product_title: item.product_title,
        variant_title: item.variant_title,
        match_status: item.match_status,
        po_number: item.po_number,
        ordered_qty: item.ordered_qty,
        allocated_qty: allocated,
        remaining_qty: Math.max(0, item.ordered_qty - allocated),
      };
    });

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[inbound] remaining-qty:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BOX ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/inbound/shipments/:id/boxes
 * Add a new box to a shipment
 * Body: { box_no, note }
 */
router.post('/shipments/:id/boxes', requirePermission('write'), (req, res) => {
  try {
    const db = getDb();
    const shipment = db.prepare('SELECT id FROM inbound_shipments WHERE id = ?').get(req.params.id);
    if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });

    const { note } = req.body;
    // Auto-assign box_no if not provided
    const lastBox = db.prepare("SELECT box_no FROM inbound_boxes WHERE shipment_id = ? ORDER BY CAST(box_no AS INTEGER) DESC LIMIT 1").get(req.params.id);
    const boxNo = req.body.box_no || String((parseInt(lastBox?.box_no || '0') + 1));

    const id = nextBoxId(db);
    const qrToken = generateQrToken();
    db.prepare(`
      INSERT INTO inbound_boxes (id, shipment_id, box_no, qr_token, note)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, req.params.id, boxNo, qrToken, note || null);

    recalcShipmentTotals(db, req.params.id);
    const box = db.prepare('SELECT * FROM inbound_boxes WHERE id = ?').get(id);
    box.items = [];
    res.status(201).json({ success: true, data: box });
  } catch (err) {
    console.error('[inbound] add box:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/inbound/boxes/:boxId
 * Delete a box (only if pending)
 */
router.delete('/boxes/:boxId', requirePermission('write'), (req, res) => {
  try {
    const db = getDb();
    const box = db.prepare('SELECT * FROM inbound_boxes WHERE id = ?').get(req.params.boxId);
    if (!box) return res.status(404).json({ success: false, error: 'Box not found' });
    if (box.status === 'received') return res.status(400).json({ success: false, error: 'Cannot delete a received box' });
    db.prepare('DELETE FROM inbound_boxes WHERE id = ?').run(req.params.boxId);
    recalcShipmentTotals(db, box.shipment_id);
    res.json({ success: true });
  } catch (err) {
    console.error('[inbound] delete box:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BOX ITEM ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/inbound/boxes/:boxId/items
 * Add an item to a box
 * Body: { base_sku, size_code, quantity }
 *   base_sku: e.g. "GS26020"
 *   size_code: e.g. "0000" (will be combined as "GS26020-0000")
 *   quantity: integer > 0
 */
router.post('/boxes/:boxId/items', requirePermission('write'), (req, res) => {
  try {
    const db = getDb();
    const box = db.prepare('SELECT * FROM inbound_boxes WHERE id = ?').get(req.params.boxId);
    if (!box) return res.status(404).json({ success: false, error: 'Box not found' });
    if (box.status === 'received') return res.status(400).json({ success: false, error: 'Box already received' });

    const { base_sku, size_code, quantity } = req.body;
    if (!base_sku || !quantity || quantity <= 0) {
      return res.status(400).json({ success: false, error: 'base_sku and quantity are required' });
    }

    // Build full SKU
    const rawSku = size_code ? `${base_sku.trim()}-${size_code.trim()}` : base_sku.trim();
    const match = matchSku(db, rawSku, null);

    const lastItem = db.prepare('SELECT MAX(sort_order) AS mx FROM inbound_box_items WHERE box_id = ?').get(req.params.boxId);
    const sortOrder = (lastItem?.mx || 0) + 1;

    const id = nextBoxItemId(db);
    db.prepare(`
      INSERT INTO inbound_box_items
        (id, box_id, raw_sku, raw_variant_name, shopify_variant_id, variant_title, product_title, match_status, quantity, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, req.params.boxId,
      rawSku, size_code || null,
      match.shopify_variant_id, match.variant_title, match.product_title, match.match_status,
      quantity, sortOrder
    );

    recalcShipmentTotals(db, box.shipment_id);
    const item = db.prepare('SELECT * FROM inbound_box_items WHERE id = ?').get(id);
    res.status(201).json({ success: true, data: item });
  } catch (err) {
    console.error('[inbound] add box item:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PATCH /api/inbound/items/:itemId
 * Manually match an unmatched item to a shopify_variant_id
 * Body: { shopify_variant_id }
 */
router.patch('/items/:itemId', requirePermission('write'), (req, res) => {
  try {
    const db = getDb();
    const item = db.prepare('SELECT * FROM inbound_box_items WHERE id = ?').get(req.params.itemId);
    if (!item) return res.status(404).json({ success: false, error: 'Item not found' });

    const { shopify_variant_id } = req.body;
    if (!shopify_variant_id) return res.status(400).json({ success: false, error: 'shopify_variant_id required' });

    const variant = db.prepare(`
      SELECT pv.shopify_variant_id, pv.variant_title, p.title AS product_title
      FROM product_variants pv JOIN products p ON p.id = pv.product_id
      WHERE pv.shopify_variant_id = ?
    `).get(shopify_variant_id);
    if (!variant) return res.status(404).json({ success: false, error: 'Variant not found' });

    db.prepare(`
      UPDATE inbound_box_items
      SET shopify_variant_id = ?, variant_title = ?, product_title = ?, match_status = 'manual'
      WHERE id = ?
    `).run(variant.shopify_variant_id, variant.variant_title, variant.product_title, req.params.itemId);

    res.json({ success: true, data: db.prepare('SELECT * FROM inbound_box_items WHERE id = ?').get(req.params.itemId) });
  } catch (err) {
    console.error('[inbound] patch item:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/inbound/items/:itemId
 * Remove an item from a box
 */
router.delete('/items/:itemId', requirePermission('write'), (req, res) => {
  try {
    const db = getDb();
    const item = db.prepare('SELECT * FROM inbound_box_items WHERE id = ?').get(req.params.itemId);
    if (!item) return res.status(404).json({ success: false, error: 'Item not found' });
    const box = db.prepare('SELECT shipment_id FROM inbound_boxes WHERE id = ?').get(item.box_id);
    db.prepare('DELETE FROM inbound_box_items WHERE id = ?').run(req.params.itemId);
    if (box) recalcShipmentTotals(db, box.shipment_id);
    res.json({ success: true });
  } catch (err) {
    console.error('[inbound] delete item:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SKU SEARCH
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/inbound/sku-search?q=GS26020&size=0000
 * Search product_variants by base SKU prefix and optional size code.
 * Returns matched variants for the split SKU+size input UI.
 */
router.get('/sku-search', requirePermission('read'), (req, res) => {
  try {
    const db = getDb();
    const q = String(req.query.q || '').trim();
    const size = String(req.query.size || '').trim();

    if (!q || q.length < 2) return res.json({ success: true, data: [] });

    // Build search SKU: if size provided, search for exact "base-size" match
    // Otherwise search by prefix
    let rows;
    if (size) {
      const fullSku = `${q}-${size}`;
      rows = db.prepare(`
        SELECT pv.shopify_variant_id, pv.sku, pv.variant_title, pv.gtin, pv.inventory_quantity,
               p.title AS product_title
        FROM product_variants pv
        JOIN products p ON p.id = pv.product_id
        WHERE LOWER(TRIM(pv.sku)) = LOWER(?)
        LIMIT 10
      `).all(fullSku.toLowerCase());
    } else {
      rows = db.prepare(`
        SELECT pv.shopify_variant_id, pv.sku, pv.variant_title, pv.gtin, pv.inventory_quantity,
               p.title AS product_title
        FROM product_variants pv
        JOIN products p ON p.id = pv.product_id
        WHERE LOWER(pv.sku) LIKE LOWER(?) || '%'
        ORDER BY pv.sku ASC
        LIMIT 20
      `).all(q);
    }

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[inbound] sku-search:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PACKING LIST EXCEL UPLOAD (for existing shipment)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/inbound/shipments/:id/upload-excel
 * Parse a packing list Excel (box-based format) and create boxes+items for this shipment
 * Expected columns: Box No, SKU (base), Size, Quantity
 */
router.post('/shipments/:id/upload-excel', requirePermission('write'), upload.single('file'), (req, res) => {
  try {
    const db = getDb();
    const shipment = db.prepare('SELECT id FROM inbound_shipments WHERE id = ?').get(req.params.id);
    if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', header: 1 });

    if (rows.length < 2) return res.status(400).json({ success: false, error: 'Excel file is empty' });

    // Find header row
    let headerRowIdx = 0;
    let colMap = { boxNo: 0, sku: 1, size: 2, qty: 3 };
    for (let r = 0; r < Math.min(5, rows.length); r++) {
      const row = rows[r].map(c => String(c || '').toLowerCase().trim());
      if (row.some(c => c.includes('box')) && row.some(c => c.includes('sku') || c.includes('style'))) {
        headerRowIdx = r;
        row.forEach((h, i) => {
          if (h.includes('box')) colMap.boxNo = i;
          else if (h.includes('sku') || h.includes('style')) colMap.sku = i;
          else if (h.includes('size')) colMap.size = i;
          else if (h.includes('qty') || h.includes('quantity')) colMap.qty = i;
        });
        break;
      }
    }

    const insertAll = db.transaction(() => {
      let matched = 0, unmatched = 0, boxesCreated = 0;
      const boxMap = {}; // boxNo -> box id

      for (let r = headerRowIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.every(c => !String(c || '').trim())) continue;

        const boxNo = String(row[colMap.boxNo] || '').trim();
        const baseSku = String(row[colMap.sku] || '').trim();
        const sizeCode = extractSizeCode(String(row[colMap.size] || ''));
        const qty = parseInt(String(row[colMap.qty] || '0').replace(/[^0-9]/g, ''), 10);

        if (!boxNo || !baseSku || !qty || qty <= 0) continue;

        // Create box if not seen yet
        if (!boxMap[boxNo]) {
          const existingBox = db.prepare('SELECT id FROM inbound_boxes WHERE shipment_id = ? AND box_no = ?').get(req.params.id, boxNo);
          if (existingBox) {
            boxMap[boxNo] = existingBox.id;
          } else {
            const boxId = nextBoxId(db);
            const qrToken = generateQrToken();
            db.prepare('INSERT INTO inbound_boxes (id, shipment_id, box_no, qr_token) VALUES (?, ?, ?, ?)').run(boxId, req.params.id, boxNo, qrToken);
            boxMap[boxNo] = boxId;
            boxesCreated++;
          }
        }

        const rawSku = sizeCode ? `${baseSku}-${sizeCode}` : baseSku;
        const match = matchSku(db, rawSku, null);

        const lastItem = db.prepare('SELECT MAX(sort_order) AS mx FROM inbound_box_items WHERE box_id = ?').get(boxMap[boxNo]);
        const sortOrder = (lastItem?.mx || 0) + 1;
        const itemId = nextBoxItemId(db);

        db.prepare(`
          INSERT INTO inbound_box_items
            (id, box_id, raw_sku, raw_variant_name, shopify_variant_id, variant_title, product_title, match_status, quantity, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(itemId, boxMap[boxNo], rawSku, sizeCode || null, match.shopify_variant_id, match.variant_title, match.product_title, match.match_status, qty, sortOrder);

        if (match.match_status === 'matched') matched++;
        else unmatched++;
      }

      recalcShipmentTotals(db, req.params.id);
      return { matched, unmatched, boxesCreated };
    });

    const result = insertAll();
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[inbound] upload-excel:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// QR SCAN & RECEIVE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/inbound/scan/:qrToken
 * Public — get box info for scan-to-receive
 */
router.get('/scan/:qrToken', (req, res) => {
  try {
    const db = getDb();
    const box = db.prepare('SELECT * FROM inbound_boxes WHERE qr_token = ?').get(req.params.qrToken);
    if (!box) return res.status(404).json({ success: false, error: 'QR code not found or expired' });

    const shipment = db.prepare('SELECT id, ref_no, factory, status FROM inbound_shipments WHERE id = ?').get(box.shipment_id);
    const items = db.prepare(`
      SELECT bxi.*, pv.inventory_quantity AS current_stock
      FROM inbound_box_items bxi
      LEFT JOIN product_variants pv ON pv.shopify_variant_id = bxi.shopify_variant_id
      WHERE bxi.box_id = ?
      ORDER BY bxi.sort_order
    `).all(box.id);

    res.json({ success: true, data: { box, shipment, items } });
  } catch (err) {
    console.error('[inbound] scan:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/inbound/scan/:qrToken/receive
 * Public — confirm receipt of a box, update inventory_quantity
 */
router.post('/scan/:qrToken/receive', (req, res) => {
  try {
    const db = getDb();
    const box = db.prepare('SELECT * FROM inbound_boxes WHERE qr_token = ?').get(req.params.qrToken);
    if (!box) return res.status(404).json({ success: false, error: 'QR code not found' });
    if (box.status === 'received') return res.status(400).json({ success: false, error: 'Box already received' });

    const receiveAll = db.transaction(() => {
      const items = db.prepare('SELECT * FROM inbound_box_items WHERE box_id = ? AND match_status != ?').all(box.id, 'ignored');
      let totalQty = 0;

      for (const item of items) {
        if (!item.shopify_variant_id || item.match_status === 'unmatched') continue;
        db.prepare(`
          UPDATE product_variants
          SET inventory_quantity = inventory_quantity + ?, updated_at = datetime('now')
          WHERE shopify_variant_id = ?
        `).run(item.quantity, item.shopify_variant_id);
        db.prepare('UPDATE inbound_box_items SET received_qty = quantity WHERE id = ?').run(item.id);
        totalQty += item.quantity;
      }

      db.prepare(`
        UPDATE inbound_boxes SET status = 'received', received_at = datetime('now'), received_by = ? WHERE id = ?
      `).run(req.body.user_id || null, box.id);

      // Update PO received_qty
      for (const item of items) {
        if (!item.shopify_variant_id) continue;
        db.prepare(`
          UPDATE purchase_order_items
          SET received_qty = received_qty + ?
          WHERE shopify_variant_id = ? AND po_id IN (
            SELECT id FROM purchase_orders WHERE shipment_id = ?
          )
        `).run(item.quantity, item.shopify_variant_id, box.shipment_id);
      }

      recalcShipmentTotals(db, box.shipment_id);

      db.prepare(`
        INSERT INTO inbound_log (box_id, shipment_id, operated_by, variant_count, total_qty)
        VALUES (?, ?, ?, ?, ?)
      `).run(box.id, box.shipment_id, req.body.user_id || null, items.filter(i => i.shopify_variant_id).length, totalQty);

      return { totalQty, variantCount: items.filter(i => i.shopify_variant_id).length };
    });

    const result = receiveAll();
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[inbound] receive:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY FORM (PUBLIC — no auth required)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/inbound/factory-form/:token
 * Public — return shipment info for factory form
 */
router.get('/factory-form/:token', (req, res) => {
  try {
    const db = getDb();
    const shipment = db.prepare(`
      SELECT id, ref_no, factory, status, form_token_expires_at
      FROM inbound_shipments WHERE form_token = ?
    `).get(req.params.token);
    if (!shipment) return res.status(404).json({ success: false, error: 'Invalid or expired form link' });

    // Attach all linked POs with their items for pre-fill
    const pos = db.prepare(`
      SELECT po.id, po.po_number, po.factory, po.source_file_name
      FROM purchase_orders po WHERE po.shipment_id = ?
      ORDER BY po.created_at ASC
    `).all(shipment.id);

    for (const po of pos) {
      po.items = db.prepare(`
        SELECT raw_sku, raw_product_name, raw_variant_name, ordered_qty, received_qty,
               shopify_variant_id, variant_title, product_title, match_status
        FROM purchase_order_items WHERE po_id = ? ORDER BY sort_order
      `).all(po.id);
    }

    // Get allocated quantities across all boxes for remaining calc
    const allocMap = getAllocatedQtyMap(db, shipment.id);

    // Return existing boxes so factory can see previously submitted data
    const boxRows = db.prepare('SELECT id, box_no, qr_token, status FROM inbound_boxes WHERE shipment_id = ? ORDER BY CAST(box_no AS INTEGER) ASC').all(shipment.id);
    const existingBoxes = boxRows.map(b => {
      const items = db.prepare('SELECT raw_sku, raw_variant_name, quantity FROM inbound_box_items WHERE box_id = ? ORDER BY sort_order').all(b.id);
      return { id: b.id, box_no: b.box_no, qr_token: b.qr_token, status: b.status, items };
    });

    res.json({ success: true, data: { shipment, pos, allocMap, existingBoxes } });
  } catch (err) {
    console.error('[inbound] factory-form get:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/inbound/factory-form/:token/submit
 * Public — factory submits packing list
 * Body: { boxes: [{ box_no, items: [{ base_sku, size_code, quantity }] }] }
 */
router.post('/factory-form/:token/submit', (req, res) => {
  try {
    const db = getDb();
    const shipment = db.prepare('SELECT * FROM inbound_shipments WHERE form_token = ?').get(req.params.token);
    if (!shipment) return res.status(404).json({ success: false, error: 'Invalid or expired form link' });
    if (shipment.status === 'received') return res.status(400).json({ success: false, error: 'Shipment already received' });

    const { boxes = [] } = req.body;
    if (!boxes.length) return res.status(400).json({ success: false, error: 'No boxes provided' });

    const submitAll = db.transaction(() => {
      let matched = 0, unmatched = 0;

      for (const boxData of boxes) {
        const boxNo = String(boxData.box_no || '').trim();
        if (!boxNo) continue;

        // Upsert box
        let box = db.prepare('SELECT id FROM inbound_boxes WHERE shipment_id = ? AND box_no = ?').get(shipment.id, boxNo);
        let boxId;
        if (box) {
          boxId = box.id;
          // Clear existing items (factory is re-submitting)
          db.prepare('DELETE FROM inbound_box_items WHERE box_id = ?').run(boxId);
        } else {
          boxId = nextBoxId(db);
          const qrToken = generateQrToken();
          db.prepare('INSERT INTO inbound_boxes (id, shipment_id, box_no, qr_token) VALUES (?, ?, ?, ?)').run(boxId, shipment.id, boxNo, qrToken);
        }

        const items = boxData.items || [];
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          // Support both { base_sku, size_code } and { raw_sku } formats
          let baseSku = String(it.base_sku || it.sku || '').trim();
          let sizeCode = String(it.size_code || it.size || '').trim();
          const qty = parseInt(it.quantity || it.qty || 0, 10);

          // If frontend sent raw_sku (e.g. 'GS26020-OS'), parse it
          if (!baseSku && it.raw_sku) {
            const raw = String(it.raw_sku).trim();
            const lastDash = raw.lastIndexOf('-');
            if (lastDash > 0) {
              baseSku = raw.substring(0, lastDash);
              sizeCode = raw.substring(lastDash + 1);
            } else {
              baseSku = raw;
            }
          }

          if (!baseSku || !qty || qty <= 0) continue;

          const rawSku = sizeCode ? `${baseSku}-${sizeCode}` : baseSku;
          const match = matchSku(db, rawSku, null);
          const itemId = nextBoxItemId(db);

          db.prepare(`
            INSERT INTO inbound_box_items
              (id, box_id, raw_sku, raw_variant_name, shopify_variant_id, variant_title, product_title, match_status, quantity, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(itemId, boxId, rawSku, sizeCode || null, match.shopify_variant_id, match.variant_title, match.product_title, match.match_status, qty, i);

          if (match.match_status === 'matched') matched++;
          else unmatched++;
        }
      }

      recalcShipmentTotals(db, shipment.id);
      return { matched, unmatched };
    });

    const result = submitAll();

    // Return boxes with qr_token and items so frontend can render QR codes
    const boxRows = db.prepare('SELECT id, box_no, qr_token FROM inbound_boxes WHERE shipment_id = ? ORDER BY CAST(box_no AS INTEGER) ASC').all(shipment.id);
    const boxes_out = boxRows.map(b => {
      const items = db.prepare('SELECT raw_sku, raw_variant_name, quantity FROM inbound_box_items WHERE box_id = ? ORDER BY sort_order').all(b.id);
      return { id: b.id, box_no: b.box_no, qr_token: b.qr_token, items };
    });

    res.json({ success: true, data: { ...result, boxes: boxes_out } });
  } catch (err) {
    console.error('[inbound] factory-form submit:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PACKING LIST EXCEL TEMPLATE DOWNLOAD
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/inbound/excel-template
 * Download a blank packing list Excel template for factory use
 * Format: Box No | SKU (Style No.) | Size | Quantity
 */
router.get('/excel-template', requirePermission('read'), (req, res) => {
  try {
    const wb = XLSX.utils.book_new();
    const wsData = [
      ['Box No', 'Style No.', 'Size', 'Quantity'],
      ['', '(e.g. GS26020)', '(e.g. 0000)', ''],
      ['1', 'GS26020', '0000 (0-3 weeks)', '60'],
      ['1', 'GS26020', '000 (0-3 months)', '60'],
      ['2', 'GS26020', '0000 (0-3 weeks)', '40'],
      ['2', 'GS26021', '0000 (0-3 weeks)', '50'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 10 }, { wch: 18 }, { wch: 22 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Packing List');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="packing_list_template.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    console.error('[inbound] excel-template:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PURCHASE ORDER ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/inbound/purchase-orders
 * List all POs with summary
 */
router.get('/purchase-orders', requirePermission('read'), (req, res) => {
  try {
    const db = getDb();
    const pos = db.prepare(`
      SELECT po.*,
        (SELECT COUNT(*) FROM purchase_order_items WHERE po_id = po.id) AS item_count,
        (SELECT COALESCE(SUM(ordered_qty),0) FROM purchase_order_items WHERE po_id = po.id) AS total_ordered,
        (SELECT COALESCE(SUM(received_qty),0) FROM purchase_order_items WHERE po_id = po.id) AS total_received
      FROM purchase_orders po
      ORDER BY po.created_at DESC
    `).all();
    res.json({ success: true, data: pos });
  } catch (err) {
    console.error('[inbound] list POs:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/inbound/purchase-orders/po-template
 * Download a PO Excel template matching the user's existing PO format
 * Columns: Style no. | (款式) | Size | Quantity | Retail price | Description | Barcode | Memo
 * NOTE: This route MUST be defined before /purchase-orders/:id to avoid route conflict
 */
router.get('/purchase-orders/po-template', requirePermission('read'), (req, res) => {
  try {
    const wb = XLSX.utils.book_new();
    const wsData = [
      ['Style no.', null, 'Size', 'Quantity', 'Retail price', 'Description', 'Barcode', 'Memo'],
      ['款号', '款式', '尺码', '数量', '价格', '品名描述', '条码', '备注'],
      ['GS26020', 'Example Product 示例商品', '0000 (0-3 weeks)', 100, 32.99, 'Example - Colour', 12345678, null],
      [null, null, '000 (0-3 months)', 100, 32.99, 'Example - Colour', 12345679, null],
      [null, null, '00 (3-6 months)', 100, 32.99, 'Example - Colour', 12345680, null],
      [null, null, '0 (6-12 months)', 50, 32.99, 'Example - Colour', 12345681, null],
      [null, null, '1 (12-18 months)', 50, 32.99, 'Example - Colour', 12345682, null],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [
      { wch: 14 }, { wch: 28 }, { wch: 22 }, { wch: 12 },
      { wch: 14 }, { wch: 30 }, { wch: 14 }, { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Purchase Order');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="PO_template.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    console.error('[inbound] po-template:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/inbound/purchase-orders/:id
 * Full PO detail with items
 */
router.get('/purchase-orders/:id', requirePermission('read'), (req, res) => {
  try {
    const db = getDb();
    const po = getPoDetail(db, req.params.id);
    if (!po) return res.status(404).json({ success: false, error: 'PO not found' });
    res.json({ success: true, data: po });
  } catch (err) {
    console.error('[inbound] get PO:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/inbound/purchase-orders/:id
 * Delete a PO (only if open/cancelled)
 */
router.delete('/purchase-orders/:id', requirePermission('write'), (req, res) => {
  try {
    const db = getDb();
    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);
    if (!po) return res.status(404).json({ success: false, error: 'PO not found' });
    if (po.status === 'fulfilled') return res.status(400).json({ success: false, error: 'Cannot delete a fulfilled PO' });
    db.prepare('DELETE FROM purchase_orders WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[inbound] delete PO:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/inbound/purchase-orders/import-excel
 * Parse a PO Excel file and create a PO.
 * Supports two formats:
 *   1. System template: Style no. | (name) | Size | Quantity | Retail price | Description | Barcode | Memo
 *   2. Custom format: auto-detected by header row scan
 * Multi-file: call multiple times with same shipment_id to attach multiple POs to one shipment.
 * Body: multipart/form-data with file + optional { po_number, factory, shipment_id }
 */
router.post('/purchase-orders/import-excel', requirePermission('write'), upload.single('file'), (req, res) => {
  try {
    const db = getDb();
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', header: 1 });

    if (rows.length < 2) return res.status(400).json({ success: false, error: 'Excel file is empty or has no data rows' });

    // —— Detect PO number from filename or body
    let poNumber = req.body.po_number || '';
    let factory = req.body.factory || '';
    const sourceFileName = req.file.originalname || '';

    // Try to extract PO# from filename (e.g. "PO#LIC26003(Filled).xlsx" -> "PO#LIC26003")
    if (!poNumber) {
      const fnMatch = sourceFileName.match(/PO#?([A-Z0-9]+)/i);
      if (fnMatch) poNumber = 'PO#' + fnMatch[1].toUpperCase();
    }

    // Scan first 5 rows for PO# pattern in cells
    if (!poNumber) {
      for (let r = 0; r < Math.min(5, rows.length); r++) {
        for (const cell of rows[r]) {
          const s = String(cell || '').trim();
          if (/PO#?[A-Z0-9]+/i.test(s)) {
            poNumber = s.replace(/.*?(PO#?[A-Z0-9]+).*/i, '$1').toUpperCase();
            break;
          }
        }
        if (poNumber) break;
      }
    }
    if (!poNumber) poNumber = 'PO-' + Date.now();

    // Check duplicate
    const existing = db.prepare('SELECT id FROM purchase_orders WHERE po_number = ?').get(poNumber);
    if (existing) return res.status(409).json({ success: false, error: `PO "${poNumber}" already imported` });

    // —— Detect header row
    // System template format: Row 1 = English headers, Row 2 = Chinese headers, data from Row 3
    // Check if row 1 has "Style no." and row 2 has "款号"
    const row1 = rows[0].map(c => String(c || '').toLowerCase().trim());
    const row2 = rows[1] ? rows[1].map(c => String(c || '').trim()) : [];

    let headerRowIdx = -1;
    let colMap = {};
    const isSystemFormat = row1.some(c => c.includes('style')) && row2.some(c => c.includes('款号'));

    if (isSystemFormat) {
      // System template: Col A=Style No, B=Name(CN), C=Size, D=Qty, E=Price, F=Description(EN), G=Barcode
      headerRowIdx = 1; // data starts at row index 2 (0-based)
      colMap = { sku: 0, nameCn: 1, size: 2, qty: 3, price: 4, nameEn: 5, gtin: 6 };
    } else {
      // Auto-detect header row
      for (let r = 0; r < Math.min(10, rows.length); r++) {
        const row = rows[r].map(c => String(c || '').toLowerCase().trim());
        const hasStyle = row.some(c => c.includes('style') || c.includes('sku') || c.includes('item') || c.includes('货号'));
        const hasQty = row.some(c => c.includes('qty') || c.includes('quantity') || c.includes('数量'));
        if (hasStyle && hasQty) {
          headerRowIdx = r;
          row.forEach((h, i) => {
            if (h.includes('style') || h.includes('sku') || h.includes('item') || h.includes('货号')) colMap.sku = i;
            else if (h.includes('description') || h.includes('name') || h.includes('描述')) colMap.nameEn = i;
            else if (h.includes('size') || h.includes('尺码')) colMap.size = i;
            else if (h.includes('qty') || h.includes('quantity') || h.includes('数量')) colMap.qty = i;
            else if (h.includes('price') || h.includes('单价')) colMap.price = i;
            else if (h.includes('barcode') || h.includes('gtin') || h.includes('条码')) colMap.gtin = i;
          });
          break;
        }
      }
      if (headerRowIdx === -1) {
        // Fallback: assume system template column order
        headerRowIdx = 1;
        colMap = { sku: 0, nameCn: 1, size: 2, qty: 3, price: 4, nameEn: 5, gtin: 6 };
      }
    }

    const id = nextPoId(db);
    db.prepare(`
      INSERT INTO purchase_orders (id, po_number, factory, source_file_name, created_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, poNumber, factory || null, sourceFileName || null, req.session?.user?.id || null);

    let matched = 0, unmatched = 0;
    let sortIdx = 0;
    let lastSku = '';
    let lastNameCn = '';

    for (let r = headerRowIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.every(c => !String(c || '').trim())) continue;

      // Style No may span multiple rows (merged cells appear as empty in xlsx)
      const rawStyleCell = String(row[colMap.sku] || '').trim();
      const styleNo = rawStyleCell || lastSku;
      if (rawStyleCell) lastSku = rawStyleCell;

      const rawNameCn = colMap.nameCn !== undefined ? String(row[colMap.nameCn] || '').trim() : '';
      const rawNameEn = colMap.nameEn !== undefined ? String(row[colMap.nameEn] || '').trim() : '';
      const rawSize = colMap.size !== undefined ? String(row[colMap.size] || '').trim() : '';
      const rawGtin = colMap.gtin !== undefined ? String(row[colMap.gtin] || '').trim().replace(/^\t/, '') : '';
      const rawPrice = colMap.price !== undefined ? parseFloat(String(row[colMap.price] || '0').replace(/[^0-9.]/g, '')) || null : null;
      const qty = parseInt(String(row[colMap.qty] || '0').replace(/[^0-9]/g, ''), 10);

      if (!styleNo || !qty || qty <= 0) continue;

      // Use CN name if available, fall back to EN
      const displayName = rawNameCn || lastNameCn || rawNameEn || '';
      if (rawNameCn) lastNameCn = rawNameCn;

      // Build full SKU: styleNo-sizeCode (e.g. GS26020-0000)
      const sizeCode = extractSizeCode(rawSize);
      const fullSku = sizeCode ? `${styleNo}-${sizeCode}` : styleNo;

      const match = matchSku(db, fullSku, rawGtin || null);
      const itemId = nextPoItemId(db);

      db.prepare(`
        INSERT INTO purchase_order_items
          (id, po_id, raw_sku, raw_gtin, raw_product_name, raw_variant_name,
           shopify_variant_id, variant_title, product_title, match_status,
           ordered_qty, unit_price, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        itemId, id,
        fullSku,
        rawGtin || null,
        displayName || null,
        rawSize || null,
        match.shopify_variant_id, match.variant_title, match.product_title, match.match_status,
        qty, rawPrice, sortIdx++
      );

      if (match.match_status === 'matched') matched++;
      else unmatched++;
    }

    // If shipment_id provided, link this PO to that shipment
    const shipmentId = req.body.shipment_id || null;
    if (shipmentId) {
      const shipment = db.prepare('SELECT id FROM inbound_shipments WHERE id = ?').get(shipmentId);
      if (shipment) {
        db.prepare("UPDATE purchase_orders SET shipment_id = ?, updated_at = datetime('now') WHERE id = ?").run(shipmentId, id);
      }
    }

    const po = getPoDetail(db, id);
    res.status(201).json({ success: true, data: po, summary: { matched, unmatched } });
  } catch (err) {
    console.error('[inbound] import PO excel:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/inbound/purchase-orders/:id/link-shipment
 * Link (or re-link) a PO to an existing shipment
 * Body: { shipment_id }
 */
router.post('/purchase-orders/:id/link-shipment', requirePermission('write'), (req, res) => {
  try {
    const db = getDb();
    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);
    if (!po) return res.status(404).json({ success: false, error: 'PO not found' });

    const { shipment_id } = req.body;
    if (!shipment_id) return res.status(400).json({ success: false, error: 'shipment_id required' });

    const shipment = db.prepare('SELECT id FROM inbound_shipments WHERE id = ?').get(shipment_id);
    if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });

    db.prepare("UPDATE purchase_orders SET shipment_id = ?, updated_at = datetime('now') WHERE id = ?").run(shipment_id, req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[inbound] link-shipment:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/inbound/purchase-orders/:id/create-shipment
 * Create a new inbound_shipment linked to this PO (or return existing)
 */
router.post('/purchase-orders/:id/create-shipment', requirePermission('write'), (req, res) => {
  try {
    const db = getDb();
    const po = getPoDetail(db, req.params.id);
    if (!po) return res.status(404).json({ success: false, error: 'PO not found' });

    if (po.shipment_id) {
      const existing = db.prepare('SELECT * FROM inbound_shipments WHERE id = ?').get(po.shipment_id);
      if (existing) return res.json({ success: true, data: existing, already_existed: true });
    }

    const shipmentId = nextShipmentId(db);
    db.prepare(`
      INSERT INTO inbound_shipments (id, ref_no, factory, note, source, created_by)
      VALUES (?, ?, ?, ?, 'manual', ?)
    `).run(
      shipmentId, shipmentId,
      po.factory || null,
      `Linked to ${po.po_number}`,
      req.session?.user?.id || null
    );

    db.prepare("UPDATE purchase_orders SET shipment_id = ?, updated_at = datetime('now') WHERE id = ?").run(shipmentId, po.id);

    const shipment = db.prepare('SELECT * FROM inbound_shipments WHERE id = ?').get(shipmentId);
    res.status(201).json({ success: true, data: shipment });
  } catch (err) {
    console.error('[inbound] create shipment from PO:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/inbound/purchase-orders/po-template
 * Download a PO Excel template matching the user's existing PO format
 * Columns: Style no. | (款式) | Size | Quantity | Retail price | Description | Barcode | Memo
 */
router.get('/purchase-orders/po-template', requirePermission('read'), (req, res) => {
  try {
    const wb = XLSX.utils.book_new();
    const wsData = [
      ['Style no.', null, 'Size', 'Quantity', 'Retail price', 'Description', 'Barcode', 'Memo'],
      ['款号', '款式', '尺码', '数量', '价格', '品名描述', '条码', '备注'],
      ['GS26020', 'Example Product 示例商品', '0000 (0-3 weeks)', 100, 32.99, 'Example - Colour', 12345678, null],
      [null, null, '000 (0-3 months)', 100, 32.99, 'Example - Colour', 12345679, null],
      [null, null, '00 (3-6 months)', 100, 32.99, 'Example - Colour', 12345680, null],
      [null, null, '0 (6-12 months)', 50, 32.99, 'Example - Colour', 12345681, null],
      [null, null, '1 (12-18 months)', 50, 32.99, 'Example - Colour', 12345682, null],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [
      { wch: 14 }, { wch: 28 }, { wch: 22 }, { wch: 12 },
      { wch: 14 }, { wch: 30 }, { wch: 14 }, { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Purchase Order');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="PO_template.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    console.error('[inbound] po-template:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/inbound/factory-form/:token/remaining-qty
 * Public — return remaining-to-pack quantities for factory form
 * Includes real-time allocated qty so factory can see what's left
 */
router.get('/factory-form/:token/remaining-qty', (req, res) => {
  try {
    const db = getDb();
    const shipment = db.prepare('SELECT id FROM inbound_shipments WHERE form_token = ?').get(req.params.token);
    if (!shipment) return res.status(404).json({ success: false, error: 'Invalid form link' });

    const poItems = db.prepare(`
      SELECT poi.shopify_variant_id, poi.raw_sku, poi.raw_product_name, poi.raw_variant_name,
             poi.product_title, poi.variant_title, poi.match_status,
             COALESCE(SUM(poi.ordered_qty), 0) AS ordered_qty,
             po.po_number
      FROM purchase_order_items poi
      JOIN purchase_orders po ON po.id = poi.po_id
      WHERE po.shipment_id = ?
      GROUP BY poi.shopify_variant_id, poi.raw_sku
      ORDER BY po.created_at ASC, poi.sort_order ASC
    `).all(shipment.id);

    const allocMap = getAllocatedQtyMap(db, shipment.id);

    const result = poItems.map(item => {
      const allocated = item.shopify_variant_id ? (allocMap[item.shopify_variant_id] || 0) : 0;
      return {
        shopify_variant_id: item.shopify_variant_id,
        raw_sku: item.raw_sku,
        raw_product_name: item.raw_product_name,
        raw_variant_name: item.raw_variant_name,
        product_title: item.product_title,
        variant_title: item.variant_title,
        po_number: item.po_number,
        ordered_qty: item.ordered_qty,
        allocated_qty: allocated,
        remaining_qty: Math.max(0, item.ordered_qty - allocated),
      };
    });

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[inbound] factory-form remaining-qty:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
