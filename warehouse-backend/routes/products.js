/**
 * 产品查询路由（读取共享数据库中的 products / product_variants）
 * 供货物录入时搜索 SKU
 */
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { requireLogin } = require('../middleware/auth');

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
