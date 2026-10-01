<template>
  <div class="picking-list">
    <div class="page-header">
      <div>
        <h1 class="page-title">📦 {{ $t('pickingList.title') }}</h1>
        <p class="page-subtitle">{{ $t('pickingList.subtitle') }}</p>
      </div>
      <div class="header-actions">
        <el-button type="primary" @click="showCreateDialog = true">
          <el-icon><Plus /></el-icon> {{ $t('pickingList.newTask') }}
        </el-button>
      </div>
    </div>

    <!-- 筛选 -->
    <el-card class="filter-card">
      <div class="filter-row">
        <el-select v-model="filterStatus" :placeholder="$t('common.status')" clearable style="width:130px" @change="loadTasks">
          <el-option :label="$t('common.all')" value="" />
          <el-option :label="$t('common.pending')" value="pending" />
          <el-option :label="$t('common.inProgress')" value="in_progress" />
          <el-option :label="$t('common.completed')" value="completed" />
          <el-option :label="$t('common.cancelled')" value="cancelled" />
        </el-select>
        <el-select v-model="filterType" :placeholder="$t('common.type')" clearable style="width:130px" @change="loadTasks">
          <el-option :label="$t('common.all')" value="" />
          <el-option :label="$t('pickingList.orderPicking')" value="order" />
          <el-option :label="$t('pickingList.exhibitionPicking')" value="exhibition" />
        </el-select>
      </div>
    </el-card>

    <!-- 任务列表 -->
    <div v-loading="loading" class="tasks-list">
      <div v-for="task in tasks" :key="task.id" class="task-card" @click="$router.push(`/picking/${task.id}`)">
        <div class="task-left">
          <el-tag :type="task.task_type === 'order' ? 'primary' : 'warning'" style="margin-bottom:6px">
            {{ task.task_type === 'order' ? `📦 ${$t('pickingList.orderPicking')}` : `🎪 ${$t('pickingList.exhibitionPicking')}` }}
          </el-tag>
          <div class="task-name">{{ task.shopify_order_name || task.exhibition_name || task.id }}</div>
          <div class="task-meta">{{ $t('pickingList.productLines', { count: task.total_lines }) }} · {{ formatDate(task.created_at) }}</div>
        </div>
        <div class="task-center">
          <el-progress
            :percentage="task.total_lines ? Math.round(task.picked_lines / task.total_lines * 100) : 0"
            :status="task.status === 'completed' ? 'success' : undefined"
            :stroke-width="8"
            style="width:160px"
          />
          <div class="progress-text">{{ $t('pickingList.pickedProgress', { picked: task.picked_lines, total: task.total_lines }) }}</div>
        </div>
        <div class="task-right">
          <el-tag :type="statusType(task.status)" size="large">{{ statusLabel(task.status) }}</el-tag>
          <el-button
            type="danger"
            :icon="Delete"
            circle
            size="small"
            @click.stop="deleteTask(task)"
            :title="$t('pickingList.deleteTask')"
          />
          <el-icon class="arrow-icon"><ArrowRight /></el-icon>
        </div>
      </div>
    </div>

    <el-empty v-if="!loading && tasks.length === 0" :description="$t('pickingList.noTasks')" :image-size="80" />

    <!-- 新建任务对话框 -->
    <el-dialog v-model="showCreateDialog" :title="$t('pickingList.newTaskTitle')" width="560px" :close-on-click-modal="false">
      <el-tabs v-model="createTab">
        <el-tab-pane :label="`📦 ${$t('pickingList.fromOrders')}`" name="order">
          <div class="tab-content">
            <div class="tab-hint">{{ $t('pickingList.ordersHint') }}</div>
            <div v-loading="ordersLoading" class="orders-list">
              <div v-for="order in shopifyOrders" :key="order.id"
                class="order-item"
                :class="{ selected: selectedOrderId === order.id }"
                @click="selectedOrderId = order.id; selectedOrder = order"
              >
                <div class="order-left">
                  <div class="order-name">{{ order.name }}</div>
                  <div class="order-customer">{{ order.customer_name }}</div>
                </div>
                <div class="order-right">
                  <div class="order-items">{{ $t('common.pieces', { count: order.line_items.reduce((s, i) => s + i.quantity, 0) }) }}</div>
                  <div class="order-date">{{ formatDate(order.created_at) }}</div>
                </div>
                <el-icon v-if="selectedOrderId === order.id" class="check-icon" color="#409EFF"><Check /></el-icon>
              </div>
              <el-empty v-if="!ordersLoading && shopifyOrders.length === 0" :description="$t('pickingList.noOrders')" :image-size="60" />
            </div>
          </div>
        </el-tab-pane>

        <el-tab-pane :label="`🎪 ${$t('pickingList.exhibitionPicking')}`" name="exhibition">
          <div class="tab-content">
            <div class="tab-hint">{{ $t('pickingList.exhibitionHint') }}</div>
            <div class="exhibitions-list">
              <div v-for="ex in exhibitions" :key="ex.id"
                class="exhibition-item"
                :class="{ selected: selectedExhibitionId === ex.id }"
                @click="selectedExhibitionId = ex.id"
              >
                <div class="ex-name">{{ ex.name }}</div>
                <div class="ex-date">{{ ex.date || ex.location }}</div>
                <el-tag size="small" :type="ex.status === 'active' ? 'warning' : ex.status === 'completed' ? 'success' : 'info'">{{ exhibitionStatusLabel(ex.status) }}</el-tag>
                <el-icon v-if="selectedExhibitionId === ex.id" class="check-icon" color="#409EFF"><Check /></el-icon>
              </div>
              <el-empty v-if="exhibitions.length === 0" :description="$t('pickingList.noExhibitions')" :image-size="60" />
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>

      <template #footer>
        <el-button @click="showCreateDialog = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="createLoading" @click="createTask">{{ $t('pickingList.createTask') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { pickingApi, productApi } from '@/api/index.js'
import { ElMessageBox } from 'element-plus'
import { Plus, ArrowRight, Check, Delete } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { localizedError } from '@/i18n'
import { useWarehouseStore } from '@/stores/warehouse'

const router = useRouter()
const warehouseStore = useWarehouseStore()
const { t, locale } = useI18n()
const tasks = ref([])
const loading = ref(false)
const filterStatus = ref('')
const filterType = ref('')
const showCreateDialog = ref(false)
const createTab = ref('order')
const createLoading = ref(false)
const ordersLoading = ref(false)
const shopifyOrders = ref([])
const exhibitions = ref([])
const selectedOrderId = ref(null)
const selectedOrder = ref(null)
const selectedExhibitionId = ref(null)

function statusType(s) {
  return { pending: 'info', in_progress: 'warning', completed: 'success', cancelled: 'danger' }[s] || 'info'
}
function statusLabel(s) {
  const labels = { pending: 'common.pending', in_progress: 'common.inProgress', completed: 'common.completed', cancelled: 'common.cancelled' }
  return labels[s] ? t(labels[s]) : s
}
function exhibitionStatusLabel(status) {
  const labels = { preparing: 'pickingList.exhibitionPreparing', active: 'pickingList.exhibitionActive', completed: 'pickingList.exhibitionCompleted', upcoming: 'pickingList.exhibitionUpcoming' }
  return labels[status] ? t(labels[status]) : status
}
function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(locale.value === 'en' ? 'en-AU' : 'zh-CN', { month: '2-digit', day: '2-digit' })
}

async function loadTasks() {
  loading.value = true
  try {
    const res = await pickingApi.listTasks({ status: filterStatus.value || undefined, task_type: filterType.value || undefined, layout_id: warehouseStore.selectedLayoutId || undefined })
    tasks.value = res.data || []
  } finally {
    loading.value = false
  }
}

async function openCreateDialog() {
  showCreateDialog.value = true
  ordersLoading.value = true
  // 展会和 Shopify 订单独立加载，互不影响
  productApi.getExhibitions()
    .then(exRes => { exhibitions.value = exRes.data || [] })
    .catch(() => { exhibitions.value = [] })
  pickingApi.getShopifyOrders()
    .then(ordersRes => { shopifyOrders.value = ordersRes.data || [] })
    .catch(() => { shopifyOrders.value = [] })
    .finally(() => { ordersLoading.value = false })
}

async function createTask() {
  createLoading.value = true
  try {
    let res
    if (createTab.value === 'order') {
      if (!selectedOrderId.value) { ElMessage.warning(t('pickingList.selectOrder')); return }
      const order = shopifyOrders.value.find(o => o.id === selectedOrderId.value)
      if (!order || !order.line_items || order.line_items.length === 0) {
        ElMessage.warning(t('pickingList.orderEmpty'))
        return
      }
      res = await pickingApi.createFromOrder({
        shopify_order_id: order.id,
        shopify_order_name: order.name,
        customer_name: order.customer_name,
        line_items: order.line_items,
        layout_id: warehouseStore.selectedLayoutId || undefined,
      })
    } else {
      if (!selectedExhibitionId.value) { ElMessage.warning(t('pickingList.selectExhibition')); return }
      res = await pickingApi.createFromExhibition({ exhibition_id: selectedExhibitionId.value, layout_id: warehouseStore.selectedLayoutId || undefined })
    }
    ElMessage.success(t('pickingList.created'))
    showCreateDialog.value = false
    await loadTasks()
    router.push(`/picking/${res.data.id}`)
  } catch (err) {
    ElMessage.error(localizedError(err, t, 'pickingList.createFailed'))
  } finally {
    createLoading.value = false
  }
}

// 监听对话框打开
const _showCreateDialog = ref(false)
Object.defineProperty(showCreateDialog, 'value', {
  get() { return _showCreateDialog.value },
  set(v) {
    _showCreateDialog.value = v
    if (v) openCreateDialog()
  }
})

async function deleteTask(task) {
  try {
    await ElMessageBox.confirm(
      t('pickingList.deleteConfirm', { name: task.shopify_order_name || task.exhibition_name || task.id }),
      t('pickingList.deleteTitle'),
      { confirmButtonText: t('pickingList.confirmDelete'), cancelButtonText: t('common.cancel'), type: 'warning' }
    )
    await pickingApi.deleteTask(task.id)
    ElMessage.success(t('pickingList.deleted'))
    await loadTasks()
  } catch (err) {
    if (err !== 'cancel') ElMessage.error(localizedError(err, t, 'common.deleteFailed'))
  }
}

watch(() => warehouseStore.selectedLayoutId, loadTasks, { immediate: true })
</script>

<style scoped>
.picking-list { animation: fadeIn 0.3s ease; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

.page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; }
.page-title { font-size: 22px; font-weight: 700; color: #1a1a2e; margin: 0 0 4px; }
.page-subtitle { color: #909399; font-size: 13px; }
.header-actions { display: flex; gap: 10px; }

.filter-card { margin-bottom: 20px; }
.filter-row { display: flex; gap: 12px; flex-wrap: wrap; }

.tasks-list { display: flex; flex-direction: column; gap: 12px; }
.task-card {
  background: #fff;
  border-radius: 12px;
  padding: 18px 20px;
  display: flex;
  align-items: center;
  gap: 20px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  border: 1px solid #f0f0f0;
  transition: transform 0.2s, box-shadow 0.2s;
}
.task-card:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.1); }
.task-left { flex: 1; }
.task-name { font-size: 16px; font-weight: 600; color: #1a1a2e; }
.task-meta { font-size: 12px; color: #909399; margin-top: 4px; }
.task-center { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.progress-text { font-size: 12px; color: #909399; }
.task-right { display: flex; align-items: center; gap: 12px; }
.arrow-icon { color: #c0c4cc; font-size: 16px; }

.tab-content { padding: 8px 0; }
.tab-hint { font-size: 13px; color: #909399; margin-bottom: 16px; }
.orders-list { max-height: 320px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
.order-item {
  display: flex;
  align-items: center;
  padding: 12px;
  border-radius: 8px;
  border: 2px solid #f0f0f0;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
  position: relative;
}
.order-item:hover { border-color: #b3d8ff; background: #f5f7ff; }
.order-item.selected { border-color: #409EFF; background: #ecf5ff; }
.order-left { flex: 1; }
.order-name { font-size: 14px; font-weight: 600; color: #303133; }
.order-customer { font-size: 12px; color: #909399; }
.order-right { text-align: right; }
.order-items { font-size: 13px; font-weight: 600; color: #409EFF; }
.order-date { font-size: 11px; color: #c0c4cc; }
.check-icon { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); }

.exhibitions-list { display: flex; flex-direction: column; gap: 8px; }
.exhibition-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  border: 2px solid #f0f0f0;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
  position: relative;
}
.exhibition-item:hover { border-color: #ffd591; background: #fffbe6; }
.exhibition-item.selected { border-color: #E6A23C; background: #fdf6ec; }
.ex-name { font-size: 14px; font-weight: 600; color: #303133; flex: 1; }
.ex-date { font-size: 12px; color: #909399; }
</style>
