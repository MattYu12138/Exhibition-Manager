/**
 * Shopify 工具函数（inventory-backend）
 * 支持两种认证方式（自动选择）：
 *   1. SHOPIFY_ACCESS_TOKEN 已填写 → 直接使用（兼容旧版 Legacy App）
 *   2. SHOPIFY_SHOP + SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET → client_credentials grant 自动换取 Token
 */
const axios = require('axios');
const { URLSearchParams } = require('url');

// 2025-10+ 原生支持 unlisted 状态（旧版本 2024-01 会把 unlisted 商品返回为 active）
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-10';

// Token 缓存（用于 client_credentials grant）
let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * 获取有效的 Shopify Access Token
 */
async function getAccessToken() {
  // 优先使用静态 Token（Legacy App 或手动填写的 Token）
  if (process.env.SHOPIFY_ACCESS_TOKEN) {
    return process.env.SHOPIFY_ACCESS_TOKEN;
  }

  // 使用 client_credentials grant（Dev Dashboard App）
  const shop = process.env.SHOPIFY_SHOP;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  if (!shop || !clientId || !clientSecret) {
    throw new Error(
      '缺少 Shopify 认证配置。请在 .env 中填写以下任一组合：\n' +
      '  方式1（旧版）: SHOPIFY_ACCESS_TOKEN\n' +
      '  方式2（Dev Dashboard App）: SHOPIFY_SHOP + SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET'
    );
  }

  // 距离过期还有 60 秒以上则返回缓存
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  // POST 换取新 Token
  const response = await fetch(
    `https://${shop}.myshopify.com/admin/oauth/access_token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Shopify Token 获取失败 (${response.status}): ${text}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
  return cachedToken;
}

/**
 * 获取 Shopify 请求 headers
 */
async function getHeaders() {
  const token = await getAccessToken();
  return {
    'X-Shopify-Access-Token': token,
    'Content-Type': 'application/json',
  };
}

/**
 * 获取 Shopify store 域名
 */
function getStoreDomain() {
  if (process.env.SHOPIFY_STORE) {
    const store = process.env.SHOPIFY_STORE;
    return store.includes('.myshopify.com') ? store : `${store}.myshopify.com`;
  }
  if (process.env.SHOPIFY_SHOP) {
    return `${process.env.SHOPIFY_SHOP}.myshopify.com`;
  }
  throw new Error('缺少 SHOPIFY_STORE 或 SHOPIFY_SHOP 环境变量');
}

/**
 * Fetch products from Shopify for a given status with pagination
 * API 2025-10+ 原生支持 status=unlisted
 */
async function fetchProductsByStatus(baseURL, statusParam) {
  const products = [];
  const fields = 'id,title,vendor,product_type,status,handle,tags,variants,published_at';
  let url = `${baseURL}/products.json?limit=250&fields=${fields}&status=${statusParam}`;
  while (url) {
    const headers = await getHeaders();
    const res = await axios.get(url, { headers });
    products.push(...res.data.products);
    const linkHeader = res.headers['link'];
    url = null;
    if (linkHeader) {
      const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (match) url = match[1];
    }
  }
  return products;
}

/**
 * Fetch ALL products from Shopify (active, draft, archived, unlisted)
 * Each product gets a _computed_status field for frontend filtering.
 * Requires API version 2025-10+ for native unlisted status support.
 */
async function fetchAllProducts() {
  const domain = getStoreDomain();
  const baseURL = `https://${domain}/admin/api/${API_VERSION}`;

  // Fetch all four statuses in parallel (2025-10+ supports status=unlisted natively)
  const [activeProducts, draftProducts, archivedProducts, unlistedProducts] = await Promise.all([
    fetchProductsByStatus(baseURL, 'active'),
    fetchProductsByStatus(baseURL, 'draft'),
    fetchProductsByStatus(baseURL, 'archived'),
    fetchProductsByStatus(baseURL, 'unlisted'),
  ]);

  return [
    ...activeProducts.map(p => ({ ...p, _computed_status: 'active' })),
    ...draftProducts.map(p => ({ ...p, _computed_status: 'draft' })),
    ...archivedProducts.map(p => ({ ...p, _computed_status: 'archived' })),
    ...unlistedProducts.map(p => ({ ...p, _computed_status: 'unlisted' })),
  ];
}

/**
 * Update a product variant on Shopify
 */
async function updateVariant(variantId, data) {
  const domain = getStoreDomain();
  const baseURL = `https://${domain}/admin/api/${API_VERSION}`;
  const headers = await getHeaders();
  const res = await axios.put(`${baseURL}/variants/${variantId}.json`, { variant: data }, { headers });
  return res.data.variant;
}

/**
 * Update a product on Shopify
 */
async function updateProduct(productId, data) {
  const domain = getStoreDomain();
  const baseURL = `https://${domain}/admin/api/${API_VERSION}`;
  const headers = await getHeaders();
  const res = await axios.put(`${baseURL}/products/${productId}.json`, { product: data }, { headers });
  return res.data.product;
}

module.exports = { fetchAllProducts, updateVariant, updateProduct };
