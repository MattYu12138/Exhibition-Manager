const express = require('express');
const router = express.Router();
const shopifyService = require('../services/shopify');
const db = require('../db');
const { snowflakeId } = require('../utils/snowflake');
const { requireStaff } = require('../middleware/auth');

// 获取所有 Shopify 商品（支持 status 和 published_status 过滤）
// status: active | draft | archived
// published_status: unlisted（仅在 status=active 时有效）
router.get('/products', async (req, res) => {
  try {
    const { search, status, published_status } = req.query;
    let products;

    if (search) {
      products = await shopifyService.searchProducts(search, status || 'active', published_status || null);
    } else {
      const params = {};
      if (published_status === 'unlisted') {
        params.published_status = 'unlisted';
      } else {
        params.status = status || 'active';
      }
      products = await shopifyService.getAllProducts(params);
    }

    res.json({ success: true, data: products, total: products.length });
  } catch (err) {
    console.error('获取 Shopify 商品失败:', err.message);
    res.status(500).json({
      success: false,
      message: '获取 Shopify 商品失败: ' + err.message,
    });
  }
});

// 获取单个 Shopify 商品
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
 * Sync all active Shopify products into local products + product_variants tables.
 * Safe to call multiple times (upsert logic).
 */
router.post('/sync-products', requireStaff, async (req, res) => {
  try {
    const products = await shopifyService.getAllProducts({ status: 'active' });

    const txn = db.transaction(() => {
      for (const p of products) {
        const shopifyProductId = String(p.id);
        const existing = db.prepare('SELECT id FROM products WHERE shopify_product_id = ?').get(shopifyProductId);
        let productId;

        if (existing) {
          productId = existing.id;
          db.prepare(`
            UPDATE products SET title = ?, vendor = ?, product_type = ?, status = ?,
              handle = ?, tags = ?, raw_json = ?, cached_at = datetime('now')
            WHERE id = ?
          `).run(p.title, p.vendor || null, p.product_type || null, p.status,
                 p.handle || null, (p.tags || []).join(','), JSON.stringify(p), productId);
        } else {
          productId = snowflakeId();
          db.prepare(`
            INSERT INTO products (id, shopify_product_id, title, vendor, product_type, status, handle, tags, raw_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(productId, shopifyProductId, p.title, p.vendor || null, p.product_type || null,
                 p.status, p.handle || null, (p.tags || []).join(','), JSON.stringify(p));
        }

        for (const v of (p.variants || [])) {
          const shopifyVariantId = String(v.id);
          const existingVariant = db.prepare('SELECT id FROM product_variants WHERE shopify_variant_id = ?').get(shopifyVariantId);
          const imageUrl = v.image_url || p.main_image || null;

          if (existingVariant) {
            db.prepare(`
              UPDATE product_variants SET
                product_id = ?, variant_title = ?, sku = ?, gtin = ?, price = ?, image_url = ?
              WHERE id = ?
            `).run(productId, v.title, v.sku || null, v.gtin || null,
                   v.price ? String(v.price) : null, imageUrl, existingVariant.id);
          } else {
            db.prepare(`
              INSERT INTO product_variants (id, product_id, shopify_variant_id, variant_title, sku, gtin, price, image_url)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(snowflakeId(), productId, shopifyVariantId, v.title,
                   v.sku || null, v.gtin || null, v.price ? String(v.price) : null, imageUrl);
          }
        }
      }
    });

    txn();
    const variantCount = products.reduce((sum, p) => sum + (p.variants?.length || 0), 0);
    res.json({ success: true, productCount: products.length, variantCount });
  } catch (err) {
    console.error('sync-products error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
