/**
 * SSO 单点登录验证模块（exhibition-backend）
 * 接收前端传来的一次性 token，向 platform-backend 验证后自动建立本地 session
 */

const express = require('express');
const router = express.Router();

const PLATFORM_BACKEND_URL = process.env.PLATFORM_BACKEND_URL || 'http://localhost:3000';
const SSO_SECRET = process.env.SSO_SECRET || 'lummi-sso-secret-2026';

/**
 * POST /api/sso/login
 * Body: { token }
 * 前端跳转时携带 token，此接口向 platform 验证并建立本地 session
 */
router.post('/login', async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ success: false, message: '缺少 SSO token' });
  }

  try {
    // 向 platform-backend 验证 token
    const response = await fetch(`${PLATFORM_BACKEND_URL}/api/sso/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, system: 'exhibition', secret: SSO_SECRET }),
    });

    const data = await response.json();

    if (!data.success) {
      return res.status(401).json({ success: false, message: data.message || 'SSO 验证失败' });
    }

    // 建立本地 session
    req.session.user = {
      id: data.user.id,
      username: data.user.username,
      role: data.user.role,
    };

    res.json({
      success: true,
      user: req.session.user,
    });
  } catch (err) {
    console.error('[SSO] 验证失败:', err.message);
    res.status(500).json({ success: false, message: 'SSO 服务连接失败' });
  }
});

module.exports = router;
