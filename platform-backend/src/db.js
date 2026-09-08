const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// 统一使用 LIC_DB.db 作为全系统共享数据库
// 本地开发默认路径：指向共享 data/database 目录
// 生产环境通过 DB_PATH 环境变量指定
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/database/LIC_DB.db');

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
      system TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      granted_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, system)
    );

    -- 产品溯源资料：Barcode 取自 product_variants.gtin；trace_code 为未来批次二维码预留
    CREATE TABLE IF NOT EXISTS traceability_records (
      id TEXT PRIMARY KEY,
      product_variant_id TEXT NOT NULL,
      batch_no TEXT NOT NULL,
      trace_code TEXT UNIQUE,
      is_default INTEGER NOT NULL DEFAULT 1,
      fiber_composition_zh TEXT NOT NULL,
      fiber_composition_en TEXT NOT NULL,
      certification_standard TEXT NOT NULL DEFAULT 'GOTS organic',
      certifying_body TEXT,
      licence_no TEXT,
      production_origin_zh TEXT,
      production_origin_en TEXT,
      gots_verification_url TEXT,
      is_published INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      updated_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(product_variant_id, batch_no),
      FOREIGN KEY (product_variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_traceability_default_variant
      ON traceability_records(product_variant_id) WHERE is_default = 1;
    CREATE INDEX IF NOT EXISTS idx_traceability_published
      ON traceability_records(is_published);

    -- 公开查询统计：不保存原始 IP，只保存加盐匿名哈希
    CREATE TABLE IF NOT EXISTS traceability_query_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barcode TEXT NOT NULL,
      traceability_record_id TEXT,
      result_status TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'en',
      visitor_hash TEXT,
      user_agent TEXT,
      referrer TEXT,
      queried_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (traceability_record_id) REFERENCES traceability_records(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_trace_query_barcode
      ON traceability_query_log(barcode);
    CREATE INDEX IF NOT EXISTS idx_trace_query_time
      ON traceability_query_log(queried_at);

    CREATE TABLE IF NOT EXISTS traceability_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      traceability_record_id TEXT,
      action TEXT NOT NULL,
      actor_user_id TEXT,
      changes_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

  // 系统入口使用幂等 upsert，新增系统不会因已有入口而被跳过
  const upsertSystem = db.prepare(`
    INSERT INTO platform_systems (id, name, display_name, description, url, icon, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      display_name = excluded.display_name,
      description = excluded.description,
      url = excluded.url,
      icon = excluded.icon,
      sort_order = excluded.sort_order
  `);
  const seedSystems = db.transaction(() => {
    upsertSystem.run('SYS001', 'exhibition-manager', 'Exhibition Manager', '展会管理系统，管理展会商品、库存快照和 Square 集成', 'https://exhibition.lummiincolour.com.au', '🎪', 1);
    upsertSystem.run('SYS002', 'inventory-manager', 'Inventory Manager', '库存管理系统，检测重复 Barcode/SKU，同步 Shopify 商品数据', 'https://inventory.lummiincolour.com.au', '📦', 2);
    upsertSystem.run('SYS004', 'traceability-manager', 'Product Traceability', '产品溯源资料、公开查询与查询统计管理', '/admin/traceability', '🔎', 4);
  });
  seedSystems();
}

module.exports = { getDb };
