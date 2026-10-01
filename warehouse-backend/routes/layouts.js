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

// Legacy tasks with no trustworthy layout_id are deliberately not assigned by
// the migration. Show them to admins rather than hiding them permanently.
const legacyTaskTypes = {
  picking: { tasks: 'warehouse_pick_tasks', lines: 'warehouse_pick_lines' },
  replenishment: { tasks: 'warehouse_replenishment_tasks', lines: 'warehouse_replenishment_lines' },
};
router.get('/unassigned', requireAdmin, (req, res) => {
  try {
    const items = Object.entries(legacyTaskTypes).flatMap(([kind, { tasks, lines }]) => db.prepare(`
      SELECT t.id, t.status, t.created_at, COUNT(l.id) AS line_count,
        GROUP_CONCAT(DISTINCT wl.layout_id) AS candidate_layout_ids,
        SUM(CASE WHEN l.id IS NOT NULL AND l.location_id IS NULL THEN 1 ELSE 0 END) AS unlocated_lines,
        SUM(CASE WHEN l.id IS NOT NULL AND l.location_id IS NOT NULL AND (wl.id IS NULL OR wl.is_active != 1) THEN 1 ELSE 0 END) AS missing_locations
      FROM ${tasks} t
      LEFT JOIN ${lines} l ON l.task_id = t.id
      LEFT JOIN warehouse_locations wl ON wl.id = l.location_id
      WHERE t.layout_id IS NULL
      GROUP BY t.id ORDER BY t.created_at DESC
    `).all().map(task => ({ ...task, kind, candidate_layout_ids: task.candidate_layout_ids?.split(',') || [] })));
    res.json({ success: true, data: items });
  } catch (err) {
    console.error('[layouts] unassigned:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/unassigned/:kind/:taskId', requireAdmin, (req, res) => {
  try {
    const type = legacyTaskTypes[req.params.kind];
    if (!type) return res.status(400).json({ success: false, message: '未知的旧任务类型' });
    const layoutId = req.body?.layout_id;
    if (!layoutId || !db.prepare('SELECT 1 FROM warehouse_layouts WHERE id = ?').get(layoutId)) {
      return res.status(400).json({ success: false, message: '请选择有效的仓库后再分配旧任务' });
    }
    db.transaction(() => {
      const task = db.prepare(`SELECT id FROM ${type.tasks} WHERE id = ? AND layout_id IS NULL`).get(req.params.taskId);
      if (!task) throw Object.assign(new Error('该任务已经分配或不存在'), { status: 409 });
      const conflicts = db.prepare(`
        SELECT COUNT(*) AS count FROM ${type.lines} l
        LEFT JOIN warehouse_locations wl ON wl.id = l.location_id
        WHERE l.task_id = ? AND l.location_id IS NOT NULL
          AND (wl.id IS NULL OR wl.is_active != 1 OR wl.layout_id != ?)
      `).get(task.id, layoutId).count;
      if (conflicts > 0) {
        throw Object.assign(new Error('任务包含其他仓库或已删除的货位；请先人工拆分或核对，不能强行归入一个仓库'), { status: 409 });
      }
      db.prepare(`UPDATE ${type.tasks} SET layout_id = ? WHERE id = ? AND layout_id IS NULL`).run(layoutId, task.id);
    })();
    res.json({ success: true });
  } catch (err) {
    console.error('[layouts] assign unassigned:', err.message);
    res.status(err.status || 500).json({ success: false, message: err.message });
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
    if (!validGrid(grid_cols ?? 20, grid_rows ?? 15)) {
      return res.status(400).json({ success: false, message: '画布尺寸须为 10–120 列、8–120 行' });
    }

    const id = nextWarehouseId();
    db.prepare(`
      INSERT INTO warehouse_layouts (id, name, description, grid_cols, grid_rows, layout_json, is_active, created_by)
      VALUES (?, ?, ?, ?, ?, '[]', ?, ?)
    `).run(id, name.trim(), description || null, grid_cols ?? 20, grid_rows ?? 15,
      db.prepare('SELECT COUNT(*) AS count FROM warehouse_layouts').get().count === 0 ? 1 : 0,
      req.session.user.id);

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
    const { name, description, grid_cols, grid_rows, layout_json, set_active } = req.body;
    const layout = db.prepare('SELECT * FROM warehouse_layouts WHERE id = ?').get(req.params.id);
    if (!layout) return res.status(404).json({ success: false, message: '布局不存在' });

    const cols = grid_cols ?? layout.grid_cols;
    const rows = grid_rows ?? layout.grid_rows;
    if (!validGrid(cols, rows)) return res.status(400).json({ success: false, message: '画布尺寸须为 10–120 列、8–120 行' });

    let modules;
    if (layout_json !== undefined) {
      try {
        modules = parseModules(layout_json);
        for (const mod of modules) {
          for (const key of getCells(mod)) {
            const [col, row] = key.split(',').map(Number);
            if (!Number.isInteger(col) || !Number.isInteger(row) || col < 0 || row < 0 || col >= cols || row >= rows) {
              return res.status(400).json({ success: false, message: '布局包含画布范围外的区域，请先扩大画布' });
            }
          }
        }
      } catch { return res.status(400).json({ success: false, message: '布局数据无效' }); }
    }

    db.transaction(() => {
      // A layout and its physical locations must change together.
      if (set_active === true) db.prepare('UPDATE warehouse_layouts SET is_active = 0').run();
      db.prepare(`
        UPDATE warehouse_layouts
        SET name = ?, description = ?, grid_cols = ?, grid_rows = ?,
            layout_json = ?, is_active = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        (name || layout.name).trim(),
        description !== undefined ? description : layout.description,
        cols, rows,
        modules !== undefined ? JSON.stringify(modules) : layout.layout_json,
        set_active === true ? 1 : layout.is_active,
        layout.id
      );
      if (modules !== undefined) syncLocations(layout.id, modules);
    })();

    const updated = db.prepare('SELECT * FROM warehouse_layouts WHERE id = ?').get(layout.id);
    const locations = db.prepare(`
      SELECT * FROM warehouse_locations WHERE layout_id = ? AND is_active = 1
      ORDER BY zone, row_no, col_no
    `).all(layout.id);

    res.json({ success: true, data: { ...updated, locations } });
  } catch (err) {
    console.error('[layouts] update:', err.message);
    res.status(err.status || 500).json({ success: false, message: err.message });
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
    db.transaction(() => {
      const layout = db.prepare('SELECT * FROM warehouse_layouts WHERE id = ?').get(req.params.id);
      if (!layout) throw Object.assign(new Error('布局不存在'), { status: 404 });
      if (layout.is_active || db.prepare('SELECT COUNT(*) AS count FROM warehouse_layouts').get().count <= 1) {
        throw Object.assign(new Error('不能删除当前启用或最后一个仓库；请先选择其他仓库'), { status: 409 });
      }
      const dependencies = [
        ['SELECT 1 FROM warehouse_locations WHERE layout_id = ? LIMIT 1', req.params.id],
        ['SELECT 1 FROM warehouse_pick_tasks WHERE layout_id = ? LIMIT 1', req.params.id],
        ['SELECT 1 FROM warehouse_replenishment_tasks WHERE layout_id = ? LIMIT 1', req.params.id],
        // Keep zero-balance inventory, SKU bindings and movement histories too;
        // a layout with any location is retained rather than cascade-deleted.
      ];
      if (dependencies.some(([sql, id]) => db.prepare(sql).get(id))) {
        throw Object.assign(new Error('仓库包含货位、任务或历史记录；为保护库存和审计数据，不允许删除'), { status: 409 });
      }
      db.prepare('DELETE FROM warehouse_layouts WHERE id = ?').run(req.params.id);
    })();
    res.json({ success: true });
  } catch (err) {
    console.error('[layouts] delete:', err.message);
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 内部：根据 layout_json 同步货位
// 支持新格式（cells 数组）和旧格式（col/row/colSpan/rowSpan）
// 新格式：{ id, type: 'shelf', cells: ['col,row', ...], code, levels }
// 旧格式：{ id, type: 'shelf_h', col, row, colSpan, rowSpan, code, levels }
// 货位编码规则：{code}-{格子序号}  或  {code}-{格子序号}-L{层号}（多层时）
// ─────────────────────────────────────────────────────────────────────────────
function validGrid(cols, rows) {
  return Number.isInteger(cols) && Number.isInteger(rows) && cols >= 10 && cols <= 120 && rows >= 8 && rows <= 120;
}

function parseModules(modules) {
  let data = modules;
  if (typeof data === 'string') data = JSON.parse(data);
  if (typeof data === 'string') data = JSON.parse(data);
  if (!Array.isArray(data)) throw new Error('Invalid layout modules');
  return data;
}

function getCells(mod) {
  if (Array.isArray(mod.cells)) return mod.cells;
  if (mod.col !== undefined) {
    return Array.from({ length: (mod.colSpan || 1) * (mod.rowSpan || 1) }, (_, i) =>
      `${Number(mod.col) + i % (mod.colSpan || 1)},${Number(mod.row) + Math.floor(i / (mod.colSpan || 1))}`);
  }
  return [];
}

function syncLocations(layoutId, modules) {
  const moduleArray = parseModules(modules);

  // 收集所有应该存在的货位（来自 shelf 类型模块）
  const expectedLocations = new Map(); // code → location data

  for (const mod of moduleArray) {
    if (!mod.type) continue;
    const isShelf = mod.type === 'shelf' || mod.type.startsWith('shelf');
    if (!isShelf) continue;

    const prefix = (mod.code || 'A').toUpperCase();
    const levels = mod.levels || 1;

    // ── 新格式：cells 是 ["col,row", ...] 字符串数组 ──
    if (Array.isArray(mod.cells) && mod.cells.length > 0 && typeof mod.cells[0] === 'string') {
      // 按行列排序，与前端 getRegionCells 保持一致
      const sortedCells = [...mod.cells]
        .map(k => { const [c, r] = k.split(',').map(Number); return { col: c, row: r }; })
        .sort((a, b) => a.row !== b.row ? a.row - b.row : a.col - b.col);

      sortedCells.forEach((cell, idx) => {
        const slot = idx + 1;
        for (let level = 1; level <= levels; level++) {
          const code = levels > 1
            ? `${prefix}-${String(slot).padStart(2, '0')}-L${level}`
            : `${prefix}-${String(slot).padStart(2, '0')}`;
          if (!expectedLocations.has(code)) {
            expectedLocations.set(code, {
              zone: prefix,
              row_no: level,
              col_no: slot,
              module_id: String(mod.id),
              grid_x: cell.col,
              grid_y: cell.row,
              label: code,
            });
          }
        }
      });

    // ── 旧格式：col/row/colSpan/rowSpan ──
    } else {
      const colSpan = mod.colSpan || 1;
      const rowSpan = mod.rowSpan || 1;
      const totalSlots = colSpan * rowSpan;

      for (let slot = 1; slot <= totalSlots; slot++) {
        for (let level = 1; level <= levels; level++) {
          const code = levels > 1
            ? `${prefix}-${String(slot).padStart(2, '0')}-L${level}`
            : `${prefix}-${String(slot).padStart(2, '0')}`;
          if (!expectedLocations.has(code)) {
            const slotCol = mod.col + ((slot - 1) % colSpan);
            const slotRow = mod.row + Math.floor((slot - 1) / colSpan);
            expectedLocations.set(code, {
              zone: prefix,
              row_no: level,
              col_no: slot,
              module_id: String(mod.id),
              grid_x: slotCol,
              grid_y: slotRow,
              label: code,
            });
          }
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
        if ((existing.grid_x !== data.grid_x || existing.grid_y !== data.grid_y) &&
            db.prepare('SELECT 1 FROM warehouse_inventory WHERE location_id = ? AND quantity > 0 LIMIT 1').get(existing.id)) {
          const err = new Error(`货位 ${code} 仍有库存，不能改变位置；请先移动货物`);
          err.status = 409;
          throw err;
        }
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
        if (hasStock.cnt > 0) {
          const err = new Error(`货位 ${code} 仍有库存，不能删除或改编号；请先移动货物`);
          err.status = 409;
          throw err;
        }
        deactivateStmt.run(existing.id);
      }
    }
  });

  syncTx();
}

module.exports = router;
