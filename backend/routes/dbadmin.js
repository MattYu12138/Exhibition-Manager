/**
 * 数据库可视化管理 API（仅限 admin 角色）
 * 提供对所有数据表的增删查改操作
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

// 允许访问的表白名单（防止访问系统表）
const ALLOWED_TABLES = [
  'exhibitions',
  'exhibition_items',
  'inventory_snapshots',
  'users',
];

// 获取所有允许的表名及其结构
router.get('/tables', requireAdmin, (req, res) => {
  try {
    const tables = ALLOWED_TABLES.map(tableName => {
      const columns = db.pragma(`table_info(${tableName})`);
      const count = db.prepare(`SELECT COUNT(*) as cnt FROM ${tableName}`).get();
      return {
        name: tableName,
        columns: columns.map(c => ({
          name: c.name,
          type: c.type,
          notnull: c.notnull,
          dflt_value: c.dflt_value,
          pk: c.pk,
        })),
        row_count: count.cnt,
      };
    });
    res.json({ success: true, data: tables });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 查询表数据（支持分页、搜索）
router.get('/tables/:table/rows', requireAdmin, (req, res) => {
  try {
    const { table } = req.params;
    if (!ALLOWED_TABLES.includes(table)) {
      return res.status(403).json({ success: false, message: '不允许访问该表' });
    }

    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 50;
    const search = req.query.search || '';
    const offset = (page - 1) * pageSize;

    // 获取列信息
    const columns = db.pragma(`table_info(${table})`);
    const textCols = columns.filter(c => c.type.toUpperCase().includes('TEXT') || c.type === '').map(c => c.name);

    let whereClause = '';
    let params = [];

    if (search && textCols.length > 0) {
      const conditions = textCols.map(col => `${col} LIKE ?`).join(' OR ');
      whereClause = `WHERE ${conditions}`;
      params = textCols.map(() => `%${search}%`);
    }

    const total = db.prepare(`SELECT COUNT(*) as cnt FROM ${table} ${whereClause}`).get(...params);
    const rows = db.prepare(`SELECT * FROM ${table} ${whereClause} ORDER BY rowid DESC LIMIT ? OFFSET ?`).all(...params, pageSize, offset);

    res.json({
      success: true,
      data: rows,
      total: total.cnt,
      page,
      pageSize,
      columns: columns.map(c => ({ name: c.name, type: c.type, pk: c.pk })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 新增一行
router.post('/tables/:table/rows', requireAdmin, (req, res) => {
  try {
    const { table } = req.params;
    if (!ALLOWED_TABLES.includes(table)) {
      return res.status(403).json({ success: false, message: '不允许访问该表' });
    }

    const data = req.body;
    if (!data || Object.keys(data).length === 0) {
      return res.status(400).json({ success: false, message: '请提供数据' });
    }

    const columns = Object.keys(data);
    const placeholders = columns.map(() => '?').join(', ');
    const values = Object.values(data);

    db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`).run(...values);
    res.json({ success: true, message: '新增成功' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 更新一行（按主键）
router.put('/tables/:table/rows/:id', requireAdmin, (req, res) => {
  try {
    const { table, id } = req.params;
    if (!ALLOWED_TABLES.includes(table)) {
      return res.status(403).json({ success: false, message: '不允许访问该表' });
    }

    const data = req.body;
    if (!data || Object.keys(data).length === 0) {
      return res.status(400).json({ success: false, message: '请提供更新数据' });
    }

    // 找主键列名
    const pkInfo = db.pragma(`table_info(${table})`).find(c => c.pk === 1);
    const pkCol = pkInfo ? pkInfo.name : 'id';

    const setClauses = Object.keys(data).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(data), id];

    db.prepare(`UPDATE ${table} SET ${setClauses} WHERE ${pkCol} = ?`).run(...values);
    res.json({ success: true, message: '更新成功' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 删除一行（按主键）
router.delete('/tables/:table/rows/:id', requireAdmin, (req, res) => {
  try {
    const { table, id } = req.params;
    if (!ALLOWED_TABLES.includes(table)) {
      return res.status(403).json({ success: false, message: '不允许访问该表' });
    }

    const pkInfo = db.pragma(`table_info(${table})`).find(c => c.pk === 1);
    const pkCol = pkInfo ? pkInfo.name : 'id';

    db.prepare(`DELETE FROM ${table} WHERE ${pkCol} = ?`).run(id);
    res.json({ success: true, message: '删除成功' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 执行自定义 SQL（仅限 SELECT，防止破坏性操作）
router.post('/query', requireAdmin, (req, res) => {
  try {
    const { sql } = req.body;
    if (!sql) return res.status(400).json({ success: false, message: '请提供 SQL 语句' });

    const trimmed = sql.trim().toUpperCase();
    if (!trimmed.startsWith('SELECT')) {
      return res.status(403).json({ success: false, message: '仅允许 SELECT 查询' });
    }

    const rows = db.prepare(sql).all();
    res.json({ success: true, data: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
