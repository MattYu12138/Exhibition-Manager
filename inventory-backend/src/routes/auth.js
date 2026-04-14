/**
 * 认证模块：登录、登出、验证码、当前用户
 * 与 platform-backend 共享 exhibition.db 用户表
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const svgCaptcha = require('svg-captcha');
const path = require('path');
const Database = require('better-sqlite3');

function getDb() {
  const dbPath = process.env.DB_PATH || path.join(__dirname, '../../../data/database/exhibition.db');
  return new Database(dbPath);
}

// ─── 图形验证码 ───────────────────────────────────────────────
router.get('/captcha', (req, res) => {
  const captcha = svgCaptcha.create({
    size: 4,
    noise: 2,
    color: true,
    background: '#f0f4ff',
    width: 120,
    height: 40,
    fontSize: 40,
  });
  req.session.captcha = captcha.text.toLowerCase();
  res.type('svg');
  res.send(captcha.data);
});

// ─── 登录 ─────────────────────────────────────────────────────
router.post('/login', (req, res) => {
  const { username, password, captcha } = req.body;

  if (!username || !password || !captcha) {
    return res.status(400).json({ success: false, message: '请填写所有字段' });
  }

  // 验证验证码（不区分大小写）
  if (!req.session.captcha || captcha.toLowerCase() !== req.session.captcha) {
    req.session.captcha = null;
    return res.status(400).json({ success: false, message: '验证码错误' });
  }
  req.session.captcha = null;

  const db = getDb();
  try {
    // 统一使用 exhibition 的 users 表
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) {
      return res.status(401).json({ success: false, message: '用户名或密码错误' });
    }

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, message: '用户名或密码错误' });
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      displayName: user.username,
      role: user.role,
    };

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.username,
        role: user.role,
      },
    });
  } finally {
    db.close();
  }
});

// ─── 登出 ─────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// ─── 获取当前登录用户 ─────────────────────────────────────────
router.get('/me', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: '未登录' });
  }
  res.json({ success: true, user: req.session.user });
});

module.exports = router;
