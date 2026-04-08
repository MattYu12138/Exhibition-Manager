require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);

const exhibitionsRouter = require('./routes/exhibitions');
const shopifyRouter = require('./routes/shopify');
const squareRouter = require('./routes/square');
const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const { requireLogin, requireStaff } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── 中间件 ───────────────────────────────────────────────────
app.use(cors({
  origin: function(origin, callback) {
    const allowed = [
      process.env.FRONTEND_URL || 'http://localhost:5173',
      'https://admin.shopify.com',
    ];
    if (!origin || allowed.some(o => origin.startsWith(o))) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session 配置（3 小时有效期）
// connect-sqlite3 需要 dir（目录）+ db（文件名）分开传，不支持完整路径
const sessionDbFull = process.env.SESSION_DB_PATH || path.join(__dirname, 'sessions.db');
const sessionDbDir = path.dirname(sessionDbFull);
const sessionDbFile = path.basename(sessionDbFull);
app.use(session({
  store: new SQLiteStore({ db: sessionDbFile, dir: sessionDbDir, table: 'sessions' }),
  secret: process.env.SESSION_SECRET || 'exhibition-manager-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 3 * 60 * 60 * 1000, // 3 小时
    httpOnly: true,
    sameSite: 'lax',
  },
}));

// ─── 路由 ─────────────────────────────────────────────────────

// 健康检查（无需登录）
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    shopify_configured: !!(process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_ACCESS_TOKEN),
    square_configured: !!(process.env.SQUARE_ACCESS_TOKEN && process.env.SQUARE_LOCATION_ID),
  });
});

// 认证路由（无需登录）
app.use('/api/auth', authRouter);

// 账号管理路由（仅管理员）
app.use('/api/users', usersRouter);

// 业务路由（需要登录）
app.use('/api/exhibitions', requireLogin, exhibitionsRouter);
app.use('/api/shopify', requireLogin, shopifyRouter);
app.use('/api/square', requireLogin, squareRouter);

// 原 Shopify OAuth 路由（保留兼容）
app.use('/', authRouter);

// ─── 静态文件 & SPA fallback ──────────────────────────────────
const fs = require('fs');
const distPath = path.resolve(__dirname, '../frontend/dist');
console.log('[Static] dist path:', distPath, 'exists:', fs.existsSync(distPath));
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ─── 错误处理 ─────────────────────────────────────────────────
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
