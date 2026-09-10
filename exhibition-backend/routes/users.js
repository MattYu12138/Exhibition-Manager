const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { userId } = require('../utils/snowflake');
const { encrypt, decrypt } = require('../utils/crypto');
const { requireAdmin, requireLogin } = require('../middleware/auth');
const { revokeAllUserTokens } = require('../services/appTokens');

const router = express.Router();

router.get('/', requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, username, role, created_at FROM users ORDER BY created_at ASC').all();
  res.json({ success: true, data: users });
});

router.post('/', requireAdmin, (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ success: false, message: '请填写所有字段' });
  }
  if (!['admin', 'staff', 'guest'].includes(role)) {
    return res.status(400).json({ success: false, message: '无效的角色' });
  }
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

// Keep this static route before /:id/password so "me" is never treated as a user id.
router.patch('/me/password', requireLogin, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ success: false, message: '请填写旧密码和新密码' });
  }
  if (newPassword.length < 4) {
    return res.status(400).json({ success: false, message: '新密码至少4位' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.authUser.id);
  if (!user) {
    return res.status(404).json({ success: false, message: '用户不存在' });
  }
  if (!bcrypt.compareSync(oldPassword, user.password_hash)) {
    return res.status(400).json({ success: false, message: '旧密码错误' });
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  const encrypted = encrypt(newPassword);
  db.prepare(
    'UPDATE users SET password_hash = ?, password_encrypted = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(hash, encrypted, req.authUser.id);
  revokeAllUserTokens(req.authUser.id);
  res.json({ success: true, message: '密码修改成功，请重新登录' });
});

router.get('/:id/password', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT password_encrypted FROM users WHERE id = ?').get(req.params.id);
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

router.patch('/:id/role', requireAdmin, (req, res) => {
  const { role } = req.body;
  const { id } = req.params;
  if (!['admin', 'staff', 'guest'].includes(role)) {
    return res.status(400).json({ success: false, message: '无效的角色' });
  }
  if (String(id) === String(req.authUser.id)) {
    return res.status(400).json({ success: false, message: '不能修改自己的角色' });
  }
  const result = db.prepare('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(role, id);
  if (result.changes === 0) {
    return res.status(404).json({ success: false, message: '用户不存在' });
  }
  res.json({ success: true });
});

router.patch('/:id/password', requireAdmin, (req, res) => {
  const { password } = req.body;
  const { id } = req.params;
  if (!password || password.length < 4) {
    return res.status(400).json({ success: false, message: '密码至少4位' });
  }
  const hash = bcrypt.hashSync(password, 10);
  const encrypted = encrypt(password);
  const result = db.prepare(
    'UPDATE users SET password_hash = ?, password_encrypted = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(hash, encrypted, id);
  if (result.changes === 0) {
    return res.status(404).json({ success: false, message: '用户不存在' });
  }
  revokeAllUserTokens(id);
  res.json({ success: true });
});

router.delete('/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  if (String(id) === String(req.authUser.id)) {
    return res.status(400).json({ success: false, message: '不能删除自己' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ success: true });
});

module.exports = router;
