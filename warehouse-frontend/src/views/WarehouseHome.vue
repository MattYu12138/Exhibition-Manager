<template>
  <div class="warehouse-home">
    <div class="page-header">
      <div>
        <h1 class="page-title">🏭 {{ $t('dashboard.title') }}</h1>
        <p class="page-subtitle">{{ $t('dashboard.subtitle') }}</p>
      </div>
      <div class="header-actions">
        <el-button type="primary" @click="$router.push('/picking')">
          <el-icon><List /></el-icon> {{ $t('dashboard.pickingTasks') }}
        </el-button>
        <el-button @click="$router.push('/map')">
          <el-icon><MapLocation /></el-icon> {{ $t('dashboard.viewMap') }}
        </el-button>
      </div>
    </div>

    <el-alert v-if="authStore.isAdmin && legacyTasks.length" type="warning" :closable="false" show-icon class="legacy-alert">
      <template #title>{{ $t('dashboard.legacyTitle', { count: legacyTasks.length }) }}</template>
      <template #default>
        {{ $t('dashboard.legacyDescription') }}
        <el-button size="small" type="warning" plain @click="legacyDialog = true">{{ $t('dashboard.reviewLegacy') }}</el-button>
      </template>
    </el-alert>

    <!-- 可调拨提醒横幅 -->
    <div v-if="transferAlertCount > 0" class="transfer-banner" @click="$router.push('/locations')">
      <div class="banner-left">
        <span class="banner-icon">🔄</span>
        <div>
          <div class="banner-title">{{ $t('dashboard.transferTitle') }}</div>
          <div class="banner-desc">{{ $t('dashboard.transferDesc', { count: transferAlertCount }) }}</div>
        </div>
      </div>
      <el-button type="success" size="small">{{ $t('dashboard.actNow') }}</el-button>
    </div>

    <!-- 补货提醒横幅 -->
    <div v-if="pendingReplenishCount > 0" class="replenishment-banner" @click="$router.push('/replenishment')">
      <div class="banner-left">
        <span class="banner-icon">🚚</span>
        <div>
          <div class="banner-title">{{ $t('dashboard.replenishTitle') }}</div>
          <div class="banner-desc">{{ $t('dashboard.replenishDesc', { count: pendingReplenishCount }) }}</div>
        </div>
      </div>
      <el-button type="warning" size="small">{{ $t('dashboard.actNow') }}</el-button>
    </div>

    <!-- 统计卡片 -->
    <div class="stats-grid" v-loading="statsLoading">
      <div class="stat-card" v-for="stat in stats" :key="stat.label" :style="{ '--accent': stat.color }">
        <div class="stat-icon">{{ stat.icon }}</div>
        <div class="stat-body">
          <div class="stat-value">{{ stat.value }}</div>
          <div class="stat-label">{{ stat.label }}</div>
        </div>
      </div>
    </div>

    <el-row :gutter="20" style="margin-top: 20px">
      <!-- 最近拣货任务 -->
      <el-col :span="14">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>{{ $t('dashboard.recentTasks') }}</span>
              <el-button text type="primary" @click="$router.push('/picking')">{{ $t('dashboard.viewAll') }}</el-button>
            </div>
          </template>
          <el-table :data="recentTasks" size="small" v-loading="tasksLoading">
            <el-table-column :label="$t('dashboard.task')" min-width="160">
              <template #default="{ row }">
                <div class="task-name">
                  <el-tag size="small" :type="row.task_type === 'order' ? 'primary' : 'warning'" style="margin-right:6px">
                    {{ row.task_type === 'order' ? $t('pickingList.orderPicking') : $t('common.exhibition') }}
                  </el-tag>
                  {{ row.shopify_order_name || row.exhibition_name || row.id }}
                </div>
              </template>
            </el-table-column>
            <el-table-column :label="$t('dashboard.progress')" width="120">
              <template #default="{ row }">
                <el-progress
                  :percentage="row.total_lines ? Math.round(row.picked_lines / row.total_lines * 100) : 0"
                  :status="row.status === 'completed' ? 'success' : undefined"
                  :stroke-width="6"
                />
              </template>
            </el-table-column>
            <el-table-column :label="$t('common.status')" width="100">
              <template #default="{ row }">
                <el-tag size="small" :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="" width="60">
              <template #default="{ row }">
                <el-button text type="primary" size="small" @click="$router.push(`/picking/${row.id}`)">
                  <el-icon><ArrowRight /></el-icon>
                </el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!tasksLoading && recentTasks.length === 0" :description="$t('dashboard.noTasks')" :image-size="60" />
        </el-card>
      </el-col>

      <!-- 快捷操作 -->
      <el-col :span="10">
        <el-card>
          <template #header><span>{{ $t('dashboard.quickActions') }}</span></template>
          <div class="quick-actions">
            <div class="quick-item" @click="$router.push('/barcode')">
              <div class="quick-icon" style="background: linear-gradient(135deg, #c7aa87, #ead4b8)">▥</div>
              <div class="quick-text">
                <div class="quick-title">{{ $t('nav.barcodeLookup') }}</div>
                <div class="quick-desc">{{ $t('barcodeLookup.quickHelp') }}</div>
              </div>
            </div>
            <div class="quick-item" @click="$router.push('/replenishment')">
              <div class="quick-icon" style="background: linear-gradient(135deg, #f7971e, #ffd200)">
                🚚
                <span v-if="pendingReplenishCount > 0" class="badge">{{ pendingReplenishCount }}</span>
              </div>
              <div class="quick-text">
                <div class="quick-title">{{ $t('dashboard.replenishManage') }}</div>
                <div class="quick-desc">{{ $t('dashboard.replenishHelp') }}</div>
              </div>
            </div>
            <div class="quick-item" @click="$router.push('/picking')">
              <div class="quick-icon" style="background: linear-gradient(135deg, #667eea, #764ba2)">📦</div>
              <div class="quick-text">
                <div class="quick-title">{{ $t('dashboard.createPicking') }}</div>
                <div class="quick-desc">{{ $t('dashboard.createPickingHelp') }}</div>
              </div>
            </div>
            <div class="quick-item" @click="$router.push('/locations')">
              <div class="quick-icon" style="background: linear-gradient(135deg, #f093fb, #f5576c)">📍</div>
              <div class="quick-text">
                <div class="quick-title">{{ $t('dashboard.locationManage') }}</div>
                <div class="quick-desc">{{ $t('dashboard.locationHelp') }}</div>
              </div>
            </div>
            <div class="quick-item" @click="$router.push('/map')">
              <div class="quick-icon" style="background: linear-gradient(135deg, #4facfe, #00f2fe)">🗺️</div>
              <div class="quick-text">
                <div class="quick-title">{{ $t('nav.map') }}</div>
                <div class="quick-desc">{{ $t('dashboard.mapHelp') }}</div>
              </div>
            </div>
            <div v-if="authStore.isAdmin" class="quick-item" @click="$router.push('/map/builder')">
              <div class="quick-icon" style="background: linear-gradient(135deg, #43e97b, #38f9d7)">🔧</div>
              <div class="quick-text">
                <div class="quick-title">{{ $t('pageTitle.builder') }}</div>
                <div class="quick-desc">{{ $t('dashboard.builderHelp') }}</div>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
    <el-dialog v-model="legacyDialog" :title="$t('dashboard.legacyDialogTitle')" width="min(750px, 96vw)">
      <p class="legacy-explanation">{{ $t('dashboard.legacyInstructions') }}</p>
      <el-table :data="legacyTasks" max-height="420" size="small" style="width:100%">
        <el-table-column :label="$t('dashboard.task')" min-width="170">
          <template #default="{ row }">{{ row.kind === 'picking' ? $t('dashboard.legacyPicking') : $t('dashboard.legacyReplenishment') }} · {{ row.id.slice(0, 12) }}…</template>
        </el-table-column>
        <el-table-column :label="$t('common.status')" min-width="96">
          <template #default="{ row }">{{ statusLabel(row.status) }}</template>
        </el-table-column>
        <el-table-column :label="$t('dashboard.legacyEvidence')" min-width="130">
          <template #default="{ row }">
            {{ row.line_count }} {{ $t('dashboard.legacyLines') }} · {{ row.candidate_layout_ids?.length || 0 }} {{ $t('dashboard.legacyMatches') }}
            <el-tag v-if="row.missing_locations || row.candidate_layout_ids?.length > 1" type="danger" size="small">{{ $t('dashboard.legacyManualOnly') }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="$t('nav.selectWarehouse')" min-width="190">
          <template #default="{ row }">
            <el-select v-model="legacyChoices[row.kind + ':' + row.id]" :placeholder="$t('nav.selectWarehouse')"
              :disabled="Boolean(row.missing_locations || row.candidate_layout_ids?.length > 1)" size="small">
              <el-option v-for="layout in warehouseStore.layouts" :key="layout.id" :value="layout.id"
                :label="`${layout.name} · #${layout.id.slice(-6)}`" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column width="90" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" text :disabled="!legacyChoices[row.kind + ':' + row.id] || Boolean(row.missing_locations || row.candidate_layout_ids?.length > 1)"
              @click="assignLegacy(row)">{{ $t('dashboard.legacyAssign') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch, reactive } from 'vue'
import { layoutApi, pickingApi, replenishmentApi, locationApi } from '@/api/index.js'
import { localizedError } from '@/i18n'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { useWarehouseStore } from '@/stores/warehouse'
import { useI18n } from 'vue-i18n'
import { List, MapLocation, ArrowRight } from '@element-plus/icons-vue'

const authStore = useAuthStore()
const warehouseStore = useWarehouseStore()
const { t } = useI18n()
const statsLoading = ref(false)
const tasksLoading = ref(false)
const recentTasks = ref([])
const layoutData = ref(null)
const pendingReplenishCount = ref(0)
const transferAlertCount = ref(0)
const legacyTasks = ref([])
const legacyDialog = ref(false)
const legacyChoices = reactive({})

const stats = computed(() => [
  { label: t('dashboard.totalLocations'), value: layoutData.value?.locations?.length || 0, icon: '📍', color: '#667eea' },
  { label: t('dashboard.occupiedLocations'), value: layoutData.value?.locations?.filter(l => l.total_qty > 0).length || 0, icon: '📦', color: '#f093fb' },
  { label: t('dashboard.awaitingReplenishment'), value: pendingReplenishCount.value, icon: '🚚', color: '#f7971e' },
  { label: t('dashboard.completedToday'), value: recentTasks.value.filter(task => task.status === 'completed').length, icon: '✅', color: '#43e97b' },
])

function statusType(s) {
  return { pending: 'info', in_progress: 'warning', completed: 'success', cancelled: 'danger' }[s] || 'info'
}
function statusLabel(s) {
  const labels = { pending: 'common.pending', in_progress: 'common.inProgress', completed: 'common.completed', cancelled: 'common.cancelled' }
  return labels[s] ? t(labels[s]) : s
}

async function loadOverview() {
  statsLoading.value = true
  tasksLoading.value = true
  try {
    const [layoutRes, tasksRes, replenishRes, alertsRes] = await Promise.all([
      (warehouseStore.selectedLayoutId ? layoutApi.get(warehouseStore.selectedLayoutId) : layoutApi.getActive()).catch(() => ({ data: null })),
      pickingApi.listTasks({ limit: 8 }).catch(() => ({ data: [] })),
      replenishmentApi.getPendingCount().catch(() => ({ data: { count: 0 } })),
      locationApi.getAlerts().catch(() => ({ data: [] })),
    ])
    layoutData.value = layoutRes.data
    recentTasks.value = tasksRes.data?.slice(0, 8) || []
    pendingReplenishCount.value = replenishRes.data?.count || 0
    const alerts = alertsRes.data || []
    transferAlertCount.value = alerts.filter(a => a.transfer_available?.length > 0).length
  } finally {
    statsLoading.value = false
    tasksLoading.value = false
  }
}
watch(() => warehouseStore.selectedLayoutId, loadOverview, { immediate: true })
async function loadLegacy() {
  if (!authStore.isAdmin) { legacyTasks.value = []; return }
  try {
    const response = await layoutApi.unassigned()
    legacyTasks.value = response.data || []
  } catch (error) { ElMessage.error(localizedError(error, t, 'common.requestFailed')) }
}
async function assignLegacy(row) {
  const selectedId = legacyChoices[row.kind + ':' + row.id]
  if (!selectedId) return
  try {
    await layoutApi.assignUnassigned(row.kind, row.id, selectedId)
    ElMessage.success(t('dashboard.legacyAssigned'))
    await Promise.all([loadLegacy(), loadOverview()])
  } catch (error) { ElMessage.error(localizedError(error, t, 'common.requestFailed')) }
}
watch(() => authStore.isAdmin, loadLegacy, { immediate: true })
</script>

<style scoped>
.warehouse-home { animation: fadeIn 0.3s ease; }
.legacy-alert { margin-bottom: 16px; }
.legacy-alert :deep(.el-button) { margin-left: 12px; }
.legacy-explanation { color: #606266; font-size: 13px; margin: 0 0 16px; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

.page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px; }
.page-title { font-size: 24px; font-weight: 700; color: #1a1a2e; margin: 0 0 4px; }
.page-subtitle { color: #909399; font-size: 14px; }
.header-actions { display: flex; gap: 10px; }

/* 可调拨横幅 */
.transfer-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(135deg, #d4edda, #c3e6cb);
  border: 1px solid #28a745;
  border-radius: 12px;
  padding: 14px 20px;
  margin-bottom: 12px;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}
.transfer-banner:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(40,167,69,0.3); }

/* 补货横幅 */
.replenishment-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(135deg, #fff3cd, #ffe69c);
  border: 1px solid #ffc107;
  border-radius: 12px;
  padding: 14px 20px;
  margin-bottom: 20px;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}
.replenishment-banner:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(255,193,7,0.3); }
.banner-left { display: flex; align-items: center; gap: 14px; }
.banner-icon { font-size: 28px; }
.banner-title { font-size: 15px; font-weight: 700; color: #856404; }
.banner-desc { font-size: 13px; color: #997404; margin-top: 2px; }

.stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.stat-card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
  border-left: 4px solid var(--accent);
  transition: transform 0.2s, box-shadow 0.2s;
}
.stat-card:hover { transform: translateY(-2px); box-shadow: 0 4px 20px rgba(0,0,0,0.12); }
.stat-icon { font-size: 28px; }
.stat-value { font-size: 28px; font-weight: 700; color: #1a1a2e; line-height: 1; }
.stat-label { font-size: 13px; color: #909399; margin-top: 4px; }

.card-header { display: flex; align-items: center; justify-content: space-between; }
.task-name { display: flex; align-items: center; font-size: 13px; }

.quick-actions { display: flex; flex-direction: column; gap: 12px; }
.quick-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.2s, transform 0.15s;
  border: 1px solid #f0f0f0;
}
.quick-item:hover { background: #f8f9ff; transform: translateX(4px); }
.quick-icon {
  width: 44px; height: 44px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; flex-shrink: 0; position: relative;
}
.badge {
  position: absolute;
  top: -6px; right: -6px;
  background: #f56c6c;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  border-radius: 10px;
  padding: 1px 5px;
  min-width: 16px;
  text-align: center;
  line-height: 14px;
}
.quick-title { font-size: 14px; font-weight: 600; color: #1a1a2e; }
.quick-desc { font-size: 12px; color: #909399; margin-top: 2px; }
</style>
