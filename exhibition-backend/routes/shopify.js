const express = require('express');
const router = express.Router();
const shopifyService = require('../services/shopify');
const db = require('../db');
const { snowflakeId } = require('../utils/snowflake');
const { requireStaff } = require('../middleware/auth');

/**
 * GET /shopify/products
 * Return products from the local DB (populated by sync-products).
 * Supports ?status=active|draft|archived|all and ?search=keyword
 */
router.get('/products', (req, res) => {
  try {
    const { search, status, published_status } = req.query;

    // Determine effective status filter
    const effectiveStatus = published_status === 'unlisted' ? 'unlisted'
      : (status && status !== 'all' ? status : null);

    // Load all products with variants from local DB
    let productRows;
    if (effectiveStatus && effectiveStatus !== 'unlisted') {
      productRows = db.prepare(
        "SELECT * FROM products WHERE status = ? ORDER BY title"
      ).all(effectiveStatus);
    } else if (effectiveStatus === 'unlisted') {
      // unlisted = published_at IS NULL AND status = 'active'
      productRows = db.prepare(
        "SELECT * FROM products WHERE status = 'active' AND (published_at IS NULL OR published_at = '') ORDER BY title"
      ).all();
    } else {
      productRows = db.prepare(
        "SELECT * FROM products ORDER BY title"
      ).all();
    }

    // Apply keyword search (title)
    const kw = (search || '').trim().toLowerCase();
    if (kw) {
      productRows = productRows.filter(p => p.title && p.title.toLowerCase().includes(kw));
    }

    // Load variants for these products
    const productIds = productRows.map(p => p.id);
    let variantRows = [];
    if (productIds.length > 0) {
      const placeholders = productIds.map(() => '?').join(',');
      variantRows = db.prepare(
        `SELECT * FROM product_variants WHERE product_id IN (${placeholders})`
      ).all(...productIds);
    }

    // Group variants by product_id
    const variantsByProduct = {};
    for (const v of variantRows) {
      if (!variantsByProduct[v.product_id]) variantsByProduct[v.product_id] = [];
      variantsByProduct[v.product_id].push({
        id: v.shopify_variant_id,       // frontend expects Shopify variant ID as 'id'
        _db_id: v.id,
        title: v.variant_title,
        sku: v.sku || '',
        gtin: v.gtin || '',
        price: v.price,
        inventory_quantity: v.inventory_quantity || 0,
        image_url: v.image_url || null,
      });
    }

    // Build product objects matching the shape the frontend expects
    const products = productRows.map(p => ({
      id: p.shopify_product_id,         // frontend expects Shopify product ID as 'id'
      _db_id: p.id,
      title: p.title,
      vendor: p.vendor,
      product_type: p.product_type,
      status: p.status,
      handle: p.handle,
      tags: p.tags ? p.tags.split(',') : [],
      main_image: p.main_image,
      options: [],
      variants: variantsByProduct[p.id] || [],
    }));

    res.json({ success: true, data: products, total: products.length });
  } catch (err) {
    console.error('获取商品失败:', err.message);
    res.status(500).json({ success: false, message: '获取商品失败: ' + err.message });
  }
});

// 获取单个 Shopify 商品（仍从 Shopify API 获取最新数据）
router.get('/products/:id', async (req, res) => {
  try {
    const product = await shopifyService.getProduct(req.params.id);
    res.json({ success: true, data: product });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /shopify/sync-products
 * Fetch ALL products (active + draft + archived) from Shopify and upsert into
 * local products + product_variants tables.
 * Safe to call multiple times (upsert logic).
 */
router.post('/sync-products', requireStaff, async (req, res) => {
  try {
    // Fetch all statuses in parallel
    const [activeProducts, draftProducts, archivedProducts] = await Promise.all([
      shopifyService.getAllProducts({ status: 'active' }),
      shopifyService.getAllProducts({ status: 'draft' }),
      shopifyService.getAllProducts({ status: 'archived' }),
    ]);
    const allProducts = [...activeProducts, ...draftProducts, ...archivedProducts];

    const txn = db.transaction(() => {
      for (const p of allProducts) {
        const shopifyProductId = String(p.id);
        const mainImage = p.main_image || (p.images && p.images[0] ? p.images[0].src : null) || null;
        const tagsStr = Array.isArray(p.tags) ? p.tags.join(',') : (p.tags || '');

        const existing = db.prepare('SELECT id FROM products WHERE shopify_product_id = ?').get(shopifyProductId);
        let productId;

        if (existing) {
          productId = existing.id;
          db.prepare(`
            UPDATE products SET title = ?, vendor = ?, product_type = ?, status = ?,
              handle = ?, tags = ?, main_image = ?, updated_at = datetime('now')
            WHERE id = ?
          `).run(
            p.title, p.vendor || null, p.product_type || null, p.status,
            p.handle || null, tagsStr, mainImage, productId
          );
        } else {
          productId = snowflakeId();
          db.prepare(`
            INSERT INTO products (id, shopify_product_id, title, vendor, product_type, status, handle, tags, main_image)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            productId, shopifyProductId, p.title, p.vendor || null, p.product_type || null,
            p.status, p.handle || null, tagsStr, mainImage
          );
        }

        for (const v of (p.variants || [])) {
          const shopifyVariantId = String(v.id);
          const existingVariant = db.prepare('SELECT id FROM product_variants WHERE shopify_variant_id = ?').get(shopifyVariantId);
          const imageUrl = v.image_url || mainImage || null;
          const inventoryQty = v.inventory_quantity != null ? v.inventory_quantity : 0;

          if (existingVariant) {
            db.prepare(`
              UPDATE product_variants SET
                product_id = ?, shopify_product_id = ?, variant_title = ?, sku = ?,
                gtin = ?, price = ?, image_url = ?, inventory_quantity = ?,
                updated_at = datetime('now')
              WHERE id = ?
            `).run(
              productId, shopifyProductId, v.title, v.sku || null,
              v.gtin || null, v.price ? parseFloat(v.price) : null,
              imageUrl, inventoryQty, existingVariant.id
            );
          } else {
            db.prepare(`
              INSERT INTO product_variants
                (id, product_id, shopify_product_id, shopify_variant_id, variant_title, sku, gtin, price, image_url, inventory_quantity)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              snowflakeId(), productId, shopifyProductId, shopifyVariantId,
              v.title, v.sku || null, v.gtin || null,
              v.price ? parseFloat(v.price) : null, imageUrl, inventoryQty
            );
          }
        }
      }
    });

    txn();

    const variantCount = allProducts.reduce((sum, p) => sum + (p.variants?.length || 0), 0);
    const statusCounts = {
      active: activeProducts.length,
      draft: draftProducts.length,
      archived: archivedProducts.length,
    };
    res.json({ success: true, productCount: allProducts.length, variantCount, statusCounts });
  } catch (err) {
    console.error('sync-products error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
