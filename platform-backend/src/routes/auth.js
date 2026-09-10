/**
 * Web session authentication and 30-day iOS app authentication.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');
const { requireLogin } = require('../middleware/auth');
const {
  bearerToken,
  issueAppSession,
  refreshAppSession,
  revokeAccessToken,
  revokeRefreshToken,
} = require('../auth/appTokens');

const router = express.Router();
const appLoginAttempts = new Map();
const APP_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const APP_LOGIN_MAX_ATTEMPTS = 10;
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('invalid-password-placeholder', 10);

function normalizedCredentials(req) {
  return {
    username: String(req.body.username || '').trim(),
    password: String(req.body.password || ''),
  };
}

function appLoginRateKey(req, username) {
  return `${req.ip || req.socket.remoteAddress || 'unknown'}:${username.toLowerCase()}`;
}

function checkAppLoginRateLimit(req, username) {
  const key = appLoginRateKey(req, username);
  const now = Date.now();
  const current = appLoginAttempts.get(key);
  if (!current || current.resetAt <= now) {
    appLoginAttempts.set(key, { count: 1, resetAt: now + APP_LOGIN_WINDOW_MS });
    return true;
  }
  if (current.count >= APP_LOGIN_MAX_ATTEMPTS) return false;
  current.count += 1;
  return true;
}

function clearAppLoginAttempts(req, username) {
  appLoginAttempts.delete(appLoginRateKey(req, username));
}

// Existing browser login. The three-hour cookie session remains unchanged.
router.post('/login', (req, res) => {
  const { username, password } = normalizedCredentials(req);
  if (!username || !password) {
    return res.status(400).json({ success: false, message: '请填写用户名和密码' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ success: false, message: '用户名或密码错误' });
  }

  req.session.user = {
    id: String(user.id),
    username: user.username,
    displayName: user.username,
    role: user.role,
  };
  res.json({ success: true, user: req.session.user });
});

// iOS login. Access token lasts one hour; refresh token keeps the login for 30 days.
router.post('/app-login', (req, res) => {
  const { username, password } = normalizedCredentials(req);
  if (!username || !password) {
    return res.status(400).json({ success: false, message: '请填写用户名和密码' });
  }
  if (!checkAppLoginRateLimit(req, username)) {
    return res.status(429).json({ success: false, message: '登录尝试过于频繁，请稍后再试' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  const passwordHash = user ? user.password_hash : DUMMY_PASSWORD_HASH;
  if (!bcrypt.compareSync(password, passwordHash) || !user) {
    return res.status(401).json({ success: false, message: '用户名或密码错误' });
  }

  try {
    const session = issueAppSession(user, req);
    clearAppLoginAttempts(req, username);
    return res.json({
      success: true,
      access_token: session.accessToken,
      refresh_token: session.refreshToken,
      expires_in: session.accessExpiresIn,
      refresh_expires_in: session.refreshExpiresIn,
      user: session.user,
    });
  } catch (error) {
    console.error('[App Login]', error.message);
    return res.status(error.code === 'JWT_NOT_CONFIGURED' ? 503 : 500).json({
      success: false,
      code: error.code || 'APP_LOGIN_FAILED',
      message: error.code === 'JWT_NOT_CONFIGURED' ? 'App 登录服务尚未配置' : '登录服务暂时不可用',
    });
  }
});

router.post('/refresh-token', (req, res) => {
  try {
    const session = refreshAppSession(req.body.refresh_token);
    return res.json({
      success: true,
      data: {
        access_token: session.accessToken,
        expires_in: session.accessExpiresIn,
        refresh_expires_in: session.refreshExpiresIn,
      },
      user: session.user,
    });
  } catch (error) {
    const status = error.code === 'JWT_NOT_CONFIGURED' ? 503 : 401;
    return res.status(status).json({
      success: false,
      code: error.code || 'INVALID_REFRESH_TOKEN',
      message: status === 503 ? 'App 登录服务尚未配置' : '登录已过期，请重新登录',
    });
  }
});

// Browser logout and app token revocation share this endpoint.
router.post('/logout', (req, res) => {
  revokeRefreshToken(req.body && req.body.refresh_token);
  try {
    revokeAccessToken(bearerToken(req));
  } catch (error) {
    console.warn('[App Logout] token revocation skipped:', error.message);
  }

  if (req.session) {
    return req.session.destroy(() => {
      res.clearCookie('platform.sid');
      res.json({ success: true });
    });
  }
  return res.json({ success: true });
});

router.get('/me', requireLogin, (req, res) => {
  res.json({ success: true, user: req.authUser });
});

module.exports = router;
