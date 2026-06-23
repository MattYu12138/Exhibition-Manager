/**
 * 补货路由
 * SKU绑定货位、补货任务生成、确认入库
 */
const express = require('express');
const router = express.Router();
const { db, nextInventoryId, nextMovementId } = require('../db');
const { requireLogin, requireStaff, requireAdmin } = require('../middleware/auth');
const { randomUUID } = require('crypto');
const uuidv4 = () => randomUUID();

// ── GET /api/replenishment/pending-count  获取待补货数量（首页提醒用） ─────────
router.get('/pending-count', requireLogin, (req, res) => {
  try {
    const row = db.prepare(`
      SELECT COUNT(*) AS cnt
      FROM warehouse_replenishment_lines
      WHERE status = 'pending'
    `).get();
    res.json({ success: true, data: { count: row.cnt } });
  } catch (err) {
    console.error('[replenishment] pending-count:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/replenishment/tasks  获取补货任务列表 ────────────────────────────
router.get('/tasks', requireLogin, (req, res) => {
  try {
    const tasks = db.prepare(`
      SELECT t.*,
        s.ref_no AS reference_no, s.factory AS supplier_name, s.received_at AS expected_arrival,
        COUNT(l.id) AS total_lines,
        SUM(CASE WHEN l.status = 'pending' THEN 1 ELSE 0 END) AS pending_lines,
        SUM(CASE WHEN l.status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed_lines
      FROM warehouse_replenishment_tasks t
      LEFT JOIN inbound_shipments s ON s.id = t.inbound_shipment_id
      LEFT JOIN warehouse_replenishment_lines l ON l.task_id = t.id
      GROUP BY t.id
      ORDER BY t.created_at DESC
    `).all();
    res.json({ success: true, data: tasks });
  } catch (err) {
    console.error('[replenishment] tasks:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/replenishment/tasks/:taskId  获取单个任务详情（按货位分组） ───────
router.get('/tasks/:taskId', requireLogin, (req, res) => {
  try {
    const task = db.prepare(`
      SELECT t.*, s.ref_no AS reference_no, s.factory AS supplier_name, s.received_at AS expected_arrival
      FROM warehouse_replenishment_tasks t
      LEFT JOIN inbound_shipments s ON s.id = t.inbound_shipment_id
      WHERE t.id = ?
    `).get(req.params.taskId);
    if (!task) return res.status(404).json({ success: false, message: '任务不存在' });

    const lines = db.prepare(`
      SELECT l.*,
        wl.code AS location_code_actual, wl.zone, wl.row_no, wl.col_no,
        wlay.name AS layout_name,
        pv.sku, pv.image_url, pv.price,
        p.main_image
      FROM warehouse_replenishment_lines l
      LEFT JOIN warehouse_locations wl ON wl.id = l.location_id
      LEFT JOIN warehouse_layouts wlay ON wlay.id = wl.layout_id
      LEFT JOIN product_variants pv ON pv.shopify_variant_id = l.shopify_variant_id
      LEFT JOIN products p ON p.id = pv.product_id
      WHERE l.task_id = ?
      ORDER BY wl.zone, wl.row_no, wl.col_no, l.stock_type
    `).all(req.params.taskId);

    // 按货位分组
    const byLocation = {};
    for (const line of lines) {
      const key = line.location_id;
      if (!byLocation[key]) {
        byLocation[key] = {
          location_id: line.location_id,
          location_code: line.location_code_actual || line.location_code,
          zone: line.zone,
          layout_name: line.layout_name,
          lines: [],
        };
      }
      byLocation[key].lines.push(line);
    }

    res.json({ success: true, data: { task, locations: Object.values(byLocation) } });
  } catch (err) {
    console.error('[replenishment] task detail:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/replenishment/generate  根据 inbound shipment 生成补货任务 ───────
// 由 inbound 收货完成后自动调用，或手动触发
router.post('/generate', requireStaff, (req, res) => {
  try {
    const { inbound_shipment_id } = req.body;
    if (!inbound_shipment_id) return res.status(400).json({ success: false, message: '缺少 inbound_shipment_id' });

    // 检查该批次是否已有补货任务
    const existing = db.prepare(`
      SELECT id FROM warehouse_replenishment_tasks WHERE inbound_shipment_id = ?
    `).get(inbound_shipment_id);
    if (existing) return res.json({ success: true, data: { task_id: existing.id, already_exists: true } });

    // 获取该批次所有已收货的 SKU 及数量
    const receivedItems = db.prepare(`
      SELECT ibi.shopify_variant_id,
        SUM(ibi.received_qty) AS total_received,
        p.title AS product_title,
        pv.variant_title
      FROM inbound_box_items ibi
      JOIN inbound_boxes ib ON ib.id = ibi.box_id
      LEFT JOIN product_variants pv ON pv.shopify_variant_id = ibi.shopify_variant_id
      LEFT JOIN products p ON p.id = pv.product_id
      WHERE ib.shipment_id = ? AND ibi.received_qty > 0
      GROUP BY ibi.shopify_variant_id
    `).all(inbound_shipment_id);

    if (receivedItems.length === 0) {
      return res.status(400).json({ success: false, message: '该批次暂无已收货商品' });
    }

    const taskId = uuidv4();
    const lines = [];

    for (const item of receivedItems) {
      // 查找该 SKU 绑定的货位（按优先级排序）
      const bindings = db.prepare(`
        SELECT wsb.*, wl.code AS location_code
        FROM warehouse_sku_bindings wsb
        JOIN warehouse_locations wl ON wl.id = wsb.location_id
        WHERE wsb.shopify_variant_id = ? AND wsb.is_active = 1
        ORDER BY wsb.priority DESC, wsb.stock_type
      `).all(item.shopify_variant_id);

      if (bindings.length === 0) continue; // 未绑定货位的 SKU 跳过

      let remaining = item.total_received;

      for (const binding of bindings) {
        if (remaining <= 0) break;

        // 计算该货位应补数量（按容量上限分配）
        let qty;
        if (binding.capacity !== null && binding.capacity > 0) {
          // 查询当前货位该 SKU 的库存
          const currentInv = db.prepare(`
            SELECT COALESCE(SUM(quantity), 0) AS qty
            FROM warehouse_inventory
            WHERE location_id = ? AND shopify_variant_id = ? AND stock_type = ?
          `).get(binding.location_id, item.shopify_variant_id, binding.stock_type);
          const available = Math.max(0, binding.capacity - currentInv.qty);
          qty = Math.min(remaining, available);
        } else {
          qty = remaining;
        }

        if (qty <= 0) continue;

        lines.push({
          id: uuidv4(),
          task_id: taskId,
          location_id: binding.location_id,
          location_code: binding.location_code,
          shopify_variant_id: item.shopify_variant_id,
          product_title: item.product_title || '',
          variant_title: item.variant_title || '',
          stock_type: binding.stock_type,
          required_qty: qty,
        });

        remaining -= qty;
      }
    }

    if (lines.length === 0) {
      return res.status(400).json({ success: false, message: '该批次所有 SKU 均未绑定货位，请先在货位详情页绑定 SKU' });
    }

    // 事务创建任务和明细
    db.transaction(() => {
      db.prepare(`
        INSERT INTO warehouse_replenishment_tasks (id, inbound_shipment_id, status, created_at)
        VALUES (?, ?, 'pending', datetime('now'))
      `).run(taskId, inbound_shipment_id);

      const insertLine = db.prepare(`
        INSERT INTO warehouse_replenishment_lines
          (id, task_id, location_id, location_code, shopify_variant_id,
           product_title, variant_title, stock_type, required_qty, confirmed_qty, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'pending')
      `);
      for (const l of lines) {
        insertLine.run(l.id, l.task_id, l.location_id, l.location_code,
          l.shopify_variant_id, l.product_title, l.variant_title, l.stock_type, l.required_qty);
      }
    })();

    res.status(201).json({ success: true, data: { task_id: taskId, lines_count: lines.length } });
  } catch (err) {
    console.error('[replenishment] generate:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/replenishment/lines/:lineId/confirm  确认某条补货明细 ────────────
router.post('/lines/:lineId/confirm', requireStaff, (req, res) => {
  try {
    const { confirmed_qty } = req.body;
    if (confirmed_qty === undefined || confirmed_qty < 0) {
      return res.status(400).json({ success: false, message: '确认数量不能为负数' });
    }

    const line = db.prepare('SELECT * FROM warehouse_replenishment_lines WHERE id = ?').get(req.params.lineId);
    if (!line) return res.status(404).json({ success: false, message: '补货明细不存在' });
    if (line.status === 'confirmed') return res.status(400).json({ success: false, message: '该明细已确认' });

    const qty = Math.min(confirmed_qty, line.required_qty);

    db.transaction(() => {
      // 更新补货明细状态
      db.prepare(`
        UPDATE warehouse_replenishment_lines
        SET confirmed_qty = ?, status = 'confirmed',
            confirmed_by = ?, confirmed_at = datetime('now')
        WHERE id = ?
      `).run(qty, req.session.user.id, line.id);

      if (qty > 0) {
        // 查找或创建货位库存记录
        let inv = db.prepare(`
          SELECT * FROM warehouse_inventory
          WHERE location_id = ? AND shopify_variant_id = ? AND stock_type = ?
            AND exhibition_id IS NULL
          LIMIT 1
        `).get(line.location_id, line.shopify_variant_id, line.stock_type);

        let invId;
        let qtyBefore;

        if (inv) {
          qtyBefore = inv.quantity;
          db.prepare(`
            UPDATE warehouse_inventory
            SET quantity = quantity + ?, updated_at = datetime('now')
            WHERE id = ?
          `).run(qty, inv.id);
          invId = inv.id;
        } else {
          qtyBefore = 0;
          invId = nextInventoryId();
          db.prepare(`
            INSERT INTO warehouse_inventory
              (id, location_id, shopify_variant_id, stock_type, quantity,
               inbound_shipment_id, received_at, created_by)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?)
          `).run(invId, line.location_id, line.shopify_variant_id, line.stock_type,
            qty, null, req.session.user.id);
        }

        // 记录变动日志
        const movId = nextMovementId();
        db.prepare(`
          INSERT INTO warehouse_movements
            (id, inventory_id, location_id, shopify_variant_id, stock_type,
             movement_type, quantity_delta, quantity_before, quantity_after,
             reference_type, reference_id, note, operated_by)
          VALUES (?, ?, ?, ?, ?, 'inbound', ?, ?, ?, 'replenishment', ?, '补货确认', ?)
        `).run(movId, invId, line.location_id, line.shopify_variant_id, line.stock_type,
          qty, qtyBefore, qtyBefore + qty, line.task_id, req.session.user.id);
      }

      // 检查任务是否全部完成
      const pendingCount = db.prepare(`
        SELECT COUNT(*) AS cnt FROM warehouse_replenishment_lines
        WHERE task_id = ? AND status = 'pending'
      `).get(line.task_id).cnt;

      if (pendingCount === 0) {
        db.prepare(`
          UPDATE warehouse_replenishment_tasks
          SET status = 'completed', completed_at = datetime('now')
          WHERE id = ?
        `).run(line.task_id);
      }
    })();

    res.json({ success: true });
  } catch (err) {
    console.error('[replenishment] confirm line:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/replenishment/lines/:lineId/skip  跳过某条补货明细 ─────────────
router.post('/lines/:lineId/skip', requireStaff, (req, res) => {
  try {
    const line = db.prepare('SELECT * FROM warehouse_replenishment_lines WHERE id = ?').get(req.params.lineId);
    if (!line) return res.status(404).json({ success: false, message: '补货明细不存在' });

    db.prepare(`
      UPDATE warehouse_replenishment_lines
      SET status = 'skipped', confirmed_by = ?, confirmed_at = datetime('now')
      WHERE id = ?
    `).run(req.session.user.id, line.id);

    // 检查任务是否全部完成
    const pendingCount = db.prepare(`
      SELECT COUNT(*) AS cnt FROM warehouse_replenishment_lines
      WHERE task_id = ? AND status = 'pending'
    `).get(line.task_id).cnt;

    if (pendingCount === 0) {
      db.prepare(`
        UPDATE warehouse_replenishment_tasks
        SET status = 'completed', completed_at = datetime('now')
        WHERE id = ?
      `).run(line.task_id);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[replenishment] skip line:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/replenishment/bindings/:locationId  获取货位的 SKU 绑定 ──────────
router.get('/bindings/:locationId', requireLogin, (req, res) => {
  try {
    const bindings = db.prepare(`
      SELECT wsb.*,
        p.title AS product_title, pv.variant_title, pv.sku, pv.image_url,
        p.main_image
      FROM warehouse_sku_bindings wsb
      LEFT JOIN product_variants pv ON pv.shopify_variant_id = wsb.shopify_variant_id
      LEFT JOIN products p ON p.id = pv.product_id
      WHERE wsb.location_id = ? AND wsb.is_active = 1
      ORDER BY wsb.stock_type, wsb.priority DESC
    `).all(req.params.locationId);
    res.json({ success: true, data: bindings });
  } catch (err) {
    console.error('[replenishment] get bindings:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/replenishment/bindings  创建 SKU 绑定 ──────────────────────────
router.post('/bindings', requireStaff, (req, res) => {
  try {
    const { location_id, shopify_variant_id, stock_type, capacity, priority } = req.body;
    if (!location_id || !shopify_variant_id || !stock_type) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }
    if (!['retail_display', 'retail_storage', 'exhibition', 'retail'].includes(stock_type)) {
      return res.status(400).json({ success: false, message: '无效的 stock_type' });
    }

    const location = db.prepare('SELECT * FROM warehouse_locations WHERE id = ? AND is_active = 1').get(location_id);
    if (!location) return res.status(404).json({ success: false, message: '货位不存在' });

    const variant = db.prepare('SELECT * FROM product_variants WHERE shopify_variant_id = ?').get(shopify_variant_id);
    if (!variant) return res.status(404).json({ success: false, message: 'SKU 不存在' });

    // 检查是否已存在相同绑定
    const existing = db.prepare(`
      SELECT id FROM warehouse_sku_bindings
      WHERE location_id = ? AND shopify_variant_id = ? AND stock_type = ?
    `).get(location_id, shopify_variant_id, stock_type);

    if (existing) {
      // 重新激活
      db.prepare(`
        UPDATE warehouse_sku_bindings
        SET is_active = 1, capacity = ?, priority = ?, created_by = ?
        WHERE id = ?
      `).run(capacity || null, priority || 0, req.session.user.id, existing.id);
      return res.json({ success: true, data: { id: existing.id, updated: true } });
    }

    const id = uuidv4();
    db.prepare(`
      INSERT INTO warehouse_sku_bindings
        (id, location_id, shopify_variant_id, stock_type, capacity, priority, is_active, created_by)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `).run(id, location_id, shopify_variant_id, stock_type, capacity || null, priority || 0, req.session.user.id);

    res.status(201).json({ success: true, data: { id } });
  } catch (err) {
    console.error('[replenishment] create binding:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /api/replenishment/bindings/:bindingId  删除 SKU 绑定 ─────────────
router.delete('/bindings/:bindingId', requireStaff, (req, res) => {
  try {
    const binding = db.prepare('SELECT * FROM warehouse_sku_bindings WHERE id = ?').get(req.params.bindingId);
    if (!binding) return res.status(404).json({ success: false, message: '绑定不存在' });

    db.prepare('UPDATE warehouse_sku_bindings SET is_active = 0 WHERE id = ?').run(binding.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[replenishment] delete binding:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/replenishment/inbound-shipments  获取可生成补货任务的批次列表 ─────
router.get('/inbound-shipments', requireLogin, (req, res) => {
  try {
    const shipments = db.prepare(`
      SELECT s.*,
        COUNT(DISTINCT ibi.shopify_variant_id) AS sku_count,
        SUM(ibi.received_qty) AS total_received,
        CASE WHEN t.id IS NOT NULL THEN 1 ELSE 0 END AS has_task,
        t.id AS task_id, t.status AS task_status
      FROM inbound_shipments s
      LEFT JOIN inbound_boxes ib ON ib.shipment_id = s.id
      LEFT JOIN inbound_box_items ibi ON ibi.box_id = ib.id AND ibi.received_qty > 0
      LEFT JOIN warehouse_replenishment_tasks t ON t.inbound_shipment_id = s.id
      WHERE s.status IN ('received', 'partial')
      GROUP BY s.id
      ORDER BY s.created_at DESC
      LIMIT 50
    `).all();
    res.json({ success: true, data: shipments });
  } catch (err) {
    console.error('[replenishment] inbound-shipments:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
