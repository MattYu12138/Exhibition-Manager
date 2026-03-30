/**
 * Shopify Token 管理模块
 * 基于官方文档：https://shopify.dev/docs/apps/build/dev-dashboard/get-api-access-tokens
 *
 * 使用 client_credentials grant 方式（Dev Dashboard App 专用）：
 *   - 不需要浏览器跳转授权页面
 *   - 直接用 Client ID + Client Secret POST 换取 access_token
 *   - Token 有效期 24 小时，自动刷新
 *
 * .env 需要配置：
 *   SHOPIFY_SHOP=lummi-in-colour           (不含 .myshopify.com)
 *   SHOPIFY_CLIENT_ID=your_client_id
 *   SHOPIFY_CLIENT_SECRET=your_client_secret
 */

const express = require('express');
const router = express.Router();
const { URLSearchParams } = require('url');

// Token 缓存（内存）
let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * 使用 client_credentials grant 获取 access_token
 * 官方文档示例：POST https://{shop}.myshopify.com/admin/oauth/access_token
 * Body: grant_type=client_credentials&client_id=...&client_secret=...
 */
async function getShopifyToken() {
  // 距离过期还有 60 秒以上则直接返回缓存
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  const shop = process.env.SHOPIFY_SHOP;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  if (!shop || !clientId || !clientSecret) {
    throw new Error(
      '缺少 Shopify 凭据，请在 .env 中配置 SHOPIFY_SHOP、SHOPIFY_CLIENT_ID、SHOPIFY_CLIENT_SECRET'
    );
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

/**
 * GET /auth/token
 * 返回当前有效的 access_token（供调试用）
 */
router.get('/auth/token', async (req, res) => {
  try {
    const token = await getShopifyToken();
    res.json({
      success: true,
      access_token: token,
      expires_at: new Date(tokenExpiresAt).toISOString(),
      message: '请将此 token 填入 .env 的 SHOPIFY_ACCESS_TOKEN（可选，系统会自动刷新）',
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
module.exports.getShopifyToken = getShopifyToken;
