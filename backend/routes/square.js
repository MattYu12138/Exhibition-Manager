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
 *   1. 通过 GTIN / SKU 匹配 Square 变体
 *   2. 将 planned_quantity（带走数量）**写入** Square 库存
 *   3. 记录快照：square_quantity_before = planned_quantity
 *   4. 未匹配商品收集到 unmatched 数组一并返回
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
    const unmatched = []; // 未在 Square 中匹配到的商品

    for (const item of items) {
      // 通过 GTIN 或 SKU 匹配 Square 变体
      const match = await squareService.findVariationByGtinOrSku(item.gtin, item.sku);

      if (!match) {
        // 收集未匹配商品的完整信息，供前端弹窗展示
        unmatched.push({
          shopify_variant_id: item.shopify_variant_id,
          shopify_product_id: item.shopify_product_id,
          product_title: item.product_title,
          variant_title: item.variant_title,
          sku: item.sku || '',
          gtin: item.gtin || '',
          image_url: item.image_url || '',
          planned_quantity: item.planned_quantity,
          rack_quantity: item.rack_quantity,
          stock_quantity: item.stock_quantity,
        });
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
        // 出发前：在 Square 现有库存基础上累加 planned_quantity
        // ═══════════════════════════════════════════
        const plannedQty = item.planned_quantity;
        const lastSyncedQty = item.last_synced_quantity;

        // 检测是否有变化：若上次同步数量与当前计划数量相同，则跳过
        if (lastSyncedQty !== null && lastSyncedQty !== undefined && lastSyncedQty === plannedQty) {
          results.push({
            shopify_variant_id: item.shopify_variant_id,
            product_title: item.product_title,
            variant_title: item.variant_title,
            status: 'skipped',
            message: `数量未变动（${plannedQty}），跳过同步`,
          });
          continue;
        }

        // 计算差量：若之前同步过，只累加差値；若从未同步，累加全量
        const deltaQty = (lastSyncedQty !== null && lastSyncedQty !== undefined)
          ? plannedQty - lastSyncedQty
          : plannedQty;

        // 累加到 Square 库存
        const { previousQty, newTotalQty } = await squareService.adjustInventoryQuantity(match.variationId, deltaQty);

        // 记录快照：square_quantity_before = 累加后的总量
        const existing = db.prepare(
          'SELECT id FROM inventory_snapshots WHERE exhibition_id = ? AND shopify_variant_id = ?'
        ).get(exhibition_id, item.shopify_variant_id);

        if (existing) {
          db.prepare(
            'UPDATE inventory_snapshots SET square_catalog_variation_id = ?, square_quantity_before = ?, synced_at = CURRENT_TIMESTAMP WHERE id = ?'
          ).run(match.variationId, newTotalQty, existing.id);
        } else {
          db.prepare(
            'INSERT INTO inventory_snapshots (exhibition_id, shopify_variant_id, square_catalog_variation_id, square_quantity_before) VALUES (?, ?, ?, ?)'
          ).run(exhibition_id, item.shopify_variant_id, match.variationId, newTotalQty);
        }

        // 更新 last_synced_quantity
        db.prepare(
          'UPDATE exhibition_items SET last_synced_quantity = ? WHERE exhibition_id = ? AND shopify_variant_id = ?'
        ).run(plannedQty, exhibition_id, item.shopify_variant_id);

        results.push({
          shopify_variant_id: item.shopify_variant_id,
          product_title: item.product_title,
          variant_title: item.variant_title,
          square_variation_id: match.variationId,
          match_type: match.matchType,
          planned_quantity: plannedQty,
          delta_quantity: deltaQty,
          square_previous_quantity: previousQty,
          square_synced_quantity: newTotalQty,
          status: 'synced',
          message: `Square 原有 ${previousQty} 件，${deltaQty >= 0 ? '+' : ''}${deltaQty} 件，现有 ${newTotalQty} 件`,
        });

      } else if (sync_type === 'after') {
        // ═══════════════════════════════════════════
        // 展会结束后：每次都实时从 Square API 获取最新剩余量
        // ═══════════════════════════════════════════

        // 每次调用都实时请求 Square API，确保获取最新库存数量
        const squareRemaining = await squareService.getInventoryCount(match.variationId);

        const snapshot = db.prepare(
          'SELECT * FROM inventory_snapshots WHERE exhibition_id = ? AND shopify_variant_id = ?'
        ).get(exhibition_id, item.shopify_variant_id);

        // qtyBefore 使用出发前同步时记录的数量（固定基准值，不随重复调用变化）
        const qtyBefore = snapshot ? snapshot.square_quantity_before : item.planned_quantity;
        // 卖出量 = 出发前同步数量 - Square 当前最新剩余（每次实时获取）
        const soldQty = Math.max(0, qtyBefore - squareRemaining);
        // 剩余待清点 = 带走数量(planned_quantity) - 卖出量
        const remainingQty = Math.max(0, item.planned_quantity - soldQty);

        // 每次都覆盖更新快照，确保 square_quantity_after 始终是最新值
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

    res.json({
      success: true,
      data: results,
      unmatched,           // 未匹配商品列表（空数组表示全部匹配）
      unmatched_count: unmatched.length,
    });
  } catch (err) {
    console.error('Square 同步失败:', err.message);
    res.status(500).json({ success: false, message: 'Square 同步失败: ' + err.message });
  }
});

/**
 * 将未匹配商品批量添加到 Square 目录
 * Body: { exhibition_id, items: [{ shopify_variant_id, name, variantName, sku, gtin, priceCents, description, planned_quantity }] }
 *
 * 流程：
 *   1. 在 Square 创建 ITEM + ITEM_VARIATION
 *   2. 将 planned_quantity 写入 Square 库存
 *   3. 记录到 inventory_snapshots
 */
router.post('/create-items', async (req, res) => {
  try {
    const { exhibition_id, items } = req.body;
    if (!exhibition_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }

    const results = [];

    for (const item of items) {
      try {
        // 1. 在 Square 创建商品
        const { itemId, variationId } = await squareService.createCatalogItem({
          name: item.name,
          description: item.description || '',
          variantName: item.variantName || 'Default',
          sku: item.sku || '',
          gtin: item.gtin || '',
          priceCents: item.priceCents || 0,
        });

        // 2. 写入库存数量
        const plannedQty = item.planned_quantity || 0;
        if (plannedQty > 0) {
          await squareService.setInventoryQuantity(variationId, plannedQty);
        }

        // 3. 记录快照
        const existing = db.prepare(
          'SELECT id FROM inventory_snapshots WHERE exhibition_id = ? AND shopify_variant_id = ?'
        ).get(exhibition_id, item.shopify_variant_id);

        if (existing) {
          db.prepare(
            'UPDATE inventory_snapshots SET square_catalog_variation_id = ?, square_quantity_before = ?, synced_at = CURRENT_TIMESTAMP WHERE id = ?'
          ).run(variationId, plannedQty, existing.id);
        } else {
          db.prepare(
            'INSERT INTO inventory_snapshots (exhibition_id, shopify_variant_id, square_catalog_variation_id, square_quantity_before) VALUES (?, ?, ?, ?)'
          ).run(exhibition_id, item.shopify_variant_id, variationId, plannedQty);
        }

        // 4. 更新 last_synced_quantity
        db.prepare(
          'UPDATE exhibition_items SET last_synced_quantity = ? WHERE exhibition_id = ? AND shopify_variant_id = ?'
        ).run(plannedQty, exhibition_id, item.shopify_variant_id);

        results.push({
          shopify_variant_id: item.shopify_variant_id,
          product_title: item.name,
          variant_title: item.variantName,
          square_item_id: itemId,
          square_variation_id: variationId,
          planned_quantity: plannedQty,
          status: 'created',
          message: `已在 Square 创建商品并写入库存 ${plannedQty} 件`,
        });
      } catch (itemErr) {
        results.push({
          shopify_variant_id: item.shopify_variant_id,
          product_title: item.name,
          variant_title: item.variantName,
          status: 'error',
          message: itemErr.message,
        });
      }
    }

    const successCount = results.filter((r) => r.status === 'created').length;
    const failCount = results.filter((r) => r.status === 'error').length;

    res.json({
      success: true,
      data: results,
      summary: { created: successCount, failed: failCount },
    });
  } catch (err) {
    console.error('添加 Square 商品失败:', err.message);
    res.status(500).json({ success: false, message: '添加 Square 商品失败: ' + err.message });
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
