const { db } = require('../db');

// A readable name is never an identity: every warehouse operation resolves the
// layout primary key. Legacy callers fall back to the configured active layout.
function resolveWarehouse(req, res) {
  const headerId = req.get('X-Warehouse-Id');
  const explicitId = req.query.layout_id || req.body?.layout_id;
  if (headerId && explicitId && headerId !== explicitId) {
    res.status(409).json({ success: false, message: '所选仓库与请求中的仓库不一致' });
    return null;
  }
  const id = headerId || explicitId || db.prepare(`
    SELECT id FROM warehouse_layouts ORDER BY is_active DESC, updated_at DESC, id LIMIT 1
  `).get()?.id;
  if (!id) {
    res.status(400).json({ success: false, message: '请先创建并选择仓库' });
    return null;
  }
  if (!db.prepare('SELECT 1 FROM warehouse_layouts WHERE id = ?').get(id)) {
    res.status(404).json({ success: false, message: '所选仓库不存在，请重新选择' });
    return null;
  }
  return id;
}

function requireLocation(req, res, locationId, layoutId) {
  const location = db.prepare(`
    SELECT * FROM warehouse_locations WHERE id = ? AND layout_id = ? AND is_active = 1
  `).get(locationId, layoutId);
  if (!location) res.status(404).json({ success: false, message: '此仓库中不存在该货位' });
  return location;
}

module.exports = { resolveWarehouse, requireLocation };
