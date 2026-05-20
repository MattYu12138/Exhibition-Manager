require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// 初始化数据库（建表）
require('./db');

const app = express();
const PORT = process.env.PORT || 3003;

// ── 中间件 ────────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5174',
  credentials: true,
}));

// Session（与 exhibition-backend 使用相同的 session DB，实现跨服务 session 共享）
const SESSION_DB_PATH = process.env.SESSION_DB_PATH || path.join(__dirname, '../data/database/sessions.db');
fs.mkdirSync(path.dirname(SESSION_DB_PATH), { recursive: true });

app.use(session({
  // 独立 cookie 名，避免与 exhibition/inventory/platform 的 session 相互覆盖
  name: 'warehouse.sid',
  store: new SQLiteStore({ db: 'sessions.db', dir: path.dirname(SESSION_DB_PATH) }),
  secret: process.env.SESSION_SECRET || 'lummi-warehouse-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7天
    sameSite: 'lax',
  },
}));

// ── 路由 ──────────────────────────────────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/sso',      require('./routes/sso'));
app.use('/api/layouts',  require('./routes/layouts'));
app.use('/api/locations',require('./routes/locations'));
app.use('/api/picking',  require('./routes/picking'));
app.use('/api/products', require('./routes/products'));

// ── 健康检查 ──────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'warehouse-backend', version: '1.0.0' });
});

// ── 启动 ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[warehouse-backend] 运行在端口 ${PORT}`);
});
