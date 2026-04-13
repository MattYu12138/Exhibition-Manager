const express = require('express');
const { getDb } = require('../db');
const { requireLogin, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/systems - get all systems with user's permissions
router.get('/', requireLogin, (req, res) => {
  const db = getDb();
  const { id: userId, role } = req.session.user;

  const systems = db.prepare('SELECT * FROM platform_systems WHERE is_active = 1 ORDER BY sort_order').all();

  if (role === 'admin') {
    // Admin has full access to all systems
    return res.json(systems.map(s => ({ ...s, can_read: 1, can_write: 1 })));
  }

  // For staff, get their permissions
  const permissions = db.prepare(`
    SELECT system_id, can_read, can_write FROM platform_permissions WHERE user_id = ?
  `).all(userId);

  const permMap = {};
  permissions.forEach(p => { permMap[p.system_id] = p; });

  const result = systems.map(s => ({
    ...s,
    can_read: permMap[s.id]?.can_read || 0,
    can_write: permMap[s.id]?.can_write || 0
  })).filter(s => s.can_read === 1);

  res.json(result);
});

module.exports = router;
