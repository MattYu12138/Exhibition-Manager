<template>
  <div class="picking-detail">
    <div class="page-header">
      <el-button text @click="$router.back()"><el-icon><ArrowLeft /></el-icon> {{ $t('common.back') }}</el-button>
      <div class="header-center" v-if="task">
        <el-tag :type="task.task_type === 'order' ? 'primary' : 'warning'" style="margin-right:8px">
          {{ task.task_type === 'order' ? `📦 ${$t('pickingList.orderPicking')}` : `🎪 ${$t('pickingList.exhibitionPicking')}` }}
        </el-tag>
        <h1 class="page-title">{{ task.shopify_order_name || task.exhibition_name || task.id }}</h1>
      </div>
      <div class="header-actions">
        <el-tag :type="statusType(task?.status)" size="large">{{ statusLabel(task?.status) }}</el-tag>
      </div>
    </div>

    <div v-loading="loading" class="detail-body">
      <el-row :gutter="20">
        <!-- 左：拣货清单 -->
        <el-col :span="10">
          <el-card class="picking-card">
            <template #header>
              <div class="card-header">
                <span>{{ $t('pickingDetail.pickingList') }}</span>
                <el-progress
                  :percentage="progressPct"
                  :status="task?.status === 'completed' ? 'success' : undefined"
                  :stroke-width="8"
                  style="width:120px"
                />
              </div>
            </template>

            <div class="lines-list">
              <transition-group name="line-fade">
                <div
                  v-for="line in sortedLines"
                  :key="line.id"
                  class="line-item"
                  :class="{ picked: line.status === 'picked', active: activeLine?.id === line.id }"
                  @click="handleLineClick(line)"
                >
                  <div class="line-check">
                    <el-checkbox
                      :model-value="line.status === 'picked'"
                      @change="(v) => handleCheckChange(line, v)"
                      @click.stop
                    />
                  </div>
                  <div class="line-body">
                    <div class="line-product">{{ line.product_title }}</div>
                    <div class="line-variant">{{ line.variant_title }}</div>
                    <div class="line-location">
                      <el-icon size="12"><Location /></el-icon>
                      <span v-if="line.location_code">{{ line.location_code }}</span>
                      <span v-else class="no-location">{{ $t('pickingDetail.locationNotFound') }}</span>
                    </div>
                  </div>
                  <div class="line-qty">
                    <span class="qty-needed">{{ line.required_qty }}</span>
                    <span class="qty-label">{{ $t('common.piece') }}</span>
                    <div v-if="line.status === 'partial'" class="qty-partial">
                      {{ $t('pickingDetail.partialQty', { picked: line.picked_qty, required: line.required_qty }) }}
                    </div>
                  </div>
                </div>
              </transition-group>
            </div>

            <div v-if="task?.status !== 'completed'" class="complete-btn-wrapper">
              <el-button
                type="success"
                style="width:100%"
                :disabled="progressPct < 100"
                @click="completeTask"
              >
                ✅ {{ $t('pickingDetail.completePicking') }}
              </el-button>
            </div>
          </el-card>
        </el-col>

        <!-- 右：仓库地图（竖向+可缩放） -->
        <el-col :span="14">
          <el-card class="map-card">
            <template #header>
              <div class="card-header">
                <span>{{ $t('pickingDetail.mapNavigation') }}</span>
                <div class="map-controls">
                  <div class="map-legend">
                    <span class="legend-dot" style="background:#409EFF"></span>{{ $t('pickingDetail.shelves') }}
                    <span class="legend-dot" style="background:#F56C6C;margin-left:8px"></span>{{ $t('pickingDetail.target') }}
                    <span class="legend-dot" style="background:#67C23A;margin-left:8px"></span>{{ $t('pickingDetail.done') }}
                  </div>
                  <div class="zoom-controls">
                    <el-button size="small" circle @click="zoomIn"><el-icon><ZoomIn /></el-icon></el-button>
                    <span class="zoom-label">{{ Math.round(scale * 100) }}%</span>
                    <el-button size="small" circle @click="zoomOut"><el-icon><ZoomOut /></el-icon></el-button>
                    <el-button size="small" circle @click="resetZoom"><el-icon><FullScreen /></el-icon></el-button>
                  </div>
                </div>
              </div>
            </template>

            <div class="map-viewport" ref="mapViewport" @wheel.prevent="handleWheel">
              <div
                class="map-transform"
                :style="{ transform: `scale(${scale})`, transformOrigin: 'top center' }"
                v-if="parsedLayout"
              >
                <div class="map-grid"
                  :style="{
                    gridTemplateColumns: `repeat(${parsedLayout.grid_cols}, ${cellSize}px)`,
                    gridTemplateRows: `repeat(${parsedLayout.grid_rows}, ${cellSize}px)`,
                  }">
                  <div v-for="(_, idx) in parsedLayout.grid_cols * parsedLayout.grid_rows" :key="`bg-${idx}`" class="bg-cell"
                    :style="{ gridColumn: idx % parsedLayout.grid_cols + 1, gridRow: Math.floor(idx / parsedLayout.grid_cols) + 1 }" />
                  <div
                    v-for="cell in parsedLayout.cells"
                    :key="cell.id"
                    class="map-module"
                    :class="[
                      `type-${cell.type}`,
                      getCellClass(cell),
                      { clickable: cell.type === 'shelf' }
                    ]"
                    :style="{
                      gridColumn: `${cell.col + 1} / span ${cell.colSpan || 1}`,
                      gridRow: `${cell.row + 1} / span ${cell.rowSpan || 1}`,
                    }"
                    @click="cell.type === 'shelf' && focusCell(cell)"
                  >
                    <span class="cell-icon">{{ getCellIcon(cell.type) }}</span>
                    <span class="cell-code">{{ cell.code || '' }}</span>
                    <div v-if="getCellClass(cell) === 'target'" class="pulse-ring" />
                    <div v-if="getCellClass(cell) === 'done'" class="done-badge">✓</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 当前选中行的货位提示 -->
            <transition name="slide-up">
              <div v-if="activeLine" class="active-hint">
                <div class="hint-icon">📍</div>
                <div class="hint-body">
                  <div class="hint-product">{{ activeLine.product_title }} · {{ activeLine.variant_title }}</div>
                  <div class="hint-location">
                    {{ $t('pickingDetail.goToLocation') }}<strong>{{ activeLine.location_code || $t('pickingDetail.unknown') }}</strong>
                  </div>
                </div>
                <el-button
                  v-if="activeLine.status !== 'picked'"
                  type="primary"
                  size="small"
                  @click="handleCheckChange(activeLine, true)"
                >
                  {{ $t('pickingDetail.confirmPick') }}
                </el-button>
                <el-button
                  v-if="activeLine.status === 'partial'"
                  type="warning"
                  size="small"
                  @click="confirmUnpick(activeLine)"
                >
                  {{ $t('pickingDetail.cancelPick') }}
                </el-button>
                <el-button
                  v-if="activeLine.status === 'picked'"
                  type="warning"
                  size="small"
                  @click="confirmUnpick(activeLine)"
                >
                  {{ $t('pickingDetail.cancelPick') }}
                </el-button>
              </div>
            </transition>
          </el-card>
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { pickingApi, layoutApi } from '@/api/index.js'
import { ArrowLeft, Location, ZoomIn, ZoomOut, FullScreen } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { localizedError } from '@/i18n'
import { useWarehouseStore } from '@/stores/warehouse'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const warehouseStore = useWarehouseStore()
const taskId = route.params.id

const task = ref(null)
const lines = ref([])
const parsedLayout = ref(null)
const loading = ref(false)
const activeLine = ref(null)
const mapViewport = ref(null)

// 缩放相关
const scale = ref(1)
const cellSize = 48

const iconMap = { shelf: '📦', aisle: '⟶', entrance: '🚪', door: '🚪', wall: '█', workstation: '🖥', workbench: '🖥', pillar: '▣' }
function getCellIcon(type) { return iconMap[type] || '📦' }

function zoomIn() { scale.value = Math.min(scale.value + 0.2, 3) }
function zoomOut() { scale.value = Math.max(scale.value - 0.2, 0.3) }
function resetZoom() { fitMapToViewport() }
function handleWheel(e) {
  if (e.deltaY < 0) zoomIn()
  else zoomOut()
}

function fitMapToViewport() {
  if (!parsedLayout.value || !mapViewport.value) return
  const viewport = mapViewport.value
  const mapWidth = parsedLayout.value.grid_cols * (cellSize + 2)
  const mapHeight = parsedLayout.value.grid_rows * (cellSize + 2)
  const scaleX = viewport.clientWidth / mapWidth
  const scaleY = viewport.clientHeight / mapHeight
  scale.value = Math.min(scaleX, scaleY, 1) * 0.95
}

const progressPct = computed(() => {
  if (!lines.value.length) return 0
  return Math.round(lines.value.filter(l => l.status === 'picked').length / lines.value.length * 100)
})

const sortedLines = computed(() => {
  return [...lines.value].sort((a, b) => {
    const aPicked = a.status === 'picked' ? 1 : 0
    const bPicked = b.status === 'picked' ? 1 : 0
    if (aPicked !== bPicked) return aPicked - bPicked
    return (a.location_code || '').localeCompare(b.location_code || '')
  })
})

// 当前选中行的 cellKey（用于地图高亮"选中"状态）
const activeCellKey = computed(() => {
  if (!activeLine.value || activeLine.value.grid_x == null || activeLine.value.grid_y == null) return null
  return `${activeLine.value.grid_x},${activeLine.value.grid_y}`
})

// 拣货目标的 cell key 集合
const targetCellKeys = computed(() => {
  const set = new Set()
  lines.value.filter(l => l.status !== 'picked' && l.grid_x != null && l.grid_y != null).forEach(l => {
    set.add(`${l.grid_x},${l.grid_y}`)
  })
  return set
})
const doneCellKeys = computed(() => {
  const set = new Set()
  lines.value.filter(l => l.status === 'picked' && l.grid_x != null && l.grid_y != null).forEach(l => {
    set.add(`${l.grid_x},${l.grid_y}`)
  })
  return set
})

function getCellClass(cell) {
  if (cell.type !== 'shelf') return ''
  // 当前选中的行对应的 cell 优先高亮为 active-target
  if (activeCellKey.value && cell.cellKey === activeCellKey.value) return 'active-target'
  if (targetCellKeys.value.has(cell.cellKey)) return 'target'
  if (doneCellKeys.value.has(cell.cellKey)) return 'done'
  return ''
}

function statusType(s) {
  return { pending: 'info', in_progress: 'warning', completed: 'success', cancelled: 'danger' }[s] || 'info'
}
function statusLabel(s) {
  const labels = { pending: 'common.pending', in_progress: 'common.inProgress', completed: 'common.completed', cancelled: 'common.cancelled' }
  return labels[s] ? t(labels[s]) : s
}

// 点击货物行（不管状态，都只做选中/取消选中）
function handleLineClick(line) {
  activeLine.value = activeLine.value?.id === line.id ? null : line
}

function selectLine(line) {
  activeLine.value = activeLine.value?.id === line.id ? null : line
}

function focusCell(cell) {
  const line = lines.value.find(l =>
    l.grid_x != null && l.grid_y != null &&
    `${l.grid_x},${l.grid_y}` === cell.cellKey &&
    l.status !== 'picked'
  )
  if (line) activeLine.value = line
}

// 确认取消拣货（必须经过弹窗确认）
async function confirmUnpick(line) {
  // A partial line also has inventory deductions that can be restored.
  if (line.status !== 'picked' && line.status !== 'partial') {
    ElMessage.warning(t('pickingDetail.notPicked'))
    return
  }
  try {
    await ElMessageBox.confirm(
      t('pickingDetail.unpickConfirm', { product: `${line.product_title} - ${line.variant_title}` }),
      t('pickingDetail.cancelPick'),
      { type: 'warning', confirmButtonText: t('pickingDetail.confirmUndo'), cancelButtonText: t('pickingDetail.keepAsIs') }
    )
    await pickingApi.unpickLine(taskId, line.id)
    await loadData()
    ElMessage.success(t('pickingDetail.undoSuccess'))
    activeLine.value = lines.value.find(item => item.id === line.id) || activeLine.value
  } catch (e) {
    if (e !== 'cancel' && e?.toString() !== 'cancel') {
      ElMessage.error(localizedError(e, t, 'pickingDetail.undoFailed'))
    }
  }
}

// checkbox 变化
async function handleCheckChange(line, picked) {
  if (picked) {
    try {
      const remaining = Number(line.required_qty) - Number(line.picked_qty || 0)
      if (remaining <= 0) { await loadData(); return }
      const response = await pickingApi.pickLine(taskId, line.id, { picked_qty: remaining })
      // The write response owns the picked quantity/status, not the requested quantity.
      const updatedLine = response.data?.line
      const index = lines.value.findIndex(item => item.id === line.id)
      if (updatedLine && index !== -1) lines.value[index] = { ...lines.value[index], ...updatedLine }
      if (task.value && response.data?.task_status) task.value.status = response.data.task_status
      await loadData() // Refresh locations, remaining quantity, shortfall and task progress.
      if (updatedLine?.status === 'picked') ElMessage.success(t('pickingDetail.pickSuccess'))
      else if (updatedLine?.status === 'partial') ElMessage.warning(t('pickingDetail.partialPick'))
    } catch (err) {
      ElMessage.error(localizedError(err, t))
      // A stock-conflict (409) is atomic server-side; recover latest task state.
      await loadData().catch(() => {})
    }
  } else {
    // 取消勾选 = 取消拣货（必须经过弹窗确认）
    // 先阻止 checkbox 立即变化（Vue 响应式会自动恢复）
    confirmUnpick(line)
  }
}

async function completeTask() {
  try {
    await ElMessageBox.confirm(t('pickingDetail.finishConfirm'), t('pickingDetail.completePicking'), { type: 'success', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') })
    await loadData()
    if (task.value?.status === 'completed') ElMessage.success(t('pickingDetail.finished'))
    else ElMessage.warning(t('pickingDetail.notCompleted'))
  } catch (err) { if (err !== 'cancel' && err !== 'close') ElMessage.error(localizedError(err, t)) }
}

/**
 * 解析 layout_json 字符串为 cells 数组
 */
function parseLayoutJson(layoutData) {
  if (!layoutData) return null
  const { layout_json, grid_cols, grid_rows } = layoutData
  if (!layout_json) return null

  let modules
  try {
    modules = typeof layout_json === 'string' ? JSON.parse(layout_json) : layout_json
    if (typeof modules === 'string') modules = JSON.parse(modules)
    if (!Array.isArray(modules)) return null
  } catch (e) {
    console.error('Failed to parse layout_json:', e)
    return null
  }

  const cells = []
  let cols = Number(grid_cols) || 20
  let rows = Number(grid_rows) || 15
  for (const mod of modules) {
    const moduleCells = Array.isArray(mod.cells) ? mod.cells
      : mod.col != null && mod.row != null
        ? Array.from({ length: (Number(mod.colSpan) || 1) * (Number(mod.rowSpan) || 1) }, (_, index) =>
            `${Number(mod.col) + index % (Number(mod.colSpan) || 1)},${Number(mod.row) + Math.floor(index / (Number(mod.colSpan) || 1))}`)
        : []
    for (const cellStr of moduleCells) {
      // MapBuilder, WarehouseMap and backend locations all use "col,row".
      const [col, row] = String(cellStr).split(',').map(Number)
      if (!Number.isInteger(col) || !Number.isInteger(row) || col < 0 || row < 0) continue
      cols = Math.max(cols, col + 1)
      rows = Math.max(rows, row + 1)
      cells.push({
        id: `${mod.id}_${cellStr}`,
        type: mod.type || 'shelf',
        code: mod.code || '',
        row,
        col,
        colSpan: 1,
        rowSpan: 1,
        cellKey: `${col},${row}`,
      })
    }
  }

  return {
    grid_cols: cols,
    grid_rows: rows,
    cells,
  }
}

async function loadData() {
  loading.value = true
  try {
    const taskRes = await pickingApi.getTask(taskId)
    const data = taskRes.data

    task.value = data.task || data
    lines.value = data.lines || []

    // 解析布局数据
    const layoutData = data.layout
    if (layoutData) {
      parsedLayout.value = parseLayoutJson(layoutData)
    } else {
      try {
        const layoutRes = warehouseStore.selectedLayoutId ? await layoutApi.get(warehouseStore.selectedLayoutId) : await layoutApi.getActive()
        if (layoutRes.data) {
          parsedLayout.value = parseLayoutJson(layoutRes.data)
        }
      } catch {}
    }

    // 默认选中第一个未拣货项
    activeLine.value = lines.value.find(l => l.status !== 'picked') || null

    // 等待 DOM 渲染后自适应缩放
    await nextTick()
    setTimeout(fitMapToViewport, 100)
  } finally {
    loading.value = false
  }
}

watch(() => warehouseStore.selectedLayoutId, (id, oldId) => {
  if (String(id) !== String(oldId)) router.replace('/picking')
})
onMounted(loadData)
</script>

<style scoped>
.picking-detail { animation: fadeIn 0.3s ease; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

.page-header { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
.header-center { flex: 1; display: flex; align-items: center; }
.page-title { font-size: 20px; font-weight: 700; color: #1a1a2e; margin: 0; }
.header-actions { display: flex; gap: 10px; }
.card-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }

.picking-card { height: calc(100vh - 160px); display: flex; flex-direction: column; }
.lines-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding-right: 4px; }

.line-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid #f0f0f0;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s, transform 0.15s;
}
.line-item:hover { background: #f5f7ff; transform: translateX(2px); }
.line-item.active { border-color: #409EFF; background: #ecf5ff; box-shadow: 0 0 0 2px rgba(64,158,255,0.15); }
.line-item.picked { opacity: 0.55; background: #f9f9f9; }
.line-item.picked:hover { opacity: 0.8; background: #fff5f5; }
.line-item.picked .line-product { text-decoration: line-through; }

.line-body { flex: 1; }
.line-product { font-size: 13px; font-weight: 600; color: #303133; }
.line-variant { font-size: 12px; color: #606266; }
.line-location { display: flex; align-items: center; gap: 4px; font-size: 11px; color: #409EFF; margin-top: 2px; }
.no-location { color: #c0c4cc; }
.line-qty { text-align: center; }
.qty-needed { font-size: 20px; font-weight: 700; color: #1a1a2e; }
.qty-label { font-size: 11px; color: #909399; }
.qty-partial { font-size: 11px; color: #e6a23c; }

.complete-btn-wrapper { padding-top: 12px; border-top: 1px solid #f0f0f0; margin-top: 8px; }

/* 地图 */
.map-card { height: calc(100vh - 160px); display: flex; flex-direction: column; overflow: hidden; }
.map-controls { display: flex; align-items: center; gap: 12px; }
.map-legend { display: flex; align-items: center; font-size: 11px; color: #606266; }
.legend-dot { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 3px; }
.zoom-controls { display: flex; align-items: center; gap: 4px; }
.zoom-label { font-size: 11px; color: #909399; min-width: 36px; text-align: center; }

.map-viewport {
  flex: 1;
  overflow: auto;
  padding: 8px;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}
.map-transform {
  transition: transform 0.2s ease;
}
.map-grid {
  display: grid;
  gap: 2px;
  background: #f5f6fa;
  border-radius: 8px;
  padding: 4px;
  min-width: fit-content;
}
.bg-cell { border: 1px dashed #ebebeb; border-radius: 4px; }

.map-module {
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  position: relative;
  background: #409EFF;
  transition: transform 0.2s, box-shadow 0.2s;
}
.map-module.type-aisle { background: #E6E6E6; }
.map-module.type-entrance { background: #F56C6C; }
.map-module.type-door { background: #F56C6C; }
.map-module.type-wall { background: #909399; }
.map-module.type-workstation { background: #E6A23C; }
.map-module.type-workbench { background: #E6A23C; }
.map-module.type-pillar { background: #606266; }
.map-module.clickable { cursor: pointer; }
.map-module.clickable:hover { transform: scale(1.08); z-index: 10; }

/* 拣货目标（未拣货且有货位） */
.map-module.target { background: #F56C6C !important; }

/* 当前选中的行对应的 cell：强烈高亮+动画 */
.map-module.active-target {
  background: #E6A23C !important;
  box-shadow: 0 0 0 3px rgba(230, 162, 60, 0.5), 0 0 12px rgba(230, 162, 60, 0.6);
  transform: scale(1.15);
  z-index: 20;
  animation: active-bounce 0.8s infinite alternate;
}
@keyframes active-bounce {
  0% { transform: scale(1.15); box-shadow: 0 0 0 3px rgba(230, 162, 60, 0.5), 0 0 12px rgba(230, 162, 60, 0.6); }
  100% { transform: scale(1.25); box-shadow: 0 0 0 5px rgba(230, 162, 60, 0.3), 0 0 20px rgba(230, 162, 60, 0.4); }
}

/* 已完成 */
.map-module.done { background: #67C23A !important; }

.cell-icon { font-size: 14px; color: #fff; }
.cell-code { font-size: 9px; color: rgba(255,255,255,0.9); font-weight: 600; }

.pulse-ring {
  position: absolute;
  inset: -4px;
  border-radius: 8px;
  border: 2px solid #F56C6C;
  animation: ring-pulse 1.5s infinite;
}
@keyframes ring-pulse {
  0% { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(1.3); }
}
.done-badge { position: absolute; top: 2px; right: 2px; font-size: 10px; color: #fff; }

/* 底部提示条 */
.active-hint {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: linear-gradient(135deg, #ecf5ff, #f0f9ff);
  border-radius: 10px;
  margin-top: 8px;
  border: 1px solid #b3d8ff;
  flex-shrink: 0;
}
.hint-icon { font-size: 20px; }
.hint-body { flex: 1; }
.hint-product { font-size: 13px; font-weight: 600; color: #303133; }
.hint-location { font-size: 12px; color: #606266; margin-top: 2px; }

/* 动画 */
.line-fade-enter-active, .line-fade-leave-active { transition: all 0.3s ease; }
.line-fade-enter-from { opacity: 0; transform: translateX(-10px); }
.line-fade-leave-to { opacity: 0; transform: translateX(10px); }
.slide-up-enter-active, .slide-up-leave-active { transition: all 0.3s ease; }
.slide-up-enter-from { opacity: 0; transform: translateY(10px); }
.slide-up-leave-to { opacity: 0; transform: translateY(10px); }
</style>
