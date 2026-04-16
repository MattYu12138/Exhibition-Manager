/**
 * SSO 单点登录模块
 * platform-backend 生成一次性 token，各子系统验证后自动建立 session
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { requireLogin } = require('../middleware/auth');
const { getDb } = require('../db');

// 内存存储 SSO tokens（token => { user, expiresAt }）
// 生产环境可替换为 Redis，但 SQLite 内存表也足够
const ssoTokens = new Map();

// 定期清理过期 token（每 5 分钟）
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of ssoTokens.entries()) {
    if (data.expiresAt < now) {
      ssoTokens.delete(token);
    }
  }
}, 5 * 60 * 1000);

/**
 * POST /api/sso/token
 * 已登录用户请求一个一次性 SSO token，用于跳转到子系统时自动登录
 * Body: { system: 'exhibition' | 'inventory' }
 */
router.post('/token', requireLogin, (req, res) => {
  const { system } = req.body;

  if (!system) {
    return res.status(400).json({ success: false, message: '缺少 system 参数' });
  }

  // 从 DB 重新查询用户最新信息，避免 session 缓存的角色过时
  const db = getDb();
  const freshUser = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(req.session.user.id);
  if (!freshUser) {
    return res.status(401).json({ success: false, message: '用户不存在' });
  }
  const user = { id: freshUser.id, username: freshUser.username, role: freshUser.role };
  // 同步更新 session 中的角色
  req.session.user = { ...req.session.user, ...user };

  // 生成 32 字节随机 token
  const token = crypto.randomBytes(32).toString('hex');

  // 有效期 30 秒（一次性使用）
  ssoTokens.set(token, {
    user,
    system,
    expiresAt: Date.now() + 30 * 1000,
  });

  res.json({ success: true, token });
});

/**
 * POST /api/sso/verify
 * 子系统调用此接口验证 token，验证成功后返回用户信息
 * Body: { token, system }
 * 注意：此接口供子系统后端调用，需要配置 SSO_SECRET 做服务间鉴权
 */
router.post('/verify', (req, res) => {
  const { token, system, secret } = req.body;

  // 验证服务间共享密钥
  const SSO_SECRET = process.env.SSO_SECRET || 'lummi-sso-secret-2026';
  if (secret !== SSO_SECRET) {
    return res.status(403).json({ success: false, message: '无效的服务密钥' });
  }

  if (!token) {
    return res.status(400).json({ success: false, message: '缺少 token' });
  }

  const data = ssoTokens.get(token);

  if (!data) {
    return res.status(401).json({ success: false, message: 'token 不存在或已过期' });
  }

  if (data.expiresAt < Date.now()) {
    ssoTokens.delete(token);
    return res.status(401).json({ success: false, message: 'token 已过期' });
  }

  if (data.system !== system) {
    return res.status(401).json({ success: false, message: 'token 系统不匹配' });
  }

  // 一次性使用，验证后立即删除
  ssoTokens.delete(token);

  res.json({ success: true, user: data.user });
});

/**
 * POST /api/sso/issue
 * 子系统后端调用此接口，代表已登录用户申请一个返回 platform 的一次性 token
 * Body: { user, secret }
 */
router.post('/issue', (req, res) => {
  const { user, secret } = req.body;
  const SSO_SECRET = process.env.SSO_SECRET || 'lummi-sso-secret-2026';
  if (secret !== SSO_SECRET) {
    return res.status(403).json({ success: false, message: '无效的服务密鑰' });
  }
  if (!user || !user.id) {
    return res.status(400).json({ success: false, message: '缺少用户信息' });
  }
  // 从 DB 重新查询用户最新角色，确保 platform 收到的是最新身份
  const db = getDb();
  const freshUser = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(user.id);
  const issueUser = freshUser
    ? { id: freshUser.id, username: freshUser.username, role: freshUser.role }
    : user; // fallback to passed user if not found
  const token = crypto.randomBytes(32).toString('hex');
  ssoTokens.set(token, {
    user: issueUser,
    system: 'platform',
    expiresAt: Date.now() + 30 * 1000,
  });
  res.json({ success: true, token });
});

/**
 * POST /api/sso/login
 * platform 前端使用此接口验证一次性 token，建立 platform 本地 session
 * Body: { token }
 */
router.post('/login', (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ success: false, message: '缺少 token' });
  }
  const data = ssoTokens.get(token);
  if (!data) {
    return res.status(401).json({ success: false, message: 'token 不存在或已过期' });
  }
  if (data.expiresAt < Date.now()) {
    ssoTokens.delete(token);
    return res.status(401).json({ success: false, message: 'token 已过期' });
  }
  ssoTokens.delete(token);
  req.session.user = {
    id: data.user.id,
    username: data.user.username,
    role: data.user.role,
  };
  res.json({ success: true, user: req.session.user });
});

module.exports = router;
