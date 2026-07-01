<template>
  <div class="warehouse-map">
    <div class="map-header">
      <div>
        <h1 class="page-title">🗺️ 仓库地图</h1>
        <p class="page-subtitle">点击货架查看货位详情 · 高亮显示拣货位置</p>
      </div>
      <div class="header-actions">
        <el-select v-model="activeLayoutId" placeholder="选择仓库" style="width:200px" @change="onLayoutChange">
          <el-option v-for="l in layouts" :key="l.id" :label="l.name" :value="l.id" />
        </el-select>
        <el-button v-if="authStore.isAdmin" type="primary" plain @click="showCreateDialog = true">
          <el-icon><Plus /></el-icon> 新建仓库
        </el-button>
        <el-button v-if="authStore.isAdmin && activeLayoutId" @click="$router.push(`/map/builder?id=${activeLayoutId}`)">
          <el-icon><Edit /></el-icon> 编辑布局
        </el-button>
        <el-button
          v-if="authStore.isAdmin && activeLayoutId && layouts.length > 1"
          type="danger" plain
          @click="confirmDelete"
        >
          <el-icon><Delete /></el-icon> 删除仓库
        </el-button>
      </div>
    </div>

    <!-- 图例 -->
    <div class="legend">
      <div class="legend-item" v-for="item in legend" :key="item.label">
        <div class="legend-dot" :style="{ background: item.color }"></div>
        <span>{{ item.label }}</span>
      </div>
    </div>

    <!-- SVG 地图画布 -->
    <div class="map-canvas-wrapper" v-loading="loading">
      <!-- 缩放控件 -->
      <div v-if="layout && regions.length > 0" class="zoom-toolbar">
        <el-button-group size="small">
          <el-button @click="zoomIn">+</el-button>
          <el-button @click="zoomOut">-</el-button>
          <el-button @click="resetZoom">⊡</el-button>
        </el-button-group>
        <span class="zoom-label">{{ Math.round(scale * 100) }}%</span>
      </div>
      <div v-if="layout && regions.length > 0" class="map-viewport" ref="mapViewport" @wheel.prevent="handleWheel">
        <div class="map-transform" :style="{ transform: `scale(${scale})`, transformOrigin: 'top center' }">
        <svg
          class="map-svg"
          :width="svgWidth"
          :height="svgHeight"
          :viewBox="`0 0 ${svgWidth} ${svgHeight}`"
        >
          <defs>
            <pattern id="map-grid-pat" :width="CELL_SIZE" :height="CELL_SIZE" patternUnits="userSpaceOnUse">
              <rect :width="CELL_SIZE" :height="CELL_SIZE" fill="none" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="3,3"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="#f8fafc" />
          <rect width="100%" height="100%" fill="url(#map-grid-pat)" />

          <g v-for="region in regions" :key="region.id">
            <path
              :d="buildOutlinePath(region)"
              :fill="getRegionFill(region)"
              fill-opacity="0.88"
              :stroke="getRegionStroke(region)"
              stroke-width="1.5"
              class="region-shape"
              :class="{ clickable: region.type === 'shelf', highlighted: isHighlighted(region) }"
              @click="region.type === 'shelf' && openLocationPanel(region)"
            />
            <template v-if="region.type === 'shelf'">
              <g v-for="(cell, idx) in getRegionCells(region)" :key="`${cell.col}-${cell.row}`"
                 @click="openLocationPanel(region)" style="cursor:pointer">
                <rect
                  :x="cell.col * CELL_SIZE + 1.5"
                  :y="cell.row * CELL_SIZE + 1.5"
                  :width="CELL_SIZE - 3"
                  :height="CELL_SIZE - 3"
                  fill="none"
                  stroke="rgba(255,255,255,0.35)"
                  stroke-width="1"
                  rx="4"
                />
                <text
                  :x="cell.col * CELL_SIZE + CELL_SIZE / 2"
                  :y="cell.row * CELL_SIZE + CELL_SIZE * 0.55"
                  text-anchor="middle"
                  dominant-baseline="middle"
                  font-size="11"
                  font-weight="700"
                  fill="white"
                  pointer-events="none"
                >{{ getSlotCode(region, idx) }}</text>
                <text
                  v-if="(region.levels||1) > 1"
                  :x="cell.col * CELL_SIZE + CELL_SIZE - 4"
                  :y="cell.row * CELL_SIZE + 10"
                  text-anchor="end"
                  font-size="9"
                  fill="rgba(255,255,255,0.8)"
                  pointer-events="none"
                >×{{ region.levels }}</text>
                <circle
                  v-if="hasStockByCode(region, idx)"
                  :cx="cell.col * CELL_SIZE + 10"
                  :cy="cell.row * CELL_SIZE + CELL_SIZE - 10"
                  r="4"
                  fill="white"
                  opacity="0.8"
                  pointer-events="none"
                />
              </g>
            </template>
            <template v-if="region.type !== 'shelf'">
              <text
                :x="getRegionCenterX(region)"
                :y="getRegionCenterY(region)"
                text-anchor="middle"
                dominant-baseline="middle"
                :font-size="region.type === 'pillar' ? 14 : 20"
                pointer-events="none"
              >{{ typeConfig[region.type]?.icon }}</text>
            </template>
          </g>
        </svg>
        </div>
      </div>

      <el-empty v-if="!loading && (!layout || regions.length === 0)" description="暂无仓库布局，请先在构建器中创建" :image-size="80">
        <el-button type="primary" @click="$router.push('/map/builder')">前往构建器</el-button>
      </el-empty>
    </div>

    <!-- ── 货架侧边栏 ── -->
    <el-drawer
      v-model="showPanel"
      :title="selectedLocation ? selectedLocation.code : (panelRegion?.code ? `货架 ${panelRegion.code}` : '货位详情')"
      direction="rtl"
      size="420px"
      :before-close="handleDrawerClose"
    >
      <!-- 货架列表视图 -->
      <div v-if="!selectedLocation && panelRegion" class="location-panel">
        <div class="panel-section">
          <div class="section-title">货架信息</div>
          <div class="info-grid">
            <div class="info-item"><span class="info-label">编码前缀</span><el-tag>{{ panelRegion.code || '-' }}</el-tag></div>
            <div class="info-item"><span class="info-label">格子数</span><span>{{ getRegionCells(panelRegion).length }}</span></div>
            <div class="info-item"><span class="info-label">层数</span><span>{{ panelRegion.levels || 1 }} 层</span></div>
            <div class="info-item"><span class="info-label">货位总数</span><span>{{ getRegionCells(panelRegion).length * (panelRegion.levels || 1) }} 个</span></div>
          </div>
        </div>

        <div class="panel-section">
          <div class="section-title">货位列表</div>
          <div v-loading="locationsLoading" class="locations-list">
            <div v-for="loc in panelLocations" :key="loc.id" class="location-row"
              :class="{
                highlighted: highlightedLocationIds.has(loc.id),
                'alert-empty': loc.stock_alert === 'empty',
                'alert-low': loc.stock_alert === 'low',
              }"
              @click="openLocationDetail(loc)">
              <div class="loc-left">
                <div class="loc-code">{{ loc.code }}</div>
                <div v-if="loc.top_items && loc.top_items.length > 0" class="loc-items">
                  <span v-for="item in loc.top_items.slice(0,2)" :key="item.variant_id" class="loc-item-tag">
                    {{ item.product_title?.slice(0,12) }}
                  </span>
                </div>
              </div>
              <div class="loc-right">
                <el-tag v-if="loc.stock_alert === 'empty'" size="small" type="danger">空</el-tag>
                <el-tag v-else-if="loc.stock_alert === 'low'" size="small" type="warning">⚠ {{ loc.total_qty }}</el-tag>
                <el-tag v-else-if="loc.total_qty > 0" size="small" type="success">{{ loc.total_qty }} 件</el-tag>
                <el-tag v-else size="small" type="info">空</el-tag>
                <el-icon class="loc-arrow"><ArrowRight /></el-icon>
              </div>
            </div>
            <el-empty v-if="!locationsLoading && panelLocations.length === 0" description="暂无货位" :image-size="40" />
          </div>
        </div>

        <div class="panel-section">
          <el-button style="width:100%" @click="$router.push('/locations')">
            管理所有货位
          </el-button>
        </div>
      </div>

      <!-- 货位详情视图（嵌套） -->
      <div v-if="selectedLocation" class="loc-detail-panel" v-loading="locDetailLoading">
        <!-- 返回按钮 -->
        <div class="loc-detail-back" @click="selectedLocation = null">
          <el-icon><ArrowLeft /></el-icon>
          <span>返回货架 {{ panelRegion?.code }}</span>
        </div>

        <!-- 预警横幅 -->
        <el-alert
          v-if="locDetail?.stock_alert === 'empty'"
          title="⚠️ 此货位已空"
          type="error"
          :description="locDetailTransfer.length > 0 ? `备库中有 ${locDetailTransfer.length} 个 SKU 可调拨` : '请通过补货流程补货'"
          show-icon :closable="false"
          style="margin-bottom:12px"
        />
        <el-alert
          v-else-if="locDetail?.stock_alert === 'low'"
          :title="`⚠️ 库存不足（${locDetail.total_qty} 件，阈值 ${locDetail.low_stock_threshold || 10} 件）`"
          type="warning"
          show-icon :closable="false"
          style="margin-bottom:12px"
        />

        <!-- 库存列表 -->
        <div class="panel-section">
          <div class="section-title-row">
            <span class="section-title">当前库存</span>
            <el-tag :type="locDetail?.stock_alert === 'ok' ? 'success' : locDetail?.stock_alert === 'low' ? 'warning' : 'danger'" size="small">
              {{ locDetail?.total_qty || 0 }} 件
            </el-tag>
          </div>
          <div v-if="locDetail?.inventory?.length > 0" class="inv-list">
            <div v-for="inv in locDetail.inventory" :key="inv.id" class="inv-item">
              <img v-if="inv.image_url" :src="inv.image_url" class="inv-thumb" />
              <div v-else class="inv-thumb-placeholder">📦</div>
              <div class="inv-info">
                <div class="inv-name">{{ inv.product_title }}</div>
                <div class="inv-variant">{{ inv.variant_title }}</div>
                <div class="inv-sku">SKU: {{ inv.sku }}</div>
              </div>
              <div class="inv-qty-block">
                <el-tag size="small" :type="inv.stock_type === 'exhibition' ? 'warning' : inv.stock_type === 'retail_storage' ? 'info' : 'primary'">
                  {{ stockTypeLabel(inv.stock_type) }}
                </el-tag>
                <div class="inv-qty">{{ inv.quantity }} 件</div>
              </div>
            </div>
          </div>
          <el-empty v-else-if="!locDetailLoading" description="此货位暂无库存" :image-size="40" />
        </div>

        <!-- 可调拨 -->
        <div v-if="locDetailTransfer.length > 0" class="panel-section">
          <div class="section-title-row">
            <span class="section-title">🔄 可调拨（备库→上架）</span>
            <el-tag type="success" size="small">{{ locDetailTransfer.length }} 个 SKU</el-tag>
          </div>
          <div v-for="item in locDetailTransfer" :key="item.shopify_variant_id" class="transfer-mini-item">
            <div class="transfer-mini-info">
              <div class="transfer-mini-name">{{ item.product_title }}</div>
              <div class="transfer-mini-sub">{{ item.variant_title }} · 备库 {{ item.storage_qty }} 件 · 来自 {{ item.from_location_code }}</div>
            </div>
            <el-button type="success" size="small" plain @click="quickTransfer(item)">调拨</el-button>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="panel-section loc-detail-actions">
          <el-button type="primary" style="width:100%" @click="$router.push(`/locations/${selectedLocation.id}`)">
            <el-icon><ArrowRight /></el-icon> 查看完整详情
          </el-button>
        </div>
      </div>
    </el-drawer>

    <!-- 新建仓库对话框 -->
    <el-dialog v-model="showCreateDialog" title="新建仓库" width="420px" :close-on-click-modal="false">
      <el-form :model="createForm" label-width="80px">
        <el-form-item label="仓库名称" required>
          <el-input v-model="createForm.name" placeholder="如：主仓库、B区仓库" maxlength="50" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="createForm.description" type="textarea" :rows="2" placeholder="可选" />
        </el-form-item>
        <el-form-item label="画布列数">
          <el-input-number v-model="createForm.grid_cols" :min="10" :max="60" />
        </el-form-item>
        <el-form-item label="画布行数">
          <el-input-number v-model="createForm.grid_rows" :min="8" :max="40" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="createLayout">创建并进入构建器</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessageBox, ElMessage } from 'element-plus'
import { layoutApi, locationApi } from '@/api/index.js'
import { useAuthStore } from '@/stores/auth'
import { Edit, ArrowRight, ArrowLeft, Plus, Delete } from '@element-plus/icons-vue'

const authStore = useAuthStore()
const router = useRouter()

const CELL_SIZE = 64

const typeConfig = {
  shelf:       { label: '货架',   icon: '📦', color: '#3b82f6', stroke: '#1d4ed8' },
  wall:        { label: '墙壁',   icon: '🧱', color: '#6b7280', stroke: '#374151' },
  door:        { label: '出入口', icon: '🚪', color: '#f59e0b', stroke: '#d97706' },
  aisle:       { label: '通道',   icon: '↔',  color: '#d1fae5', stroke: '#6ee7b7' },
  workbench:   { label: '工作台', icon: '🖥',  color: '#8b5cf6', stroke: '#6d28d9' },
  pillar:      { label: '柱子',   icon: '⬛',  color: '#374151', stroke: '#111827' },
  shelf_h:     { label: '货架',   icon: '📦', color: '#3b82f6', stroke: '#1d4ed8' },
  shelf_v:     { label: '货架',   icon: '📦', color: '#3b82f6', stroke: '#1d4ed8' },
  entrance:    { label: '出入口', icon: '🚪', color: '#f59e0b', stroke: '#d97706' },
  workstation: { label: '工作台', icon: '🖥',  color: '#8b5cf6', stroke: '#6d28d9' },
}

const legend = [
  { label: '货架（有货）',     color: '#3b82f6' },
  { label: '货架（空）',       color: '#93c5fd' },
  { label: '高亮（拣货目标）', color: '#ef4444' },
  { label: '通道',             color: '#d1fae5' },
  { label: '出入口',           color: '#f59e0b' },
  { label: '墙壁',             color: '#6b7280' },
]

// ── State ──────────────────────────────────────────────────────────────────
const layouts = ref([])
const activeLayoutId = ref(null)
const layout = ref(null)
const loading = ref(false)

// ── 缩放相关 ──────────────────────────────────────────────────────────────────
const mapViewport = ref(null)
const scale = ref(1)

function zoomIn() { scale.value = Math.min(scale.value + 0.15, 3) }
function zoomOut() { scale.value = Math.max(scale.value - 0.15, 0.3) }
function resetZoom() { fitMapToViewport() }
function handleWheel(e) {
  if (e.deltaY < 0) zoomIn()
  else zoomOut()
}
function fitMapToViewport() {
  if (!layout.value || !mapViewport.value) return
  const vp = mapViewport.value
  const mapW = (layout.value.grid_cols || 20) * CELL_SIZE
  const mapH = (layout.value.grid_rows || 15) * CELL_SIZE
  const scaleX = vp.clientWidth / mapW
  const scaleY = vp.clientHeight / mapH
  scale.value = Math.min(scaleX, scaleY, 1) * 0.92
}

const showPanel = ref(false)
const panelRegion = ref(null)
const panelLocations = ref([])
const locationsLoading = ref(false)
const locationStockMap = ref({})
const highlightedLocationIds = ref(new Set())

// 货位详情（嵌套）
const selectedLocation = ref(null)
const locDetail = ref(null)
const locDetailLoading = ref(false)
const locDetailTransfer = ref([])

const showCreateDialog = ref(false)
const creating = ref(false)
const createForm = ref({ name: '', description: '', grid_cols: 20, grid_rows: 15 })

// ── Computed ───────────────────────────────────────────────────────────────
const regions = computed(() => {
  if (!layout.value) return []
  const raw = layout.value.layout_json
  if (!raw) return []
  try {
    let parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (typeof parsed === 'string') parsed = JSON.parse(parsed)
    if (!Array.isArray(parsed)) return []
    return parsed.map(region => {
      if (Array.isArray(region.cells) && region.cells.length > 0 && typeof region.cells[0] === 'string') {
        return { ...region, cells: new Set(region.cells) }
      }
      if (region.col !== undefined && region.colSpan !== undefined) {
        const cells = new Set()
        for (let r = region.row; r < region.row + (region.rowSpan || 1); r++) {
          for (let c = region.col; c < region.col + (region.colSpan || 1); c++) {
            cells.add(`${c},${r}`)
          }
        }
        return { ...region, cells }
      }
      return { ...region, cells: new Set() }
    })
  } catch { return [] }
})

const svgWidth = computed(() => (layout.value?.grid_cols || 20) * CELL_SIZE)
const svgHeight = computed(() => (layout.value?.grid_rows || 15) * CELL_SIZE)

// ── Cell helpers ───────────────────────────────────────────────────────────
function getRegionCells(region) {
  return [...region.cells].map(k => {
    const [col, row] = k.split(',').map(Number)
    return { col, row }
  }).sort((a, b) => a.row !== b.row ? a.row - b.row : a.col - b.col)
}

function getSlotCode(region, idx) {
  const prefix = (region.code || 'A').toUpperCase()
  return `${prefix}-${String(idx + 1).padStart(2, '0')}`
}

function getRegionCenterX(region) {
  const cells = getRegionCells(region)
  if (!cells.length) return 0
  const mid = cells[Math.floor(cells.length / 2)]
  return (mid.col + 0.5) * CELL_SIZE
}

function getRegionCenterY(region) {
  const cells = getRegionCells(region)
  if (!cells.length) return 0
  const mid = cells[Math.floor(cells.length / 2)]
  return (mid.row + 0.5) * CELL_SIZE
}

// ── SVG outline path ───────────────────────────────────────────────────────
function buildOutlinePath(region) {
  const cs = CELL_SIZE
  const cellSet = region.cells
  if (!cellSet.size) return ''
  const edges = []
  for (const key of cellSet) {
    const [c, r] = key.split(',').map(Number)
    if (!cellSet.has(`${c},${r-1}`)) edges.push([c*cs, r*cs, (c+1)*cs, r*cs])
    if (!cellSet.has(`${c+1},${r}`)) edges.push([(c+1)*cs, r*cs, (c+1)*cs, (r+1)*cs])
    if (!cellSet.has(`${c},${r+1}`)) edges.push([(c+1)*cs, (r+1)*cs, c*cs, (r+1)*cs])
    if (!cellSet.has(`${c-1},${r}`)) edges.push([c*cs, (r+1)*cs, c*cs, r*cs])
  }
  if (!edges.length) return ''
  const adj = new Map()
  edges.forEach((e, i) => {
    const k = `${e[0]},${e[1]}`
    if (!adj.has(k)) adj.set(k, [])
    adj.get(k).push(i)
  })
  const used = new Array(edges.length).fill(false)
  const polygons = []
  for (let start = 0; start < edges.length; start++) {
    if (used[start]) continue
    const poly = []
    let cur = start
    while (!used[cur]) {
      used[cur] = true
      poly.push([edges[cur][0], edges[cur][1]])
      const nextKey = `${edges[cur][2]},${edges[cur][3]}`
      const nexts = (adj.get(nextKey) || []).filter(i => !used[i])
      if (!nexts.length) break
      cur = nexts[0]
    }
    if (poly.length >= 2) polygons.push(poly)
  }
  const R = 5
  let d = ''
  for (const poly of polygons) {
    const n = poly.length
    for (let i = 0; i < n; i++) {
      const [px, py] = poly[(i - 1 + n) % n]
      const [cx, cy] = poly[i]
      const [nx, ny] = poly[(i + 1) % n]
      const dx1 = cx - px, dy1 = cy - py
      const dx2 = nx - cx, dy2 = ny - cy
      const l1 = Math.sqrt(dx1*dx1 + dy1*dy1)
      const l2 = Math.sqrt(dx2*dx2 + dy2*dy2)
      const r = Math.min(R, l1 / 2, l2 / 2)
      const bx = cx - (dx1 / l1) * r
      const by = cy - (dy1 / l1) * r
      const fx = cx + (dx2 / l2) * r
      const fy = cy + (dy2 / l2) * r
      if (i === 0) d += `M${bx.toFixed(1)},${by.toFixed(1)} `
      else d += `L${bx.toFixed(1)},${by.toFixed(1)} `
      d += `Q${cx},${cy} ${fx.toFixed(1)},${fy.toFixed(1)} `
    }
    d += 'Z '
  }
  return d
}

// ── Region color helpers ───────────────────────────────────────────────────
function getRegionFill(region) {
  if (region.type === 'shelf' || region.type === 'shelf_h' || region.type === 'shelf_v') {
    if (isHighlighted(region)) return '#ef4444'
    const cells = getRegionCells(region)
    const hasAnyStock = cells.some((_, idx) => hasStockByCode(region, idx))
    return hasAnyStock ? '#3b82f6' : '#93c5fd'
  }
  return typeConfig[region.type]?.color || '#9ca3af'
}

function getRegionStroke(region) {
  if (region.type === 'shelf' || region.type === 'shelf_h' || region.type === 'shelf_v') {
    if (isHighlighted(region)) return '#dc2626'
    return '#1d4ed8'
  }
  return typeConfig[region.type]?.stroke || '#6b7280'
}

function isHighlighted(region) {
  if (!highlightedLocationIds.value.size) return false
  return panelLocations.value.some(l => l.module_id === region.id && highlightedLocationIds.value.has(l.id))
}

function hasStockByCode(region, idx) {
  const code = getSlotCode(region, idx)
  return !!locationStockMap.value[code]
}

function stockTypeLabel(t) {
  return { retail_display: '上架中', retail_storage: '备库中', exhibition: '展会', retail: '零售' }[t] || t
}

// ── Data loading ───────────────────────────────────────────────────────────
async function loadLayouts() {
  const res = await layoutApi.list().catch(() => ({ data: [] }))
  layouts.value = res.data || []
  if (layouts.value.length > 0) {
    const active = layouts.value.find(l => l.is_active) || layouts.value[0]
    activeLayoutId.value = active.id
    await loadLayout()
  }
}

async function loadLayout() {
  if (!activeLayoutId.value) return
  loading.value = true
  try {
    const res = await layoutApi.get(activeLayoutId.value)
    layout.value = res.data
    const locRes = await locationApi.list({ layout_id: activeLayoutId.value }).catch(() => ({ data: [] }))
    const locs = locRes.data || []
    const stockMap = {}
    locs.forEach(l => { if (l.total_qty > 0) stockMap[l.code] = true })
    locationStockMap.value = stockMap
    // 加载完成后自适应缩放
    await nextTick()
    setTimeout(fitMapToViewport, 100)
  } finally {
    loading.value = false
  }
}

async function onLayoutChange() {
  await loadLayout()
}

async function openLocationPanel(region) {
  panelRegion.value = region
  selectedLocation.value = null
  locDetail.value = null
  locDetailTransfer.value = []
  showPanel.value = true
  locationsLoading.value = true
  try {
    const prefix = (region.code || '').toUpperCase()
    const res = await locationApi.list({ layout_id: activeLayoutId.value })
    const allLocs = res.data || []
    // 只显示该货架前缀的货位（如 A 货架只显示 A-01~A-17，不显示 B-01 等）
    if (prefix) {
      panelLocations.value = allLocs.filter(loc => {
        const locPrefix = loc.code.split('-')[0].toUpperCase()
        return locPrefix === prefix
      })
    } else {
      panelLocations.value = allLocs
    }
  } finally {
    locationsLoading.value = false
  }
}

async function openLocationDetail(loc) {
  selectedLocation.value = loc
  locDetail.value = null
  locDetailTransfer.value = []
  locDetailLoading.value = true
  try {
    const res = await locationApi.get(loc.id)
    const data = res.data
    // 计算 total_qty 和 stock_alert
    const totalQty = (data.inventory || []).reduce((s, i) => s + i.quantity, 0)
    const threshold = data.low_stock_threshold ?? 10
    data.total_qty = totalQty
    data.stock_alert = totalQty === 0 ? 'empty' : totalQty < threshold ? 'low' : 'ok'
    locDetail.value = data

    // 加载可调拨信息
    try {
      const alertsRes = await locationApi.getAlerts()
      const alerts = alertsRes.data || []
      const myAlert = alerts.find(a => String(a.id) === String(loc.id))
      if (myAlert?.transfer_available?.length > 0) {
        locDetailTransfer.value = myAlert.transfer_available.map(item => ({
          ...item,
          transfer_qty: Math.min(item.storage_qty, 10),
        }))
      }
    } catch { /* ignore */ }
  } finally {
    locDetailLoading.value = false
  }
}

async function quickTransfer(item) {
  try {
    await ElMessageBox.confirm(
      `从备库货位 ${item.from_location_code} 调拨 ${item.transfer_qty} 件「${item.product_title} ${item.variant_title}」到本货位？`,
      '确认内部调拨',
      { type: 'info', confirmButtonText: '确认调拨', cancelButtonText: '取消' }
    )
  } catch { return }
  try {
    await locationApi.transfer(selectedLocation.value.id, {
      shopify_variant_id: item.shopify_variant_id,
      quantity: item.transfer_qty,
      from_location_id: item.from_location_id,
      note: `地图快捷调拨：从 ${item.from_location_code} 调拨 ${item.transfer_qty} 件`,
    })
    ElMessage.success(`已调拨 ${item.transfer_qty} 件`)
    await openLocationDetail(selectedLocation.value)
    // 刷新地图库存点
    const locRes = await locationApi.list({ layout_id: activeLayoutId.value }).catch(() => ({ data: [] }))
    const locs = locRes.data || []
    const stockMap = {}
    locs.forEach(l => { if (l.total_qty > 0) stockMap[l.code] = true })
    locationStockMap.value = stockMap
  } catch (err) {
    ElMessage.error(err.message || '调拨失败')
  }
}

function handleDrawerClose(done) {
  if (selectedLocation.value) {
    selectedLocation.value = null
    locDetail.value = null
    locDetailTransfer.value = []
  } else {
    done()
  }
}

// ── Create layout ──────────────────────────────────────────────────────────
async function createLayout() {
  if (!createForm.value.name.trim()) { ElMessage.warning('请输入仓库名称'); return }
  creating.value = true
  try {
    const res = await layoutApi.create({
      name: createForm.value.name.trim(),
      description: createForm.value.description,
      grid_cols: createForm.value.grid_cols,
      grid_rows: createForm.value.grid_rows,
    })
    const newLayout = res.data
    layouts.value.push(newLayout)
    activeLayoutId.value = newLayout.id
    showCreateDialog.value = false
    createForm.value = { name: '', description: '', grid_cols: 20, grid_rows: 15 }
    ElMessage.success('仓库创建成功，正在进入构建器...')
    setTimeout(() => router.push(`/map/builder?id=${newLayout.id}`), 800)
  } catch (err) {
    ElMessage.error(err?.response?.data?.message || '创建失败')
  } finally {
    creating.value = false
  }
}

// ── Delete layout ──────────────────────────────────────────────────────────
async function confirmDelete() {
  const current = layouts.value.find(l => l.id === activeLayoutId.value)
  if (!current) return
  try {
    await ElMessageBox.confirm(
      `确定要删除仓库「${current.name}」吗？此操作不可恢复。`,
      '删除仓库',
      { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消', confirmButtonClass: 'el-button--danger' }
    )
    await layoutApi.delete(activeLayoutId.value)
    ElMessage.success('仓库已删除')
    await loadLayouts()
  } catch (err) {
    if (err === 'cancel') return
    ElMessage.error(err?.response?.data?.message || '删除失败')
  }
}

onMounted(loadLayouts)
</script>

<style scoped>
.warehouse-map { animation: fadeIn 0.3s ease; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

.map-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }
.page-title { font-size: 22px; font-weight: 700; color: #1a1a2e; margin: 0 0 4px; }
.page-subtitle { color: #909399; font-size: 13px; }
.header-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }

.legend { display: flex; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
.legend-item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #606266; }
.legend-dot { width: 12px; height: 12px; border-radius: 3px; }

.map-canvas-wrapper {
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
  min-height: 400px;
  display: flex;
  flex-direction: column;
}
.zoom-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.zoom-label { font-size: 12px; color: #909399; min-width: 40px; }
.map-viewport {
  flex: 1;
  overflow: auto;
  border-radius: 8px;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}
.map-transform {
  transition: transform 0.2s ease;
}
.map-svg { display: block; border-radius: 8px; }
.region-shape { transition: filter 0.15s; }
.region-shape.clickable { cursor: pointer; }
.region-shape.clickable:hover { filter: brightness(1.12) drop-shadow(0 2px 8px rgba(0,0,0,0.25)); }
.region-shape.highlighted { animation: pulse 1.5s infinite; }
@keyframes pulse {
  0%, 100% { filter: drop-shadow(0 0 0 rgba(239,68,68,0.4)); }
  50% { filter: drop-shadow(0 0 8px rgba(239,68,68,0.7)); }
}

/* ── 货架列表面板 ── */
.location-panel { padding: 4px; }
.panel-section { margin-bottom: 20px; }
.section-title { font-size: 12px; font-weight: 600; color: #909399; text-transform: uppercase; letter-spacing: 0.5px; }
.section-title-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }

.info-grid { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
.info-item { display: flex; align-items: center; justify-content: space-between; font-size: 13px; }
.info-label { color: #909399; }

.locations-list { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
.location-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid #f0f0f0;
  cursor: pointer;
  transition: background 0.15s, transform 0.15s;
}
.location-row:hover { background: #f5f7ff; transform: translateX(2px); }
.location-row.highlighted { background: #fff0f0; border-color: #F56C6C; }
.location-row.alert-empty { border-left: 3px solid #F56C6C; }
.location-row.alert-low { border-left: 3px solid #E6A23C; }
.loc-left { flex: 1; min-width: 0; }
.loc-code { font-size: 14px; font-weight: 600; color: #303133; }
.loc-items { display: flex; gap: 4px; margin-top: 3px; flex-wrap: wrap; }
.loc-item-tag { font-size: 11px; color: #909399; background: #f5f5f5; padding: 1px 5px; border-radius: 4px; }
.loc-right { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.loc-arrow { color: #c0c4cc; }

/* ── 货位详情面板 ── */
.loc-detail-panel { padding: 4px; }
.loc-detail-back {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #409EFF;
  cursor: pointer;
  margin-bottom: 16px;
  padding: 6px 8px;
  border-radius: 6px;
  transition: background 0.15s;
}
.loc-detail-back:hover { background: #ecf5ff; }

.inv-list { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.inv-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  background: #fafafa;
}
.inv-thumb { width: 40px; height: 40px; object-fit: cover; border-radius: 6px; flex-shrink: 0; }
.inv-thumb-placeholder { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-size: 20px; background: #f0f0f0; border-radius: 6px; flex-shrink: 0; }
.inv-info { flex: 1; min-width: 0; }
.inv-name { font-size: 13px; font-weight: 600; color: #303133; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.inv-variant { font-size: 12px; color: #606266; }
.inv-sku { font-size: 11px; color: #909399; }
.inv-qty-block { text-align: right; flex-shrink: 0; }
.inv-qty { font-size: 15px; font-weight: 700; color: #303133; margin-top: 4px; }

.transfer-mini-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid #b3e19d;
  border-radius: 8px;
  background: #f0f9eb;
  margin-top: 8px;
}
.transfer-mini-info { flex: 1; min-width: 0; }
.transfer-mini-name { font-size: 13px; font-weight: 600; color: #303133; }
.transfer-mini-sub { font-size: 11px; color: #67C23A; margin-top: 2px; }

.loc-detail-actions { margin-top: 8px; }
</style>
