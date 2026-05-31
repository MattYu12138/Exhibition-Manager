/**
 * 认证与权限中间件（仿照 inventory-backend，使用 requirePermission）
 * 权限来源：platform_permissions 表，system = 'warehouse-manager'
 * role: 'admin' = 读+写，'viewer' = 只读
 */
const { db } = require('../db');

/**
 * requirePermission(permission)
 * permission: 'read' | 'write'
 *
 * - admin 用户：始终放行
 * - 其他用户：查 platform_permissions WHERE user_id = ? AND system = 'warehouse-manager'
 *   - 无记录 → 403 无权访问
 *   - role = 'viewer' + permission = 'write' → 403 需要写入权限
 *   - role = 'admin' 或 permission = 'read' → 放行
 */
function requirePermission(permission = 'read') {
  return (req, res, next) => {
    const sessionUser = req.session?.user;
    const userId = sessionUser?.id || req.session?.userId;
    const role = sessionUser?.role || req.session?.role;

    if (!req.session || !userId) {
      return res.status(401).json({ error: 'Unauthorized', message: '未登录' });
    }

    // admin 始终有完全访问权限
    if (role === 'admin') return next();

    // 查询 platform_permissions 表
    try {
      const perm = db.prepare(
        "SELECT role FROM platform_permissions WHERE user_id = ? AND system = 'warehouse-manager'"
      ).get(userId);

      if (!perm) {
        return res.status(403).json({ error: 'Forbidden', message: '您没有访问仓库管理系统的权限' });
      }

      // viewer 只有读权限，admin 有读写权限
      if (permission === 'write' && perm.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden', message: '您没有写入权限，请联系管理员' });
      }

      next();
    } catch (err) {
      // 如果 platform_permissions 表不存在，跳过权限检查（兼容旧数据库）
      console.warn('[Auth Middleware] Permission check skipped:', err.message);
      next();
    }
  };
}

// 向后兼容的别名（旧代码可能使用这些）
const requireLogin = requirePermission('read');
const requireStaff = requirePermission('write');
const requireAdmin = (req, res, next) => {
  const role = req.session?.user?.role;
  if (!req.session?.user) {
    return res.status(401).json({ error: 'Unauthorized', message: '未登录' });
  }
  if (role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden', message: '需要管理员权限' });
  }
  next();
};

module.exports = { requirePermission, requireLogin, requireStaff, requireAdmin };
