const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// 共享数据库 - 与 exhibition-backend、inventory-backend 使用同一个 LIC_DB.db
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/database/LIC_DB.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─────────────────────────────────────────────────────────────────────────────
// ID 生成工具（与现有系统保持一致的前缀+零填充格式）
// WH  + 8位  → 仓库布局   e.g. WH00000001
// LOC + 10位 → 货位       e.g. LOC0000000001
// WI  + 10位 → 仓库库存记录 e.g. WI0000000001
// WPK + 8位  → 拣货任务   e.g. WPK00000001
// WPL + 10位 → 拣货任务行 e.g. WPL0000000001
// WMV + 10位 → 库存变动日志 e.g. WMV0000000001
// ─────────────────────────────────────────────────────────────────────────────

function nextId(table, prefix, padLength, column = 'id') {
  const prefixLen = prefix.length;
  const row = db.prepare(
    `SELECT MAX(CAST(SUBSTR(${column}, ?) AS INTEGER)) AS mx FROM ${table} WHERE ${column} LIKE ?`
  ).get(prefixLen + 1, prefix + '%');
  const next = (row?.mx || 0) + 1;
  return prefix + String(next).padStart(padLength, '0');
}

function nextWarehouseId()    { return nextId('warehouse_layouts',  'WH',  8); }
function nextLocationId()     { return nextId('warehouse_locations','LOC', 10); }
function nextInventoryId()    { return nextId('warehouse_inventory','WI',  10); }
function nextPickTaskId()     { return nextId('warehouse_pick_tasks','WPK', 8); }
function nextPickLineId()     { return nextId('warehouse_pick_lines','WPL', 10); }
function nextMovementId()     { return nextId('warehouse_movements', 'WMV', 10); }

// ─────────────────────────────────────────────────────────────────────────────
// 建表（仅新增，不修改任何现有表）
// ─────────────────────────────────────────────────────────────────────────────
db.exec(`
  -- ── 仓库布局（一个仓库可以有多个布局版本，active 的那个生效） ──────────────
  -- id: WH + 8位零填充  e.g. WH00000001
  CREATE TABLE IF NOT EXISTS warehouse_layouts (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,                -- 布局名称，如"主仓库"
    description TEXT,
    grid_cols   INTEGER NOT NULL DEFAULT 20,  -- 画布列数
    grid_rows   INTEGER NOT NULL DEFAULT 15,  -- 画布行数
    layout_json TEXT NOT NULL DEFAULT '[]',   -- 模块列表 JSON（见下方说明）
    is_active   INTEGER NOT NULL DEFAULT 1,   -- 1=当前生效布局
    created_by  TEXT,                         -- 关联 users.id
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  );

  -- ── 货位（每个货架格子） ─────────────────────────────────────────────────
  -- id: LOC + 10位零填充  e.g. LOC0000000001
  -- 货位编码规则：{区域}-{排}-{列}  e.g. A-01-03
  CREATE TABLE IF NOT EXISTS warehouse_locations (
    id          TEXT PRIMARY KEY,
    layout_id   TEXT NOT NULL,                -- 关联 warehouse_layouts.id
    code        TEXT NOT NULL,                -- 货位编码 e.g. "A-01-03"
    label       TEXT,                         -- 显示名称（可自定义）
    zone        TEXT,                         -- 区域 e.g. "A"
    row_no      INTEGER NOT NULL DEFAULT 1,   -- 排号
    col_no      INTEGER NOT NULL DEFAULT 1,   -- 列号
    module_id   TEXT,                         -- 对应 layout_json 中的模块 id
    grid_x      INTEGER,                      -- 在画布上的 X 坐标（列）
    grid_y      INTEGER,                      -- 在画布上的 Y 坐标（行）
    qr_token    TEXT UNIQUE NOT NULL,         -- 二维码唯一 token（随机 hex）
    is_active   INTEGER NOT NULL DEFAULT 1,
    note        TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(layout_id, code),
    FOREIGN KEY (layout_id) REFERENCES warehouse_layouts(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_wloc_layout   ON warehouse_locations(layout_id);
  CREATE INDEX IF NOT EXISTS idx_wloc_qr_token ON warehouse_locations(qr_token);
  CREATE INDEX IF NOT EXISTS idx_wloc_code     ON warehouse_locations(code);

  -- ── 仓库库存（货位 × SKU × 货物类型） ───────────────────────────────────
  -- id: WI + 10位零填充  e.g. WI0000000001
  -- 同一 SKU 可以在多个货位，同一货位可以有多个 SKU
  -- stock_type: 'retail'（零售散件）| 'exhibition'（展会备货）
  -- 关联 product_variants.shopify_variant_id（与 exhibition/inventory 保持一致）
  CREATE TABLE IF NOT EXISTS warehouse_inventory (
    id                  TEXT PRIMARY KEY,
    location_id         TEXT NOT NULL,        -- 关联 warehouse_locations.id
    shopify_variant_id  TEXT NOT NULL,        -- 关联 product_variants.shopify_variant_id
    stock_type          TEXT NOT NULL DEFAULT 'retail',
      -- retail | exhibition
    exhibition_id       TEXT,                 -- 仅 stock_type='exhibition' 时填写，关联 exhibitions.id
    quantity            INTEGER NOT NULL DEFAULT 0 CHECK(quantity >= 0),
    -- 入库来源（可追溯到 inbound）
    inbound_shipment_id TEXT,                 -- 关联 inbound_shipments.id（可选）
    inbound_box_id      TEXT,                 -- 关联 inbound_boxes.id（可选）
    -- FIFO 支持：先入先出，按 received_at 排序
    received_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
    -- 操作记录
    created_by          TEXT,                 -- 关联 users.id
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (location_id)   REFERENCES warehouse_locations(id) ON DELETE CASCADE,
    FOREIGN KEY (exhibition_id) REFERENCES exhibitions(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by)    REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_wi_location  ON warehouse_inventory(location_id);
  CREATE INDEX IF NOT EXISTS idx_wi_variant   ON warehouse_inventory(shopify_variant_id);
  CREATE INDEX IF NOT EXISTS idx_wi_type      ON warehouse_inventory(stock_type);
  CREATE INDEX IF NOT EXISTS idx_wi_exhibition ON warehouse_inventory(exhibition_id);

  -- ── 库存变动日志（每次入库/出库/调整都记录） ────────────────────────────
  -- id: WMV + 10位零填充  e.g. WMV0000000001
  CREATE TABLE IF NOT EXISTS warehouse_movements (
    id                  TEXT PRIMARY KEY,
    inventory_id        TEXT NOT NULL,        -- 关联 warehouse_inventory.id
    location_id         TEXT NOT NULL,        -- 冗余存储，方便查询
    shopify_variant_id  TEXT NOT NULL,        -- 冗余存储
    stock_type          TEXT NOT NULL,
    movement_type       TEXT NOT NULL,
      -- inbound（入库）| outbound（出库/拣货）| adjustment（人工调整）| transfer（货位转移）
    quantity_delta      INTEGER NOT NULL,     -- 正数=增加，负数=减少
    quantity_before     INTEGER NOT NULL,
    quantity_after      INTEGER NOT NULL,
    reference_type      TEXT,                 -- 关联来源类型：pick_task | inbound | manual
    reference_id        TEXT,                 -- 关联来源 ID
    note                TEXT,
    operated_by         TEXT,                 -- 关联 users.id
    operated_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (inventory_id) REFERENCES warehouse_inventory(id) ON DELETE CASCADE,
    FOREIGN KEY (operated_by)  REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_wmv_inventory ON warehouse_movements(inventory_id);
  CREATE INDEX IF NOT EXISTS idx_wmv_location  ON warehouse_movements(location_id);
  CREATE INDEX IF NOT EXISTS idx_wmv_variant   ON warehouse_movements(shopify_variant_id);
  CREATE INDEX IF NOT EXISTS idx_wmv_type      ON warehouse_movements(movement_type);

  -- ── 拣货任务（一次订单或展会备货对应一个任务） ──────────────────────────
  -- id: WPK + 8位零填充  e.g. WPK00000001
  CREATE TABLE IF NOT EXISTS warehouse_pick_tasks (
    id              TEXT PRIMARY KEY,
    task_type       TEXT NOT NULL DEFAULT 'order',
      -- order（Shopify 订单）| exhibition（展会备货）
    -- Shopify 订单相关
    shopify_order_id   TEXT,                  -- Shopify 订单 ID
    shopify_order_name TEXT,                  -- 订单号 e.g. "#1234"
    customer_name      TEXT,
    -- 展会备货相关
    exhibition_id      TEXT,                  -- 关联 exhibitions.id
    status          TEXT NOT NULL DEFAULT 'pending',
      -- pending | in_progress | completed | cancelled
    note            TEXT,
    assigned_to     TEXT,                     -- 关联 users.id（分配给谁拣货）
    created_by      TEXT,                     -- 关联 users.id
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at    DATETIME,
    FOREIGN KEY (exhibition_id) REFERENCES exhibitions(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_to)   REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by)    REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_wpk_type       ON warehouse_pick_tasks(task_type);
  CREATE INDEX IF NOT EXISTS idx_wpk_status     ON warehouse_pick_tasks(status);
  CREATE INDEX IF NOT EXISTS idx_wpk_exhibition ON warehouse_pick_tasks(exhibition_id);

  -- ── 拣货任务行（每个任务包含多个 SKU 行） ───────────────────────────────
  -- id: WPL + 10位零填充  e.g. WPL0000000001
  CREATE TABLE IF NOT EXISTS warehouse_pick_lines (
    id                  TEXT PRIMARY KEY,
    task_id             TEXT NOT NULL,        -- 关联 warehouse_pick_tasks.id
    shopify_variant_id  TEXT NOT NULL,        -- 需要拣的 SKU
    product_title       TEXT,                 -- 冗余存储，方便显示
    variant_title       TEXT,                 -- 冗余存储
    required_qty        INTEGER NOT NULL DEFAULT 1,  -- 需要拣的数量
    picked_qty          INTEGER NOT NULL DEFAULT 0,  -- 已拣数量
    -- 分配的货位（可能来自多个货位）
    location_id         TEXT,                 -- 主要货位（系统推荐）
    location_code       TEXT,                 -- 冗余存储货位编码
    status              TEXT NOT NULL DEFAULT 'pending',
      -- pending | partial | picked | skipped
    note                TEXT,
    picked_by           TEXT,                 -- 关联 users.id
    picked_at           DATETIME,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id)      REFERENCES warehouse_pick_tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (location_id)  REFERENCES warehouse_locations(id) ON DELETE SET NULL,
    FOREIGN KEY (picked_by)    REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_wpl_task     ON warehouse_pick_lines(task_id);
  CREATE INDEX IF NOT EXISTS idx_wpl_variant  ON warehouse_pick_lines(shopify_variant_id);
  CREATE INDEX IF NOT EXISTS idx_wpl_location ON warehouse_pick_lines(location_id);
`);

// ─────────────────────────────────────────────────────────────────────────────
// 增量迁移（安全添加字段，已存在则忽略）
// ─────────────────────────────────────────────────────────────────────────────
const migrations = [
  // 预留迁移槽，未来按需添加
];
for (const sql of migrations) {
  try { db.exec(sql); } catch (e) { /* 字段已存在，忽略 */ }
}

module.exports = { db, nextWarehouseId, nextLocationId, nextInventoryId, nextPickTaskId, nextPickLineId, nextMovementId };
