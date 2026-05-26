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
      <div v-if="layout && regions.length > 0" class="svg-scroll-wrap">
        <svg
          class="map-svg"
          :width="svgWidth"
          :height="svgHeight"
          :viewBox="`0 0 ${svgWidth} ${svgHeight}`"
        >
          <!-- Grid pattern -->
          <defs>
            <pattern id="map-grid-pat" :width="CELL_SIZE" :height="CELL_SIZE" patternUnits="userSpaceOnUse">
              <rect :width="CELL_SIZE" :height="CELL_SIZE" fill="none" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="3,3"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="#f8fafc" />
          <rect width="100%" height="100%" fill="url(#map-grid-pat)" />

          <!-- Regions -->
          <g v-for="region in regions" :key="region.id">
            <!-- Main shape outline path -->
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
            <!-- Shelf: individual cell labels -->
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
                <!-- stock dot -->
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
            <!-- Non-shelf center icon -->
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

      <el-empty v-if="!loading && (!layout || regions.length === 0)" description="暂无仓库布局，请先在构建器中创建" :image-size="80">
        <el-button type="primary" @click="$router.push('/map/builder')">前往构建器</el-button>
      </el-empty>
    </div>

    <!-- 货位详情侧边栏 -->
    <el-drawer v-model="showPanel" :title="panelRegion?.code ? `货架 ${panelRegion.code}` : '货位详情'" direction="rtl" size="400px">
      <div v-if="panelRegion" class="location-panel">
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
              :class="{ highlighted: highlightedLocationIds.has(loc.id) }"
              @click="$router.push(`/locations/${loc.id}`)">
              <div class="loc-code">{{ loc.code }}</div>
              <div class="loc-stock">
                <el-tag v-if="loc.total_qty > 0" size="small" type="success">{{ loc.total_qty }} 件</el-tag>
                <el-tag v-else size="small" type="info">空</el-tag>
              </div>
              <el-icon class="loc-arrow"><ArrowRight /></el-icon>
            </div>
            <el-empty v-if="!locationsLoading && panelLocations.length === 0" description="暂无货位" :image-size="40" />
          </div>
        </div>

        <div class="panel-section">
          <el-button type="primary" style="width:100%" @click="$router.push('/locations')">
            管理所有货位
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
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessageBox, ElMessage } from 'element-plus'
import { layoutApi, locationApi } from '@/api/index.js'
import { useAuthStore } from '@/stores/auth'
import { Edit, Star, ArrowRight, Plus, Delete } from '@element-plus/icons-vue'

const authStore = useAuthStore()
const router = useRouter()

// ── Constants ──────────────────────────────────────────────────────────────
const CELL_SIZE = 64

const typeConfig = {
  shelf:     { label: '货架',   icon: '📦', color: '#3b82f6', stroke: '#1d4ed8' },
  wall:      { label: '墙壁',   icon: '🧱', color: '#6b7280', stroke: '#374151' },
  door:      { label: '出入口', icon: '🚪', color: '#f59e0b', stroke: '#d97706' },
  aisle:     { label: '通道',   icon: '↔',  color: '#d1fae5', stroke: '#6ee7b7' },
  workbench: { label: '工作台', icon: '🖥',  color: '#8b5cf6', stroke: '#6d28d9' },
  pillar:    { label: '柱子',   icon: '⬛',  color: '#374151', stroke: '#111827' },
  // Legacy type aliases
  shelf_h:   { label: '货架',   icon: '📦', color: '#3b82f6', stroke: '#1d4ed8' },
  shelf_v:   { label: '货架',   icon: '📦', color: '#3b82f6', stroke: '#1d4ed8' },
  entrance:  { label: '出入口', icon: '🚪', color: '#f59e0b', stroke: '#d97706' },
  workstation:{ label: '工作台',icon: '🖥',  color: '#8b5cf6', stroke: '#6d28d9' },
}

const legend = [
  { label: '货架（有货）', color: '#3b82f6' },
  { label: '货架（空）',   color: '#93c5fd' },
  { label: '高亮（拣货目标）', color: '#ef4444' },
  { label: '通道',         color: '#d1fae5' },
  { label: '出入口',       color: '#f59e0b' },
  { label: '墙壁',         color: '#6b7280' },
]

// ── State ──────────────────────────────────────────────────────────────────
const layouts = ref([])
const activeLayoutId = ref(null)
const layout = ref(null)
const loading = ref(false)

const showPanel = ref(false)
const panelRegion = ref(null)
const panelLocations = ref([])
const locationsLoading = ref(false)
const locationStockMap = ref({})   // slotCode -> has stock
const highlightedLocationIds = ref(new Set())

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
      // New format: cells is array of "col,row" strings
      if (Array.isArray(region.cells) && region.cells.length > 0 && typeof region.cells[0] === 'string') {
        return {
          ...region,
          cells: new Set(region.cells),
        }
      }
      // Old format: col/row/colSpan/rowSpan → convert to cells Set
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

const svgWidth = computed(() => {
  if (!layout.value) return 800
  return (layout.value.grid_cols || 20) * CELL_SIZE
})
const svgHeight = computed(() => {
  if (!layout.value) return 600
  return (layout.value.grid_rows || 15) * CELL_SIZE
})

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

// ── SVG outline path (true polygon, supports L/U shapes) ──────────────────
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

    // Load location stock info
    const locRes = await locationApi.list({ layout_id: activeLayoutId.value }).catch(() => ({ data: [] }))
    const locs = locRes.data || []
    const stockMap = {}
    locs.forEach(l => {
      if (l.total_qty > 0) stockMap[l.code] = true
    })
    locationStockMap.value = stockMap
  } finally {
    loading.value = false
  }
}

async function onLayoutChange() {
  await loadLayout()
}

async function openLocationPanel(region) {
  panelRegion.value = region
  showPanel.value = true
  locationsLoading.value = true
  try {
    const res = await locationApi.list({ module_id: region.id, layout_id: activeLayoutId.value })
    panelLocations.value = res.data || []
  } finally {
    locationsLoading.value = false
  }
}

// ── Create layout ──────────────────────────────────────────────────────────
async function createLayout() {
  if (!createForm.value.name.trim()) {
    ElMessage.warning('请输入仓库名称')
    return
  }
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
  overflow: auto;
  min-height: 300px;
}

.svg-scroll-wrap {
  overflow: auto;
  border-radius: 8px;
}

.map-svg {
  display: block;
  border-radius: 8px;
}

.region-shape { transition: filter 0.15s; }
.region-shape.clickable { cursor: pointer; }
.region-shape.clickable:hover { filter: brightness(1.12) drop-shadow(0 2px 8px rgba(0,0,0,0.25)); }
.region-shape.highlighted { animation: pulse 1.5s infinite; }
@keyframes pulse {
  0%, 100% { filter: drop-shadow(0 0 0 rgba(239,68,68,0.4)); }
  50% { filter: drop-shadow(0 0 8px rgba(239,68,68,0.7)); }
}

/* 侧边栏 */
.location-panel { padding: 4px; }
.panel-section { margin-bottom: 20px; }
.section-title { font-size: 13px; font-weight: 600; color: #909399; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
.info-grid { display: flex; flex-direction: column; gap: 8px; }
.info-item { display: flex; align-items: center; justify-content: space-between; font-size: 13px; }
.info-label { color: #909399; }

.locations-list { display: flex; flex-direction: column; gap: 6px; }
.location-row {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid #f0f0f0;
  cursor: pointer;
  transition: background 0.15s, transform 0.15s;
}
.location-row:hover { background: #f5f7ff; transform: translateX(2px); }
.location-row.highlighted { background: #fff0f0; border-color: #F56C6C; }
.loc-code { flex: 1; font-size: 14px; font-weight: 600; color: #303133; }
.loc-stock { margin-right: 8px; }
.loc-arrow { color: #c0c4cc; }
</style>
