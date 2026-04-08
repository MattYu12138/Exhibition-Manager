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
      console.log('[Square] 使用目录缓存（剩余有效期', Math.round((CATALOG_CACHE_TTL_MS - (now - _catalogCacheAt)) / 1000), '秒）');
      return _catalogCache;
    }

    const objects = [];
    try {
      console.log('[Square] 拉取 Square 目录...');
      const iterator = await this.client.catalog.list({ types: 'ITEM,ITEM_VARIATION' });
      for await (const obj of iterator) {
        objects.push(obj);
      }
    } catch (err) {
      console.error('获取 Square 目录失败:', err.message);
      throw err;
    }

    _catalogCache = this._formatCatalog(objects);
    _catalogCacheAt = Date.now();
    console.log(`[Square] 目录拉取完成，共 ${_catalogCache.length} 个商品，已缓存`);
    return _catalogCache;
  }

  /**
   * 主动清除目录缓存（创建新商品后调用，确保下次能拿到最新数据）
   */
  invalidateCatalogCache() {
    _catalogCache = null;
    _catalogCacheAt = 0;
    console.log('[Square] 目录缓存已清除');
  }

  /**
   * 格式化 Square 目录数据
   */
  _formatCatalog(objects) {
    const itemMap = {};
    const variationMap = {};

    // 分离 ITEM 和 ITEM_VARIATION
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
   * 通过 GTIN 或 SKU 匹配 Square 变体 ID
   * 优先级：GTIN 精确匹配 → SKU 精确匹配
   * @param {string} gtin
   * @param {string} sku
   * @param {Array|null} catalog - 可传入已有目录，避免重复拉取；为 null 时自动拉取
   */
  async findVariationByGtinOrSku(gtin, sku, catalog = null) {
    const items = catalog || await this.getAllCatalogItems();

    // 优先通过 GTIN 匹配
    if (gtin) {
      for (const item of items) {
        for (const variation of item.variations) {
          if (variation.gtin && variation.gtin === gtin) {
            return { itemId: item.id, variationId: variation.id, matchType: 'gtin' };
          }
        }
      }
    }

    // 其次通过 SKU 精确匹配
    if (sku) {
      for (const item of items) {
        for (const variation of item.variations) {
          if (variation.sku && variation.sku === sku) {
            return { itemId: item.id, variationId: variation.id, matchType: 'sku' };
          }
        }
      }
    }

    return null;
  }

  /**
   * 创建 Square 商品（ITEM + ITEM_VARIATION）
   * 创建成功后自动清除目录缓存
   */
  async createCatalogItem(itemData) {
    const idempotencyKey = `create-item-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    const itemObject = {
      type: 'ITEM',
      id: `#item-${idempotencyKey}`,
      itemData: {
        name: itemData.name,
        description: itemData.description || '',
        variations: [
          {
            type: 'ITEM_VARIATION',
            id: `#variation-${idempotencyKey}`,
            itemVariationData: {
              name: itemData.variantName || 'Default',
              sku: itemData.sku || '',
              upc: itemData.gtin || '',
              pricingType: 'FIXED_PRICING',
              priceMoney: {
                amount: BigInt(itemData.priceCents || 0),
                currency: 'AUD',
              },
            },
          },
        ],
      },
    };

    try {
      // SDK v44: catalog.object.upsert()
      const response = await this.client.catalog.object.upsert({
        idempotencyKey,
        object: itemObject,
      });

      const createdItem = response.catalogObject;
      const variationMapping = response.idMappings?.find(
        (m) => m.clientObjectId === `#variation-${idempotencyKey}`
      );

      const variationId =
        variationMapping?.objectId ||
        createdItem?.itemData?.variations?.[0]?.id;

      if (!variationId) {
        throw new Error('无法获取创建的变体 ID，请检查 Square API 响应');
      }

      // 新商品创建后清除缓存，确保下次同步能拿到最新目录
      this.invalidateCatalogCache();

      return {
        itemId: createdItem.id,
        variationId,
      };
    } catch (err) {
      console.error('创建 Square 商品失败:', err.message);
      throw new Error(`创建 Square 商品失败: ${err.message}`);
    }
  }

  /**
   * 获取指定变体的当前库存数量
   */
  async getInventoryCount(catalogObjectId) {
    try {
      const counts = await this.batchGetInventoryCounts([catalogObjectId]);
      return counts[catalogObjectId] ?? 0;
    } catch (err) {
      console.error(`获取 Square 库存失败 [${catalogObjectId}]:`, err.message);
      return 0;
    }
  }

  /**
   * 批量获取多个变体的库存数量
   */
  async batchGetInventoryCounts(catalogObjectIds) {
    try {
      const result = {};
      const iterator = await this.client.inventory.batchGetCounts({
        catalogObjectIds,
        locationIds: [this.locationId],
        states: ['IN_STOCK'],
      });

      for await (const count of iterator) {
        result[count.catalogObjectId] = parseInt(count.quantity, 10);
      }

      // 补充未找到的为 0
      catalogObjectIds.forEach((id) => {
        if (!(id in result)) result[id] = 0;
      });

      return result;
    } catch (err) {
      console.error('批量获取 Square 库存失败:', err.message);
      return {};
    }
  }

  /**
   * 批量创建库存变更（物理盘点）
   */
  async setInventoryQuantity(catalogObjectId, quantity, reason = 'RECOUNT') {
    const idempotencyKey = `exhibition-sync-${catalogObjectId}-${Date.now()}`;

    const response = await this.client.inventory.batchCreateChanges({
      idempotencyKey,
      changes: [
        {
          type: 'PHYSICAL_COUNT',
          physicalCount: {
            catalogObjectId,
            state: 'IN_STOCK',
            locationId: this.locationId,
            quantity: String(quantity),
            occurredAt: new Date().toISOString(),
          },
        },
      ],
    });

    return response;
  }

  /**
   * 在 Square 现有库存基础上调整数量（支持正负差量）
   */
  async adjustInventoryQuantity(catalogObjectId, deltaQty) {
    const currentQty = await this.getInventoryCount(catalogObjectId);
    const newTotal = Math.max(0, currentQty + deltaQty);

    await this.setInventoryQuantity(catalogObjectId, newTotal);

    return {
      previousQty: currentQty,
      deltaQty,
      newTotalQty: newTotal,
    };
  }

  /**
   * 批量同步库存到 Square
   */
  async batchSetInventory(items) {
    const idempotencyKey = `exhibition-batch-${Date.now()}`;
    const changes = items.map((item) => ({
      type: 'PHYSICAL_COUNT',
      physicalCount: {
        catalogObjectId: item.catalogObjectId,
        state: 'IN_STOCK',
        locationId: this.locationId,
        quantity: String(item.quantity),
        occurredAt: new Date().toISOString(),
      },
    }));

    const response = await this.client.inventory.batchCreateChanges({
      idempotencyKey,
      changes,
    });

    return response;
  }
}

module.exports = new SquareService();
