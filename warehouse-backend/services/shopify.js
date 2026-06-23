/**
 * Shopify 服务
 * 支持两种认证方式（自动选择）：
 *   1. SHOPIFY_ACCESS_TOKEN 已填写 → 直接使用（兼容旧版 Legacy App）
 *   2. SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET 已填写 → client_credentials grant 自动换取 Token
 *      参考：https://shopify.dev/docs/apps/build/dev-dashboard/get-api-access-tokens
 */

const axios = require('axios');
const { URLSearchParams } = require('url');

// Token 缓存（用于 client_credentials grant）
let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * 获取有效的 Shopify Access Token
 * 优先使用 .env 中的静态 Token，否则使用 client_credentials grant 动态获取
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

  // POST 换取新 Token（官方文档方式）
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

  const { access_token, expires_in } = await response.json();
  cachedToken = access_token;
  tokenExpiresAt = Date.now() + expires_in * 1000;

  console.log(`[Shopify] Token 获取成功，有效期 ${expires_in} 秒`);
  return cachedToken;
}

class ShopifyService {
  constructor() {
    // 商店域名：优先 SHOPIFY_STORE_DOMAIN（旧版），其次 SHOPIFY_SHOP（新版）
    const shopDomain = process.env.SHOPIFY_STORE_DOMAIN ||
      (process.env.SHOPIFY_SHOP ? `${process.env.SHOPIFY_SHOP}.myshopify.com` : null);

    this.domain = shopDomain;
    this.apiVersion = '2025-10';
    this.baseUrl = `https://${this.domain}/admin/api/${this.apiVersion}`;
  }

  /**
   * 获取带认证头的请求配置
   */
  async _getHeaders() {
    const token = await getAccessToken();
    return {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
    };
  }

  /**
   * 获取所有商品（含变体、GTIN、图片）
   * 支持分页，自动拉取全部数据
   * @param {object} params - 额外查询参数，如 { status: 'draft' } 或 { published_status: 'unlisted' }
   */
  async getAllProducts(params = {}) {
    const products = [];
    let pageInfo = null;
    let hasMore = true;

    // API 2025-10+ 原生支持 status=unlisted，无需旧的 published_status 变通方案
    const baseParams = {
      limit: 250,
      fields: 'id,title,variants,images,options,status,published_at',
      status: params.status || 'active',
    };

    while (hasMore) {
      const headers = await this._getHeaders();

      if (pageInfo) {
        const url = `${this.baseUrl}/products.json?limit=250&page_info=${pageInfo}`;
        const response = await axios.get(url, { headers });
        products.push(...response.data.products);

        const linkHeader = response.headers['link'];
        if (linkHeader && linkHeader.includes('rel="next"')) {
          const match = linkHeader.match(/page_info=([^&>]+).*rel="next"/);
          pageInfo = match ? match[1] : null;
          hasMore = !!pageInfo;
        } else {
          hasMore = false;
        }
      } else {
        const queryParams = new URLSearchParams(baseParams);
        const url = `${this.baseUrl}/products.json?${queryParams.toString()}`;
        const response = await axios.get(url, { headers });
        products.push(...response.data.products);

        const linkHeader = response.headers['link'];
        if (linkHeader && linkHeader.includes('rel="next"')) {
          const match = linkHeader.match(/page_info=([^&>]+).*rel="next"/);
          pageInfo = match ? match[1] : null;
          hasMore = !!pageInfo;
        } else {
          hasMore = false;
        }
      }
    }

    return this._formatProducts(products);
  }

  /**
   * 搜索商品（按标题关键词），支持 status 过滤
   */
  async searchProducts(query, status = 'active', publishedStatus = null) {
    const headers = await this._getHeaders();
    let url;

    // API 2025-10+ 原生支持 status=unlisted
    const effectiveStatus = publishedStatus === 'unlisted' ? 'unlisted' : (status || 'active');
    url = `${this.baseUrl}/products.json?title=${encodeURIComponent(query)}&limit=50&status=${effectiveStatus}`;

    const response = await axios.get(url, { headers });
    return this._formatProducts(response.data.products);
  }

  /**
   * 格式化商品数据，提取关键字段
   */
  _formatProducts(products) {
    return products.map((product) => {
      const mainImage = product.images && product.images.length > 0
        ? product.images[0].src
        : null;

      const variants = (product.variants || []).map((variant) => ({
        id: String(variant.id),
        title: variant.title,
        sku: variant.sku || '',
        gtin: variant.barcode || '',
        price: variant.price,
        inventory_quantity: variant.inventory_quantity || 0,
        inventory_item_id: String(variant.inventory_item_id),
        option1: variant.option1,
        option2: variant.option2,
        option3: variant.option3,
        image_url: variant.image_id
          ? (product.images.find((img) => img.id === variant.image_id) || {}).src || mainImage
          : mainImage,
      }));

      return {
        id: String(product.id),
        title: product.title,
        status: product.status,
        options: product.options || [],
        main_image: mainImage,
        variants,
      };
    });
  }

  /**
   * 获取单个商品
   */
  async getProduct(productId) {
    const headers = await this._getHeaders();
    const url = `${this.baseUrl}/products/${productId}.json`;
    const response = await axios.get(url, { headers });
    const [formatted] = this._formatProducts([response.data.product]);
    return formatted;
  }
}

module.exports = new ShopifyService();
