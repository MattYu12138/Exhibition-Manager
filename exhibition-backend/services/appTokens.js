const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_ISSUER = 'lummi-platform';
const JWT_AUDIENCE = 'lummi-ios';

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    const error = new Error('JWT_SECRET must be configured with at least 32 characters');
    error.code = 'JWT_NOT_CONFIGURED';
    throw error;
  }
  return secret;
}

function publicUser(user) {
  return {
    id: String(user.id),
    username: user.username,
    displayName: user.username,
    role: user.role,
  };
}

function bearerToken(req) {
  const header = req.get('authorization');
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

function cleanupExpiredRevocations() {
  db.prepare("DELETE FROM app_revoked_access_tokens WHERE expires_at <= datetime('now')").run();
}

function verifyAccessToken(rawToken) {
  const payload = jwt.verify(rawToken, jwtSecret(), {
    algorithms: ['HS256'],
    audience: JWT_AUDIENCE,
    issuer: JWT_ISSUER,
  });

  if (payload.type !== 'access' || !payload.sub || !payload.jti) {
    const error = new Error('Invalid access token');
    error.code = 'INVALID_TOKEN';
    throw error;
  }

  cleanupExpiredRevocations();
  const revoked = db.prepare(
    "SELECT 1 FROM app_revoked_access_tokens WHERE jti = ? AND expires_at > datetime('now')"
  ).get(payload.jti);
  if (revoked) {
    const error = new Error('Access token has been revoked');
    error.code = 'REVOKED_TOKEN';
    throw error;
  }

  const user = db.prepare(
    'SELECT id, username, role, token_version FROM users WHERE id = ?'
  ).get(String(payload.sub));
  if (!user || Number(user.token_version || 0) !== Number(payload.ver || 0)) {
    const error = new Error('Access token is no longer valid');
    error.code = 'REVOKED_TOKEN';
    throw error;
  }

  if (user.role !== 'admin') {
    const permission = db.prepare(
      "SELECT role FROM platform_permissions WHERE user_id = ? AND system = 'exhibition-manager'"
    ).get(String(user.id));
    if (!permission) {
      const error = new Error('User has no Exhibition Manager permission');
      error.code = 'FORBIDDEN_SYSTEM';
      throw error;
    }
  }

  return publicUser(user);
}

function revokeAllUserTokens(userId) {
  const transaction = db.transaction(() => {
    db.prepare(`
      UPDATE users
      SET token_version = COALESCE(token_version, 0) + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(String(userId));
    db.prepare(`
      UPDATE app_refresh_tokens
      SET revoked_at = COALESCE(revoked_at, datetime('now'))
      WHERE user_id = ? AND revoked_at IS NULL
    `).run(String(userId));
  });
  transaction();
}

function authenticateRequest(req) {
  if (req.session && req.session.user) {
    const user = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(String(req.session.user.id));
    if (!user) return null;
    req.session.user = publicUser(user);
    return req.session.user;
  }

  const token = bearerToken(req);
  if (!token) return null;
  return verifyAccessToken(token);
}

module.exports = { authenticateRequest, bearerToken, publicUser, revokeAllUserTokens, verifyAccessToken };
