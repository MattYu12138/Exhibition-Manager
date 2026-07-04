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
 * Body: { exhibition_id, sync_type: 'before' | 'after', force?: boolean }
 *
 * ── before（出发前）──
 *   1. 检查是否已同步（防重复），已同步则返回 already_synced（除非 force=true）
 *   2. 一次性拉取 Square 目录（带 TTL 缓存）
 *   3. 批量匹配所有商品的 Square 变体（纯内存操作）
 *   4. 批量获取所有匹配变体的当前库存（1 次 API）
 *   5. 并发写入所有商品的库存调整（Promise.all）
 *   6. 未匹配商品收集到 unmatched 数组一并返回
 *   7. 同步完成后记录 exhibitions.square_synced_at
 *
 * ── after（展会结束后）──
 *   1. 一次性拉取 Square 目录（带 TTL 缓存）
 *   2. 批量匹配所有商品的 Square 变体
 *   3. 批量获取所有匹配变体的当前库存（1 次 API）
 *   4. 计算卖出量和剩余量，写入快照
 *
 * 字段说明：
 *   square_quantity_before  = 展会前同步后 Square 实际总量（原有库存 + 带走数量）
 *                             用于展会后计算卖出量：sold = square_quantity_before - square_quantity_after
 *   square_quantity_after   = 展会结束后从 Square 读取的实际剩余量（NULL 表示尚未执行展会后同步）
 *   sold_quantity           = square_quantity_before - square_quantity_after（卖出量）
 *   remaining_quantity      = planned_quantity - sold_quantity（应剩余待清点）
 */
router.post('/sync', async (req, res) => {
  try {
    const { exhibition_id, sync_type, force } = req.body;
    if (!exhibition_id || !sync_type) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }

    // ─────────────────────────────────────────────
    // 防重复同步：before 同步只允许执行一次（除非 force=true）
    // ─────────────────────────────────────────────
    if (sync_type === 'before' && !force) {
      const exhibition = db.prepare('SELECT square_synced_at FROM exhibitions WHERE id = ?').get(exhibition_id);
      if (exhibition && exhibition.square_synced_at) {
        return res.status(409).json({
          success: false,
          already_synced: true,
          synced_at: exhibition.square_synced_at,
          message: `该展会已于 ${exhibition.square_synced_at} 同步过 Square，如需重新同步请使用强制同步。`,
        });
      }
    }

    // 获取展会商品清单（通过 VIEW 获取 sku/gtin/product_title/variant_title 等商品信息）
    const items = db.prepare('SELECT * FROM exhibition_items_view WHERE exhibition_id = ?').all(exhibition_id);
    if (!items.length) {
      return res.status(400).json({ success: false, message: '展会清单为空' });
    }

    // ─────────────────────────────────────────────
    // 优化 1：只拉取一次 Square 目录（TTL 缓存命中时 0 次 API）
    // ─────────────────────────────────────────────
    console.log(`[sync] 开始同步，共 ${items.length} 件商品，sync_type=${sync_type}，force=${!!force}`);
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

          // newTotalQty = Square 同步后实际总量（原有库存 + 带走增量）
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
                'UPDATE inventory_snapshots SET square_catalog_variation_id = ?, square_quantity_before = ?, square_quantity_after = NULL, sold_quantity = NULL, remaining_quantity = NULL, synced_at = CURRENT_TIMESTAMP WHERE id = ?'
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

      // ─────────────────────────────────────────────
      // 同步完成后：记录 exhibitions.square_synced_at（防重复锁）
      // ─────────────────────────────────────────────
      try {
        db.prepare(
          'UPDATE exhibitions SET square_synced_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).run(exhibition_id);
        console.log(`[sync] 已记录 exhibitions.square_synced_at for ${exhibition_id}`);
      } catch (dbErr) {
        console.warn('[sync] 更新 square_synced_at 失败:', dbErr.message);
      }

    } else if (sync_type === 'after') {
      // ═══════════════════════════════════════════
      // 展会结束后：读取 Square 当前剩余量，计算卖出量
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

    // ── 按商品名分组，同一商品的所有 variant 合并为一个 Square ITEM ──
    const groups = {};
    for (const item of items) {
      const key = item.name.trim();
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }

    for (const [groupName, groupItems] of Object.entries(groups)) {
      try {
        const ts = Date.now();
        const variationsPayload = groupItems.map((item, idx) => ({
          variantName: item.variantName || 'Default',
          sku: item.sku || '',
          gtin: item.gtin || '',
          priceCents: item.priceCents || 0,
          clientId: `#variation-${ts}-${idx}`,
          _item: item,
        }));

        const { itemId, variationResults } = await squareService.createCatalogItem(
          { name: groupName, description: groupItems[0].description || '' },
          variationsPayload
        );

        for (let i = 0; i < groupItems.length; i++) {
          const item = groupItems[i];
          const variationId = variationResults[i]?.variationId;
          const plannedQty = item.planned_quantity || 0;

          if (!variationId) {
            results.push({
              shopify_variant_id: item.shopify_variant_id,
              product_title: item.name,
              variant_title: item.variantName,
              status: 'error',
              message: '无法获取 Square variation ID',
            });
            continue;
          }

          if (plannedQty > 0) {
            await squareService.setInventoryQuantity(variationId, plannedQty);
          }

          try {
            const existing = db.prepare(
              'SELECT id FROM inventory_snapshots WHERE exhibition_id = ? AND shopify_variant_id = ?'
            ).get(exhibition_id, item.shopify_variant_id);

            if (existing) {
              db.prepare(
                'UPDATE inventory_snapshots SET square_catalog_variation_id = ?, square_quantity_before = ?, square_quantity_after = NULL, sold_quantity = NULL, remaining_quantity = NULL, synced_at = CURRENT_TIMESTAMP WHERE id = ?'
              ).run(variationId, plannedQty, existing.id);
            } else {
              db.prepare(
                'INSERT INTO inventory_snapshots (id, exhibition_id, shopify_variant_id, square_catalog_variation_id, square_quantity_before) VALUES (?, ?, ?, ?, ?)'
              ).run(snapshotId(db), exhibition_id, item.shopify_variant_id, variationId, plannedQty);
            }

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
        }
      } catch (groupErr) {
        for (const item of groupItems) {
          results.push({
            shopify_variant_id: item.shopify_variant_id,
            product_title: item.name,
            variant_title: item.variantName,
            status: 'error',
            message: groupErr.message,
          });
        }
      }
    }

    const successCount = results.filter((r) => r.status === 'created').length;
    const failCount = results.filter((r) => r.status === 'error').length;

    // 创建商品成功后也记录同步时间
    if (successCount > 0) {
      try {
        db.prepare(
          'UPDATE exhibitions SET square_synced_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).run(exhibition_id);
      } catch (dbErr) {
        console.warn('[create-items] 更新 square_synced_at 失败:', dbErr.message);
      }
    }

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

/**
 * 获取展会的 Square 同步状态
 * GET /api/square/sync-status/:exhibition_id
 */
router.get('/sync-status/:exhibition_id', (req, res) => {
  try {
    const exhibition = db.prepare(
      'SELECT id, name, square_synced_at FROM exhibitions WHERE id = ?'
    ).get(req.params.exhibition_id);
    if (!exhibition) {
      return res.status(404).json({ success: false, message: '展会不存在' });
    }
    res.json({
      success: true,
      exhibition_id: exhibition.id,
      exhibition_name: exhibition.name,
      synced: !!exhibition.square_synced_at,
      synced_at: exhibition.square_synced_at || null,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 展中补货检查 - 拉取 Square 实时库存，计算 sold 和补货需求
 * GET /api/square/replenishment-check/:exhibition_id
 * 
 * 逻辑：
 * - sold（累计已售）= last_synced_quantity（展前基准）- 当前 Square 库存
 * - 补货判断基准 = replenish_baseline（上次补货时的 Square 数量，首次为 last_synced_quantity）
 * - since_last_replenish = replenish_baseline - 当前 Square 库存
 * - since_last_replenish >= rack / 2 → 需要补货
 * - since_last_replenish >= rack → 优先补货
 * - storage_left = stock_quantity - replenished_qty
 */
router.get('/replenishment-check/:exhibition_id', async (req, res) => {
  try {
    const { exhibition_id } = req.params;

    // 确保 replenish_baseline 字段存在
    try {
      db.prepare(`ALTER TABLE exhibition_items ADD COLUMN replenish_baseline INTEGER`).run();
    } catch (e) { /* 字段已存在则忽略 */ }

    // 1. 获取展会商品
    const items = db.prepare(`
      SELECT ei.*, pv.variant_title, pv.sku, pv.gtin, pv.image_url, p.title AS product_title
      FROM exhibition_items ei
      LEFT JOIN product_variants pv ON pv.shopify_variant_id = ei.shopify_variant_id
      LEFT JOIN products p ON p.id = pv.product_id
      WHERE ei.exhibition_id = ?
    `).all(exhibition_id);

    if (items.length === 0) {
      return res.json({ success: true, data: [], summary: { total: 0, needs_replenishment: 0, priority: 0 } });
    }

    // 2. 获取 inventory_snapshots 中的 square_catalog_variation_id
    const snapshots = db.prepare(
      'SELECT shopify_variant_id, square_catalog_variation_id FROM inventory_snapshots WHERE exhibition_id = ?'
    ).all(exhibition_id);
    const snapshotMap = {};
    snapshots.forEach(s => { snapshotMap[s.shopify_variant_id] = s.square_catalog_variation_id; });

    // 3. 批量获取 Square 实时库存
    const variationIds = snapshots
      .filter(s => s.square_catalog_variation_id)
      .map(s => s.square_catalog_variation_id);

    let inventoryCounts = {};
    if (variationIds.length > 0) {
      inventoryCounts = await squareService.batchGetInventoryCounts(variationIds);
    }

    // 4. 计算每个商品的补货状态
    const result = items.map(item => {
      const variationId = snapshotMap[item.shopify_variant_id];
      const currentSquareQty = variationId ? (inventoryCounts[variationId] ?? null) : null;
      const lastSyncedQty = item.last_synced_quantity || 0;
      const rackQty = item.rack_quantity || 0;
      const stockQty = item.stock_quantity || 0;
      const replenishedQty = item.replenished_qty || 0;
      const storageLeft = Math.max(0, stockQty - replenishedQty);

      // 补货基准：上次补货时记录的 Square 数量，首次为展前同步数量
      const baseline = item.replenish_baseline !== null && item.replenish_baseline !== undefined
        ? item.replenish_baseline
        : lastSyncedQty;

      // sold = 展前基准 - 当前 Square 库存（全程累计）
      const sold = currentSquareQty !== null
        ? Math.max(0, lastSyncedQty - currentSquareQty)
        : 0;

      // 自上次补货后卖出 = 补货基准 - 当前 Square 库存
      const sinceLastReplenish = currentSquareQty !== null
        ? Math.max(0, baseline - currentSquareQty)
        : 0;

      // 判断补货状态
      let status = 'ok'; // 充足
      if (storageLeft <= 0 && sinceLastReplenish >= Math.ceil(rackQty / 2)) {
        status = 'storage_empty'; // 备货已空
      } else if (rackQty > 0 && sinceLastReplenish >= rackQty) {
        status = 'priority'; // 优先补货
      } else if (rackQty > 0 && sinceLastReplenish >= Math.ceil(rackQty / 2)) {
        status = 'need'; // 需要补货
      }

      // 建议补货数量
      const suggestedQty = (status === 'need' || status === 'priority')
        ? Math.min(3, storageLeft)
        : 0;

      return {
        id: item.id,
        shopify_variant_id: item.shopify_variant_id,
        product_title: item.product_title,
        variant_title: item.variant_title,
        sku: item.sku,
        image_url: item.image_url,
        rack_quantity: rackQty,
        storage: stockQty,
        storage_left: storageLeft,
        sold,
        since_last_replenish: sinceLastReplenish,
        status,
        suggested_qty: suggestedQty,
        square_variation_id: variationId || null,
      };
    });

    // 排序：优先补货 > 需要补货 > 备货已空 > 充足
    const statusOrder = { priority: 0, need: 1, storage_empty: 2, ok: 3 };
    result.sort((a, b) => (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3));

    const priorityCount = result.filter(r => r.status === 'priority').length;
    const needCount = result.filter(r => r.status === 'need' || r.status === 'priority').length;
    res.json({
      success: true,
      data: result,
      summary: {
        total: result.length,
        needs_replenishment: needCount,
        priority: priorityCount,
      },
    });
  } catch (err) {
    console.error('[replenishment-check] 错误:', err.message);
    res.status(500).json({ success: false, message: '补货检查失败: ' + err.message });
  }
});

/**
 * 确认补货 - 更新 replenished_qty 和 replenish_baseline，记录日志
 * POST /api/square/replenishment-confirm
 * Body: { exhibition_id, items: [{ shopify_variant_id, replenish_qty, current_square_qty }] }
 * 
 * 补货后：
 * - replenished_qty += replenish_qty（累计补货数）
 * - replenish_baseline = current_square_qty（记录此刻 Square 数量作为下次判断基准）
 */
router.post('/replenishment-confirm', (req, res) => {
  try {
    const { exhibition_id, items } = req.body;
    if (!exhibition_id || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: '参数不完整' });
    }

    // 确保 replenishment_log 表存在
    db.prepare(`
      CREATE TABLE IF NOT EXISTS replenishment_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exhibition_id TEXT NOT NULL,
        shopify_variant_id TEXT NOT NULL,
        replenish_qty INTEGER NOT NULL,
        baseline_before INTEGER,
        baseline_after INTEGER,
        replenished_total_before INTEGER,
        replenished_total_after INTEGER,
        storage_left INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    const updateStmt = db.prepare(`
      UPDATE exhibition_items
      SET replenished_qty = COALESCE(replenished_qty, 0) + ?,
          replenish_baseline = ?
      WHERE exhibition_id = ? AND shopify_variant_id = ?
    `);

    const getStmt = db.prepare(`
      SELECT rack_quantity, stock_quantity, COALESCE(replenished_qty, 0) AS replenished_qty,
             replenish_baseline, last_synced_quantity
      FROM exhibition_items
      WHERE exhibition_id = ? AND shopify_variant_id = ?
    `);

    const logStmt = db.prepare(`
      INSERT INTO replenishment_log (exhibition_id, shopify_variant_id, replenish_qty, baseline_before, baseline_after, replenished_total_before, replenished_total_after, storage_left)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const results = [];
    const transaction = db.transaction(() => {
      for (const { shopify_variant_id, replenish_qty, current_square_qty } of items) {
        const qty = parseInt(replenish_qty) || 3;
        if (qty <= 0) continue;

        // 获取当前值
        const before = getStmt.get(exhibition_id, shopify_variant_id);
        if (!before) continue;

        const oldBaseline = before.replenish_baseline !== null
          ? before.replenish_baseline
          : before.last_synced_quantity;
        const newBaseline = current_square_qty !== null && current_square_qty !== undefined
          ? current_square_qty
          : oldBaseline;

        // 更新：累加 replenished_qty，设置新 baseline
        updateStmt.run(qty, newBaseline, exhibition_id, shopify_variant_id);

        const newReplenishedTotal = before.replenished_qty + qty;
        const storageLeft = Math.max(0, (before.stock_quantity || 0) - newReplenishedTotal);

        // 记录日志
        logStmt.run(
          exhibition_id, shopify_variant_id, qty,
          oldBaseline, newBaseline,
          before.replenished_qty, newReplenishedTotal,
          storageLeft
        );

        results.push({
          shopify_variant_id,
          replenish_qty: qty,
          baseline_before: oldBaseline,
          baseline_after: newBaseline,
          storage_left: storageLeft,
        });
      }
    });

    transaction();

    res.json({
      success: true,
      data: results,
      message: `成功补货 ${results.length} 个商品`,
    });
  } catch (err) {
    console.error('[replenishment-confirm] 错误:', err.message);
    res.status(500).json({ success: false, message: '补货确认失败: ' + err.message });
  }
});

/**
 * 获取补货历史记录
 * GET /api/square/replenishment-log/:exhibition_id
 */
router.get('/replenishment-log/:exhibition_id', (req, res) => {
  try {
    const logs = db.prepare(`
      SELECT rl.*, pv.variant_title, p.title AS product_title
      FROM replenishment_log rl
      LEFT JOIN product_variants pv ON pv.shopify_variant_id = rl.shopify_variant_id
      LEFT JOIN products p ON p.id = pv.product_id
      WHERE rl.exhibition_id = ?
      ORDER BY rl.created_at DESC
    `).all(req.params.exhibition_id);
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
module.exports = router;
