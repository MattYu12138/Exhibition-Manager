/**
 * 认证模块：登录、登出、当前用户
 * 与 platform-backend 共享 exhibition.db 用户表
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');

// ─── 登录（已移除验证码） ─────────────────────────────────────
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: '请填写用户名和密码' });
  }

  const db = getDb();
  // 统一使用 exhibition 的 users 表
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) {
    return res.status(401).json({ success: false, message: '用户名或密码错误' });
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ success: false, message: '用户名或密码错误' });
  }

  // 权限检查：非管理员必须拥有 inventory-manager 的读权限才能登录
  if (user.role !== 'admin') {
    try {
      const system = db.prepare("SELECT id FROM platform_systems WHERE name = 'inventory-manager' LIMIT 1").get();
      if (system) {
        const perm = db.prepare(
          'SELECT can_read FROM platform_permissions WHERE user_id = ? AND system_id = ?'
        ).get(user.id, system.id);
        if (!perm || !perm.can_read) {
          return res.status(403).json({ success: false, message: '您没有访问库存管理系统的权限，请联系管理员' });
        }
      }
      // 若 platform_systems 表不存在或无记录，默认允许登录
    } catch (e) {
      console.warn('[Auth] platform_systems 查询失败，跳过权限检查:', e.message);
    }
  }

  req.session.user = {
    id: user.id,
    username: user.username,
    displayName: user.username,
    role: user.role,
  };

  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.username,
      role: user.role,
    },
  });
});

// ─── 登出 ─────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// ─── 获取当前登录用户 ─────────────────────────────────────────
router.get('/me', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: '未登录' });
  }
  res.json({ success: true, user: req.session.user });
});

module.exports = router;
