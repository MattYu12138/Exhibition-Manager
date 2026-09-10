const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db');

const ACCESS_TOKEN_SECONDS = 60 * 60;
const REFRESH_TOKEN_SECONDS = 30 * 24 * 60 * 60;
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

function sqliteDateFromNow(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function publicUser(user) {
  return {
    id: String(user.id),
    username: user.username,
    displayName: user.username,
    role: user.role,
  };
}

function cleanupExpiredTokens(db) {
  db.prepare("DELETE FROM app_refresh_tokens WHERE expires_at <= datetime('now')").run();
  db.prepare("DELETE FROM app_revoked_access_tokens WHERE expires_at <= datetime('now')").run();
}

function signAccessToken(user) {
  const jti = crypto.randomUUID();
  const token = jwt.sign(
    {
      username: user.username,
      type: 'access',
      ver: Number(user.token_version || 0),
    },
    jwtSecret(),
    {
      algorithm: 'HS256',
      audience: JWT_AUDIENCE,
      issuer: JWT_ISSUER,
      subject: String(user.id),
      expiresIn: ACCESS_TOKEN_SECONDS,
      jwtid: jti,
    }
  );
  return { token, jti, expiresIn: ACCESS_TOKEN_SECONDS };
}

function issueRefreshToken(user, req) {
  const db = getDb();
  cleanupExpiredTokens(db);

  const rawToken = crypto.randomBytes(48).toString('base64url');
  const id = crypto.randomUUID();
  const expiresAt = sqliteDateFromNow(REFRESH_TOKEN_SECONDS);
  const userAgent = String(req.get('user-agent') || '').slice(0, 500);

  db.prepare(`
    INSERT INTO app_refresh_tokens
      (id, user_id, token_hash, expires_at, user_agent)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, String(user.id), hashToken(rawToken), expiresAt, userAgent);

  return { token: rawToken, expiresIn: REFRESH_TOKEN_SECONDS };
}

function issueAppSession(user, req) {
  const access = signAccessToken(user);
  const refresh = issueRefreshToken(user, req);
  return {
    user: publicUser(user),
    accessToken: access.token,
    accessExpiresIn: access.expiresIn,
    refreshToken: refresh.token,
    refreshExpiresIn: refresh.expiresIn,
  };
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

  const db = getDb();
  cleanupExpiredTokens(db);

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

  return publicUser(user);
}

function refreshAppSession(rawRefreshToken) {
  if (!rawRefreshToken || typeof rawRefreshToken !== 'string') {
    const error = new Error('Refresh token is required');
    error.code = 'INVALID_REFRESH_TOKEN';
    throw error;
  }

  const db = getDb();
  cleanupExpiredTokens(db);

  const record = db.prepare(`
    SELECT rt.id, rt.expires_at, u.id AS user_id, u.username, u.role, u.token_version
    FROM app_refresh_tokens rt
    JOIN users u ON u.id = rt.user_id
    WHERE rt.token_hash = ?
      AND rt.revoked_at IS NULL
      AND rt.expires_at > datetime('now')
  `).get(hashToken(rawRefreshToken));

  if (!record) {
    const error = new Error('Refresh token is invalid or expired');
    error.code = 'INVALID_REFRESH_TOKEN';
    throw error;
  }

  db.prepare("UPDATE app_refresh_tokens SET last_used_at = datetime('now') WHERE id = ?").run(record.id);
  const access = signAccessToken({
    id: record.user_id,
    username: record.username,
    role: record.role,
    token_version: record.token_version,
  });
  const remainingSeconds = Math.max(0, Math.floor((new Date(`${record.expires_at}Z`).getTime() - Date.now()) / 1000));

  return {
    user: publicUser({ id: record.user_id, username: record.username, role: record.role }),
    accessToken: access.token,
    accessExpiresIn: access.expiresIn,
    refreshExpiresIn: remainingSeconds,
  };
}

function revokeRefreshToken(rawRefreshToken) {
  if (!rawRefreshToken || typeof rawRefreshToken !== 'string') return;
  const db = getDb();
  db.prepare(`
    UPDATE app_refresh_tokens
    SET revoked_at = COALESCE(revoked_at, datetime('now'))
    WHERE token_hash = ?
  `).run(hashToken(rawRefreshToken));
}

function revokeAccessToken(rawAccessToken) {
  if (!rawAccessToken) return;
  let payload;
  try {
    payload = jwt.verify(rawAccessToken, jwtSecret(), {
      algorithms: ['HS256'],
      audience: JWT_AUDIENCE,
      issuer: JWT_ISSUER,
      ignoreExpiration: true,
    });
  } catch (_) {
    return;
  }
  if (!payload.jti || !payload.exp) return;
  const expiresAt = new Date(payload.exp * 1000).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
  getDb().prepare(`
    INSERT OR REPLACE INTO app_revoked_access_tokens (jti, expires_at)
    VALUES (?, ?)
  `).run(payload.jti, expiresAt);
}

function revokeAllUserTokens(userId) {
  const db = getDb();
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

function bearerToken(req) {
  const header = req.get('authorization');
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

function authenticateRequest(req) {
  if (req.session && req.session.user) {
    const user = getDb().prepare('SELECT id, username, role FROM users WHERE id = ?').get(String(req.session.user.id));
    if (!user) return null;
    req.session.user = publicUser(user);
    return req.session.user;
  }

  const token = bearerToken(req);
  if (!token) return null;
  return verifyAccessToken(token);
}

module.exports = {
  ACCESS_TOKEN_SECONDS,
  REFRESH_TOKEN_SECONDS,
  authenticateRequest,
  bearerToken,
  issueAppSession,
  publicUser,
  refreshAppSession,
  revokeAccessToken,
  revokeAllUserTokens,
  revokeRefreshToken,
  verifyAccessToken,
};
