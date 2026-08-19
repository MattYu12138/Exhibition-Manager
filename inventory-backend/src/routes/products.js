const express = require('express');
const { getDb } = require('../db');
const { requirePermission } = require('../middleware/auth');
const { fetchAllProducts, updateVariant, updateProduct } = require('../utils/shopify');
const squareService = require('../utils/square');

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

/**
 * POST /api/products/square-sync
 * Fetch Square catalog and store raw data into square_products table.
 * Writes a square_sync_log entry. Does NOT compare with Shopify data.
 */
router.post('/square-sync', requirePermission('write'), async (req, res) => {
  try {
    const catalog = await squareService.getAllCatalogItems(false); // bypass cache
    const db = getDb();

    // Replace all square_products with fresh data (full refresh)
    // Track removed variations for reporting
    const existingIds = new Set(db.prepare('SELECT id FROM square_products').all().map(r => r.id));
    const incomingIds = new Set();
    for (const item of catalog) {
      for (const variation of item.variations) {
        incomingIds.add(variation.id);
      }
    }
    const removedCount = [...existingIds].filter(id => !incomingIds.has(id)).length;
    if (removedCount > 0) {
      console.log(`Square sync: removing ${removedCount} deleted variation(s) from cache`);
    }

    const upsert = db.transaction(() => {
      db.prepare('DELETE FROM square_products').run();
      for (const item of catalog) {
        for (const variation of item.variations) {
          const sku = (variation.sku || '').trim() || null;
          const gtin = (variation.gtin || '').trim() || null;
          const priceAmount = variation.price_money?.amount ?? null;
          const priceCurrency = variation.price_money?.currency ?? 'AUD';
          db.prepare(`
            INSERT OR REPLACE INTO square_products
              (id, square_item_id, item_name, variation_name, sku, gtin, price_amount, price_currency, synced_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          `).run(
            variation.id,
            item.id,
            item.name,
            variation.name || null,
            sku,
            gtin,
            priceAmount,
            priceCurrency
          );
        }
      }
    });
    upsert();

    const itemCount = catalog.length;
    const variationCount = catalog.reduce((s, i) => s + i.variations.length, 0);
    db.prepare(`INSERT INTO square_sync_log (item_count, variation_count, status, message) VALUES (?, ?, 'success', 'Square sync completed')`)
      .run(itemCount, variationCount);

    res.json({ success: true, itemCount, variationCount, removedCount });
  } catch (err) {
    console.error('Square sync error:', err.message);
    try {
      const db = getDb();
      db.prepare(`INSERT INTO square_sync_log (item_count, variation_count, status, message) VALUES (0, 0, 'error', ?)`)
        .run(err.message);
    } catch (_) {}
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/products/square-last-sync
 * Returns the most recent square_sync_log entry.
 */
router.get('/square-last-sync', requirePermission('read'), (req, res) => {
  const db = getDb();
  const log = db.prepare('SELECT * FROM square_sync_log ORDER BY id DESC LIMIT 1').get();
  res.json(log || null);
});

/**
 * GET /api/products/square-products
 * Returns all Square products with duplicate analysis.
 */
router.get('/square-products', requirePermission('read'), (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM square_products ORDER BY item_name, variation_name').all();

  // Build SKU / GTIN maps for duplicate detection
  const skuMap = {};
  const gtinMap = {};
  for (const row of rows) {
    if (row.sku) {
      if (!skuMap[row.sku]) skuMap[row.sku] = [];
      skuMap[row.sku].push({ id: row.id, itemName: row.item_name, variationName: row.variation_name });
    }
    if (row.gtin) {
      if (!gtinMap[row.gtin]) gtinMap[row.gtin] = [];
      gtinMap[row.gtin].push({ id: row.id, itemName: row.item_name, variationName: row.variation_name });
    }
  }

  const duplicateSkus = Object.entries(skuMap).filter(([, v]) => v.length > 1).map(([sku, variations]) => ({ sku, variations }));
  const duplicateGtins = Object.entries(gtinMap).filter(([, v]) => v.length > 1).map(([gtin, variations]) => ({ gtin, variations }));

  const duplicateIds = new Set();
  [...duplicateSkus, ...duplicateGtins].forEach(d => d.variations.forEach(v => duplicateIds.add(v.id)));

  const enriched = rows.map(row => {
    const hasDuplicateSku = row.sku ? (skuMap[row.sku]?.length > 1) : false;
    const hasDuplicateGtin = row.gtin ? (gtinMap[row.gtin]?.length > 1) : false;
    // Conflict details: other variations sharing the same SKU/GTIN
    const duplicateSkuVariations = hasDuplicateSku
      ? (skuMap[row.sku] || []).filter(v => v.id !== row.id)
      : [];
    const duplicateGtinVariations = hasDuplicateGtin
      ? (gtinMap[row.gtin] || []).filter(v => v.id !== row.id)
      : [];
    return {
      ...row,
      hasDuplicate: duplicateIds.has(row.id),
      hasDuplicateSku,
      hasDuplicateGtin,
      duplicateSkuVariations,
      duplicateGtinVariations,
    };
  });

  res.json({
    products: enriched,
    summary: {
      total: rows.length,
      withDuplicates: enriched.filter(r => r.hasDuplicate).length,
      duplicateSkus: duplicateSkus.length,
      duplicateGtins: duplicateGtins.length,
    },
    duplicateSkus,
    duplicateGtins,
  });
});

/**
 * GET /api/products/cross-match/gtin-sku-mismatch
 * Returns pairs where GTIN matches between Shopify and Square but SKU differs.
 */
router.get('/cross-match/gtin-sku-mismatch', requirePermission('read'), (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      pv.id            AS shopify_variant_id,
      pv.shopify_variant_id AS shopify_raw_variant_id,
      pv.shopify_product_id,
      p.id             AS shopify_product_sys_id,
      p.title          AS shopify_product_title,
      pv.variant_title AS shopify_variant_title,
      pv.sku           AS shopify_sku,
      pv.gtin          AS shopify_gtin,
      sq.id            AS square_variation_id,
      sq.square_item_id,
      sq.item_name     AS square_item_name,
      sq.variation_name AS square_variation_name,
      sq.sku           AS square_sku,
      sq.gtin          AS square_gtin
    FROM product_variants pv
    JOIN products p ON pv.product_id = p.id
    JOIN square_products sq ON TRIM(pv.gtin) = TRIM(sq.gtin)
    WHERE pv.gtin IS NOT NULL AND pv.gtin != ''
      AND sq.gtin IS NOT NULL AND sq.gtin != ''
      AND TRIM(COALESCE(pv.sku,'')) != TRIM(COALESCE(sq.sku,''))
    ORDER BY p.title, pv.variant_title
  `).all();
  res.json({ success: true, items: rows, count: rows.length });
});

/**
 * GET /api/products/cross-match/sku-gtin-mismatch
 * Returns pairs where SKU matches between Shopify and Square but GTIN differs.
 */
router.get('/cross-match/sku-gtin-mismatch', requirePermission('read'), (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      pv.id            AS shopify_variant_id,
      pv.shopify_variant_id AS shopify_raw_variant_id,
      pv.shopify_product_id,
      p.id             AS shopify_product_sys_id,
      p.title          AS shopify_product_title,
      pv.variant_title AS shopify_variant_title,
      pv.sku           AS shopify_sku,
      pv.gtin          AS shopify_gtin,
      sq.id            AS square_variation_id,
      sq.square_item_id,
      sq.item_name     AS square_item_name,
      sq.variation_name AS square_variation_name,
      sq.sku           AS square_sku,
      sq.gtin          AS square_gtin
    FROM product_variants pv
    JOIN products p ON pv.product_id = p.id
    JOIN square_products sq ON TRIM(pv.sku) = TRIM(sq.sku)
    WHERE pv.sku IS NOT NULL AND pv.sku != ''
      AND sq.sku IS NOT NULL AND sq.sku != ''
      AND TRIM(COALESCE(pv.gtin,'')) != TRIM(COALESCE(sq.gtin,''))
    ORDER BY p.title, pv.variant_title
  `).all();
  res.json({ success: true, items: rows, count: rows.length });
});

/**
 * GET /api/products/cross-match/both-mismatch
 * Returns Shopify variants that match neither GTIN nor SKU in Square.
 * Each item includes a `candidates` list: Square products whose name contains
 * any keyword from the Shopify product title (fuzzy / keyword match).
 */
router.get('/cross-match/both-mismatch', requirePermission('read'), (req, res) => {
  const db = getDb();

  // All Shopify variants that have no GTIN match AND no SKU match in square_products
  const rows = db.prepare(`
    SELECT
      pv.id            AS shopify_variant_id,
      pv.shopify_variant_id AS shopify_raw_variant_id,
      pv.shopify_product_id,
      p.id             AS shopify_product_sys_id,
      p.title          AS shopify_product_title,
      pv.variant_title AS shopify_variant_title,
      pv.sku           AS shopify_sku,
      pv.gtin          AS shopify_gtin
    FROM product_variants pv
    JOIN products p ON pv.product_id = p.id
    WHERE
      -- No GTIN match in Square
      NOT EXISTS (
        SELECT 1 FROM square_products sq
        WHERE sq.gtin IS NOT NULL AND sq.gtin != ''
          AND TRIM(pv.gtin) = TRIM(sq.gtin)
      )
      -- No SKU match in Square
      AND NOT EXISTS (
        SELECT 1 FROM square_products sq
        WHERE sq.sku IS NOT NULL AND sq.sku != ''
          AND TRIM(pv.sku) = TRIM(sq.sku)
      )
      -- Only include variants that have at least sku or gtin (exclude completely empty)
      AND (pv.sku IS NOT NULL AND pv.sku != '' OR pv.gtin IS NOT NULL AND pv.gtin != '')
    ORDER BY p.title, pv.variant_title
  `).all();

  res.json({ success: true, items: rows, count: rows.length });
});

/**
 * POST /api/products/square-add-item
 * Add a Shopify product (with its variants) to Square as a new catalog item.
 * Body: { shopifyProductSysId }
 */
router.post('/square-add-item', requirePermission('write'), async (req, res) => {
  const { shopifyProductSysId } = req.body;
  if (!shopifyProductSysId) {
    return res.status(400).json({ error: 'shopifyProductSysId is required' });
  }
  try {
    const db = getDb();
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(shopifyProductSysId);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const variants = db.prepare(
      'SELECT * FROM product_variants WHERE product_id = ? ORDER BY id'
    ).all(shopifyProductSysId);
    if (variants.length === 0) return res.status(400).json({ error: 'No variants found' });

    const squareService = require('../utils/square');
    const locationId = squareService.locationId;

    // Build Square catalog object
    const itemId = `#new-item-${shopifyProductSysId}`;
    const variations = variants.map((v, i) => ({
      type: 'ITEM_VARIATION',
      id: `#var-${shopifyProductSysId}-${i}`,
      itemVariationData: {
        itemId,
        name: v.variant_title || 'Default',
        sku: v.sku || '',
        upc: v.gtin || '',
        pricingType: 'FIXED_PRICING',
        priceMoney: {
          amount: BigInt(Math.round((v.price || 0) * 100)),
          currency: 'AUD',
        },
        locationOverrides: locationId ? [{ locationId, trackInventory: true }] : [],
      },
    }));

    const upsertRes = await squareService.client.catalog.object.upsert({
      idempotencyKey: `add-item-${shopifyProductSysId}-${Date.now()}`,
      object: {
        type: 'ITEM',
        id: itemId,
        itemData: {
          name: product.title,
          description: product.description || '',
          variations,
        },
      },
    });

    squareService.invalidateCatalogCache();
    res.json({ success: true, squareItemId: upsertRes.catalogObject?.id });
  } catch (err) {
    console.error('square-add-item error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/products/square-compare
 * On-demand cross-match: compare square_products table with product_variants.
 * Returns matchedWithDiffs and unmatched (Square variations with no Shopify match).
 */
router.post('/square-compare', requirePermission('read'), async (req, res) => {
  try {
    const db = getDb();

    // Check if square_products has data
    const count = db.prepare('SELECT COUNT(*) as cnt FROM square_products').get();
    if (!count || count.cnt === 0) {
      return res.status(400).json({ error: 'Square data not synced yet. Please run Square sync first.' });
    }

    const allVariants = db.prepare(`
      SELECT pv.id, pv.shopify_variant_id, pv.shopify_product_id, pv.variant_title,
             pv.sku, pv.gtin, p.title as product_title, p.id as product_id
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
    `).all();

    const skuMap = {};
    const gtinMap = {};
    for (const v of allVariants) {
      if (v.sku) skuMap[v.sku.trim()] = v;
      if (v.gtin) gtinMap[v.gtin.trim()] = v;
    }

    const squareRows = db.prepare('SELECT * FROM square_products').all();
    const matched = [];
    const unmatched = [];

    for (const sq of squareRows) {
      const squareSkuRaw = (sq.sku || '').trim();
      const squareGtinRaw = (sq.gtin || '').trim();

      let shopifyVariant = null;
      let matchType = null;
      if (squareGtinRaw && gtinMap[squareGtinRaw]) {
        shopifyVariant = gtinMap[squareGtinRaw];
        matchType = 'gtin';
      } else if (squareSkuRaw && skuMap[squareSkuRaw]) {
        shopifyVariant = skuMap[squareSkuRaw];
        matchType = 'sku';
      }

      if (!shopifyVariant) {
        if (squareSkuRaw || squareGtinRaw) {
          unmatched.push({
            squareItemId: sq.square_item_id,
            squareItemName: sq.item_name,
            squareVariationId: sq.id,
            squareVariationName: sq.variation_name,
            squareSku: squareSkuRaw,
            squareGtin: squareGtinRaw,
          });
        }
        continue;
      }

      const diffs = [];
      const shopifySku = (shopifyVariant.sku || '').trim();
      const shopifyGtin = (shopifyVariant.gtin || '').trim();

      if (squareSkuRaw !== shopifySku) {
        diffs.push({ field: 'sku', shopifyValue: shopifySku, squareValue: squareSkuRaw });
      }
      if (squareGtinRaw !== shopifyGtin) {
        diffs.push({ field: 'gtin', shopifyValue: shopifyGtin, squareValue: squareGtinRaw });
      }

      if (diffs.length > 0) {
        matched.push({
          matchType,
          squareItemId: sq.square_item_id,
          squareItemName: sq.item_name,
          squareVariationId: sq.id,
          squareVariationName: sq.variation_name,
          squareSku: squareSkuRaw,
          squareGtin: squareGtinRaw,
          shopifyVariantId: shopifyVariant.id,
          shopifyShopifyVariantId: shopifyVariant.shopify_variant_id,
          shopifyProductId: shopifyVariant.product_id,
          shopifyProductTitle: shopifyVariant.product_title,
          shopifyVariantTitle: shopifyVariant.variant_title,
          shopifySku,
          shopifyGtin,
          diffs,
        });
      }
    }

    res.json({
      success: true,
      matchedWithDiffs: matched,
      unmatched,
      totalSquareVariations: squareRows.length,
    });
  } catch (err) {
    console.error('Square compare error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/products/square-batch-update
 * Commit Square-sourced staged changes:
 *   items: [{ shopifyVariantId, squareVariationId, target: 'shopify'|'square'|'both', ... }]
 * - target='shopify': keep Shopify values → update Square with Shopify values
 * - target='square': keep Square values → update Shopify with Square values
 * - target='both': use manualSku/manualGtin to update both Shopify and Square
 *
 * NOTE: target means "the source of truth to keep", not "the platform to update".
 * Keeping Shopify → Square gets updated. Keeping Square → Shopify gets updated.
 */
router.post('/square-batch-update', requirePermission('write'), async (req, res) => {
  const { items = [] } = req.body;
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'items must be an array' });
  }

  const results = [];
  const errors = [];

  for (const item of items) {
    const { shopifyVariantId, squareVariationId, target, manualSku, manualGtin, shopifyShopifyVariantId } = item;
    try {
      const db = getDb();
      const varRow = db.prepare('SELECT shopify_variant_id, sku, gtin FROM product_variants WHERE id = ?').get(shopifyVariantId);
      const realShopifyVariantId = shopifyShopifyVariantId || varRow?.shopify_variant_id || shopifyVariantId;

      let finalSku, finalGtin;

      if (target === 'both') {
        // Manual input: update both platforms with user-provided values
        finalSku = manualSku;
        finalGtin = manualGtin;
      } else if (target === 'shopify') {
        // Keep Shopify → update Square with Shopify values
        finalSku = item.shopifySku;
        finalGtin = item.shopifyGtin;
      } else if (target === 'square') {
        // Keep Square → update Shopify with Square values
        finalSku = item.squareSku;
        finalGtin = item.squareGtin;
      } else if (target === 'square-direct') {
        // Direct Square-only edit: update Square with user-provided values, no Shopify update
        finalSku = item.newSku;
        finalGtin = item.newGtin;
      } else {
        throw new Error(`Unknown target: ${target}`);
      }

      // Update Shopify if needed (when keeping Square or manual input)
      if (target === 'square' || target === 'both') {
        const shopifyUpdate = {};
        if (finalSku !== undefined) shopifyUpdate.sku = finalSku;
        if (finalGtin !== undefined) shopifyUpdate.barcode = finalGtin;
        await updateVariant(realShopifyVariantId, shopifyUpdate);

        // Update local DB
        db.prepare('UPDATE product_variants SET sku = ?, gtin = ?, updated_at = datetime(\'now\') WHERE id = ?')
          .run(finalSku ?? varRow?.sku, finalGtin ?? varRow?.gtin, shopifyVariantId);
      }

      // Update Square if needed (when keeping Shopify, manual input, or direct edit)
      if (target === 'shopify' || target === 'both' || target === 'square-direct') {
        const squareUpdate = {};
        if (finalSku !== undefined) squareUpdate.sku = finalSku;
        if (finalGtin !== undefined) squareUpdate.gtin = finalGtin;
        await squareService.updateVariationSkuGtin(squareVariationId, squareUpdate);

        // Also update local square_products table for direct edits
        if (target === 'square-direct') {
          const db2 = getDb();
          db2.prepare('UPDATE square_products SET sku = ?, gtin = ? WHERE id = ?')
            .run(finalSku ?? null, finalGtin ?? null, squareVariationId);
        }
      }

      results.push({ shopifyVariantId, squareVariationId, success: true, target });
    } catch (err) {
      console.error(`Square batch update error [${shopifyVariantId}]:`, err.message);
      errors.push({ shopifyVariantId, squareVariationId, error: err.message });
    }
  }

  if (errors.length > 0) {
    return res.status(207).json({ success: false, results, errors });
  }
  res.json({ success: true, results });
});

/**
 * GET /api/products/square-search?q=keyword
 * Search Square products by keyword in item_name or variation_name.
 * Returns grouped items with their variations.
 */
router.get('/square-search', requirePermission('read'), (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();
  if (!q || q.length < 2) return res.json({ success: true, items: [] });
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT square_item_id, item_name, id AS variation_id, variation_name,
             sku, gtin, price_amount AS price
      FROM square_products
      WHERE LOWER(item_name) LIKE ? OR LOWER(variation_name) LIKE ?
      ORDER BY item_name, variation_name
      LIMIT 50
    `).all(`%${q}%`, `%${q}%`);

    // Group by item
    const itemMap = {};
    for (const row of rows) {
      if (!itemMap[row.square_item_id]) {
        itemMap[row.square_item_id] = { item_id: row.square_item_id, item_name: row.item_name, variations: [] };
      }
      itemMap[row.square_item_id].variations.push({
        variation_id: row.variation_id,
        variation_name: row.variation_name,
        sku: row.sku || '',
        gtin: row.gtin || '',
        price: row.price,
      });
    }
    res.json({ success: true, items: Object.values(itemMap) });
  } catch (err) {
    console.error('square-search error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Shopify → Square 批量导入（异步任务模式，10 条/批）
// ─────────────────────────────────────────────────────────────────────────────
const crypto = require('crypto');
const importTasks = new Map();

// 自动清理已完成超过 30 分钟的任务
setInterval(() => {
  const now = Date.now();
  for (const [id, task] of importTasks) {
    if ((task.status === 'completed' || task.status === 'failed') && (now - task.updatedAt > 30 * 60 * 1000)) {
      importTasks.delete(id);
    }
  }
}, 5 * 60 * 1000);

/**
 * POST /api/products/shopify-to-square-compare
 * Compare Shopify products with Square catalog.
 * Returns: matched (already in Square), unmatched (not in Square), partialMatch (name similar but SKU/GTIN differ)
 */
router.post('/shopify-to-square-compare', requirePermission('read'), async (req, res) => {
  try {
    const db = getDb();

    // Check if square_products has data
    const count = db.prepare('SELECT COUNT(*) as cnt FROM square_products').get();
    if (!count || count.cnt === 0) {
      return res.status(400).json({ error: 'Square data not synced yet. Please run Square sync first.' });
    }

    // Get all Shopify products with variants
    const allProducts = db.prepare('SELECT * FROM products ORDER BY title').all();
    const allVariants = db.prepare('SELECT * FROM product_variants').all();
    const variantsByProduct = {};
    for (const v of allVariants) {
      if (!variantsByProduct[v.product_id]) variantsByProduct[v.product_id] = [];
      variantsByProduct[v.product_id].push(v);
    }

    // Get all Square products
    const squareRows = db.prepare('SELECT * FROM square_products').all();
    const squareSkuSet = new Set();
    const squareGtinSet = new Set();
    const squareNameMap = {}; // lowercase item_name -> [variations]
    for (const sq of squareRows) {
      if (sq.sku && sq.sku.trim()) squareSkuSet.add(sq.sku.trim());
      if (sq.gtin && sq.gtin.trim()) squareGtinSet.add(sq.gtin.trim());
      const nameKey = (sq.item_name || '').toLowerCase().trim();
      if (!squareNameMap[nameKey]) squareNameMap[nameKey] = [];
      squareNameMap[nameKey].push(sq);
    }

    const matched = [];      // Shopify products fully matched in Square
    const unmatched = [];    // Shopify products NOT in Square at all
    const partialMatch = []; // Name matches but SKU/GTIN differ

    for (const product of allProducts) {
      const variants = variantsByProduct[product.id] || [];
      if (variants.length === 0) continue;

      // Check if ANY variant matches Square by SKU or GTIN
      let hasFullMatch = false;
      let hasPartialMatch = false;
      const unmatchedVariants = [];

      for (const v of variants) {
        const sku = (v.sku || '').trim();
        const gtin = (v.gtin || '').trim();
        const matchedBySku = sku && squareSkuSet.has(sku);
        const matchedByGtin = gtin && squareGtinSet.has(gtin);

        if (matchedBySku || matchedByGtin) {
          hasFullMatch = true;
        } else {
          unmatchedVariants.push(v);
        }
      }

      if (hasFullMatch && unmatchedVariants.length === 0) {
        // All variants matched
        matched.push({ product_id: product.id, title: product.title, variant_count: variants.length });
      } else if (unmatchedVariants.length > 0) {
        // Check if product name matches a Square item (partial match)
        const nameKey = (product.title || '').toLowerCase().trim();
        const nameMatches = squareNameMap[nameKey] || [];

        if (nameMatches.length > 0 && hasFullMatch) {
          // Some variants match, some don't — partial match
          partialMatch.push({
            product_id: product.id,
            title: product.title,
            main_image: product.main_image,
            total_variants: variants.length,
            matched_variants: variants.length - unmatchedVariants.length,
            unmatched_variants: unmatchedVariants.map(v => ({
              id: v.id,
              variant_title: v.variant_title,
              sku: v.sku,
              gtin: v.gtin,
              price: v.price,
            })),
            square_candidates: nameMatches.slice(0, 5).map(sq => ({
              variation_id: sq.id,
              item_name: sq.item_name,
              variation_name: sq.variation_name,
              sku: sq.sku,
              gtin: sq.gtin,
            })),
          });
        } else if (!hasFullMatch) {
          // No variant matches at all
          // Check name similarity for partial match hint
          if (nameMatches.length > 0) {
            partialMatch.push({
              product_id: product.id,
              title: product.title,
              main_image: product.main_image,
              total_variants: variants.length,
              matched_variants: 0,
              unmatched_variants: variants.map(v => ({
                id: v.id,
                variant_title: v.variant_title,
                sku: v.sku,
                gtin: v.gtin,
                price: v.price,
              })),
              square_candidates: nameMatches.slice(0, 5).map(sq => ({
                variation_id: sq.id,
                item_name: sq.item_name,
                variation_name: sq.variation_name,
                sku: sq.sku,
                gtin: sq.gtin,
              })),
            });
          } else {
            // Completely unmatched — ready to create in Square
            unmatched.push({
              product_id: product.id,
              title: product.title,
              main_image: product.main_image,
              description: product.description || '',
              variants: variants.map(v => ({
                id: v.id,
                variant_title: v.variant_title,
                sku: v.sku,
                gtin: v.gtin,
                price: v.price,
                image_url: v.image_url,
              })),
            });
          }
        }
      }
    }

    res.json({
      success: true,
      summary: {
        total_shopify: allProducts.length,
        total_square: squareRows.length,
        matched: matched.length,
        unmatched: unmatched.length,
        partial_match: partialMatch.length,
      },
      matched,
      unmatched,
      partialMatch,
    });
  } catch (err) {
    console.error('shopify-to-square-compare error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/products/shopify-to-square-import
 * Start async batch import of Shopify products to Square.
 * Body: { products: [{ product_id, title, variants: [...] }] }
 * Processes 10 products per batch with 1.5s delay between batches.
 * Returns task_id for progress polling.
 */
router.post('/shopify-to-square-import', requirePermission('write'), async (req, res) => {
  try {
    const { products } = req.body;
    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: 'products array is required and must not be empty' });
    }

    const taskId = crypto.randomUUID();
    const task = {
      id: taskId,
      status: 'running',
      total: products.length,
      completed: 0,
      succeeded: 0,
      failed: 0,
      currentItem: '',
      message: 'Initializing...',
      results: [],
      errors: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    importTasks.set(taskId, task);

    res.json({ success: true, task_id: taskId, message: 'Import task started' });

    // Background async execution
    (async () => {
      try {
        const db = getDb();
        const locationId = squareService.locationId;
        const BATCH_SIZE = 10;
        const BATCH_DELAY_MS = 1500;

        for (let i = 0; i < products.length; i += BATCH_SIZE) {
          const batch = products.slice(i, i + BATCH_SIZE);

          for (const product of batch) {
            task.currentItem = product.title;
            task.message = `Importing: ${product.title} (${task.completed + 1}/${task.total})`;
            task.updatedAt = Date.now();

            try {
              // Get variants from DB if not provided in request
              let variants = product.variants;
              if (!variants || variants.length === 0) {
                variants = db.prepare(
                  'SELECT * FROM product_variants WHERE product_id = ? ORDER BY id'
                ).all(product.product_id).map(v => ({
                  variant_title: v.variant_title,
                  sku: v.sku,
                  gtin: v.gtin,
                  price: v.price,
                }));
              }

              if (variants.length === 0) {
                task.errors.push({ product_id: product.product_id, title: product.title, error: 'No variants' });
                task.failed++;
                task.completed++;
                continue;
              }

              const itemId = `#import-item-${product.product_id}-${Date.now()}`;
              const squareVariations = variants.map((v, idx) => ({
                type: 'ITEM_VARIATION',
                id: `#import-var-${product.product_id}-${idx}`,
                itemVariationData: {
                  itemId,
                  name: v.variant_title || 'Default',
                  sku: v.sku || '',
                  upc: v.gtin || '',
                  pricingType: 'FIXED_PRICING',
                  priceMoney: { amount: BigInt(Math.round((v.price || 0) * 100)), currency: 'AUD' },
                  locationOverrides: locationId ? [{ locationId, trackInventory: true }] : [],
                },
              }));

              const upsertRes = await squareService.client.catalog.object.upsert({
                idempotencyKey: `import-${product.product_id}-${Date.now()}`,
                object: {
                  type: 'ITEM',
                  id: itemId,
                  itemData: {
                    name: product.title,
                    description: product.description || '',
                    variations: squareVariations,
                  },
                },
              });

              task.results.push({
                product_id: product.product_id,
                title: product.title,
                variant_count: variants.length,
                squareItemId: upsertRes.catalogObject?.id,
              });
              task.succeeded++;
            } catch (err) {
              task.errors.push({ product_id: product.product_id, title: product.title, error: err.message });
              task.failed++;
            }

            task.completed++;
            task.updatedAt = Date.now();
          }

          // Delay between batches (except for the last batch)
          if (i + BATCH_SIZE < products.length) {
            task.message = `Batch complete. Waiting before next batch... (${task.completed}/${task.total})`;
            task.updatedAt = Date.now();
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
          }
        }

        task.status = 'completed';
        task.message = `Import complete: ${task.succeeded} succeeded, ${task.failed} failed`;
        task.updatedAt = Date.now();

        // Invalidate Square catalog cache after import
        squareService.invalidateCatalogCache();
      } catch (err) {
        task.status = 'failed';
        task.message = `Import failed: ${err.message}`;
        task.updatedAt = Date.now();
      }
    })();
  } catch (err) {
    console.error('shopify-to-square-import error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/products/shopify-to-square-task/:taskId
 * Poll import task progress.
 */
router.get('/shopify-to-square-task/:taskId', requirePermission('read'), (req, res) => {
  const task = importTasks.get(req.params.taskId);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }
  res.json({
    success: true,
    task_id: task.id,
    status: task.status,
    total: task.total,
    completed: task.completed,
    succeeded: task.succeeded,
    failed: task.failed,
    currentItem: task.currentItem,
    message: task.message,
    results: task.status === 'completed' ? task.results : undefined,
    errors: task.errors.length > 0 ? task.errors : undefined,
  });
});

/**
 * POST /api/products/bulk-add-to-square
 * (Legacy) Add ALL unmatched Shopify products to Square in one go.
 * Kept for backward compatibility but prefer shopify-to-square-import for batched mode.
 */
router.post('/bulk-add-to-square', requirePermission('write'), async (req, res) => {
  try {
    const db = getDb();
    const unmatchedProducts = db.prepare(`
      SELECT DISTINCT p.id AS product_id, p.title, p.description
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      WHERE
        NOT EXISTS (
          SELECT 1 FROM square_products sq
          WHERE sq.gtin IS NOT NULL AND sq.gtin != ''
            AND TRIM(pv.gtin) = TRIM(sq.gtin)
        )
        AND NOT EXISTS (
          SELECT 1 FROM square_products sq
          WHERE sq.sku IS NOT NULL AND sq.sku != ''
            AND TRIM(pv.sku) = TRIM(sq.sku)
        )
        AND (pv.sku IS NOT NULL AND pv.sku != '' OR pv.gtin IS NOT NULL AND pv.gtin != '')
      ORDER BY p.title
    `).all();

    const locationId = squareService.locationId;
    const results = [];
    const errors = [];

    for (const product of unmatchedProducts) {
      const variants = db.prepare(
        'SELECT * FROM product_variants WHERE product_id = ? ORDER BY id'
      ).all(product.product_id);
      if (variants.length === 0) continue;

      const itemId = `#bulk-item-${product.product_id}`;
      const variations = variants.map((v, i) => ({
        type: 'ITEM_VARIATION',
        id: `#bulk-var-${product.product_id}-${i}`,
        itemVariationData: {
          itemId,
          name: v.variant_title || 'Default',
          sku: v.sku || '',
          upc: v.gtin || '',
          pricingType: 'FIXED_PRICING',
          priceMoney: { amount: BigInt(Math.round((v.price || 0) * 100)), currency: 'AUD' },
          locationOverrides: locationId ? [{ locationId, trackInventory: true }] : [],
        },
      }));

      try {
        const upsertRes = await squareService.client.catalog.object.upsert({
          idempotencyKey: `bulk-add-${product.product_id}-${Date.now()}`,
          object: {
            type: 'ITEM',
            id: itemId,
            itemData: {
              name: product.title,
              description: product.description || '',
              variations,
            },
          },
        });
        results.push({ product_id: product.product_id, title: product.title, squareItemId: upsertRes.catalogObject?.id });
      } catch (err) {
        errors.push({ product_id: product.product_id, title: product.title, error: err.message });
      }
    }

    squareService.invalidateCatalogCache();
    res.json({ success: true, added: results.length, failed: errors.length, results, errors });
  } catch (err) {
    console.error('bulk-add-to-square error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
