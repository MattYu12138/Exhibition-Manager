<template>
  <div class="warehouse-map">
    <div class="map-header">
      <div>
        <h1 class="page-title">🗺️ 仓库地图</h1>
        <p class="page-subtitle">点击货架查看货位详情 · 高亮显示拣货位置</p>
      </div>
      <div class="header-actions">
        <el-select v-model="activeLayoutId" placeholder="选择布局" style="width:200px" @change="loadLayout">
          <el-option v-for="l in layouts" :key="l.id" :label="l.name" :value="l.id" />
        </el-select>
        <el-button v-if="authStore.isAdmin" @click="$router.push(`/map/builder?id=${activeLayoutId}`)">
          <el-icon><Edit /></el-icon> 编辑布局
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

    <!-- 地图画布 -->
    <div class="map-canvas-wrapper" v-loading="loading">
      <div v-if="layout" class="map-canvas"
        :style="{ gridTemplateColumns: `repeat(${layout.grid_cols}, 64px)`, gridTemplateRows: `repeat(${layout.grid_rows}, 64px)` }">

        <!-- 背景格子 -->
        <div v-for="(_, idx) in layout.grid_cols * layout.grid_rows" :key="`bg-${idx}`" class="bg-cell" />

        <!-- 模块 -->
        <div
          v-for="cell in layoutCells"
          :key="cell.id"
          class="map-module"
          :class="[`type-${cell.type}`, { highlighted: isHighlighted(cell), 'has-stock': hasStock(cell), clickable: cell.type.startsWith('shelf') }]"
          :style="{
            gridColumn: `${cell.col + 1} / span ${cell.colSpan || 1}`,
            gridRow: `${cell.row + 1} / span ${cell.rowSpan || 1}`,
          }"
          @click="cell.type.startsWith('shelf') && openLocationPanel(cell)"
        >
          <span class="module-icon">{{ getIcon(cell.type) }}</span>
          <span class="module-code">{{ cell.code || cell.label }}</span>
          <div v-if="isHighlighted(cell)" class="highlight-badge">
            <el-icon><Star /></el-icon>
          </div>
          <div v-if="hasStock(cell)" class="stock-dot" />
        </div>
      </div>

      <el-empty v-if="!loading && !layout" description="暂无仓库布局，请先在构建器中创建" :image-size="80">
        <el-button type="primary" @click="$router.push('/map/builder')">前往构建器</el-button>
      </el-empty>
    </div>

    <!-- 货位详情侧边栏 -->
    <el-drawer v-model="showPanel" :title="panelCell?.code || '货位详情'" direction="rtl" size="400px">
      <div v-if="panelCell" class="location-panel">
        <div class="panel-section">
          <div class="section-title">货位信息</div>
          <div class="info-grid">
            <div class="info-item"><span class="info-label">编码</span><el-tag>{{ panelCell.code }}</el-tag></div>
            <div class="info-item"><span class="info-label">类型</span><span>{{ getTypeName(panelCell.type) }}</span></div>
            <div class="info-item"><span class="info-label">规格</span><span>{{ panelCell.rows || 2 }} 行 × {{ panelCell.cols || 4 }} 列</span></div>
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
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { layoutApi, locationApi } from '@/api/index.js'
import { useAuthStore } from '@/stores/auth'
import { Edit, Star, ArrowRight } from '@element-plus/icons-vue'

const authStore = useAuthStore()
const route = useRoute()

const layouts = ref([])
const activeLayoutId = ref(null)
const layout = ref(null)
const loading = ref(false)
const showPanel = ref(false)
const panelCell = ref(null)
const panelLocations = ref([])
const locationsLoading = ref(false)
const locationStockMap = ref({}) // cell.id -> has stock
const highlightedLocationIds = ref(new Set())

const legend = [
  { label: '货架（有货）', color: '#409EFF' },
  { label: '货架（空）', color: '#c0c4cc' },
  { label: '高亮（拣货目标）', color: '#F56C6C' },
  { label: '通道', color: '#E6E6E6' },
  { label: '出入口', color: '#F56C6C' },
]

const iconMap = {
  shelf_h: '▬', shelf_v: '▮', shelf_corner: '⌐',
  aisle: '⟶', entrance: '🚪', wall: '█', workstation: '🖥',
}
const typeNameMap = {
  shelf_h: '横向货架', shelf_v: '竖向货架', shelf_corner: '拐角货架',
  aisle: '通道', entrance: '出入口', wall: '墙壁', workstation: '工作台',
}
function getIcon(type) { return iconMap[type] || '?' }
function getTypeName(type) { return typeNameMap[type] || type }

// 解析 layout_json，支持新版（cells 数组格式）和旧版（col/row/colSpan/rowSpan 格式）
const layoutCells = computed(() => {
  if (!layout.value) return []
  const raw = layout.value.layout_json
  if (!raw) return []
  try {
    let parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    // Handle double-encoded JSON (legacy data)
    if (typeof parsed === 'string') parsed = JSON.parse(parsed)
    if (!Array.isArray(parsed)) return []

    // Convert new format (cells: ["col,row", ...]) to display cells
    const result = []
    for (const region of parsed) {
      if (Array.isArray(region.cells) && region.cells.length > 0 && typeof region.cells[0] === 'string') {
        // New format: cells is array of "col,row" strings
        // For display, find bounding box and render as one block per region
        const coords = region.cells.map(k => { const [c, r] = k.split(',').map(Number); return { c, r } })
        const minCol = Math.min(...coords.map(p => p.c))
        const maxCol = Math.max(...coords.map(p => p.c))
        const minRow = Math.min(...coords.map(p => p.r))
        const maxRow = Math.max(...coords.map(p => p.r))
        result.push({
          id: region.id,
          type: region.type === 'shelf' ? 'shelf_h' : region.type,
          col: minCol,
          row: minRow,
          colSpan: maxCol - minCol + 1,
          rowSpan: maxRow - minRow + 1,
          code: region.code || '',
          levels: region.levels || 1,
          _cells: region.cells,
        })
      } else {
        // Old format: already has col/row/colSpan/rowSpan
        result.push(region)
      }
    }
    return result
  } catch { return [] }
})

function isHighlighted(cell) {
  return cell.type.startsWith('shelf') && highlightedLocationIds.value.size > 0 &&
    panelLocations.value.some(l => l.cell_id === cell.id && highlightedLocationIds.value.has(l.id))
}
function hasStock(cell) { return locationStockMap.value[cell.id] }

async function loadLayouts() {
  const res = await layoutApi.list().catch(() => ({ data: [] }))
  layouts.value = res.data || []
  if (layouts.value.length > 0) {
    // 优先激活的布局
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
    // 加载库存状态
    const locRes = await locationApi.list({ layout_id: activeLayoutId.value }).catch(() => ({ data: [] }))
    const locs = locRes.data || []
    const stockMap = {}
    locs.forEach(l => {
      if (l.total_qty > 0) stockMap[l.cell_id] = true
    })
    locationStockMap.value = stockMap
  } finally {
    loading.value = false
  }
}

async function openLocationPanel(cell) {
  panelCell.value = cell
  showPanel.value = true
  locationsLoading.value = true
  try {
    const res = await locationApi.list({ cell_id: cell.id })
    panelLocations.value = res.data || []
  } finally {
    locationsLoading.value = false
  }
}

onMounted(loadLayouts)
</script>

<style scoped>
.warehouse-map { animation: fadeIn 0.3s ease; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

.map-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 16px; }
.page-title { font-size: 22px; font-weight: 700; color: #1a1a2e; margin: 0 0 4px; }
.page-subtitle { color: #909399; font-size: 13px; }
.header-actions { display: flex; gap: 10px; align-items: center; }

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

.map-canvas {
  display: grid;
  gap: 3px;
  background: #f5f6fa;
  border-radius: 8px;
  padding: 6px;
  min-width: fit-content;
}

.bg-cell { width: 64px; height: 64px; border: 1px dashed #ebebeb; border-radius: 4px; }

.map-module {
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  position: relative;
  transition: transform 0.2s, box-shadow 0.2s;
  background: #c0c4cc;
}
.map-module.type-shelf_h, .map-module.type-shelf_v, .map-module.type-shelf_corner { background: #c0c4cc; }
.map-module.has-stock.type-shelf_h,
.map-module.has-stock.type-shelf_v,
.map-module.has-stock.type-shelf_corner { background: #409EFF; }
.map-module.type-aisle { background: #E6E6E6; }
.map-module.type-entrance { background: #F56C6C; }
.map-module.type-wall { background: #909399; }
.map-module.type-workstation { background: #E6A23C; }
.map-module.clickable { cursor: pointer; }
.map-module.clickable:hover { transform: scale(1.06); box-shadow: 0 4px 16px rgba(0,0,0,0.2); z-index: 10; }
.map-module.highlighted {
  background: #F56C6C !important;
  animation: pulse 1.5s infinite;
}
@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(245,108,108,0.4); }
  50% { box-shadow: 0 0 0 8px rgba(245,108,108,0); }
}

.module-icon { font-size: 18px; color: #fff; }
.module-code { font-size: 10px; color: rgba(255,255,255,0.9); font-weight: 600; text-align: center; max-width: 58px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.highlight-badge { position: absolute; top: 2px; right: 2px; color: #fff; font-size: 10px; }
.stock-dot { position: absolute; bottom: 4px; right: 4px; width: 6px; height: 6px; border-radius: 50%; background: #fff; opacity: 0.8; }

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
