const express = require('express');
const { getDb } = require('../db');
const { requireLogin, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/systems - get all systems with user's permissions
// DB schema: platform_permissions(id, user_id, system TEXT, role TEXT, granted_at)
// role: 'admin' = read+write, 'viewer' = read-only
router.get('/', requireLogin, (req, res) => {
  const db = getDb();
  const { id: userId, role } = req.session.user;

  const systems = db.prepare('SELECT * FROM platform_systems WHERE is_active = 1 ORDER BY sort_order').all();

  if (role === 'admin') {
    // Admin has full access to all systems
    return res.json(systems.map(s => ({ ...s, can_read: 1, can_write: 1 })));
  }

  // For staff, get their permissions using actual schema (system name, not system_id)
  const permissions = db.prepare(
    'SELECT system, role FROM platform_permissions WHERE user_id = ?'
  ).all(userId);

  const permMap = {};
  permissions.forEach(p => {
    permMap[p.system] = p.role; // 'admin' or 'viewer'
  });

  const result = systems.map(s => ({
    ...s,
    can_read: permMap[s.name] ? 1 : 0,
    can_write: permMap[s.name] === 'admin' ? 1 : 0,
  })).filter(s => s.can_read === 1);

  res.json(result);
});

module.exports = router;
