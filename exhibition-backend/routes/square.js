const express = require('express');
const router = express.Router();
const squareService = require('../services/square');
const db = require('../db');
const { snapshotId } = require('../utils/snowflake');

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
 *   1. 一次性拉取 Square 目录（带 TTL 缓存）
 *   2. 批量匹配所有商品的 Square 变体（纯内存操作）
 *   3. 批量获取所有匹配变体的当前库存（1 次 API）
 *   4. 并发写入所有商品的库存调整（Promise.all）
 *   5. 未匹配商品收集到 unmatched 数组一并返回
 *
 * ── after（展会结束后）──
 *   1. 一次性拉取 Square 目录（带 TTL 缓存）
 *   2. 批量匹配所有商品的 Square 变体
 *   3. 批量获取所有匹配变体的当前库存（1 次 API）
 *   4. 计算卖出量和剩余量，写入快照
 */
router.post('/sync', async (req, res) => {
  try {
    const { exhibition_id, sync_type } = req.body;
    if (!exhibition_id || !sync_type) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }

    // 获取展会商品清单（通过 VIEW 获取 sku/gtin/product_title/variant_title 等商品信息）
    const items = db.prepare('SELECT * FROM exhibition_items_view WHERE exhibition_id = ?').all(exhibition_id);
    if (!items.length) {
      return res.status(400).json({ success: false, message: '展会清单为空' });
    }

    // ─────────────────────────────────────────────
    // 优化 1：只拉取一次 Square 目录（TTL 缓存命中时 0 次 API）
    // ─────────────────────────────────────────────
    console.log(`[sync] 开始同步，共 ${items.length} 件商品，sync_type=${sync_type}`);
    const catalog = await squareService.getAllCatalogItems();

    // ─────────────────────────────────────────────
    // 优化 2：批量匹配（纯内存操作，传入已有目录）
    // ─────────────────────────────────────────────
    const matchResults = await Promise.all(
      items.map(async (item) => {
        const match = await squareService.findVariationByGtinOrSku(item.gtin, item.sku, catalog);
        return { item, match };
      })
    );

    // 分离匹配成功和未匹配
    const matched = matchResults.filter((r) => r.match !== null);
    const unmatchedItems = matchResults.filter((r) => r.match === null);

    const results = [];
    const unmatched = [];

    // 收集未匹配商品信息
    for (const { item } of unmatchedItems) {
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
    }

    if (matched.length === 0) {
      return res.json({
        success: true,
        data: results,
        unmatched,
        unmatched_count: unmatched.length,
      });
    }

    // ─────────────────────────────────────────────
    // 优化 3：批量获取所有匹配变体的当前库存（1 次 API）
    // ─────────────────────────────────────────────
    const variationIds = matched.map((r) => r.match.variationId);
    const inventoryCounts = await squareService.batchGetInventoryCounts(variationIds);
    console.log(`[sync] 批量获取库存完成，共 ${variationIds.length} 个变体`);

    if (sync_type === 'before') {
      // ═══════════════════════════════════════════
      // 出发前：在 Square 现有库存基础上累加 planned_quantity
      // ═══════════════════════════════════════════

      // 过滤出需要实际写入的商品（数量有变化的）
      const toSync = matched.filter(({ item }) => {
        const lastSyncedQty = item.last_synced_quantity;
        const plannedQty = item.planned_quantity;
        // 数量未变动则跳过
        return !(lastSyncedQty !== null && lastSyncedQty !== undefined && lastSyncedQty === plannedQty);
      });

      // 记录跳过的商品
      for (const { item } of matched) {
        const lastSyncedQty = item.last_synced_quantity;
        const plannedQty = item.planned_quantity;
        if (lastSyncedQty !== null && lastSyncedQty !== undefined && lastSyncedQty === plannedQty) {
          results.push({
            shopify_variant_id: item.shopify_variant_id,
            product_title: item.product_title,
            variant_title: item.variant_title,
            status: 'skipped',
            message: `数量未变动（${plannedQty}），跳过同步`,
          });
        }
      }

      // ─────────────────────────────────────────────
      // 优化 4：并发写入所有需要同步的商品库存
      // ─────────────────────────────────────────────
      console.log(`[sync] 并发写入 ${toSync.length} 件商品库存...`);
      await Promise.all(
        toSync.map(async ({ item, match }) => {
          const plannedQty = item.planned_quantity;
          const lastSyncedQty = item.last_synced_quantity;
          const currentQty = inventoryCounts[match.variationId] ?? 0;

          const deltaQty = (lastSyncedQty !== null && lastSyncedQty !== undefined)
            ? plannedQty - lastSyncedQty
            : plannedQty;

          const newTotalQty = Math.max(0, currentQty + deltaQty);

          // 写入 Square 库存
          await squareService.setInventoryQuantity(match.variationId, newTotalQty);

          // 记录快照
          try {
            const existing = db.prepare(
              'SELECT id FROM inventory_snapshots WHERE exhibition_id = ? AND shopify_variant_id = ?'
            ).get(exhibition_id, item.shopify_variant_id);

            if (existing) {
              db.prepare(
                'UPDATE inventory_snapshots SET square_catalog_variation_id = ?, square_quantity_before = ?, synced_at = CURRENT_TIMESTAMP WHERE id = ?'
              ).run(match.variationId, newTotalQty, existing.id);
            } else {
              db.prepare(
                'INSERT INTO inventory_snapshots (id, exhibition_id, shopify_variant_id, square_catalog_variation_id, square_quantity_before) VALUES (?, ?, ?, ?, ?)'
              ).run(snapshotId(db), exhibition_id, item.shopify_variant_id, match.variationId, newTotalQty);
            }

            db.prepare(
              'UPDATE exhibition_items SET last_synced_quantity = ? WHERE exhibition_id = ? AND shopify_variant_id = ?'
            ).run(plannedQty, exhibition_id, item.shopify_variant_id);
          } catch (dbErr) {
            console.warn('[sync] 快照写入失败（不影响库存同步）:', dbErr.message);
          }

          results.push({
            shopify_variant_id: item.shopify_variant_id,
            product_title: item.product_title,
            variant_title: item.variant_title,
            square_variation_id: match.variationId,
            match_type: match.matchType,
            planned_quantity: plannedQty,
            delta_quantity: deltaQty,
            square_previous_quantity: currentQty,
            square_synced_quantity: newTotalQty,
            status: 'synced',
            message: `Square 原有 ${currentQty} 件，${deltaQty >= 0 ? '+' : ''}${deltaQty} 件，现有 ${newTotalQty} 件`,
          });
        })
      );

    } else if (sync_type === 'after') {
      // ═══════════════════════════════════════════
      // 展会结束后：读取 Square 当前剩余量，计算卖出量
      // 库存已通过 batchGetInventoryCounts 批量获取，无需再次请求
      // ═══════════════════════════════════════════
      for (const { item, match } of matched) {
        const squareRemaining = inventoryCounts[match.variationId] ?? 0;

        const snapshot = db.prepare(
          'SELECT * FROM inventory_snapshots WHERE exhibition_id = ? AND shopify_variant_id = ?'
        ).get(exhibition_id, item.shopify_variant_id);

        const qtyBefore = snapshot ? snapshot.square_quantity_before : item.planned_quantity;
        const soldQty = Math.max(0, qtyBefore - squareRemaining);
        const remainingQty = Math.max(0, item.planned_quantity - soldQty);

        if (snapshot) {
          db.prepare(
            'UPDATE inventory_snapshots SET square_quantity_after = ?, sold_quantity = ?, remaining_quantity = ?, synced_at = CURRENT_TIMESTAMP WHERE id = ?'
          ).run(squareRemaining, soldQty, remainingQty, snapshot.id);
        } else {
          db.prepare(
            'INSERT INTO inventory_snapshots (id, exhibition_id, shopify_variant_id, square_catalog_variation_id, square_quantity_before, square_quantity_after, sold_quantity, remaining_quantity) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          ).run(snapshotId(db), exhibition_id, item.shopify_variant_id, match.variationId, qtyBefore, squareRemaining, soldQty, remainingQty);
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

    console.log(`[sync] 同步完成，成功 ${results.filter(r => r.status === 'synced' || r.status === 'calculated').length} 件，未匹配 ${unmatched.length} 件`);

    res.json({
      success: true,
      data: results,
      unmatched,
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
        // 1. 在 Square 创建商品（createCatalogItem 内部会清除目录缓存）
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

        // 3. 记录快照（失败不影响商品创建成功状态）
        try {
          const existing = db.prepare(
            'SELECT id FROM inventory_snapshots WHERE exhibition_id = ? AND shopify_variant_id = ?'
          ).get(exhibition_id, item.shopify_variant_id);

          if (existing) {
            db.prepare(
              'UPDATE inventory_snapshots SET square_catalog_variation_id = ?, square_quantity_before = ?, synced_at = CURRENT_TIMESTAMP WHERE id = ?'
            ).run(variationId, plannedQty, existing.id);
          } else {
            db.prepare(
              'INSERT INTO inventory_snapshots (id, exhibition_id, shopify_variant_id, square_catalog_variation_id, square_quantity_before) VALUES (?, ?, ?, ?, ?)'
            ).run(snapshotId(db), exhibition_id, item.shopify_variant_id, variationId, plannedQty);
          }

          // 4. 更新 last_synced_quantity
          db.prepare(
            'UPDATE exhibition_items SET last_synced_quantity = ? WHERE exhibition_id = ? AND shopify_variant_id = ?'
          ).run(plannedQty, exhibition_id, item.shopify_variant_id);
        } catch (dbErr) {
          console.warn('[create-items] 快照写入失败（不影响商品创建）:', dbErr.message);
        }

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
    // JOIN exhibition_items_view to get product_title/variant_title from product_variants
    const snapshots = db.prepare(
      `SELECT s.*, v.product_title, v.variant_title, v.planned_quantity as item_planned_qty
       FROM inventory_snapshots s
       LEFT JOIN exhibition_items_view v
         ON s.shopify_variant_id = v.shopify_variant_id
         AND s.exhibition_id = v.exhibition_id
       WHERE s.exhibition_id = ?`
    ).all(req.params.exhibition_id);

    res.json({ success: true, data: snapshots });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
