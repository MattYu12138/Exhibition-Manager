/**
 * 认证与权限中间件（与 exhibition-backend 保持一致）
 */

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: '未登录' });
  }
  next();
}

function requireStaff(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: '未登录' });
  }
  if (req.session.user.role === 'guest') {
    return res.status(403).json({ success: false, message: '游客无权执行此操作' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: '未登录' });
  }
  if (req.session.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: '需要管理员权限' });
  }
  next();
}

module.exports = { requireLogin, requireStaff, requireAdmin };
