const axios = require('axios');

const SHOPIFY_STORE = process.env.SHOPIFY_STORE; // e.g. mystore.myshopify.com
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';

function shopifyClient() {
  if (!SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN) {
    throw new Error('SHOPIFY_STORE and SHOPIFY_ACCESS_TOKEN must be set in environment variables');
  }
  return axios.create({
    baseURL: `https://${SHOPIFY_STORE}/admin/api/${API_VERSION}`,
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      'Content-Type': 'application/json'
    }
  });
}

/**
 * Fetch all products from Shopify with pagination
 */
async function fetchAllProducts() {
  const client = shopifyClient();
  const products = [];
  let url = '/products.json?limit=250&fields=id,title,vendor,product_type,status,handle,tags,variants';

  while (url) {
    const res = await client.get(url);
    products.push(...res.data.products);

    // Handle pagination via Link header
    const linkHeader = res.headers['link'];
    url = null;
    if (linkHeader) {
      const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (match) {
        // Extract just the path+query from the full URL
        const fullUrl = match[1];
        const urlObj = new URL(fullUrl);
        url = urlObj.pathname.replace(`/admin/api/${API_VERSION}`, '') + urlObj.search;
      }
    }
  }

  return products;
}

/**
 * Update a product variant on Shopify
 */
async function updateVariant(variantId, data) {
  const client = shopifyClient();
  const res = await client.put(`/variants/${variantId}.json`, { variant: data });
  return res.data.variant;
}

/**
 * Update a product on Shopify
 */
async function updateProduct(productId, data) {
  const client = shopifyClient();
  const res = await client.put(`/products/${productId}.json`, { product: data });
  return res.data.product;
}

module.exports = { fetchAllProducts, updateVariant, updateProduct };
