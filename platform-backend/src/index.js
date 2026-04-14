require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const authRouter = require('./routes/auth');
const systemsRouter = require('./routes/systems');
const usersRouter = require('./routes/users');
const ssoRouter = require('./routes/sso');
const dbadminRouter = require('./routes/dbadmin');

const app = express();
const PORT = process.env.PORT || 3000;

const SESSION_DB_PATH = process.env.SESSION_DB_PATH || path.join(__dirname, '../../data/database/platform-sessions.db');
const SESSION_DB_DIR = path.dirname(SESSION_DB_PATH);
const SESSION_DB_FILE = path.basename(SESSION_DB_PATH);

// 自动创建数据库目录
fs.mkdirSync(SESSION_DB_DIR, { recursive: true });

const isProduction = process.env.NODE_ENV === 'production';

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5174',
  credentials: true
}));

app.use(express.json());

app.use(session({
  // 使用独立的 cookie 名称，避免与 exhibition/inventory 的 connect.sid 相互覆盖
  name: 'platform.sid',
  store: new SQLiteStore({ db: SESSION_DB_FILE, dir: SESSION_DB_DIR }),
  secret: process.env.SESSION_SECRET || 'lummi-platform-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 3 * 60 * 60 * 1000, // 3 hours
    sameSite: 'lax',
    secure: isProduction,
  }
}));

app.use('/api/auth', authRouter);
app.use('/api/systems', systemsRouter);
app.use('/api/users', usersRouter);
app.use('/api/sso', ssoRouter);
app.use('/api/dbadmin', dbadminRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'platform-backend', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Platform Backend running on port ${PORT}`);
});
