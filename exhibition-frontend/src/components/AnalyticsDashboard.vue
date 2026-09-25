<template>
  <section class="analytics-shell">
    <button class="analytics-toggle" type="button" :aria-expanded="isOpen" @click="toggle">
      <span class="toggle-leading">
        <span class="toggle-icon"><el-icon><DataAnalysis /></el-icon></span>
        <span>
          <strong>销售与市场分析</strong>
          <small>展会表现、商品需求、市场趋势与数据质量</small>
        </span>
      </span>
      <span class="toggle-trailing">
        <span v-if="hasData" class="coverage-pill">{{ dashboard.kpis.classification_coverage }}% 已分类</span>
        <el-icon class="toggle-arrow" :class="{ open: isOpen }"><ArrowDown /></el-icon>
      </span>
    </button>

    <Transition name="dashboard-expand">
      <div v-if="isOpen" class="dashboard-panel">
        <header class="dashboard-header">
          <div>
            <p class="eyebrow">EXHIBITION INTELLIGENCE</p>
            <h2>用历史展会数据指导下一次备货</h2>
            <p class="header-copy">销售量用于判断需求，销售率用于判断配置效率；两者结合后再决定增加或减少带货量。</p>
          </div>
          <div class="header-controls">
            <label for="analytics-scope">分析范围</label>
            <el-select
              id="analytics-scope"
              v-model="selectedExhibitionId"
              class="scope-select"
              placeholder="全部已完成展会"
              :disabled="loading"
              @change="loadDashboard"
            >
              <el-option label="全部已完成展会" value="" />
              <el-option
                v-for="event in dashboard.scope.completed_exhibitions"
                :key="event.id"
                :label="event.name"
                :value="event.id"
              />
            </el-select>
            <button class="refresh-button" type="button" :disabled="loading" @click="loadDashboard">
              <el-icon :class="{ spin: loading }"><Refresh /></el-icon>
              刷新
            </button>
          </div>
        </header>

        <div v-if="loading && !hasData" class="dashboard-loading">
          <div v-for="item in 4" :key="item" class="skeleton-card">
            <span></span><span></span><span></span>
          </div>
        </div>

        <div v-else-if="loadError && !hasData" class="state-card error-state">
          <el-icon><Warning /></el-icon>
          <div>
            <strong>分析数据暂时无法加载</strong>
            <p>{{ loadError }}</p>
          </div>
          <button type="button" @click="loadDashboard">重新加载</button>
        </div>

        <div v-else-if="!hasData" class="state-card">
          <el-icon><DataAnalysis /></el-icon>
          <div>
            <strong>还没有可分析的展会销售记录</strong>
            <p>完成展会结束后的 Square 同步后，销售和趋势数据会显示在这里。</p>
          </div>
        </div>

        <template v-else>
          <div v-if="loadError" class="inline-warning">
            <el-icon><Warning /></el-icon>{{ loadError }}，当前显示上一次成功加载的数据。
          </div>
          <div v-if="dashboard.scope.excluded_exhibitions?.length" class="inline-warning eligibility-warning">
            <el-icon><Warning /></el-icon>
            已排除 {{ dashboard.scope.excluded_exhibitions.length }} 场尚未完成全部规格展后同步的展会，避免把缺失记录误算为零销量。
          </div>

          <div class="kpi-grid">
            <article class="kpi-card primary">
              <span class="kpi-label">预估销售额</span>
              <strong>{{ formatCurrency(dashboard.kpis.estimated_revenue) }}</strong>
              <small>按快照保存的商品价格估算，不等同 Square 实收</small>
            </article>
            <article class="kpi-card">
              <span class="kpi-label">售出件数</span>
              <strong>{{ formatNumber(dashboard.kpis.units_sold) }}</strong>
              <small>{{ dashboard.kpis.exhibition_count }} 场 · 平均 {{ formatNumber(dashboard.kpis.average_units_per_event, 1) }} 件/场</small>
            </article>
            <article class="kpi-card">
              <span class="kpi-label">整体销售率</span>
              <strong>{{ formatPercent(dashboard.kpis.sell_through) }}</strong>
              <small>售出 {{ formatNumber(dashboard.kpis.units_sold) }} / 计划带去 {{ formatNumber(dashboard.kpis.allocated_units) }}</small>
            </article>
            <article class="kpi-card quality">
              <span class="kpi-label">分类覆盖率</span>
              <strong>{{ formatPercent(dashboard.kpis.classification_coverage) }}</strong>
              <small>自动恢复 {{ dashboard.kpis.recovered_products }} 个空类型商品</small>
            </article>
          </div>

          <div class="comparison-strip" v-if="dashboard.comparison">
            <div class="comparison-heading">
              <span>最近一场表现</span>
              <strong>{{ dashboard.comparison.current_event }}</strong>
              <small v-if="dashboard.comparison.previous_event">对比 {{ dashboard.comparison.previous_event }}</small>
            </div>
            <MetricDelta label="销售量" :value="dashboard.comparison.units_delta_pct" suffix="%" />
            <MetricDelta label="销售率" :value="dashboard.comparison.sell_through_delta_pp" suffix="pp" />
            <MetricDelta label="预估销售额" :value="dashboard.comparison.revenue_delta_pct" suffix="%" />
            <div class="comparison-best">
              <span>最佳品类</span>
              <strong>{{ dashboard.comparison.best_category }}</strong>
            </div>
          </div>

          <nav class="dashboard-tabs" aria-label="分析视图">
            <button
              v-for="tab in tabs"
              :key="tab.key"
              type="button"
              :class="{ active: activeTab === tab.key }"
              @click="activeTab = tab.key"
            >
              <el-icon><component :is="tab.icon" /></el-icon>
              <span>{{ tab.label }}</span>
              <span v-if="tab.key === 'quality' && dashboard.quality.issues.length" class="issue-count">{{ dashboard.quality.issues.length }}</span>
            </button>
          </nav>

          <Transition name="tab-fade" mode="out-in">
            <div :key="activeTab" class="tab-content">
              <template v-if="activeTab === 'overview'">
                <div class="section-heading">
                  <div>
                    <p class="eyebrow">EXECUTIVE VIEW</p>
                    <h3>本轮应优先关注的三个信号</h3>
                  </div>
                  <span>{{ dashboard.scope.exhibition_name }}</span>
                </div>

                <div class="insight-grid">
                  <article v-for="insight in insightCards" :key="insight.title" class="insight-card" :class="insight.tone">
                    <span class="insight-icon"><el-icon><component :is="insight.icon" /></el-icon></span>
                    <div>
                      <small>{{ insight.kicker }}</small>
                      <strong>{{ insight.title }}</strong>
                      <p>{{ insight.body }}</p>
                    </div>
                  </article>
                </div>

                <div class="chart-grid wide-left">
                  <ChartCard title="展会销售表现" subtitle="柱状为售出件数，折线为销售率；避免只看销量忽略带货规模">
                    <v-chart class="chart chart-large" :option="eventTrendOption" autoresize />
                  </ChartCard>
                  <ChartCard title="款式大类贡献" subtitle="适合决定展位空间和总体货盘结构">
                    <v-chart class="chart chart-large" :option="familyShareOption" autoresize />
                  </ChartCard>
                </div>

                <div class="chart-grid equal">
                  <ChartCard title="具体品类表现" subtitle="同看售出量和销售率，识别高需求与高效率品类">
                    <v-chart class="chart" :option="categoryPerformanceOption" autoresize />
                  </ChartCard>
                  <ChartCard title="市场效率" subtitle="按城市计算每场平均销量，降低参展次数差异造成的误判">
                    <v-chart class="chart" :option="marketPerformanceOption" autoresize />
                  </ChartCard>
                </div>
              </template>

              <template v-else-if="activeTab === 'demand'">
                <div class="section-heading demand-heading">
                  <div>
                    <p class="eyebrow">PRODUCT DEMAND</p>
                    <h3>下一场备货与陈列建议</h3>
                    <p>建议数量以当前范围内最近三场销量加权，并以约 70% 目标销售率反推；仅供计划，不会自动改动展会数量。</p>
                  </div>
                  <div class="signal-filter">
                    <button
                      v-for="filter in signalFilters"
                      :key="filter.value"
                      type="button"
                      :class="{ active: activeSignal === filter.value }"
                      @click="activeSignal = filter.value"
                    >{{ filter.label }}</button>
                  </div>
                </div>

                <div class="demand-layout">
                  <div class="table-card demand-table-card">
                    <div class="card-heading">
                      <div><strong>商品需求排行</strong><span>销量、效率与趋势的组合判断</span></div>
                      <small>显示 {{ filteredDemandSignals.length }} 个商品</small>
                    </div>
                    <div class="table-scroll">
                      <table class="analytics-table demand-table">
                        <thead>
                          <tr>
                            <th>商品</th><th>品类</th><th class="numeric">售出</th><th class="numeric">平均/场</th>
                            <th class="numeric">销售率</th><th class="numeric">趋势</th><th class="numeric">计划参考</th><th>建议</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="row in filteredDemandSignals" :key="row.product_key">
                            <td><strong>{{ row.product_title }}</strong><small>{{ row.collection }} · {{ row.material }}</small></td>
                            <td><span class="soft-tag">{{ row.category }}</span></td>
                            <td class="numeric emph">{{ row.sold }}</td>
                            <td class="numeric">{{ formatNumber(row.average_sold, 1) }}</td>
                            <td class="numeric">{{ formatPercent(row.sell_through) }}</td>
                            <td class="numeric"><TrendValue :value="row.trend_pct" /></td>
                            <td class="numeric"><template v-if="row.recommended_units != null"><strong>{{ row.recommended_units }}</strong> 件</template><span v-else>—</span></td>
                            <td><span class="signal-badge" :class="row.signal">{{ signalLabel(row.signal) }}</span></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <aside class="planning-note">
                    <span class="note-icon"><el-icon><Opportunity /></el-icon></span>
                    <strong>使用建议</strong>
                    <p>优先增加“销量高且销售率高”的款式；“销售率高但销量小”的商品先小幅测试，避免因原本带货太少而高估需求。</p>
                    <ul>
                      <li>增加：销售率 ≥ 65% 且平均销量稳定</li>
                      <li>上升：近期销量较早期明显增加</li>
                      <li>减少：销售率 &lt; 25% 且有足够陈列量</li>
                      <li>少于 2 场有效样本时只展示结果，不给数量建议</li>
                    </ul>
                  </aside>
                </div>

                <div class="chart-grid equal">
                  <ChartCard title="尺码需求结构" subtitle="用于调整同款各尺码的配比，不把 One size 与婴童尺码混在一起">
                    <v-chart class="chart" :option="sizeDemandOption" autoresize />
                  </ChartCard>
                  <ChartCard title="系列销售贡献" subtitle="按 Shopify Season 标签识别；无标签归入 Core / Unassigned">
                    <v-chart class="chart" :option="collectionSalesOption" autoresize />
                  </ChartCard>
                </div>
              </template>

              <template v-else-if="activeTab === 'market'">
                <div class="section-heading">
                  <div>
                    <p class="eyebrow">MARKET TRENDS</p>
                    <h3>城市、展会类型与产品属性</h3>
                    <p>城市使用展会名称与地点自动归一；PBC / OFB 单独汇总，方便判断不同客群的货盘差异。</p>
                  </div>
                </div>

                <div class="chart-grid wide-left">
                  <ChartCard title="城市表现" subtitle="每场平均销量比累计销量更适合跨城市比较">
                    <v-chart class="chart chart-large" :option="marketPerformanceOption" autoresize />
                  </ChartCard>
                  <div class="table-card market-summary-card">
                    <div class="card-heading"><div><strong>展会类型</strong><span>不同活动类型的平均表现</span></div></div>
                    <div class="format-list">
                      <article v-for="row in dashboard.event_formats" :key="row.key">
                        <div><strong>{{ row.label }}</strong><small>{{ row.exhibition_count }} 场</small></div>
                        <div><strong>{{ formatNumber(row.sold_per_event, 1) }}</strong><small>件 / 场</small></div>
                        <div><strong>{{ formatPercent(row.sell_through) }}</strong><small>销售率</small></div>
                      </article>
                    </div>
                  </div>
                </div>

                <div class="chart-grid thirds">
                  <ChartCard title="材质需求" subtitle="按商品名称、标签与分类规则识别">
                    <v-chart class="chart small-chart" :option="materialOption" autoresize />
                  </ChartCard>
                  <ChartCard title="客群标签" subtitle="来自 Shopify Gender 标签">
                    <v-chart class="chart small-chart" :option="genderOption" autoresize />
                  </ChartCard>
                  <div class="table-card market-ranking-card">
                    <div class="card-heading"><div><strong>市场排行</strong><span>按每场平均销量排序</span></div></div>
                    <ol class="ranking-list">
                      <li v-for="(row, index) in dashboard.markets" :key="row.key">
                        <span class="rank">{{ index + 1 }}</span>
                        <div><strong>{{ row.label }}</strong><small>{{ row.exhibition_count }} 场 · {{ formatPercent(row.sell_through) }}</small></div>
                        <b>{{ formatNumber(row.sold_per_event, 1) }}</b>
                      </li>
                    </ol>
                  </div>
                </div>

                <ChartCard title="逐场趋势" subtitle="用于判断变化是市场趋势，还是单场带货量变化造成">
                  <v-chart class="chart chart-large" :option="eventTrendOption" autoresize />
                </ChartCard>
              </template>

              <template v-else>
                <div class="section-heading">
                  <div>
                    <p class="eyebrow">DATA QUALITY</p>
                    <h3>分类覆盖与需要人工确认的数据</h3>
                    <p>分类覆盖按当前商品目录统计；表内已售数量跟随上方分析范围。分析分类不会写回 Shopify 商品类型。</p>
                  </div>
                  <button v-if="authStore.isAdmin" class="manage-rules-button" type="button" @click="router.push('/dbadmin')">
                    <el-icon><Setting /></el-icon> 管理分类规则 <el-icon><ArrowRight /></el-icon>
                  </button>
                </div>

                <div class="quality-grid">
                  <article class="quality-card good">
                    <span><el-icon><CircleCheck /></el-icon></span>
                    <div><small>分析分类覆盖率</small><strong>{{ formatPercent(dashboard.kpis.classification_coverage) }}</strong><p>{{ dashboard.kpis.classified_products }} / {{ dashboard.quality.source_product_count }} 个当前商品</p></div>
                  </article>
                  <article class="quality-card recovered">
                    <span><el-icon><DataAnalysis /></el-icon></span>
                    <div><small>空类型已自动恢复</small><strong>{{ dashboard.quality.recovered_from_missing_type }}</strong><p>原有空 Shopify 类型 {{ dashboard.quality.missing_shopify_type }} 个</p></div>
                  </article>
                  <article class="quality-card" :class="dashboard.quality.unclassified_count ? 'warning' : 'good'">
                    <span><el-icon><Warning /></el-icon></span>
                    <div><small>仍未识别</small><strong>{{ dashboard.quality.unclassified_count }}</strong><p>需要添加关键词规则的商品</p></div>
                  </article>
                  <article class="quality-card warning">
                    <span><el-icon><Warning /></el-icon></span>
                    <div><small>类型疑似错误</small><strong>{{ dashboard.quality.type_mismatch_count }}</strong><p>名称/标签与 Shopify 类型不一致</p></div>
                  </article>
                </div>

                <div class="classification-flow">
                  <div><span>1</span><strong>具体款式</strong><p>标题与标签的最长关键词优先，例如 Zip Romper 不会被归到普通 Romper。</p></div>
                  <i></i>
                  <div><span>2</span><strong>销售大类</strong><p>One-piece、Separates、Accessories、Sleep & Bedding 等，用于总体货盘。</p></div>
                  <i></i>
                  <div><span>3</span><strong>独立属性</strong><p>材质、系列、尺码和客群分别分析，避免把多个维度混成一个分类。</p></div>
                </div>

                <div class="table-card quality-table-card">
                  <div class="card-heading">
                    <div><strong>待复核项目</strong><span>按影响优先级和已售数量排序</span></div>
                    <small>{{ dashboard.quality.issues.length }} 项</small>
                  </div>
                  <div v-if="!dashboard.quality.issues.length" class="all-clear">
                    <el-icon><CircleCheck /></el-icon> 当前范围内没有需要人工复核的数据。
                  </div>
                  <div v-else class="table-scroll">
                    <table class="analytics-table">
                      <thead><tr><th>商品</th><th>Shopify 类型</th><th>分析分类</th><th class="numeric">已售</th><th>问题</th></tr></thead>
                      <tbody>
                        <tr v-for="row in dashboard.quality.issues" :key="row.product_key">
                          <td><strong>{{ row.product_title }}</strong><small>{{ row.exhibition_count }} 场有销售记录</small></td>
                          <td>{{ row.shopify_product_type || '空' }}</td>
                          <td><span class="soft-tag">{{ row.inferred_category }}</span></td>
                          <td class="numeric emph">{{ row.sold }}</td>
                          <td><span v-for="reason in row.reasons" :key="reason" class="reason-tag" :class="reason">{{ reasonLabel(reason) }}</span></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </template>
            </div>
          </Transition>

          <footer class="dashboard-footer">
            <span>销售额为快照保存价格 × 售出件数的估算值，不包含折扣、退款和 Square 实际支付差异。</span>
            <span v-if="generatedAt">更新于 {{ formatDateTime(generatedAt) }}</span>
          </footer>
        </template>
      </div>
    </Transition>
  </section>
</template>

<script setup>
import { computed, defineComponent, h, onMounted, ref } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import {
  ArrowDown, ArrowRight, CircleCheck, DataAnalysis, Goods, Location,
  Opportunity, Refresh, Setting, TrendCharts, Trophy, Warning,
} from '@element-plus/icons-vue'
import { analyticsApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'

use([CanvasRenderer, BarChart, LineChart, PieChart, GridComponent, LegendComponent, TooltipComponent])

const authStore = useAuthStore()
const router = useRouter()
const isOpen = ref(true)
const loading = ref(false)
const loadError = ref('')
const generatedAt = ref('')
const activeTab = ref('overview')
const activeSignal = ref('all')
const selectedExhibitionId = ref('')
const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

function emptyDashboard() {
  return {
    scope: { exhibition_id: null, exhibition_name: '全部已完成展会', completed_exhibitions: [], excluded_exhibitions: [] },
    kpis: {
      units_sold: 0, allocated_units: 0, sell_through: null, estimated_revenue: 0,
      average_selling_price: 0, average_units_per_event: 0, exhibition_count: 0,
      classification_coverage: 0, classified_products: 0, unclassified_products: 0, recovered_products: 0,
    },
    comparison: null,
    trend: [], categories: [], families: [], collections: [], materials: [], genders: [], sizes: [], markets: [], event_formats: [],
    demand_signals: [],
    quality: {
      source_product_count: 0, missing_shopify_type: 0, recovered_from_missing_type: 0,
      unclassified_count: 0, type_mismatch_count: 0, missing_product_matches: 0, issues: [],
    },
  }
}

const dashboard = ref(emptyDashboard())
const hasData = computed(() => dashboard.value.kpis.exhibition_count > 0 && dashboard.value.trend.length > 0)

const tabs = [
  { key: 'overview', label: '经营总览', icon: DataAnalysis },
  { key: 'demand', label: '商品需求', icon: Goods },
  { key: 'market', label: '市场趋势', icon: Location },
  { key: 'quality', label: '数据质量', icon: CircleCheck },
]
const signalFilters = [
  { value: 'all', label: '全部' },
  { value: 'scale', label: '建议增加' },
  { value: 'rising', label: '趋势上升' },
  { value: 'steady', label: '保持' },
  { value: 'reduce', label: '建议减少' },
  { value: 'insufficient', label: '数据不足' },
]

const filteredDemandSignals = computed(() => {
  const rows = activeSignal.value === 'all'
    ? dashboard.value.demand_signals
    : dashboard.value.demand_signals.filter(row => row.signal === activeSignal.value)
  return rows.slice(0, 24)
})

const insightCards = computed(() => {
  const bestCategory = dashboard.value.categories[0]
  const scaleCandidate = dashboard.value.demand_signals.find(row => row.signal === 'scale' || row.signal === 'rising')
  const topMarket = dashboard.value.markets[0]
  return [
    {
      kicker: '货盘核心',
      title: bestCategory?.label || '等待更多销售记录',
      body: bestCategory
        ? `售出 ${bestCategory.sold} 件，占销售 ${formatPercent(bestCategory.sales_share)}，销售率 ${formatPercent(bestCategory.sell_through)}。`
        : '完成展后同步后将识别核心品类。',
      icon: Trophy,
      tone: 'gold',
    },
    {
      kicker: '下一场机会',
      title: scaleCandidate?.product_title || '暂未识别明显增量机会',
      body: scaleCandidate
        ? `近期计划参考 ${scaleCandidate.recommended_units} 件/场；当前销售率 ${formatPercent(scaleCandidate.sell_through)}。`
        : '当前商品表现较稳定，可继续积累两到三场数据。',
      icon: TrendCharts,
      tone: 'sage',
    },
    {
      kicker: '市场效率',
      title: topMarket?.label || '等待市场数据',
      body: topMarket
        ? `平均 ${formatNumber(topMarket.sold_per_event, 1)} 件/场，销售率 ${formatPercent(topMarket.sell_through)}，共 ${topMarket.exhibition_count} 场。`
        : '展会地点会自动归一为城市进行比较。',
      icon: Location,
      tone: 'blue',
    },
  ]
})

const CHART = {
  ink: '#2f302d',
  muted: '#7c7a72',
  grid: '#ece8df',
  navy: '#334b5f',
  terracotta: '#b96d4b',
  sage: '#738b78',
  gold: '#c79a4a',
  sand: '#dfcbb0',
  mist: '#9aafae',
}
const palette = [CHART.navy, CHART.terracotta, CHART.sage, CHART.gold, '#806d8a', CHART.mist, '#b08274']
const baseAnimation = { animation: !reduceMotion, animationDuration: 720, animationEasing: 'cubicOut' }
const axisLabel = { color: CHART.muted, fontSize: 11 }
const splitLine = { lineStyle: { color: CHART.grid, type: 'dashed' } }
const tooltip = {
  trigger: 'axis',
  backgroundColor: 'rgba(42, 43, 40, .96)',
  borderWidth: 0,
  padding: [10, 12],
  textStyle: { color: '#fff', fontSize: 12 },
  extraCssText: 'border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.16);',
}

const eventTrendOption = computed(() => {
  const rows = dashboard.value.trend
  return {
    ...baseAnimation,
    color: [CHART.navy, CHART.terracotta],
    tooltip,
    legend: { top: 0, right: 0, itemWidth: 12, itemHeight: 8, textStyle: axisLabel },
    grid: { top: 46, right: 48, bottom: rows.length > 6 ? 72 : 42, left: 52, containLabel: true },
    xAxis: {
      type: 'category',
      data: rows.map(row => row.name),
      axisLabel: { ...axisLabel, rotate: rows.length > 5 ? 24 : 0, width: 105, overflow: 'truncate' },
      axisLine: { lineStyle: { color: CHART.grid } },
      axisTick: { show: false },
    },
    yAxis: [
      { type: 'value', name: '件数', nameTextStyle: axisLabel, axisLabel, splitLine },
      { type: 'value', name: '%', min: 0, max: 100, nameTextStyle: axisLabel, axisLabel: { ...axisLabel, formatter: '{value}%' }, splitLine: { show: false } },
    ],
    series: [
      {
        name: '售出件数', type: 'bar', data: rows.map(row => row.sold), barMaxWidth: 34,
        itemStyle: { color: CHART.navy, borderRadius: [7, 7, 2, 2] },
      },
      {
        name: '销售率', type: 'line', yAxisIndex: 1, data: rows.map(row => row.sell_through),
        smooth: 0.35, symbol: 'circle', symbolSize: 7,
        lineStyle: { width: 3, color: CHART.terracotta }, itemStyle: { color: CHART.terracotta },
        areaStyle: { color: 'rgba(185,109,75,.09)' },
      },
    ],
  }
})

const familyShareOption = computed(() => ({
  ...baseAnimation,
  color: palette,
  tooltip: { trigger: 'item', formatter: '{b}<br/><b>{c}</b> 件 · {d}%' },
  legend: { type: 'scroll', bottom: 0, left: 'center', itemWidth: 10, itemHeight: 8, textStyle: axisLabel },
  series: [{
    type: 'pie', radius: ['50%', '72%'], center: ['50%', '44%'],
    data: dashboard.value.families.map(row => ({ name: row.label, value: row.sold })),
    itemStyle: { borderColor: '#fff', borderWidth: 3, borderRadius: 5 },
    label: { show: true, color: CHART.ink, fontSize: 11, formatter: '{b}\n{d}%' },
    labelLine: { length: 10, length2: 8, lineStyle: { color: '#c8c2b7' } },
    emphasis: { scaleSize: 8 },
  }],
}))

const categoryPerformanceOption = computed(() => {
  const rows = dashboard.value.categories.slice(0, 9).reverse()
  return {
    ...baseAnimation,
    color: [CHART.sage, CHART.terracotta],
    tooltip,
    legend: { top: 0, right: 0, itemWidth: 12, itemHeight: 8, textStyle: axisLabel },
    grid: { top: 42, right: 50, bottom: 22, left: 18, containLabel: true },
    xAxis: [
      { type: 'value', name: '件数', axisLabel, splitLine },
      { type: 'value', name: '%', min: 0, max: 100, axisLabel: { ...axisLabel, formatter: '{value}%' }, splitLine: { show: false } },
    ],
    yAxis: { type: 'category', data: rows.map(row => row.label), axisLabel: { ...axisLabel, width: 130, overflow: 'truncate' }, axisLine: { show: false }, axisTick: { show: false } },
    series: [
      { name: '售出件数', type: 'bar', data: rows.map(row => row.sold), barMaxWidth: 20, itemStyle: { borderRadius: [0, 6, 6, 0] } },
      { name: '销售率', type: 'line', xAxisIndex: 1, data: rows.map(row => row.sell_through), symbolSize: 7, lineStyle: { width: 2 } },
    ],
  }
})

const marketPerformanceOption = computed(() => {
  const rows = dashboard.value.markets.slice(0, 8).reverse()
  return {
    ...baseAnimation,
    color: [CHART.gold],
    tooltip: { ...tooltip, formatter: params => {
      const row = rows[params[0]?.dataIndex]
      return row ? `${row.label}<br/><b>${formatNumber(row.sold_per_event, 1)}</b> 件/场<br/>销售率 ${formatPercent(row.sell_through)}<br/>${row.exhibition_count} 场展会` : ''
    } },
    grid: { top: 18, right: 58, bottom: 24, left: 20, containLabel: true },
    xAxis: { type: 'value', axisLabel, splitLine },
    yAxis: { type: 'category', data: rows.map(row => row.label), axisLabel, axisLine: { show: false }, axisTick: { show: false } },
    series: [{
      type: 'bar', data: rows.map(row => row.sold_per_event), barMaxWidth: 26,
      itemStyle: { color: CHART.gold, borderRadius: [0, 7, 7, 0] },
      label: { show: true, position: 'right', color: CHART.ink, fontWeight: 700, formatter: '{c}' },
    }],
  }
})

const sizeDemandOption = computed(() => ({
  ...baseAnimation,
  color: [CHART.navy],
  tooltip,
  grid: { top: 18, right: 44, bottom: 26, left: 18, containLabel: true },
  xAxis: { type: 'value', axisLabel, splitLine },
  yAxis: { type: 'category', data: dashboard.value.sizes.map(row => row.label), axisLabel, axisLine: { show: false }, axisTick: { show: false } },
  series: [{
    type: 'bar', data: dashboard.value.sizes.map(row => row.sold), barMaxWidth: 22,
    itemStyle: { color: CHART.navy, borderRadius: [0, 6, 6, 0] },
    label: { show: true, position: 'right', color: CHART.ink, fontWeight: 700 },
  }],
}))

const collectionSalesOption = computed(() => {
  const rows = dashboard.value.collections.slice(0, 10).reverse()
  return {
    ...baseAnimation,
    color: [CHART.terracotta], tooltip,
    grid: { top: 18, right: 44, bottom: 26, left: 18, containLabel: true },
    xAxis: { type: 'value', axisLabel, splitLine },
    yAxis: { type: 'category', data: rows.map(row => row.label), axisLabel: { ...axisLabel, width: 125, overflow: 'truncate' }, axisLine: { show: false }, axisTick: { show: false } },
    series: [{
      type: 'bar', data: rows.map(row => row.sold), barMaxWidth: 22,
      itemStyle: { color: CHART.terracotta, borderRadius: [0, 6, 6, 0] },
      label: { show: true, position: 'right', color: CHART.ink, fontWeight: 700 },
    }],
  }
})

function donutOption(rows, colors) {
  return {
    ...baseAnimation,
    color: colors,
    tooltip: { trigger: 'item', formatter: '{b}<br/><b>{c}</b> 件 · {d}%' },
    legend: { type: 'scroll', bottom: 0, itemWidth: 10, itemHeight: 8, textStyle: axisLabel },
    series: [{
      type: 'pie', radius: ['48%', '70%'], center: ['50%', '43%'],
      data: rows.map(row => ({ name: row.label, value: row.sold })),
      label: { show: false }, itemStyle: { borderColor: '#fff', borderWidth: 3, borderRadius: 4 },
      emphasis: { label: { show: true, formatter: '{b}\n{d}%', fontWeight: 700, color: CHART.ink } },
    }],
  }
}
const materialOption = computed(() => donutOption(dashboard.value.materials, [CHART.sage, CHART.sand, CHART.gold, CHART.mist, CHART.navy]))
const genderOption = computed(() => donutOption(dashboard.value.genders, [CHART.terracotta, CHART.navy, CHART.gold, CHART.mist]))

const MetricDelta = defineComponent({
  props: { label: String, value: Number, suffix: String },
  setup(props) {
    return () => h('div', { class: 'comparison-metric' }, [
      h('span', props.label),
      props.value == null
        ? h('strong', '—')
        : h('strong', { class: props.value > 0 ? 'positive' : props.value < 0 ? 'negative' : '' }, `${props.value > 0 ? '+' : ''}${props.value}${props.suffix || ''}`),
    ])
  },
})

const TrendValue = defineComponent({
  props: { value: Number },
  setup(props) {
    return () => props.value == null
      ? h('span', { class: 'trend-value neutral' }, '—')
      : h('span', { class: ['trend-value', props.value > 0 ? 'positive' : props.value < 0 ? 'negative' : 'neutral'] }, `${props.value > 0 ? '↑ ' : props.value < 0 ? '↓ ' : ''}${Math.abs(props.value)}%`)
  },
})

const ChartCard = defineComponent({
  props: { title: String, subtitle: String },
  setup(props, { slots }) {
    return () => h('article', { class: 'chart-card' }, [
      h('div', { class: 'card-heading' }, [h('div', [h('strong', props.title), h('span', props.subtitle)])]),
      slots.default?.(),
    ])
  },
})

async function toggle() {
  isOpen.value = !isOpen.value
  if (isOpen.value && !hasData.value) await loadDashboard()
}

async function loadDashboard() {
  if (loading.value) return
  loading.value = true
  loadError.value = ''
  try {
    const response = await analyticsApi.dashboard(selectedExhibitionId.value)
    dashboard.value = response.data || emptyDashboard()
    generatedAt.value = response.generated_at || ''
  } catch (error) {
    loadError.value = error.message || '请求失败'
  } finally {
    loading.value = false
  }
}

function formatNumber(value, decimals = 0) {
  return new Intl.NumberFormat('en-AU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Number(value || 0))
}
function formatCurrency(value) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(Number(value || 0))
}
function formatPercent(value) {
  return value == null ? '—' : `${formatNumber(value, 1)}%`
}
function formatDateTime(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { timeZone: 'Australia/Melbourne', hour12: false })
}
function signalLabel(signal) {
  return { scale: '建议增加', rising: '趋势上升', steady: '保持', reduce: '建议减少', insufficient: '数据不足' }[signal] || '保持'
}
function reasonLabel(reason) {
  return {
    unclassified: '未分类', type_mismatch: '类型疑似错误', missing_product_match: '商品未匹配',
    sold_above_plan: '销量高于计划量', snapshot_mismatch: '快照数量不平', missing_price: '缺少价格',
  }[reason] || reason
}

onMounted(loadDashboard)
</script>

<style scoped>
.analytics-shell {
  --paper: #fbfaf7;
  --surface: #ffffff;
  --ink: #2f302d;
  --muted: #78766f;
  --line: #e8e2d8;
  --sand: #f2eadf;
  --navy: #334b5f;
  --terracotta: #b96d4b;
  --sage: #738b78;
  --gold: #c79a4a;
  margin-bottom: 22px;
  color: var(--ink);
}

button { font: inherit; }
.analytics-toggle {
  width: 100%; border: 1px solid #dfd5c7; border-radius: 16px; padding: 13px 16px;
  display: flex; align-items: center; justify-content: space-between; gap: 14px;
  background: linear-gradient(135deg, #f7f1e8 0%, #fff 55%, #edf1ed 100%);
  color: var(--ink); cursor: pointer; text-align: left;
  box-shadow: 0 5px 18px rgba(73, 62, 47, .07);
  transition: transform .22s ease, box-shadow .22s ease, border-color .22s ease;
}
.analytics-toggle:hover { transform: translateY(-1px); box-shadow: 0 9px 26px rgba(73, 62, 47, .1); border-color: #cfbda7; }
.toggle-leading, .toggle-trailing { display: flex; align-items: center; gap: 12px; }
.toggle-leading strong { display: block; font-size: 15px; letter-spacing: .01em; }
.toggle-leading small { display: block; margin-top: 2px; color: var(--muted); font-size: 12px; }
.toggle-icon { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 10px; background: var(--navy); color: #fff; }
.coverage-pill { padding: 5px 10px; border-radius: 999px; background: #e8f0e9; color: #4e6b55; font-size: 11px; font-weight: 700; }
.toggle-arrow { color: var(--muted); transition: transform .35s cubic-bezier(.2,.8,.2,1); }
.toggle-arrow.open { transform: rotate(180deg); }

.dashboard-expand-enter-active, .dashboard-expand-leave-active { transition: opacity .3s ease, transform .36s cubic-bezier(.2,.8,.2,1); transform-origin: top; }
.dashboard-expand-enter-from, .dashboard-expand-leave-to { opacity: 0; transform: translateY(-10px) scaleY(.98); }
.dashboard-panel {
  margin-top: 12px; background: var(--paper); border: 1px solid var(--line); border-radius: 20px;
  box-shadow: 0 15px 46px rgba(62, 53, 43, .09); overflow: hidden;
}
.dashboard-header {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 24px;
  padding: 24px 26px 20px; background: linear-gradient(125deg, #f4ecdf 0%, #fbfaf7 50%, #edf2ee 100%); border-bottom: 1px solid var(--line);
}
.eyebrow { margin: 0 0 6px; color: var(--terracotta); font-size: 10px; font-weight: 800; letter-spacing: .16em; }
.dashboard-header h2, .section-heading h3 { margin: 0; color: var(--ink); letter-spacing: -.025em; }
.dashboard-header h2 { font-size: clamp(20px, 2.1vw, 28px); }
.header-copy, .section-heading p { margin: 7px 0 0; color: var(--muted); font-size: 12px; line-height: 1.65; }
.header-controls { min-width: 240px; display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: end; }
.header-controls label { grid-column: 1 / -1; color: var(--muted); font-size: 11px; font-weight: 700; letter-spacing: .04em; }
.scope-select { width: 100%; }
.refresh-button, .manage-rules-button {
  height: 32px; padding: 0 12px; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  border: 1px solid #d7ccbe; border-radius: 9px; background: rgba(255,255,255,.82); color: var(--ink); cursor: pointer;
  transition: background .18s ease, border-color .18s ease, transform .18s ease;
}
.refresh-button:hover, .manage-rules-button:hover { background: #fff; border-color: #b9a791; transform: translateY(-1px); }
.refresh-button:disabled { opacity: .55; cursor: wait; transform: none; }
.spin { animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.dashboard-loading { padding: 22px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.skeleton-card { height: 116px; padding: 18px; border-radius: 14px; background: #fff; border: 1px solid var(--line); }
.skeleton-card span { display: block; height: 10px; margin-bottom: 12px; border-radius: 5px; background: linear-gradient(90deg, #eee9e1, #faf8f4, #eee9e1); background-size: 200% 100%; animation: shimmer 1.2s infinite; }
.skeleton-card span:nth-child(2) { width: 58%; height: 24px; }.skeleton-card span:nth-child(3) { width: 76%; }
@keyframes shimmer { to { background-position: -200% 0; } }
.state-card { margin: 22px; min-height: 130px; display: flex; align-items: center; justify-content: center; gap: 14px; border: 1px dashed #d8d0c5; border-radius: 14px; background: #fff; color: var(--muted); }
.state-card > .el-icon { font-size: 28px; color: var(--navy); }.state-card strong { display: block; color: var(--ink); }.state-card p { margin: 4px 0 0; font-size: 12px; }
.state-card button { border: 0; border-radius: 8px; padding: 8px 12px; background: var(--navy); color: #fff; cursor: pointer; }
.error-state > .el-icon { color: var(--terracotta); }
.inline-warning { margin: 14px 24px 0; padding: 9px 12px; display: flex; align-items: center; gap: 7px; border-radius: 9px; background: #fff3e9; color: #8e543b; font-size: 12px; }
.eligibility-warning { background: #f6f1e8; color: #6f6252; }

.kpi-grid { padding: 20px 24px 12px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.kpi-card { min-height: 112px; padding: 16px 17px; display: flex; flex-direction: column; justify-content: center; border: 1px solid var(--line); border-radius: 15px; background: #fff; box-shadow: 0 5px 16px rgba(62,53,43,.04); }
.kpi-card.primary { background: linear-gradient(145deg, var(--navy), #46647a); border-color: transparent; color: #fff; }
.kpi-card.quality { background: linear-gradient(145deg, #edf4ee, #fff); border-color: #d7e3d8; }
.kpi-label { color: var(--muted); font-size: 11px; font-weight: 700; letter-spacing: .03em; }
.kpi-card.primary .kpi-label, .kpi-card.primary small { color: rgba(255,255,255,.72); }
.kpi-card > strong { margin: 5px 0 4px; font-size: clamp(24px, 2.5vw, 34px); line-height: 1; letter-spacing: -.035em; }
.kpi-card small { color: var(--muted); font-size: 10.5px; line-height: 1.4; }

.comparison-strip { margin: 0 24px 18px; padding: 12px 15px; display: grid; grid-template-columns: minmax(190px, 1.4fr) repeat(3, minmax(90px, .6fr)) minmax(120px, .8fr); gap: 12px; align-items: center; background: #f0ece5; border: 1px solid #e1d9cd; border-radius: 13px; }
.comparison-heading span, .comparison-metric span, .comparison-best span { display: block; color: var(--muted); font-size: 10px; }
.comparison-heading strong, .comparison-best strong { display: block; margin-top: 2px; font-size: 12px; }
.comparison-heading small { color: #96928a; font-size: 10px; }
.comparison-metric, .comparison-best { padding-left: 12px; border-left: 1px solid #d9d0c4; }
.comparison-metric strong { display: block; margin-top: 2px; font-size: 16px; }.positive { color: #3f7a58 !important; }.negative { color: #b65d49 !important; }

.dashboard-tabs { padding: 0 24px; display: flex; gap: 5px; border-bottom: 1px solid var(--line); overflow-x: auto; scrollbar-width: none; }
.dashboard-tabs::-webkit-scrollbar { display: none; }
.dashboard-tabs button { position: relative; min-height: 44px; padding: 0 14px; display: flex; align-items: center; gap: 7px; border: 0; background: transparent; color: var(--muted); cursor: pointer; white-space: nowrap; }
.dashboard-tabs button::after { content: ''; position: absolute; left: 12px; right: 12px; bottom: -1px; height: 2px; border-radius: 2px; background: transparent; transform: scaleX(.3); transition: transform .2s ease, background .2s ease; }
.dashboard-tabs button:hover, .dashboard-tabs button.active { color: var(--navy); }
.dashboard-tabs button.active { font-weight: 700; }.dashboard-tabs button.active::after { background: var(--terracotta); transform: scaleX(1); }
.issue-count { min-width: 18px; height: 18px; padding: 0 5px; display: inline-grid; place-items: center; border-radius: 999px; background: #f1dfd5; color: #914e37; font-size: 10px; }

.tab-content { padding: 22px 24px 24px; }
.tab-fade-enter-active, .tab-fade-leave-active { transition: opacity .2s ease, transform .24s ease; }.tab-fade-enter-from { opacity: 0; transform: translateY(7px); }.tab-fade-leave-to { opacity: 0; transform: translateY(-5px); }
.section-heading { margin-bottom: 16px; display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; }
.section-heading h3 { font-size: 19px; }.section-heading > span { padding: 5px 9px; border-radius: 999px; background: #efe9df; color: var(--muted); font-size: 10px; }

.insight-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
.insight-card { min-height: 114px; padding: 15px; display: flex; gap: 12px; border-radius: 14px; border: 1px solid var(--line); background: #fff; }
.insight-card.gold { background: linear-gradient(145deg, #fffaf0, #fff); }.insight-card.sage { background: linear-gradient(145deg, #f0f5f0, #fff); }.insight-card.blue { background: linear-gradient(145deg, #eef3f6, #fff); }
.insight-icon { width: 32px; height: 32px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 9px; background: var(--navy); color: #fff; }
.insight-card.gold .insight-icon { background: var(--gold); }.insight-card.sage .insight-icon { background: var(--sage); }
.insight-card small { display: block; color: var(--muted); font-size: 9px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
.insight-card strong { display: block; margin: 3px 0 4px; font-size: 14px; line-height: 1.3; }.insight-card p { margin: 0; color: var(--muted); font-size: 11px; line-height: 1.5; }

.chart-grid { display: grid; gap: 14px; margin-bottom: 14px; }.chart-grid.wide-left { grid-template-columns: minmax(0, 1.65fr) minmax(280px, .85fr); }.chart-grid.equal { grid-template-columns: repeat(2, minmax(0, 1fr)); }.chart-grid.thirds { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.chart-card, .table-card { min-width: 0; padding: 16px; border: 1px solid var(--line); border-radius: 15px; background: #fff; box-shadow: 0 6px 18px rgba(62,53,43,.035); transition: transform .2s ease, box-shadow .2s ease; }
.chart-card:hover, .table-card:hover { transform: translateY(-1px); box-shadow: 0 10px 25px rgba(62,53,43,.07); }
.card-heading { margin-bottom: 10px; display: flex; justify-content: space-between; gap: 12px; align-items: center; }.card-heading strong { display: block; font-size: 13px; }.card-heading span { display: block; margin-top: 3px; color: var(--muted); font-size: 10.5px; line-height: 1.45; }.card-heading > small { color: var(--muted); font-size: 10px; white-space: nowrap; }
.chart { width: 100%; height: 320px; }.chart-large { height: 350px; }.small-chart { height: 270px; }

.demand-heading { align-items: flex-start; }.demand-heading > div:first-child { max-width: 690px; }
.signal-filter { display: flex; gap: 5px; padding: 4px; border-radius: 10px; background: #eee8df; }
.signal-filter button { padding: 6px 9px; border: 0; border-radius: 7px; background: transparent; color: var(--muted); font-size: 10px; cursor: pointer; white-space: nowrap; }.signal-filter button.active { background: #fff; color: var(--ink); font-weight: 700; box-shadow: 0 2px 7px rgba(62,53,43,.09); }
.demand-layout { display: grid; grid-template-columns: minmax(0, 1fr) 245px; gap: 14px; margin-bottom: 14px; }
.demand-table-card { padding: 0; overflow: hidden; }.demand-table-card .card-heading, .quality-table-card .card-heading { padding: 15px 16px 4px; }
.table-scroll { overflow: auto; }
.demand-table-card .table-scroll { max-height: 560px; }
.quality-table-card .table-scroll { max-height: 500px; }
.analytics-table { width: 100%; border-collapse: collapse; font-size: 11px; }.analytics-table th { padding: 9px 11px; background: #f4f0ea; color: var(--muted); font-size: 9.5px; text-align: left; text-transform: uppercase; letter-spacing: .045em; white-space: nowrap; }.analytics-table td { padding: 10px 11px; border-top: 1px solid #f0ece6; color: #55554f; vertical-align: middle; }.analytics-table tbody tr { transition: background .15s ease; }.analytics-table tbody tr:hover { background: #fcfaf6; }.analytics-table td strong { display: block; max-width: 270px; color: var(--ink); font-size: 11px; }.analytics-table td small { display: block; margin-top: 2px; color: #929087; font-size: 9.5px; }.analytics-table .numeric { text-align: right; white-space: nowrap; }.analytics-table .emph { color: var(--navy); font-weight: 800; }
.demand-table { min-width: 780px; }
.quality-table-card .analytics-table { min-width: 650px; }
.analytics-table th { position: sticky; top: 0; z-index: 1; }
.soft-tag { display: inline-block; padding: 3px 7px; border-radius: 999px; background: #ede9e2; color: #625e57; font-size: 9.5px; white-space: nowrap; }
.signal-badge, .reason-tag { display: inline-block; padding: 3px 7px; border-radius: 999px; font-size: 9px; font-weight: 700; white-space: nowrap; }.signal-badge.scale, .signal-badge.rising { background: #e4f0e7; color: #3e7452; }.signal-badge.reduce { background: #f3e0d8; color: #9a513b; }.signal-badge.steady { background: #ece9e3; color: #6f6b63; }.signal-badge.insufficient { background: #e7eaed; color: #626a72; }
.trend-value { font-weight: 700; }.trend-value.neutral { color: var(--muted); }
.planning-note { padding: 18px; border-radius: 15px; background: linear-gradient(150deg, var(--navy), #456377); color: #fff; }.note-icon { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 10px; background: rgba(255,255,255,.13); }.planning-note > strong { display: block; margin: 15px 0 7px; }.planning-note p, .planning-note li { color: rgba(255,255,255,.76); font-size: 10.5px; line-height: 1.65; }.planning-note ul { padding-left: 16px; margin: 12px 0 0; }

.market-summary-card { height: fit-content; }.format-list article { padding: 12px 0; display: grid; grid-template-columns: 1.2fr .8fr .8fr; gap: 8px; border-top: 1px solid #eee9e1; }.format-list article:first-child { border-top: 0; }.format-list div { display: flex; flex-direction: column; }.format-list div:not(:first-child) { text-align: right; }.format-list strong { color: var(--ink); font-size: 13px; }.format-list small { margin-top: 2px; color: var(--muted); font-size: 9.5px; }
.ranking-list { padding: 0; margin: 0; list-style: none; }.ranking-list li { padding: 9px 0; display: grid; grid-template-columns: 25px 1fr auto; gap: 8px; align-items: center; border-top: 1px solid #eee9e1; }.ranking-list li:first-child { border-top: 0; }.rank { width: 22px; height: 22px; display: grid; place-items: center; border-radius: 7px; background: #eee9e2; color: var(--muted); font-size: 9px; font-weight: 800; }.ranking-list li:first-child .rank { background: var(--gold); color: #fff; }.ranking-list strong { display: block; font-size: 11px; }.ranking-list small { display: block; margin-top: 1px; color: var(--muted); font-size: 9px; }.ranking-list b { color: var(--navy); font-size: 13px; }

.manage-rules-button { flex: 0 0 auto; }
.quality-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
.quality-card { min-height: 102px; padding: 15px; display: flex; align-items: flex-start; gap: 11px; border: 1px solid var(--line); border-radius: 14px; background: #fff; }.quality-card > span { width: 30px; height: 30px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 9px; background: #eee9e2; color: var(--navy); }.quality-card.good > span { background: #e4f0e7; color: #4e7a5d; }.quality-card.warning > span { background: #f5e3da; color: #a65f46; }.quality-card.recovered > span { background: #e6edf2; color: var(--navy); }.quality-card small { display: block; color: var(--muted); font-size: 9.5px; }.quality-card strong { display: block; margin: 3px 0; color: var(--ink); font-size: 22px; }.quality-card p { margin: 0; color: var(--muted); font-size: 9.5px; line-height: 1.4; }
.classification-flow { margin-bottom: 14px; padding: 16px; display: grid; grid-template-columns: 1fr 36px 1fr 36px 1fr; gap: 10px; align-items: center; border: 1px solid var(--line); border-radius: 15px; background: #fff; }.classification-flow div { min-height: 84px; position: relative; padding-left: 34px; }.classification-flow div > span { position: absolute; left: 0; top: 0; width: 24px; height: 24px; display: grid; place-items: center; border-radius: 8px; background: var(--navy); color: #fff; font-size: 10px; font-weight: 800; }.classification-flow strong { font-size: 11px; }.classification-flow p { margin: 5px 0 0; color: var(--muted); font-size: 9.5px; line-height: 1.5; }.classification-flow i { height: 1px; background: #d8d0c4; position: relative; }.classification-flow i::after { content: ''; position: absolute; right: 0; top: -3px; width: 6px; height: 6px; border-top: 1px solid #b7ac9f; border-right: 1px solid #b7ac9f; transform: rotate(45deg); }
.quality-table-card { padding: 0; overflow: hidden; }.reason-tag { margin: 2px 3px 2px 0; background: #eee9e2; color: #6b665e; }.reason-tag.unclassified, .reason-tag.missing_product_match { background: #f5e3da; color: #9a513b; }.reason-tag.type_mismatch { background: #fff0cf; color: #8b6a24; }.all-clear { padding: 34px 16px; display: flex; justify-content: center; align-items: center; gap: 7px; color: #4e7a5d; font-size: 12px; }
.dashboard-footer { padding: 11px 24px; display: flex; justify-content: space-between; gap: 16px; border-top: 1px solid var(--line); background: #f3efe8; color: var(--muted); font-size: 9.5px; }

@media (max-width: 1100px) {
  .kpi-grid, .quality-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .chart-grid.wide-left, .chart-grid.thirds { grid-template-columns: 1fr 1fr; }.chart-grid.thirds > :last-child { grid-column: 1 / -1; }
  .comparison-strip { grid-template-columns: 1.4fr repeat(2, .7fr); }.comparison-strip > :nth-child(4), .comparison-strip > :nth-child(5) { display: none; }
  .demand-layout { grid-template-columns: 1fr; }.planning-note { display: grid; grid-template-columns: auto 1fr; column-gap: 12px; }.planning-note > strong { margin: 0; align-self: center; }.planning-note p, .planning-note ul { grid-column: 1 / -1; }
}

@media (max-width: 760px) {
  .analytics-toggle { border-radius: 13px; }.toggle-leading small, .coverage-pill { display: none; }
  .dashboard-panel { border-radius: 16px; }.dashboard-header { padding: 19px 16px; flex-direction: column; }.header-controls { width: 100%; min-width: 0; }
  .kpi-grid { padding: 15px 14px 8px; gap: 8px; }.kpi-card { min-height: 98px; padding: 13px; }.kpi-card > strong { font-size: 25px; }
  .comparison-strip { margin: 0 14px 14px; grid-template-columns: 1fr 1fr; }.comparison-heading { grid-column: 1 / -1; }.comparison-metric { padding: 8px 0 0; border-left: 0; border-top: 1px solid #d9d0c4; }.comparison-strip > :nth-child(3) { display: block; }
  .dashboard-tabs { padding: 0 10px; }.dashboard-tabs button { padding: 0 10px; }.dashboard-tabs .el-icon { display: none; }
  .tab-content { padding: 18px 14px; }.section-heading { align-items: flex-start; flex-direction: column; }.section-heading > span { align-self: flex-start; }
  .insight-grid, .chart-grid.equal, .chart-grid.wide-left, .chart-grid.thirds { grid-template-columns: 1fr; }.chart-grid.thirds > :last-child { grid-column: auto; }
  .insight-card { min-height: auto; }.chart, .chart-large { height: 300px; }.small-chart { height: 260px; }
  .demand-heading { gap: 12px; }.signal-filter { width: 100%; overflow-x: auto; }.signal-filter button { flex: 0 0 auto; }
  .quality-grid { grid-template-columns: 1fr 1fr; gap: 8px; }.quality-card { min-height: 88px; padding: 12px; }.quality-card > span { display: none; }
  .classification-flow { grid-template-columns: 1fr; }.classification-flow i { width: 1px; height: 18px; margin-left: 12px; }.classification-flow i::after { right: -3px; top: auto; bottom: 0; transform: rotate(135deg); }
  .dashboard-footer { padding: 10px 14px; flex-direction: column; gap: 4px; }
}

@media (max-width: 480px) {
  .kpi-grid, .quality-grid { grid-template-columns: 1fr 1fr; }.kpi-card small { display: none; }.kpi-card { min-height: 82px; }.kpi-card > strong { font-size: 22px; }
  .dashboard-tabs button { font-size: 11px; }.issue-count { display: none; }
  .analytics-table th, .analytics-table td { padding: 8px 9px; }.chart { height: 280px; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
}
</style>
