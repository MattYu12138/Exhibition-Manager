const express = require('express');
const router = express.Router();
const squareService = require('../services/square');
const db = require('../db');

// 获取 Square 商品目录
router.get('/catalog', async (req, res) => {
  try {
    const catalog = await squareService.getAllCatalogItems();
    res.json({ success: true, data: catalog, total: catalog.length });
  } catch (err) {
    console.error('获取 Square 目录失败:', err.message);
    res.status(500).json({ success: false, message: '获取 Square 目录失败: ' + err.message });
  }
});

/**
 * 同步展会商品到 Square 库存
 * 在出发前调用：记录 Square 当前库存快照，并将展会商品数量同步至 Square
 * Body: { exhibition_id, sync_type: 'before' | 'after' }
 */
router.post('/sync', async (req, res) => {
  try {
    const { exhibition_id, sync_type } = req.body;
    if (!exhibition_id || !sync_type) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }

    // 获取展会商品清单
    const items = db.prepare('SELECT * FROM exhibition_items WHERE exhibition_id = ?').all(exhibition_id);
    if (!items.length) {
      return res.status(400).json({ success: false, message: '展会清单为空' });
    }

    const results = [];

    for (const item of items) {
      // 通过 GTIN 或商品名称匹配 Square 变体
      const match = await squareService.findVariationByGtinOrName(item.gtin, item.product_title);

      if (!match) {
        results.push({
          shopify_variant_id: item.shopify_variant_id,
          product_title: item.product_title,
          variant_title: item.variant_title,
          status: 'not_found',
          message: '未在 Square 中找到匹配商品',
        });
        continue;
      }

      const squareQty = await squareService.getInventoryCount(match.variationId);

      if (sync_type === 'before') {
        // 出发前：记录 Square 当前库存快照
        const existing = db.prepare(
          'SELECT id FROM inventory_snapshots WHERE exhibition_id = ? AND shopify_variant_id = ?'
        ).get(exhibition_id, item.shopify_variant_id);

        if (existing) {
          db.prepare(
            'UPDATE inventory_snapshots SET square_catalog_variation_id = ?, square_quantity_before = ?, synced_at = CURRENT_TIMESTAMP WHERE id = ?'
          ).run(match.variationId, squareQty, existing.id);
        } else {
          db.prepare(
            'INSERT INTO inventory_snapshots (exhibition_id, shopify_variant_id, square_catalog_variation_id, square_quantity_before) VALUES (?, ?, ?, ?)'
          ).run(exhibition_id, item.shopify_variant_id, match.variationId, squareQty);
        }

        results.push({
          shopify_variant_id: item.shopify_variant_id,
          product_title: item.product_title,
          variant_title: item.variant_title,
          square_variation_id: match.variationId,
          match_type: match.matchType,
          square_quantity_before: squareQty,
          status: 'synced',
        });
      } else if (sync_type === 'after') {
        // 展会结束后：获取 Square 最新库存，计算差值
        const snapshot = db.prepare(
          'SELECT * FROM inventory_snapshots WHERE exhibition_id = ? AND shopify_variant_id = ?'
        ).get(exhibition_id, item.shopify_variant_id);

        const qtyBefore = snapshot ? snapshot.square_quantity_before : 0;
        const plannedQty = item.planned_quantity;
        const soldQty = qtyBefore - squareQty; // Square 库存减少量 = 展会销售量
        const remainingQty = plannedQty - Math.max(0, soldQty); // 剩余 = 带走 - 销售

        if (snapshot) {
          db.prepare(
            'UPDATE inventory_snapshots SET square_quantity_after = ?, sold_quantity = ?, remaining_quantity = ?, synced_at = CURRENT_TIMESTAMP WHERE id = ?'
          ).run(squareQty, Math.max(0, soldQty), Math.max(0, remainingQty), snapshot.id);
        } else {
          db.prepare(
            'INSERT INTO inventory_snapshots (exhibition_id, shopify_variant_id, square_catalog_variation_id, square_quantity_before, square_quantity_after, sold_quantity, remaining_quantity) VALUES (?, ?, ?, ?, ?, ?, ?)'
          ).run(exhibition_id, item.shopify_variant_id, match.variationId, 0, squareQty, 0, plannedQty);
        }

        results.push({
          shopify_variant_id: item.shopify_variant_id,
          product_title: item.product_title,
          variant_title: item.variant_title,
          square_variation_id: match.variationId,
          match_type: match.matchType,
          planned_quantity: plannedQty,
          square_quantity_before: qtyBefore,
          square_quantity_after: squareQty,
          sold_quantity: Math.max(0, soldQty),
          remaining_quantity: Math.max(0, remainingQty),
          status: 'calculated',
        });
      }
    }

    res.json({ success: true, data: results });
  } catch (err) {
    console.error('Square 同步失败:', err.message);
    res.status(500).json({ success: false, message: 'Square 同步失败: ' + err.message });
  }
});

/**
 * 将剩余数量更新回 Square 库存
 * 展会结束后，将计算出的剩余数量写入 Square
 */
router.post('/sync/update-remaining', async (req, res) => {
  try {
    const { exhibition_id } = req.body;
    if (!exhibition_id) {
      return res.status(400).json({ success: false, message: '缺少 exhibition_id' });
    }

    const snapshots = db.prepare(
      'SELECT * FROM inventory_snapshots WHERE exhibition_id = ? AND square_catalog_variation_id IS NOT NULL'
    ).all(exhibition_id);

    if (!snapshots.length) {
      return res.status(400).json({ success: false, message: '没有可更新的库存快照，请先执行展会结束同步' });
    }

    const updateItems = snapshots.map((s) => ({
      catalogObjectId: s.square_catalog_variation_id,
      quantity: s.remaining_quantity,
    }));

    await squareService.batchSetInventory(updateItems);

    res.json({
      success: true,
      message: `已将 ${updateItems.length} 个商品的剩余数量更新至 Square`,
      data: updateItems,
    });
  } catch (err) {
    console.error('更新 Square 剩余库存失败:', err.message);
    res.status(500).json({ success: false, message: '更新 Square 库存失败: ' + err.message });
  }
});

/**
 * 获取展会的库存快照（差值计算结果）
 */
router.get('/snapshots/:exhibition_id', (req, res) => {
  try {
    const snapshots = db.prepare(
      'SELECT s.*, e.product_title, e.variant_title, e.planned_quantity as item_planned_qty FROM inventory_snapshots s LEFT JOIN exhibition_items e ON s.shopify_variant_id = e.shopify_variant_id AND s.exhibition_id = e.exhibition_id WHERE s.exhibition_id = ?'
    ).all(req.params.exhibition_id);

    res.json({ success: true, data: snapshots });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
