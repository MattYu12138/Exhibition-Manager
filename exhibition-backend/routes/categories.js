/**
 * 商品分类管理 API
 * 用于展中补货页和备货页的分类筛选功能
 */

const express = require('express');
const router = express.Router();
const db = require('../db');

// 获取所有分类（按 sort_order 排序）
router.get('/', (req, res) => {
  try {
    const categories = db.prepare(
      'SELECT * FROM product_categories ORDER BY sort_order ASC, id ASC'
    ).all();
    res.json({ success: true, data: categories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 新增分类
router.post('/', (req, res) => {
  try {
    const { name, keyword, sort_order } = req.body;
    if (!name || !keyword) {
      return res.status(400).json({ success: false, message: '请提供分类名称和关键词' });
    }
    const order = sort_order !== undefined ? parseInt(sort_order) : 0;
    db.prepare(
      'INSERT INTO product_categories (name, keyword, sort_order) VALUES (?, ?, ?)'
    ).run(name.trim(), keyword.trim(), order);
    res.json({ success: true, message: '分类已添加' });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ success: false, message: '分类名称已存在' });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

// 更新分类
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, keyword, sort_order } = req.body;
    if (!name || !keyword) {
      return res.status(400).json({ success: false, message: '请提供分类名称和关键词' });
    }
    const order = sort_order !== undefined ? parseInt(sort_order) : 0;
    const result = db.prepare(
      'UPDATE product_categories SET name = ?, keyword = ?, sort_order = ? WHERE id = ?'
    ).run(name.trim(), keyword.trim(), order, id);
    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: '分类不存在' });
    }
    res.json({ success: true, message: '分类已更新' });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ success: false, message: '分类名称已存在' });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

// 删除分类
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const result = db.prepare('DELETE FROM product_categories WHERE id = ?').run(id);
    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: '分类不存在' });
    }
    res.json({ success: true, message: '分类已删除' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
