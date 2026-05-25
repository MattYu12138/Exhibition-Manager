/**
 * 仓库布局路由
 * 管理仓库地图布局（模块拖拽结果）和货位自动生成
 */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { db, nextWarehouseId, nextLocationId } = require('../db');
const { requireLogin, requireAdmin } = require('../middleware/auth');

// ── GET /api/layouts  列出所有布局 ──────────────────────────────────────────
router.get('/', requireLogin, (req, res) => {
  try {
    const layouts = db.prepare(`
      SELECT wl.*, u.username AS created_by_name,
        (SELECT COUNT(*) FROM warehouse_locations WHERE layout_id = wl.id AND is_active = 1) AS location_count
      FROM warehouse_layouts wl
      LEFT JOIN users u ON u.id = wl.created_by
      ORDER BY wl.is_active DESC, wl.updated_at DESC
    `).all();
    res.json({ success: true, data: layouts });
  } catch (err) {
    console.error('[layouts] list:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/layouts/active  获取当前生效布局（含货位） ──────────────────────
router.get('/active', requireLogin, (req, res) => {
  try {
    const layout = db.prepare(`
      SELECT * FROM warehouse_layouts WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1
    `).get();
    if (!layout) return res.json({ success: true, data: null });

    const locations = db.prepare(`
      SELECT wl.*,
        COALESCE(SUM(wi.quantity), 0) AS total_qty,
        COUNT(DISTINCT wi.id) AS sku_count
      FROM warehouse_locations wl
      LEFT JOIN warehouse_inventory wi ON wi.location_id = wl.id AND wi.quantity > 0
      WHERE wl.layout_id = ? AND wl.is_active = 1
      GROUP BY wl.id
      ORDER BY wl.zone, wl.row_no, wl.col_no
    `).all(layout.id);

    res.json({ success: true, data: { ...layout, locations } });
  } catch (err) {
    console.error('[layouts] active:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/layouts/:id  获取单个布局详情（含货位） ────────────────────────
router.get('/:id', requireLogin, (req, res) => {
  try {
    const layout = db.prepare('SELECT * FROM warehouse_layouts WHERE id = ?').get(req.params.id);
    if (!layout) return res.status(404).json({ success: false, message: '布局不存在' });

    const locations = db.prepare(`
      SELECT wl.*,
        COALESCE(SUM(wi.quantity), 0) AS total_qty,
        COUNT(DISTINCT wi.id) AS sku_count
      FROM warehouse_locations wl
      LEFT JOIN warehouse_inventory wi ON wi.location_id = wl.id AND wi.quantity > 0
      WHERE wl.layout_id = ? AND wl.is_active = 1
      GROUP BY wl.id
      ORDER BY wl.zone, wl.row_no, wl.col_no
    `).all(layout.id);

    res.json({ success: true, data: { ...layout, locations } });
  } catch (err) {
    console.error('[layouts] get:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/layouts  创建新布局 ────────────────────────────────────────────
router.post('/', requireAdmin, (req, res) => {
  try {
    const { name, description, grid_cols, grid_rows } = req.body;
    if (!name) return res.status(400).json({ success: false, message: '布局名称不能为空' });

    const id = nextWarehouseId();
    db.prepare(`
      INSERT INTO warehouse_layouts (id, name, description, grid_cols, grid_rows, layout_json, created_by)
      VALUES (?, ?, ?, ?, ?, '[]', ?)
    `).run(id, name, description || null, grid_cols || 20, grid_rows || 15, req.session.user.id);

    const layout = db.prepare('SELECT * FROM warehouse_layouts WHERE id = ?').get(id);
    res.status(201).json({ success: true, data: layout });
  } catch (err) {
    console.error('[layouts] create:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUT /api/layouts/:id  保存布局（含模块 JSON + 自动生成/更新货位） ────────
router.put('/:id', requireAdmin, (req, res) => {
  try {
    const { name, description, grid_cols, grid_rows, layout_json } = req.body;
    const layout = db.prepare('SELECT * FROM warehouse_layouts WHERE id = ?').get(req.params.id);
    if (!layout) return res.status(404).json({ success: false, message: '布局不存在' });

    // 更新布局基本信息
    db.prepare(`
      UPDATE warehouse_layouts
      SET name = ?, description = ?, grid_cols = ?, grid_rows = ?,
          layout_json = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      name || layout.name,
      description !== undefined ? description : layout.description,
      grid_cols || layout.grid_cols,
      grid_rows || layout.grid_rows,
      layout_json !== undefined ? (typeof layout_json === 'string' ? layout_json : JSON.stringify(layout_json)) : layout.layout_json,
      layout.id
    );

    // 如果传入了 layout_json，自动同步货位
    if (layout_json !== undefined) {
      syncLocations(layout.id, layout_json);
    }

    const updated = db.prepare('SELECT * FROM warehouse_layouts WHERE id = ?').get(layout.id);
    const locations = db.prepare(`
      SELECT * FROM warehouse_locations WHERE layout_id = ? AND is_active = 1
      ORDER BY zone, row_no, col_no
    `).all(layout.id);

    res.json({ success: true, data: { ...updated, locations } });
  } catch (err) {
    console.error('[layouts] update:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PATCH /api/layouts/:id/activate  激活某个布局 ───────────────────────────
router.patch('/:id/activate', requireAdmin, (req, res) => {
  try {
    const layout = db.prepare('SELECT id FROM warehouse_layouts WHERE id = ?').get(req.params.id);
    if (!layout) return res.status(404).json({ success: false, message: '布局不存在' });

    db.prepare('UPDATE warehouse_layouts SET is_active = 0').run();
    db.prepare('UPDATE warehouse_layouts SET is_active = 1, updated_at = datetime(\'now\') WHERE id = ?').run(req.params.id);

    res.json({ success: true });
  } catch (err) {
    console.error('[layouts] activate:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /api/layouts/:id  删除布局（仅无库存时允许） ──────────────────────
router.delete('/:id', requireAdmin, (req, res) => {
  try {
    const layout = db.prepare('SELECT * FROM warehouse_layouts WHERE id = ?').get(req.params.id);
    if (!layout) return res.status(404).json({ success: false, message: '布局不存在' });

    // 检查是否有库存
    const hasInventory = db.prepare(`
      SELECT COUNT(*) AS cnt FROM warehouse_inventory wi
      JOIN warehouse_locations wl ON wl.id = wi.location_id
      WHERE wl.layout_id = ? AND wi.quantity > 0
    `).get(req.params.id);

    if (hasInventory.cnt > 0) {
      return res.status(409).json({ success: false, message: '该布局下存在库存，无法删除。请先清空库存。' });
    }

    db.prepare('DELETE FROM warehouse_layouts WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[layouts] delete:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 内部：根据 layout_json 同步货位
// layout_json 格式（新版）：数组，每个元素为一个模块对象：
// {
//   id: "cell_xxx",         // 模块唯一 ID（前端生成）
//   type: "shelf_h" | "wall" | "entrance" | "aisle" | "workstation" | "pillar",
//   col: 3, row: 2,         // 在画布上的位置（格子坐标，0-based）
//   colSpan: 4, rowSpan: 1, // 占用的格子宽高
//   code: "A",              // 货架编码前缀（shelf 类型才有）
//   levels: 2,              // 层数（shelf 类型才有，默认 1）
//   label: "...",           // 非货架元素的标签
// }
// 货位编码规则：{code}-{格子序号}-L{层号}
// 例如：A 区货架占 4 格 2 层 → A-01-L1, A-01-L2, A-02-L1, A-02-L2 ...
// ─────────────────────────────────────────────────────────────────────────────
function syncLocations(layoutId, modules) {
  const moduleArray = Array.isArray(modules) ? modules : [];

  // 收集所有应该存在的货位（来自 shelf 类型模块）
  const expectedLocations = new Map(); // code → location data

  for (const mod of moduleArray) {
    if (!mod.type || !mod.type.startsWith('shelf')) continue;
    const prefix = mod.code || 'A';
    const colSpan = mod.colSpan || 1;
    const rowSpan = mod.rowSpan || 1;
    const levels = mod.levels || 1;
    const totalSlots = colSpan * rowSpan;

    for (let slot = 1; slot <= totalSlots; slot++) {
      for (let level = 1; level <= levels; level++) {
        const code = levels > 1
          ? `${prefix}-${String(slot).padStart(2, '0')}-L${level}`
          : `${prefix}-${String(slot).padStart(2, '0')}`;
        if (!expectedLocations.has(code)) {
          // 计算该 slot 在网格中的实际位置
          const slotCol = mod.col + ((slot - 1) % colSpan);
          const slotRow = mod.row + Math.floor((slot - 1) / colSpan);
          expectedLocations.set(code, {
            zone: prefix,
            row_no: level,
            col_no: slot,
            module_id: mod.id,
            grid_x: slotCol,
            grid_y: slotRow,
            label: code,
          });
        }
      }
    }
  }

  // 获取当前已有货位
  const existingLocations = db.prepare(
    'SELECT * FROM warehouse_locations WHERE layout_id = ?'
  ).all(layoutId);
  const existingMap = new Map(existingLocations.map(l => [l.code, l]));

  const insertStmt = db.prepare(`
    INSERT INTO warehouse_locations (id, layout_id, code, label, zone, row_no, col_no, module_id, grid_x, grid_y, qr_token, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  const updateStmt = db.prepare(`
    UPDATE warehouse_locations
    SET label = ?, zone = ?, row_no = ?, col_no = ?, module_id = ?, grid_x = ?, grid_y = ?,
        is_active = 1, updated_at = datetime('now')
    WHERE id = ?
  `);
  const deactivateStmt = db.prepare(`
    UPDATE warehouse_locations SET is_active = 0, updated_at = datetime('now') WHERE id = ?
  `);

  const syncTx = db.transaction(() => {
    // 新增或更新
    for (const [code, data] of expectedLocations) {
      if (existingMap.has(code)) {
        const existing = existingMap.get(code);
        updateStmt.run(data.label, data.zone, data.row_no, data.col_no, data.module_id, data.grid_x, data.grid_y, existing.id);
      } else {
        const id = nextLocationId();
        const qrToken = crypto.randomBytes(16).toString('hex');
        insertStmt.run(id, layoutId, code, data.label, data.zone, data.row_no, data.col_no, data.module_id, data.grid_x, data.grid_y, qrToken);
      }
    }

    // 停用不再存在的货位（有库存的不能停用）
    for (const [code, existing] of existingMap) {
      if (!expectedLocations.has(code)) {
        const hasStock = db.prepare(
          'SELECT COUNT(*) AS cnt FROM warehouse_inventory WHERE location_id = ? AND quantity > 0'
        ).get(existing.id);
        if (hasStock.cnt === 0) {
          deactivateStmt.run(existing.id);
        }
      }
    }
  });

  syncTx();
}

module.exports = router;
