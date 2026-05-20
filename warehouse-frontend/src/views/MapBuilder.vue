<template>
  <div class="map-builder" tabindex="0" @keydown.delete.prevent="deleteSelected" @keydown.backspace.prevent="deleteSelected">
    <div class="builder-header">
      <div>
        <h1 class="page-title">🔧 仓库地图构建器</h1>
        <p class="page-subtitle">拖拽模块构建仓库布局，完成后保存并生成货位二维码</p>
      </div>
      <div class="header-actions">
        <el-button @click="clearCanvas" :disabled="cells.length === 0">清空画布</el-button>
        <el-button @click="showSaveDialog = true" type="primary" :disabled="cells.length === 0">
          <el-icon><Check /></el-icon> 保存布局
        </el-button>
      </div>
    </div>

    <div class="builder-body">
      <!-- 左侧模块面板 -->
      <div class="module-panel">
        <div class="panel-title">模块库</div>
        <div class="module-list">
          <div
            v-for="mod in modules"
            :key="mod.type"
            class="module-item"
            draggable="true"
            @dragstart="onModuleDragStart($event, mod)"
          >
            <div class="module-preview" :style="{ background: mod.color }">
              <span class="module-icon">{{ mod.icon }}</span>
            </div>
            <div class="module-info">
              <div class="module-name">{{ mod.name }}</div>
              <div class="module-desc">{{ mod.desc }}</div>
            </div>
          </div>
        </div>

        <div class="panel-title" style="margin-top:20px">画布设置</div>
        <div class="canvas-settings">
          <div class="setting-row">
            <span>列数</span>
            <el-input-number v-model="gridCols" :min="5" :max="30" size="small" style="width:90px" />
          </div>
          <div class="setting-row">
            <span>行数</span>
            <el-input-number v-model="gridRows" :min="5" :max="30" size="small" style="width:90px" />
          </div>
        </div>

        <div class="panel-title" style="margin-top:20px">选中模块</div>
        <div v-if="selectedCell" class="selected-info">
          <div class="info-row">
            <span>类型</span>
            <el-tag size="small">{{ getModuleName(selectedCell.type) }}</el-tag>
          </div>
          <div v-if="selectedCell.type.startsWith('shelf')" class="info-row">
            <span>货位编码</span>
            <el-input v-model="selectedCell.code" size="small" placeholder="如 A-01" @change="updateCell" />
          </div>
          <div v-if="selectedCell.type.startsWith('shelf')" class="info-row">
            <span>行数</span>
            <el-input-number v-model="selectedCell.rows" :min="1" :max="10" size="small" style="width:80px" @change="updateCell" />
          </div>
          <div v-if="selectedCell.type.startsWith('shelf')" class="info-row">
            <span>列数</span>
            <el-input-number v-model="selectedCell.cols" :min="1" :max="10" size="small" style="width:80px" @change="updateCell" />
          </div>
          <div class="info-row">
            <span>标签</span>
            <el-input v-model="selectedCell.label" size="small" placeholder="可选备注" @change="updateCell" />
          </div>
          <el-button type="danger" size="small" style="width:100%;margin-top:8px" @click="deleteSelected">
            <el-icon><Delete /></el-icon> 删除选中 (Del)
          </el-button>
        </div>
        <div v-else class="no-selection">点击画布上的模块进行编辑<br><span style="font-size:11px;color:#c0c4cc">选中后可按 Delete 键删除</span></div>
      </div>

      <!-- 右侧画布 -->
      <div class="canvas-wrapper" @click.self="selectedCell = null">
        <div
          ref="canvasRef"
          class="canvas-grid"
          :style="{ gridTemplateColumns: `repeat(${gridCols}, ${CELL_SIZE}px)`, gridTemplateRows: `repeat(${gridRows}, ${CELL_SIZE}px)` }"
          @dragover.prevent="onCanvasDragOver"
          @drop.prevent="onCanvasDrop"
          @dragleave.self="dragPreview = null"
          @click.self="selectedCell = null"
        >
          <!-- 空格子 -->
          <div
            v-for="idx in gridCols * gridRows"
            :key="`cell-${idx - 1}`"
            class="grid-cell"
            :data-idx="idx - 1"
          />

          <!-- 拖拽预览层（与实际方块等大，位置准确） -->
          <div
            v-if="dragPreview"
            class="drag-preview"
            :style="{
              gridColumn: `${dragPreview.col + 1} / span ${dragPreview.colSpan}`,
              gridRow: `${dragPreview.row + 1} / span ${dragPreview.rowSpan}`,
            }"
          />

          <!-- 放置的模块 -->
          <div
            v-for="cell in cells"
            :key="cell.id"
            class="placed-module"
            :class="{ selected: selectedCell?.id === cell.id }"
            :style="{
              gridColumn: `${cell.col + 1} / span ${cell.colSpan || 1}`,
              gridRow: `${cell.row + 1} / span ${cell.rowSpan || 1}`,
              background: getModuleColor(cell.type),
              cursor: 'grab',
            }"
            draggable="true"
            @dragstart="onCellDragStart($event, cell)"
            @click.stop="selectCell(cell)"
          >
            <span class="cell-icon">{{ getModuleIcon(cell.type) }}</span>
            <span class="cell-label">{{ cell.code || cell.label || '' }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 保存对话框 -->
    <el-dialog v-model="showSaveDialog" title="保存仓库布局" width="420px">
      <el-form :model="saveForm" label-position="top">
        <el-form-item label="布局名称" required>
          <el-input v-model="saveForm.name" placeholder="如：主仓库 2026" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="saveForm.description" type="textarea" :rows="2" placeholder="可选备注" />
        </el-form-item>
        <el-form-item label="">
          <el-checkbox v-model="saveForm.activate">保存后立即启用此布局</el-checkbox>
        </el-form-item>
      </el-form>
      <div class="save-summary">
        <el-tag>货架模块：{{ shelfCount }} 个</el-tag>
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
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Check, Delete } from '@element-plus/icons-vue'
import { layoutApi } from '@/api/index.js'

const router = useRouter()
const route = useRoute()

// 当前编辑的布局 ID（有则为编辑模式，无则为新建模式）
const currentLayoutId = ref(null)
const loading = ref(false)

// 每个格子的实际像素大小（含 gap）
// canvas-grid gap: 2px，grid-cell: 60px → 每格占 62px
const CELL_SIZE = 62

const gridCols = ref(12)
const gridRows = ref(10)
const cells = ref([])
const selectedCell = ref(null)
const showSaveDialog = ref(false)
const saving = ref(false)
const canvasRef = ref(null)

// 拖拽状态
const dragState = ref(null) // { type: 'new'|'move', mod?, cellId?, offsetCol, offsetRow, colSpan, rowSpan }

// 拖拽预览（显示将要放置的位置和大小）
const dragPreview = ref(null) // { col, row, colSpan, rowSpan }

const saveForm = ref({ name: '', description: '', activate: true })

const modules = [
  { type: 'shelf_h', name: '横向货架', desc: '水平方向货架', icon: '▬', color: '#409EFF', colSpan: 3, rowSpan: 1 },
  { type: 'shelf_v', name: '竖向货架', desc: '垂直方向货架', icon: '▮', color: '#409EFF', colSpan: 1, rowSpan: 3 },
  { type: 'shelf_corner', name: '拐角货架', desc: 'L形转角货架', icon: '⌐', color: '#67C23A', colSpan: 2, rowSpan: 2 },
  { type: 'aisle', name: '通道', desc: '人员通行区域', icon: '⟶', color: '#E6E6E6', colSpan: 1, rowSpan: 1 },
  { type: 'entrance', name: '出入口', desc: '仓库门/通道口', icon: '🚪', color: '#F56C6C', colSpan: 1, rowSpan: 1 },
  { type: 'wall', name: '墙壁', desc: '固定墙体', icon: '█', color: '#909399', colSpan: 1, rowSpan: 1 },
  { type: 'workstation', name: '工作台', desc: '打包/操作区', icon: '🖥', color: '#E6A23C', colSpan: 2, rowSpan: 1 },
]

const moduleMap = Object.fromEntries(modules.map(m => [m.type, m]))

function getModuleName(type) { return moduleMap[type]?.name || type }
function getModuleIcon(type) { return moduleMap[type]?.icon || '?' }
function getModuleColor(type) { return moduleMap[type]?.color || '#ccc' }

const shelfCount = computed(() => cells.value.filter(c => c.type.startsWith('shelf')).length)
const estimatedLocations = computed(() =>
  cells.value.filter(c => c.type.startsWith('shelf')).reduce((sum, c) => sum + (c.rows || 2) * (c.cols || 4), 0)
)

// 自动聚焦 + 加载现有布局
onMounted(async () => {
  const el = document.querySelector('.map-builder')
  if (el) el.focus()
  // 如果路由带有 id 参数，加载现有布局
  const id = route.query.id
  if (id) {
    loading.value = true
    try {
      const res = await layoutApi.get(id)
      const layout = res.data
      currentLayoutId.value = layout.id
      gridCols.value = layout.grid_cols || 12
      gridRows.value = layout.grid_rows || 10
      // layout_json 可能是字符串或数组
      const json = typeof layout.layout_json === 'string'
        ? JSON.parse(layout.layout_json)
        : (layout.layout_json || [])
      cells.value = json
      saveForm.value.name = layout.name
      saveForm.value.description = layout.description || ''
    } catch (err) {
      ElMessage.error('加载布局失败：' + (err.message || '未知错误'))
    } finally {
      loading.value = false
    }
  }
})

// 从模块面板开始拖拽新模块
function onModuleDragStart(e, mod) {
  dragState.value = {
    type: 'new',
    mod,
    offsetCol: 0,
    offsetRow: 0,
    colSpan: mod.colSpan || 1,
    rowSpan: mod.rowSpan || 1,
  }
  // 设置拖拽幽灵图像为模块预览（与实际大小一致）
  const ghost = document.createElement('div')
  ghost.style.cssText = `
    width: ${(mod.colSpan || 1) * CELL_SIZE - 2}px;
    height: ${(mod.rowSpan || 1) * CELL_SIZE - 2}px;
    background: ${mod.color};
    border-radius: 6px;
    opacity: 0.85;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    color: white;
    position: fixed;
    top: -9999px;
    left: -9999px;
  `
  ghost.textContent = mod.icon
  document.body.appendChild(ghost)
  // 锚点设在模块左上角（0,0），这样放置位置就是鼠标所在格子
  e.dataTransfer.setDragImage(ghost, 0, 0)
  setTimeout(() => document.body.removeChild(ghost), 0)
}

// 从画布上已有模块开始拖拽（移动）
function onCellDragStart(e, cell) {
  const rect = e.currentTarget.getBoundingClientRect()
  // 计算鼠标在模块内的格子偏移
  const offsetCol = Math.floor((e.clientX - rect.left) / CELL_SIZE)
  const offsetRow = Math.floor((e.clientY - rect.top) / CELL_SIZE)
  dragState.value = {
    type: 'move',
    cellId: cell.id,
    offsetCol: Math.max(0, Math.min(offsetCol, (cell.colSpan || 1) - 1)),
    offsetRow: Math.max(0, Math.min(offsetRow, (cell.rowSpan || 1) - 1)),
    colSpan: cell.colSpan || 1,
    rowSpan: cell.rowSpan || 1,
  }
  // 创建与实际方块等大的幽灵图像
  const ghost = document.createElement('div')
  ghost.style.cssText = `
    width: ${(cell.colSpan || 1) * CELL_SIZE - 2}px;
    height: ${(cell.rowSpan || 1) * CELL_SIZE - 2}px;
    background: ${getModuleColor(cell.type)};
    border-radius: 6px;
    opacity: 0.85;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    color: white;
    position: fixed;
    top: -9999px;
    left: -9999px;
  `
  ghost.textContent = getModuleIcon(cell.type)
  document.body.appendChild(ghost)
  // 锚点设在鼠标在模块内的实际像素位置
  const anchorX = offsetCol * CELL_SIZE + Math.floor(CELL_SIZE / 2)
  const anchorY = offsetRow * CELL_SIZE + Math.floor(CELL_SIZE / 2)
  e.dataTransfer.setDragImage(ghost, anchorX, anchorY)
  setTimeout(() => document.body.removeChild(ghost), 0)
  e.stopPropagation()
}

// 计算鼠标在画布上对应的格子坐标
function getGridPos(e) {
  if (!canvasRef.value) return null
  const rect = canvasRef.value.getBoundingClientRect()
  // canvas-grid 有 4px padding
  const x = e.clientX - rect.left - 4
  const y = e.clientY - rect.top - 4
  const col = Math.floor(x / CELL_SIZE)
  const row = Math.floor(y / CELL_SIZE)
  if (col < 0 || col >= gridCols.value || row < 0 || row >= gridRows.value) return null
  return { col, row }
}

function onCanvasDragOver(e) {
  e.preventDefault()
  const pos = getGridPos(e)
  if (!pos || !dragState.value) { dragPreview.value = null; return }
  const { offsetCol, offsetRow, colSpan, rowSpan } = dragState.value
  const targetCol = Math.max(0, Math.min(pos.col - offsetCol, gridCols.value - colSpan))
  const targetRow = Math.max(0, Math.min(pos.row - offsetRow, gridRows.value - rowSpan))
  dragPreview.value = { col: targetCol, row: targetRow, colSpan, rowSpan }
}

function onCanvasDrop(e) {
  e.preventDefault()
  const preview = dragPreview.value
  dragPreview.value = null
  if (!preview || !dragState.value) return

  const { col, row } = preview

  if (dragState.value.type === 'new') {
    const mod = dragState.value.mod
    const id = `cell_${Date.now()}`
    cells.value.push({
      id,
      type: mod.type,
      row,
      col,
      colSpan: mod.colSpan || 1,
      rowSpan: mod.rowSpan || 1,
      code: mod.type.startsWith('shelf') ? `${String.fromCharCode(65 + cells.value.filter(c => c.type.startsWith('shelf')).length)}-01` : '',
      label: '',
      rows: mod.type.startsWith('shelf') ? 2 : 1,
      cols: mod.type.startsWith('shelf') ? 4 : 1,
    })
  } else if (dragState.value.type === 'move') {
    const cell = cells.value.find(c => c.id === dragState.value.cellId)
    if (cell) {
      cell.col = col
      cell.row = row
    }
  }
  dragState.value = null
}

function selectCell(cell) {
  selectedCell.value = { ...cell }
  // 确保组件获得焦点以响应键盘事件
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

async function saveLayout() {
  if (!saveForm.value.name.trim()) {
    ElMessage.warning('请输入布局名称')
    return
  }
  saving.value = true
  try {
    let layoutId = currentLayoutId.value
    // 如果是新建模式，先创建空布局
    if (!layoutId) {
      const createRes = await layoutApi.create({
        name: saveForm.value.name,
        description: saveForm.value.description,
        grid_cols: gridCols.value,
        grid_rows: gridRows.value,
      })
      layoutId = createRes.data.id
    }
    // 保存布局内容（layout_json + 同步货位）
    const updateRes = await layoutApi.update(layoutId, {
      name: saveForm.value.name,
      description: saveForm.value.description,
      grid_cols: gridCols.value,
      grid_rows: gridRows.value,
      layout_json: cells.value,
    })
    // 如果勾选了启用，激活布局
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
.map-builder { animation: fadeIn 0.3s ease; outline: none; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.builder-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; }
.page-title { font-size: 22px; font-weight: 700; color: #1a1a2e; margin: 0 0 4px; }
.page-subtitle { color: #909399; font-size: 13px; }
.header-actions { display: flex; gap: 10px; }
.builder-body { display: flex; gap: 20px; height: calc(100vh - 160px); }
.module-panel {
  width: 220px;
  flex-shrink: 0;
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
  overflow-y: auto;
}
.panel-title { font-size: 12px; font-weight: 600; color: #909399; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; }
.module-list { display: flex; flex-direction: column; gap: 8px; }
.module-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid #f0f0f0;
  cursor: grab;
  transition: background 0.15s, transform 0.15s;
  user-select: none;
}
.module-item:hover { background: #f5f7ff; transform: translateX(2px); }
.module-item:active { cursor: grabbing; }
.module-preview { width: 36px; height: 36px; border-radius: 6px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.module-icon { font-size: 16px; color: #fff; }
.module-name { font-size: 13px; font-weight: 600; color: #303133; }
.module-desc { font-size: 11px; color: #909399; }
.canvas-settings { display: flex; flex-direction: column; gap: 8px; }
.setting-row { display: flex; align-items: center; justify-content: space-between; font-size: 13px; color: #606266; }
.selected-info { display: flex; flex-direction: column; gap: 8px; }
.info-row { display: flex; align-items: center; justify-content: space-between; font-size: 13px; gap: 8px; }
.info-row span:first-child { color: #909399; flex-shrink: 0; }
.no-selection { font-size: 12px; color: #c0c4cc; text-align: center; padding: 12px 0; line-height: 1.8; }
.canvas-wrapper {
  flex: 1;
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
  overflow: auto;
}
.canvas-grid {
  display: grid;
  gap: 2px;
  position: relative;
  background: #f5f6fa;
  border-radius: 8px;
  padding: 4px;
  min-width: fit-content;
}
.grid-cell {
  width: 60px;
  height: 60px;
  border: 1px dashed #e0e0e0;
  border-radius: 4px;
  transition: background 0.1s;
}
/* 拖拽预览层：与实际方块等大，半透明蓝色 */
.drag-preview {
  border-radius: 6px;
  background: rgba(64, 158, 255, 0.25);
  border: 2px dashed #409EFF;
  z-index: 5;
  pointer-events: none;
  position: relative;
}
.placed-module {
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border: 2px solid transparent;
  transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
  z-index: 10;
  position: relative;
}
.placed-module:hover { transform: scale(1.03); box-shadow: 0 4px 16px rgba(0,0,0,0.18); }
.placed-module.selected { border-color: #1a1a2e; box-shadow: 0 0 0 3px rgba(26,26,46,0.2); }
.cell-icon { font-size: 18px; color: #fff; }
.cell-label { font-size: 10px; color: rgba(255,255,255,0.9); font-weight: 600; text-align: center; max-width: 54px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.save-summary { margin-top: 12px; padding: 10px; background: #f5f7ff; border-radius: 8px; }
</style>
