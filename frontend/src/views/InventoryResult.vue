<template>
  <div class="inventory-page">
    <div class="page-header">
      <el-button text @click="$router.back()"><el-icon><ArrowLeft /></el-icon> {{ t('common.back') }}</el-button>
      <div>
        <h1 class="page-title">{{ t('inventoryResult.pageTitle') }}</h1>
        <p class="page-desc">{{ t('inventoryResult.pageDesc') }}</p>
      </div>
    </div>

    <el-card class="action-card">
      <el-row justify="center">
        <el-col :xs="24" :sm="16" :md="12">
          <el-button type="primary" size="large" style="width: 100%" :loading="syncing === 'after'" @click="handleSyncAfter">
            <el-icon><Download /></el-icon> {{ t('inventoryResult.btnSyncAfter') }}
          </el-button>
          <div class="btn-hint">{{ t('inventoryResult.btnSyncAfterHint') }}</div>
        </el-col>
      </el-row>
    </el-card>

    <el-card>
      <template #header>
        <div class="card-header">
          <span style="font-weight: 600">{{ t('inventoryResult.tableTitle') }}</span>
          <div class="header-right">
            <el-tag v-if="snapshots.length" type="success" size="default">{{ t('common.total', { n: snapshots.length }) }}</el-tag>
            <el-button size="small" @click="loadSnapshotData" :loading="loadingSnap">
              <el-icon><Refresh /></el-icon> {{ t('common.refresh') }}
            </el-button>
          </div>
        </div>
      </template>

      <el-empty v-if="!snapshots.length && !loadingSnap" :description="t('inventoryResult.emptyHint')" />

      <div v-else v-loading="loadingSnap">
        <el-row :gutter="16" class="summary-row" v-if="snapshots.length">
          <el-col :span="8">
            <div class="summary-item">
              <div class="summary-num blue">{{ totalPlanned }}</div>
              <div class="summary-label">{{ t('inventoryResult.totalPlanned') }}</div>
            </div>
          </el-col>
          <el-col :span="8">
            <div class="summary-item">
              <div class="summary-num orange">{{ totalSold }}</div>
              <div class="summary-label">{{ t('inventoryResult.totalSold') }}</div>
            </div>
          </el-col>
          <el-col :span="8">
            <div class="summary-item">
              <div class="summary-num green">{{ totalRemaining }}</div>
              <div class="summary-label">{{ t('inventoryResult.totalRemaining') }}</div>
            </div>
          </el-col>
        </el-row>

        <el-table :data="snapshots" stripe border style="margin-top: 16px">
          <el-table-column :label="t('inventoryResult.colProduct')" min-width="200">
            <template #default="{ row }">
              <div>
                <div style="font-weight: 600; font-size: 14px">{{ row.product_title }}</div>
                <div style="font-size: 12px; color: #909399">{{ row.variant_title }}</div>
              </div>
            </template>
          </el-table-column>
          <el-table-column :label="t('inventoryResult.colPlanned')" width="110" align="center">
            <template #default="{ row }">
              <el-tag type="info">{{ row.item_planned_qty ?? '-' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="t('inventoryResult.colSquareRemaining')" width="120" align="center">
            <template #default="{ row }">
              <span v-if="row.square_quantity_after !== null && row.square_quantity_after !== undefined">
                {{ row.square_quantity_after }}
              </span>
              <span v-else style="color: #c0c4cc">{{ t('inventoryResult.pendingSync') }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('inventoryResult.colSold')" width="110" align="center">
            <template #default="{ row }">
              <el-tag type="warning" v-if="row.sold_quantity !== null && row.sold_quantity !== undefined && row.sold_quantity > 0">
                {{ row.sold_quantity }}
              </el-tag>
              <span v-else-if="row.sold_quantity === 0" style="color: #909399">0</span>
              <span v-else style="color: #c0c4cc">-</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('inventoryResult.colRemaining')" width="140" align="center">
            <template #default="{ row }">
              <el-tag
                :type="row.remaining_quantity > 0 ? 'success' : 'danger'"
                size="large"
                effect="dark"
                v-if="row.remaining_quantity !== null && row.remaining_quantity !== undefined && row.square_quantity_after !== null"
                style="font-size: 16px; font-weight: 700"
              >
                {{ row.remaining_quantity }}
              </el-tag>
              <span v-else style="color: #c0c4cc">-</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('inventoryResult.colSquareMatch')" width="110" align="center">
            <template #default="{ row }">
              <el-tag :type="row.square_catalog_variation_id ? 'success' : 'danger'" size="small">
                {{ row.square_catalog_variation_id ? t('inventoryResult.matched') : t('inventoryResult.unmatched') }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="t('inventoryResult.colSyncTime')" width="160" align="center">
            <template #default="{ row }">
              <span style="font-size: 12px; color: #909399">{{ formatDate(row.synced_at) }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useExhibitionStore } from '@/stores/exhibition'

const { t } = useI18n()
const route = useRoute()
const store = useExhibitionStore()
const id = route.params.id

const snapshots = ref([])
const syncing = ref(null)
const loadingSnap = ref(false)
const currentStep = ref(0)

const totalPlanned = computed(() =>
  snapshots.value.reduce((s, r) => s + (r.item_planned_qty || 0), 0)
)
const totalSold = computed(() =>
  snapshots.value.reduce((s, r) => s + (r.sold_quantity || 0), 0)
)
const totalRemaining = computed(() =>
  snapshots.value.reduce((s, r) => s + (r.remaining_quantity || 0), 0)
)

async function loadSnapshotData() {
  loadingSnap.value = true
  try {
    const data = await store.loadSnapshots(id)
    snapshots.value = data || []
    if (snapshots.value.some((s) => s.square_quantity_before > 0)) currentStep.value = 1
    if (snapshots.value.some((s) => s.square_quantity_after !== null && s.square_quantity_after !== undefined)) currentStep.value = 2
  } finally {
    loadingSnap.value = false
  }
}

async function handleSyncBefore() {
  await ElMessageBox.confirm(
    t('inventoryResult.confirmSyncBefore'),
    t('inventoryResult.confirmTitle'),
    { type: 'warning', confirmButtonText: t('inventoryResult.confirmSyncBtn') }
  )
  syncing.value = 'before'
  try {
    const result = await store.syncBeforeExhibition(id)
    await loadSnapshotData()
    currentStep.value = 1
    const syncedCount = result?.data?.filter(r => r.status === 'synced').length || 0
    ElMessage.success(t('inventoryResult.syncBeforeSuccess', { n: syncedCount }))
  } catch (err) {
    ElMessage.error(t('inventoryResult.syncFailed', { msg: err.message || '' }))
  } finally {
    syncing.value = null
  }
}

async function handleSyncAfter() {
  await ElMessageBox.confirm(
    t('inventoryResult.confirmSyncAfter'),
    t('inventoryResult.confirmGetTitle'),
    { type: 'info', confirmButtonText: t('inventoryResult.confirmGetBtn') }
  )
  syncing.value = 'after'
  try {
    await store.syncAfterExhibition(id)
    await loadSnapshotData()
    currentStep.value = 2
    await store.updateExhibition(id, { status: 'completed' })
    ElMessage.success(t('inventoryResult.syncAfterSuccess'))
  } catch (err) {
    ElMessage.error(t('inventoryResult.getFailed', { msg: err.message || '' }))
  } finally {
    syncing.value = null
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString(t('common.all') === 'All' ? 'en-AU' : 'zh-CN')
}

onMounted(async () => {
  await store.loadExhibition(id)
  await loadSnapshotData()
})
</script>

<style scoped>
.page-header { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 24px; }
.page-title { font-size: 22px; font-weight: 700; }
.page-desc { font-size: 14px; color: #909399; margin-top: 4px; }

.action-card { margin-bottom: 20px; }
.btn-hint { font-size: 12px; color: #909399; margin-top: 6px; text-align: center; line-height: 1.4; }

.card-header { display: flex; justify-content: space-between; align-items: center; }
.header-right { display: flex; align-items: center; gap: 10px; }

.summary-row { margin-bottom: 8px; }
.summary-item { text-align: center; padding: 16px; background: #fafafa; border-radius: 10px; }
.summary-num { font-size: 32px; font-weight: 800; }
.summary-num.blue { color: #409eff; }
.summary-num.orange { color: #e6a23c; }
.summary-num.green { color: #67c23a; }
.summary-num.red { color: #f56c6c; }
.summary-label { font-size: 13px; color: #909399; margin-top: 4px; }
</style>
