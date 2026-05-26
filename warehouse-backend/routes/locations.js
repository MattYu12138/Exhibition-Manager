/**
 * 货位路由
 * 货位查询、扫码录入货物、库存查看、二维码生成
 */
const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const { db, nextInventoryId, nextMovementId } = require('../db');
const { requireLogin, requireStaff, requireAdmin } = require('../middleware/auth');

// ── GET /api/locations  列出所有货位（支持按布局/区域筛选） ─────────────────
router.get('/', requireLogin, (req, res) => {
  try {
    const { layout_id, zone, search, stock_status } = req.query;
    let sql = `
      SELECT wl.*,
        COALESCE(SUM(wi.quantity), 0) AS total_qty,
        COUNT(DISTINCT CASE WHEN wi.quantity > 0 THEN wi.shopify_variant_id END) AS sku_count,
        MAX(CASE WHEN wi.stock_type IN ('exhibition') AND wi.quantity > 0 THEN 1 ELSE 0 END) AS has_exhibition,
        MAX(CASE WHEN wi.stock_type IN ('retail','retail_display','retail_storage') AND wi.quantity > 0 THEN 1 ELSE 0 END) AS has_retail
      FROM warehouse_locations wl
      LEFT JOIN warehouse_inventory wi ON wi.location_id = wl.id AND wi.quantity > 0
      WHERE wl.is_active = 1
    `;
    const params = [];
    if (layout_id) { sql += ' AND wl.layout_id = ?'; params.push(layout_id); }
    if (zone)      { sql += ' AND wl.zone = ?';      params.push(zone); }
    if (search)    { sql += ' AND (wl.code LIKE ? OR wl.label LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    sql += ' GROUP BY wl.id';
    if (stock_status === 'stocked') sql += ' HAVING total_qty > 0';
    if (stock_status === 'empty')   sql += ' HAVING total_qty = 0';
    sql += ' ORDER BY wl.zone, wl.row_no, wl.col_no';
    if (stock_status === 'low_stock') sql += ' HAVING total_qty > 0 AND total_qty < wl.low_stock_threshold';

    const locations = db.prepare(sql).all(...params);

    // 为每个货位附加 top_items（最多2个有库存的 SKU）
    const topItemsStmt = db.prepare(`
      SELECT wi.shopify_variant_id AS variant_id, wi.stock_type,
        p.title AS product_title, pv.variant_title, wi.quantity
      FROM warehouse_inventory wi
      LEFT JOIN product_variants pv ON pv.shopify_variant_id = wi.shopify_variant_id
      LEFT JOIN products p ON p.id = pv.product_id
      WHERE wi.location_id = ? AND wi.quantity > 0
      ORDER BY wi.quantity DESC
      LIMIT 2
    `);

    for (const loc of locations) {
      loc.top_items = topItemsStmt.all(loc.id);
      // 预警状态
      const threshold = loc.low_stock_threshold || 10;
      if (loc.total_qty === 0) loc.stock_alert = 'empty';
      else if (loc.total_qty < threshold) loc.stock_alert = 'low';
      else loc.stock_alert = 'ok';
    }

    res.json({ success: true, data: locations });
  } catch (err) {
    console.error('[locations] list:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/locations/scan/:token  扫码查询货位（公开，无需登录） ───────────
// 兼职人员扫码后打开此接口获取货位信息
router.get('/scan/:token', (req, res) => {
  try {
    const location = db.prepare(`
      SELECT wl.*, wlay.name AS layout_name
      FROM warehouse_locations wl
      JOIN warehouse_layouts wlay ON wlay.id = wl.layout_id
      WHERE wl.qr_token = ? AND wl.is_active = 1
    `).get(req.params.token);

    if (!location) return res.status(404).json({ success: false, message: '货位不存在或已停用' });

    // 获取该货位当前库存
    const inventory = db.prepare(`
      SELECT wi.*,
        pv.variant_title, pv.sku, pv.gtin, pv.price, pv.image_url,
        p.title AS product_title, p.product_type, p.main_image
      FROM warehouse_inventory wi
      LEFT JOIN product_variants pv ON pv.shopify_variant_id = wi.shopify_variant_id
      LEFT JOIN products p ON p.id = pv.product_id
      WHERE wi.location_id = ? AND wi.quantity > 0
      ORDER BY wi.stock_type, wi.received_at ASC
    `).all(location.id);

    res.json({ success: true, data: { location, inventory } });
  } catch (err) {
    console.error('[locations] scan:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/locations/alerts  获取所有预警货位 ──────────────────────────────
router.get('/alerts', requireLogin, (req, res) => {
  try {
    const alerts = db.prepare(`
      SELECT wl.id, wl.code, wl.zone, wl.low_stock_threshold,
        COALESCE(SUM(wi.quantity), 0) AS total_qty,
        MAX(CASE WHEN wi.stock_type = 'retail_display' AND wi.quantity > 0 THEN 1 ELSE 0 END) AS has_display,
        MAX(CASE WHEN wi.stock_type = 'retail_storage' AND wi.quantity > 0 THEN 1 ELSE 0 END) AS has_storage
      FROM warehouse_locations wl
      LEFT JOIN warehouse_inventory wi ON wi.location_id = wl.id AND wi.quantity > 0
      WHERE wl.is_active = 1
      GROUP BY wl.id
      HAVING total_qty < wl.low_stock_threshold OR total_qty = 0
      ORDER BY total_qty ASC
    `).all();

    // 对每个预警货位，检查是否有同 SKU 的备库存可调拨
    const storageCheckStmt = db.prepare(`
      SELECT wi_s.location_id AS storage_location_id, wl.code AS storage_code,
        wi_s.shopify_variant_id, wi_s.quantity AS storage_qty,
        p.title AS product_title, pv.variant_title
      FROM warehouse_inventory wi_d
      JOIN warehouse_inventory wi_s ON wi_s.shopify_variant_id = wi_d.shopify_variant_id
        AND wi_s.stock_type = 'retail_storage' AND wi_s.quantity > 0
      JOIN warehouse_locations wl ON wl.id = wi_s.location_id
      JOIN product_variants pv ON pv.shopify_variant_id = wi_s.shopify_variant_id
      JOIN products p ON p.id = pv.product_id
      WHERE wi_d.location_id = ? AND wi_d.stock_type = 'retail_display'
      LIMIT 5
    `);

    for (const loc of alerts) {
      const threshold = loc.low_stock_threshold || 10;
      loc.stock_alert = loc.total_qty === 0 ? 'empty' : 'low';
      loc.transfer_available = storageCheckStmt.all(loc.id);
    }

    res.json({ success: true, data: alerts });
  } catch (err) {
    console.error('[locations] alerts:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/locations/:id  获取单个货位详情（含库存） ──────────────────────
router.get('/:id', requireLogin, (req, res) => {
  try {
    const location = db.prepare(`
      SELECT wl.*, wlay.name AS layout_name
      FROM warehouse_locations wl
      JOIN warehouse_layouts wlay ON wlay.id = wl.layout_id
      WHERE wl.id = ? AND wl.is_active = 1
    `).get(req.params.id);

    if (!location) return res.status(404).json({ success: false, message: '货位不存在' });

    const inventory = db.prepare(`
      SELECT wi.*,
        pv.variant_title, pv.sku, pv.gtin, pv.price, pv.image_url,
        p.title AS product_title, p.product_type, p.main_image
      FROM warehouse_inventory wi
      LEFT JOIN product_variants pv ON pv.shopify_variant_id = wi.shopify_variant_id
      LEFT JOIN products p ON p.id = pv.product_id
      WHERE wi.location_id = ?
      ORDER BY wi.stock_type, wi.quantity DESC, wi.received_at ASC
    `).all(location.id);

    const logs = db.prepare(`
      SELECT wm.*, p.title AS product_title
      FROM warehouse_movements wm
      LEFT JOIN product_variants pv ON pv.shopify_variant_id = wm.shopify_variant_id
      LEFT JOIN products p ON p.id = pv.product_id
      WHERE wm.location_id = ?
      ORDER BY wm.created_at DESC
      LIMIT 20
    `).all(location.id);

    res.json({ success: true, data: { ...location, inventory, logs } });
  } catch (err) {
    console.error('[locations] get:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PATCH /api/locations/:id/threshold  更新预警阈值 ────────────────────────
router.patch('/:id/threshold', requireStaff, (req, res) => {
  try {
    const { low_stock_threshold } = req.body;
    if (low_stock_threshold === undefined || low_stock_threshold < 0) {
      return res.status(400).json({ success: false, message: '阈值必须为非负整数' });
    }
    const location = db.prepare('SELECT * FROM warehouse_locations WHERE id = ? AND is_active = 1').get(req.params.id);
    if (!location) return res.status(404).json({ success: false, message: '货位不存在' });
    db.prepare('UPDATE warehouse_locations SET low_stock_threshold = ? WHERE id = ?').run(low_stock_threshold, req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[locations] threshold:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/locations/:id/transfer  内部调拨（备库→上架） ─────────────────
router.post('/:id/transfer', requireStaff, (req, res) => {
  try {
    const { shopify_variant_id, quantity, from_location_id, note } = req.body;
    if (!shopify_variant_id) return res.status(400).json({ success: false, message: '缺少 shopify_variant_id' });
    if (!quantity || quantity <= 0) return res.status(400).json({ success: false, message: '数量必须大于 0' });
    if (!from_location_id) return res.status(400).json({ success: false, message: '缺少来源货位 from_location_id' });

    const toLocation = db.prepare('SELECT * FROM warehouse_locations WHERE id = ? AND is_active = 1').get(req.params.id);
    if (!toLocation) return res.status(404).json({ success: false, message: '目标货位不存在' });

    const transferTx = db.transaction(() => {
      // 检查来源备库存
      const srcInv = db.prepare(`
        SELECT * FROM warehouse_inventory
        WHERE location_id = ? AND shopify_variant_id = ? AND stock_type = 'retail_storage' AND quantity >= ?
      `).get(from_location_id, shopify_variant_id, quantity);
      if (!srcInv) throw new Error('备库存不足，无法调拨');

      // 减少来源备库存
      db.prepare('UPDATE warehouse_inventory SET quantity = quantity - ?, updated_at = datetime(\'now\') WHERE id = ?').run(quantity, srcInv.id);
      const movSrc = nextMovementId();
      db.prepare(`
        INSERT INTO warehouse_movements (id, inventory_id, location_id, shopify_variant_id, stock_type,
          movement_type, quantity_delta, quantity_before, quantity_after, reference_type, reference_id, note, operated_by)
        VALUES (?, ?, ?, ?, 'retail_storage', 'transfer', ?, ?, ?, 'transfer', ?, ?, ?)
      `).run(movSrc, srcInv.id, from_location_id, shopify_variant_id,
        -quantity, srcInv.quantity, srcInv.quantity - quantity,
        req.params.id, note || null, req.session.user.id);

      // 增加目标上架库存
      let dstInv = db.prepare(`
        SELECT * FROM warehouse_inventory
        WHERE location_id = ? AND shopify_variant_id = ? AND stock_type = 'retail_display' AND exhibition_id IS NULL
      `).get(req.params.id, shopify_variant_id);

      let dstInvId;
      if (dstInv) {
        db.prepare('UPDATE warehouse_inventory SET quantity = quantity + ?, updated_at = datetime(\'now\') WHERE id = ?').run(quantity, dstInv.id);
        dstInvId = dstInv.id;
      } else {
        dstInvId = nextInventoryId();
        db.prepare(`
          INSERT INTO warehouse_inventory (id, location_id, shopify_variant_id, stock_type, quantity, received_at, created_by)
          VALUES (?, ?, ?, 'retail_display', ?, datetime('now'), ?)
        `).run(dstInvId, req.params.id, shopify_variant_id, quantity, req.session.user.id);
        dstInv = { quantity: 0 };
      }

      const movDst = nextMovementId();
      db.prepare(`
        INSERT INTO warehouse_movements (id, inventory_id, location_id, shopify_variant_id, stock_type,
          movement_type, quantity_delta, quantity_before, quantity_after, reference_type, reference_id, note, operated_by)
        VALUES (?, ?, ?, ?, 'retail_display', 'transfer', ?, ?, ?, 'transfer', ?, ?, ?)
      `).run(movDst, dstInvId, req.params.id, shopify_variant_id,
        quantity, dstInv.quantity, dstInv.quantity + quantity,
        from_location_id, note || null, req.session.user.id);
    });

    transferTx();
    res.json({ success: true, message: `已成功调拨 ${quantity} 件到上架货位` });
  } catch (err) {
    console.error('[locations] transfer:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/locations/:id/qrcode  生成货位二维码图片（base64 PNG） ──────────
router.get('/:id/qrcode', requireLogin, async (req, res) => {
  try {
    const location = db.prepare('SELECT * FROM warehouse_locations WHERE id = ? AND is_active = 1').get(req.params.id);
    if (!location) return res.status(404).json({ success: false, message: '货位不存在' });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5174';
    const qrUrl = `${frontendUrl}/scan/${location.qr_token}`;

    const qrDataUrl = await QRCode.toDataURL(qrUrl, {
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    });

    res.json({
      success: true,
      data: {
        location_code: location.code,
        location_label: location.label,
        qr_url: qrUrl,
        qr_image: qrDataUrl,
        qr_data_url: qrDataUrl,
      },
    });
  } catch (err) {
    console.error('[locations] qrcode:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/locations/:id/inventory  录入货物到货位 ────────────────────────
router.post('/:id/inventory', requireStaff, (req, res) => {
  try {
    const {
      shopify_variant_id,
      quantity,
      stock_type,        // 'retail' | 'exhibition'
      exhibition_id,     // 仅 exhibition 类型时需要
      inbound_shipment_id,
      inbound_box_id,
      note,
    } = req.body;

    if (!shopify_variant_id) return res.status(400).json({ success: false, message: '缺少 shopify_variant_id' });
    if (!quantity || quantity <= 0) return res.status(400).json({ success: false, message: '数量必须大于 0' });
    if (!['retail', 'retail_display', 'retail_storage', 'exhibition'].includes(stock_type)) return res.status(400).json({ success: false, message: 'stock_type 必须为 retail/retail_display/retail_storage/exhibition' });
    if (stock_type === 'exhibition' && !exhibition_id) return res.status(400).json({ success: false, message: '展会备货必须指定 exhibition_id' });

    const location = db.prepare('SELECT * FROM warehouse_locations WHERE id = ? AND is_active = 1').get(req.params.id);
    if (!location) return res.status(404).json({ success: false, message: '货位不存在' });

    // 验证 SKU 存在
    const variant = db.prepare('SELECT * FROM product_variants WHERE shopify_variant_id = ?').get(shopify_variant_id);
    if (!variant) return res.status(404).json({ success: false, message: 'SKU 不存在，请先同步 Shopify 产品' });

    const addTx = db.transaction(() => {
      // 查找同货位、同 SKU、同类型的现有库存记录
      let inventoryRecord = db.prepare(`
        SELECT * FROM warehouse_inventory
        WHERE location_id = ? AND shopify_variant_id = ? AND stock_type = ?
        ${stock_type === 'exhibition' ? 'AND exhibition_id = ?' : 'AND exhibition_id IS NULL'}
        LIMIT 1
      `).get(...[location.id, shopify_variant_id, stock_type, ...(stock_type === 'exhibition' ? [exhibition_id] : [])]);

      let inventoryId;
      let qtyBefore;

      if (inventoryRecord) {
        // 追加到现有记录
        qtyBefore = inventoryRecord.quantity;
        db.prepare(`
          UPDATE warehouse_inventory
          SET quantity = quantity + ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(quantity, inventoryRecord.id);
        inventoryId = inventoryRecord.id;
      } else {
        // 新建库存记录
        qtyBefore = 0;
        inventoryId = nextInventoryId();
        db.prepare(`
          INSERT INTO warehouse_inventory
            (id, location_id, shopify_variant_id, stock_type, exhibition_id,
             quantity, inbound_shipment_id, inbound_box_id, received_at, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
        `).run(
          inventoryId, location.id, shopify_variant_id, stock_type,
          exhibition_id || null, quantity,
          inbound_shipment_id || null, inbound_box_id || null,
          req.session.user.id
        );
      }

      // 记录变动日志
      const movId = nextMovementId();
      db.prepare(`
        INSERT INTO warehouse_movements
          (id, inventory_id, location_id, shopify_variant_id, stock_type,
           movement_type, quantity_delta, quantity_before, quantity_after,
           reference_type, reference_id, note, operated_by)
        VALUES (?, ?, ?, ?, ?, 'inbound', ?, ?, ?, 'manual', ?, ?, ?)
      `).run(
        movId, inventoryId, location.id, shopify_variant_id, stock_type,
        quantity, qtyBefore, qtyBefore + quantity,
        inbound_shipment_id || null, note || null, req.session.user.id
      );

      return inventoryId;
    });

    const inventoryId = addTx();
    const updated = db.prepare(`
      SELECT wi.*, pv.variant_title, pv.sku, p.title AS product_title
      FROM warehouse_inventory wi
      LEFT JOIN product_variants pv ON pv.shopify_variant_id = wi.shopify_variant_id
      LEFT JOIN products p ON p.id = pv.product_id
      WHERE wi.id = ?
    `).get(inventoryId);

    res.status(201).json({ success: true, data: updated });
  } catch (err) {
    console.error('[locations] add inventory:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PATCH /api/locations/:id/inventory/:invId  调整库存数量 ──────────────────
router.patch('/:id/inventory/:invId', requireStaff, (req, res) => {
  try {
    const { quantity, note } = req.body;
    if (quantity === undefined || quantity < 0) return res.status(400).json({ success: false, message: '数量不能为负数' });

    const inv = db.prepare('SELECT * FROM warehouse_inventory WHERE id = ? AND location_id = ?').get(req.params.invId, req.params.id);
    if (!inv) return res.status(404).json({ success: false, message: '库存记录不存在' });

    const qtyBefore = inv.quantity;
    const delta = quantity - qtyBefore;

    db.transaction(() => {
      db.prepare('UPDATE warehouse_inventory SET quantity = ?, updated_at = datetime(\'now\') WHERE id = ?').run(quantity, inv.id);
      if (delta !== 0) {
        const movId = nextMovementId();
        db.prepare(`
          INSERT INTO warehouse_movements
            (id, inventory_id, location_id, shopify_variant_id, stock_type,
             movement_type, quantity_delta, quantity_before, quantity_after, note, operated_by)
          VALUES (?, ?, ?, ?, ?, 'adjustment', ?, ?, ?, ?, ?)
        `).run(movId, inv.id, inv.location_id, inv.shopify_variant_id, inv.stock_type, delta, qtyBefore, quantity, note || null, req.session.user.id);
      }
    })();

    res.json({ success: true });
  } catch (err) {
    console.error('[locations] adjust inventory:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /api/locations/:id/inventory/:invId  删除库存记录 ─────────────────
router.delete('/:id/inventory/:invId', requireAdmin, (req, res) => {
  try {
    const inv = db.prepare('SELECT * FROM warehouse_inventory WHERE id = ? AND location_id = ?').get(req.params.invId, req.params.id);
    if (!inv) return res.status(404).json({ success: false, message: '库存记录不存在' });

    db.prepare('DELETE FROM warehouse_inventory WHERE id = ?').run(inv.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[locations] delete inventory:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
