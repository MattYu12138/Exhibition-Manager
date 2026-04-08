const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { userId } = require('../utils/snowflake');
const { encrypt, decrypt } = require('../utils/crypto');

// 中间件：仅管理员可访问
function adminOnly(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: '未登录' });
  }
  if (req.session.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: '无权限' });
  }
  next();
}

// 中间件：已登录即可访问
function loginRequired(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: '未登录' });
  }
  next();
}

// 获取所有用户列表（管理员）
router.get('/', adminOnly, (req, res) => {
  const users = db.prepare('SELECT id, username, role, created_at FROM users ORDER BY created_at ASC').all();
  res.json({ success: true, data: users });
});

// 管理员查看指定用户的解密密码
router.get('/:id/password', adminOnly, (req, res) => {
  const { id } = req.params;
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

// 创建新用户（管理员）
router.post('/', adminOnly, (req, res) => {
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

// 修改用户角色（管理员）
router.patch('/:id/role', adminOnly, (req, res) => {
  const { role } = req.body;
  const { id } = req.params;
  if (!['admin', 'staff', 'guest'].includes(role)) {
    return res.status(400).json({ success: false, message: '无效的角色' });
  }
  if (String(id) === String(req.session.user.id)) {
    return res.status(400).json({ success: false, message: '不能修改自己的角色' });
  }
  db.prepare('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(role, id);
  res.json({ success: true });
});

// 管理员重置用户密码
router.patch('/:id/password', adminOnly, (req, res) => {
  const { password } = req.body;
  const { id } = req.params;
  if (!password || password.length < 4) {
    return res.status(400).json({ success: false, message: '密码至少4位' });
  }
  const hash = bcrypt.hashSync(password, 10);
  const encrypted = encrypt(password);
  db.prepare(
    'UPDATE users SET password_hash = ?, password_encrypted = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(hash, encrypted, id);
  res.json({ success: true });
});

// 员工自助修改密码（需登录，验证旧密码）
router.patch('/me/password', loginRequired, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ success: false, message: '请填写旧密码和新密码' });
  }
  if (newPassword.length < 4) {
    return res.status(400).json({ success: false, message: '新密码至少4位' });
  }
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

// 删除用户（管理员）
router.delete('/:id', adminOnly, (req, res) => {
  const { id } = req.params;
  if (String(id) === String(req.session.user.id)) {
    return res.status(400).json({ success: false, message: '不能删除自己' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ success: true });
});

module.exports = exports = router;
