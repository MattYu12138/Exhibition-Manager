require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const cors = require('cors');
const path = require('path');

const authRouter = require('./routes/auth');
const systemsRouter = require('./routes/systems');
const usersRouter = require('./routes/users');
const ssoRouter = require('./routes/sso');

const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_DB_PATH = process.env.SESSION_DB_PATH || path.join(__dirname, '../../data/platform-sessions.db');

// 自动创建数据库目录
fs.mkdirSync(path.dirname(SESSION_DB_PATH), { recursive: true });

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

app.use(express.json());

app.use(session({
  store: new SQLiteStore({ db: SESSION_DB_PATH, dir: '.' }),
  secret: process.env.SESSION_SECRET || 'lummi-platform-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

app.use('/api/auth', authRouter);
app.use('/api/systems', systemsRouter);
app.use('/api/users', usersRouter);
app.use('/api/sso', ssoRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'platform-backend', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Platform Backend running on port ${PORT}`);
});
