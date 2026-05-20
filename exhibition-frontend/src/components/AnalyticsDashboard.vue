<template>
  <!-- 折叠触发按钮 -->
  <div class="analytics-toggle" @click="toggle">
    <div class="toggle-inner">
      <div class="toggle-left">
        <div class="toggle-icon-wrap">
          <el-icon size="16"><DataAnalysis /></el-icon>
        </div>
        <span class="toggle-label">数据分析</span>
        <el-tag v-if="hasData" size="small" type="success" round style="margin-left:8px;font-size:11px">
          {{ completedCount }} 场已完成
        </el-tag>
      </div>
      <el-icon class="toggle-arrow" :class="{ open: isOpen }" size="14"><ArrowDown /></el-icon>
    </div>
  </div>

  <!-- 面板主体（动画展开） -->
  <Transition name="dashboard-slide">
    <div v-if="isOpen" class="analytics-panel">
      <!-- 加载中 -->
      <div v-if="loading" class="panel-loading">
        <el-icon class="spin" size="24"><Loading /></el-icon>
        <span>加载数据中…</span>
      </div>

      <template v-else>
        <!-- Tab 切换 -->
        <div class="panel-tabs">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            class="ptab"
            :class="{ active: activeTab === tab.key }"
            @click="activeTab = tab.key"
          >
            <el-icon size="13"><component :is="tab.icon" /></el-icon>
            {{ tab.label }}
          </button>
          <div class="tab-spacer" />
          <button class="ptab custom-tab" :class="{ active: activeTab === 'custom' }" @click="activeTab = 'custom'">
            <el-icon size="13"><MagicStick /></el-icon>
            自定义查询
          </button>
        </div>

        <!-- ── Tab: 展会总览 ── -->
        <div v-if="activeTab === 'overview'" class="tab-content">
          <div class="chart-grid two-col">
            <!-- 销售量对比柱状图 -->
            <div class="chart-card">
              <div class="chart-title">各展会销售量对比</div>
              <v-chart class="chart" :option="soldBarOption" autoresize />
            </div>
            <!-- 销售率趋势 -->
            <div class="chart-card">
              <div class="chart-title">整体销售率趋势</div>
              <v-chart class="chart" :option="sellRateOption" autoresize />
            </div>
          </div>
          <!-- 带去 vs 卖出 vs 剩余 堆叠图 -->
          <div class="chart-card full-width">
            <div class="chart-title">带去数量 / 卖出 / 剩余 对比</div>
            <v-chart class="chart chart-tall" :option="stackedBarOption" autoresize />
          </div>
        </div>

        <!-- ── Tab: 品类分析 ── -->
        <div v-if="activeTab === 'category'" class="tab-content">
          <div class="filter-row">
            <span class="filter-label">选择展会：</span>
            <div class="filter-btns">
              <button
                v-for="ex in completedExhibitions"
                :key="ex"
                class="filter-btn"
                :class="{ active: selectedExhibition === ex }"
                @click="selectedExhibition = ex"
              >{{ ex }}</button>
            </div>
          </div>
          <div class="chart-grid two-col">
            <div class="chart-card">
              <div class="chart-title">品类销售量排行</div>
              <v-chart class="chart chart-tall" :option="categoryBarOption" autoresize />
            </div>
            <div class="chart-card">
              <div class="chart-title">品类销售率排行</div>
              <v-chart class="chart chart-tall" :option="categoryRateOption" autoresize />
            </div>
          </div>
        </div>

        <!-- ── Tab: Checklist 进度 ── -->
        <div v-if="activeTab === 'checklist'" class="tab-content">
          <div class="checklist-grid">
            <div
              v-for="ex in checklistData"
              :key="ex.id"
              class="checklist-card"
              :class="ex.status"
            >
              <div class="cl-header">
                <span class="cl-name">{{ ex.name }}</span>
                <el-tag :type="statusTagType(ex.status)" size="small" round>{{ statusLabel(ex.status) }}</el-tag>
              </div>
              <div class="cl-date">{{ ex.date }}</div>
              <div class="cl-rings">
                <div v-for="ring in ringsFor(ex)" :key="ring.label" class="ring-wrap">
                  <svg class="ring-svg" viewBox="0 0 44 44">
                    <circle class="ring-bg" cx="22" cy="22" r="18" />
                    <circle
                      class="ring-fg"
                      cx="22" cy="22" r="18"
                      :stroke="ring.color"
                      :stroke-dasharray="`${ring.pct * 1.131} 113.1`"
                    />
                  </svg>
                  <div class="ring-pct">{{ ring.pct }}%</div>
                  <div class="ring-label">{{ ring.label }}</div>
                </div>
              </div>
              <div class="cl-total">共 {{ ex.total }} 件商品</div>
            </div>
          </div>
        </div>

        <!-- ── Tab: Top 商品 ── -->
        <div v-if="activeTab === 'top'" class="tab-content">
          <div class="filter-row">
            <span class="filter-label">展会：</span>
            <div class="filter-btns">
              <button
                v-for="ex in completedExhibitions"
                :key="ex"
                class="filter-btn"
                :class="{ active: topExhibition === ex }"
                @click="topExhibition = ex; loadTopProducts()"
              >{{ ex }}</button>
            </div>
          </div>
          <div class="chart-grid two-col">
            <div class="chart-card">
              <div class="chart-title">Top 10 销售量商品</div>
              <v-chart class="chart chart-tall" :option="topSoldOption" autoresize />
            </div>
            <div class="chart-card">
              <div class="chart-title">Top 10 销售率商品</div>
              <v-chart class="chart chart-tall" :option="topRateOption" autoresize />
            </div>
          </div>
        </div>

        <!-- ── Tab: 自定义查询 ── -->
        <div v-if="activeTab === 'custom'" class="tab-content custom-query-panel">
          <!-- 左侧：Schema 提示 -->
          <div class="schema-sidebar">
            <div class="schema-title">
              <el-icon size="13"><DataBoard /></el-icon> 可用表
            </div>
            <div v-for="tbl in schemaData" :key="tbl.name" class="schema-table">
              <div class="schema-tbl-name" @click="toggleSchema(tbl.name)">
                <el-icon size="11"><ArrowRight :class="{ 'rotate-90': openSchemas.has(tbl.name) }" /></el-icon>
                {{ tbl.name }}
              </div>
              <div v-if="openSchemas.has(tbl.name)" class="schema-cols">
                <div
                  v-for="col in tbl.columns"
                  :key="col.name"
                  class="schema-col"
                  @click="insertCol(tbl.name, col.name)"
                >
                  <span class="col-name">{{ col.name }}</span>
                  <span class="col-type">{{ col.type }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 右侧：查询编辑器 + 结果 -->
          <div class="query-main">
            <!-- 快捷模版 -->
            <div class="query-templates">
              <span class="tmpl-label">快捷模板：</span>
              <button
                v-for="tmpl in queryTemplates"
                :key="tmpl.label"
                class="tmpl-btn"
                @click="customSql = tmpl.sql"
              >{{ tmpl.label }}</button>
            </div>

            <!-- SQL 编辑器 -->
            <div class="sql-editor-wrap">
              <textarea
                ref="sqlInput"
                v-model="customSql"
                class="sql-editor"
                placeholder="输入 SELECT 语句，例如：&#10;SELECT e.name, COUNT(ei.id) as items FROM exhibitions e LEFT JOIN exhibition_items ei ON e.id = ei.exhibition_id GROUP BY e.id"
                spellcheck="false"
                @keydown.ctrl.enter.prevent="runQuery"
                @keydown.meta.enter.prevent="runQuery"
              />
              <div class="sql-hint">Ctrl+Enter 运行</div>
            </div>

            <!-- 图表类型 + 运行 -->
            <div class="query-actions">
              <div class="chart-type-row">
                <span class="filter-label">图表类型：</span>
                <div class="filter-btns">
                  <button
                    v-for="ct in chartTypes"
                    :key="ct.value"
                    class="filter-btn"
                    :class="{ active: customChartType === ct.value }"
                    @click="customChartType = ct.value"
                  >
                    <el-icon size="12"><component :is="ct.icon" /></el-icon>
                    {{ ct.label }}
                  </button>
                </div>
              </div>
              <el-button
                type="primary"
                :loading="queryLoading"
                @click="runQuery"
                class="run-btn"
              >
                <el-icon><VideoPlay /></el-icon> 运行查询
              </el-button>
            </div>

            <!-- 错误提示 -->
            <div v-if="queryError" class="query-error">
              <el-icon><WarningFilled /></el-icon> {{ queryError }}
            </div>

            <!-- 结果区域 -->
            <div v-if="queryResult" class="query-result">
              <!-- 图表视图 -->
              <div v-if="customChartType !== 'table' && queryResult.data.length > 0" class="result-chart-wrap">
                <v-chart class="chart chart-tall" :option="customChartOption" autoresize />
              </div>
              <!-- 表格视图 -->
              <div class="result-table-wrap">
                <div class="result-meta">
                  <span>共 {{ queryResult.count }} 行</span>
                  <el-button size="small" plain @click="exportCsv">导出 CSV</el-button>
                </div>
                <el-table
                  :data="queryResult.data.slice(0, 200)"
                  size="small"
                  stripe
                  border
                  max-height="320"
                  style="width:100%"
                >
                  <el-table-column
                    v-for="col in queryResult.columns"
                    :key="col"
                    :prop="col"
                    :label="col"
                    min-width="120"
                    show-overflow-tooltip
                  />
                </el-table>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, LineChart, PieChart, ScatterChart } from 'echarts/charts'
import {
  TitleComponent, TooltipComponent, LegendComponent,
  GridComponent, DataZoomComponent
} from 'echarts/components'
import VChart from 'vue-echarts'
import {
  DataAnalysis, ArrowDown, Loading, MagicStick, DataBoard,
  ArrowRight, VideoPlay, WarningFilled
} from '@element-plus/icons-vue'
import { analyticsApi } from '@/api'

use([
  CanvasRenderer, BarChart, LineChart, PieChart, ScatterChart,
  TitleComponent, TooltipComponent, LegendComponent, GridComponent, DataZoomComponent
])

// ── 状态 ──────────────────────────────────────────────────────
const isOpen = ref(false)
const loading = ref(false)
const activeTab = ref('overview')

const overviewData = ref([])
const categoryData = ref([])
const checklistData = ref([])
const topData = ref([])
const schemaData = ref([])

const selectedExhibition = ref('')
const topExhibition = ref('')
const openSchemas = ref(new Set())

const customSql = ref('')
const customChartType = ref('bar')
const queryLoading = ref(false)
const queryError = ref('')
const queryResult = ref(null)
const sqlInput = ref(null)

// ── 计算属性 ──────────────────────────────────────────────────
const hasData = computed(() => overviewData.value.length > 0)
const completedCount = computed(() => overviewData.value.filter(e => e.status === 'completed').length)
const completedExhibitions = computed(() =>
  overviewData.value.filter(e => e.status === 'completed').map(e => e.name)
)

// ── Tabs ──────────────────────────────────────────────────────
const tabs = [
  { key: 'overview', label: '展会总览', icon: 'DataAnalysis' },
  { key: 'category', label: '品类分析', icon: 'PieChart' },
  { key: 'checklist', label: 'Checklist', icon: 'CircleCheck' },
  { key: 'top', label: 'Top 商品', icon: 'Trophy' },
]

const chartTypes = [
  { value: 'bar', label: '柱状图', icon: 'DataAnalysis' },
  { value: 'line', label: '折线图', icon: 'TrendCharts' },
  { value: 'pie', label: '饼图', icon: 'PieChart' },
  { value: 'table', label: '仅表格', icon: 'Grid' },
]

// ── 快捷模板 ──────────────────────────────────────────────────
const queryTemplates = [
  {
    label: '各展会销售汇总',
    sql: `SELECT e.name, e.date,
  SUM(s.sold_quantity) AS sold,
  SUM(s.square_quantity_before) AS brought,
  ROUND(CAST(SUM(s.sold_quantity) AS FLOAT) / NULLIF(SUM(s.square_quantity_before),0) * 100, 1) AS sell_rate_pct
FROM inventory_snapshots s
JOIN exhibitions e ON e.id = s.exhibition_id
GROUP BY e.id
ORDER BY e.date`
  },
  {
    label: '品类销售排行',
    sql: `SELECT p.product_type, SUM(s.sold_quantity) AS sold
FROM inventory_snapshots s
LEFT JOIN product_variants pv ON pv.shopify_variant_id = s.shopify_variant_id
LEFT JOIN products p ON p.id = pv.product_id
GROUP BY p.product_type
ORDER BY sold DESC`
  },
  {
    label: 'Top 20 商品',
    sql: `SELECT p.title, pv.variant_title, SUM(s.sold_quantity) AS sold
FROM inventory_snapshots s
LEFT JOIN product_variants pv ON pv.shopify_variant_id = s.shopify_variant_id
LEFT JOIN products p ON p.id = pv.product_id
GROUP BY s.shopify_variant_id
ORDER BY sold DESC
LIMIT 20`
  },
  {
    label: 'Checklist 完成率',
    sql: `SELECT e.name,
  COUNT(ei.id) AS total,
  SUM(ei.checked) AS checked,
  ROUND(CAST(SUM(ei.checked) AS FLOAT) / NULLIF(COUNT(ei.id),0) * 100, 1) AS pct
FROM exhibitions e
LEFT JOIN exhibition_items ei ON e.id = ei.exhibition_id
GROUP BY e.id`
  },
]

// ── ECharts 主题色 ─────────────────────────────────────────────
const COLORS = ['#5470c6','#91cc75','#fac858','#ee6666','#73c0de','#3ba272','#fc8452','#9a60b4','#ea7ccc']

const baseGrid = { top: 36, right: 16, bottom: 40, left: 60, containLabel: true }
const baseTip = { trigger: 'axis', backgroundColor: '#1e2235', borderColor: '#3a3f5c', textStyle: { color: '#e0e6f0', fontSize: 12 } }

// ── 展会总览图表 ──────────────────────────────────────────────
const soldBarOption = computed(() => {
  const data = overviewData.value.filter(e => e.status === 'completed')
  return {
    color: COLORS,
    tooltip: baseTip,
    grid: baseGrid,
    xAxis: { type: 'category', data: data.map(e => e.name), axisLabel: { fontSize: 11, interval: 0, rotate: data.length > 3 ? 15 : 0 } },
    yAxis: { type: 'value', name: '件数', nameTextStyle: { fontSize: 11 } },
    series: [{
      type: 'bar', data: data.map(e => e.total_sold),
      barMaxWidth: 48,
      itemStyle: { borderRadius: [6, 6, 0, 0] },
      label: { show: true, position: 'top', fontSize: 12, fontWeight: 600 },
    }]
  }
})

const sellRateOption = computed(() => {
  const data = overviewData.value.filter(e => e.status === 'completed')
  const rates = data.map(e =>
    e.total_brought > 0 ? Math.round(e.total_sold / e.total_brought * 1000) / 10 : 0
  )
  return {
    color: ['#5470c6'],
    tooltip: { ...baseTip, formatter: (p) => `${p[0].name}<br/>销售率：${p[0].value}%` },
    grid: baseGrid,
    xAxis: { type: 'category', data: data.map(e => e.name), axisLabel: { fontSize: 11 } },
    yAxis: { type: 'value', name: '%', max: 100, nameTextStyle: { fontSize: 11 } },
    series: [{
      type: 'line', data: rates, smooth: true,
      symbol: 'circle', symbolSize: 8,
      lineStyle: { width: 3 },
      areaStyle: { opacity: 0.15 },
      label: { show: true, formatter: '{c}%', fontSize: 12, fontWeight: 600 },
    }]
  }
})

const stackedBarOption = computed(() => {
  const data = overviewData.value.filter(e => e.status === 'completed')
  return {
    color: ['#5470c6', '#91cc75', '#fac858'],
    tooltip: { ...baseTip, trigger: 'axis' },
    legend: { data: ['带去', '卖出', '剩余'], top: 4, textStyle: { fontSize: 12 } },
    grid: { ...baseGrid, top: 48 },
    xAxis: { type: 'category', data: data.map(e => e.name), axisLabel: { fontSize: 11 } },
    yAxis: { type: 'value', name: '件数', nameTextStyle: { fontSize: 11 } },
    series: [
      { name: '带去', type: 'bar', data: data.map(e => e.total_brought), barMaxWidth: 56, itemStyle: { borderRadius: [0,0,0,0] } },
      { name: '卖出', type: 'bar', data: data.map(e => e.total_sold), barMaxWidth: 56 },
      { name: '剩余', type: 'bar', data: data.map(e => e.total_remaining), barMaxWidth: 56, itemStyle: { borderRadius: [6,6,0,0] } },
    ]
  }
})

// ── 品类分析图表 ──────────────────────────────────────────────
const filteredCategoryData = computed(() => {
  if (!selectedExhibition.value) return []
  return categoryData.value.filter(d => d.exhibition_name === selectedExhibition.value)
    .sort((a, b) => b.sold - a.sold)
})

const categoryBarOption = computed(() => {
  const data = filteredCategoryData.value.slice(0, 12)
  return {
    color: COLORS,
    tooltip: { ...baseTip, trigger: 'axis' },
    grid: { top: 20, right: 16, bottom: 16, left: 16, containLabel: true },
    xAxis: { type: 'value', name: '件数', nameTextStyle: { fontSize: 11 } },
    yAxis: { type: 'category', data: data.map(d => d.product_type).reverse(), axisLabel: { fontSize: 11 } },
    series: [{
      type: 'bar', data: data.map(d => d.sold).reverse(),
      barMaxWidth: 28,
      itemStyle: { borderRadius: [0, 6, 6, 0] },
      label: { show: true, position: 'right', fontSize: 11 },
    }]
  }
})

const categoryRateOption = computed(() => {
  const data = [...filteredCategoryData.value]
    .sort((a, b) => (b.sell_rate || 0) - (a.sell_rate || 0))
    .slice(0, 12)
  return {
    color: ['#91cc75'],
    tooltip: { ...baseTip, formatter: (p) => `${p[0].name}<br/>销售率：${p[0].value}%` },
    grid: { top: 20, right: 16, bottom: 16, left: 16, containLabel: true },
    xAxis: { type: 'value', name: '%', max: 100, nameTextStyle: { fontSize: 11 } },
    yAxis: { type: 'category', data: data.map(d => d.product_type).reverse(), axisLabel: { fontSize: 11 } },
    series: [{
      type: 'bar', data: data.map(d => d.sell_rate || 0).reverse(),
      barMaxWidth: 28,
      itemStyle: { borderRadius: [0, 6, 6, 0] },
      label: { show: true, position: 'right', formatter: '{c}%', fontSize: 11 },
    }]
  }
})

// ── Checklist 环形图 ──────────────────────────────────────────
function ringsFor(ex) {
  const t = ex.total || 1
  return [
    { label: 'Checked', pct: Math.round(ex.checked / t * 100), color: '#5470c6' },
    { label: 'Hanger', pct: Math.round(ex.hanger_done / t * 100), color: '#91cc75' },
    { label: 'Storage', pct: Math.round(ex.storage_done / t * 100), color: '#fac858' },
  ]
}

// ── Top 商品图表 ──────────────────────────────────────────────
const topSoldOption = computed(() => {
  const data = topData.value.slice(0, 10)
  const labels = data.map(d => d.product_title ? `${d.product_title}${d.variant_title ? ' · ' + d.variant_title : ''}` : '未知')
  return {
    color: COLORS,
    tooltip: { ...baseTip, trigger: 'axis' },
    grid: { top: 20, right: 16, bottom: 16, left: 16, containLabel: true },
    xAxis: { type: 'value', name: '件数', nameTextStyle: { fontSize: 11 } },
    yAxis: { type: 'category', data: labels.reverse(), axisLabel: { fontSize: 10, width: 140, overflow: 'truncate' } },
    series: [{
      type: 'bar', data: data.map(d => d.sold_quantity).reverse(),
      barMaxWidth: 24,
      itemStyle: { borderRadius: [0, 6, 6, 0] },
      label: { show: true, position: 'right', fontSize: 11 },
    }]
  }
})

const topRateOption = computed(() => {
  const data = [...topData.value].sort((a, b) => (b.sell_rate || 0) - (a.sell_rate || 0)).slice(0, 10)
  const labels = data.map(d => d.product_title ? `${d.product_title}${d.variant_title ? ' · ' + d.variant_title : ''}` : '未知')
  return {
    color: ['#91cc75'],
    tooltip: { ...baseTip, formatter: (p) => `${p[0].name}<br/>销售率：${p[0].value}%` },
    grid: { top: 20, right: 16, bottom: 16, left: 16, containLabel: true },
    xAxis: { type: 'value', name: '%', max: 100, nameTextStyle: { fontSize: 11 } },
    yAxis: { type: 'category', data: labels.reverse(), axisLabel: { fontSize: 10, width: 140, overflow: 'truncate' } },
    series: [{
      type: 'bar', data: data.map(d => d.sell_rate || 0).reverse(),
      barMaxWidth: 24,
      itemStyle: { borderRadius: [0, 6, 6, 0] },
      label: { show: true, position: 'right', formatter: '{c}%', fontSize: 11 },
    }]
  }
})

// ── 自定义图表 ────────────────────────────────────────────────
const customChartOption = computed(() => {
  if (!queryResult.value || !queryResult.value.data.length) return {}
  const cols = queryResult.value.columns
  const rows = queryResult.value.data
  const xCol = cols[0]
  const yCols = cols.slice(1).filter(c => {
    const v = rows[0][c]
    return typeof v === 'number' || (!isNaN(parseFloat(v)) && v !== null && v !== '')
  })
  if (!yCols.length) return {}

  const xData = rows.map(r => String(r[xCol] ?? ''))

  if (customChartType.value === 'pie') {
    const yCol = yCols[0]
    return {
      color: COLORS,
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { type: 'scroll', bottom: 0, textStyle: { fontSize: 11 } },
      series: [{
        type: 'pie', radius: ['35%', '65%'],
        data: rows.map(r => ({ name: String(r[xCol] ?? ''), value: parseFloat(r[yCol]) || 0 })),
        label: { fontSize: 11 },
        emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.5)' } },
      }]
    }
  }

  return {
    color: COLORS,
    tooltip: { ...baseTip, trigger: 'axis' },
    legend: yCols.length > 1 ? { data: yCols, top: 4, textStyle: { fontSize: 11 } } : undefined,
    grid: { ...baseGrid, top: yCols.length > 1 ? 48 : 36 },
    xAxis: { type: 'category', data: xData, axisLabel: { fontSize: 11, rotate: xData.length > 6 ? 20 : 0 } },
    yAxis: { type: 'value', nameTextStyle: { fontSize: 11 } },
    dataZoom: xData.length > 12 ? [{ type: 'inside' }, { type: 'slider', height: 20, bottom: 0 }] : undefined,
    series: yCols.map((col, i) => ({
      name: col,
      type: customChartType.value === 'line' ? 'line' : 'bar',
      data: rows.map(r => parseFloat(r[col]) || 0),
      smooth: customChartType.value === 'line',
      barMaxWidth: 48,
      itemStyle: { borderRadius: customChartType.value === 'bar' ? [6, 6, 0, 0] : 0 },
      areaStyle: customChartType.value === 'line' ? { opacity: 0.1 } : undefined,
      label: yCols.length === 1 ? { show: true, position: 'top', fontSize: 11, fontWeight: 600 } : undefined,
    }))
  }
})

// ── 方法 ──────────────────────────────────────────────────────
async function toggle() {
  isOpen.value = !isOpen.value
  if (isOpen.value && !overviewData.value.length) await loadAll()
}

async function loadAll() {
  loading.value = true
  try {
    const [ov, cat, cl, schema] = await Promise.all([
      analyticsApi.overview(),
      analyticsApi.byCategory(),
      analyticsApi.checklistProgress(),
      analyticsApi.schema(),
    ])
    overviewData.value = ov.data || []
    categoryData.value = cat.data || []
    checklistData.value = cl.data || []
    schemaData.value = schema.data || []

    if (completedExhibitions.value.length) {
      selectedExhibition.value = completedExhibitions.value[completedExhibitions.value.length - 1]
      topExhibition.value = completedExhibitions.value[completedExhibitions.value.length - 1]
      await loadTopProducts()
    }
  } catch (e) {
    console.error('[Analytics]', e)
  } finally {
    loading.value = false
  }
}

async function loadTopProducts() {
  const ex = overviewData.value.find(e => e.name === topExhibition.value)
  if (!ex) return
  const res = await analyticsApi.topProducts({ exhibition_id: ex.id, limit: 20 })
  topData.value = res.data || []
}

async function runQuery() {
  if (!customSql.value.trim()) return
  queryLoading.value = true
  queryError.value = ''
  queryResult.value = null
  try {
    const res = await analyticsApi.query(customSql.value)
    queryResult.value = res
  } catch (e) {
    queryError.value = e.message || '查询失败'
  } finally {
    queryLoading.value = false
  }
}

function toggleSchema(name) {
  const s = new Set(openSchemas.value)
  s.has(name) ? s.delete(name) : s.add(name)
  openSchemas.value = s
}

function insertCol(table, col) {
  const pos = sqlInput.value?.selectionStart ?? customSql.value.length
  const text = customSql.value
  customSql.value = text.slice(0, pos) + col + text.slice(pos)
}

function exportCsv() {
  if (!queryResult.value) return
  const cols = queryResult.value.columns
  const rows = queryResult.value.data
  const csv = [cols.join(','), ...rows.map(r => cols.map(c => JSON.stringify(r[c] ?? '')).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = 'query_result.csv'; a.click()
  URL.revokeObjectURL(url)
}

function statusTagType(s) {
  return { preparing: 'info', active: 'warning', completed: 'success' }[s] || 'info'
}
function statusLabel(s) {
  return { preparing: '备展中', active: '进行中', completed: '已完成' }[s] || s
}
</script>

<style scoped>
/* ── 折叠触发器 ─────────────────────────────────────────────── */
.analytics-toggle {
  margin-bottom: 16px;
  cursor: pointer;
  user-select: none;
}
.toggle-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: linear-gradient(135deg, #f0f4ff 0%, #f8f0ff 100%);
  border: 1px solid #dde3f5;
  border-radius: 12px;
  transition: all 0.2s ease;
}
.toggle-inner:hover {
  background: linear-gradient(135deg, #e6edff 0%, #f0e8ff 100%);
  border-color: #b8c8f0;
  box-shadow: 0 2px 8px rgba(84,112,198,0.12);
}
.toggle-left { display: flex; align-items: center; gap: 8px; }
.toggle-icon-wrap {
  width: 28px; height: 28px;
  background: linear-gradient(135deg, #5470c6, #7c5cbf);
  border-radius: 7px;
  display: flex; align-items: center; justify-content: center;
  color: #fff;
}
.toggle-label { font-size: 14px; font-weight: 600; color: #303133; }
.toggle-arrow {
  color: #909399;
  transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1);
}
.toggle-arrow.open { transform: rotate(180deg); }

/* ── 面板动画 ───────────────────────────────────────────────── */
.dashboard-slide-enter-active {
  transition: all 0.38s cubic-bezier(0.34,1.2,0.64,1);
}
.dashboard-slide-leave-active {
  transition: all 0.28s cubic-bezier(0.4,0,0.2,1);
}
.dashboard-slide-enter-from,
.dashboard-slide-leave-to {
  opacity: 0;
  transform: translateY(-12px) scaleY(0.96);
  transform-origin: top;
}

/* ── 面板容器 ───────────────────────────────────────────────── */
.analytics-panel {
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 14px;
  margin-bottom: 20px;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0,0,0,0.06);
}

/* ── 加载 ───────────────────────────────────────────────────── */
.panel-loading {
  display: flex; align-items: center; justify-content: center;
  gap: 10px; padding: 48px;
  color: #909399; font-size: 14px;
}
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Tabs ───────────────────────────────────────────────────── */
.panel-tabs {
  display: flex; align-items: center; gap: 2px;
  padding: 12px 16px 0;
  border-bottom: 1px solid #f0f2f5;
  background: #fafbfc;
}
.ptab {
  display: flex; align-items: center; gap: 5px;
  padding: 7px 14px;
  border: none; background: transparent;
  font-size: 13px; color: #606266;
  cursor: pointer; border-radius: 8px 8px 0 0;
  transition: all 0.18s ease;
  white-space: nowrap;
}
.ptab:hover { background: #f0f4ff; color: #5470c6; }
.ptab.active {
  background: #fff; color: #5470c6;
  font-weight: 600;
  box-shadow: 0 -1px 0 0 #5470c6 inset, 0 1px 0 0 #fff;
  border: 1px solid #e4e7ed; border-bottom: 1px solid #fff;
}
.tab-spacer { flex: 1; }
.custom-tab { color: #7c5cbf; }
.custom-tab.active { color: #7c5cbf; box-shadow: 0 -1px 0 0 #7c5cbf inset, 0 1px 0 0 #fff; }

/* ── Tab 内容 ───────────────────────────────────────────────── */
.tab-content { padding: 20px; }

/* ── 图表网格 ───────────────────────────────────────────────── */
.chart-grid { display: grid; gap: 16px; margin-bottom: 16px; }
.chart-grid.two-col { grid-template-columns: 1fr 1fr; }
@media (max-width: 768px) { .chart-grid.two-col { grid-template-columns: 1fr; } }

.chart-card {
  background: #fafbfc;
  border: 1px solid #ebeef5;
  border-radius: 10px;
  padding: 16px;
  transition: box-shadow 0.2s;
}
.chart-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
.chart-card.full-width { grid-column: 1 / -1; }
.chart-title { font-size: 13px; font-weight: 600; color: #303133; margin-bottom: 12px; }
.chart { height: 220px; }
.chart-tall { height: 300px; }

/* ── 过滤行 ─────────────────────────────────────────────────── */
.filter-row {
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 16px; flex-wrap: wrap;
}
.filter-label { font-size: 13px; color: #606266; white-space: nowrap; }
.filter-btns { display: flex; gap: 6px; flex-wrap: wrap; }
.filter-btn {
  padding: 4px 12px;
  border: 1px solid #dcdfe6; border-radius: 20px;
  background: #fff; font-size: 12px; color: #606266;
  cursor: pointer; transition: all 0.18s ease;
  display: flex; align-items: center; gap: 4px;
}
.filter-btn:hover { border-color: #5470c6; color: #5470c6; }
.filter-btn.active { background: #5470c6; border-color: #5470c6; color: #fff; }

/* ── Checklist 卡片 ─────────────────────────────────────────── */
.checklist-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}
.checklist-card {
  background: #fafbfc;
  border: 1px solid #ebeef5;
  border-radius: 12px;
  padding: 18px;
  transition: box-shadow 0.2s;
}
.checklist-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
.checklist-card.completed { border-color: #b7eb8f; background: #f6ffed; }
.checklist-card.active { border-color: #ffd591; background: #fffbe6; }
.cl-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.cl-name { font-size: 14px; font-weight: 600; color: #303133; }
.cl-date { font-size: 12px; color: #909399; margin-bottom: 16px; }
.cl-rings { display: flex; gap: 16px; justify-content: center; margin-bottom: 12px; }
.ring-wrap { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.ring-svg { width: 56px; height: 56px; transform: rotate(-90deg); }
.ring-bg { fill: none; stroke: #ebeef5; stroke-width: 4; }
.ring-fg { fill: none; stroke-width: 4; stroke-linecap: round; transition: stroke-dasharray 0.8s cubic-bezier(0.34,1.56,0.64,1); }
.ring-pct { font-size: 13px; font-weight: 700; color: #303133; margin-top: -4px; }
.ring-label { font-size: 11px; color: #909399; }
.cl-total { font-size: 12px; color: #909399; text-align: center; }

/* ── 自定义查询面板 ──────────────────────────────────────────── */
.custom-query-panel { display: flex; gap: 16px; min-height: 480px; }
.schema-sidebar {
  width: 200px; flex-shrink: 0;
  background: #f8f9fc;
  border: 1px solid #ebeef5;
  border-radius: 10px;
  padding: 12px;
  overflow-y: auto;
  max-height: 560px;
}
.schema-title {
  display: flex; align-items: center; gap: 5px;
  font-size: 12px; font-weight: 600; color: #606266;
  margin-bottom: 10px;
}
.schema-table { margin-bottom: 6px; }
.schema-tbl-name {
  display: flex; align-items: center; gap: 4px;
  font-size: 12px; font-weight: 600; color: #303133;
  padding: 4px 6px; border-radius: 6px;
  cursor: pointer; transition: background 0.15s;
}
.schema-tbl-name:hover { background: #eef0f8; }
.rotate-90 { transform: rotate(90deg); transition: transform 0.2s; }
.schema-cols { padding-left: 14px; margin-top: 2px; }
.schema-col {
  display: flex; justify-content: space-between;
  padding: 3px 6px; border-radius: 4px;
  cursor: pointer; transition: background 0.15s;
}
.schema-col:hover { background: #e8eaf6; }
.col-name { font-size: 11px; color: #303133; }
.col-type { font-size: 10px; color: #909399; }

.query-main { flex: 1; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.query-templates { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.tmpl-label { font-size: 12px; color: #909399; white-space: nowrap; }
.tmpl-btn {
  padding: 4px 10px;
  border: 1px solid #dcdfe6; border-radius: 6px;
  background: #fff; font-size: 12px; color: #606266;
  cursor: pointer; transition: all 0.15s;
}
.tmpl-btn:hover { border-color: #7c5cbf; color: #7c5cbf; background: #f5f0ff; }

.sql-editor-wrap { position: relative; }
.sql-editor {
  width: 100%; min-height: 120px;
  padding: 12px 14px;
  border: 1px solid #dcdfe6; border-radius: 8px;
  font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
  font-size: 13px; line-height: 1.6; color: #303133;
  background: #1e2235; color: #e0e6f0;
  resize: vertical; outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
}
.sql-editor:focus { border-color: #7c5cbf; box-shadow: 0 0 0 2px rgba(124,92,191,0.15); }
.sql-hint { position: absolute; bottom: 8px; right: 10px; font-size: 11px; color: #606266; pointer-events: none; }

.query-actions {
  display: flex; align-items: center; justify-content: space-between;
  flex-wrap: wrap; gap: 10px;
}
.chart-type-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.run-btn { flex-shrink: 0; }

.query-error {
  display: flex; align-items: center; gap: 6px;
  padding: 10px 14px;
  background: #fff2f0; border: 1px solid #ffccc7;
  border-radius: 8px; font-size: 13px; color: #cf1322;
}

.result-meta {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 8px; font-size: 12px; color: #909399;
}
.result-chart-wrap { margin-bottom: 16px; }
.result-table-wrap { overflow: auto; }

@media (max-width: 640px) {
  .custom-query-panel { flex-direction: column; }
  .schema-sidebar { width: 100%; max-height: 200px; }
}
</style>
