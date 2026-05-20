<template>
  <div class="picking-detail">
    <div class="page-header">
      <el-button text @click="$router.back()"><el-icon><ArrowLeft /></el-icon> 返回</el-button>
      <div class="header-center" v-if="task">
        <el-tag :type="task.task_type === 'order' ? 'primary' : 'warning'" style="margin-right:8px">
          {{ task.task_type === 'order' ? '📦 订单拣货' : '🎪 展会备货' }}
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
                <span>拣货清单</span>
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
                  :class="{ picked: line.is_picked, active: activeLine?.id === line.id }"
                  @click="selectLine(line)"
                >
                  <div class="line-check">
                    <el-checkbox
                      :model-value="line.is_picked"
                      @change="(v) => togglePick(line, v)"
                      @click.stop
                    />
                  </div>
                  <div class="line-body">
                    <div class="line-product">{{ line.product_title }}</div>
                    <div class="line-variant">{{ line.variant_title }}</div>
                    <div class="line-location">
                      <el-icon size="12"><Location /></el-icon>
                      <span v-if="line.location_code">{{ line.location_code }}</span>
                      <span v-else class="no-location">未找到货位</span>
                    </div>
                  </div>
                  <div class="line-qty">
                    <span class="qty-needed">{{ line.quantity_needed }}</span>
                    <span class="qty-label">件</span>
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
                ✅ 完成拣货
              </el-button>
            </div>
          </el-card>
        </el-col>

        <!-- 右：仓库地图 -->
        <el-col :span="14">
          <el-card class="map-card">
            <template #header>
              <div class="card-header">
                <span>仓库地图导航</span>
                <div class="map-legend">
                  <span class="legend-dot" style="background:#409EFF"></span>有货
                  <span class="legend-dot" style="background:#F56C6C;margin-left:12px"></span>拣货目标
                  <span class="legend-dot" style="background:#67C23A;margin-left:12px"></span>已完成
                </div>
              </div>
            </template>

            <div class="map-wrapper" v-if="layout">
              <div class="map-grid"
                :style="{ gridTemplateColumns: `repeat(${layout.grid_cols}, 56px)`, gridTemplateRows: `repeat(${layout.grid_rows}, 56px)` }">
                <div v-for="(_, idx) in layout.grid_cols * layout.grid_rows" :key="`bg-${idx}`" class="bg-cell" />
                <div
                  v-for="cell in layout.cells"
                  :key="cell.id"
                  class="map-module"
                  :class="[
                    `type-${cell.type}`,
                    getCellClass(cell),
                    { clickable: cell.type.startsWith('shelf') }
                  ]"
                  :style="{
                    gridColumn: `${cell.col + 1} / span ${cell.colSpan || 1}`,
                    gridRow: `${cell.row + 1} / span ${cell.rowSpan || 1}`,
                  }"
                  @click="cell.type.startsWith('shelf') && focusCell(cell)"
                >
                  <span class="cell-icon">{{ getCellIcon(cell.type) }}</span>
                  <span class="cell-code">{{ cell.code || '' }}</span>
                  <div v-if="getCellClass(cell) === 'target'" class="pulse-ring" />
                  <div v-if="getCellClass(cell) === 'done'" class="done-badge">✓</div>
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
                    前往货位：<strong>{{ activeLine.location_code || '未知' }}</strong>
                    <span v-if="activeLine.location_row_col"> · {{ activeLine.location_row_col }}</span>
                  </div>
                </div>
                <el-button type="primary" size="small" @click="togglePick(activeLine, !activeLine.is_picked)">
                  {{ activeLine.is_picked ? '取消' : '已取' }}
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
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { pickingApi, layoutApi } from '@/api/index.js'
import { ArrowLeft, Location } from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const taskId = route.params.id

const task = ref(null)
const lines = ref([])
const layout = ref(null)
const loading = ref(false)
const activeLine = ref(null)

const iconMap = { shelf_h: '▬', shelf_v: '▮', shelf_corner: '⌐', aisle: '⟶', entrance: '🚪', wall: '█', workstation: '🖥' }
function getCellIcon(type) { return iconMap[type] || '?' }

const progressPct = computed(() => {
  if (!lines.value.length) return 0
  return Math.round(lines.value.filter(l => l.is_picked).length / lines.value.length * 100)
})

const sortedLines = computed(() => {
  return [...lines.value].sort((a, b) => {
    if (a.is_picked !== b.is_picked) return a.is_picked ? 1 : -1
    return (a.location_code || '').localeCompare(b.location_code || '')
  })
})

// 拣货目标的 cell_id 集合
const targetCellIds = computed(() => new Set(lines.value.filter(l => !l.is_picked && l.cell_id).map(l => l.cell_id)))
const doneCellIds = computed(() => {
  const done = new Set()
  lines.value.filter(l => l.is_picked && l.cell_id).forEach(l => done.add(l.cell_id))
  return done
})

function getCellClass(cell) {
  if (!cell.type.startsWith('shelf')) return ''
  if (targetCellIds.value.has(cell.id)) return 'target'
  if (doneCellIds.value.has(cell.id)) return 'done'
  return ''
}

function statusType(s) {
  return { pending: 'info', in_progress: 'warning', completed: 'success', cancelled: 'danger' }[s] || 'info'
}
function statusLabel(s) {
  return { pending: '待处理', in_progress: '进行中', completed: '已完成', cancelled: '已取消' }[s] || s
}

function selectLine(line) {
  activeLine.value = activeLine.value?.id === line.id ? null : line
}

function focusCell(cell) {
  const line = lines.value.find(l => l.cell_id === cell.id && !l.is_picked)
  if (line) activeLine.value = line
}

async function togglePick(line, picked) {
  try {
    await pickingApi.pickLine(taskId, line.id, { is_picked: picked, confirmed_by: 'user' })
    line.is_picked = picked
    if (picked && activeLine.value?.id === line.id) {
      // 自动跳到下一个未拣货项
      const next = sortedLines.value.find(l => !l.is_picked && l.id !== line.id)
      activeLine.value = next || null
    }
  } catch (err) {
    ElMessage.error(err.message)
  }
}

async function completeTask() {
  await ElMessageBox.confirm('确认所有货物已拣取完毕？', '完成拣货', { type: 'success' })
  try {
    await pickingApi.pickLine(taskId, 'complete', { action: 'complete_task' }).catch(() => {})
    task.value.status = 'completed'
    ElMessage.success('拣货任务已完成！')
  } catch {}
}

async function loadData() {
  loading.value = true
  try {
    const [taskRes, layoutRes] = await Promise.all([
      pickingApi.getTask(taskId),
      layoutApi.getActive().catch(() => ({ data: null })),
    ])
    task.value = taskRes.data
    lines.value = taskRes.data?.lines || []
    layout.value = layoutRes.data
    // 默认选中第一个未拣货项
    activeLine.value = lines.value.find(l => !l.is_picked) || null
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
</script>

<style scoped>
.picking-detail { animation: fadeIn 0.3s ease; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

.page-header { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
.header-center { flex: 1; display: flex; align-items: center; }
.page-title { font-size: 20px; font-weight: 700; color: #1a1a2e; margin: 0; }
.header-actions { display: flex; gap: 10px; }
.card-header { display: flex; align-items: center; justify-content: space-between; }

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
.line-item.active { border-color: #409EFF; background: #ecf5ff; }
.line-item.picked { opacity: 0.5; background: #f9f9f9; }
.line-item.picked .line-product { text-decoration: line-through; }

.line-body { flex: 1; }
.line-product { font-size: 13px; font-weight: 600; color: #303133; }
.line-variant { font-size: 12px; color: #606266; }
.line-location { display: flex; align-items: center; gap: 4px; font-size: 11px; color: #409EFF; margin-top: 2px; }
.no-location { color: #c0c4cc; }
.line-qty { text-align: center; }
.qty-needed { font-size: 20px; font-weight: 700; color: #1a1a2e; }
.qty-label { font-size: 11px; color: #909399; }

.complete-btn-wrapper { padding-top: 12px; border-top: 1px solid #f0f0f0; margin-top: 8px; }

/* 地图 */
.map-card { height: calc(100vh - 160px); overflow: hidden; }
.map-wrapper { overflow: auto; padding: 8px; }
.map-grid { display: grid; gap: 2px; background: #f5f6fa; border-radius: 8px; padding: 4px; min-width: fit-content; }
.bg-cell { width: 56px; height: 56px; border: 1px dashed #ebebeb; border-radius: 4px; }

.map-module {
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  position: relative;
  background: #c0c4cc;
  transition: transform 0.2s;
}
.map-module.type-aisle { background: #E6E6E6; }
.map-module.type-entrance { background: #F56C6C; }
.map-module.type-wall { background: #909399; }
.map-module.type-workstation { background: #E6A23C; }
.map-module.clickable { cursor: pointer; }
.map-module.clickable:hover { transform: scale(1.08); z-index: 10; }
.map-module.target { background: #F56C6C !important; }
.map-module.done { background: #67C23A !important; }

.cell-icon { font-size: 16px; color: #fff; }
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

.map-legend { display: flex; align-items: center; font-size: 12px; color: #606266; }
.legend-dot { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; }

/* 底部提示条 */
.active-hint {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: linear-gradient(135deg, #ecf5ff, #f0f9ff);
  border-radius: 10px;
  margin-top: 12px;
  border: 1px solid #b3d8ff;
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
