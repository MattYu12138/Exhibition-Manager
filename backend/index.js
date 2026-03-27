require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const exhibitionsRouter = require('./routes/exhibitions');
const shopifyRouter = require('./routes/shopify');
const squareRouter = require('./routes/square');

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
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

// API 路由
app.use('/api/exhibitions', exhibitionsRouter);
app.use('/api/shopify', shopifyRouter);
app.use('/api/square', squareRouter);

// 生产环境：提供前端静态文件
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
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
