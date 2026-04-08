const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { userId } = require('../utils/snowflake');

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

// 获取所有用户列表
router.get('/', adminOnly, (req, res) => {
  const users = db.prepare('SELECT id, username, role, created_at FROM users ORDER BY created_at ASC').all();
  res.json({ success: true, data: users });
});

// 创建新用户
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
  const newId = userId(db);
  db.prepare(
    'INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)'
  ).run(newId, username, hash, role);
  res.json({ success: true, data: { id: newId, username, role } });
});

// 修改用户角色
router.patch('/:id/role', adminOnly, (req, res) => {
  const { role } = req.body;
  const { id } = req.params;
  if (!['admin', 'staff', 'guest'].includes(role)) {
    return res.status(400).json({ success: false, message: '无效的角色' });
  }
  // 不允许修改自己的角色（字符串比较）
  if (String(id) === String(req.session.user.id)) {
    return res.status(400).json({ success: false, message: '不能修改自己的角色' });
  }
  db.prepare('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(role, id);
  res.json({ success: true });
});

// 重置用户密码
router.patch('/:id/password', adminOnly, (req, res) => {
  const { password } = req.body;
  const { id } = req.params;
  if (!password || password.length < 4) {
    return res.status(400).json({ success: false, message: '密码至少4位' });
  }
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hash, id);
  res.json({ success: true });
});

// 删除用户
router.delete('/:id', adminOnly, (req, res) => {
  const { id } = req.params;
  // 不允许删除自己（字符串比较）
  if (String(id) === String(req.session.user.id)) {
    return res.status(400).json({ success: false, message: '不能删除自己' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ success: true });
});

module.exports = exports = router;
