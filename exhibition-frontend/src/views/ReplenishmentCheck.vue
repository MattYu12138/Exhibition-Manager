<template>
  <div class="replenishment-page">
    <div class="page-header">
      <el-button text @click="$router.back()">
        <el-icon><ArrowLeft /></el-icon> {{ t('common.back') }}
      </el-button>
      <h2 class="page-title">{{ t('replenishment.pageTitle') }}</h2>
    </div>

    <!-- 操作栏 -->
    <el-card class="action-bar">
      <div class="bar-content">
        <div class="bar-info">
          <el-tag type="info" size="large">{{ t('replenishment.totalItems', { n: items.length }) }}</el-tag>
          <el-tag v-if="needsCount > 0" type="danger" size="large">{{ t('replenishment.needsReplenishment', { n: needsCount }) }}</el-tag>
          <el-tag v-else type="success" size="large">{{ t('replenishment.allSufficient') }}</el-tag>
        </div>
        <div class="bar-actions">
          <el-button type="primary" @click="fetchData" :loading="loading">
            <el-icon><Refresh /></el-icon> {{ t('replenishment.refreshSquare') }}
          </el-button>
          <el-button
            v-if="selectedItems.length > 0"
            type="success"
            @click="confirmReplenishment"
          >
            <el-icon><Check /></el-icon> {{ t('replenishment.confirmBtn', { n: selectedItems.length }) }}
          </el-button>
        </div>
      </div>
    </el-card>

    <!-- 桌面端表格 -->
    <el-card v-loading="loading" class="desktop-table">
      <el-table :data="items" stripe style="width: 100%">
        <el-table-column width="50" align="center">
          <template #header>
            <el-checkbox
              v-model="selectAll"
              :indeterminate="isIndeterminate"
              @change="handleSelectAll"
            />
          </template>
          <template #default="{ row }">
            <el-checkbox
              v-if="row.needs_replenishment"
              v-model="row._selected"
              @change="updateSelection"
            />
          </template>
        </el-table-column>

        <el-table-column :label="t('replenishment.colProduct')" min-width="220">
          <template #default="{ row }">
            <div class="product-cell">
              <el-image
                v-if="row.image_url"
                :src="row.image_url"
                style="width: 40px; height: 40px; border-radius: 6px; flex-shrink: 0"
                fit="cover"
              />
              <div>
                <div class="product-title">{{ row.product_title }}</div>
                <div class="product-variant">{{ row.variant_title }}</div>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column :label="t('replenishment.colRack')" width="90" align="center">
          <template #default="{ row }">
            <span class="qty-badge rack">{{ row.rack_quantity }}</span>
          </template>
        </el-table-column>

        <el-table-column :label="t('replenishment.colSquareQty')" width="110" align="center">
          <template #default="{ row }">
            <span
              class="qty-badge"
              :class="row.current_square_qty !== null && row.current_square_qty < row.rack_quantity ? 'danger' : 'ok'"
            >
              {{ row.current_square_qty ?? t('replenishment.notSynced') }}
            </span>
          </template>
        </el-table-column>

        <el-table-column :label="t('replenishment.colSold')" width="80" align="center">
          <template #default="{ row }">
            <span class="sold-num">{{ row.sold }}</span>
          </template>
        </el-table-column>

        <el-table-column :label="t('replenishment.colStockRemaining')" width="90" align="center">
          <template #default="{ row }">
            <span :class="row.stock_quantity <= 0 ? 'text-danger' : ''">{{ row.stock_quantity }}</span>
          </template>
        </el-table-column>

        <el-table-column :label="t('replenishment.colStatus')" width="120" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.needs_replenishment" type="danger" size="small">{{ t('replenishment.statusNeed') }}</el-tag>
            <el-tag v-else type="success" size="small">{{ t('replenishment.statusOk') }}</el-tag>
          </template>
        </el-table-column>

        <el-table-column :label="t('replenishment.colReplenishQty')" width="120" align="center">
          <template #default="{ row }">
            <el-input-number
              v-if="row.needs_replenishment && row._selected"
              v-model="row._replenishQty"
              :min="1"
              :max="Math.max(1, row.stock_quantity)"
              size="small"
              controls-position="right"
            />
            <span v-else-if="row.needs_replenishment" class="text-muted">-</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 移动端卡片列表 -->
    <div v-loading="loading" class="mobile-list">
      <div
        v-for="item in items"
        :key="item.shopify_variant_id"
        class="mobile-card"
        :class="{ 'needs-replenish': item.needs_replenishment }"
      >
        <div class="mobile-card-header">
          <el-checkbox
            v-if="item.needs_replenishment"
            v-model="item._selected"
            @change="updateSelection"
          />
          <el-image
            v-if="item.image_url"
            :src="item.image_url"
            class="mobile-img"
            fit="cover"
          />
          <div class="mobile-product-info">
            <div class="product-title">{{ item.product_title }}</div>
            <div class="product-variant">{{ item.variant_title }}</div>
          </div>
          <el-tag
            :type="item.needs_replenishment ? 'danger' : 'success'"
            size="small"
            class="mobile-status-tag"
          >
            {{ item.needs_replenishment ? t('replenishment.statusNeed') : t('replenishment.statusOk') }}
          </el-tag>
        </div>
        <div class="mobile-card-body">
          <div class="mobile-stat">
            <span class="stat-label">{{ t('replenishment.colRack') }}</span>
            <span class="qty-badge rack">{{ item.rack_quantity }}</span>
          </div>
          <div class="mobile-stat">
            <span class="stat-label">{{ t('replenishment.colSquareQty') }}</span>
            <span
              class="qty-badge"
              :class="item.current_square_qty !== null && item.current_square_qty < item.rack_quantity ? 'danger' : 'ok'"
            >
              {{ item.current_square_qty ?? t('replenishment.notSynced') }}
            </span>
          </div>
          <div class="mobile-stat">
            <span class="stat-label">{{ t('replenishment.colSold') }}</span>
            <span class="sold-num">{{ item.sold }}</span>
          </div>
          <div class="mobile-stat">
            <span class="stat-label">{{ t('replenishment.colStockRemaining') }}</span>
            <span :class="item.stock_quantity <= 0 ? 'text-danger' : ''">{{ item.stock_quantity }}</span>
          </div>
        </div>
        <div v-if="item.needs_replenishment && item._selected" class="mobile-card-footer">
          <span class="stat-label">{{ t('replenishment.colReplenishQty') }}</span>
          <el-input-number
            v-model="item._replenishQty"
            :min="1"
            :max="Math.max(1, item.stock_quantity)"
            size="small"
            controls-position="right"
          />
        </div>
      </div>
      <el-empty v-if="!loading && items.length === 0" :description="t('replenishment.noData')" />
    </div>

    <!-- 补货历史 -->
    <el-card v-if="logs.length > 0" class="log-card">
      <template #header>
        <span style="font-weight: 600">{{ t('replenishment.logTitle') }}</span>
      </template>
      <!-- 桌面端日志表格 -->
      <el-table :data="logs" stripe size="small" class="desktop-table">
        <el-table-column :label="t('replenishment.logTime')" prop="created_at" width="170" />
        <el-table-column :label="t('replenishment.colProduct')" min-width="200">
          <template #default="{ row }">
            {{ row.product_title }} - {{ row.variant_title }}
          </template>
        </el-table-column>
        <el-table-column :label="t('replenishment.logQty')" prop="replenish_qty" width="90" align="center" />
        <el-table-column :label="t('replenishment.logReplenishedTotal')" width="120" align="center">
          <template #default="{ row }">
            {{ row.rack_qty_before }} → {{ row.rack_qty_after }}
          </template>
        </el-table-column>
      </el-table>
      <!-- 移动端日志列表 -->
      <div class="mobile-list">
        <div v-for="log in logs" :key="log.id" class="mobile-log-item">
          <div class="log-product">{{ log.product_title }} - {{ log.variant_title }}</div>
          <div class="log-meta">
            <span>{{ log.created_at }}</span>
            <el-tag size="small" type="warning">+{{ log.replenish_qty }}</el-tag>
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { squareApi } from '@/api'

const { t } = useI18n()
const route = useRoute()
const exhibitionId = route.params.id

const loading = ref(false)
const items = ref([])
const logs = ref([])

const needsCount = computed(() => items.value.filter(i => i.needs_replenishment).length)
const selectedItems = computed(() => items.value.filter(i => i._selected))
const selectAll = ref(false)
const isIndeterminate = ref(false)

function handleSelectAll(val) {
  items.value.forEach(item => {
    if (item.needs_replenishment) {
      item._selected = val
    }
  })
  isIndeterminate.value = false
}

function updateSelection() {
  const needItems = items.value.filter(i => i.needs_replenishment)
  const checkedCount = needItems.filter(i => i._selected).length
  selectAll.value = checkedCount === needItems.length && needItems.length > 0
  isIndeterminate.value = checkedCount > 0 && checkedCount < needItems.length
}

async function fetchData() {
  loading.value = true
  try {
    const [checkRes, logRes] = await Promise.all([
      squareApi.replenishmentCheck(exhibitionId),
      squareApi.replenishmentLog(exhibitionId).catch(() => ({ data: [] })),
    ])
    const data = checkRes.data || []
    items.value = data.map(item => ({
      ...item,
      _selected: false,
      _replenishQty: item.suggested_qty || 3,
    }))
    logs.value = logRes.data || []
  } catch (err) {
    ElMessage.error(t('replenishment.fetchFailed') + ': ' + (err.response?.data?.message || err.message))
  } finally {
    loading.value = false
  }
}

async function confirmReplenishment() {
  const toReplenish = selectedItems.value.map(item => ({
    shopify_variant_id: item.shopify_variant_id,
    replenish_qty: item._replenishQty || 3,
  }))

  try {
    await ElMessageBox.confirm(
      t('replenishment.confirmMsg', { n: toReplenish.length }),
      t('replenishment.confirmTitle'),
      { confirmButtonText: t('replenishment.confirmOk'), cancelButtonText: t('replenishment.confirmCancel'), type: 'warning' }
    )
  } catch {
    return
  }

  try {
    const res = await squareApi.replenishmentConfirm(exhibitionId, toReplenish)
    if (res.success) {
      ElMessage.success(res.message || t('replenishment.success'))
      await fetchData()
    } else {
      ElMessage.error(res.message || t('replenishment.failed'))
    }
  } catch (err) {
    ElMessage.error(t('replenishment.failed') + ': ' + (err.response?.data?.message || err.message))
  }
}

onMounted(fetchData)
</script>

<style scoped>
.replenishment-page { padding: 0; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.page-title { font-size: 20px; font-weight: 700; margin: 0; }

.action-bar { margin-bottom: 16px; }
.bar-content { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
.bar-info { display: flex; gap: 8px; flex-wrap: wrap; }
.bar-actions { display: flex; gap: 8px; flex-wrap: wrap; }

.product-cell { display: flex; align-items: center; gap: 10px; }
.product-title { font-weight: 500; font-size: 14px; }
.product-variant { font-size: 12px; color: #909399; }

.qty-badge { display: inline-block; padding: 2px 10px; border-radius: 10px; font-weight: 600; font-size: 13px; }
.qty-badge.rack { background: #ecf5ff; color: #409eff; }
.qty-badge.ok { background: #f0f9eb; color: #67c23a; }
.qty-badge.danger { background: #fef0f0; color: #f56c6c; }

.sold-num { font-weight: 600; color: #e6a23c; }
.text-danger { color: #f56c6c; font-weight: 600; }
.text-muted { color: #c0c4cc; }

.log-card { margin-top: 16px; }

/* 移动端卡片列表默认隐藏 */
.mobile-list { display: none; }

/* 移动端卡片样式 */
.mobile-card {
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 12px;
  border: 1px solid #ebeef5;
  transition: all 0.2s;
}
.mobile-card.needs-replenish {
  border-color: #f56c6c;
  background: #fff5f5;
}
.mobile-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
}
.mobile-img {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  flex-shrink: 0;
}
.mobile-product-info {
  flex: 1;
  min-width: 0;
}
.mobile-product-info .product-title {
  font-size: 13px;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mobile-product-info .product-variant {
  font-size: 11px;
}
.mobile-status-tag {
  flex-shrink: 0;
}
.mobile-card-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid #f0f0f0;
}
.mobile-stat {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.stat-label {
  font-size: 12px;
  color: #909399;
}
.mobile-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #f0f0f0;
}

/* 移动端日志 */
.mobile-log-item {
  padding: 10px 0;
  border-bottom: 1px solid #f0f0f0;
}
.mobile-log-item:last-child { border-bottom: none; }
.log-product { font-size: 13px; font-weight: 500; }
.log-meta { display: flex; justify-content: space-between; align-items: center; margin-top: 4px; font-size: 12px; color: #909399; }

/* 响应式断点 */
@media (max-width: 768px) {
  .page-header { margin-bottom: 12px; }
  .page-title { font-size: 17px; }
  .bar-content { flex-direction: column; align-items: flex-start; }
  .bar-actions { width: 100%; }
  .bar-actions .el-button { flex: 1; }

  /* 桌面表格隐藏，移动卡片显示 */
  .desktop-table { display: none !important; }
  .mobile-list { display: block; }

  .log-card :deep(.el-card__body) { padding: 12px; }
}

@media (min-width: 769px) {
  .mobile-list { display: none !important; }
  .desktop-table { display: block; }
}
</style>
