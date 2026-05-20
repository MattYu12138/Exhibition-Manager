/**
 * 图表分析 API
 * 提供预设图表数据 + 自定义 SQL 查询（仅 SELECT，需登录）
 * + AI 自然语言转 SQL（需要 OPENAI_API_KEY 环境变量）
 */

const express = require('express')
const router = express.Router()
const db = require('../db')
const { requireLogin } = require('../middleware/auth')

// ─── OpenAI 客户端（懒加载，仅当 OPENAI_API_KEY 存在时初始化）────
let openaiClient = null
function getOpenAI() {
  if (openaiClient) return openaiClient
  const key = process.env.OPENAI_API_KEY
  if (!key) return null
  try {
    const { OpenAI } = require('openai')
    openaiClient = new OpenAI({ apiKey: key })
    return openaiClient
  } catch {
    return null
  }
}

// 数据库 Schema 摘要（用于 AI prompt）
const DB_SCHEMA_SUMMARY = `
You are a SQLite SQL expert for an exhibition management system. Generate ONLY a single SELECT SQL query.

Database tables:

exhibitions (id, name, date TEXT 'YYYY-MM-DD', location, status TEXT 'preparing'|'active'|'completed', created_at)

exhibition_items (id, exhibition_id, shopify_variant_id, planned_quantity, rack_quantity, stock_quantity, checked INTEGER 0|1, hanger_done INTEGER 0|1, storage_done INTEGER 0|1)

inventory_snapshots (id, exhibition_id, shopify_variant_id, square_quantity_before, sold_quantity, remaining_quantity, synced_at)

products (id, shopify_product_id, title, product_type, status, vendor, created_at)

product_variants (id, product_id, shopify_variant_id, variant_title, sku, price)

Common JOINs:
- inventory_snapshots JOIN exhibitions ON exhibitions.id = inventory_snapshots.exhibition_id
- inventory_snapshots LEFT JOIN product_variants ON product_variants.shopify_variant_id = inventory_snapshots.shopify_variant_id
- product_variants LEFT JOIN products ON products.id = product_variants.product_id
- exhibition_items JOIN exhibitions ON exhibitions.id = exhibition_items.exhibition_id

Sell rate formula: ROUND(CAST(SUM(sold_quantity) AS FLOAT) / NULLIF(SUM(square_quantity_before), 0) * 100, 1)

Rules:
- Return ONLY the SQL query, no explanation, no markdown code blocks
- Only SELECT statements
- Use COALESCE for nullable fields
- Add ORDER BY for better readability
- Limit results to 100 rows unless user specifies otherwise
`.trim()

// 所有接口均需登录
router.use(requireLogin)

// ─── 1. 展会总览（跨展会对比）─────────────────────────────────
router.get('/overview', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        e.id,
        e.name,
        e.date,
        e.location,
        e.status,
        COUNT(DISTINCT ei.id) AS item_count,
        COALESCE(SUM(ei.planned_quantity), 0) AS total_planned,
        COALESCE(SUM(ei.rack_quantity), 0) AS total_rack,
        COALESCE(SUM(ei.stock_quantity), 0) AS total_stock,
        COALESCE(SUM(ei.checked), 0) AS total_checked,
        COALESCE(SUM(ei.hanger_done), 0) AS total_hanger,
        COALESCE(SUM(ei.storage_done), 0) AS total_storage,
        COALESCE(s.total_sold, 0) AS total_sold,
        COALESCE(s.total_brought, 0) AS total_brought,
        COALESCE(s.total_remaining, 0) AS total_remaining,
        COALESCE(s.variant_count, 0) AS snapshot_variants
      FROM exhibitions e
      LEFT JOIN exhibition_items ei ON ei.exhibition_id = e.id
      LEFT JOIN (
        SELECT
          exhibition_id,
          SUM(sold_quantity) AS total_sold,
          SUM(square_quantity_before) AS total_brought,
          SUM(remaining_quantity) AS total_remaining,
          COUNT(*) AS variant_count
        FROM inventory_snapshots
        GROUP BY exhibition_id
      ) s ON s.exhibition_id = e.id
      GROUP BY e.id
      ORDER BY e.date ASC
    `).all()
    res.json({ success: true, data: rows })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ─── 2. 按品类的销售分析（所有已完成展会）────────────────────
router.get('/by-category', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        e.id AS exhibition_id,
        e.name AS exhibition_name,
        e.date,
        COALESCE(NULLIF(p.product_type, ''), '未分类') AS product_type,
        SUM(s.sold_quantity) AS sold,
        SUM(s.square_quantity_before) AS brought,
        ROUND(
          CAST(SUM(s.sold_quantity) AS FLOAT) /
          NULLIF(SUM(s.square_quantity_before), 0) * 100, 1
        ) AS sell_rate
      FROM inventory_snapshots s
      JOIN exhibitions e ON e.id = s.exhibition_id
      LEFT JOIN product_variants pv ON pv.shopify_variant_id = s.shopify_variant_id
      LEFT JOIN products p ON p.id = pv.product_id
      WHERE e.status = 'completed'
      GROUP BY e.id, p.product_type
      ORDER BY e.date ASC, sold DESC
    `).all()
    res.json({ success: true, data: rows })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ─── 3. Checklist 进度（所有展会）────────────────────────────
router.get('/checklist-progress', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        e.id,
        e.name,
        e.date,
        e.status,
        COUNT(ei.id) AS total,
        COALESCE(SUM(ei.checked), 0) AS checked,
        COALESCE(SUM(ei.hanger_done), 0) AS hanger_done,
        COALESCE(SUM(ei.storage_done), 0) AS storage_done
      FROM exhibitions e
      LEFT JOIN exhibition_items ei ON ei.exhibition_id = e.id
      GROUP BY e.id
      ORDER BY e.date DESC
    `).all()
    res.json({ success: true, data: rows })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ─── 4. Top 商品排行（按展会）────────────────────────────────
router.get('/top-products', (req, res) => {
  try {
    const { exhibition_id, limit = 10 } = req.query
    const lim = Math.min(parseInt(limit) || 10, 50)

    let whereClause = "WHERE e.status = 'completed' AND s.sold_quantity > 0"
    const params = []
    if (exhibition_id) {
      whereClause += ' AND e.id = ?'
      params.push(exhibition_id)
    }

    const rows = db.prepare(`
      SELECT
        e.id AS exhibition_id,
        e.name AS exhibition_name,
        p.title AS product_title,
        COALESCE(pv.variant_title, '') AS variant_title,
        pv.sku,
        COALESCE(NULLIF(p.product_type, ''), '未分类') AS product_type,
        s.sold_quantity,
        s.square_quantity_before AS brought,
        s.remaining_quantity,
        ROUND(
          CAST(s.sold_quantity AS FLOAT) /
          NULLIF(s.square_quantity_before, 0) * 100, 1
        ) AS sell_rate
      FROM inventory_snapshots s
      JOIN exhibitions e ON e.id = s.exhibition_id
      LEFT JOIN product_variants pv ON pv.shopify_variant_id = s.shopify_variant_id
      LEFT JOIN products p ON p.id = pv.product_id
      ${whereClause}
      ORDER BY s.sold_quantity DESC
      LIMIT ?
    `).all(...params, lim)
    res.json({ success: true, data: rows })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ─── 5. Rack vs Stock 分配分析 ────────────────────────────────
router.get('/rack-stock', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        e.id,
        e.name,
        e.date,
        e.status,
        COALESCE(NULLIF(p.product_type, ''), '未分类') AS product_type,
        SUM(ei.rack_quantity) AS rack,
        SUM(ei.stock_quantity) AS stock,
        SUM(ei.planned_quantity) AS planned
      FROM exhibitions e
      JOIN exhibition_items ei ON ei.exhibition_id = e.id
      LEFT JOIN product_variants pv ON pv.shopify_variant_id = ei.shopify_variant_id
      LEFT JOIN products p ON p.id = pv.product_id
      GROUP BY e.id, p.product_type
      ORDER BY e.date ASC, planned DESC
    `).all()
    res.json({ success: true, data: rows })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ─── 6. 获取可用表和字段（用于自定义查询提示）────────────────
router.get('/schema', (req, res) => {
  try {
    const ALLOWED = [
      'exhibitions', 'exhibition_items', 'exhibition_items_view',
      'inventory_snapshots', 'products', 'product_variants',
    ]
    const tables = ALLOWED.map(name => {
      try {
        const cols = db.pragma(`table_info(${name})`)
        return { name, columns: cols.map(c => ({ name: c.name, type: c.type })) }
      } catch { return null }
    }).filter(Boolean)
    res.json({ success: true, data: tables })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ─── 7. 自定义 SQL 查询（仅 SELECT）──────────────────────────
router.post('/query', (req, res) => {
  try {
    const { sql } = req.body
    if (!sql || typeof sql !== 'string') {
      return res.status(400).json({ success: false, message: '请提供 SQL 语句' })
    }
    const trimmed = sql.trim().replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '').trim()
    if (!/^SELECT\b/i.test(trimmed)) {
      return res.status(403).json({ success: false, message: '仅允许 SELECT 查询' })
    }
    // 防止多语句注入
    if (/;[\s\S]+\S/.test(trimmed)) {
      return res.status(403).json({ success: false, message: '不允许多条语句' })
    }
    const rows = db.prepare(sql).all()
    const columns = rows.length > 0 ? Object.keys(rows[0]) : []
    res.json({ success: true, data: rows, columns, count: rows.length })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ─── 8. AI 状态检查（前端用于判断是否展示 AI 功能）─────────────
router.get('/ai-status', (req, res) => {
  const available = !!(process.env.OPENAI_API_KEY)
  res.json({ success: true, available })
})

// ─── 9. AI 自然语言转 SQL ────────────────────────────────
router.post('/ai-to-sql', async (req, res) => {
  try {
    const { prompt } = req.body
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ success: false, message: '请提供查询描述' })
    }

    const client = getOpenAI()
    if (!client) {
      return res.status(503).json({
        success: false,
        message: 'AI 功能未配置，请在服务器环境变量中设置 OPENAI_API_KEY'
      })
    }

    const completion = await client.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: DB_SCHEMA_SUMMARY },
        { role: 'user', content: prompt.trim() }
      ],
      temperature: 0.1,
      max_tokens: 800,
    })

    let sql = completion.choices[0]?.message?.content?.trim() || ''

    // 清理 markdown 代码块包裹（以防 AI 还是输出了 ```sql ... ```）
    sql = sql.replace(/^```(?:sql)?\s*/i, '').replace(/\s*```$/, '').trim()

    // 安全检查：确保是 SELECT
    if (!/^SELECT\b/i.test(sql)) {
      return res.status(400).json({
        success: false,
        message: 'AI 生成的语句不是 SELECT 查询，请重新描述'
      })
    }

    res.json({ success: true, sql })
  } catch (err) {
    console.error('[AI-to-SQL]', err.message)
    res.status(500).json({ success: false, message: 'AI 服务暂时不可用：' + err.message })
  }
})

module.exports = router
