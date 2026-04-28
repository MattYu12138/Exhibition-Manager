/**
 * Inbound Shipment Routes
 * Handles factory inbound workflow: shipments, boxes, items, QR scan, receive
 *
 * ID conventions (matching existing snowflake.js style):
 *   inbound_shipments : SHP + 8-digit  e.g. SHP00000001
 *   inbound_boxes     : BX  + 10-digit e.g. BX0000000001
 *   inbound_box_items : BXI + 10-digit e.g. BXI0000000001
 */
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { getDb } = require('../db');
const { requirePermission } = require('../middleware/auth');
const multer = require('multer');
const XLSX = require('xlsx');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

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

function generateQrToken() {
  return crypto.randomBytes(16).toString('hex');
}

// ── SKU matcher ───────────────────────────────────────────────────────────────

/**
 * Given a raw SKU string, try to find the matching product_variant.
 * Returns { shopify_variant_id, variant_title, product_title, match_status }
 */
function matchSku(db, rawSku, rawGtin) {
  if (!rawSku && !rawGtin) return { shopify_variant_id: null, variant_title: null, product_title: null, match_status: 'unmatched' };

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

  // 2. Exact GTIN match
  if (!row && rawGtin) {
    row = db.prepare(`
      SELECT pv.shopify_variant_id, pv.variant_title, p.title AS product_title
      FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
      WHERE LOWER(TRIM(pv.gtin)) = LOWER(TRIM(?))
      LIMIT 1
    `).get(rawGtin);
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

// ── Recalculate shipment denormalised totals ──────────────────────────────────

function recalcShipmentTotals(db, shipmentId) {
  const boxes = db.prepare('SELECT id, status FROM inbound_boxes WHERE shipment_id = ?').all(shipmentId);
  const totalBoxes = boxes.length;
  const receivedBoxes = boxes.filter(b => b.status === 'received').length;

  const qtyRow = db.prepare(`
    SELECT COALESCE(SUM(bxi.quantity), 0) AS total_qty
    FROM inbound_box_items bxi
    JOIN inbound_boxes bx ON bx.id = bxi.box_id
    WHERE bx.shipment_id = ?
  `).get(shipmentId);

  let status = 'pending';
  if (receivedBoxes > 0 && receivedBoxes < totalBoxes) status = 'partial';
  else if (totalBoxes > 0 && receivedBoxes === totalBoxes) status = 'received';

  db.prepare(`
    UPDATE inbound_shipments
    SET total_boxes = ?, total_qty = ?, received_boxes = ?, status = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(totalBoxes, qtyRow.total_qty, receivedBoxes, status, shipmentId);
}

// ── Helper: full shipment detail ─────────────────────────────────────────────

function getShipmentDetail(db, shipmentId) {
  const shipment = db.prepare('SELECT * FROM inbound_shipments WHERE id = ?').get(shipmentId);
  if (!shipment) return null;
  const boxes = db.prepare('SELECT * FROM inbound_boxes WHERE shipment_id = ? ORDER BY box_no').all(shipmentId);
  for (const box of boxes) {
    box.items = db.prepare('SELECT * FROM inbound_box_items WHERE box_id = ? ORDER BY sort_order, id').all(box.id);
  }
  shipment.boxes = boxes;
  return shipment;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHIPMENT ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/inbound/shipments
 * List all shipments (summary, no boxes/items)
 */
router.get('/shipments', requirePermission('read'), (req, res) => {
  try {
    const db = getDb();
    const shipments = db.prepare(`
      SELECT * FROM inbound_shipments ORDER BY created_at DESC
    `).all();
    res.json({ success: true, data: shipments });
  } catch (err) {
    console.error('[inbound] list shipments:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/inbound/shipments/:id
 * Full shipment detail with boxes and items
 */
router.get('/shipments/:id', requirePermission('read'), (req, res) => {
  try {
    const db = getDb();
    const detail = getShipmentDetail(db, req.params.id);
    if (!detail) return res.status(404).json({ success: false, error: 'Shipment not found' });
    res.json({ success: true, data: detail });
  } catch (err) {
    console.error('[inbound] get shipment:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/inbound/shipments
 * Create a new shipment (manual or excel source)
 * Body: { factory, note, source }
 */
router.post('/shipments', requirePermission('write'), (req, res) => {
  try {
    const db = getDb();
    const { factory, note, source = 'manual' } = req.body;
    const id = nextShipmentId(db);
    db.prepare(`
      INSERT INTO inbound_shipments (id, ref_no, factory, note, source, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, id, factory || null, note || null, source, req.session?.user?.id || null);
    const shipment = db.prepare('SELECT * FROM inbound_shipments WHERE id = ?').get(id);
    res.status(201).json({ success: true, data: shipment });
  } catch (err) {
    console.error('[inbound] create shipment:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PATCH /api/inbound/shipments/:id
 * Update shipment metadata (factory, note)
 */
router.patch('/shipments/:id', requirePermission('write'), (req, res) => {
  try {
    const db = getDb();
    const { factory, note } = req.body;
    const shipment = db.prepare('SELECT * FROM inbound_shipments WHERE id = ?').get(req.params.id);
    if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });
    if (['received', 'cancelled'].includes(shipment.status)) {
      return res.status(400).json({ success: false, error: 'Cannot edit a completed or cancelled shipment' });
    }
    db.prepare(`
      UPDATE inbound_shipments SET factory = COALESCE(?, factory), note = COALESCE(?, note), updated_at = datetime('now') WHERE id = ?
    `).run(factory ?? null, note ?? null, req.params.id);
    res.json({ success: true, data: db.prepare('SELECT * FROM inbound_shipments WHERE id = ?').get(req.params.id) });
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
    db.prepare('DELETE FROM inbound_shipments WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[inbound] delete shipment:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY FORM TOKEN
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/inbound/shipments/:id/form-token
 * Generate (or regenerate) a factory form token for this shipment.
 * Returns the full form URL.
 */
router.post('/shipments/:id/form-token', requirePermission('write'), (req, res) => {
  try {
    const db = getDb();
    const shipment = db.prepare('SELECT * FROM inbound_shipments WHERE id = ?').get(req.params.id);
    if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });
    const token = crypto.randomBytes(24).toString('hex');
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
    db.prepare(`
      UPDATE inbound_shipments SET form_token = ?, form_token_expires_at = ?, source = 'form', updated_at = datetime('now') WHERE id = ?
    `).run(token, expires, req.params.id);
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5175';
    res.json({ success: true, token, url: `${baseUrl}/factory/submit?token=${token}`, expires });
  } catch (err) {
    console.error('[inbound] form-token:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BOX ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/inbound/shipments/:id/boxes
 * Add a new box to a shipment
 * Body: { box_no, note }
 */
router.post('/shipments/:id/boxes', requirePermission('write'), (req, res) => {
  try {
    const db = getDb();
    const shipment = db.prepare('SELECT * FROM inbound_shipments WHERE id = ?').get(req.params.id);
    if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });
    if (['received', 'cancelled'].includes(shipment.status)) {
      return res.status(400).json({ success: false, error: 'Cannot add boxes to a completed shipment' });
    }

    const { note } = req.body;
    // Auto-assign box_no if not provided
    const existing = db.prepare('SELECT COUNT(*) AS cnt FROM inbound_boxes WHERE shipment_id = ?').get(req.params.id);
    const box_no = req.body.box_no || String(existing.cnt + 1);

    // Check duplicate box_no
    const dup = db.prepare('SELECT id FROM inbound_boxes WHERE shipment_id = ? AND box_no = ?').get(req.params.id, box_no);
    if (dup) return res.status(400).json({ success: false, error: `Box number "${box_no}" already exists in this shipment` });

    const id = nextBoxId(db);
    const qr_token = generateQrToken();
    db.prepare(`
      INSERT INTO inbound_boxes (id, shipment_id, box_no, qr_token, note)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, req.params.id, box_no, qr_token, note || null);

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
// BOX ITEM ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/inbound/boxes/:boxId/items
 * Add an item line to a box
 * Body: { raw_sku, raw_gtin, raw_product_name, raw_variant_name, quantity }
 */
router.post('/boxes/:boxId/items', requirePermission('write'), (req, res) => {
  try {
    const db = getDb();
    const box = db.prepare('SELECT * FROM inbound_boxes WHERE id = ?').get(req.params.boxId);
    if (!box) return res.status(404).json({ success: false, error: 'Box not found' });
    if (box.status === 'received') return res.status(400).json({ success: false, error: 'Box already received' });

    const { raw_sku, raw_gtin, raw_product_name, raw_variant_name, quantity } = req.body;
    if (!quantity || quantity <= 0) return res.status(400).json({ success: false, error: 'quantity must be > 0' });

    const match = matchSku(db, raw_sku, raw_gtin);
    const sortRow = db.prepare('SELECT COUNT(*) AS cnt FROM inbound_box_items WHERE box_id = ?').get(req.params.boxId);
    const id = nextBoxItemId(db);

    db.prepare(`
      INSERT INTO inbound_box_items
        (id, box_id, raw_sku, raw_gtin, raw_product_name, raw_variant_name,
         shopify_variant_id, variant_title, product_title, match_status, quantity, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, req.params.boxId,
      raw_sku || null, raw_gtin || null, raw_product_name || null, raw_variant_name || null,
      match.shopify_variant_id, match.variant_title, match.product_title, match.match_status,
      quantity, sortRow.cnt
    );

    recalcShipmentTotals(db, box.shipment_id);
    const item = db.prepare('SELECT * FROM inbound_box_items WHERE id = ?').get(id);
    res.status(201).json({ success: true, data: item });
  } catch (err) {
    console.error('[inbound] add item:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PATCH /api/inbound/items/:itemId
 * Update an item (quantity, manual match override)
 * Body: { quantity, shopify_variant_id, match_status }
 */
router.patch('/items/:itemId', requirePermission('write'), (req, res) => {
  try {
    const db = getDb();
    const item = db.prepare('SELECT * FROM inbound_box_items WHERE id = ?').get(req.params.itemId);
    if (!item) return res.status(404).json({ success: false, error: 'Item not found' });

    const box = db.prepare('SELECT * FROM inbound_boxes WHERE id = ?').get(item.box_id);
    if (box.status === 'received') return res.status(400).json({ success: false, error: 'Box already received' });

    const { quantity, shopify_variant_id, match_status } = req.body;

    // If manually assigning a variant, look up display names
    let variant_title = item.variant_title;
    let product_title = item.product_title;
    let resolvedMatchStatus = match_status || item.match_status;

    if (shopify_variant_id && shopify_variant_id !== item.shopify_variant_id) {
      const row = db.prepare(`
        SELECT pv.variant_title, p.title AS product_title
        FROM product_variants pv JOIN products p ON p.id = pv.product_id
        WHERE pv.shopify_variant_id = ?
      `).get(shopify_variant_id);
      if (row) {
        variant_title = row.variant_title;
        product_title = row.product_title;
        resolvedMatchStatus = 'manual';
      }
    }

    db.prepare(`
      UPDATE inbound_box_items
      SET quantity = COALESCE(?, quantity),
          shopify_variant_id = COALESCE(?, shopify_variant_id),
          variant_title = ?,
          product_title = ?,
          match_status = ?
      WHERE id = ?
    `).run(
      quantity || null,
      shopify_variant_id || null,
      variant_title, product_title,
      resolvedMatchStatus,
      req.params.itemId
    );

    recalcShipmentTotals(db, box.shipment_id);
    res.json({ success: true, data: db.prepare('SELECT * FROM inbound_box_items WHERE id = ?').get(req.params.itemId) });
  } catch (err) {
    console.error('[inbound] patch item:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/inbound/items/:itemId
 */
router.delete('/items/:itemId', requirePermission('write'), (req, res) => {
  try {
    const db = getDb();
    const item = db.prepare('SELECT * FROM inbound_box_items WHERE id = ?').get(req.params.itemId);
    if (!item) return res.status(404).json({ success: false, error: 'Item not found' });
    const box = db.prepare('SELECT * FROM inbound_boxes WHERE id = ?').get(item.box_id);
    if (box.status === 'received') return res.status(400).json({ success: false, error: 'Box already received' });
    db.prepare('DELETE FROM inbound_box_items WHERE id = ?').run(req.params.itemId);
    recalcShipmentTotals(db, box.shipment_id);
    res.json({ success: true });
  } catch (err) {
    console.error('[inbound] delete item:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SKU SEARCH (for manual entry autocomplete)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/inbound/sku-search?q=GS260
 * Search product_variants by SKU prefix for autocomplete
 */
router.get('/sku-search', requirePermission('read'), (req, res) => {
  try {
    const db = getDb();
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json({ success: true, data: [] });
    const rows = db.prepare(`
      SELECT pv.shopify_variant_id, pv.sku, pv.gtin, pv.variant_title, pv.inventory_quantity,
             p.title AS product_title, p.main_image
      FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
      WHERE LOWER(pv.sku) LIKE LOWER(?) OR LOWER(pv.gtin) LIKE LOWER(?)
      ORDER BY pv.sku
      LIMIT 30
    `).all(`${q}%`, `${q}%`);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[inbound] sku-search:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// QR SCAN & RECEIVE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/inbound/scan/:qrToken
 * Public endpoint — no auth required (accessed via QR code on phone)
 * Returns box detail for confirmation screen
 */
router.get('/scan/:qrToken', (req, res) => {
  try {
    const db = getDb();
    const box = db.prepare('SELECT * FROM inbound_boxes WHERE qr_token = ?').get(req.params.qrToken);
    if (!box) return res.status(404).json({ success: false, error: 'Invalid QR code' });

    const shipment = db.prepare('SELECT id, ref_no, factory, status FROM inbound_shipments WHERE id = ?').get(box.shipment_id);
    const items = db.prepare(`
      SELECT bxi.*, pv.inventory_quantity AS current_stock
      FROM inbound_box_items bxi
      LEFT JOIN product_variants pv ON pv.shopify_variant_id = bxi.shopify_variant_id
      WHERE bxi.box_id = ?
      ORDER BY bxi.sort_order, bxi.id
    `).all(box.id);

    res.json({
      success: true,
      data: {
        box: { ...box, items },
        shipment,
      }
    });
  } catch (err) {
    console.error('[inbound] scan:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/inbound/scan/:qrToken/receive
 * Confirm receipt of a box — updates inventory_quantity for all matched items
 * Body: { note, items: [{ item_id, received_qty }] }  (items optional — defaults to planned qty)
 * Auth: session cookie (user must be logged in)
 */
router.post('/scan/:qrToken/receive', requirePermission('write'), (req, res) => {
  try {
    const db = getDb();
    const box = db.prepare('SELECT * FROM inbound_boxes WHERE qr_token = ?').get(req.params.qrToken);
    if (!box) return res.status(404).json({ success: false, error: 'Invalid QR code' });
    if (box.status === 'received') return res.status(400).json({ success: false, error: 'Box already received' });

    const { note, items: itemOverrides = [] } = req.body;
    const userId = req.session?.user?.id || null;

    const dbItems = db.prepare('SELECT * FROM inbound_box_items WHERE box_id = ?').all(box.id);

    const receiveAll = db.transaction(() => {
      let totalQty = 0;
      let variantCount = 0;

      for (const dbItem of dbItems) {
        if (dbItem.match_status === 'ignored' || !dbItem.shopify_variant_id) continue;

        // Allow per-item quantity override from request body
        const override = itemOverrides.find(o => o.item_id === dbItem.id);
        const receivedQty = override ? Math.max(0, parseInt(override.received_qty, 10)) : dbItem.quantity;

        if (receivedQty === 0) continue;

        // Update inventory
        db.prepare(`
          UPDATE product_variants
          SET inventory_quantity = inventory_quantity + ?, updated_at = datetime('now')
          WHERE shopify_variant_id = ?
        `).run(receivedQty, dbItem.shopify_variant_id);

        // Record received_qty on item
        db.prepare(`
          UPDATE inbound_box_items SET received_qty = ? WHERE id = ?
        `).run(receivedQty, dbItem.id);

        totalQty += receivedQty;
        variantCount += 1;
      }

      // Mark box as received
      db.prepare(`
        UPDATE inbound_boxes SET status = 'received', received_at = datetime('now'), received_by = ?, note = COALESCE(?, note)
        WHERE id = ?
      `).run(userId, note || null, box.id);

      // Write audit log
      db.prepare(`
        INSERT INTO inbound_log (box_id, shipment_id, operated_by, note, variant_count, total_qty)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(box.id, box.shipment_id, userId, note || null, variantCount, totalQty);

      // Recalc shipment totals and status
      recalcShipmentTotals(db, box.shipment_id);

      return { variantCount, totalQty };
    });

    const result = receiveAll();
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[inbound] receive:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// EXCEL UPLOAD
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/inbound/shipments/:id/upload-excel
 * Parse uploaded Excel file and populate boxes + items for this shipment.
 * Expected columns: Box No | SKU | GTIN (optional) | Product Name (optional) | Variant (optional) | Quantity
 */
router.post('/shipments/:id/upload-excel', requirePermission('write'), upload.single('file'), (req, res) => {
  try {
    const db = getDb();
    const shipment = db.prepare('SELECT * FROM inbound_shipments WHERE id = ?').get(req.params.id);
    if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (rows.length === 0) return res.status(400).json({ success: false, error: 'Excel file is empty' });

    // Normalise header names (case-insensitive, trim)
    const normalise = (obj) => {
      const out = {};
      for (const [k, v] of Object.entries(obj)) {
        out[k.toLowerCase().trim().replace(/\s+/g, '_')] = String(v).trim();
      }
      return out;
    };

    const importAll = db.transaction(() => {
      const boxMap = {}; // box_no -> box id
      let created = 0, matched = 0, unmatched = 0;

      for (const rawRow of rows) {
        const row = normalise(rawRow);
        const boxNo = row['box_no'] || row['box'] || row['箱号'] || row['carton'] || '';
        const rawSku = row['sku'] || row['货号'] || '';
        const rawGtin = row['gtin'] || row['barcode'] || row['条码'] || '';
        const rawProductName = row['product_name'] || row['product'] || row['商品名'] || '';
        const rawVariantName = row['variant'] || row['variant_name'] || row['规格'] || '';
        const qty = parseInt(row['quantity'] || row['qty'] || row['数量'] || '0', 10);

        if (!boxNo || !qty || qty <= 0) continue;

        // Get or create box
        if (!boxMap[boxNo]) {
          const existing = db.prepare('SELECT id FROM inbound_boxes WHERE shipment_id = ? AND box_no = ?').get(req.params.id, boxNo);
          if (existing) {
            boxMap[boxNo] = existing.id;
          } else {
            const boxId = nextBoxId(db);
            const qr_token = generateQrToken();
            db.prepare('INSERT INTO inbound_boxes (id, shipment_id, box_no, qr_token) VALUES (?, ?, ?, ?)').run(boxId, req.params.id, boxNo, qr_token);
            boxMap[boxNo] = boxId;
            created++;
          }
        }

        const match = matchSku(db, rawSku || null, rawGtin || null);
        const sortRow = db.prepare('SELECT COUNT(*) AS cnt FROM inbound_box_items WHERE box_id = ?').get(boxMap[boxNo]);
        const itemId = nextBoxItemId(db);

        db.prepare(`
          INSERT INTO inbound_box_items
            (id, box_id, raw_sku, raw_gtin, raw_product_name, raw_variant_name,
             shopify_variant_id, variant_title, product_title, match_status, quantity, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          itemId, boxMap[boxNo],
          rawSku || null, rawGtin || null, rawProductName || null, rawVariantName || null,
          match.shopify_variant_id, match.variant_title, match.product_title, match.match_status,
          qty, sortRow.cnt
        );

        if (match.match_status === 'matched') matched++;
        else unmatched++;
      }

      // Update source
      db.prepare("UPDATE inbound_shipments SET source = 'excel', updated_at = datetime('now') WHERE id = ?").run(req.params.id);
      recalcShipmentTotals(db, req.params.id);

      return { boxes_created: created, items_matched: matched, items_unmatched: unmatched };
    });

    const result = importAll();
    const detail = getShipmentDetail(db, req.params.id);
    res.json({ success: true, data: detail, summary: result });
  } catch (err) {
    console.error('[inbound] upload-excel:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY FORM (PUBLIC — no auth)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/inbound/factory-form/:token
 * Public — validate token and return shipment info for factory to fill
 */
router.get('/factory-form/:token', (req, res) => {
  try {
    const db = getDb();
    const shipment = db.prepare(`
      SELECT id, ref_no, factory, note, status, form_token_expires_at
      FROM inbound_shipments WHERE form_token = ?
    `).get(req.params.token);
    if (!shipment) return res.status(404).json({ success: false, error: 'Invalid or expired link' });
    if (shipment.form_token_expires_at && new Date(shipment.form_token_expires_at) < new Date()) {
      return res.status(410).json({ success: false, error: 'This link has expired' });
    }
    if (['received', 'cancelled'].includes(shipment.status)) {
      return res.status(400).json({ success: false, error: 'This shipment is already closed' });
    }
    // Return existing boxes/items so factory can see what's already been entered
    const boxes = db.prepare('SELECT * FROM inbound_boxes WHERE shipment_id = ? ORDER BY box_no').all(shipment.id);
    for (const box of boxes) {
      box.items = db.prepare('SELECT * FROM inbound_box_items WHERE box_id = ? ORDER BY sort_order').all(box.id);
    }
    res.json({ success: true, data: { ...shipment, boxes } });
  } catch (err) {
    console.error('[inbound] factory-form get:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/inbound/factory-form/:token/submit
 * Public — factory submits packing list
 * Body: { boxes: [{ box_no, note, items: [{ raw_sku, raw_gtin, raw_product_name, raw_variant_name, quantity }] }] }
 */
router.post('/factory-form/:token/submit', (req, res) => {
  try {
    const db = getDb();
    const shipment = db.prepare(`
      SELECT * FROM inbound_shipments WHERE form_token = ?
    `).get(req.params.token);
    if (!shipment) return res.status(404).json({ success: false, error: 'Invalid or expired link' });
    if (shipment.form_token_expires_at && new Date(shipment.form_token_expires_at) < new Date()) {
      return res.status(410).json({ success: false, error: 'This link has expired' });
    }
    if (['received', 'cancelled'].includes(shipment.status)) {
      return res.status(400).json({ success: false, error: 'This shipment is already closed' });
    }

    const { boxes = [] } = req.body;
    if (!Array.isArray(boxes) || boxes.length === 0) {
      return res.status(400).json({ success: false, error: 'No box data provided' });
    }

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
          // Clear existing items from this box (factory is re-submitting)
          db.prepare('DELETE FROM inbound_box_items WHERE box_id = ?').run(boxId);
        } else {
          boxId = nextBoxId(db);
          const qr_token = generateQrToken();
          db.prepare('INSERT INTO inbound_boxes (id, shipment_id, box_no, qr_token, note) VALUES (?, ?, ?, ?, ?)').run(boxId, shipment.id, boxNo, qr_token, boxData.note || null);
        }

        const items = Array.isArray(boxData.items) ? boxData.items : [];
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          const qty = parseInt(it.quantity, 10);
          if (!qty || qty <= 0) continue;
          const match = matchSku(db, it.raw_sku || null, it.raw_gtin || null);
          const itemId = nextBoxItemId(db);
          db.prepare(`
            INSERT INTO inbound_box_items
              (id, box_id, raw_sku, raw_gtin, raw_product_name, raw_variant_name,
               shopify_variant_id, variant_title, product_title, match_status, quantity, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            itemId, boxId,
            it.raw_sku || null, it.raw_gtin || null, it.raw_product_name || null, it.raw_variant_name || null,
            match.shopify_variant_id, match.variant_title, match.product_title, match.match_status,
            qty, i
          );
          if (match.match_status === 'matched') matched++;
          else unmatched++;
        }
      }

      db.prepare("UPDATE inbound_shipments SET source = 'form', updated_at = datetime('now') WHERE id = ?").run(shipment.id);
      recalcShipmentTotals(db, shipment.id);
      return { matched, unmatched };
    });

    const result = submitAll();
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[inbound] factory-form submit:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// EXCEL TEMPLATE DOWNLOAD
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/inbound/excel-template
 * Download a blank Excel template for factory use
 */
router.get('/excel-template', requirePermission('read'), (req, res) => {
  try {
    const wb = XLSX.utils.book_new();
    const wsData = [
      ['Box No', 'SKU', 'GTIN', 'Product Name', 'Variant', 'Quantity'],
      ['1', 'GS26020-0000', '', 'Example Product', 'Default', '10'],
      ['1', 'GS26020-0001', '', 'Example Product', 'Size S', '5'],
      ['2', 'GS26021-0000', '', 'Another Product', '', '8'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 10 }, { wch: 18 }, { wch: 15 }, { wch: 30 }, { wch: 15 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Packing List');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="inbound_template.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    console.error('[inbound] excel-template:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
