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
    try {
      const db = getDb();
      const perm = db.prepare(`
        SELECT p.can_read, p.can_write
        FROM platform_permissions p
        JOIN platform_systems s ON s.id = p.system_id
        WHERE p.user_id = ? AND s.name = 'inventory-manager'
      `).get(userId);

      if (!perm) return res.status(403).json({ error: 'No access to Inventory Manager' });
      if (permission === 'read' && !perm.can_read) return res.status(403).json({ error: 'Read permission required' });
      if (permission === 'write' && !perm.can_write) return res.status(403).json({ error: 'Write permission required' });

      next();
    } catch (err) {
      // If platform_systems table doesn't exist yet, allow access
      console.warn('[Auth Middleware] Permission check skipped:', err.message);
      next();
    }
  };
}

module.exports = { requirePermission };
