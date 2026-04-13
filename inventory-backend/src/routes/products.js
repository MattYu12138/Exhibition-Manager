const express = require('express');
const { getDb } = require('../db');
const { requirePermission } = require('../middleware/auth');
const { fetchAllProducts, updateVariant, updateProduct } = require('../utils/shopify');

const router = express.Router();

/**
 * GET /api/products/sync
 * Fetch all products from Shopify and cache them in the local DB
 */
router.post('/sync', requirePermission('write'), async (req, res) => {
  try {
    const products = await fetchAllProducts();
    const db = getDb();

    const upsert = db.prepare(`
      INSERT INTO inventory_products_cache (shopify_product_id, title, vendor, product_type, status, handle, tags, raw_json, cached_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(shopify_product_id) DO UPDATE SET
        title = excluded.title,
        vendor = excluded.vendor,
        product_type = excluded.product_type,
        status = excluded.status,
        handle = excluded.handle,
        tags = excluded.tags,
        raw_json = excluded.raw_json,
        cached_at = excluded.cached_at
    `);

    const txn = db.transaction(() => {
      for (const p of products) {
        upsert.run(
          String(p.id), p.title, p.vendor, p.product_type,
          p.status, p.handle, p.tags,
          JSON.stringify(p)
        );
      }
    });
    txn();

    const variantCount = products.reduce((sum, p) => sum + (p.variants?.length || 0), 0);
    db.prepare(`INSERT INTO inventory_sync_log (product_count, variant_count, status) VALUES (?, ?, 'success')`)
      .run(products.length, variantCount);

    res.json({ success: true, productCount: products.length, variantCount });
  } catch (err) {
    console.error('Sync error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/products
 * Return cached products with duplicate analysis
 */
router.get('/', requirePermission('read'), (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM inventory_products_cache ORDER BY cached_at DESC').all();

  const products = rows.map(r => JSON.parse(r.raw_json));

  // Analyze duplicates
  const skuMap = {};
  const barcodeMap = {};

  for (const product of products) {
    for (const variant of (product.variants || [])) {
      if (variant.sku) {
        if (!skuMap[variant.sku]) skuMap[variant.sku] = [];
        skuMap[variant.sku].push({ productId: product.id, productTitle: product.title, variantId: variant.id, variantTitle: variant.title });
      }
      if (variant.barcode) {
        if (!barcodeMap[variant.barcode]) barcodeMap[variant.barcode] = [];
        barcodeMap[variant.barcode].push({ productId: product.id, productTitle: product.title, variantId: variant.id, variantTitle: variant.title });
      }
    }
  }

  const duplicateSKUs = Object.entries(skuMap)
    .filter(([, v]) => v.length > 1)
    .map(([sku, variants]) => ({ sku, variants }));

  const duplicateBarcodes = Object.entries(barcodeMap)
    .filter(([, v]) => v.length > 1)
    .map(([barcode, variants]) => ({ barcode, variants }));

  // Mark products with duplicate flags
  const duplicateProductIds = new Set();
  const duplicateVariantIds = new Set();

  [...duplicateSKUs, ...duplicateBarcodes].forEach(d => {
    (d.variants || []).forEach(v => {
      duplicateProductIds.add(String(v.productId));
      duplicateVariantIds.add(String(v.variantId));
    });
  });

  const enriched = products.map(p => ({
    ...p,
    hasDuplicate: duplicateProductIds.has(String(p.id)),
    variants: (p.variants || []).map(v => ({
      ...v,
      hasDuplicateSKU: !!(v.sku && skuMap[v.sku]?.length > 1),
      hasDuplicateBarcode: !!(v.barcode && barcodeMap[v.barcode]?.length > 1)
    }))
  }));

  res.json({
    products: enriched,
    summary: {
      total: products.length,
      withDuplicates: duplicateProductIds.size,
      duplicateSKUs: duplicateSKUs.length,
      duplicateBarcodes: duplicateBarcodes.length
    },
    duplicateSKUs,
    duplicateBarcodes
  });
});

/**
 * GET /api/products/last-sync
 */
router.get('/last-sync', requirePermission('read'), (req, res) => {
  const db = getDb();
  const log = db.prepare('SELECT * FROM inventory_sync_log ORDER BY id DESC LIMIT 1').get();
  res.json(log || null);
});

/**
 * PUT /api/products/:productId/variants/:variantId
 * Update a variant and sync back to Shopify
 */
router.put('/:productId/variants/:variantId', requirePermission('write'), async (req, res) => {
  const { variantId } = req.params;
  const { sku, barcode, price, compare_at_price, inventory_quantity } = req.body;

  try {
    const updateData = {};
    if (sku !== undefined) updateData.sku = sku;
    if (barcode !== undefined) updateData.barcode = barcode;
    if (price !== undefined) updateData.price = price;
    if (compare_at_price !== undefined) updateData.compare_at_price = compare_at_price;

    const updated = await updateVariant(variantId, updateData);
    res.json({ success: true, variant: updated });
  } catch (err) {
    console.error('Update variant error:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.errors || err.message });
  }
});

/**
 * PUT /api/products/:productId
 * Update product details and sync back to Shopify
 */
router.put('/:productId', requirePermission('write'), async (req, res) => {
  const { productId } = req.params;
  const { title, vendor, product_type, tags, status } = req.body;

  try {
    const updateData = { id: productId };
    if (title !== undefined) updateData.title = title;
    if (vendor !== undefined) updateData.vendor = vendor;
    if (product_type !== undefined) updateData.product_type = product_type;
    if (tags !== undefined) updateData.tags = tags;
    if (status !== undefined) updateData.status = status;

    const updated = await updateProduct(productId, updateData);
    res.json({ success: true, product: updated });
  } catch (err) {
    console.error('Update product error:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.errors || err.message });
  }
});

module.exports = router;
