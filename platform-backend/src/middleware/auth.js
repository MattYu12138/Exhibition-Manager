const { authenticateRequest } = require('../auth/appTokens');

function authenticationError(res, error) {
  if (error && error.code === 'JWT_NOT_CONFIGURED') {
    console.error('[Auth] JWT configuration error:', error.message);
    return res.status(503).json({ success: false, code: 'JWT_NOT_CONFIGURED', message: 'App 登录服务尚未配置' });
  }
  if (error && error.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, code: 'TOKEN_EXPIRED', message: '登录已过期，请刷新或重新登录' });
  }
  return res.status(401).json({ success: false, code: 'INVALID_TOKEN', message: '登录凭证无效' });
}

function requireLogin(req, res, next) {
  try {
    const user = authenticateRequest(req);
    if (!user) {
      return res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: '未登录' });
    }
    req.authUser = user;
    next();
  } catch (error) {
    return authenticationError(res, error);
  }
}

function requireAdmin(req, res, next) {
  requireLogin(req, res, () => {
    if (req.authUser.role !== 'admin') {
      return res.status(403).json({ success: false, message: '需要管理员权限' });
    }
    next();
  });
}

module.exports = { requireLogin, requireAdmin };
