/**
 * 拣货任务路由
 * 支持 Shopify 订单拣货 和 展会备货拣货两种模式
 */
const express = require('express');
const router = express.Router();
const { db, nextPickTaskId, nextPickLineId, nextInventoryId, nextMovementId } = require('../db');
const { requireLogin, requireStaff } = require('../middleware/auth');

const shopifyService = require('../services/shopify');

// ── GET /api/picking/tasks  列出拣货任务 ────────────────────────────────────
router.get('/tasks', requireLogin, (req, res) => {
  try {
    const { status, task_type } = req.query;
    let sql = `
      SELECT wpt.*,
        u1.username AS assigned_to_name,
        u2.username AS created_by_name,
        e.name AS exhibition_name,
        (SELECT COUNT(*) FROM warehouse_pick_lines WHERE task_id = wpt.id) AS total_lines,
        (SELECT COUNT(*) FROM warehouse_pick_lines WHERE task_id = wpt.id AND status = 'picked') AS picked_lines
      FROM warehouse_pick_tasks wpt
      LEFT JOIN users u1 ON u1.id = wpt.assigned_to
      LEFT JOIN users u2 ON u2.id = wpt.created_by
      LEFT JOIN exhibitions e ON e.id = wpt.exhibition_id
      WHERE 1=1
    `;
    const params = [];
    if (status)    { sql += ' AND wpt.status = ?';    params.push(status); }
    if (task_type) { sql += ' AND wpt.task_type = ?'; params.push(task_type); }
    sql += ' ORDER BY wpt.created_at DESC';

    const tasks = db.prepare(sql).all(...params);
    res.json({ success: true, data: tasks });
  } catch (err) {
    console.error('[picking] list tasks:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/picking/tasks/:id  获取拣货任务详情（含行、货位地图数据） ────────
router.get('/tasks/:id', requireLogin, (req, res) => {
  try {
    const task = db.prepare(`
      SELECT wpt.*, e.name AS exhibition_name
      FROM warehouse_pick_tasks wpt
      LEFT JOIN exhibitions e ON e.id = wpt.exhibition_id
      WHERE wpt.id = ?
    `).get(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: '任务不存在' });

    const lines = db.prepare(`
      SELECT wpl.*,
        wl.code AS location_code, wl.label AS location_label,
        wl.zone, wl.row_no, wl.col_no, wl.grid_x, wl.grid_y,
        pv.sku, pv.image_url,
        p.main_image
      FROM warehouse_pick_lines wpl
      LEFT JOIN warehouse_locations wl ON wl.id = wpl.location_id
      LEFT JOIN product_variants pv ON pv.shopify_variant_id = wpl.shopify_variant_id
      LEFT JOIN products p ON p.id = pv.product_id
      WHERE wpl.task_id = ?
      ORDER BY wl.zone, wl.row_no, wl.col_no
    `).all(task.id);

    // 动态补充 location_id：如果拣货行没有货位，尝试从最新库存中匹配
    for (const line of lines) {
      if (!line.location_id && line.status !== 'picked') {
        const bestLoc = db.prepare(`
          SELECT wi.location_id, wl.code AS location_code, wl.grid_x, wl.grid_y,
                 wl.zone, wl.row_no, wl.col_no
          FROM warehouse_inventory wi
          JOIN warehouse_locations wl ON wl.id = wi.location_id
          WHERE wi.shopify_variant_id = ? AND wi.quantity > 0
          ORDER BY wi.received_at ASC
          LIMIT 1
        `).get(line.shopify_variant_id);
        if (bestLoc) {
          line.location_id = bestLoc.location_id;
          line.location_code = bestLoc.location_code;
          line.grid_x = bestLoc.grid_x;
          line.grid_y = bestLoc.grid_y;
          line.zone = bestLoc.zone;
          line.row_no = bestLoc.row_no;
          line.col_no = bestLoc.col_no;
          // 同时更新数据库，下次不需要再查
          db.prepare('UPDATE warehouse_pick_lines SET location_id = ?, location_code = ? WHERE id = ?')
            .run(bestLoc.location_id, bestLoc.location_code, line.id);
        }
      }
    }

    // 获取活跃布局（用于地图渲染）
    const layout = db.prepare('SELECT * FROM warehouse_layouts WHERE is_active = 1 LIMIT 1').get();
    let locations = [];
    if (layout) {
      locations = db.prepare(`
        SELECT wl.*,
          COALESCE(SUM(wi.quantity), 0) AS total_qty
        FROM warehouse_locations wl
        LEFT JOIN warehouse_inventory wi ON wi.location_id = wl.id AND wi.quantity > 0
        WHERE wl.layout_id = ? AND wl.is_active = 1
        GROUP BY wl.id
      `).all(layout.id);
    }

    res.json({ success: true, data: { task, lines, layout, locations } });
  } catch (err) {
    console.error('[picking] get task:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/picking/tasks/from-order  从 Shopify 订单创建拣货任务 ──────────
router.post('/tasks/from-order', requireStaff, async (req, res) => {
  try {
    const { shopify_order_id, shopify_order_name, customer_name, line_items } = req.body;
    // line_items: [{ shopify_variant_id, product_title, variant_title, quantity }]
    if (!line_items || line_items.length === 0) {
      return res.status(400).json({ success: false, message: '订单行项目不能为空' });
    }

    const taskId = nextPickTaskId();
    const lines = buildPickLines(line_items);

    db.transaction(() => {
      db.prepare(`
        INSERT INTO warehouse_pick_tasks
          (id, task_type, shopify_order_id, shopify_order_name, customer_name, created_by)
        VALUES (?, 'order', ?, ?, ?, ?)
      `).run(taskId, shopify_order_id || null, shopify_order_name || null, customer_name || null, req.session.user.id);

      for (const line of lines) {
        const lineId = nextPickLineId();
        db.prepare(`
          INSERT INTO warehouse_pick_lines
            (id, task_id, shopify_variant_id, product_title, variant_title,
             required_qty, location_id, location_code)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(lineId, taskId, line.shopify_variant_id, line.product_title, line.variant_title,
               line.required_qty, line.location_id || null, line.location_code || null);
      }
    })();

    const task = db.prepare('SELECT * FROM warehouse_pick_tasks WHERE id = ?').get(taskId);
    res.status(201).json({ success: true, data: task });
  } catch (err) {
    console.error('[picking] from-order:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/picking/tasks/from-exhibition  从展会创建备货任务 ───────────────
router.post('/tasks/from-exhibition', requireStaff, (req, res) => {
  try {
    const { exhibition_id } = req.body;
    if (!exhibition_id) return res.status(400).json({ success: false, message: '缺少 exhibition_id' });

    const exhibition = db.prepare('SELECT * FROM exhibitions WHERE id = ?').get(exhibition_id);
    if (!exhibition) return res.status(404).json({ success: false, message: '展会不存在' });

    // 获取展会所有商品的 planned_quantity
    const items = db.prepare(`
      SELECT ei.shopify_variant_id, ei.planned_quantity,
        pv.variant_title, p.title AS product_title
      FROM exhibition_items ei
      LEFT JOIN product_variants pv ON pv.shopify_variant_id = ei.shopify_variant_id
      LEFT JOIN products p ON p.id = pv.product_id
      WHERE ei.exhibition_id = ? AND ei.planned_quantity > 0
    `).all(exhibition_id);

    if (items.length === 0) {
      return res.status(400).json({ success: false, message: '展会没有商品，请先添加商品' });
    }

    const taskId = nextPickTaskId();
    const lineItems = items.map(i => ({
      shopify_variant_id: i.shopify_variant_id,
      product_title: i.product_title,
      variant_title: i.variant_title,
      quantity: i.planned_quantity,
    }));
    const lines = buildPickLines(lineItems);

    db.transaction(() => {
      db.prepare(`
        INSERT INTO warehouse_pick_tasks
          (id, task_type, exhibition_id, created_by)
        VALUES (?, 'exhibition', ?, ?)
      `).run(taskId, exhibition_id, req.session.user.id);

      for (const line of lines) {
        const lineId = nextPickLineId();
        db.prepare(`
          INSERT INTO warehouse_pick_lines
            (id, task_id, shopify_variant_id, product_title, variant_title,
             required_qty, location_id, location_code)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(lineId, taskId, line.shopify_variant_id, line.product_title, line.variant_title,
               line.required_qty, line.location_id || null, line.location_code || null);
      }
    })();

    const task = db.prepare('SELECT * FROM warehouse_pick_tasks WHERE id = ?').get(taskId);
    res.status(201).json({ success: true, data: task });
  } catch (err) {
    console.error('[picking] from-exhibition:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PATCH /api/picking/tasks/:id/lines/:lineId/pick  确认拣货 ────────────────
router.patch('/tasks/:id/lines/:lineId/pick', requireStaff, (req, res) => {
  try {
    const { picked_qty, note } = req.body;
    if (!picked_qty || picked_qty <= 0) return res.status(400).json({ success: false, message: '拣货数量必须大于 0' });

    const line = db.prepare(`
      SELECT wpl.*, wpt.task_type, wpt.exhibition_id
      FROM warehouse_pick_lines wpl
      JOIN warehouse_pick_tasks wpt ON wpt.id = wpl.task_id
      WHERE wpl.id = ? AND wpl.task_id = ?
    `).get(req.params.lineId, req.params.id);
    if (!line) return res.status(404).json({ success: false, message: '拣货行不存在' });
    if (line.status === 'picked') return res.status(409).json({ success: false, message: '该行已完成拣货' });

    const actualQty = Math.min(picked_qty, line.required_qty - line.picked_qty);

    db.transaction(() => {
      // 扣减库存（优先从指定货位扣，FIFO 顺序）
      let remaining = actualQty;
      const stockType = line.task_type === 'exhibition' ? 'exhibition' : 'retail';

      // 先从指定货位扣
      if (line.location_id && remaining > 0) {
        remaining = deductInventory(line.location_id, line.shopify_variant_id, stockType, line.exhibition_id, remaining, req.params.id, req.session.user.id);
      }

      // 如果指定货位不够，从其他货位补（FIFO）
      if (remaining > 0) {
        const otherLocations = db.prepare(`
          SELECT wi.location_id, wi.quantity, wi.id AS inv_id
          FROM warehouse_inventory wi
          WHERE wi.shopify_variant_id = ? AND wi.stock_type = ?
            ${line.task_type === 'exhibition' ? 'AND wi.exhibition_id = ?' : 'AND wi.exhibition_id IS NULL'}
            AND wi.quantity > 0
            ${line.location_id ? 'AND wi.location_id != ?' : ''}
          ORDER BY wi.received_at ASC
        `).all(...[
          line.shopify_variant_id, stockType,
          ...(line.task_type === 'exhibition' ? [line.exhibition_id] : []),
          ...(line.location_id ? [line.location_id] : []),
        ]);

        for (const loc of otherLocations) {
          if (remaining <= 0) break;
          remaining = deductInventory(loc.location_id, line.shopify_variant_id, stockType, line.exhibition_id, remaining, req.params.id, req.session.user.id);
        }
      }

      // 如果展会货不够，尝试用零售货补充（提示）
      let usedRetailFallback = false;
      if (remaining > 0 && line.task_type === 'exhibition') {
        const retailLocations = db.prepare(`
          SELECT wi.location_id, wi.quantity
          FROM warehouse_inventory wi
          WHERE wi.shopify_variant_id = ? AND wi.stock_type = 'retail' AND wi.quantity > 0
          ORDER BY wi.received_at ASC
        `).all(line.shopify_variant_id);

        for (const loc of retailLocations) {
          if (remaining <= 0) break;
          remaining = deductInventory(loc.location_id, line.shopify_variant_id, 'retail', null, remaining, req.params.id, req.session.user.id);
          usedRetailFallback = true;
        }
      }

      const newPickedQty = line.picked_qty + (actualQty - remaining);
      const newStatus = newPickedQty >= line.required_qty ? 'picked' : (newPickedQty > 0 ? 'partial' : 'pending');

      db.prepare(`
        UPDATE warehouse_pick_lines
        SET picked_qty = ?, status = ?, picked_by = ?, picked_at = datetime('now'), note = ?
        WHERE id = ?
      `).run(newPickedQty, newStatus, req.session.user.id, note || null, line.id);

      // 检查任务是否全部完成
      const allLines = db.prepare('SELECT status FROM warehouse_pick_lines WHERE task_id = ?').all(req.params.id);
      const allPicked = allLines.every(l => l.status === 'picked' || l.status === 'skipped');
      if (allPicked) {
        db.prepare('UPDATE warehouse_pick_tasks SET status = \'completed\', completed_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ?').run(req.params.id);
      } else {
        db.prepare('UPDATE warehouse_pick_tasks SET status = \'in_progress\', updated_at = datetime(\'now\') WHERE id = ?').run(req.params.id);
      }
    })();

    res.json({ success: true });
  } catch (err) {
    console.error('[picking] pick line:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PATCH /api/picking/tasks/:id/lines/:lineId/unpick  取消拣货（回滚库存） ────
router.patch('/tasks/:id/lines/:lineId/unpick', requireStaff, (req, res) => {
  try {
    const line = db.prepare(`
      SELECT wpl.*, wpt.task_type, wpt.exhibition_id
      FROM warehouse_pick_lines wpl
      JOIN warehouse_pick_tasks wpt ON wpt.id = wpl.task_id
      WHERE wpl.id = ? AND wpl.task_id = ?
    `).get(req.params.lineId, req.params.id);
    if (!line) return res.status(404).json({ success: false, message: '拣货行不存在' });
    if (line.status === 'pending') return res.status(400).json({ success: false, message: '该行尚未拣货，无需取消' });

    const qtyToRestore = line.picked_qty;
    if (qtyToRestore <= 0) return res.status(400).json({ success: false, message: '没有可回滚的数量' });

    db.transaction(() => {
      // 回滚库存：将扣减的数量加回指定货位
      if (line.location_id) {
        const stockType = line.task_type === 'exhibition' ? 'exhibition' : 'retail';
        const inv = db.prepare(`
          SELECT * FROM warehouse_inventory
          WHERE location_id = ? AND shopify_variant_id = ? AND stock_type = ?
            ${line.exhibition_id ? 'AND exhibition_id = ?' : 'AND exhibition_id IS NULL'}
          LIMIT 1
        `).get(...[line.location_id, line.shopify_variant_id, stockType, ...(line.exhibition_id ? [line.exhibition_id] : [])]);

        if (inv) {
          const qtyBefore = inv.quantity;
          const qtyAfter = qtyBefore + qtyToRestore;
          db.prepare('UPDATE warehouse_inventory SET quantity = ?, updated_at = datetime(\'now\') WHERE id = ?').run(qtyAfter, inv.id);
          const movId = nextMovementId();
          db.prepare(`
            INSERT INTO warehouse_movements
              (id, inventory_id, location_id, shopify_variant_id, stock_type,
               movement_type, quantity_delta, quantity_before, quantity_after,
               reference_type, reference_id, operated_by)
            VALUES (?, ?, ?, ?, ?, 'inbound', ?, ?, ?, 'pick_unpick', ?, ?)
          `).run(movId, inv.id, line.location_id, line.shopify_variant_id, stockType, qtyToRestore, qtyBefore, qtyAfter, req.params.id, req.session.user.id);
        }
      }

      // 重置拣货行状态
      db.prepare(`
        UPDATE warehouse_pick_lines
        SET picked_qty = 0, status = 'pending', picked_by = NULL, picked_at = NULL, note = NULL
        WHERE id = ?
      `).run(line.id);

      // 更新任务状态
      const allLines = db.prepare('SELECT status FROM warehouse_pick_lines WHERE task_id = ?').all(req.params.id);
      const anyPicked = allLines.some(l => l.id !== line.id && (l.status === 'picked' || l.status === 'partial'));
      if (anyPicked) {
        db.prepare('UPDATE warehouse_pick_tasks SET status = \'in_progress\', updated_at = datetime(\'now\') WHERE id = ?').run(req.params.id);
      } else {
        db.prepare('UPDATE warehouse_pick_tasks SET status = \'pending\', updated_at = datetime(\'now\'), completed_at = NULL WHERE id = ?').run(req.params.id);
      }
    })();

    res.json({ success: true });
  } catch (err) {
    console.error('[picking] unpick line:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/picking/exhibitions  获取展会列表（供创建备货任务选择） ──────────
router.get('/exhibitions', requireLogin, (req, res) => {
  try {
    const exhibitions = db.prepare(`
      SELECT id, name, date, location, status
      FROM exhibitions
      ORDER BY date DESC
    `).all();
    res.json({ success: true, data: exhibitions });
  } catch (err) {
    console.error('[picking] exhibitions:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/picking/shopify-orders  获取 Shopify 待发货订单 ─────────────────
router.get('/shopify-orders', requireLogin, async (req, res) => {
  try {
    const headers = await shopifyService._getHeaders();
    const shop = process.env.SHOPIFY_SHOP;
    if (!shop) {
      return res.status(503).json({ success: false, message: 'Shopify 未配置' });
    }
    const apiVersion = '2025-10';
    const response = await fetch(
      `https://${shop}.myshopify.com/admin/api/${apiVersion}/orders.json?status=open&fulfillment_status=unfulfilled&limit=50`,
      { headers }
    );

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ success: false, message: `Shopify API 错误: ${text}` });
    }

    const data = await response.json();
    const orders = (data.orders || []).map(order => ({
      id: order.id,
      name: order.name,
      customer_name: order.customer ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim() : '未知客户',
      created_at: order.created_at,
      line_items: order.line_items.map(item => ({
        shopify_variant_id: String(item.variant_id),
        product_title: item.title,
        variant_title: item.variant_title,
        quantity: item.quantity,
        sku: item.sku,
      })),
    }));

    res.json({ success: true, data: orders });
  } catch (err) {
    console.error('[picking] shopify-orders:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/picking/inventory-check  查询 SKU 在仓库中的库存分布 ─────────────
router.get('/inventory-check', requireLogin, (req, res) => {
  try {
    const { shopify_variant_ids } = req.query;
    if (!shopify_variant_ids) return res.status(400).json({ success: false, message: '缺少 shopify_variant_ids' });

    const ids = shopify_variant_ids.split(',').filter(Boolean);
    const placeholders = ids.map(() => '?').join(',');

    const inventory = db.prepare(`
      SELECT wi.shopify_variant_id, wi.stock_type, wi.exhibition_id,
        SUM(wi.quantity) AS total_qty,
        GROUP_CONCAT(wl.code || ':' || wi.quantity) AS location_breakdown
      FROM warehouse_inventory wi
      JOIN warehouse_locations wl ON wl.id = wi.location_id
      WHERE wi.shopify_variant_id IN (${placeholders}) AND wi.quantity > 0
      GROUP BY wi.shopify_variant_id, wi.stock_type, wi.exhibition_id
    `).all(...ids);

    res.json({ success: true, data: inventory });
  } catch (err) {
    console.error('[picking] inventory-check:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 内部工具函数
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 为一组 line_items 分配货位（FIFO，先找展会货，再找零售货）
 * 返回 pick lines 数组
 */
function buildPickLines(lineItems) {
  return lineItems.map(item => {
    const variantId = item.shopify_variant_id;
    const qty = item.quantity || 1;

    // 找到该 SKU 库存最多的货位（FIFO：按 received_at 最早的优先）
    const bestLocation = db.prepare(`
      SELECT wi.location_id, wl.code AS location_code, wi.quantity
      FROM warehouse_inventory wi
      JOIN warehouse_locations wl ON wl.id = wi.location_id
      WHERE wi.shopify_variant_id = ? AND wi.quantity > 0
      ORDER BY wi.received_at ASC
      LIMIT 1
    `).get(variantId);

    return {
      shopify_variant_id: variantId,
      product_title: item.product_title || '',
      variant_title: item.variant_title || '',
      required_qty: qty,
      location_id: bestLocation?.location_id || null,
      location_code: bestLocation?.location_code || null,
    };
  });
}

/**
 * 从指定货位扣减库存，返回未能扣减的剩余数量
 */
function deductInventory(locationId, variantId, stockType, exhibitionId, qty, taskId, userId) {
  const inv = db.prepare(`
    SELECT * FROM warehouse_inventory
    WHERE location_id = ? AND shopify_variant_id = ? AND stock_type = ?
      ${exhibitionId ? 'AND exhibition_id = ?' : 'AND exhibition_id IS NULL'}
      AND quantity > 0
    LIMIT 1
  `).get(...[locationId, variantId, stockType, ...(exhibitionId ? [exhibitionId] : [])]);

  if (!inv) return qty;

  const deduct = Math.min(qty, inv.quantity);
  const qtyBefore = inv.quantity;
  const qtyAfter = qtyBefore - deduct;

  db.prepare('UPDATE warehouse_inventory SET quantity = ?, updated_at = datetime(\'now\') WHERE id = ?').run(qtyAfter, inv.id);

  const movId = nextMovementId();
  db.prepare(`
    INSERT INTO warehouse_movements
      (id, inventory_id, location_id, shopify_variant_id, stock_type,
       movement_type, quantity_delta, quantity_before, quantity_after,
       reference_type, reference_id, operated_by)
    VALUES (?, ?, ?, ?, ?, 'outbound', ?, ?, ?, 'pick_task', ?, ?)
  `).run(movId, inv.id, locationId, variantId, stockType, -deduct, qtyBefore, qtyAfter, taskId, userId);

  return qty - deduct;
}

// ── DELETE /api/picking/tasks/:id  删除拣货任务 ───────────────────────────────────
router.delete('/tasks/:id', requireStaff, (req, res) => {
  try {
    const task = db.prepare('SELECT * FROM warehouse_pick_tasks WHERE id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: '任务不存在' });
    if (task.status === 'in_progress') {
      return res.status(409).json({ success: false, message: '进行中的任务不能删除，请先取消任务' });
    }
    db.transaction(() => {
      db.prepare('DELETE FROM warehouse_pick_lines WHERE task_id = ?').run(req.params.id);
      db.prepare('DELETE FROM warehouse_pick_tasks WHERE id = ?').run(req.params.id);
    })();
    res.json({ success: true });
  } catch (err) {
    console.error('[picking] delete task:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
