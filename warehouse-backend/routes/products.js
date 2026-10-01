/**
 * 产品查询路由（读取共享数据库中的 products / product_variants）
 * 供货物录入时搜索 SKU
 */
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { requireLogin } = require('../middleware/auth');
const { resolveWarehouse } = require('../middleware/warehouseContext');

// GET /api/products  搜索产品（支持名称/SKU/barcode）
router.get('/', requireLogin, (req, res) => {
  try {
    const { search, limit = 30 } = req.query;
    let sql = `
      SELECT p.id, p.title, p.product_type, p.main_image,
        pv.id AS variant_id, pv.shopify_variant_id, pv.variant_title,
        pv.sku, pv.gtin, pv.price, pv.image_url
      FROM products p
      JOIN product_variants pv ON pv.product_id = p.id
      WHERE p.status != 'archived'
    `;
    const params = [];
    if (search) {
      sql += ` AND (p.title LIKE ? OR pv.variant_title LIKE ? OR pv.sku LIKE ? OR pv.gtin LIKE ?)`;
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }
    sql += ` ORDER BY p.title, pv.variant_title LIMIT ?`;
    params.push(parseInt(limit));

    const variants = db.prepare(sql).all(...params);
    res.json({ success: true, data: variants });
  } catch (err) {
    console.error('[products] search:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/products/barcode/:barcode
// Keep the barcode as text (including leading zeros) and match the same GTIN
// field as Product Traceability. Stock is read-only and scoped by layout ID.
router.get('/barcode/:barcode', requireLogin, (req, res) => {
  try {
    const barcode = String(req.params.barcode || '').trim();
    if (!/^\d{8}$/.test(barcode)) {
      return res.status(400).json({ success: false, code: 'INVALID_BARCODE', message: '条码必须为 8 位数字' });
    }

    const layoutId = resolveWarehouse(req, res);
    if (!layoutId) return;

    const matches = db.prepare(`
      SELECT p.id AS product_id, p.title AS product_title, p.product_type, p.main_image,
        pv.id AS variant_id, pv.shopify_variant_id, pv.variant_title,
        pv.sku, trim(pv.gtin) AS barcode, pv.image_url
      FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
      WHERE trim(pv.gtin) = ? AND COALESCE(p.status, '') != 'archived'
      ORDER BY p.title COLLATE NOCASE, pv.variant_title, pv.id
    `).all(barcode);

    if (!matches.length) {
      return res.json({ success: true, data: { barcode, layout_id: layoutId, matches: [], ambiguous: false } });
    }

    const variantIds = [...new Set(matches.map(row => row.shopify_variant_id).filter(Boolean))];
    const stockRows = variantIds.length ? db.prepare(`
      SELECT wi.shopify_variant_id, wl.id AS location_id, wl.code AS location_code,
        wi.stock_type, wi.exhibition_id, e.name AS exhibition_name,
        wi.inbound_shipment_id, wi.inbound_box_id,
        SUM(wi.quantity) AS quantity
      FROM warehouse_inventory wi
      JOIN warehouse_locations wl ON wl.id = wi.location_id
      LEFT JOIN exhibitions e ON e.id = wi.exhibition_id
      WHERE wl.layout_id = ? AND wl.is_active = 1 AND wi.quantity > 0
        AND wi.shopify_variant_id IN (${variantIds.map(() => '?').join(',')})
      GROUP BY wi.shopify_variant_id, wl.id, wi.stock_type, wi.exhibition_id,
        wi.inbound_shipment_id, wi.inbound_box_id
      ORDER BY wl.code, wi.stock_type, wi.exhibition_id
    `).all(layoutId, ...variantIds) : [];

    const stockByVariant = new Map();
    for (const stock of stockRows) {
      const list = stockByVariant.get(stock.shopify_variant_id) || [];
      list.push(stock);
      stockByVariant.set(stock.shopify_variant_id, list);
    }
    const evidenceAccess = req.session?.user?.role === 'admin';
    if (evidenceAccess) {
      db.prepare(`INSERT INTO warehouse_trade_access_log (actor_user_id, warehouse_id, barcode)
        VALUES (?, ?, ?)`).run(String(req.session.user.id), layoutId, barcode);
    }
    for (const match of matches) {
      match.locations = stockByVariant.get(match.shopify_variant_id) || [];
      match.total_quantity = match.locations.reduce((total, row) => total + row.quantity, 0);
      // PO/invoice/packing/B/L are trade evidence, never a verified lot or
      // a GOTS certificate. Shared barcodes across years do not establish a
      // physical link: show those lines only as candidates to review.
      const documentaryLines = evidenceAccess ? db.prepare(`
        SELECT tl.document_sku, tl.document_title, tl.document_size,
          tl.po_quantity, tl.invoice_quantity, tl.packing_quantity,
          tl.match_method, tl.shopify_variant_id,
          s.po_ref, s.invoice_ref, s.packing_ref, s.bol_ref,
          s.supplier_name, s.shipped_at, s.port_of_loading,
          s.port_of_discharge, s.declared_cartons, s.declared_units
        FROM warehouse_trade_shipment_lines tl
        JOIN warehouse_trade_shipments s ON s.id = tl.shipment_id
        WHERE tl.shopify_variant_id = ? OR tl.barcode = ?
        ORDER BY s.shipped_at DESC, tl.document_sku LIMIT 30
      `).all(match.shopify_variant_id, barcode) : [];
      match.trade_documents = documentaryLines.map(({ shopify_variant_id, match_method, ...line }) => ({
        ...line,
        relation: match_method === 'exact_sku' && shopify_variant_id === match.shopify_variant_id
          ? 'catalogue_sku_candidate' : 'barcode_candidate',
        evidence_status: 'commercial_documents_only',
      }));
      match.stock_source_status = 'trade_shipment_to_stock_unverified';
    }
    res.json({ success: true, data: { barcode, layout_id: layoutId, matches,
      ambiguous: matches.length > 1, evidence_access: evidenceAccess } });
  } catch (err) {
    console.error('[products] barcode lookup:', err.message);
    res.status(500).json({ success: false, message: '条码查询失败，请稍后重试' });
  }
});

// GET /api/products/variant/:variantId  获取单个变体详情
router.get('/variant/:variantId', requireLogin, (req, res) => {
  try {
    const variant = db.prepare(`
      SELECT p.id, p.title, p.product_type, p.main_image,
        pv.id AS variant_id, pv.shopify_variant_id, pv.variant_title,
        pv.sku, pv.gtin, pv.price, pv.image_url
      FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
      WHERE pv.shopify_variant_id = ?
    `).get(req.params.variantId);

    if (!variant) return res.status(404).json({ success: false, message: 'SKU 不存在' });
    res.json({ success: true, data: variant });
  } catch (err) {
    console.error('[products] variant:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/products/exhibitions  获取展会列表（供录入时选择）
router.get('/exhibitions', requireLogin, (req, res) => {
  try {
    const exhibitions = db.prepare(`
      SELECT id, name, date, location, status
      FROM exhibitions
      ORDER BY date DESC
    `).all();
    res.json({ success: true, data: exhibitions });
  } catch (err) {
    console.error('[products] exhibitions:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/products/inbound-shipments  获取 inbound 入库单列表（供关联）
router.get('/inbound-shipments', requireLogin, (req, res) => {
  try {
    // 兼容 inventory-backend 的 inbound_shipments 表（如果存在）
    const tableExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='inbound_shipments'"
    ).get();

    if (!tableExists) {
      return res.json({ success: true, data: [] });
    }

    const shipments = db.prepare(`
      SELECT id, reference_no, supplier_name, arrived_at, status
      FROM inbound_shipments
      ORDER BY arrived_at DESC
      LIMIT 50
    `).all();
    res.json({ success: true, data: shipments });
  } catch (err) {
    console.error('[products] inbound-shipments:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
