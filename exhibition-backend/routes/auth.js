/**
 * 认证模块：登录、登出、当前用户
 * （原 Shopify Token 管理功能已保留在下方）
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { URLSearchParams } = require('url');

// ─── 用户认证 ────────────────────────────────────────────────

// 登录（已移除验证码）
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: '请填写用户名和密码' });
  }

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
    try {
      const system = db.prepare("SELECT id FROM platform_systems WHERE name = 'exhibition-manager' LIMIT 1").get();
      if (system) {
        const perm = db.prepare(
          'SELECT can_read FROM platform_permissions WHERE user_id = ? AND system_id = ?'
        ).get(user.id, system.id);
        if (!perm || !perm.can_read) {
          return res.status(403).json({ success: false, message: '您没有访问展会管理系统的权限，请联系管理员' });
        }
      }
      // 若 platform_systems 表不存在或无记录，默认允许登录
    } catch (e) {
      console.warn('[Auth] platform_systems 查询失败，跳过权限检查:', e.message);
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
