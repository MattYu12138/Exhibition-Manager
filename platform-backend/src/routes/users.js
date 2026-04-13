const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

function generateUserId(db) {
  const last = db.prepare("SELECT id FROM platform_users ORDER BY id DESC LIMIT 1").get();
  if (!last) return 'U0000002';
  const num = parseInt(last.id.replace('U', ''), 10) + 1;
  return 'U' + String(num).padStart(7, '0');
}

// GET /api/users - list all users (admin only)
router.get('/', requireAdmin, (req, res) => {
  const db = getDb();
  const users = db.prepare(`
    SELECT id, username, display_name, role, is_active, created_at FROM platform_users ORDER BY created_at
  `).all();
  res.json(users);
});

// POST /api/users - create user (admin only)
router.post('/', requireAdmin, (req, res) => {
  const { username, displayName, password, role } = req.body;
  if (!username || !displayName || !password) {
    return res.status(400).json({ error: 'username, displayName and password are required' });
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM platform_users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'Username already exists' });
  }

  const id = generateUserId(db);
  const passwordHash = bcrypt.hashSync(password, 10);
  db.prepare(`
    INSERT INTO platform_users (id, username, display_name, password_hash, role)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, username, displayName, passwordHash, role || 'staff');

  res.status(201).json({ id, username, displayName, role: role || 'staff' });
});

// PUT /api/users/:id - update user (admin only)
router.put('/:id', requireAdmin, (req, res) => {
  const { displayName, password, role, isActive } = req.body;
  const db = getDb();
  const user = db.prepare('SELECT * FROM platform_users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (password) {
    const passwordHash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE platform_users SET password_hash = ?, updated_at = datetime("now") WHERE id = ?')
      .run(passwordHash, req.params.id);
  }
  if (displayName !== undefined) {
    db.prepare('UPDATE platform_users SET display_name = ?, updated_at = datetime("now") WHERE id = ?')
      .run(displayName, req.params.id);
  }
  if (role !== undefined) {
    db.prepare('UPDATE platform_users SET role = ?, updated_at = datetime("now") WHERE id = ?')
      .run(role, req.params.id);
  }
  if (isActive !== undefined) {
    db.prepare('UPDATE platform_users SET is_active = ?, updated_at = datetime("now") WHERE id = ?')
      .run(isActive ? 1 : 0, req.params.id);
  }

  res.json({ success: true });
});

// DELETE /api/users/:id - delete user (admin only)
router.delete('/:id', requireAdmin, (req, res) => {
  const db = getDb();
  if (req.params.id === 'U0000001') {
    return res.status(403).json({ error: 'Cannot delete the default admin user' });
  }
  db.prepare('DELETE FROM platform_users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// GET /api/users/:id/permissions - get user permissions (admin only)
router.get('/:id/permissions', requireAdmin, (req, res) => {
  const db = getDb();
  const systems = db.prepare('SELECT * FROM platform_systems WHERE is_active = 1 ORDER BY sort_order').all();
  const perms = db.prepare('SELECT * FROM platform_permissions WHERE user_id = ?').all(req.params.id);
  const permMap = {};
  perms.forEach(p => { permMap[p.system_id] = p; });

  const result = systems.map(s => ({
    systemId: s.id,
    systemName: s.display_name,
    canRead: permMap[s.id]?.can_read || 0,
    canWrite: permMap[s.id]?.can_write || 0
  }));

  res.json(result);
});

// PUT /api/users/:id/permissions - update user permissions (admin only)
router.put('/:id/permissions', requireAdmin, (req, res) => {
  const { permissions } = req.body; // [{ systemId, canRead, canWrite }]
  if (!Array.isArray(permissions)) {
    return res.status(400).json({ error: 'permissions must be an array' });
  }

  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO platform_permissions (id, user_id, system_id, can_read, can_write)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, system_id) DO UPDATE SET
      can_read = excluded.can_read,
      can_write = excluded.can_write,
      updated_at = datetime('now')
  `);

  const txn = db.transaction(() => {
    permissions.forEach((p, i) => {
      const id = `PERM${req.params.id}${p.systemId}`;
      upsert.run(id, req.params.id, p.systemId, p.canRead ? 1 : 0, p.canWrite ? 1 : 0);
    });
  });
  txn();

  res.json({ success: true });
});

module.exports = router;
