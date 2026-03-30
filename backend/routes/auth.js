/**
 * Shopify OAuth 授权路由
 * 用途：一次性获取主商店的 Access Token
 * 使用方法：
 *   1. 确保 .env 中已填写 SHOPIFY_API_KEY 和 SHOPIFY_API_SECRET
 *   2. 启动后端，浏览器访问 http://localhost:3001/auth?shop=你的商店.myshopify.com
 *   3. 授权后 Token 会显示在页面上，复制填入 .env 的 SHOPIFY_ACCESS_TOKEN
 */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const axios = require('axios');

const SCOPES = 'read_products,write_products,read_inventory,write_inventory';

// 步骤 1：发起 OAuth 授权
router.get('/auth', (req, res) => {
  const shop = req.query.shop;
  if (!shop) {
    return res.status(400).send('缺少 shop 参数，请使用 /auth?shop=你的商店.myshopify.com');
  }

  const apiKey = process.env.SHOPIFY_API_KEY;
  const redirectUri = process.env.SHOPIFY_REDIRECT_URI || `http://localhost:3001/auth/callback`;
  const nonce = crypto.randomBytes(16).toString('hex');

  // 将 nonce 存入内存（生产环境应存 session/redis）
  req.app.locals.oauthNonce = nonce;
  req.app.locals.oauthShop = shop;

  const authUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${apiKey}` +
    `&scope=${SCOPES}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${nonce}`;

  console.log('[OAuth] 跳转授权页面:', authUrl);
  res.redirect(authUrl);
});

// 步骤 2：Shopify 回调，用 code 换取 access_token
router.get('/auth/callback', async (req, res) => {
  const { shop, code, state, hmac } = req.query;

  // 验证 nonce
  if (state !== req.app.locals.oauthNonce) {
    return res.status(403).send('OAuth state 验证失败，请重新授权');
  }

  // 验证 HMAC（安全校验）
  const apiSecret = process.env.SHOPIFY_API_SECRET;
  const params = Object.keys(req.query)
    .filter(k => k !== 'hmac')
    .sort()
    .map(k => `${k}=${req.query[k]}`)
    .join('&');
  const digest = crypto.createHmac('sha256', apiSecret).update(params).digest('hex');
  if (digest !== hmac) {
    return res.status(403).send('HMAC 验证失败');
  }

  try {
    // 用 code 换取 access_token
    const tokenRes = await axios.post(
      `https://${shop}/admin/oauth/access_token`,
      {
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        code,
      }
    );

    const accessToken = tokenRes.data.access_token;
    console.log('[OAuth] 获取 Token 成功:', accessToken);

    // 显示 Token 给用户复制
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>授权成功 - Exhibition Manager</title>
        <style>
          body { font-family: sans-serif; max-width: 600px; margin: 60px auto; padding: 20px; }
          .token-box { background: #f0f9ff; border: 2px solid #0ea5e9; border-radius: 8px; padding: 20px; margin: 20px 0; }
          code { font-size: 14px; word-break: break-all; color: #0369a1; }
          .step { background: #f8fafc; border-left: 4px solid #22c55e; padding: 12px 16px; margin: 10px 0; }
          button { background: #0ea5e9; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; }
        </style>
      </head>
      <body>
        <h2>✅ 授权成功！</h2>
        <p>商店：<strong>${shop}</strong></p>

        <div class="token-box">
          <p><strong>Access Token（请立即复制保存）：</strong></p>
          <code id="token">${accessToken}</code><br><br>
          <button onclick="navigator.clipboard.writeText('${accessToken}').then(()=>alert('已复制！'))">
            复制 Token
          </button>
        </div>

        <h3>下一步操作：</h3>
        <div class="step">1. 打开项目中的 <code>backend/.env</code> 文件</div>
        <div class="step">2. 修改以下两行：<br><br>
          <code>SHOPIFY_STORE_DOMAIN=${shop}</code><br>
          <code>SHOPIFY_ACCESS_TOKEN=${accessToken}</code>
        </div>
        <div class="step">3. 重启后端：停止当前进程（Ctrl+C），重新运行 <code>node backend/index.js</code></div>
        <div class="step">4. 刷新展会管理页面，即可加载真实商店的商品</div>

        <p style="color:#64748b; margin-top:30px; font-size:13px;">
          ⚠️ 此页面关闭后 Token 无法再次查看，请确保已复制保存。
        </p>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('[OAuth] 换取 Token 失败:', err.response?.data || err.message);
    res.status(500).send(`
      <h2>❌ 获取 Token 失败</h2>
      <pre>${JSON.stringify(err.response?.data || err.message, null, 2)}</pre>
      <p>请检查 .env 中的 SHOPIFY_API_KEY 和 SHOPIFY_API_SECRET 是否正确。</p>
    `);
  }
});

module.exports = router;
