const { SquareClient, SquareEnvironment } = require('square');

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
   * Square SDK v44 使用 async iterator 分页
   */
  async getAllCatalogItems() {
    const objects = [];

    try {
      const iterator = await this.client.catalog.list({ types: 'ITEM,ITEM_VARIATION' });
      for await (const obj of iterator) {
        objects.push(obj);
      }
    } catch (err) {
      console.error('获取 Square 目录失败:', err.message);
      throw err;
    }

    return this._formatCatalog(objects);
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
   * 通过 GTIN 或商品名称匹配 Square 变体 ID
   */
  async findVariationByGtinOrName(gtin, productTitle) {
    const catalog = await this.getAllCatalogItems();

    // 优先通过 GTIN 匹配
    if (gtin) {
      for (const item of catalog) {
        for (const variation of item.variations) {
          if (variation.gtin && variation.gtin === gtin) {
            return { itemId: item.id, variationId: variation.id, matchType: 'gtin' };
          }
        }
      }
    }

    // 其次通过商品名称模糊匹配
    if (productTitle) {
      const titleLower = productTitle.toLowerCase();
      for (const item of catalog) {
        if (item.name.toLowerCase().includes(titleLower) || titleLower.includes(item.name.toLowerCase())) {
          const variation = item.variations[0];
          if (variation) {
            return { itemId: item.id, variationId: variation.id, matchType: 'name' };
          }
        }
      }
    }

    return null;
  }

  /**
   * 获取指定变体的当前库存数量
   * SDK v44: client.inventory.get(catalogObjectId, { locationIds })
   */
  async getInventoryCount(catalogObjectId) {
    try {
      const response = await this.client.inventory.get(catalogObjectId, {
        locationIds: this.locationId,
      });

      const counts = response.counts || [];
      const inStock = counts.find((c) => c.state === 'IN_STOCK');
      return inStock ? parseInt(inStock.quantity, 10) : 0;
    } catch (err) {
      console.error(`获取 Square 库存失败 [${catalogObjectId}]:`, err.message);
      return 0;
    }
  }

  /**
   * 批量获取多个变体的库存数量
   * SDK v44: client.inventory.batchGetCounts({ catalogObjectIds, locationIds, states })
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
   * SDK v44: client.inventory.batchCreateChanges({ idempotencyKey, changes })
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
   * 批量同步库存到 Square
   * items: [{ catalogObjectId, quantity }]
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
