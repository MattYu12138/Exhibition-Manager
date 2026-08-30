const express = require('express');
const router = express.Router();
const squareService = require('../services/square');
const db = require('../db');
const { snapshotId } = require('../utils/snowflake');
const crypto = require('crypto');

// ─────────────────────────────────────────────
// 内存任务存储（用于异步同步任务的进度追踪）
// ─────────────────────────────────────────────
const syncTasks = new Map();

// 自动清理已完成超过 30 分钟的任务
setInterval(() => {
  const now = Date.now();
  for (const [id, task] of syncTasks) {
    if ((task.status === 'completed' || task.status === 'failed') && (now - task.updatedAt > 30 * 60 * 1000)) {
      syncTasks.delete(id);
    }
  }
}, 5 * 60 * 1000);

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

    // 检查是否已有正在进行的同步任务
    for (const [, task] of syncTasks) {
      if (task.exhibition_id === exhibition_id && task.status === 'running') {
        return res.json({
          success: true,
          task_id: task.id,
          message: '同步任务已在进行中',
        });
      }
    }

    // 获取展会商品清单
    const items = db.prepare('SELECT * FROM exhibition_items_view WHERE exhibition_id = ?').all(exhibition_id);
    if (!items.length) {
      return res.status(400).json({ success: false, message: '展会清单为空' });
    }

    // ─────────────────────────────────────────────
    // 创建异步任务，立即返回 task_id
    // ─────────────────────────────────────────────
    const taskId = crypto.randomUUID();
    const task = {
      id: taskId,
      exhibition_id,
      sync_type,
      force: !!force,
      status: 'running',      // running | completed | failed
      total: items.length,
      completed: 0,
      synced: 0,
      skipped: 0,
      failed: 0,
      unmatched: 0,
      currentItem: '',
      message: '正在初始化...',
      results: null,
      error: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    syncTasks.set(taskId, task);

    // 立即返回 task_id，后台异步执行
    res.json({ success: true, task_id: taskId, message: '同步任务已启动' });

    // ─────────────────────────────────────────────
    // 后台异步执行同步逻辑
    // ─────────────────────────────────────────────
    (async () => {
      try {
        task.message = '正在拉取 Square 商品目录...';
        task.updatedAt = Date.now();
        const catalog = await squareService.getAllCatalogItems();

        task.message = '正在匹配商品...';
        task.updatedAt = Date.now();
        const matchResults = await Promise.all(
          items.map(async (item) => {
            const match = await squareService.findVariationByGtinOrSku(item.gtin, item.sku, catalog);
            return { item, match };
          })
        );

        const matched = matchResults.filter((r) => r.match !== null);
        const unmatchedItems = matchResults.filter((r) => r.match === null);

        const results = [];
        const unmatched = [];

        // 收集未匹配商品
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
        task.unmatched = unmatched.length;
        task.updatedAt = Date.now();

        if (matched.length === 0) {
          task.status = 'completed';
          task.completed = task.total;
          task.message = '同步完成（无匹配商品）';
          task.results = { data: results, unmatched, unmatched_count: unmatched.length };
          task.updatedAt = Date.now();
          return;
        }

        // 批量获取库存
        task.message = '正在获取 Square 库存数据...';
        task.updatedAt = Date.now();
        const variationIds = matched.map((r) => r.match.variationId);
        const inventoryCounts = await squareService.batchGetInventoryCounts(variationIds);

        if (sync_type === 'before') {
          // 过滤需要实际写入的商品
          // force 模式下不跳过任何商品，确保 square_quantity_before 重新记录
          const toSync = task.force
            ? matched
            : matched.filter(({ item }) => {
                const lastSyncedQty = item.last_synced_quantity;
                const plannedQty = item.planned_quantity;
                return !(lastSyncedQty !== null && lastSyncedQty !== undefined && lastSyncedQty === plannedQty);
              });

          // 记录跳过的商品（force 模式下不跳过）
          if (!task.force) {
            for (const { item } of matched) {
              const lastSyncedQty = item.last_synced_quantity;
              const plannedQty = item.planned_quantity;
              if (lastSyncedQty !== null && lastSyncedQty !== undefined && lastSyncedQty === plannedQty) {
                task.skipped++;
                task.completed++;
                results.push({
                  shopify_variant_id: item.shopify_variant_id,
                  product_title: item.product_title,
                  variant_title: item.variant_title,
                  status: 'skipped',
                  message: `数量未变动（${plannedQty}），跳过同步`,
                });
              }
            }
          }

          // 更新总数（只算需要实际同步的 + 跳过的 + 未匹配的）
          task.total = toSync.length + task.skipped + unmatched.length;
          task.completed = task.skipped + unmatched.length;
          task.message = `正在同步库存到 Square（0/${toSync.length}）...`;
          task.updatedAt = Date.now();

          // 分批写入库存
          const batchTasks = toSync.map(({ item, match }) => async () => {
            const plannedQty = item.planned_quantity;
            const lastSyncedQty = item.last_synced_quantity;
            const currentQty = inventoryCounts[match.variationId] ?? 0;

            const deltaQty = (lastSyncedQty !== null && lastSyncedQty !== undefined)
              ? plannedQty - lastSyncedQty
              : plannedQty;

            const newTotalQty = Math.max(0, currentQty + deltaQty);

            await squareService.setInventoryQuantityWithRetry(match.variationId, newTotalQty);

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
              console.warn('[sync] 快照写入失败:', dbErr.message);
            }

            task.synced++;
            task.completed++;
            task.currentItem = `${item.product_title} - ${item.variant_title}`;
            task.message = `正在同步库存到 Square（${task.synced}/${toSync.length}）...`;
            task.updatedAt = Date.now();

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
          });

          await squareService.executeBatched(batchTasks, 10, 1100, (batchCompleted, batchTotal) => {
            console.log(`[sync] 进度: ${batchCompleted}/${batchTotal}`);
          });

          // 同步完成后记录 square_synced_at
          try {
            db.prepare(
              'UPDATE exhibitions SET square_synced_at = CURRENT_TIMESTAMP WHERE id = ?'
            ).run(exhibition_id);
          } catch (dbErr) {
            console.warn('[sync] 更新 square_synced_at 失败:', dbErr.message);
          }

        } else if (sync_type === 'after') {
          task.total = matched.length + unmatched.length;
          task.completed = unmatched.length;
          task.message = '正在计算卖出量...';
          task.updatedAt = Date.now();

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

            task.synced++;
            task.completed++;
            task.updatedAt = Date.now();

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

        // 任务完成
        task.status = 'completed';
        task.message = `同步完成！成功 ${task.synced} 件，跳过 ${task.skipped} 件，未匹配 ${task.unmatched} 件`;
        task.results = { data: results, unmatched, unmatched_count: unmatched.length };
        task.updatedAt = Date.now();
        console.log(`[sync] 任务 ${taskId} 完成: ${task.message}`);

      } catch (err) {
        task.status = 'failed';
        task.error = err.message;
        task.message = `同步失败: ${err.message}`;
        task.updatedAt = Date.now();
        console.error(`[sync] 任务 ${taskId} 失败:`, err.message);
      }
    })();

  } catch (err) {
    console.error('Square 同步启动失败:', err.message);
    res.status(500).json({ success: false, message: 'Square 同步启动失败: ' + err.message });
  }
});

/**
 * 查询同步任务进度
 * GET /api/square/sync-task/:task_id
 */
router.get('/sync-task/:task_id', (req, res) => {
  const task = syncTasks.get(req.params.task_id);
  if (!task) {
    return res.status(404).json({ success: false, message: '任务不存在或已过期' });
  }
  res.json({
    success: true,
    task_id: task.id,
    status: task.status,
    total: task.total,
    completed: task.completed,
    synced: task.synced,
    skipped: task.skipped,
    failed: task.failed,
    unmatched: task.unmatched,
    progress: task.total > 0 ? Math.round((task.completed / task.total) * 100) : 0,
    message: task.message,
    currentItem: task.currentItem,
    error: task.error,
    results: task.status === 'completed' ? task.results : null,
  });
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
            await squareService.setInventoryQuantityWithRetry(variationId, plannedQty);
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
 * - sold（累计已售）= square_quantity_before（展前 Square 库存）- 当前 Square 库存
 * - 补货判断基准：
 *   - replenish_count = 0（从未补货）→ baseline = square_quantity_before
 *   - replenish_count >= 1（已补过货）→ baseline = replenish_baseline（上次补货时记录的 Square 数量）
 * - since_last_replenish = baseline - 当前 Square 库存
 * - since_last_replenish >= rack / 2 → 需要补货
 * - since_last_replenish >= rack → 优先补货
 * - 不再计算备货数量；stock_available 由员工人工确认
 */
router.get('/replenishment-check/:exhibition_id', async (req, res) => {
  try {
    const { exhibition_id } = req.params;

    // ─────────────────────────────────────────────
    // 前置检查：必须先完成 Square 同步才能使用展中补货
    // ─────────────────────────────────────────────
    const exhibition = db.prepare('SELECT square_synced_at FROM exhibitions WHERE id = ?').get(exhibition_id);
    if (!exhibition) {
      return res.status(404).json({ success: false, message: '展会不存在' });
    }
    if (!exhibition.square_synced_at) {
      return res.status(403).json({
        success: false,
        not_synced: true,
        message: '请先在清点页面完成"同步到 Square"后，才能使用展中补货功能。',
      });
    }

    // 确保新字段存在
    try {
      db.prepare(`ALTER TABLE exhibition_items ADD COLUMN replenish_baseline INTEGER`).run();
    } catch (e) { /* 字段已存在则忽略 */ }
    try {
      db.prepare(`ALTER TABLE exhibition_items ADD COLUMN replenish_count INTEGER DEFAULT 0`).run();
    } catch (e) { /* 字段已存在则忽略 */ }
    try {
      db.prepare(`ALTER TABLE exhibition_items ADD COLUMN replenished_qty INTEGER DEFAULT 0`).run();
    } catch (e) { /* 字段已存在则忽略 */ }
    try {
      db.prepare(`ALTER TABLE exhibition_items ADD COLUMN rack_remaining INTEGER DEFAULT NULL`).run();
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

    // 2. 获取 inventory_snapshots 中的 square_catalog_variation_id 和 square_quantity_before
    const snapshots = db.prepare(
      'SELECT shopify_variant_id, square_catalog_variation_id, square_quantity_before FROM inventory_snapshots WHERE exhibition_id = ?'
    ).all(exhibition_id);
    const snapshotMap = {};
    const qtyBeforeMap = {};
    snapshots.forEach(s => {
      snapshotMap[s.shopify_variant_id] = s.square_catalog_variation_id;
      qtyBeforeMap[s.shopify_variant_id] = s.square_quantity_before || 0;
    });

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
      const squareQtyBefore = qtyBeforeMap[item.shopify_variant_id] || 0;
      const rackQty = item.rack_quantity || 0;
      const replenishCount = item.replenish_count || 0;
      const stockAvailable = item.stock_available !== 0;

      // 补货基准：
      // replenish_count = 0（从未补货）→ 使用 square_quantity_before
      // replenish_count >= 1（已补过货）→ 使用 replenish_baseline
      const baseline = replenishCount >= 1 && item.replenish_baseline !== null && item.replenish_baseline !== undefined
        ? item.replenish_baseline
        : squareQtyBefore;

      // sold = 展前 Square 库存 - 当前 Square 库存（全程累计）
      const sold = currentSquareQty !== null
        ? Math.max(0, squareQtyBefore - currentSquareQty)
        : 0;

      // 自上次补货后卖出 = baseline - 当前 Square 库存
      const sinceLastReplenish = currentSquareQty !== null
        ? Math.max(0, baseline - currentSquareQty)
        : 0;

      // 衣架实时剩余：
      // 从未补货时以计划衣架数量为基准；补货后以员工本次实际补完后的衣架数量为基准。
      // 这样默认补满时回到 rackQty；若员工把默认 3 改成 2，只增加实际补的 2 件。
      const rackBaselineQty = replenishCount >= 1 && item.replenish_rack_quantity !== null && item.replenish_rack_quantity !== undefined
        ? item.replenish_rack_quantity
        : rackQty;
      const rackRemaining = rackBaselineQty - sinceLastReplenish;

      // 判断补货状态：备货状态由员工人工确认，不再依赖库存数量
      let status = 'ok';
      if (!stockAvailable) {
        status = 'storage_empty'; // 员工已标记无备货，不再进入待补货提醒
      } else if (rackQty > 0 && rackRemaining <= 0) {
        status = 'priority'; // 衣架已空，优先补货
      } else if (rackQty > 0 && rackRemaining < Math.ceil(rackQty / 2)) {
        status = 'need'; // 衣架剩余不足一半，需要补货
      }

      // 建议补货数量：默认补满衣架，不再受备货数量限制；员工可在确认前修改
      const suggestedQty = (status === 'need' || status === 'priority')
        ? Math.max(0, rackQty - rackRemaining)
        : 0;

      return {
        id: item.id,
        shopify_variant_id: item.shopify_variant_id,
        product_title: item.product_title,
        variant_title: item.variant_title,
        sku: item.sku,
        image_url: item.image_url,
        rack_quantity: rackQty,
        rack_baseline_quantity: rackBaselineQty,
        stock_available: stockAvailable,
        sold,
        rack_remaining: rackRemaining,
        since_last_replenish: sinceLastReplenish,
        status,
        suggested_qty: suggestedQty,
        square_variation_id: variationId || null,
        current_square_qty: currentSquareQty,
      };
    });

    // 排序：优先补货 > 需要补货 > 充足 > 人工标记无备货；未设置衣架的排到最后
    const statusOrder = { priority: 0, need: 1, ok: 2, storage_empty: 3 };
    result.sort((a, b) => {
      const aNoRack = a.rack_quantity <= 0 ? 1 : 0;
      const bNoRack = b.rack_quantity <= 0 ? 1 : 0;
      if (aNoRack !== bNoRack) return aNoRack - bNoRack;
      return (statusOrder[a.status] ?? 2) - (statusOrder[b.status] ?? 2);
    });

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
 * 确认补货 - 更新 replenish_baseline 和 replenish_count，并记录本次补货数量
 * POST /api/square/replenishment-confirm
 * Body: { exhibition_id, items: [{ shopify_variant_id, replenish_qty }] }
 *
 * 补货后：
 * - 不再累计或扣减备货库存
 * - replenish_baseline = 实时 Square 库存（后端实时查询，确保精确）
 * - replenish_count += 1（补货计数器递增）
 * 
 * 重要修复：baseline 不再依赖前端传来的旧 current_square_qty，
 * 而是在确认时由后端实时查询 Square API 获取最新库存，避免时间差导致的偏差。
 */
router.post('/replenishment-confirm', async (req, res) => {
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

    // ─────────────────────────────────────────────
    // 关键修复：实时从 Square 获取最新库存作为 baseline
    // ─────────────────────────────────────────────
    const snapshots = db.prepare(
      'SELECT shopify_variant_id, square_catalog_variation_id FROM inventory_snapshots WHERE exhibition_id = ?'
    ).all(exhibition_id);
    const variationMap = {};
    snapshots.forEach(s => {
      if (s.square_catalog_variation_id) {
        variationMap[s.shopify_variant_id] = s.square_catalog_variation_id;
      }
    });

    // 收集需要查询的 variation IDs
    const neededVariationIds = [];
    for (const { shopify_variant_id } of items) {
      const vid = variationMap[shopify_variant_id];
      if (vid && !neededVariationIds.includes(vid)) {
        neededVariationIds.push(vid);
      }
    }

    // 批量实时查询 Square 库存
    let liveInventory = {};
    if (neededVariationIds.length > 0) {
      liveInventory = await squareService.batchGetInventoryCounts(neededVariationIds);
    }
    console.log('[replenishment-confirm] 实时查询 Square 库存完成，共', neededVariationIds.length, '个变体');

    const updateStmt = db.prepare(`
      UPDATE exhibition_items
      SET replenish_baseline = ?,
          replenish_rack_quantity = ?,
          replenish_count = COALESCE(replenish_count, 0) + 1,
          rack_remaining = NULL
      WHERE exhibition_id = ? AND shopify_variant_id = ?
    `);

    const getStmt = db.prepare(`
      SELECT rack_quantity, replenish_baseline, replenish_rack_quantity,
             COALESCE(replenish_count, 0) AS replenish_count,
             rack_remaining
      FROM exhibition_items
      WHERE exhibition_id = ? AND shopify_variant_id = ?
    `);

    const getSnapshotStmt = db.prepare(`
      SELECT square_quantity_before FROM inventory_snapshots
      WHERE exhibition_id = ? AND shopify_variant_id = ?
    `);

    const logStmt = db.prepare(`
      INSERT INTO replenishment_log (exhibition_id, shopify_variant_id, replenish_qty, baseline_before, baseline_after, replenished_total_before, replenished_total_after, storage_left)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const results = [];
    const transaction = db.transaction(() => {
      for (const { shopify_variant_id, replenish_qty } of items) {
        const qty = parseInt(replenish_qty) || 3;
        if (qty <= 0) continue;

        // 获取当前值
        const before = getStmt.get(exhibition_id, shopify_variant_id);
        if (!before) continue;

        // 获取展前基准
        const snapshot = getSnapshotStmt.get(exhibition_id, shopify_variant_id);
        const squareQtyBefore = snapshot ? (snapshot.square_quantity_before || 0) : 0;

        // 计算旧 baseline
        const oldBaseline = before.replenish_count >= 1 && before.replenish_baseline !== null
          ? before.replenish_baseline
          : squareQtyBefore;

        // 新 baseline = 实时 Square 库存（后端刚刚查询的最新值）
        const vid = variationMap[shopify_variant_id];
        const liveSquareQty = vid ? (liveInventory[vid] ?? null) : null;
        const newBaseline = liveSquareQty !== null ? liveSquareQty : oldBaseline;

        // 计算确认补货前的衣架剩余，并只加上员工实际确认的数量
        const previousRackBaseline = before.replenish_count >= 1 && before.replenish_rack_quantity !== null
          ? before.replenish_rack_quantity
          : (before.rack_quantity || 0);
        const soldSincePreviousBaseline = liveSquareQty !== null
          ? Math.max(0, oldBaseline - liveSquareQty)
          : 0;
        const rackRemainingBefore = previousRackBaseline - soldSincePreviousBaseline;
        const newRackBaseline = Math.min(before.rack_quantity || 0, rackRemainingBefore + qty);

        // 只更新新的 Square 基准、实际衣架基准和补货次数；不再累计或扣减备货库存
        updateStmt.run(newBaseline, newRackBaseline, exhibition_id, shopify_variant_id);

        // 保留本次补货历史；旧的库存统计字段写入 NULL，仅用于兼容现有表结构
        logStmt.run(
          exhibition_id, shopify_variant_id, qty,
          oldBaseline, newBaseline,
          null, null,
          null
        );

        results.push({
          shopify_variant_id,
          replenish_qty: qty,
          baseline_before: oldBaseline,
          baseline_after: newBaseline,
          rack_remaining_before: rackRemainingBefore,
          rack_remaining_after: newRackBaseline,
          live_square_qty: liveSquareQty,
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
/**
 * 人工设置商品是否还有备货
 * PUT /api/square/replenishment-stock-status/:exhibition_id
 * Body: { shopify_variant_id, stock_available }
 * 状态按展会和商品变体独立保存，不维护具体备货数量。
 */
router.put('/replenishment-stock-status/:exhibition_id', (req, res) => {
  try {
    const { exhibition_id } = req.params;
    const { shopify_variant_id, stock_available } = req.body;

    if (!shopify_variant_id || typeof stock_available !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'shopify_variant_id and boolean stock_available are required',
      });
    }

    const result = db.prepare(`
      UPDATE exhibition_items
      SET stock_available = ?
      WHERE exhibition_id = ? AND shopify_variant_id = ?
    `).run(stock_available ? 1 : 0, exhibition_id, shopify_variant_id);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }

    res.json({
      success: true,
      message: stock_available ? '已恢复为有备货' : '已标记为无备货',
      data: { shopify_variant_id, stock_available },
    });
  } catch (err) {
    console.error('[replenishment-stock-status] error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
