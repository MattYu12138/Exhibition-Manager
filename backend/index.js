require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const exhibitionsRouter = require('./routes/exhibitions');
const shopifyRouter = require('./routes/shopify');
const squareRouter = require('./routes/square');
const authRouter = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors({
  origin: function(origin, callback) {
    // 允许 Shopify Admin iframe、本地开发、以及无 origin 的请求（同源）
    const allowed = [
      process.env.FRONTEND_URL || 'http://localhost:5173',
      'https://admin.shopify.com',
    ];
    if (!origin || allowed.some(o => origin.startsWith(o))) {
      callback(null, true);
    } else {
      callback(null, true); // 私有应用，允许所有来源
    }
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    shopify_configured: !!(process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_ACCESS_TOKEN),
    square_configured: !!(process.env.SQUARE_ACCESS_TOKEN && process.env.SQUARE_LOCATION_ID),
  });
});

// OAuth 授权路由（用于获取主商店 Access Token，一次性使用）
app.use('/', authRouter);

// API 路由
app.use('/api/exhibitions', exhibitionsRouter);
app.use('/api/shopify', shopifyRouter);
app.use('/api/square', squareRouter);

// 提供前端静态文件（当 dist 目录存在时）
const fs = require('fs');
const distPath = path.resolve(__dirname, '../frontend/dist');
console.log('[Static] dist path:', distPath, 'exists:', fs.existsSync(distPath));
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  // SPA fallback: 非 /api 路由都返回 index.html
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// 错误处理
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: '服务器内部错误', error: err.message });
});

app.listen(PORT, () => {
  console.log(`\n🚀 展会管理后端服务已启动`);
  console.log(`   地址: http://localhost:${PORT}`);
  console.log(`   Shopify: ${process.env.SHOPIFY_STORE_DOMAIN || '未配置'}`);
  console.log(`   Square: ${process.env.SQUARE_ENVIRONMENT || 'sandbox'} 环境\n`);
});

module.exports = app;
