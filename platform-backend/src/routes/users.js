/**
 * Platform Backend - Users Route
 * 统一使用 Exhibition 的 users 表，移植 exhibition-backend 的完整用户管理功能
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');
const { requireAdmin, requireLogin } = require('../middleware/auth');
const { encrypt, decrypt } = require('../utils/crypto');
const { userId } = require('../utils/snowflake');

const router = express.Router();

// ─── 获取所有用户（管理员）─────────────────────────────────────
router.get('/', requireAdmin, (req, res) => {
  const db = getDb();
  const users = db.prepare('SELECT id, username, role, created_at FROM users ORDER BY created_at ASC').all();
  res.json({ success: true, data: users });
});

// ─── 管理员查看指定用户的解密密码 ─────────────────────────────
router.get('/:id/password', requireAdmin, (req, res) => {
  const { id } = req.params;
  const db = getDb();
  const user = db.prepare('SELECT password_encrypted FROM users WHERE id = ?').get(id);
  if (!user) {
    return res.status(404).json({ success: false, message: '用户不存在' });
  }
  if (!user.password_encrypted) {
    return res.json({ success: true, password: null, message: '该用户密码未加密存储（旧账号）' });
  }
  const plain = decrypt(user.password_encrypted);
  if (!plain) {
    return res.status(500).json({ success: false, message: '解密失败' });
  }
  res.json({ success: true, password: plain });
});

// ─── 创建新用户（管理员）─────────────────────────────────────
router.post('/', requireAdmin, (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ success: false, message: '请填写所有字段' });
  }
  if (!['admin', 'staff', 'guest'].includes(role)) {
    return res.status(400).json({ success: false, message: '无效的角色' });
  }
  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(400).json({ success: false, message: '用户名已存在' });
  }
  const hash = bcrypt.hashSync(password, 10);
  const encrypted = encrypt(password);
  const newId = userId(db);
  db.prepare(
    'INSERT INTO users (id, username, password_hash, password_encrypted, role) VALUES (?, ?, ?, ?, ?)'
  ).run(newId, username, hash, encrypted, role);
  res.json({ success: true, data: { id: newId, username, role } });
});

// ─── 修改用户角色（管理员）────────────────────────────────────
router.patch('/:id/role', requireAdmin, (req, res) => {
  const { role } = req.body;
  const { id } = req.params;
  if (!['admin', 'staff', 'guest'].includes(role)) {
    return res.status(400).json({ success: false, message: '无效的角色' });
  }
  if (String(id) === String(req.session.user.id)) {
    return res.status(400).json({ success: false, message: '不能修改自己的角色' });
  }
  const db = getDb();
  db.prepare('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(role, id);
  res.json({ success: true });
});

// ─── 管理员重置用户密码 ───────────────────────────────────────
router.patch('/:id/password', requireAdmin, (req, res) => {
  const { password } = req.body;
  const { id } = req.params;
  if (!password || password.length < 4) {
    return res.status(400).json({ success: false, message: '密码至少4位' });
  }
  const hash = bcrypt.hashSync(password, 10);
  const encrypted = encrypt(password);
  const db = getDb();
  db.prepare(
    'UPDATE users SET password_hash = ?, password_encrypted = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(hash, encrypted, id);
  res.json({ success: true });
});

// ─── 员工自助修改密码 ─────────────────────────────────────────
router.patch('/me/password', requireLogin, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ success: false, message: '请填写旧密码和新密码' });
  }
  if (newPassword.length < 4) {
    return res.status(400).json({ success: false, message: '新密码至少4位' });
  }
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  if (!user) {
    return res.status(404).json({ success: false, message: '用户不存在' });
  }
  const valid = bcrypt.compareSync(oldPassword, user.password_hash);
  if (!valid) {
    return res.status(400).json({ success: false, message: '旧密码错误' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  const encrypted = encrypt(newPassword);
  db.prepare(
    'UPDATE users SET password_hash = ?, password_encrypted = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(hash, encrypted, req.session.user.id);
  res.json({ success: true, message: '密码修改成功' });
});

// ─── 删除用户（管理员）───────────────────────────────────────
router.delete('/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  if (String(id) === String(req.session.user.id)) {
    return res.status(400).json({ success: false, message: '不能删除自己' });
  }
  const db = getDb();
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ success: true });
});

// ─── 权限管理（适配实际 DB schema: system + role 字段）──────────────────────
// DB schema: platform_permissions(id, user_id, system TEXT, role TEXT, granted_at)
// role: 'admin' = read+write, 'viewer' = read-only, absent = no access
router.get('/:id/permissions', requireAdmin, (req, res) => {
  const db = getDb();
  const systems = db.prepare('SELECT * FROM platform_systems WHERE is_active = 1 ORDER BY sort_order').all();
  const perms = db.prepare('SELECT * FROM platform_permissions WHERE user_id = ?').all(req.params.id);
  const permMap = {};
  perms.forEach(p => { permMap[p.system] = p; });

  const result = systems.map(s => ({
    systemId: s.id,
    systemName: s.display_name,
    canRead: permMap[s.name] ? 1 : 0,
    canWrite: permMap[s.name]?.role === 'admin' ? 1 : 0
  }));

  res.json(result);
});

router.put('/:id/permissions', requireAdmin, (req, res) => {
  const { permissions } = req.body;
  if (!Array.isArray(permissions)) {
    return res.status(400).json({ error: 'permissions must be an array' });
  }

  const db = getDb();
  // Get system name by id for mapping
  const systems = db.prepare('SELECT * FROM platform_systems').all();
  const sysMap = {};
  systems.forEach(s => { sysMap[s.id] = s.name; });

  const upsert = db.prepare(`
    INSERT INTO platform_permissions (id, user_id, system, role)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, system) DO UPDATE SET
      role = excluded.role,
      granted_at = CURRENT_TIMESTAMP
  `);
  const del = db.prepare('DELETE FROM platform_permissions WHERE user_id = ? AND system = ?');

  const txn = db.transaction(() => {
    permissions.forEach((p) => {
      const systemName = sysMap[p.systemId];
      if (!systemName) return;
      if (!p.canRead && !p.canWrite) {
        // No access: remove permission row
        del.run(req.params.id, systemName);
      } else {
        const role = p.canWrite ? 'admin' : 'viewer';
        const id = `PERM_${req.params.id}_${systemName}`;
        upsert.run(id, req.params.id, systemName, role);
      }
    });
  });
  txn();

  res.json({ success: true });
});

module.exports = router;
