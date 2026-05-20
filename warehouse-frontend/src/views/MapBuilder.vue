<template>
  <div class="map-builder" tabindex="0" @keydown.delete.prevent="deleteSelected" @keydown.backspace.prevent="deleteSelected">
    <div class="builder-header">
      <div>
        <h1 class="page-title">🔧 仓库地图构建器</h1>
        <p class="page-subtitle">选择工具后在画布上拖拉绘制；相邻同类元素自动合并；点击已有元素可编辑</p>
      </div>
      <div class="header-actions">
        <el-button @click="clearCanvas" :disabled="cells.length === 0">清空画布</el-button>
        <el-button @click="openSaveDialog" type="primary" :disabled="cells.length === 0">
          <el-icon><Check /></el-icon> 保存布局
        </el-button>
      </div>
    </div>

    <div class="builder-body">
      <!-- 左侧工具面板 -->
      <div class="module-panel">
        <div class="panel-title">绘制工具</div>
        <div class="tool-list">
          <div
            v-for="mod in modules"
            :key="mod.type"
            class="tool-item"
            :class="{ active: activeTool === mod.type }"
            @click="activeTool = mod.type; selectedCell = null"
          >
            <div class="tool-preview" :style="{ background: mod.color }">
              <span class="tool-icon">{{ mod.icon }}</span>
            </div>
            <div class="tool-info">
              <div class="tool-name">{{ mod.name }}</div>
              <div class="tool-desc">{{ mod.desc }}</div>
            </div>
          </div>
        </div>

        <div class="panel-title" style="margin-top:20px">画布设置</div>
        <div class="canvas-settings">
          <div class="setting-row">
            <span>列数</span>
            <el-input-number v-model="gridCols" :min="5" :max="40" size="small" style="width:90px" />
          </div>
          <div class="setting-row">
            <span>行数</span>
            <el-input-number v-model="gridRows" :min="5" :max="40" size="small" style="width:90px" />
          </div>
        </div>

        <div class="panel-title" style="margin-top:20px">选中元素</div>
        <div v-if="selectedCell" class="selected-info">
          <div class="info-row">
            <span>类型</span>
            <el-tag size="small">{{ getModuleName(selectedCell.type) }}</el-tag>
          </div>
          <template v-if="selectedCell.type.startsWith('shelf')">
            <div class="info-row">
              <span>编码前缀</span>
              <el-input v-model="selectedCell.code" size="small" placeholder="如 A" @input="updateCell" style="width:80px" />
            </div>
            <div class="info-row">
              <span>层数</span>
              <el-input-number v-model="selectedCell.levels" :min="1" :max="10" size="small" style="width:80px" @change="updateCell" />
            </div>
            <div class="info-row">
              <span>货位数</span>
              <el-tag size="small" type="success">{{ (selectedCell.colSpan||1)*(selectedCell.rowSpan||1) }} 格 × {{ selectedCell.levels||1 }} 层</el-tag>
            </div>
          </template>
          <div class="info-row" v-if="!selectedCell.type.startsWith('shelf')">
            <span>标签</span>
            <el-input v-model="selectedCell.label" size="small" placeholder="可选" @input="updateCell" />
          </div>
          <el-button type="danger" size="small" style="width:100%;margin-top:8px" @click="deleteSelected">
            <el-icon><Delete /></el-icon> 删除 (Del)
          </el-button>
        </div>
        <div v-else class="no-selection">
          {{ activeTool ? `当前工具：${getModuleName(activeTool)}` : '请选择工具' }}<br>
          <span style="font-size:11px;color:#c0c4cc">在画布上拖拉绘制</span>
        </div>

        <!-- 统计 -->
        <div class="stats-box" style="margin-top:20px">
          <div class="stat-item">
            <span class="stat-label">货架格子</span>
            <el-tag size="small">{{ shelfCount }}</el-tag>
          </div>
          <div class="stat-item">
            <span class="stat-label">预计货位</span>
            <el-tag size="small" type="success">{{ estimatedLocations }}</el-tag>
          </div>
        </div>
      </div>

      <!-- 右侧画布 -->
      <div class="canvas-wrapper">
        <div
          ref="canvasRef"
          class="canvas-grid"
          :style="{
            gridTemplateColumns: `repeat(${gridCols}, ${CELL_SIZE}px)`,
            gridTemplateRows: `repeat(${gridRows}, ${CELL_SIZE}px)`,
            cursor: activeTool ? 'crosshair' : 'default'
          }"
          @mousedown="onCanvasMouseDown"
          @mousemove="onCanvasMouseMove"
          @mouseup="onCanvasMouseUp"
          @mouseleave="onCanvasMouseLeave"
          @click.self="selectedCell = null"
        >
          <!-- 空格子 -->
          <div
            v-for="idx in gridCols * gridRows"
            :key="`cell-${idx - 1}`"
            class="grid-cell"
          />

          <!-- 拖拉预览层 -->
          <div
            v-if="drawPreview"
            class="draw-preview"
            :style="{
              gridColumn: `${drawPreview.col + 1} / span ${drawPreview.colSpan}`,
              gridRow: `${drawPreview.row + 1} / span ${drawPreview.rowSpan}`,
              background: getModuleColor(activeTool) + '55',
              borderColor: getModuleColor(activeTool),
            }"
          />

          <!-- 已放置的元素 -->
          <div
            v-for="cell in cells"
            :key="cell.id"
            class="placed-module"
            :class="{ selected: selectedCell?.id === cell.id }"
            :style="{
              gridColumn: `${cell.col + 1} / span ${cell.colSpan || 1}`,
              gridRow: `${cell.row + 1} / span ${cell.rowSpan || 1}`,
              background: getModuleColor(cell.type),
              cursor: activeTool ? 'crosshair' : 'pointer',
            }"
            @mousedown.stop="onCellMouseDown($event, cell)"
            @click.stop="!activeTool && selectCell(cell)"
          >
            <span class="cell-icon">{{ getModuleIcon(cell.type) }}</span>
            <span class="cell-label">{{ getCellLabel(cell) }}</span>
            <span v-if="cell.type.startsWith('shelf') && cell.levels > 1" class="cell-levels">{{ cell.levels }}层</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 保存对话框 -->
    <el-dialog v-model="showSaveDialog" title="保存仓库布局" width="420px" :close-on-click-modal="false">
      <el-form :model="saveForm" label-position="top">
        <el-form-item label="布局名称" required>
          <el-input
            v-model="saveForm.name"
            placeholder="如：主仓库 2026"
            clearable
            autofocus
          />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="saveForm.description" type="textarea" :rows="2" placeholder="可选备注" />
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="saveForm.activate">保存后立即启用此布局</el-checkbox>
        </el-form-item>
      </el-form>
      <div class="save-summary">
        <el-tag>货架格子：{{ shelfCount }} 个</el-tag>
        <el-tag type="success" style="margin-left:8px">预计货位：{{ estimatedLocations }} 个</el-tag>
      </div>
      <template #footer>
        <el-button @click="showSaveDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveLayout">保存并生成货位</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Check, Delete } from '@element-plus/icons-vue'
import { layoutApi } from '@/api/index.js'

const router = useRouter()
const route = useRoute()

const currentLayoutId = ref(null)
const CELL_SIZE = 62

const gridCols = ref(16)
const gridRows = ref(12)
const cells = ref([])
const selectedCell = ref(null)
const showSaveDialog = ref(false)
const saving = ref(false)
const canvasRef = ref(null)

const activeTool = ref('shelf_h')
const drawState = ref(null)
const drawPreview = ref(null)
const moveState = ref(null)

// 保存表单 — 使用独立对象，不共享引用
const saveForm = ref({ name: '', description: '', activate: true })

const modules = [
  { type: 'shelf_h', name: '货架', desc: '拖拉绘制货架区域', icon: '▬', color: '#409EFF' },
  { type: 'wall', name: '墙壁', desc: '拖拉绘制墙体', icon: '█', color: '#909399' },
  { type: 'entrance', name: '门/出入口', desc: '拖拉绘制出入口', icon: '🚪', color: '#F56C6C' },
  { type: 'aisle', name: '通道', desc: '拖拉绘制通道区域', icon: '⟶', color: '#E0E0E0' },
  { type: 'workstation', name: '工作台', desc: '拖拉绘制工作区', icon: '🖥', color: '#E6A23C' },
  { type: 'pillar', name: '柱子', desc: '拖拉绘制柱子', icon: '◼', color: '#606266' },
]

const moduleMap = Object.fromEntries(modules.map(m => [m.type, m]))

function getModuleName(type) { return moduleMap[type]?.name || type }
function getModuleIcon(type) { return moduleMap[type]?.icon || '?' }
function getModuleColor(type) { return moduleMap[type]?.color || '#ccc' }

function getCellLabel(cell) {
  if (cell.type.startsWith('shelf')) return cell.code || ''
  return cell.label || ''
}

const shelfCount = computed(() =>
  cells.value.filter(c => c.type.startsWith('shelf'))
    .reduce((sum, c) => sum + (c.colSpan || 1) * (c.rowSpan || 1), 0)
)
const estimatedLocations = computed(() =>
  cells.value.filter(c => c.type.startsWith('shelf')).reduce((sum, c) => {
    const slots = (c.colSpan || 1) * (c.rowSpan || 1)
    const levels = c.levels || 1
    return sum + slots * levels
  }, 0)
)

// ── 加载现有布局 ──────────────────────────────────────────────────────────
onMounted(async () => {
  const el = document.querySelector('.map-builder')
  if (el) el.focus()
  const id = route.query.id
  if (id) {
    try {
      const res = await layoutApi.get(id)
      const layout = res.data
      currentLayoutId.value = layout.id
      gridCols.value = layout.grid_cols || 16
      gridRows.value = layout.grid_rows || 12
      const json = typeof layout.layout_json === 'string'
        ? JSON.parse(layout.layout_json)
        : (layout.layout_json || [])
      cells.value = json
      // 用独立字符串赋值，避免引用问题
      saveForm.value = {
        name: String(layout.name || ''),
        description: String(layout.description || ''),
        activate: true,
      }
    } catch (err) {
      ElMessage.error('加载布局失败：' + (err.message || '未知错误'))
    }
  }
})

// ── 打开保存对话框 ─────────────────────────────────────────────────────────
function openSaveDialog() {
  // 确保每次打开时 name 是可编辑的新字符串
  saveForm.value = {
    name: String(saveForm.value.name || ''),
    description: String(saveForm.value.description || ''),
    activate: saveForm.value.activate,
  }
  showSaveDialog.value = true
}

// ── 坐标计算 ────────────────────────────────────────────────────────────────
function getGridPos(e) {
  if (!canvasRef.value) return null
  const rect = canvasRef.value.getBoundingClientRect()
  const x = e.clientX - rect.left - 4
  const y = e.clientY - rect.top - 4
  const col = Math.floor(x / CELL_SIZE)
  const row = Math.floor(y / CELL_SIZE)
  if (col < 0 || col >= gridCols.value || row < 0 || row >= gridRows.value) return null
  return { col, row }
}

// ── 自动合并：将新绘制的矩形与真正重叠的同类型元素合并 ──────────────────────────
function tryMerge(newCell) {
  const type = newCell.type
  // 货架保持独立以便编码
  if (type.startsWith('shelf')) return newCell

  const newLeft = newCell.col
  const newRight = newCell.col + newCell.colSpan - 1
  const newTop = newCell.row
  const newBottom = newCell.row + newCell.rowSpan - 1

  // 只合并真正重叠（有公共格子）的同类型元素，不合并仅相邻的
  const overlapping = cells.value.filter(c => {
    if (c.type !== type) return false
    const cLeft = c.col
    const cRight = c.col + (c.colSpan || 1) - 1
    const cTop = c.row
    const cBottom = c.row + (c.rowSpan || 1) - 1
    // 严格重叠：两个矩形有公共格子
    const horizOverlap = newLeft <= cRight && newRight >= cLeft
    const vertOverlap = newTop <= cBottom && newBottom >= cTop
    return horizOverlap && vertOverlap
  })

  if (overlapping.length === 0) return newCell

  // 计算合并后的包围盒
  let minCol = newLeft, maxCol = newRight
  let minRow = newTop, maxRow = newBottom

  for (const c of overlapping) {
    minCol = Math.min(minCol, c.col)
    maxCol = Math.max(maxCol, c.col + (c.colSpan || 1) - 1)
    minRow = Math.min(minRow, c.row)
    maxRow = Math.max(maxRow, c.row + (c.rowSpan || 1) - 1)
  }

  // 删除被合并的旧元素
  const overlappingIds = new Set(overlapping.map(c => c.id))
  cells.value = cells.value.filter(c => !overlappingIds.has(c.id))

  // 返回合并后的大元素
  return {
    ...newCell,
    col: minCol,
    row: minRow,
    colSpan: maxCol - minCol + 1,
    rowSpan: maxRow - minRow + 1,
  }
}

// ── 画布鼠标事件（绘制新元素） ────────────────────────────────────────────
function onCanvasMouseDown(e) {
  if (e.button !== 0) return
  if (moveState.value) return
  const pos = getGridPos(e)
  if (!pos) return
  drawState.value = { startCol: pos.col, startRow: pos.row }
  drawPreview.value = { col: pos.col, row: pos.row, colSpan: 1, rowSpan: 1 }
}

function onCanvasMouseMove(e) {
  if (drawState.value) {
    const pos = getGridPos(e)
    if (!pos) return
    const { startCol, startRow } = drawState.value
    const col = Math.min(startCol, pos.col)
    const row = Math.min(startRow, pos.row)
    const colSpan = Math.abs(pos.col - startCol) + 1
    const rowSpan = Math.abs(pos.row - startRow) + 1
    drawPreview.value = { col, row, colSpan, rowSpan }
    return
  }
  if (moveState.value) {
    const pos = getGridPos(e)
    if (!pos) return
    const { cellId, offsetCol, offsetRow } = moveState.value
    const cell = cells.value.find(c => c.id === cellId)
    if (!cell) return
    const newCol = Math.max(0, Math.min(pos.col - offsetCol, gridCols.value - (cell.colSpan || 1)))
    const newRow = Math.max(0, Math.min(pos.row - offsetRow, gridRows.value - (cell.rowSpan || 1)))
    cell.col = newCol
    cell.row = newRow
  }
}

function onCanvasMouseUp(e) {
  if (drawState.value && drawPreview.value) {
    const { col, row, colSpan, rowSpan } = drawPreview.value
    const shelfCount = cells.value.filter(c => c.type.startsWith('shelf')).length
    let newCell = {
      id: `cell_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: activeTool.value,
      col, row, colSpan, rowSpan,
      code: activeTool.value.startsWith('shelf')
        ? String.fromCharCode(65 + (shelfCount % 26))
        : '',
      label: '',
      levels: activeTool.value.startsWith('shelf') ? 1 : undefined,
    }
    // 尝试与相邻同类元素合并
    newCell = tryMerge(newCell)
    cells.value.push(newCell)
    drawState.value = null
    drawPreview.value = null
    return
  }
  if (moveState.value) {
    moveState.value = null
  }
}

function onCanvasMouseLeave() {
  if (drawState.value && drawPreview.value) {
    onCanvasMouseUp()
  }
  if (moveState.value) {
    moveState.value = null
  }
}

// ── 已有元素的鼠标事件（选中 / 移动） ────────────────────────────────────
function onCellMouseDown(e, cell) {
  if (activeTool.value) return
  if (e.button !== 0) return
  const pos = getGridPos(e)
  if (!pos) return
  const offsetCol = pos.col - cell.col
  const offsetRow = pos.row - cell.row
  moveState.value = { cellId: cell.id, offsetCol, offsetRow }
  selectedCell.value = { ...cell }
}

function selectCell(cell) {
  selectedCell.value = { ...cell }
  const el = document.querySelector('.map-builder')
  if (el) el.focus()
}

function updateCell() {
  const idx = cells.value.findIndex(c => c.id === selectedCell.value.id)
  if (idx >= 0) cells.value[idx] = { ...selectedCell.value }
}

function deleteSelected() {
  if (!selectedCell.value) return
  cells.value = cells.value.filter(c => c.id !== selectedCell.value.id)
  selectedCell.value = null
  ElMessage.success('已删除')
}

function clearCanvas() {
  cells.value = []
  selectedCell.value = null
}

// ── 保存布局 ─────────────────────────────────────────────────────────────
async function saveLayout() {
  if (!saveForm.value.name.trim()) {
    ElMessage.warning('请输入布局名称')
    return
  }
  saving.value = true
  try {
    let layoutId = currentLayoutId.value
    if (!layoutId) {
      const createRes = await layoutApi.create({
        name: saveForm.value.name,
        description: saveForm.value.description,
        grid_cols: gridCols.value,
        grid_rows: gridRows.value,
      })
      layoutId = createRes.data.id
      currentLayoutId.value = layoutId
    }
    const updateRes = await layoutApi.update(layoutId, {
      name: saveForm.value.name,
      description: saveForm.value.description,
      grid_cols: gridCols.value,
      grid_rows: gridRows.value,
      layout_json: cells.value,
    })
    if (saveForm.value.activate) {
      await layoutApi.activate(layoutId)
    }
    const locationCount = updateRes.data?.locations?.length || 0
    ElMessage.success(`布局已保存，共 ${locationCount} 个货位`)
    showSaveDialog.value = false
    router.push('/map')
  } catch (err) {
    ElMessage.error(err.message || '保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.map-builder { animation: fadeIn 0.3s ease; outline: none; user-select: none; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.builder-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; }
.page-title { font-size: 22px; font-weight: 700; color: #1a1a2e; margin: 0 0 4px; }
.page-subtitle { color: #909399; font-size: 13px; }
.header-actions { display: flex; gap: 10px; }
.builder-body { display: flex; gap: 20px; height: calc(100vh - 160px); }

/* 左侧面板 */
.module-panel { width: 220px; flex-shrink: 0; background: #fff; border-radius: 12px; padding: 16px; box-shadow: 0 2px 12px rgba(0,0,0,.06); overflow-y: auto; }
.panel-title { font-size: 12px; font-weight: 600; color: #909399; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 8px; }
.tool-list { display: flex; flex-direction: column; gap: 6px; }
.tool-item { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; cursor: pointer; border: 2px solid transparent; transition: all .15s; }
.tool-item:hover { background: #f5f7fa; }
.tool-item.active { border-color: #409EFF; background: #ecf5ff; }
.tool-preview { width: 32px; height: 32px; border-radius: 6px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.tool-icon { font-size: 14px; color: #fff; }
.tool-name { font-size: 13px; font-weight: 600; color: #303133; }
.tool-desc { font-size: 11px; color: #909399; }

.canvas-settings { display: flex; flex-direction: column; gap: 8px; }
.setting-row { display: flex; align-items: center; justify-content: space-between; font-size: 13px; color: #606266; }

.selected-info { display: flex; flex-direction: column; gap: 8px; }
.info-row { display: flex; align-items: center; justify-content: space-between; font-size: 13px; color: #606266; }
.no-selection { font-size: 12px; color: #c0c4cc; text-align: center; padding: 12px 0; line-height: 1.8; }

.stats-box { display: flex; flex-direction: column; gap: 6px; }
.stat-item { display: flex; align-items: center; justify-content: space-between; font-size: 13px; color: #606266; }
.stat-label { color: #909399; }

/* 画布 */
.canvas-wrapper { flex: 1; overflow: auto; background: #f8f9fb; border-radius: 12px; padding: 16px; box-shadow: 0 2px 12px rgba(0,0,0,.06); }
.canvas-grid { position: relative; display: grid; gap: 2px; width: fit-content; }
.grid-cell { background: #fff; border: 1px dashed #dcdfe6; border-radius: 4px; }

/* 预览层 */
.draw-preview {
  position: absolute;
  border: 2px dashed;
  border-radius: 6px;
  pointer-events: none;
  z-index: 5;
  grid-column: var(--gc);
  grid-row: var(--gr);
}

/* 已放置元素 */
.placed-module {
  position: relative;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border: 2px solid transparent;
  transition: border-color .15s, box-shadow .15s;
  z-index: 2;
}
.placed-module.selected { border-color: #fff; box-shadow: 0 0 0 3px #409EFF; }
.cell-icon { font-size: 16px; line-height: 1; }
.cell-label { font-size: 11px; font-weight: 700; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.3); }
.cell-levels { font-size: 10px; color: rgba(255,255,255,.8); background: rgba(0,0,0,.2); border-radius: 3px; padding: 0 3px; }

.save-summary { display: flex; margin-top: 12px; }
</style>
