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

    <!-- 未匹配商品弹窗 -->
    <el-dialog
      v-model="unmatchedDialogVisible"
      :title="t('unmatchedDialog.title')"
      width="90%"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
    >
      <el-alert type="warning" :closable="false" style="margin-bottom: 16px">
        <template #title>
          <span style="font-size: 14px">{{ t('unmatchedDialog.subtitle', { n: unmatchedItems.length }) }}</span>
        </template>
      </el-alert>

      <el-table :data="unmatchedItems" border stripe max-height="500">
        <el-table-column type="index" width="50" align="center" />
        <el-table-column :label="t('unmatchedDialog.colProduct')" min-width="200" fixed>
          <template #default="{ row }">
            <div style="display: flex; align-items: center; gap: 8px">
              <el-image v-if="row.image_url" :src="row.image_url" style="width: 40px; height: 40px; border-radius: 4px" fit="cover" />
              <div>
                <div style="font-weight: 600; font-size: 13px">{{ row.product_title }}</div>
                <div style="font-size: 12px; color: #909399">{{ row.variant_title }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column :label="t('unmatchedDialog.colSku')" width="120">
          <template #default="{ row }">
            <span style="font-size: 12px; color: #606266">{{ row.sku || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('unmatchedDialog.colGtin')" width="140">
          <template #default="{ row }">
            <span style="font-size: 12px; color: #606266">{{ row.gtin || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('unmatchedDialog.colPlannedQty')" width="100" align="center">
          <template #default="{ row }">
            <el-tag type="info">{{ row.planned_quantity }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('unmatchedDialog.colItemName')" width="180">
          <template #default="{ row }">
            <el-input
              v-model="row.customName"
              :placeholder="t('unmatchedDialog.itemNamePlaceholder')"
              size="small"
              :disabled="!row.includeInSquare"
            />
          </template>
        </el-table-column>
        <el-table-column :label="t('unmatchedDialog.colVariantName')" width="150">
          <template #default="{ row }">
            <el-input
              v-model="row.customVariantName"
              :placeholder="t('unmatchedDialog.variantNamePlaceholder')"
              size="small"
              :disabled="!row.includeInSquare"
            />
          </template>
        </el-table-column>
        <el-table-column :label="t('unmatchedDialog.colPrice')" width="120">
          <template #default="{ row }">
            <el-input-number
              v-model="row.customPrice"
              :placeholder="t('unmatchedDialog.pricePlaceholder')"
              size="small"
              :min="0"
              :precision="2"
              :step="0.01"
              :disabled="!row.includeInSquare"
              style="width: 100%"
            />
          </template>
        </el-table-column>
        <el-table-column :label="t('unmatchedDialog.colAction')" width="140" align="center" fixed="right">
          <template #default="{ row }">
            <el-switch
              v-model="row.includeInSquare"
              :active-text="t('unmatchedDialog.includeItem')"
              :inactive-text="t('unmatchedDialog.skipItem')"
              inline-prompt
              style="--el-switch-on-color: #67c23a; --el-switch-off-color: #909399"
            />
          </template>
        </el-table-column>
      </el-table>

      <template #footer>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <el-button @click="skipAllUnmatched" :disabled="addingToSquare">{{ t('unmatchedDialog.skipAll') }}</el-button>
          <div style="display: flex; gap: 10px">
            <el-button @click="unmatchedDialogVisible = false" :disabled="addingToSquare">{{ t('unmatchedDialog.cancel') }}</el-button>
            <el-button type="primary" @click="confirmAddToSquare" :loading="addingToSquare">
              {{ t('unmatchedDialog.addSelected') }}
            </el-button>
          </div>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useExhibitionStore } from '@/stores/exhibition'
import { squareApi } from '@/api'

const { t } = useI18n()
const route = useRoute()
const store = useExhibitionStore()
const id = route.params.id

const snapshots = ref([])
const syncing = ref(null)
const loadingSnap = ref(false)
const currentStep = ref(0)

// 未匹配商品弹窗
const unmatchedDialogVisible = ref(false)
const unmatchedItems = ref([])
const addingToSquare = ref(false)

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
    
    // 检查是否有未匹配商品
    if (result?.unmatched && result.unmatched.length > 0) {
      // 初始化未匹配商品列表，添加自定义字段
      unmatchedItems.value = result.unmatched.map((item) => ({
        ...item,
        customName: item.product_title || '',
        customVariantName: item.variant_title || 'Default',
        customPrice: 0,
        customDescription: '',
        includeInSquare: true, // 默认选中
      }))
      unmatchedDialogVisible.value = true
    } else {
      // 全部匹配成功
      await loadSnapshotData()
      currentStep.value = 1
      const syncedCount = result?.data?.filter(r => r.status === 'synced').length || 0
      ElMessage.success(t('inventoryResult.syncBeforeSuccess', { n: syncedCount }))
    }
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

function skipAllUnmatched() {
  unmatchedDialogVisible.value = false
  ElMessage.info(t('unmatchedDialog.skipHint'))
}

async function confirmAddToSquare() {
  const selectedItems = unmatchedItems.value.filter((item) => item.includeInSquare)
  
  if (selectedItems.length === 0) {
    ElMessage.warning(t('unmatchedDialog.noItemsSelected'))
    return
  }

  // 验证必填字段
  for (const item of selectedItems) {
    if (!item.customName || !item.customVariantName) {
      ElMessage.warning(`${item.product_title} - ${item.variant_title}: ${t('unmatchedDialog.itemNamePlaceholder')}`)
      return
    }
  }

  await ElMessageBox.confirm(
    t('unmatchedDialog.confirmAddMsg', { n: selectedItems.length }),
    t('unmatchedDialog.confirmAdd'),
    { type: 'warning', confirmButtonText: t('common.confirm') }
  )

  addingToSquare.value = true
  try {
    const payload = selectedItems.map((item) => ({
      shopify_variant_id: item.shopify_variant_id,
      name: item.customName,
      variantName: item.customVariantName,
      sku: item.sku || '',
      gtin: item.gtin || '',
      priceCents: Math.round((item.customPrice || 0) * 100), // 转换为分
      description: item.customDescription || '',
      planned_quantity: item.planned_quantity,
    }))

    const result = await squareApi.createItems(id, payload)
    
    const successCount = result?.summary?.created || 0
    const failCount = result?.summary?.failed || 0

    if (failCount === 0) {
      ElMessage.success(t('unmatchedDialog.addSuccess', { n: successCount }))
    } else {
      ElMessage.warning(t('unmatchedDialog.addPartial', { success: successCount, fail: failCount }))
    }

    unmatchedDialogVisible.value = false
    await loadSnapshotData()
    currentStep.value = 1
  } catch (err) {
    ElMessage.error(t('unmatchedDialog.addFailed', { msg: err.message || '' }))
  } finally {
    addingToSquare.value = false
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
