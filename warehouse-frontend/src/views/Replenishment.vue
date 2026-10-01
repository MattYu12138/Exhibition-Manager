<template>
  <div class="replenishment">
    <div class="page-header">
      <div>
        <h1 class="page-title">🚚 {{ $t('replenishment.title') }}</h1>
        <p class="page-subtitle">{{ $t('replenishment.subtitle') }}</p>
      </div>
      <el-button type="primary" @click="showGenerateDialog = true">
        <el-icon><Plus /></el-icon> {{ $t('replenishment.fromShipment') }}
      </el-button>
    </div>

    <!-- 补货任务列表 -->
    <div v-loading="loading">
      <div v-if="tasks.length === 0 && !loading" class="empty-state">
        <el-empty :description="$t('replenishment.noTasks')">
          <el-button type="primary" @click="showGenerateDialog = true">{{ $t('replenishment.createTask') }}</el-button>
        </el-empty>
      </div>

      <el-card v-for="task in tasks" :key="task.id" class="task-card" :class="{ 'is-completed': task.status === 'completed' }">
        <template #header>
          <div class="task-header">
            <div class="task-info">
              <el-tag :type="task.status === 'completed' ? 'success' : task.status === 'pending' ? 'warning' : 'info'" size="small">
                {{ statusLabel(task.status) }}
              </el-tag>
              <span class="task-title">
                {{ $t('replenishment.batch', { reference: task.reference_no || task.inbound_shipment_id }) }}
                <span v-if="task.supplier_name" class="supplier">· {{ task.supplier_name }}</span>
              </span>
              <span class="task-meta">{{ formatDate(task.created_at) }}</span>
            </div>
            <div class="task-progress">
              <span class="progress-text">{{ $t('replenishment.confirmedProgress', { confirmed: task.confirmed_lines || 0, total: task.total_lines || 0 }) }}</span>
              <el-progress
                :percentage="task.total_lines ? Math.round((task.confirmed_lines || 0) / task.total_lines * 100) : 0"
                :status="task.status === 'completed' ? 'success' : undefined"
                :stroke-width="6"
                style="width: 120px"
              />
              <el-button
                v-if="task.status !== 'completed'"
                type="primary"
                size="small"
                @click="openTask(task.id)"
              >
                {{ $t('replenishment.process') }}
              </el-button>
              <el-button v-else size="small" @click="openTask(task.id)">{{ $t('replenishment.viewDetails') }}</el-button>
            </div>
          </div>
        </template>
      </el-card>
    </div>

    <!-- 补货任务详情抽屉 -->
    <el-drawer v-model="drawerVisible" :title="$t('replenishment.taskTitle', { reference: currentTask?.task?.reference_no || '' })" size="60%" direction="rtl">
      <div v-if="currentTask" v-loading="drawerLoading">
        <div v-for="group in currentTask.locations" :key="group.location_id" class="location-group">
          <div class="location-header">
            <span class="location-code">📍 {{ group.location_code }}</span>
            <span class="location-layout">{{ group.layout_name }}</span>
            <el-tag size="small" type="info">{{ $t('common.zone', { name: group.zone }) }}</el-tag>
          </div>

          <div v-for="line in group.lines" :key="line.id" class="replenish-line" :class="{ 'is-done': line.status !== 'pending' }">
            <div class="line-product">
              <img v-if="line.image_url || line.main_image" :src="line.image_url || line.main_image" class="product-img" />
              <div v-else class="product-img-placeholder">📦</div>
              <div class="line-info">
                <div class="line-title">{{ line.product_title }}</div>
                <div class="line-variant">{{ line.variant_title }}</div>
                <div class="line-meta">
                  <el-tag size="small" :type="stockTypeColor(line.stock_type)">{{ stockTypeLabel(line.stock_type) }}</el-tag>
                  <span class="line-sku">SKU: {{ line.sku }}</span>
                </div>
              </div>
            </div>

            <div class="line-qty">
              <div class="qty-required">{{ $t('replenishment.required', { count: line.required_qty }) }}</div>
              <div v-if="line.status === 'confirmed'" class="qty-confirmed">
                <el-icon color="#67c23a"><CircleCheck /></el-icon>
                {{ $t('replenishment.confirmedQty', { count: line.confirmed_qty }) }}
              </div>
              <div v-else-if="line.status === 'skipped'" class="qty-skipped">{{ $t('replenishment.skipped') }}</div>
            </div>

            <div class="line-actions" v-if="line.status === 'pending'">
              <el-input-number
                v-model="confirmQtys[line.id]"
                :min="0"
                :max="line.required_qty"
                size="small"
                style="width: 100px"
              />
              <el-button
                type="success"
                size="small"
                :loading="confirmingLines[line.id]"
                @click="confirmLine(line)"
              >
                {{ $t('replenishment.confirmArrival') }}
              </el-button>
              <el-button
                size="small"
                text
                @click="skipLine(line)"
              >
                {{ $t('replenishment.skip') }}
              </el-button>
            </div>
          </div>
        </div>
      </div>
    </el-drawer>

    <!-- 生成补货任务对话框 -->
    <el-dialog v-model="showGenerateDialog" :title="$t('replenishment.fromShipment')" width="600px">
      <div v-loading="shipmentsLoading">
        <p class="dialog-hint">{{ $t('replenishment.selectShipment') }}</p>
        <el-table :data="inboundShipments" size="small" highlight-current-row @current-change="selectedShipment = $event">
          <el-table-column :label="$t('replenishment.batchNumber')" prop="reference_no" min-width="120" />
          <el-table-column :label="$t('replenishment.supplier')" prop="supplier_name" min-width="100" />
          <el-table-column :label="$t('replenishment.skuCount')" prop="sku_count" width="90" align="center" />
          <el-table-column :label="$t('replenishment.receivedCount')" prop="total_received" width="90" align="center" />
          <el-table-column :label="$t('common.status')" width="110">
            <template #default="{ row }">
              <el-tag v-if="row.has_task" type="success" size="small">{{ $t('replenishment.alreadyHasTask') }}</el-tag>
              <el-tag v-else type="warning" size="small">{{ $t('common.pending') }}</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <template #footer>
        <el-button @click="showGenerateDialog = false">{{ $t('common.cancel') }}</el-button>
        <el-button
          type="primary"
          :disabled="!selectedShipment || selectedShipment.has_task"
          :loading="generating"
          @click="generateTask"
        >
          {{ $t('replenishment.generateTask') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, watch } from 'vue'
import { replenishmentApi } from '@/api/index.js'
import { ElMessage } from 'element-plus'
import { Plus, CircleCheck } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { useWarehouseStore } from '@/stores/warehouse'
import { localizedError } from '@/i18n'

const { t, locale } = useI18n()
const warehouseStore = useWarehouseStore()

const loading = ref(false)
const tasks = ref([])
const drawerVisible = ref(false)
const drawerLoading = ref(false)
const currentTask = ref(null)
const confirmQtys = reactive({})
const confirmingLines = reactive({})
const showGenerateDialog = ref(false)
const shipmentsLoading = ref(false)
const inboundShipments = ref([])
const selectedShipment = ref(null)
const generating = ref(false)

function statusLabel(s) {
  const labels = { pending: 'common.pending', in_progress: 'common.inProgress', completed: 'common.completed', cancelled: 'common.cancelled' }
  return labels[s] ? t(labels[s]) : s
}

function stockTypeLabel(t) {
  const labels = { retail_display: 'common.retailDisplay', retail_storage: 'common.retailStorage', retail: 'common.retail', exhibition: 'common.exhibition' }
  return labels[t] ? translate(labels[t]) : t
}
function translate(key) { return t(key) }

function stockTypeColor(t) {
  return { retail_display: 'primary', retail_storage: 'info', retail: 'primary', exhibition: 'warning' }[t] || 'info'
}

function formatDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleString(locale.value === 'en' ? 'en-AU' : 'zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

async function loadTasks() {
  loading.value = true
  try {
    const res = await replenishmentApi.listTasks()
    tasks.value = res.data || []
  } finally {
    loading.value = false
  }
}

async function openTask(taskId) {
  drawerVisible.value = true
  drawerLoading.value = true
  currentTask.value = null
  try {
    const res = await replenishmentApi.getTask(taskId)
    currentTask.value = res.data
    // 初始化确认数量为 required_qty
    for (const group of res.data.locations || []) {
      for (const line of group.lines) {
        if (line.status === 'pending') {
          confirmQtys[line.id] = line.required_qty
        }
      }
    }
  } finally {
    drawerLoading.value = false
  }
}

async function confirmLine(line) {
  confirmingLines[line.id] = true
  try {
    await replenishmentApi.confirmLine(line.id, confirmQtys[line.id] ?? line.required_qty)
    line.status = 'confirmed'
    line.confirmed_qty = confirmQtys[line.id] ?? line.required_qty
    ElMessage.success(t('replenishment.stockUpdated'))
    loadTasks()
  } catch (e) {
    ElMessage.error(localizedError(e, t))
  } finally {
    confirmingLines[line.id] = false
  }
}

async function skipLine(line) {
  try {
    await replenishmentApi.skipLine(line.id)
    line.status = 'skipped'
    loadTasks()
  } catch (e) {
    ElMessage.error(localizedError(e, t))
  }
}

async function openGenerateDialog() {
  showGenerateDialog.value = true
  shipmentsLoading.value = true
  try {
    const res = await replenishmentApi.listInboundShipments()
    inboundShipments.value = res.data || []
  } finally {
    shipmentsLoading.value = false
  }
}

async function generateTask() {
  if (!selectedShipment.value) return
  generating.value = true
  try {
    const res = await replenishmentApi.generateTask(selectedShipment.value.id)
    ElMessage.success(t('replenishment.generated', { count: res.data.lines_count }))
    showGenerateDialog.value = false
    loadTasks()
  } catch (e) {
    ElMessage.error(localizedError(e, t))
  } finally {
    generating.value = false
  }
}

// 监听对话框打开
watch(showGenerateDialog, (val) => {
  if (val) openGenerateDialog()
})

watch(() => warehouseStore.selectedLayoutId, loadTasks, { immediate: true })
</script>

<style scoped>
.replenishment { animation: fadeIn 0.3s ease; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

.page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px; }
.page-title { font-size: 22px; font-weight: 700; color: #1a1a2e; margin: 0 0 4px; }
.page-subtitle { color: #909399; font-size: 13px; }

.task-card { margin-bottom: 16px; }
.task-card.is-completed { opacity: 0.7; }
.task-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
.task-info { display: flex; align-items: center; gap: 10px; }
.task-title { font-size: 14px; font-weight: 600; color: #1a1a2e; }
.supplier { color: #909399; font-weight: 400; }
.task-meta { font-size: 12px; color: #c0c4cc; }
.task-progress { display: flex; align-items: center; gap: 12px; }
.progress-text { font-size: 12px; color: #606266; white-space: nowrap; }

/* 抽屉内容 */
.location-group { margin-bottom: 24px; border: 1px solid #e4e7ed; border-radius: 10px; overflow: hidden; }
.location-header {
  display: flex; align-items: center; gap: 10px;
  background: #f5f7fa; padding: 10px 16px;
  border-bottom: 1px solid #e4e7ed;
}
.location-code { font-size: 15px; font-weight: 700; color: #1a1a2e; }
.location-layout { font-size: 12px; color: #909399; }

.replenish-line {
  display: flex; align-items: center; gap: 16px;
  padding: 14px 16px;
  border-bottom: 1px solid #f0f0f0;
  transition: background 0.2s;
}
.replenish-line:last-child { border-bottom: none; }
.replenish-line.is-done { background: #f9f9f9; opacity: 0.75; }
.replenish-line:hover { background: #fafbff; }

.line-product { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; }
.product-img { width: 48px; height: 48px; border-radius: 8px; object-fit: cover; flex-shrink: 0; }
.product-img-placeholder { width: 48px; height: 48px; border-radius: 8px; background: #f0f0f0; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }
.line-info { min-width: 0; }
.line-title { font-size: 13px; font-weight: 600; color: #1a1a2e; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.line-variant { font-size: 12px; color: #606266; margin: 2px 0; }
.line-meta { display: flex; align-items: center; gap: 8px; }
.line-sku { font-size: 11px; color: #c0c4cc; }

.line-qty { text-align: center; min-width: 80px; }
.qty-required { font-size: 13px; color: #606266; }
.qty-confirmed { font-size: 12px; color: #67c23a; display: flex; align-items: center; gap: 4px; margin-top: 4px; }
.qty-skipped { font-size: 12px; color: #c0c4cc; margin-top: 4px; }

.line-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

.dialog-hint { font-size: 13px; color: #606266; margin-bottom: 16px; }
</style>
