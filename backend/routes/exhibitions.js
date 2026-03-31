const express = require('express');
const router = express.Router();
const db = require('../db');

// 获取所有展会
router.get('/', (req, res) => {
  try {
    const exhibitions = db.prepare('SELECT * FROM exhibitions ORDER BY created_at DESC').all();
    res.json({ success: true, data: exhibitions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 获取单个展会详情
router.get('/:id', (req, res) => {
  try {
    const exhibition = db.prepare('SELECT * FROM exhibitions WHERE id = ?').get(req.params.id);
    if (!exhibition) return res.status(404).json({ success: false, message: '展会不存在' });

    const items = db.prepare('SELECT * FROM exhibition_items WHERE exhibition_id = ?').all(req.params.id);
    res.json({ success: true, data: { ...exhibition, items } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 创建展会
router.post('/', (req, res) => {
  try {
    const { name, date, location } = req.body;
    if (!name) return res.status(400).json({ success: false, message: '展会名称不能为空' });

    const result = db.prepare(
      'INSERT INTO exhibitions (name, date, location, status) VALUES (?, ?, ?, ?)'
    ).run(name, date || null, location || null, 'preparing');

    const exhibition = db.prepare('SELECT * FROM exhibitions WHERE id = ?').get(result.lastInsertRowid);
    res.json({ success: true, data: exhibition });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 更新展会信息
router.put('/:id', (req, res) => {
  try {
    const { name, date, location, status } = req.body;
    db.prepare(
      'UPDATE exhibitions SET name = COALESCE(?, name), date = COALESCE(?, date), location = COALESCE(?, location), status = COALESCE(?, status), updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(name || null, date || null, location || null, status || null, req.params.id);

    const exhibition = db.prepare('SELECT * FROM exhibitions WHERE id = ?').get(req.params.id);
    res.json({ success: true, data: exhibition });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 删除展会
router.delete('/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM exhibitions WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: '展会已删除' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ⚠️ 复制模版路由必须放在 /:id/items 路由之前，否则 Express 会将 "copy-to" 误匹配为 itemId
// POST /api/exhibitions/:id/copy-to/:targetId
router.post('/:id/copy-to/:targetId', (req, res) => {
  try {
    const sourceId = req.params.id;
    const targetId = req.params.targetId;

    // 检查源展会和目标展会是否存在
    const source = db.prepare('SELECT * FROM exhibitions WHERE id = ?').get(sourceId);
    if (!source) return res.status(404).json({ success: false, message: '源展会不存在' });

    const target = db.prepare('SELECT * FROM exhibitions WHERE id = ?').get(targetId);
    if (!target) return res.status(404).json({ success: false, message: '目标展会不存在' });

    // 获取源展会的所有商品
    const sourceItems = db.prepare('SELECT * FROM exhibition_items WHERE exhibition_id = ?').all(sourceId);
    if (!sourceItems.length) {
      return res.status(400).json({ success: false, message: '源展会没有商品清单' });
    }

    // 批量插入到目标展会（已存在的变体用 INSERT OR IGNORE 跳过）
    const insertItem = db.prepare(`
      INSERT OR IGNORE INTO exhibition_items
      (exhibition_id, shopify_product_id, shopify_variant_id, product_title, variant_title, sku, gtin, image_url, planned_quantity, checked)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);

    const copyMany = db.transaction((items) => {
      for (const item of items) {
        insertItem.run(
          targetId,
          item.shopify_product_id,
          item.shopify_variant_id,
          item.product_title,
          item.variant_title || '',
          item.sku || '',
          item.gtin || '',
          item.image_url || '',
          item.planned_quantity || 0
        );
      }
    });

    copyMany(sourceItems);

    const savedItems = db.prepare('SELECT * FROM exhibition_items WHERE exhibition_id = ?').all(targetId);
    res.json({
      success: true,
      message: `已从「${source.name}」复制 ${sourceItems.length} 件商品到「${target.name}」`,
      data: savedItems,
      copied_count: sourceItems.length,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 添加/更新展会商品（差量模式）
// 每个 item 必须包含 action 字段：
//   action='add'    新增变体（不存在时插入，已存在时忽略）
//   action='update' 更新数量（将 planned_quantity 覆盖为新绝对值）
//   action='remove' 删除变体
router.post('/:id/items', (req, res) => {
  try {
    const { items } = req.body;
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ success: false, message: '请提供商品列表' });
    }

    const findExisting = db.prepare(
      'SELECT * FROM exhibition_items WHERE exhibition_id = ? AND shopify_variant_id = ?'
    );
    const insertItem = db.prepare(`
      INSERT INTO exhibition_items 
      (exhibition_id, shopify_product_id, shopify_variant_id, product_title, variant_title, sku, gtin, image_url, rack_quantity, stock_quantity, planned_quantity, checked)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);
    const updateQty = db.prepare(
      'UPDATE exhibition_items SET rack_quantity = ?, stock_quantity = ?, planned_quantity = ?, product_title = ?, variant_title = ?, sku = ?, gtin = ?, image_url = ? WHERE id = ?'
    );
    // 数量变动时，重置清点状态和同步快照
    const resetChecked = db.prepare(
      'UPDATE exhibition_items SET checked = 0, last_synced_quantity = NULL WHERE id = ?'
    );
    const deleteItem = db.prepare(
      'DELETE FROM exhibition_items WHERE id = ?'
    );

    const applyDelta = db.transaction((itemList) => {
      for (const item of itemList) {
        const existing = findExisting.get(req.params.id, item.shopify_variant_id);
        const action = item.action || 'add'; // 向后兼容：旧客户端未传 action 时默认为 add

        if (action === 'remove') {
          // 删除变体
          if (existing) deleteItem.run(existing.id);
        } else if (action === 'update') {
          // 更新数量（覆盖绝对値）
          if (existing) {
            const newRack = item.rack_quantity !== undefined ? item.rack_quantity : (existing.rack_quantity || 5);
            const newStock = item.stock_quantity !== undefined ? item.stock_quantity : (existing.stock_quantity || 5);
            const newQty = newRack + newStock;
            updateQty.run(
              newRack,
              newStock,
              newQty,
              item.product_title,
              item.variant_title || '',
              item.sku || '',
              item.gtin || '',
              item.image_url || '',
              existing.id
            );
            // 若数量发生变动，重置清点状态和同步快照
            if (existing.planned_quantity !== newQty) {
              resetChecked.run(existing.id);
            }
          }
        } else {
          // action='add'：只在不存在时新增，已存在则忽略（防止重复提交）
          if (!existing) {
            const addRack = item.rack_quantity !== undefined ? item.rack_quantity : 5;
            const addStock = item.stock_quantity !== undefined ? item.stock_quantity : 5;
            const addTotal = addRack + addStock;
            insertItem.run(
              req.params.id,
              item.shopify_product_id,
              item.shopify_variant_id,
              item.product_title,
              item.variant_title || '',
              item.sku || '',
              item.gtin || '',
              item.image_url || '',
              addRack,
              addStock,
              addTotal
            );
          }
        }
      }
    });

    applyDelta(items);
    const savedItems = db.prepare('SELECT * FROM exhibition_items WHERE exhibition_id = ?').all(req.params.id);
    res.json({ success: true, data: savedItems });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 批量更新清点状态（整个商品所有变体打勾）
// ⚠️ 此路由必须在 /:id/items/:itemId 之前，否则 "product" 会被误匹配为 itemId
router.put('/:id/items/product/:productId/check', (req, res) => {
  try {
    const { checked } = req.body;
    db.prepare(
      'UPDATE exhibition_items SET checked = ? WHERE exhibition_id = ? AND shopify_product_id = ?'
    ).run(checked ? 1 : 0, req.params.id, req.params.productId);

    const items = db.prepare('SELECT * FROM exhibition_items WHERE exhibition_id = ?').all(req.params.id);
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 更新单个商品的清点状态或数量
router.put('/:id/items/:itemId', (req, res) => {
  try {
    const { checked, planned_quantity, rack_quantity, stock_quantity } = req.body;
    // 如果传入 rack_quantity 或 stock_quantity，自动重算 planned_quantity
    let computedTotal = null;
    if (rack_quantity !== undefined || stock_quantity !== undefined) {
      const existing = db.prepare('SELECT * FROM exhibition_items WHERE id = ?').get(req.params.itemId);
      const newRack = rack_quantity !== undefined ? rack_quantity : (existing?.rack_quantity || 5);
      const newStock = stock_quantity !== undefined ? stock_quantity : (existing?.stock_quantity || 5);
      computedTotal = newRack + newStock;
    }
    db.prepare(
      `UPDATE exhibition_items SET 
        checked = COALESCE(?, checked),
        rack_quantity = COALESCE(?, rack_quantity),
        stock_quantity = COALESCE(?, stock_quantity),
        planned_quantity = COALESCE(?, planned_quantity)
      WHERE id = ? AND exhibition_id = ?`
    ).run(
      checked !== undefined ? (checked ? 1 : 0) : null,
      rack_quantity !== undefined ? rack_quantity : null,
      stock_quantity !== undefined ? stock_quantity : null,
      computedTotal !== null ? computedTotal : (planned_quantity !== undefined ? planned_quantity : null),
      req.params.itemId,
      req.params.id
    );

    const item = db.prepare('SELECT * FROM exhibition_items WHERE id = ?').get(req.params.itemId);
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 清空展会中所有商品
router.delete('/:id/items', (req, res) => {
  try {
    db.prepare('DELETE FROM exhibition_items WHERE exhibition_id = ?').run(req.params.id);
    res.json({ success: true, message: '已清空展会商品清单' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 删除展会中的商品
router.delete('/:id/items/:itemId', (req, res) => {
  try {
    db.prepare('DELETE FROM exhibition_items WHERE id = ? AND exhibition_id = ?').run(
      req.params.itemId,
      req.params.id
    );
    res.json({ success: true, message: '商品已从清单中移除' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
