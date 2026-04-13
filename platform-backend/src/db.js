const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// 统一使用 Exhibition 数据库，共享 users 表
// 本地开发默认路径：platform-backend/data/exhibition.db
// 生产环境通过 DB_PATH 环境变量指定
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/exhibition.db');

let db;

function getDb() {
  if (!db) {
    // 自动创建数据库目录
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    -- 共享用户表（与 exhibition-backend 保持完全一致）
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'staff',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS platform_systems (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      description TEXT,
      url TEXT NOT NULL,
      icon TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS platform_permissions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      system_id TEXT NOT NULL,
      can_read INTEGER NOT NULL DEFAULT 0,
      can_write INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, system_id)
    );
  `);

  // Seed default admin user if not exists
  const adminUser = db.prepare("SELECT COUNT(*) as cnt FROM users WHERE username = 'admin'").get();
  if (adminUser.cnt === 0) {
    const hash = bcrypt.hashSync('123456', 10);
    db.prepare(`
      INSERT INTO users (id, username, password_hash, role)
      VALUES ('USR000000000001', 'admin', ?, 'admin')
    `).run(hash);
    console.log('✅ Default admin user created (username: admin, password: 123456)');
  }

  // Seed default systems if not exists
  const systems = db.prepare('SELECT COUNT(*) as cnt FROM platform_systems').get();
  if (systems.cnt === 0) {
    db.prepare(`
      INSERT INTO platform_systems (id, name, display_name, description, url, icon, sort_order)
      VALUES
        ('SYS001', 'exhibition-manager', 'Exhibition Manager', '展会管理系统，管理展会商品、库存快照和 Square 集成', 'http://localhost:5173', '🎪', 1),
        ('SYS002', 'inventory-manager', 'Inventory Manager', '库存管理系统，检测重复 Barcode/SKU，同步 Shopify 商品数据', 'http://localhost:5175', '📦', 2)
    `).run();
    console.log('✅ Default systems seeded');
  }
}

module.exports = { getDb };
