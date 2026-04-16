const { getDb } = require('../db');

// Check permission against shared LIC_DB.db (unified database for all services)
function requirePermission(permission = 'read') {
  return (req, res, next) => {
    // Support both req.session.user (SSO login) and req.session.userId (legacy)
    const sessionUser = req.session?.user;
    const userId = sessionUser?.id || req.session?.userId;
    const role = sessionUser?.role || req.session?.role;

    if (!req.session || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Admin always has full access
    if (role === 'admin') return next();

    // Check platform permissions for inventory-manager system
    // DB schema: platform_permissions(user_id, system TEXT, role TEXT)
    // role: 'admin' = read+write, 'viewer' = read-only
    try {
      const db = getDb();
      const perm = db.prepare(
        "SELECT role FROM platform_permissions WHERE user_id = ? AND system = 'inventory-manager'"
      ).get(userId);

      if (!perm) return res.status(403).json({ error: 'No access to Inventory Manager' });
      // 'viewer' or 'admin' both have read access; only 'admin' has write access
      if (permission === 'write' && perm.role !== 'admin') {
        return res.status(403).json({ error: 'Write permission required' });
      }
      next();
    } catch (err) {
      // If platform_permissions table doesn't exist yet, allow access
      console.warn('[Auth Middleware] Permission check skipped:', err.message);
      next();
    }
  };
}

module.exports = { requirePermission };
