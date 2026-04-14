require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const productsRouter = require('./routes/products');
const ssoRouter = require('./routes/sso');
const authRouter = require('./routes/auth');
const { getDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3002;

const SESSION_DB_PATH = process.env.SESSION_DB_PATH || path.join(__dirname, '../../data/database/inventory-sessions.db');
const SESSION_DB_DIR = path.dirname(SESSION_DB_PATH);
const SESSION_DB_FILE = path.basename(SESSION_DB_PATH);

// 自动创建数据库目录
fs.mkdirSync(SESSION_DB_DIR, { recursive: true });

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5175',
  credentials: true
}));

app.use(express.json());

app.use(session({
  store: new SQLiteStore({ db: SESSION_DB_FILE, dir: SESSION_DB_DIR }),
  secret: process.env.SESSION_SECRET || 'lummi-platform-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 3 * 60 * 60 * 1000, // 3 hours
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  }
}));

// Initialize DB
getDb();

// SSO 单点登录（无需登录）
app.use('/api/sso', ssoRouter);
// 独立登录（captcha + 用户名密码）
app.use('/api/auth', authRouter);

app.use('/api/products', productsRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'inventory-backend', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Inventory Backend running on port ${PORT}`);
});
