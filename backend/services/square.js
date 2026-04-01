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
   * 通过 GTIN 或 SKU 匹配 Square 变体 ID
   * 优先级：GTIN 精确匹配 → SKU 精确匹配
   */
  async findVariationByGtinOrSku(gtin, sku) {
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

    // 其次通过 SKU 精确匹配
    if (sku) {
      for (const item of catalog) {
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
   * @param {Object} itemData - 商品数据
   * @param {string} itemData.name - 商品名称
   * @param {string} itemData.description - 商品描述（可选）
   * @param {string} itemData.variantName - 变体名称
   * @param {string} itemData.sku - SKU
   * @param {string} itemData.gtin - GTIN/UPC
   * @param {number} itemData.priceCents - 价格（分）
   * @returns {Promise<{itemId: string, variationId: string}>}
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
      const response = await this.client.catalog.upsertObject({
        idempotencyKey,
        object: itemObject,
      });

      const createdItem = response.catalogObject;
      const createdVariation = response.idMappings?.find((m) => m.clientObjectId === `#variation-${idempotencyKey}`);

      return {
        itemId: createdItem.id,
        variationId: createdVariation?.objectId || createdItem.itemData.variations[0].id,
      };
    } catch (err) {
      console.error('创建 Square 商品失败:', err.message);
      throw new Error(`创建 Square 商品失败: ${err.message}`);
    }
  }

  /**
   * 获取指定变体的当前库存数量
   * 注意：SDK v44 的 inventory.get 存在 URL 拼接 bug，改用 batchGetCounts 实现
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
   * 在 Square 现有库存基础上调整数量（支持正负差量）
   * 先读取当前库存，再用 PHYSICAL_COUNT 写入（当前 + 差量）
   * deltaQty > 0 时增加库存，deltaQty < 0 时减少库存
   * 返回 { previousQty, deltaQty, newTotalQty }
   */
  async adjustInventoryQuantity(catalogObjectId, deltaQty) {
    const currentQty = await this.getInventoryCount(catalogObjectId);
    // 防止库存出现负数（Square 不允许负库存）
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
