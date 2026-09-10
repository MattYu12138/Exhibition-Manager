const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('../platform-backend/node_modules/better-sqlite3');
const bcrypt = require('../platform-backend/node_modules/bcryptjs');

const root = path.resolve(__dirname, '..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lic-ios-auth-'));
const dbPath = path.join(tempDir, 'LIC_DB.db');
const jwtSecret = 'integration-test-jwt-secret-at-least-32-characters';
const platformPort = 3910;
const exhibitionPort = 3911;
const children = [];

function start(command, args, cwd, env) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', data => process.stdout.write(`[${path.basename(cwd)}] ${data}`));
  child.stderr.on('data', data => process.stderr.write(`[${path.basename(cwd)}] ${data}`));
  children.push(child);
  return child;
}

async function waitFor(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function run() {
  const common = {
    DB_PATH: dbPath,
    JWT_SECRET: jwtSecret,
    NODE_ENV: 'test',
    FRONTEND_URL: 'http://localhost',
  };

  start('node', ['src/index.js'], path.join(root, 'platform-backend'), {
    ...common,
    PORT: String(platformPort),
    SESSION_DB_PATH: path.join(tempDir, 'platform-sessions.db'),
  });
  await waitFor(`http://127.0.0.1:${platformPort}/api/health`);

  start('node', ['index.js'], path.join(root, 'exhibition-backend'), {
    ...common,
    PORT: String(exhibitionPort),
    SESSION_DB_PATH: path.join(tempDir, 'exhibition-sessions.db'),
  });
  await waitFor(`http://127.0.0.1:${exhibitionPort}/api/health`);

  const webLogin = await jsonRequest(`http://127.0.0.1:${platformPort}/api/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: '123456' }),
  });
  const webCookie = webLogin.response.headers.get('set-cookie');
  assert(webLogin.response.ok && webCookie, 'Existing web session login must remain available');
  const webSystems = await jsonRequest(`http://127.0.0.1:${platformPort}/api/systems`, {
    headers: { cookie: webCookie },
  });
  assert(webSystems.response.ok, 'Existing web session must still access protected APIs');

  const permissionDb = new Database(dbPath);
  permissionDb.prepare(
    "INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, 'staff')"
  ).run('USTAFF001', 'ios-staff', bcrypt.hashSync('staff-pass', 10));
  permissionDb.close();

  const staffLogin = await jsonRequest(`http://127.0.0.1:${platformPort}/api/auth/app-login`, {
    method: 'POST',
    body: JSON.stringify({ username: 'ios-staff', password: 'staff-pass' }),
  });
  assert(staffLogin.response.ok, 'Staff app login must succeed');
  const deniedExhibition = await jsonRequest(`http://127.0.0.1:${exhibitionPort}/api/exhibitions`, {
    headers: { authorization: `Bearer ${staffLogin.payload.access_token}` },
  });
  assert(deniedExhibition.response.status === 403, 'Staff without Exhibition permission must receive 403');

  const grantDb = new Database(dbPath);
  grantDb.prepare(
    "INSERT INTO platform_permissions (id, user_id, system, role) VALUES (?, ?, 'exhibition-manager', 'viewer')"
  ).run('PERM_STAFF_EXHIBITION', 'USTAFF001');
  grantDb.close();
  const allowedExhibition = await jsonRequest(`http://127.0.0.1:${exhibitionPort}/api/exhibitions`, {
    headers: { authorization: `Bearer ${staffLogin.payload.access_token}` },
  });
  assert(allowedExhibition.response.ok, 'Staff with Exhibition permission must be allowed');

  const badLogin = await jsonRequest(`http://127.0.0.1:${platformPort}/api/auth/app-login`, {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: 'incorrect' }),
  });
  assert(badLogin.response.status === 401, 'Invalid password must return 401');

  const login = await jsonRequest(`http://127.0.0.1:${platformPort}/api/auth/app-login`, {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: '123456' }),
  });
  assert(login.response.ok && login.payload.success, 'App login must succeed');
  assert(login.payload.expires_in === 3600, 'Access token must last one hour');
  assert(login.payload.refresh_expires_in === 2592000, 'Refresh token must last 30 days');
  assert(typeof login.payload.user.id === 'string', 'User id must be returned as a string');
  const accessToken = login.payload.access_token;
  const refreshToken = login.payload.refresh_token;

  const platformMe = await jsonRequest(`http://127.0.0.1:${platformPort}/api/auth/me`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  assert(platformMe.response.ok && platformMe.payload.user.username === 'admin', 'Platform Bearer /me must work');

  const systems = await jsonRequest(`http://127.0.0.1:${platformPort}/api/systems`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  assert(systems.response.ok && Array.isArray(systems.payload), 'Platform systems must accept Bearer auth');

  const exhibitions = await jsonRequest(`http://127.0.0.1:${exhibitionPort}/api/exhibitions`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  assert(exhibitions.response.ok, 'Exhibition API must accept the Platform-issued Bearer token');

  const refreshed = await jsonRequest(`http://127.0.0.1:${platformPort}/api/auth/refresh-token`, {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  assert(refreshed.response.ok && refreshed.payload.data.access_token, 'Refresh token must issue a new access token');
  const refreshedAccessToken = refreshed.payload.data.access_token;

  const logout = await jsonRequest(`http://127.0.0.1:${platformPort}/api/auth/logout`, {
    method: 'POST',
    headers: { authorization: `Bearer ${refreshedAccessToken}` },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  assert(logout.response.ok, 'App logout must succeed');

  const revokedPlatform = await jsonRequest(`http://127.0.0.1:${platformPort}/api/auth/me`, {
    headers: { authorization: `Bearer ${refreshedAccessToken}` },
  });
  assert(revokedPlatform.response.status === 401, 'Logged-out access token must be rejected by Platform');

  const revokedExhibition = await jsonRequest(`http://127.0.0.1:${exhibitionPort}/api/exhibitions`, {
    headers: { authorization: `Bearer ${refreshedAccessToken}` },
  });
  assert(revokedExhibition.response.status === 401, 'Logged-out access token must be rejected by Exhibition');

  const revokedRefresh = await jsonRequest(`http://127.0.0.1:${platformPort}/api/auth/refresh-token`, {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  assert(revokedRefresh.response.status === 401, 'Logged-out refresh token must be rejected');

  const secondLogin = await jsonRequest(`http://127.0.0.1:${platformPort}/api/auth/app-login`, {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: '123456' }),
  });
  assert(secondLogin.response.ok, 'Second app login must succeed before password change');
  const secondAccess = secondLogin.payload.access_token;
  const secondRefresh = secondLogin.payload.refresh_token;

  const passwordChange = await jsonRequest(`http://127.0.0.1:${platformPort}/api/users/me/password`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${secondAccess}` },
    body: JSON.stringify({ oldPassword: '123456', newPassword: '654321' }),
  });
  assert(passwordChange.response.ok, 'Bearer-authenticated password change must succeed');

  const invalidatedAccess = await jsonRequest(`http://127.0.0.1:${exhibitionPort}/api/exhibitions`, {
    headers: { authorization: `Bearer ${secondAccess}` },
  });
  assert(invalidatedAccess.response.status === 401, 'Password change must invalidate existing access tokens');

  const invalidatedRefresh = await jsonRequest(`http://127.0.0.1:${platformPort}/api/auth/refresh-token`, {
    method: 'POST',
    body: JSON.stringify({ refresh_token: secondRefresh }),
  });
  assert(invalidatedRefresh.response.status === 401, 'Password change must invalidate existing refresh tokens');

  console.log('PASS: iOS 30-day JWT authentication integration');
}

run()
  .catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(() => {
    children.forEach(child => child.kill('SIGTERM'));
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
