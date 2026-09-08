const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../db');

const router = express.Router();
const DEFAULT_GOTS_URL = 'https://global-standards.org/suppliers/certified-suppliers';
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'admin@lummiincolour.com.au';
const ANALYTICS_SALT = process.env.TRACEABILITY_ANALYTICS_SALT || process.env.SESSION_SECRET || 'lummi-traceability-local';
const RATE_LIMIT_MAX = Number(process.env.PUBLIC_RATE_LIMIT_MAX || 60);
const RATE_LIMIT_WINDOW_MS = Number(process.env.PUBLIC_RATE_LIMIT_WINDOW_MS || 60_000);
const rateBuckets = new Map();

function normalizeBarcode(value) {
  return String(value || '').trim().replace(/\s+/g, '');
}

function getClientAddress(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket.remoteAddress || 'unknown';
}

function visitorHash(req) {
  return crypto
    .createHash('sha256')
    .update(`${ANALYTICS_SALT}:${getClientAddress(req)}`)
    .digest('hex')
    .slice(0, 32);
}

function publicRateLimit(req, res, next) {
  const now = Date.now();
  const key = visitorHash(req);
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }
  if (current.count >= RATE_LIMIT_MAX) {
    res.set('Retry-After', String(Math.ceil((current.resetAt - now) / 1000)));
    return res.status(429).json({
      success: false,
      code: 'RATE_LIMITED',
      message: 'Too many requests. Please try again shortly.',
    });
  }
  current.count += 1;
  next();
}

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateBuckets.entries()) {
    if (value.resetAt <= now) rateBuckets.delete(key);
  }
}, RATE_LIMIT_WINDOW_MS).unref();

function recordQuery({ req, barcode, recordId = null, status, language }) {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO traceability_query_log (
        barcode, traceability_record_id, result_status, language,
        visitor_hash, user_agent, referrer
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      barcode,
      recordId,
      status,
      language,
      visitorHash(req),
      String(req.headers['user-agent'] || '').slice(0, 500),
      String(req.headers.referer || req.headers.referrer || '').slice(0, 1000)
    );
  } catch (error) {
    console.error('[Traceability Analytics] Unable to record query:', error.message);
  }
}

function performLookup(req, res) {
  const barcode = normalizeBarcode(req.params.barcode || req.query.barcode);
  const language = req.query.lang === 'zh' ? 'zh' : 'en';

  if (!/^\d{8}$/.test(barcode)) {
    recordQuery({ req, barcode: barcode || '(empty)', status: 'invalid', language });
    return res.status(400).json({
      success: false,
      code: 'INVALID_BARCODE',
      message: language === 'zh' ? '请输入 8 位数字商品条码' : 'Please enter an 8-digit product barcode.',
      support_email: SUPPORT_EMAIL,
    });
  }

  const db = getDb();
  const rows = db.prepare(`
    SELECT
      pv.id AS product_variant_id,
      pv.gtin AS barcode,
      pv.sku,
      pv.variant_title,
      p.id AS product_id,
      p.title AS product_name,
      p.vendor,
      p.product_type,
      tr.id AS traceability_record_id,
      tr.batch_no,
      tr.trace_code,
      tr.fiber_composition_zh,
      tr.fiber_composition_en,
      tr.certification_standard,
      tr.certifying_body,
      tr.licence_no,
      tr.production_origin_zh,
      tr.production_origin_en,
      tr.gots_verification_url,
      tr.updated_at
    FROM product_variants pv
    INNER JOIN products p ON p.id = pv.product_id
    LEFT JOIN traceability_records tr
      ON tr.product_variant_id = pv.id
      AND tr.is_default = 1
      AND tr.is_published = 1
    WHERE trim(pv.gtin) = ?
    ORDER BY tr.updated_at DESC, pv.updated_at DESC
  `).all(barcode);

  if (rows.length === 0) {
    recordQuery({ req, barcode, status: 'not_found', language });
    return res.status(404).json({
      success: false,
      code: 'NOT_FOUND',
      message: language === 'zh' ? '未找到该条码对应的产品' : 'No product was found for this barcode.',
      support_email: SUPPORT_EMAIL,
    });
  }

  const publishedRows = rows.filter(row => row.traceability_record_id);
  if (publishedRows.length === 0) {
    if (rows.length > 1) {
      recordQuery({ req, barcode, status: 'ambiguous', language });
      return res.status(409).json({
        success: false,
        code: 'AMBIGUOUS_BARCODE',
        message: language === 'zh'
          ? '该条码对应多个产品，请联系客服核实'
          : 'This barcode matches multiple products. Please contact support.',
        support_email: SUPPORT_EMAIL,
      });
    }

    const matchedProduct = rows[0];
    recordQuery({ req, barcode, status: 'not_published', language });
    return res.status(404).json({
      success: false,
      code: 'NOT_PUBLISHED',
      message: language === 'zh'
        ? '已识别该产品，详细溯源资料正在准备中'
        : 'Product identified. Detailed traceability information is being prepared.',
      data: {
        barcode: matchedProduct.barcode,
        product_name: matchedProduct.product_name,
        style_number: matchedProduct.sku,
        variant: matchedProduct.variant_title,
      },
      support_email: SUPPORT_EMAIL,
    });
  }

  if (publishedRows.length > 1) {
    recordQuery({ req, barcode, status: 'ambiguous', language });
    return res.status(409).json({
      success: false,
      code: 'AMBIGUOUS_BARCODE',
      message: language === 'zh'
        ? '该条码对应多个产品，请联系客服核实'
        : 'This barcode matches multiple products. Please contact support.',
      support_email: SUPPORT_EMAIL,
    });
  }

  const row = publishedRows[0];
  recordQuery({
    req,
    barcode,
    recordId: row.traceability_record_id,
    status: 'found',
    language,
  });

  return res.json({
    success: true,
    data: {
      barcode: row.barcode,
      product_name: row.product_name,
      style_number: row.sku,
      variant: row.variant_title,
      batch_no: row.batch_no,
      fiber_composition: language === 'zh'
        ? row.fiber_composition_zh
        : row.fiber_composition_en,
      fiber_composition_zh: row.fiber_composition_zh,
      fiber_composition_en: row.fiber_composition_en,
      certification_standard: row.certification_standard,
      certifying_body: row.certifying_body,
      licence_no: row.licence_no,
      production_origin: language === 'zh'
        ? row.production_origin_zh
        : row.production_origin_en,
      production_origin_zh: row.production_origin_zh,
      production_origin_en: row.production_origin_en,
      gots_verification_url: row.gots_verification_url || DEFAULT_GOTS_URL,
      updated_at: row.updated_at,
    },
    support_email: SUPPORT_EMAIL,
  });
}

router.get('/traceability', publicRateLimit, performLookup);
router.get('/traceability/:barcode', publicRateLimit, performLookup);

module.exports = router;
