const express = require('express');
const { getDb } = require('../db');
const { requirePermission } = require('../middleware/auth');
const { fetchAllProducts, updateVariant, updateProduct } = require('../utils/shopify');

const router = express.Router();

// ── ID generation helpers ──────────────────────────────────────────────────
let _prCounter = null;
let _vCounter = null;

function nextProductId(db) {
  if (_prCounter === null) {
    const row = db.prepare("SELECT MAX(CAST(SUBSTR(id,3) AS INTEGER)) AS mx FROM products WHERE id LIKE 'PR%'").get();
    _prCounter = (row?.mx || 0);
  }
  _prCounter += 1;
  return 'PR' + String(_prCounter).padStart(12, '0');
}

function nextVariantId(db) {
  if (_vCounter === null) {
    const row = db.prepare("SELECT MAX(CAST(SUBSTR(id,2) AS INTEGER)) AS mx FROM product_variants WHERE id LIKE 'V%'").get();
    _vCounter = (row?.mx || 0);
  }
  _vCounter += 1;
  return 'V' + String(_vCounter).padStart(12, '0');
}

/**
 * POST /api/products/sync
 * Fetch all products from Shopify and upsert into products + product_variants tables
 */
router.post('/sync', requirePermission('write'), async (req, res) => {
  try {
    const shopifyProducts = await fetchAllProducts();
    const db = getDb();

    // Reset in-memory counters so IDs are recalculated from DB state
    _prCounter = null;
    _vCounter = null;

    const shopifyProductIds = new Set(shopifyProducts.map(p => String(p.id)));

    const txn = db.transaction(() => {
      for (const p of shopifyProducts) {
        const computedStatus = p._computed_status || p.status;
        const shopifyProductId = String(p.id);

        // Upsert into products table
        const existing = db.prepare('SELECT id FROM products WHERE shopify_product_id = ?').get(shopifyProductId);
        let productId;
        if (existing) {
          productId = existing.id;
          const mainImage = p.images?.[0]?.src || null;
          db.prepare(`
            UPDATE products SET
              title = ?, vendor = ?, product_type = ?, status = ?,
              handle = ?, tags = ?, main_image = ?, updated_at = datetime('now')
            WHERE id = ?
          `).run(p.title, p.vendor, p.product_type, computedStatus,
                 p.handle, p.tags, mainImage, productId);
        } else {
          productId = nextProductId(db);
          const mainImageNew = p.images?.[0]?.src || null;
          db.prepare(`
            INSERT INTO products (id, shopify_product_id, title, vendor, product_type, status, handle, tags, main_image)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(productId, shopifyProductId, p.title, p.vendor, p.product_type,
                 computedStatus, p.handle, p.tags, mainImageNew);
        }

        // Upsert each variant into product_variants table
        for (const v of (p.variants || [])) {
          const shopifyVariantId = String(v.id);
          const existingVariant = db.prepare('SELECT id FROM product_variants WHERE shopify_variant_id = ?').get(shopifyVariantId);
          const imageUrl = v.image_id
            ? (p.images?.find(img => img.id === v.image_id)?.src || null)
            : (p.images?.[0]?.src || null);

          if (existingVariant) {
            db.prepare(`
              UPDATE product_variants SET
                product_id = ?, shopify_product_id = ?, variant_title = ?, sku = ?, gtin = ?,
                price = ?, image_url = ?, inventory_quantity = ?, updated_at = datetime('now')
              WHERE id = ?
            `).run(productId, shopifyProductId, v.title, v.sku || null, v.barcode || null,
                   parseFloat(v.price) || null, imageUrl,
                   v.inventory_quantity ?? 0, existingVariant.id);
          } else {
            const variantId = nextVariantId(db);
            db.prepare(`
              INSERT INTO product_variants (id, product_id, shopify_product_id, shopify_variant_id, variant_title, sku, gtin, price, image_url, inventory_quantity)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(variantId, productId, shopifyProductId, shopifyVariantId, v.title,
                   v.sku || null, v.barcode || null, parseFloat(v.price) || null, imageUrl,
                   v.inventory_quantity ?? 0);
          }
        }
      }

      // Delete products (and their variants via CASCADE) that no longer exist in Shopify
      const cachedShopifyIds = db.prepare('SELECT shopify_product_id FROM products').all()
        .map(r => r.shopify_product_id);
      const toDelete = cachedShopifyIds.filter(id => !shopifyProductIds.has(id));
      if (toDelete.length > 0) {
        const placeholders = toDelete.map(() => '?').join(',');
        db.prepare(`DELETE FROM products WHERE shopify_product_id IN (${placeholders})`).run(...toDelete);
        console.log(`Sync: removed ${toDelete.length} deleted product(s):`, toDelete);
      }
    });

    txn();

    const variantCount = shopifyProducts.reduce((sum, p) => sum + (p.variants?.length || 0), 0);
    db.prepare(`INSERT INTO inventory_sync_log (product_count, variant_count, message) VALUES (?, ?, 'success')`)
      .run(shopifyProducts.length, variantCount);

    res.json({ success: true, productCount: shopifyProducts.length, variantCount });
  } catch (err) {
    console.error('Sync error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/products
 * Return products with variants and duplicate analysis
 */
router.get('/', requirePermission('read'), (req, res) => {
  const db = getDb();
  const { status } = req.query;

  // Load all products with their variants for global duplicate analysis
  const allProductRows = db.prepare('SELECT * FROM products ORDER BY updated_at DESC').all();
  const allVariantRows = db.prepare('SELECT * FROM product_variants').all();

  // Group variants by product_id
  const variantsByProduct = {};
  for (const v of allVariantRows) {
    if (!variantsByProduct[v.product_id]) variantsByProduct[v.product_id] = [];
    variantsByProduct[v.product_id].push(v);
  }

  // Build full product objects from DB rows
  const allProducts = allProductRows.map(row => {
    return {
      id: row.id,                           // system ID (PR...)
      shopify_product_id: row.shopify_product_id,
      title: row.title,
      vendor: row.vendor,
      product_type: row.product_type,
      status: row.status,
      _computed_status: row.status,
      handle: row.handle,
      tags: row.tags,
      main_image: row.main_image,
      updated_at: row.updated_at,
      variants: (variantsByProduct[row.id] || []).map(v => ({
        ...v,
        id: v.id,                           // system ID (V...)
        shopify_variant_id: v.shopify_variant_id,
        title: v.variant_title,
        sku: v.sku,
        barcode: v.gtin,
        price: v.price,
        image_url: v.image_url,
      })),
    };
  });

  // Build global SKU/barcode maps across ALL products (all statuses)
  const skuMap = {};
  const barcodeMap = {};

  for (const product of allProducts) {
    for (const variant of (product.variants || [])) {
      const productStatus = product._computed_status || product.status || 'unknown';
      if (variant.sku) {
        if (!skuMap[variant.sku]) skuMap[variant.sku] = [];
        skuMap[variant.sku].push({ productId: product.id, productTitle: product.title, productStatus, variantId: variant.id, variantTitle: variant.title });
      }
      if (variant.barcode) {
        if (!barcodeMap[variant.barcode]) barcodeMap[variant.barcode] = [];
        barcodeMap[variant.barcode].push({ productId: product.id, productTitle: product.title, productStatus, variantId: variant.id, variantTitle: variant.title });
      }
    }
  }

  const duplicateSKUs = Object.entries(skuMap)
    .filter(([, v]) => v.length > 1)
    .map(([sku, variants]) => ({ sku, variants }));

  const duplicateBarcodes = Object.entries(barcodeMap)
    .filter(([, v]) => v.length > 1)
    .map(([barcode, variants]) => ({ barcode, variants }));

  // Mark which products have duplicates (globally)
  const duplicateProductIds = new Set();
  [...duplicateSKUs, ...duplicateBarcodes].forEach(d => {
    (d.variants || []).forEach(v => duplicateProductIds.add(String(v.productId)));
  });

  // Filter products by requested status for display
  const filteredProducts = (status && status !== 'all')
    ? allProducts.filter(p => (p._computed_status || p.status) === status)
    : allProducts;

  // Enrich filtered products with cross-product duplicate flags
  const enriched = filteredProducts.map(p => ({
    ...p,
    hasDuplicate: duplicateProductIds.has(String(p.id)),
    variants: (p.variants || []).map(v => {
      const skuDups = v.sku ? (skuMap[v.sku] || []) : [];
      const barcodeDups = v.barcode ? (barcodeMap[v.barcode] || []) : [];
      const hasDuplicateSKU = skuDups.length > 1;
      const hasDuplicateBarcode = barcodeDups.length > 1;
      const crossProductSKU = hasDuplicateSKU && skuDups.some(d => String(d.productId) !== String(p.id));
      const crossProductBarcode = hasDuplicateBarcode && barcodeDups.some(d => String(d.productId) !== String(p.id));
      return {
        ...v,
        hasDuplicateSKU,
        hasDuplicateBarcode,
        crossProductSKU,
        crossProductBarcode,
        duplicateSKUProducts: crossProductSKU
          ? skuDups.filter(d => String(d.productId) !== String(p.id)).map(d => ({ title: d.productTitle, status: d.productStatus }))
          : [],
        duplicateBarcodeProducts: crossProductBarcode
          ? barcodeDups.filter(d => String(d.productId) !== String(p.id)).map(d => ({ title: d.productTitle, status: d.productStatus }))
          : [],
      };
    })
  }));

  res.json({
    products: enriched,
    summary: {
      total: filteredProducts.length,
      withDuplicates: enriched.filter(p => p.hasDuplicate).length,
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
 * POST /api/products/batch-update
 * Batch update products and variants in Shopify (local DB updated on next sync)
 */
router.post('/batch-update', requirePermission('write'), async (req, res) => {
  const { productUpdates = [], variantUpdates = [] } = req.body;

  if (!Array.isArray(productUpdates) || !Array.isArray(variantUpdates)) {
    return res.status(400).json({ error: 'productUpdates and variantUpdates must be arrays' });
  }

  const results = { products: [], variants: [], errors: [] };

  for (const { productId, changes } of productUpdates) {
    try {
      // productId here is the system PR... id; get shopify_product_id for API call
      const db = getDb();
      const row = db.prepare('SELECT shopify_product_id FROM products WHERE id = ?').get(productId);
      const shopifyId = row?.shopify_product_id || productId;
      const updateData = { id: shopifyId, ...changes };
      const updated = await updateProduct(shopifyId, updateData);
      results.products.push({ productId, success: true, updated });
    } catch (err) {
      const errMsg = err.response?.data?.errors || err.message;
      console.error(`Batch update product ${productId} error:`, errMsg);
      results.errors.push({ type: 'product', productId, error: errMsg });
    }
  }

  for (const { productId, variantId, changes } of variantUpdates) {
    try {
      // variantId here is the system V... id; get shopify_variant_id for API call
      const db = getDb();
      const row = db.prepare('SELECT shopify_variant_id FROM product_variants WHERE id = ?').get(variantId);
      const shopifyVariantId = row?.shopify_variant_id || variantId;
      const updateData = {};
      if (changes.sku !== undefined) updateData.sku = changes.sku;
      if (changes.barcode !== undefined) updateData.barcode = changes.barcode;
      if (changes.price !== undefined) updateData.price = changes.price;
      if (changes.compare_at_price !== undefined) updateData.compare_at_price = changes.compare_at_price;
      const updated = await updateVariant(shopifyVariantId, updateData);
      results.variants.push({ variantId, success: true, updated });
    } catch (err) {
      const errMsg = err.response?.data?.errors || err.message;
      console.error(`Batch update variant ${variantId} error:`, errMsg);
      results.errors.push({ type: 'variant', variantId, error: errMsg });
    }
  }

  if (results.errors.length > 0) {
    return res.status(207).json({
      success: false,
      message: `${results.errors.length} update(s) failed`,
      ...results
    });
  }

  res.json({ success: true, ...results });
});

/**
 * PUT /api/products/:productId/variants/:variantId
 * Update a single variant and sync back to Shopify
 */
router.put('/:productId/variants/:variantId', requirePermission('write'), async (req, res) => {
  const { variantId } = req.params;
  const { sku, barcode, price, compare_at_price } = req.body;

  try {
    const db = getDb();
    const row = db.prepare('SELECT shopify_variant_id FROM product_variants WHERE id = ?').get(variantId);
    const shopifyVariantId = row?.shopify_variant_id || variantId;

    const updateData = {};
    if (sku !== undefined) updateData.sku = sku;
    if (barcode !== undefined) updateData.barcode = barcode;
    if (price !== undefined) updateData.price = price;
    if (compare_at_price !== undefined) updateData.compare_at_price = compare_at_price;

    const updated = await updateVariant(shopifyVariantId, updateData);
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
    const db = getDb();
    const row = db.prepare('SELECT shopify_product_id FROM products WHERE id = ?').get(productId);
    const shopifyId = row?.shopify_product_id || productId;

    const updateData = { id: shopifyId };
    if (title !== undefined) updateData.title = title;
    if (vendor !== undefined) updateData.vendor = vendor;
    if (product_type !== undefined) updateData.product_type = product_type;
    if (tags !== undefined) updateData.tags = tags;
    if (status !== undefined) updateData.status = status;

    const updated = await updateProduct(shopifyId, updateData);
    res.json({ success: true, product: updated });
  } catch (err) {
    console.error('Update product error:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.errors || err.message });
  }
});

module.exports = router;
