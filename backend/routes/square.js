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
 * Body: { exhibition_id, sync_type: 'before' | 'after' }
 *
 * ── before（出发前）──
 *   1. 通过 GTIN / 商品名称匹配 Square 变体
 *   2. 将 planned_quantity（带走数量）**写入** Square 库存
 *   3. 记录快照：square_quantity_before = planned_quantity
 *
 * ── after（展会结束后）──
 *   1. 从 Square **读取**当前剩余库存 square_quantity_after
 *   2. 卖出量 = square_quantity_before - square_quantity_after
 *   3. 应剩余（待清点）= square_quantity_after（即 Square 里还剩的）
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

      if (sync_type === 'before') {
        // ═══════════════════════════════════════════
        // 出发前：把 planned_quantity 写入 Square
        // ═══════════════════════════════════════════
        const plannedQty = item.planned_quantity;

        // 写入 Square 库存
        await squareService.setInventoryQuantity(match.variationId, plannedQty);

        // 记录快照
        const existing = db.prepare(
          'SELECT id FROM inventory_snapshots WHERE exhibition_id = ? AND shopify_variant_id = ?'
        ).get(exhibition_id, item.shopify_variant_id);

        if (existing) {
          db.prepare(
            'UPDATE inventory_snapshots SET square_catalog_variation_id = ?, square_quantity_before = ?, synced_at = CURRENT_TIMESTAMP WHERE id = ?'
          ).run(match.variationId, plannedQty, existing.id);
        } else {
          db.prepare(
            'INSERT INTO inventory_snapshots (exhibition_id, shopify_variant_id, square_catalog_variation_id, square_quantity_before) VALUES (?, ?, ?, ?)'
          ).run(exhibition_id, item.shopify_variant_id, match.variationId, plannedQty);
        }

        results.push({
          shopify_variant_id: item.shopify_variant_id,
          product_title: item.product_title,
          variant_title: item.variant_title,
          square_variation_id: match.variationId,
          match_type: match.matchType,
          planned_quantity: plannedQty,
          square_synced_quantity: plannedQty,
          status: 'synced',
          message: `已将 ${plannedQty} 件写入 Square`,
        });

      } else if (sync_type === 'after') {
        // ═══════════════════════════════════════════
        // 展会结束后：从 Square 读取剩余量，计算卖出量
        // ═══════════════════════════════════════════
        const squareRemaining = await squareService.getInventoryCount(match.variationId);

        const snapshot = db.prepare(
          'SELECT * FROM inventory_snapshots WHERE exhibition_id = ? AND shopify_variant_id = ?'
        ).get(exhibition_id, item.shopify_variant_id);

        const qtyBefore = snapshot ? snapshot.square_quantity_before : item.planned_quantity;
        const soldQty = Math.max(0, qtyBefore - squareRemaining);
        const remainingQty = Math.max(0, squareRemaining);

        // 更新快照
        if (snapshot) {
          db.prepare(
            'UPDATE inventory_snapshots SET square_quantity_after = ?, sold_quantity = ?, remaining_quantity = ?, synced_at = CURRENT_TIMESTAMP WHERE id = ?'
          ).run(squareRemaining, soldQty, remainingQty, snapshot.id);
        } else {
          db.prepare(
            'INSERT INTO inventory_snapshots (exhibition_id, shopify_variant_id, square_catalog_variation_id, square_quantity_before, square_quantity_after, sold_quantity, remaining_quantity) VALUES (?, ?, ?, ?, ?, ?, ?)'
          ).run(exhibition_id, item.shopify_variant_id, match.variationId, qtyBefore, squareRemaining, soldQty, remainingQty);
        }

        results.push({
          shopify_variant_id: item.shopify_variant_id,
          product_title: item.product_title,
          variant_title: item.variant_title,
          square_variation_id: match.variationId,
          match_type: match.matchType,
          planned_quantity: item.planned_quantity,
          square_quantity_before: qtyBefore,
          square_quantity_after: squareRemaining,
          sold_quantity: soldQty,
          remaining_quantity: remainingQty,
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
 * 获取展会的库存快照（差值计算结果）
 */
router.get('/snapshots/:exhibition_id', (req, res) => {
  try {
    const snapshots = db.prepare(
      `SELECT s.*, e.product_title, e.variant_title, e.planned_quantity as item_planned_qty
       FROM inventory_snapshots s
       LEFT JOIN exhibition_items e
         ON s.shopify_variant_id = e.shopify_variant_id
         AND s.exhibition_id = e.exhibition_id
       WHERE s.exhibition_id = ?`
    ).all(req.params.exhibition_id);

    res.json({ success: true, data: snapshots });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
