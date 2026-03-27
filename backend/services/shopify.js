const axios = require('axios');

class ShopifyService {
  constructor() {
    this.domain = process.env.SHOPIFY_STORE_DOMAIN;
    this.accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
    this.apiVersion = '2024-01';
    this.baseUrl = `https://${this.domain}/admin/api/${this.apiVersion}`;
    this.headers = {
      'X-Shopify-Access-Token': this.accessToken,
      'Content-Type': 'application/json',
    };
  }

  /**
   * 获取所有商品（含变体、GTIN、图片）
   * 支持分页，自动拉取全部数据
   */
  async getAllProducts(params = {}) {
    const products = [];
    let pageInfo = null;
    let hasMore = true;

    while (hasMore) {
      const queryParams = new URLSearchParams({
        limit: 250,
        fields: 'id,title,variants,images,options,status',
        status: 'active',
        ...params,
      });

      if (pageInfo) {
        queryParams.set('page_info', pageInfo);
        // 使用 page_info 时不能带其他过滤参数
        const url = `${this.baseUrl}/products.json?limit=250&page_info=${pageInfo}`;
        const response = await axios.get(url, { headers: this.headers });
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
        const url = `${this.baseUrl}/products.json?${queryParams.toString()}`;
        const response = await axios.get(url, { headers: this.headers });
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
   * 搜索商品（按标题关键词）
   */
  async searchProducts(query) {
    const url = `${this.baseUrl}/products.json?title=${encodeURIComponent(query)}&limit=50&status=active`;
    const response = await axios.get(url, { headers: this.headers });
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
    const url = `${this.baseUrl}/products/${productId}.json`;
    const response = await axios.get(url, { headers: this.headers });
    const [formatted] = this._formatProducts([response.data.product]);
    return formatted;
  }
}

module.exports = new ShopifyService();
