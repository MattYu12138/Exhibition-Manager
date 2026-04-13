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

// ─── 权限管理（保留，用于系统访问控制）──────────────────────
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

router.put('/:id/permissions', requireAdmin, (req, res) => {
  const { permissions } = req.body;
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
    permissions.forEach((p) => {
      const id = `PERM${req.params.id}${p.systemId}`;
      upsert.run(id, req.params.id, p.systemId, p.canRead ? 1 : 0, p.canWrite ? 1 : 0);
    });
  });
  txn();

  res.json({ success: true });
});

module.exports = router;
