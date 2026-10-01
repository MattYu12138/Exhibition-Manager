<template>
  <div class="map-builder" @keydown="onKeyDown" tabindex="0" ref="builderRef">
    <!-- Top toolbar -->
    <div class="toolbar">
      <div class="tool-group">
        <button
          v-for="tool in tools"
          :key="tool.type"
          class="tool-btn"
          :class="{ active: activeTool === tool.type }"
          @click="activeTool = tool.type"
          :title="$t(tool.labelKey)"
        >
          <span class="tool-icon">{{ tool.icon }}</span>
          <span class="tool-label">{{ $t(tool.labelKey) }}</span>
        </button>
      </div>
      <div class="tool-sep"></div>
      <div class="tool-group canvas-controls">
        <span class="control-caption">{{ $t('mapBuilder.canvas') }}</span>
        <el-input-number v-model="gridCols" :min="10" :max="120" size="small" :controls="false" :aria-label="$t('warehouseMap.gridColumns')" @change="validateGrid" />
        <span>×</span>
        <el-input-number v-model="gridRows" :min="8" :max="120" size="small" :controls="false" :aria-label="$t('warehouseMap.gridRows')" @change="validateGrid" />
        <el-button-group size="small">
          <el-button @click="zoomOut" :aria-label="$t('mapBuilder.zoomOut')">−</el-button>
          <el-button @click="fitCanvas">{{ $t('mapBuilder.fit') }}</el-button>
          <el-button @click="zoomIn" :aria-label="$t('mapBuilder.zoomIn')">+</el-button>
        </el-button-group>
        <span class="zoom-value">{{ Math.round(zoom * 100) }}%</span>
      </div>
      <div class="tool-sep"></div>
      <div class="tool-group">
        <button class="tool-btn" @click="undo" :disabled="history.length === 0" :title="$t('mapBuilder.undoShortcut')">
          <span class="tool-icon">↩</span>
          <span class="tool-label">{{ $t('mapBuilder.undo') }}</span>
        </button>
        <button class="tool-btn danger" @click="clearAll" :title="$t('mapBuilder.clearCanvas')">
          <span class="tool-icon">🗑</span>
          <span class="tool-label">{{ $t('mapBuilder.clear') }}</span>
        </button>
      </div>
      <div class="spacer"></div>
      <div class="tool-group">
        <button class="tool-btn primary" @click="openSaveDialog">
          <span class="tool-icon">💾</span>
          <span class="tool-label">{{ $t('mapBuilder.saveLayout') }}</span>
        </button>
        <button class="tool-btn" @click="goBack">
          <span class="tool-icon">←</span>
          <span class="tool-label">{{ $t('mapBuilder.back') }}</span>
        </button>
      </div>
    </div>

    <div class="builder-body">
      <!-- Left panel -->
      <div class="side-panel" v-if="selectedRegion">
        <div class="panel-title">{{ $t('mapBuilder.properties') }}</div>
        <div class="panel-section">
          <label>{{ $t('mapBuilder.type') }}</label>
          <div class="type-badge" :style="{ background: typeConfig[selectedRegion.type]?.color }">
            {{ typeConfig[selectedRegion.type]?.icon }} {{ $t(typeConfig[selectedRegion.type]?.labelKey || 'mapBuilder.type') }}
          </div>
        </div>
        <template v-if="selectedRegion.type === 'shelf'">
          <div class="panel-section">
            <label>{{ $t('mapBuilder.codePrefix') }}</label>
            <el-select v-model="selectedRegion.code" style="width:100%" :placeholder="$t('mapBuilder.selectPrefix')">
              <el-option
                v-for="letter in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')"
                :key="letter"
                :label="letter"
                :value="letter"
                :disabled="isCodeUsedByOther(letter, selectedRegion.id)"
              >
                <span>{{ letter }}</span>
                <span v-if="isCodeUsedByOther(letter, selectedRegion.id)" style="color:#aaa;font-size:12px;margin-left:6px">({{ $t('mapBuilder.used') }})</span>
              </el-option>
            </el-select>
          </div>
          <div class="panel-section">
            <label>{{ $t('mapBuilder.levels') }}</label>
            <div class="number-input">
              <button @click="selectedRegion.levels = Math.max(1, (selectedRegion.levels||1) - 1)">−</button>
              <span>{{ selectedRegion.levels || 1 }}</span>
              <button @click="selectedRegion.levels = Math.min(10, (selectedRegion.levels||1) + 1)">+</button>
            </div>
          </div>
          <div class="panel-section">
            <label>{{ $t('mapBuilder.locationStats') }}</label>
            <div class="info-text">
              {{ $t('mapBuilder.regionStats', { cells: getRegionCells(selectedRegion).length,
                levels: selectedRegion.levels || 1,
                locations: getRegionCells(selectedRegion).length * (selectedRegion.levels || 1) }) }}
            </div>
          </div>
        </template>
        <div class="panel-section">
          <button class="delete-btn" @click="deleteSelected">🗑 {{ $t('mapBuilder.deleteRegion') }}</button>
        </div>
      </div>
      <div class="side-panel empty" v-else>
        <div class="panel-hint">
          <div class="hint-icon">{{ typeConfig[activeTool]?.icon }}</div>
          <div class="hint-title">{{ $t(typeConfig[activeTool]?.labelKey || 'mapBuilder.type') }}</div>
          <div class="hint-desc">{{ $t('mapBuilder.dragToDraw') }}</div>
          <div class="hint-tips">
            <div>• {{ $t('mapBuilder.clickToSelect') }}</div>
            <div>• {{ $t('mapBuilder.deleteShortcut') }}</div>
            <div>• {{ $t('mapBuilder.undoTip') }}</div>
          </div>
        </div>
      </div>

      <!-- SVG Canvas -->
      <div class="canvas-wrap" ref="canvasWrap">
        <svg
          ref="svgEl"
          class="map-svg"
          :width="renderWidth"
          :height="renderHeight"
          :viewBox="`0 0 ${svgWidth} ${svgHeight}`"
          @mousedown="onMouseDown"
          @mousemove="onMouseMove"
          @mouseup="onMouseUp"
          @mouseleave="onMouseLeave"
        >
          <!-- Grid pattern -->
          <defs>
            <pattern id="grid-pat" :width="cellSize" :height="cellSize" patternUnits="userSpaceOnUse">
              <rect :width="cellSize" :height="cellSize" fill="none" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="3,3"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid-pat)" />

          <!-- Regions -->
          <g v-for="region in regions" :key="region.id">
            <!-- Main shape outline path -->
            <path
              :d="buildOutlinePath(region)"
              :fill="typeConfig[region.type]?.color"
              :fill-opacity="selectedRegion?.id === region.id ? 0.95 : 0.82"
              :stroke="selectedRegion?.id === region.id ? '#1d4ed8' : typeConfig[region.type]?.stroke"
              :stroke-width="selectedRegion?.id === region.id ? 2.5 : 1.5"
              class="region-shape"
              :class="{ selected: selectedRegion?.id === region.id }"
              @click.stop="selectRegion(region)"
            />

            <!-- Shelf: individual cell dividers and labels -->
            <template v-if="region.type === 'shelf'">
              <g v-for="(cell, idx) in getRegionCells(region)" :key="`${cell.col}-${cell.row}`"
                 @click.stop="selectRegion(region)">
                <!-- Cell border -->
                <rect
                  :x="cell.col * cellSize + 1.5"
                  :y="cell.row * cellSize + 1.5"
                  :width="cellSize - 3"
                  :height="cellSize - 3"
                  fill="none"
                  stroke="rgba(255,255,255,0.35)"
                  stroke-width="1"
                  rx="4"
                />
                <!-- Slot code label -->
                <text
                  :x="cell.col * cellSize + cellSize / 2"
                  :y="cell.row * cellSize + cellSize * 0.55"
                  text-anchor="middle"
                  dominant-baseline="middle"
                  font-size="11"
                  font-weight="700"
                  fill="white"
                  pointer-events="none"
                >{{ getSlotCode(region, idx) }}</text>
                <!-- Levels indicator -->
                <text
                  v-if="(region.levels||1) > 1"
                  :x="cell.col * cellSize + cellSize - 4"
                  :y="cell.row * cellSize + 10"
                  text-anchor="end"
                  font-size="9"
                  fill="rgba(255,255,255,0.8)"
                  pointer-events="none"
                >×{{ region.levels }}</text>
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
                @click.stop="selectRegion(region)"
              >{{ typeConfig[region.type]?.icon }}</text>
            </template>
          </g>

          <!-- Draw preview -->
          <rect
            v-if="isDrawing && drawPreview"
            :x="drawPreview.x + 1"
            :y="drawPreview.y + 1"
            :width="drawPreview.w - 2"
            :height="drawPreview.h - 2"
            :fill="typeConfig[activeTool]?.color"
            fill-opacity="0.3"
            :stroke="typeConfig[activeTool]?.stroke"
            stroke-width="2"
            stroke-dasharray="8,4"
            rx="6"
            pointer-events="none"
          />
        </svg>
      </div>
    </div>

    <!-- Save dialog -->
    <div class="dialog-overlay" v-if="showSaveDialog" @click.self="showSaveDialog = false">
      <div class="dialog">
        <div class="dialog-header">
          <h3>{{ $t('mapBuilder.saveDialogTitle') }}</h3>
          <button class="dialog-close" @click="showSaveDialog = false">×</button>
        </div>
        <div class="dialog-body">
          <div class="form-group">
            <label>* {{ $t('mapBuilder.layoutName') }}</label>
            <input
              v-model="saveForm.name"
              class="form-input"
              :placeholder="$t('mapBuilder.namePlaceholder')"
              ref="nameInputRef"
              @keydown.stop
            />
          </div>
          <div class="form-group">
            <label>{{ $t('mapBuilder.description') }}</label>
            <textarea
              v-model="saveForm.description"
              class="form-input"
              rows="3"
              :placeholder="$t('mapBuilder.notesPlaceholder')"
              @keydown.stop
            ></textarea>
          </div>
          <div class="form-check">
            <input type="checkbox" id="setActive" v-model="saveForm.setActive" />
            <label for="setActive">{{ $t('mapBuilder.activateAfterSave') }}</label>
          </div>
          <div class="save-stats">
            <span class="stat-badge shelf">{{ $t('mapBuilder.shelfCells', { count: totalShelfCells }) }}</span>
            <span class="stat-badge location">{{ $t('mapBuilder.estimatedLocations', { count: totalLocations }) }}</span>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn-cancel" @click="showSaveDialog = false">{{ $t('common.cancel') }}</button>
          <button class="btn-primary" @click="saveLayout" :disabled="!saveForm.name.trim() || saving">
            {{ saving ? $t('mapBuilder.saving') : $t('mapBuilder.saveAndGenerate') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { layoutApi } from '../api/index.js'
import { useI18n } from 'vue-i18n'
import { useWarehouseStore } from '@/stores/warehouse'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()
const warehouseStore = useWarehouseStore()
const builderRef = ref(null)
const svgEl = ref(null)
const nameInputRef = ref(null)
const canvasWrap = ref(null)

// Grid config
const gridCols = ref(30)
const gridRows = ref(24)
const cellSize = 60
const zoom = ref(1)
const svgWidth = computed(() => gridCols.value * cellSize)
const svgHeight = computed(() => gridRows.value * cellSize)
const renderWidth = computed(() => Math.round(svgWidth.value * zoom.value))
const renderHeight = computed(() => Math.round(svgHeight.value * zoom.value))
const minZoom = 0.02
function zoomIn() { zoom.value = Math.min(3, Math.round((zoom.value + 0.1) * 100) / 100) }
function zoomOut() { zoom.value = Math.max(minZoom, Math.round((zoom.value - 0.1) * 100) / 100) }
function fitCanvas() {
  if (!canvasWrap.value) return
  const w = canvasWrap.value.clientWidth - 48
  const h = canvasWrap.value.clientHeight - 48
  if (w <= 0 || h <= 0) return
  zoom.value = Math.max(minZoom, Math.min(2, w / svgWidth.value, h / svgHeight.value))
}
function validateGrid() {
  const cells = regions.value.flatMap(region => [...region.cells])
  const extent = cells.reduce((max, key) => {
    const [c, r] = key.split(',').map(Number)
    return { col: Math.max(max.col, c + 1), row: Math.max(max.row, r + 1) }
  }, { col: 10, row: 8 })
  if (gridCols.value < extent.col || gridRows.value < extent.row) {
    gridCols.value = Math.max(gridCols.value, extent.col)
    gridRows.value = Math.max(gridRows.value, extent.row)
    ElMessage.warning(t('mapBuilder.gridContainsObjects'))
  }
  nextTick(fitCanvas)
}

// Tool definitions
const tools = [
  { type: 'shelf',     labelKey: 'mapBuilder.shelf',    icon: '📦' },
  { type: 'wall',      labelKey: 'mapBuilder.wall',     icon: '🧱' },
  { type: 'door',      labelKey: 'mapBuilder.door',     icon: '🚪' },
  { type: 'aisle',     labelKey: 'mapBuilder.aisle',    icon: '↔'  },
  { type: 'workbench', labelKey: 'mapBuilder.workbench',icon: '🖥'  },
  { type: 'pillar',    labelKey: 'mapBuilder.pillar',   icon: '⬛'  },
]

const typeConfig = {
  shelf:     { labelKey: 'mapBuilder.shelf',     icon: '📦', color: '#3b82f6', stroke: '#1d4ed8' },
  wall:      { labelKey: 'mapBuilder.wall',      icon: '🧱', color: '#6b7280', stroke: '#374151' },
  door:      { labelKey: 'mapBuilder.door',      icon: '🚪', color: '#f59e0b', stroke: '#d97706' },
  aisle:     { labelKey: 'mapBuilder.aisle',     icon: '↔',  color: '#d1fae5', stroke: '#6ee7b7' },
  workbench: { labelKey: 'mapBuilder.workbench', icon: '🖥', color: '#8b5cf6', stroke: '#6d28d9' },
  pillar:    { labelKey: 'mapBuilder.pillar',    icon: '⬛',  color: '#374151', stroke: '#111827' },
}

// State
const activeTool = ref('shelf')
const regions = ref([])   // [{ id, type, cells: Set<"col,row">, code, levels }]
const selectedRegion = ref(null)
const history = ref([])

// Drawing
const isDrawing = ref(false)
const drawStart = ref(null)
const drawPreview = ref(null)

// Save
const layoutId = ref(null)
const showSaveDialog = ref(false)
const saving = ref(false)
const saveForm = ref({ name: '', description: '', setActive: true })

// ---- Computed ----
const totalShelfCells = computed(() =>
  regions.value.filter(r => r.type === 'shelf').reduce((s, r) => s + r.cells.size, 0)
)
const totalLocations = computed(() =>
  regions.value.filter(r => r.type === 'shelf').reduce((s, r) => s + r.cells.size * (r.levels || 1), 0)
)

// ---- Cell helpers ----
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
  // Use the median cell to ensure the icon lands on an actual cell (handles L/U shapes)
  const sorted = [...cells].sort((a, b) => a.row !== b.row ? a.row - b.row : a.col - b.col)
  const mid = sorted[Math.floor(sorted.length / 2)]
  return (mid.col + 0.5) * cellSize
}

function getRegionCenterY(region) {
  const cells = getRegionCells(region)
  if (!cells.length) return 0
  const sorted = [...cells].sort((a, b) => a.row !== b.row ? a.row - b.row : a.col - b.col)
  const mid = sorted[Math.floor(sorted.length / 2)]
  return (mid.row + 0.5) * cellSize
}

// ---- SVG outline path (true polygon, supports L/U shapes) ----
function buildOutlinePath(region) {
  const cs = cellSize
  const cellSet = region.cells
  if (!cellSet.size) return ''

  // Collect outer edges (directed: CCW for exterior)
  const edges = []
  for (const key of cellSet) {
    const [c, r] = key.split(',').map(Number)
    // top edge (going right if exterior)
    if (!cellSet.has(`${c},${r-1}`)) edges.push([c*cs, r*cs, (c+1)*cs, r*cs])
    // right edge (going down if exterior)
    if (!cellSet.has(`${c+1},${r}`)) edges.push([(c+1)*cs, r*cs, (c+1)*cs, (r+1)*cs])
    // bottom edge (going left if exterior)
    if (!cellSet.has(`${c},${r+1}`)) edges.push([(c+1)*cs, (r+1)*cs, c*cs, (r+1)*cs])
    // left edge (going up if exterior)
    if (!cellSet.has(`${c-1},${r}`)) edges.push([c*cs, (r+1)*cs, c*cs, r*cs])
  }

  if (!edges.length) return ''

  // Build adjacency: start-point -> [edge index]
  // After edge[cur] ends at (x2,y2), we need the next edge that STARTS at (x2,y2)
  const adj = new Map()
  edges.forEach((e, i) => {
    const k = `${e[0]},${e[1]}`  // use START point as key
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

  // Build SVG path with rounded corners
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

// ---- Mouse events ----
function getSVGCell(e) {
  const rect = svgEl.value.getBoundingClientRect()
  const x = (e.clientX - rect.left) * svgWidth.value / rect.width
  const y = (e.clientY - rect.top) * svgHeight.value / rect.height
  return {
    col: Math.floor(x / cellSize),
    row: Math.floor(y / cellSize),
  }
}

function onMouseDown(e) {
  if (e.button !== 0) return
  const { col, row } = getSVGCell(e)
  if (col < 0 || col >= gridCols.value || row < 0 || row >= gridRows.value) return

  // Entrances can cut a doorway through a wall. Shelves and other objects
  // remain protected and are selected rather than silently overwritten.
  const hit = getRegionAt(col, row)
  if (hit && !(activeTool.value === 'door' && hit.type === 'wall')) {
    selectRegion(hit)
    return
  }

  // Start drawing
  selectedRegion.value = null
  isDrawing.value = true
  drawStart.value = { col, row }
  updateDrawPreview(col, row)
}

function onMouseMove(e) {
  if (!isDrawing.value) return
  const { col, row } = getSVGCell(e)
  const c = Math.max(0, Math.min(gridCols.value - 1, col))
  const r = Math.max(0, Math.min(gridRows.value - 1, row))
  updateDrawPreview(c, r)
}

function onMouseUp(e) {
  if (!isDrawing.value) return
  finishDraw(e)
}

function onMouseLeave(e) {
  if (isDrawing.value) finishDraw(e)
}

function finishDraw(e) {
  isDrawing.value = false
  if (!drawPreview.value || !drawStart.value) {
    drawPreview.value = null
    return
  }

  const { col: sc, row: sr } = drawStart.value
  const { col: ec, row: er } = getSVGCell(e)

  const minCol = Math.max(0, Math.min(sc, ec))
  const maxCol = Math.min(gridCols.value - 1, Math.max(sc, ec))
  const minRow = Math.max(0, Math.min(sr, er))
  const maxRow = Math.min(gridRows.value - 1, Math.max(sr, er))

  const newCells = new Set()
  for (let c = minCol; c <= maxCol; c++) {
    for (let r = minRow; r <= maxRow; r++) {
      const occupant = getRegionAt(c, r)
      if (!occupant || (activeTool.value === 'door' && occupant.type === 'wall')) newCells.add(`${c},${r}`)
    }
  }

  drawPreview.value = null

  if (newCells.size === 0) return

  // Save undo snapshot
  pushHistory()

  if (activeTool.value === 'door') {
    for (const region of regions.value.filter(r => r.type === 'wall')) {
      for (const key of newCells) region.cells.delete(key)
    }
    regions.value = regions.value.filter(r => r.cells.size > 0)
  }

  // Try to merge with adjacent same-type regions
  const merged = mergeWithAdjacent(activeTool.value, newCells)
  if (!merged) {
    const newRegion = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: activeTool.value,
      cells: newCells,
      code: activeTool.value === 'shelf' ? getNextShelfCode() : '',
      levels: 1,
    }
    regions.value.push(newRegion)
    selectedRegion.value = newRegion
  }
}

function updateDrawPreview(col, row) {
  const sc = drawStart.value.col
  const sr = drawStart.value.row
  const minCol = Math.min(sc, col)
  const maxCol = Math.max(sc, col)
  const minRow = Math.min(sr, row)
  const maxRow = Math.max(sr, row)
  drawPreview.value = {
    x: minCol * cellSize,
    y: minRow * cellSize,
    w: (maxCol - minCol + 1) * cellSize,
    h: (maxRow - minRow + 1) * cellSize,
  }
}

function getRegionAt(col, row) {
  const key = `${col},${row}`
  return regions.value.find(r => r.cells.has(key)) || null
}

function mergeWithAdjacent(type, newCells) {
  const adjacent = regions.value.filter(r => {
    if (r.type !== type) return false
    for (const key of newCells) {
      const [c, row] = key.split(',').map(Number)
      if (r.cells.has(`${c},${row-1}`) || r.cells.has(`${c},${row+1}`) ||
          r.cells.has(`${c-1},${row}`) || r.cells.has(`${c+1},${row}`)) return true
    }
    return false
  })

  if (!adjacent.length) return false

  const target = adjacent[0]
  for (const cell of newCells) target.cells.add(cell)
  for (let i = 1; i < adjacent.length; i++) {
    for (const cell of adjacent[i].cells) target.cells.add(cell)
    regions.value = regions.value.filter(r => r.id !== adjacent[i].id)
  }
  selectedRegion.value = target
  return true
}

function getNextShelfCode() {
  const used = new Set(regions.value.filter(r => r.type === 'shelf').map(r => r.code || ''))
  for (const l of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    if (!used.has(l)) return l
  }
  return 'A'
}

// Returns true if the given letter is already used by a DIFFERENT shelf region
function isCodeUsedByOther(letter, selfId) {
  return regions.value.some(r => r.type === 'shelf' && r.id !== selfId && r.code === letter)
}

function selectRegion(region) {
  selectedRegion.value = region
}

function deleteSelected() {
  if (!selectedRegion.value) return
  pushHistory()
  regions.value = regions.value.filter(r => r.id !== selectedRegion.value.id)
  selectedRegion.value = null
}

function onKeyDown(e) {
  if (showSaveDialog.value) return
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selectedRegion.value) { e.preventDefault(); deleteSelected() }
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo() }
  if (e.key === 'Escape') selectedRegion.value = null
}

function pushHistory() {
  history.value.push(regions.value.map(r => ({ ...r, cells: [...r.cells] })))
  if (history.value.length > 50) history.value.shift()
}

function undo() {
  if (!history.value.length) return
  const prev = history.value.pop()
  regions.value = prev.map(r => ({ ...r, cells: new Set(r.cells) }))
  selectedRegion.value = null
}

function clearAll() {
  if (!regions.value.length) return
  pushHistory()
  regions.value = []
  selectedRegion.value = null
}

// ---- Save ----
function openSaveDialog() {
  showSaveDialog.value = true
  nextTick(() => nameInputRef.value?.focus())
}

async function saveLayout() {
  if (!saveForm.value.name.trim() || saving.value) return
  saving.value = true

  const layout_json = regions.value.map(r => ({
    id: r.id,
    type: r.type,
    cells: [...r.cells],
    code: r.code || '',
    levels: r.levels || 1,
  }))

  try {
    if (layoutId.value) {
      await layoutApi.update(layoutId.value, {
        name: saveForm.value.name,
        description: saveForm.value.description,
        grid_cols: gridCols.value,
        grid_rows: gridRows.value,
        layout_json: JSON.stringify(layout_json),
        set_active: saveForm.value.setActive,
      })
    } else {
      const res = await layoutApi.create({
        name: saveForm.value.name,
        description: saveForm.value.description,
        grid_cols: gridCols.value,
        grid_rows: gridRows.value,
      })
      const newId = res.data?.id || res.id
      layoutId.value = newId
      await layoutApi.update(newId, {
        layout_json: JSON.stringify(layout_json),
        set_active: saveForm.value.setActive,
      })
    }
    await warehouseStore.loadLayouts()
    warehouseStore.selectLayout(layoutId.value, { allowUnknown: true })
    showSaveDialog.value = false
    router.push('/map')
  } catch (err) {
    console.error('Save failed', err)
    ElMessage.error(err.message || t('mapBuilder.saveFailed'))
  } finally {
    saving.value = false
  }
}

function goBack() {
  router.push('/map')
}

// ---- Load layout on mount ----
onMounted(async () => {
  builderRef.value?.focus()
  const id = route.query.id
  if (!id) return

  layoutId.value = id
  warehouseStore.selectLayout(id, { allowUnknown: true })
  try {
    const res = await layoutApi.get(id)
    const layout = res.data || res
    saveForm.value.name = layout.name || ''
    saveForm.value.description = layout.description || ''
    saveForm.value.setActive = Boolean(layout.is_active)

    if (layout.layout_json) {
      let parsed = typeof layout.layout_json === 'string' ? JSON.parse(layout.layout_json) : layout.layout_json
      if (typeof parsed === 'string') parsed = JSON.parse(parsed)
      if (!Array.isArray(parsed)) throw new Error('Invalid layout data')
      regions.value = parsed.map(r => ({
        id: r.id || Date.now() + Math.random(),
        type: r.type,
        cells: new Set(Array.isArray(r.cells) ? r.cells : Array.from({ length: (r.colSpan || 1) * (r.rowSpan || 1) }, (_, i) => `${Number(r.col || 0) + i % (r.colSpan || 1)},${Number(r.row || 0) + Math.floor(i / (r.colSpan || 1))}`)),
        code: r.code || '',
        levels: r.levels || 1,
      }))
    }
    // Older editor releases drew outside the stored grid. Restore the entire
    // saved layout first, including doors/aisles, rather than clipping them.
    gridCols.value = Number(layout.grid_cols) || 30
    gridRows.value = Number(layout.grid_rows) || 24
    for (const region of regions.value) {
      for (const key of region.cells) {
        const [col, row] = key.split(',').map(Number)
        gridCols.value = Math.max(gridCols.value, col + 1)
        gridRows.value = Math.max(gridRows.value, row + 1)
      }
    }
    await nextTick()
    fitCanvas()
  } catch (err) {
    console.error('Load layout failed', err)
    ElMessage.error(t('mapBuilder.loadFailed'))
  }
})
onBeforeUnmount(() => resizeObserver?.disconnect())
let resizeObserver
onMounted(() => {
  if (canvasWrap.value && window.ResizeObserver) {
    resizeObserver = new ResizeObserver(() => {
      if (!isDrawing.value) fitCanvas()
    })
    resizeObserver.observe(canvasWrap.value)
  }
  nextTick(fitCanvas)
})
</script>

<style scoped>
.map-builder {
  display: flex;
  flex-direction: column;
  height: calc(100dvh - 104px);
  min-height: 520px;
  background: #f8fafc;
  outline: none;
  user-select: none;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
@media (max-width: 1500px) {
  .map-builder { height: calc(100dvh - 160px); min-height: 480px; }
}
@media (max-width: 720px) {
  .map-builder { height: calc(100dvh - 195px); min-height: 400px; }
}

/* ---- Toolbar ---- */
.toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: white;
  border-bottom: 1px solid #e5e7eb;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.tool-group { display: flex; gap: 4px; align-items: center; }
.canvas-controls { gap: 7px; font-size: 12px; color: #475569; }
.canvas-controls :deep(.el-input-number) { width: 62px; }
.control-caption { font-weight: 600; white-space: nowrap; }
.zoom-value { width: 40px; text-align: right; white-space: nowrap; }
.tool-sep { width: 1px; height: 28px; background: #e5e7eb; margin: 0 4px; }
.spacer { flex: 1; }

.tool-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 5px 10px;
  border: 1.5px solid #e5e7eb;
  border-radius: 8px;
  background: white;
  cursor: pointer;
  transition: all 0.15s;
  color: #374151;
  min-width: 52px;
}
.tool-btn:hover { background: #f9fafb; border-color: #d1d5db; }
.tool-btn.active { background: #eff6ff; border-color: #3b82f6; color: #1d4ed8; }
.tool-btn.primary { background: #3b82f6; border-color: #3b82f6; color: white; }
.tool-btn.primary:hover { background: #2563eb; }
.tool-btn.danger:hover { background: #fef2f2; border-color: #fca5a5; color: #ef4444; }
.tool-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.tool-icon { font-size: 15px; line-height: 1; }
.tool-label { font-size: 11px; white-space: nowrap; }

/* ---- Body ---- */
.builder-body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* ---- Side panel ---- */
.side-panel {
  width: 196px;
  flex-shrink: 0;
  background: white;
  border-right: 1px solid #e5e7eb;
  padding: 16px;
  overflow-y: auto;
}
.side-panel.empty {
  display: flex;
  align-items: center;
  justify-content: center;
}
.panel-hint { text-align: center; color: #9ca3af; }
.hint-icon { font-size: 36px; margin-bottom: 8px; }
.hint-title { font-size: 14px; font-weight: 600; color: #6b7280; margin-bottom: 4px; }
.hint-desc { font-size: 12px; margin-bottom: 12px; }
.hint-tips { text-align: left; font-size: 11px; color: #9ca3af; line-height: 1.8; }

.panel-title {
  font-size: 11px;
  font-weight: 700;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 14px;
}
.panel-section { margin-bottom: 14px; }
.panel-section label {
  display: block;
  font-size: 12px;
  color: #6b7280;
  font-weight: 500;
  margin-bottom: 5px;
}
.type-badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 12px;
  color: white;
  font-size: 12px;
  font-weight: 600;
}
.panel-input {
  width: 100%;
  padding: 7px 10px;
  border: 1.5px solid #e5e7eb;
  border-radius: 7px;
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
}
.panel-input:focus { border-color: #3b82f6; }
.number-input {
  display: flex;
  align-items: center;
  gap: 8px;
}
.number-input button {
  width: 28px; height: 28px;
  border: 1.5px solid #e5e7eb;
  border-radius: 6px;
  background: white;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
.number-input button:hover { background: #f3f4f6; }
.number-input span { font-size: 16px; font-weight: 700; min-width: 24px; text-align: center; }
.info-text { font-size: 12px; color: #6b7280; line-height: 1.5; }
.delete-btn {
  width: 100%;
  padding: 8px;
  background: #fef2f2;
  border: 1.5px solid #fca5a5;
  border-radius: 8px;
  color: #ef4444;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.delete-btn:hover { background: #fee2e2; }

/* ---- Canvas ---- */
.canvas-wrap {
  flex: 1;
  min-width: 0;
  overflow: auto;
  background: #f1f5f9;
  padding: 24px;
}
.map-svg {
  display: block;
  margin: auto;
  cursor: crosshair;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 16px rgba(0,0,0,0.08);
}
.region-shape {
  cursor: pointer;
  transition: fill-opacity 0.15s;
}
.region-shape:hover { fill-opacity: 1 !important; }

/* ---- Save dialog ---- */
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.dialog {
  background: white;
  border-radius: 16px;
  width: 480px;
  max-width: 92vw;
  box-shadow: 0 24px 64px rgba(0,0,0,0.22);
}
.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 0;
}
.dialog-header h3 { font-size: 18px; font-weight: 700; color: #111827; margin: 0; }
.dialog-close {
  width: 32px; height: 32px;
  border: none;
  background: #f3f4f6;
  border-radius: 8px;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
}
.dialog-close:hover { background: #e5e7eb; }
.dialog-body { padding: 20px 24px; }
.form-group { margin-bottom: 16px; }
.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 6px;
}
.form-input {
  width: 100%;
  padding: 10px 12px;
  border: 1.5px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
  font-family: inherit;
  resize: vertical;
}
.form-input:focus { border-color: #3b82f6; }
.form-check {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  font-size: 14px;
  color: #1d4ed8;
  font-weight: 500;
  cursor: pointer;
}
.form-check input { width: 16px; height: 16px; cursor: pointer; }
.save-stats {
  display: flex;
  gap: 8px;
  padding: 12px;
  background: #f8fafc;
  border-radius: 8px;
  flex-wrap: wrap;
}
.stat-badge {
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
}
.stat-badge.shelf { background: #dbeafe; color: #1d4ed8; }
.stat-badge.location { background: #dcfce7; color: #166534; }
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px 20px;
  border-top: 1px solid #f3f4f6;
}
.btn-cancel {
  padding: 10px 20px;
  border: 1.5px solid #e5e7eb;
  border-radius: 8px;
  background: white;
  font-size: 14px;
  cursor: pointer;
  color: #374151;
}
.btn-cancel:hover { background: #f9fafb; }
.btn-primary {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  background: #3b82f6;
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.btn-primary:hover { background: #2563eb; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
