const express = require('express');
const { getDb } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { snowflakeId } = require('../utils/snowflake');

const router = express.Router();
const DEFAULT_GOTS_URL = 'https://global-standards.org/suppliers/certified-suppliers';

router.use(requireAdmin);

function cleanText(value, maxLength = 500) {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, maxLength);
}

function booleanValue(value) {
  return value === true || value === 1 || value === '1';
}

function normalizeRecordInput(body) {
  const data = {
    product_variant_id: cleanText(body.product_variant_id, 80),
    batch_no: cleanText(body.batch_no, 120),
    trace_code: cleanText(body.trace_code, 160) || null,
    is_default: body.is_default === undefined ? true : booleanValue(body.is_default),
    fiber_composition_zh: cleanText(body.fiber_composition_zh, 500),
    fiber_composition_en: cleanText(body.fiber_composition_en, 500),
    certification_standard: cleanText(body.certification_standard, 160) || 'GOTS organic',
    certifying_body: cleanText(body.certifying_body, 240) || null,
    licence_no: cleanText(body.licence_no, 160) || null,
    production_origin_zh: cleanText(body.production_origin_zh, 240) || null,
    production_origin_en: cleanText(body.production_origin_en, 240) || null,
    gots_verification_url: cleanText(body.gots_verification_url, 1000) || DEFAULT_GOTS_URL,
    is_published: booleanValue(body.is_published),
  };

  if (!data.product_variant_id || !data.batch_no || !data.fiber_composition_zh || !data.fiber_composition_en) {
    const error = new Error('请填写商品规格、产品批次和中英文纤维成分');
    error.statusCode = 400;
    throw error;
  }

  try {
    const parsed = new URL(data.gots_verification_url);
    if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('invalid protocol');
  } catch {
    const error = new Error('GOTS 核验链接必须是有效的 HTTP/HTTPS 地址');
    error.statusCode = 400;
    throw error;
  }

  return data;
}

function getActorId(req) {
  return req.session?.user?.id || null;
}

function audit(db, recordId, action, actorId, changes) {
  db.prepare(`
    INSERT INTO traceability_audit_log (
      traceability_record_id, action, actor_user_id, changes_json
    ) VALUES (?, ?, ?, ?)
  `).run(recordId, action, actorId, JSON.stringify(changes || {}));
}

router.get('/variants', (req, res) => {
  const db = getDb();
  const search = cleanText(req.query.search, 120);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
  const pattern = `%${search}%`;

  const rows = db.prepare(`
    SELECT
      pv.id AS product_variant_id,
      pv.shopify_variant_id,
      pv.variant_title,
      pv.sku,
      pv.gtin AS barcode,
      pv.image_url,
      p.title AS product_name,
      p.main_image,
      p.status AS product_status,
      tr.id AS traceability_record_id,
      tr.batch_no,
      tr.is_published
    FROM product_variants pv
    INNER JOIN products p ON p.id = pv.product_id
    LEFT JOIN traceability_records tr
      ON tr.product_variant_id = pv.id AND tr.is_default = 1
    WHERE pv.gtin IS NOT NULL
      AND trim(pv.gtin) <> ''
      AND (
        ? = '' OR
        pv.gtin LIKE ? OR
        pv.sku LIKE ? OR
        pv.variant_title LIKE ? OR
        p.title LIKE ?
      )
    ORDER BY p.title COLLATE NOCASE, pv.variant_title COLLATE NOCASE
    LIMIT ?
  `).all(search, pattern, pattern, pattern, pattern, limit);

  res.json({ success: true, data: rows });
});

router.get('/records', (req, res) => {
  const db = getDb();
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 25, 1), 100);
  const offset = (page - 1) * pageSize;
  const search = cleanText(req.query.search, 120);
  const status = ['published', 'draft'].includes(req.query.status) ? req.query.status : '';
  const pattern = `%${search}%`;

  const conditions = [`(
    ? = '' OR
    pv.gtin LIKE ? OR
    pv.sku LIKE ? OR
    pv.variant_title LIKE ? OR
    p.title LIKE ? OR
    tr.batch_no LIKE ? OR
    tr.licence_no LIKE ?
  )`];
  const params = [search, pattern, pattern, pattern, pattern, pattern, pattern];
  if (status) {
    conditions.push('tr.is_published = ?');
    params.push(status === 'published' ? 1 : 0);
  }
  const where = conditions.join(' AND ');

  const selectSql = `
    SELECT
      tr.*,
      pv.gtin AS barcode,
      pv.sku,
      pv.variant_title,
      pv.image_url,
      p.title AS product_name,
      p.main_image,
      p.status AS product_status
    FROM traceability_records tr
    INNER JOIN product_variants pv ON pv.id = tr.product_variant_id
    INNER JOIN products p ON p.id = pv.product_id
    WHERE ${where}
  `;

  const rows = db.prepare(`${selectSql} ORDER BY tr.updated_at DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset);
  const total = db.prepare(`SELECT COUNT(*) AS count FROM (${selectSql})`).get(...params).count;

  res.json({ success: true, data: rows, total, page, pageSize });
});

router.get('/records/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare(`
    SELECT
      tr.*,
      pv.gtin AS barcode,
      pv.sku,
      pv.variant_title,
      p.title AS product_name
    FROM traceability_records tr
    INNER JOIN product_variants pv ON pv.id = tr.product_variant_id
    INNER JOIN products p ON p.id = pv.product_id
    WHERE tr.id = ?
  `).get(req.params.id);

  if (!row) return res.status(404).json({ success: false, message: '溯源记录不存在' });
  res.json({ success: true, data: row });
});

router.post('/records', (req, res) => {
  const db = getDb();
  try {
    const data = normalizeRecordInput(req.body);
    const variant = db.prepare(`
      SELECT pv.id, pv.gtin, p.title
      FROM product_variants pv
      INNER JOIN products p ON p.id = pv.product_id
      WHERE pv.id = ?
    `).get(data.product_variant_id);

    if (!variant) return res.status(404).json({ success: false, message: '商品规格不存在' });
    if (!variant.gtin || !String(variant.gtin).trim()) {
      return res.status(400).json({ success: false, message: '该商品规格没有 Barcode，无法用于公开查询' });
    }

    const id = `TR${snowflakeId()}`;
    const actorId = getActorId(req);
    const create = db.transaction(() => {
      if (data.is_default) {
        db.prepare('UPDATE traceability_records SET is_default = 0 WHERE product_variant_id = ?')
          .run(data.product_variant_id);
      }
      db.prepare(`
        INSERT INTO traceability_records (
          id, product_variant_id, batch_no, trace_code, is_default,
          fiber_composition_zh, fiber_composition_en, certification_standard,
          certifying_body, licence_no, production_origin_zh, production_origin_en,
          gots_verification_url, is_published, created_by, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, data.product_variant_id, data.batch_no, data.trace_code, data.is_default ? 1 : 0,
        data.fiber_composition_zh, data.fiber_composition_en, data.certification_standard,
        data.certifying_body, data.licence_no, data.production_origin_zh, data.production_origin_en,
        data.gots_verification_url, data.is_published ? 1 : 0, actorId, actorId
      );
      audit(db, id, 'create', actorId, data);
    });
    create();

    res.status(201).json({ success: true, data: { id }, message: '溯源记录已创建' });
  } catch (error) {
    const status = error.statusCode || (String(error.message).includes('UNIQUE constraint failed') ? 409 : 500);
    res.status(status).json({ success: false, message: error.message });
  }
});

router.put('/records/:id', (req, res) => {
  const db = getDb();
  try {
    const existing = db.prepare('SELECT * FROM traceability_records WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: '溯源记录不存在' });

    const data = normalizeRecordInput(req.body);
    const variant = db.prepare('SELECT id, gtin FROM product_variants WHERE id = ?').get(data.product_variant_id);
    if (!variant) return res.status(404).json({ success: false, message: '商品规格不存在' });
    if (!variant.gtin || !String(variant.gtin).trim()) {
      return res.status(400).json({ success: false, message: '该商品规格没有 Barcode，无法用于公开查询' });
    }

    const actorId = getActorId(req);
    const update = db.transaction(() => {
      if (data.is_default) {
        db.prepare('UPDATE traceability_records SET is_default = 0 WHERE product_variant_id = ? AND id <> ?')
          .run(data.product_variant_id, req.params.id);
      }
      db.prepare(`
        UPDATE traceability_records SET
          product_variant_id = ?, batch_no = ?, trace_code = ?, is_default = ?,
          fiber_composition_zh = ?, fiber_composition_en = ?, certification_standard = ?,
          certifying_body = ?, licence_no = ?, production_origin_zh = ?, production_origin_en = ?,
          gots_verification_url = ?, is_published = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        data.product_variant_id, data.batch_no, data.trace_code, data.is_default ? 1 : 0,
        data.fiber_composition_zh, data.fiber_composition_en, data.certification_standard,
        data.certifying_body, data.licence_no, data.production_origin_zh, data.production_origin_en,
        data.gots_verification_url, data.is_published ? 1 : 0, actorId, req.params.id
      );
      audit(db, req.params.id, 'update', actorId, { before: existing, after: data });
    });
    update();

    res.json({ success: true, message: '溯源记录已更新' });
  } catch (error) {
    const status = error.statusCode || (String(error.message).includes('UNIQUE constraint failed') ? 409 : 500);
    res.status(status).json({ success: false, message: error.message });
  }
});

router.delete('/records/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM traceability_records WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ success: false, message: '溯源记录不存在' });

  const actorId = getActorId(req);
  const remove = db.transaction(() => {
    audit(db, req.params.id, 'delete', actorId, existing);
    db.prepare('DELETE FROM traceability_records WHERE id = ?').run(req.params.id);
  });
  remove();
  res.json({ success: true, message: '溯源记录已删除' });
});

router.get('/stats', (req, res) => {
  const db = getDb();
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);
  const summary = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM traceability_records) AS total_records,
      (SELECT COUNT(*) FROM traceability_records WHERE is_published = 1) AS published_records,
      (SELECT COUNT(*) FROM traceability_records WHERE is_published = 0) AS draft_records,
      COUNT(*) AS total_queries,
      COUNT(DISTINCT CASE WHEN result_status = 'found' THEN barcode END) AS unique_found_barcodes,
      SUM(CASE WHEN result_status = 'found' THEN 1 ELSE 0 END) AS found_queries,
      SUM(CASE WHEN result_status <> 'found' THEN 1 ELSE 0 END) AS unresolved_queries
    FROM traceability_query_log
    WHERE queried_at >= datetime('now', ?)
  `).get(`-${days} days`);

  const daily = db.prepare(`
    SELECT date(queried_at) AS date, COUNT(*) AS queries,
      SUM(CASE WHEN result_status = 'found' THEN 1 ELSE 0 END) AS found
    FROM traceability_query_log
    WHERE queried_at >= datetime('now', ?)
    GROUP BY date(queried_at)
    ORDER BY date ASC
  `).all(`-${days} days`);

  const topBarcodes = db.prepare(`
    WITH barcode_counts AS (
      SELECT barcode, COUNT(*) AS queries
      FROM traceability_query_log
      WHERE queried_at >= datetime('now', ?)
      GROUP BY barcode
    )
    SELECT
      counts.barcode,
      counts.queries,
      (
        SELECT p.title
        FROM product_variants pv
        INNER JOIN products p ON p.id = pv.product_id
        WHERE pv.gtin = counts.barcode
        ORDER BY pv.updated_at DESC
        LIMIT 1
      ) AS product_name,
      (
        SELECT pv.sku
        FROM product_variants pv
        WHERE pv.gtin = counts.barcode
        ORDER BY pv.updated_at DESC
        LIMIT 1
      ) AS sku
    FROM barcode_counts counts
    ORDER BY counts.queries DESC, counts.barcode
    LIMIT 10
  `).all(`-${days} days`);

  const recentQueries = db.prepare(`
    SELECT
      q.id,
      q.barcode,
      q.result_status,
      q.language,
      q.queried_at,
      (
        SELECT p.title
        FROM product_variants pv
        INNER JOIN products p ON p.id = pv.product_id
        WHERE pv.gtin = q.barcode
        ORDER BY pv.updated_at DESC
        LIMIT 1
      ) AS product_name,
      (
        SELECT pv.sku
        FROM product_variants pv
        WHERE pv.gtin = q.barcode
        ORDER BY pv.updated_at DESC
        LIMIT 1
      ) AS sku
    FROM traceability_query_log q
    ORDER BY q.queried_at DESC
    LIMIT 50
  `).all();

  res.json({ success: true, data: { summary, daily, top_barcodes: topBarcodes, recent_queries: recentQueries } });
});

module.exports = router;
