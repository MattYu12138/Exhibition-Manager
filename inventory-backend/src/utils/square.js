const { SquareClient, SquareEnvironment } = require('square');

// 进程级目录缓存（TTL 5 分钟）
const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;
let _catalogCache = null;
let _catalogCacheAt = 0;

class SquareService {
  constructor() {
    this._client = null;
  }

  get client() {
    if (!this._client) {
      this._client = new SquareClient({
        token: process.env.SQUARE_ACCESS_TOKEN,
        environment:
          process.env.SQUARE_ENVIRONMENT === 'production'
            ? SquareEnvironment.Production
            : SquareEnvironment.Sandbox,
      });
    }
    return this._client;
  }

  get locationId() {
    return process.env.SQUARE_LOCATION_ID;
  }

  /**
   * 获取 Square 所有商品目录（含变体和 GTIN）
   * 带进程级 TTL 缓存（5 分钟），减少重复 API 请求
   * @param {boolean} forceRefresh - 强制忽略缓存重新拉取
   */
  async getAllCatalogItems(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && _catalogCache && (now - _catalogCacheAt) < CATALOG_CACHE_TTL_MS) {
      return _catalogCache;
    }

    const objects = [];
    try {
      const iterator = await this.client.catalog.list({ types: 'ITEM,ITEM_VARIATION' });
      for await (const obj of iterator) {
        objects.push(obj);
      }
    } catch (err) {
      console.error('[Square] 获取目录失败:', err.message);
      throw err;
    }

    _catalogCache = this._formatCatalog(objects);
    _catalogCacheAt = Date.now();
    return _catalogCache;
  }

  /**
   * 主动清除目录缓存
   */
  invalidateCatalogCache() {
    _catalogCache = null;
    _catalogCacheAt = 0;
  }

  /**
   * 格式化 Square 目录数据
   */
  _formatCatalog(objects) {
    const itemMap = {};
    const variationMap = {};

    objects.forEach((obj) => {
      if (obj.type === 'ITEM') {
        itemMap[obj.id] = obj;
      } else if (obj.type === 'ITEM_VARIATION') {
        variationMap[obj.id] = obj;
      }
    });

    const result = [];
    Object.values(itemMap).forEach((item) => {
      const variations = (item.itemData?.variations || []).map((varRef) => {
        const variation = variationMap[varRef.id] || varRef;
        return {
          id: variation.id,
          name: variation.itemVariationData?.name || '',
          sku: variation.itemVariationData?.sku || '',
          gtin: variation.itemVariationData?.upc || '',
          price: variation.itemVariationData?.priceMoney?.amount
            ? Number(variation.itemVariationData.priceMoney.amount)
            : 0,
        };
      });

      result.push({
        id: item.id,
        name: item.itemData?.name || '',
        description: item.itemData?.description || '',
        variations,
      });
    });

    return result;
  }

  /**
   * 更新 Square 商品变体的 SKU 和/或 GTIN
   */
  async updateVariationSkuGtin(variationId, { sku, gtin }) {
    const idempotencyKey = `update-variation-${variationId}-${Date.now()}`;

    // 先获取当前变体数据
    const getRes = await this.client.catalog.object.get({ objectId: variationId });
    const existing = getRes.object;
    if (!existing || existing.type !== 'ITEM_VARIATION') {
      throw new Error(`Square variation ${variationId} not found`);
    }

    const updatedData = { ...existing.itemVariationData };
    if (sku !== undefined) updatedData.sku = sku;
    if (gtin !== undefined) updatedData.upc = gtin;

    const response = await this.client.catalog.object.upsert({
      idempotencyKey,
      object: {
        type: 'ITEM_VARIATION',
        id: variationId,
        version: existing.version,
        itemVariationData: updatedData,
      },
    });

    this.invalidateCatalogCache();
    return response.catalogObject;
  }
}

module.exports = new SquareService();
