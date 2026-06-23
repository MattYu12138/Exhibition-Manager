/**
 * 新商品录入 API
 * POST /api/new-product/create   — 创建商品到 Shopify
 * POST /api/new-product/validate — 验证数据格式
 */
const express = require('express');
const router = express.Router();
const axios = require('axios');



const API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-10';

/**
 * POST /api/new-product/validate
 * Body: { products: [ { title, body_html, vendor, product_type, tags, status, variants: [...], images: [...] } ] }
 * 验证数据是否符合 Shopify 商品格式
 */
router.post('/validate', (req, res) => {
  const { products } = req.body;
  if (!Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ success: false, message: '缺少商品数据' });
  }

  const errors = [];

  products.forEach((product, pIdx) => {
    // 必填字段检查
    if (!product.title || !product.title.trim()) {
      errors.push({ row: pIdx + 1, field: 'Title', message: '商品标题不能为空' });
    }

    // Variants 检查
    if (!product.variants || product.variants.length === 0) {
      errors.push({ row: pIdx + 1, field: 'Variants', message: '至少需要一个变体' });
    } else {
      product.variants.forEach((v, vIdx) => {
        if (v.price !== undefined && v.price !== '' && isNaN(Number(v.price))) {
          errors.push({ row: pIdx + 1, variant: vIdx + 1, field: 'Variant Price', message: '价格必须为数字' });
        }
        if (v.compare_at_price && isNaN(Number(v.compare_at_price))) {
          errors.push({ row: pIdx + 1, variant: vIdx + 1, field: 'Variant Compare At Price', message: '对比价格必须为数字' });
        }
        if (v.grams && isNaN(Number(v.grams))) {
          errors.push({ row: pIdx + 1, variant: vIdx + 1, field: 'Variant Grams', message: '重量必须为数字' });
        }
      });
    }

    // Status 检查
    if (product.status && !['active', 'draft', 'archived'].includes(product.status)) {
      errors.push({ row: pIdx + 1, field: 'Status', message: '状态必须为 active、draft 或 archived' });
    }
  });

  if (errors.length > 0) {
    return res.json({ success: false, valid: false, errors });
  }

  res.json({ success: true, valid: true, message: `${products.length} 个商品数据验证通过` });
});

/**
 * POST /api/new-product/create
 * Body: { products: [ { title, body_html, vendor, product_type, tags, status, variants: [...], images: [...] } ] }
 * 批量创建商品到 Shopify
 */
router.post('/create', async (req, res) => {
  const { products } = req.body;
  if (!Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ success: false, message: '缺少商品数据' });
  }

  const results = [];

  for (const product of products) {
    try {
      const domain = getStoreDomain();
      const baseURL = `https://${domain}/admin/api/${API_VERSION}`;
      const headers = await getHeaders();
      
      // 构建 Shopify 商品数据
      const shopifyProduct = {
        title: product.title,
        body_html: product.body_html || '',
        vendor: product.vendor || '',
        product_type: product.product_type || '',
        tags: product.tags || '',
        status: product.status || 'draft',
        variants: (product.variants || []).map(v => ({
          option1: v.option1 || 'Default Title',
          option2: v.option2 || undefined,
          option3: v.option3 || undefined,
          sku: v.sku || '',
          barcode: v.barcode || '',
          price: v.price || '0.00',
          compare_at_price: v.compare_at_price || undefined,
          grams: v.grams ? Number(v.grams) : undefined,
          weight_unit: v.weight_unit || 'g',
          inventory_management: v.inventory_management || 'shopify',
          inventory_policy: v.inventory_policy || 'deny',
          fulfillment_service: v.fulfillment_service || 'manual',
          requires_shipping: v.requires_shipping !== false,
          taxable: v.taxable !== false,
          cost: v.cost || undefined,
        })),
        options: product.options || undefined,
        images: (product.images || []).map(img => ({
          src: img.src,
          alt: img.alt || '',
          position: img.position || undefined,
        })),
      };

      // 如果有 option names，设置 options
      if (product.option1_name) {
        shopifyProduct.options = [{ name: product.option1_name }];
        if (product.option2_name) shopifyProduct.options.push({ name: product.option2_name });
        if (product.option3_name) shopifyProduct.options.push({ name: product.option3_name });
      }

      const response = await axios.post(
        `${baseURL}/products.json`,
        { product: shopifyProduct },
        { headers }
      );

      results.push({
        title: product.title,
        status: 'created',
        shopify_id: response.data.product.id,
        handle: response.data.product.handle,
        variants_count: response.data.product.variants.length,
      });
    } catch (err) {
      const errMsg = err.response?.data?.errors
        ? JSON.stringify(err.response.data.errors)
        : err.message;
      results.push({
        title: product.title,
        status: 'error',
        message: errMsg,
      });
    }
  }

  const successCount = results.filter(r => r.status === 'created').length;
  const failCount = results.filter(r => r.status === 'error').length;

  res.json({
    success: true,
    data: results,
    summary: { created: successCount, failed: failCount, total: products.length },
  });
});

/**
 * Helper: get Shopify Access Token (reuse logic from shopify.js)
 */
async function getAccessToken() {
  if (process.env.SHOPIFY_ACCESS_TOKEN) {
    return process.env.SHOPIFY_ACCESS_TOKEN;
  }
  const shop = process.env.SHOPIFY_SHOP;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!shop || !clientId || !clientSecret) {
    throw new Error('缺少 Shopify 认证配置');
  }
  const { URLSearchParams } = require('url');
  const response = await fetch(
    `https://${shop}.myshopify.com/admin/oauth/access_token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
    }
  );
  if (!response.ok) throw new Error(`Shopify Token 获取失败 (${response.status})`);
  const data = await response.json();
  return data.access_token;
}

function getStoreDomain() {
  if (process.env.SHOPIFY_STORE) {
    const store = process.env.SHOPIFY_STORE;
    return store.includes('.myshopify.com') ? store : `${store}.myshopify.com`;
  }
  if (process.env.SHOPIFY_SHOP) return `${process.env.SHOPIFY_SHOP}.myshopify.com`;
  throw new Error('缺少 SHOPIFY_STORE 或 SHOPIFY_SHOP 环境变量');
}

async function getHeaders() {
  const token = await getAccessToken();
  return { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' };
}

module.exports = router;
