/**
 * 认证模块：登录、登出、验证码、当前用户
 * （原 Shopify Token 管理功能已保留在下方）
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const svgCaptcha = require('svg-captcha');
const db = require('../db');
const { URLSearchParams } = require('url');

// ─── 用户认证 ────────────────────────────────────────────────

// 生成图形验证码
router.get('/captcha', (req, res) => {
  const captcha = svgCaptcha.create({
    size: 4,
    noise: 2,
    color: true,
    background: '#f0f4ff',
    width: 120,
    height: 40,
    fontSize: 40,
  });
  req.session.captcha = captcha.text.toLowerCase();
  res.type('svg');
  res.send(captcha.data);
});

// 登录
router.post('/login', (req, res) => {
  const { username, password, captcha } = req.body;

  if (!username || !password || !captcha) {
    return res.status(400).json({ success: false, message: '请填写所有字段' });
  }

  // 验证验证码（不区分大小写）
  if (!req.session.captcha || captcha.toLowerCase() !== req.session.captcha) {
    req.session.captcha = null;
    return res.status(400).json({ success: false, message: '验证码错误' });
  }
  req.session.captcha = null;

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) {
    return res.status(401).json({ success: false, message: '用户名或密码错误' });
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ success: false, message: '用户名或密码错误' });
  }

  // 权限检查：非管理员必须拥有 exhibition-manager 的读权限才能登录
  if (user.role !== 'admin') {
    const system = db.prepare("SELECT id FROM platform_systems WHERE name = 'exhibition-manager' LIMIT 1").get();
    if (system) {
      const perm = db.prepare(
        'SELECT can_read FROM platform_permissions WHERE user_id = ? AND system_id = ?'
      ).get(user.id, system.id);
      if (!perm || !perm.can_read) {
        return res.status(403).json({ success: false, message: '您没有访问展会管理系统的权限，请联系管理员' });
      }
    }
  }

  req.session.user = { id: user.id, username: user.username, role: user.role };

  res.json({
    success: true,
    user: { id: user.id, username: user.username, role: user.role },
  });
});

// 登出
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// 获取当前登录用户
router.get('/me', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: '未登录' });
  }
  res.json({ success: true, user: req.session.user });
});

// ─── Shopify Token 管理（原有功能保留） ──────────────────────

let cachedToken = null;
let tokenExpiresAt = 0;

async function getShopifyToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedToken;
  }
  const shop = process.env.SHOPIFY_SHOP;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!shop || !clientId || !clientSecret) {
    throw new Error('缺少 Shopify 凭据');
  }
  const response = await fetch(
    `https://${shop}.myshopify.com/admin/oauth/access_token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    }
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`获取 Shopify Token 失败 (${response.status}): ${text}`);
  }
  const { access_token, expires_in } = await response.json();
  cachedToken = access_token;
  tokenExpiresAt = Date.now() + expires_in * 1000;
  console.log(`[Shopify Auth] Token 获取成功，有效期 ${expires_in} 秒`);
  return cachedToken;
}

router.get('/auth/token', async (req, res) => {
  try {
    const token = await getShopifyToken();
    res.json({
      success: true,
      access_token: token,
      expires_at: new Date(tokenExpiresAt).toISOString(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
module.exports.getShopifyToken = getShopifyToken;
