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
          <el-tag type="info" size="large">{{ t('replenishment.totalItems', { n: allItems.length }) }}</el-tag>
          <el-tag v-if="priorityCount > 0" type="danger" size="large">
            {{ priorityCount }} {{ t('replenishment.statusPriority') }}
          </el-tag>
          <el-tag v-if="needsCount > 0" type="warning" size="large">
            {{ t('replenishment.needsReplenishment', { n: needsCount }) }}
          </el-tag>
          <el-tag v-if="needsCount === 0 && priorityCount === 0" type="success" size="large">
            {{ t('replenishment.allSufficient') }}
          </el-tag>
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

    <!-- 搜索 + 分类筛选 -->
    <el-card class="filter-bar">
      <el-input
        v-model="searchKeyword"
        :placeholder="t('replenishment.searchPlaceholder')"
        clearable
        class="search-input"
      >
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
      <div class="category-tags">
        <el-tag
          :class="['cat-tag', selectedCategory === '' ? 'cat-active' : '']"
          @click="selectedCategory = ''"
          size="large"
        >{{ t('replenishment.catAll') }}</el-tag>
        <el-tag
          v-for="cat in categories"
          :key="cat.id"
          :class="['cat-tag', selectedCategory === cat.keyword ? 'cat-active' : '']"
          @click="toggleCategory(cat.keyword)"
          size="large"
        >{{ cat.name }}</el-tag>
      </div>
    </el-card>

    <!-- 桌面端表格 -->
    <el-card v-loading="loading" class="desktop-table">
      <el-table :data="filteredItems" stripe style="width: 100%" :row-class-name="tableRowClass">
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
              v-if="row.status === 'need' || row.status === 'priority'"
              v-model="row._selected"
              @change="updateSelection"
            />
          </template>
        </el-table-column>

        <el-table-column :label="t('replenishment.colProduct')" min-width="200">
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

        <el-table-column :label="t('replenishment.colRack')" width="80" align="center">
          <template #default="{ row }">
            <span class="qty-badge rack">{{ row.rack_quantity }}</span>
          </template>
        </el-table-column>

        <el-table-column :label="t('replenishment.colStorage')" width="80" align="center">
          <template #default="{ row }">
            <span class="qty-badge storage">{{ row.storage }}</span>
          </template>
        </el-table-column>

        <el-table-column :label="t('replenishment.colSold')" width="80" align="center">
          <template #default="{ row }">
            <span class="sold-num" :class="{ 'sold-high': row.sold >= row.rack_quantity }">{{ row.sold }}</span>
          </template>
        </el-table-column>

        <el-table-column :label="t('replenishment.colStockRemaining')" width="100" align="center">
          <template #default="{ row }">
            <span :class="row.storage_left <= 0 ? 'text-danger' : ''">{{ row.storage_left }}</span>
          </template>
        </el-table-column>

        <el-table-column :label="t('replenishment.colStatus')" width="120" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.status === 'priority'" type="danger" size="small">{{ t('replenishment.statusPriority') }}</el-tag>
            <el-tag v-else-if="row.status === 'need'" type="warning" size="small">{{ t('replenishment.statusNeed') }}</el-tag>
            <el-tag v-else-if="row.status === 'storage_empty'" type="info" size="small">{{ t('replenishment.statusEmpty') }}</el-tag>
            <el-tag v-else type="success" size="small">{{ t('replenishment.statusOk') }}</el-tag>
          </template>
        </el-table-column>

        <el-table-column :label="t('replenishment.colReplenishQty')" width="120" align="center">
          <template #default="{ row }">
            <el-input-number
              v-if="(row.status === 'need' || row.status === 'priority') && row._selected"
              v-model="row._replenishQty"
              :min="1"
              :max="Math.max(1, row.storage_left)"
              size="small"
              controls-position="right"
            />
            <span v-else-if="row.status === 'need' || row.status === 'priority'" class="text-muted">-</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 移动端卡片列表 -->
    <div v-loading="loading" class="mobile-list">
      <div
        v-for="item in filteredItems"
        :key="item.shopify_variant_id"
        class="mobile-card"
        :class="mobileCardClass(item)"
      >
        <div class="mobile-card-header">
          <el-checkbox
            v-if="item.status === 'need' || item.status === 'priority'"
            v-model="item._selected"
            @change="updateSelection"
            class="mobile-checkbox"
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
            :type="statusTagType(item.status)"
            size="small"
            class="mobile-status-tag"
          >
            {{ statusText(item.status) }}
          </el-tag>
        </div>
        <div class="mobile-card-body">
          <div class="mobile-stat">
            <span class="stat-label">{{ t('replenishment.colRack') }}</span>
            <span class="qty-badge rack">{{ item.rack_quantity }}</span>
          </div>
          <div class="mobile-stat">
            <span class="stat-label">{{ t('replenishment.colStorage') }}</span>
            <span class="qty-badge storage">{{ item.storage }}</span>
          </div>
          <div class="mobile-stat">
            <span class="stat-label">{{ t('replenishment.colSold') }}</span>
            <span class="sold-num" :class="{ 'sold-high': item.sold >= item.rack_quantity }">{{ item.sold }}</span>
          </div>
          <div class="mobile-stat">
            <span class="stat-label">{{ t('replenishment.colStockRemaining') }}</span>
            <span :class="item.storage_left <= 0 ? 'text-danger' : ''">{{ item.storage_left }}</span>
          </div>
        </div>
        <div v-if="(item.status === 'need' || item.status === 'priority') && item._selected" class="mobile-card-footer">
          <span class="stat-label">{{ t('replenishment.colReplenishQty') }}</span>
          <el-input-number
            v-model="item._replenishQty"
            :min="1"
            :max="Math.max(1, item.storage_left)"
            size="small"
            controls-position="right"
          />
        </div>
      </div>
      <el-empty v-if="!loading && filteredItems.length === 0" :description="t('replenishment.noData')" />
    </div>

    <!-- 补货历史 -->
    <el-card v-if="logs.length > 0" class="log-card">
      <template #header>
        <span style="font-weight: 600">{{ t('replenishment.logTitle') }}</span>
      </template>
      <!-- 桌面端日志表格 -->
      <el-table :data="logs" stripe size="small" class="desktop-table">
        <el-table-column :label="t('replenishment.logTime')" width="170">
          <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column :label="t('replenishment.colProduct')" min-width="200">
          <template #default="{ row }">
            {{ row.product_title }} - {{ row.variant_title }}
          </template>
        </el-table-column>
        <el-table-column :label="t('replenishment.logQty')" prop="replenish_qty" width="90" align="center" />
        <el-table-column :label="t('replenishment.logReplenishedTotal')" width="120" align="center">
          <template #default="{ row }">
            {{ row.replenished_total_before }} → {{ row.replenished_total_after }}
          </template>
        </el-table-column>
        <el-table-column label="Storage Left" width="100" align="center">
          <template #default="{ row }">
            <span :class="row.storage_left <= 0 ? 'text-danger' : ''">{{ row.storage_left }}</span>
          </template>
        </el-table-column>
      </el-table>
      <!-- 移动端日志列表 -->
      <div class="mobile-list">
        <div v-for="log in logs" :key="log.id" class="mobile-log-item">
          <div class="log-product">{{ log.product_title }} - {{ log.variant_title }}</div>
          <div class="log-meta">
            <span>{{ formatTime(log.created_at) }}</span>
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
import { squareApi, categoriesApi } from '@/api'

const { t } = useI18n()
const route = useRoute()
const exhibitionId = route.params.id

const loading = ref(false)
const allItems = ref([])
const logs = ref([])
const categories = ref([])
const selectedCategory = ref('')
const searchKeyword = ref('')

const needsCount = computed(() => allItems.value.filter(i => i.status === 'need' || i.status === 'priority').length)
const priorityCount = computed(() => allItems.value.filter(i => i.status === 'priority').length)
const selectedItems = computed(() => allItems.value.filter(i => i._selected))
const selectAll = ref(false)
const isIndeterminate = ref(false)

// 过滤后的商品列表（搜索 + 分类）
const filteredItems = computed(() => {
  let list = allItems.value
  if (selectedCategory.value) {
    list = list.filter(i =>
      (i.product_title || '').toLowerCase().includes(selectedCategory.value.toLowerCase())
    )
  }
  if (searchKeyword.value.trim()) {
    const kw = searchKeyword.value.trim().toLowerCase()
    list = list.filter(i =>
      (i.product_title || '').toLowerCase().includes(kw) ||
      (i.variant_title || '').toLowerCase().includes(kw)
    )
  }
  return list
})

function toggleCategory(keyword) {
  selectedCategory.value = selectedCategory.value === keyword ? '' : keyword
}

function statusText(status) {
  switch (status) {
    case 'priority': return t('replenishment.statusPriority')
    case 'need': return t('replenishment.statusNeed')
    case 'storage_empty': return t('replenishment.statusEmpty')
    default: return t('replenishment.statusOk')
  }
}

function statusTagType(status) {
  switch (status) {
    case 'priority': return 'danger'
    case 'need': return 'warning'
    case 'storage_empty': return 'info'
    default: return 'success'
  }
}

function tableRowClass({ row }) {
  if (row.status === 'priority') return 'row-priority'
  if (row.status === 'need') return 'row-need'
  if (row.status === 'storage_empty') return 'row-empty'
  return ''
}

function mobileCardClass(item) {
  return {
    'card-priority': item.status === 'priority',
    'card-need': item.status === 'need',
    'card-empty': item.status === 'storage_empty',
  }
}

function handleSelectAll(val) {
  allItems.value.forEach(item => {
    if (item.status === 'need' || item.status === 'priority') {
      item._selected = val
    }
  })
  isIndeterminate.value = false
}

function updateSelection() {
  const replenishableItems = allItems.value.filter(i => i.status === 'need' || i.status === 'priority')
  const checkedCount = replenishableItems.filter(i => i._selected).length
  selectAll.value = checkedCount === replenishableItems.length && replenishableItems.length > 0
  isIndeterminate.value = checkedCount > 0 && checkedCount < replenishableItems.length
}

async function fetchData() {
  loading.value = true
  try {
    const [checkRes, logRes, catRes] = await Promise.all([
      squareApi.replenishmentCheck(exhibitionId),
      squareApi.replenishmentLog(exhibitionId).catch(() => ({ data: [] })),
      categoriesApi.getAll().catch(() => ({ data: [] })),
    ])
    const data = checkRes.data || []
    allItems.value = data.map(item => ({
      ...item,
      _selected: item.status === 'priority',
      _replenishQty: item.suggested_qty || 3,
    }))
    logs.value = logRes.data || []
    categories.value = catRes.data || []
    updateSelection()
  } catch (err) {
    ElMessage.error(t('replenishment.fetchFailed') + ': ' + (err.message || ''))
  } finally {
    loading.value = false
  }
}

async function confirmReplenishment() {
  const toReplenish = selectedItems.value.map(item => ({
    shopify_variant_id: item.shopify_variant_id,
    replenish_qty: item._replenishQty || 3,
    current_square_qty: null,
  }))

  try {
    await ElMessageBox.confirm(
      t('replenishment.confirmMsg', { n: toReplenish.length }),
      t('replenishment.confirmTitle'),
      {
        confirmButtonText: t('replenishment.confirmOk'),
        cancelButtonText: t('replenishment.confirmCancel'),
        type: 'warning',
      }
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
    ElMessage.error(t('replenishment.failed') + ': ' + (err.message || ''))
  }
}

function formatTime(ts) {
  if (!ts) return '-'
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

onMounted(fetchData)
</script>

<style scoped>
.replenishment-page { padding: 0; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.page-title { font-size: 20px; font-weight: 700; margin: 0; }
.action-bar { margin-bottom: 12px; }
.bar-content { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
.bar-info { display: flex; gap: 8px; flex-wrap: wrap; }
.bar-actions { display: flex; gap: 8px; flex-wrap: wrap; }

/* 搜索 + 分类筛选 */
.filter-bar { margin-bottom: 16px; }
.filter-bar :deep(.el-card__body) { padding: 14px 16px; }
.search-input { margin-bottom: 12px; }
.category-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.cat-tag {
  cursor: pointer;
  user-select: none;
  transition: all 0.2s;
  background: #f4f4f5;
  color: #606266;
  border-color: #dcdfe6;
}
.cat-tag:hover {
  background: #ecf5ff;
  color: #409eff;
  border-color: #b3d8ff;
}
.cat-tag.cat-active {
  background: #409eff;
  color: #fff;
  border-color: #409eff;
}

/* 商品单元格 */
.product-cell { display: flex; align-items: center; gap: 10px; }
.product-title { font-weight: 500; font-size: 14px; }
.product-variant { font-size: 12px; color: #909399; }

/* 数量标签 */
.qty-badge { display: inline-block; padding: 2px 10px; border-radius: 10px; font-weight: 600; font-size: 13px; }
.qty-badge.rack { background: #ecf5ff; color: #409eff; }
.qty-badge.storage { background: #f4f4f5; color: #606266; }
.sold-num { font-weight: 600; color: #e6a23c; }
.sold-num.sold-high { color: #f56c6c; }
.text-danger { color: #f56c6c; font-weight: 600; }
.text-muted { color: #c0c4cc; }

/* 表格行高亮 */
:deep(.row-priority) { background-color: #fef0f0 !important; }
:deep(.row-need) { background-color: #fdf6ec !important; }
:deep(.row-empty) { background-color: #f4f4f5 !important; opacity: 0.7; }

/* 日志 */
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
.mobile-card.card-priority {
  border-color: #f56c6c;
  background: #fef0f0;
}
.mobile-card.card-need {
  border-color: #e6a23c;
  background: #fdf6ec;
}
.mobile-card.card-empty {
  border-color: #dcdfe6;
  background: #f4f4f5;
  opacity: 0.7;
}
.mobile-card-header {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.mobile-checkbox {
  flex-shrink: 0;
  margin-top: 2px;
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
  font-weight: 500;
  line-height: 1.4;
  word-break: break-word;
  white-space: normal;
}
.mobile-product-info .product-variant {
  font-size: 11px;
  color: #909399;
  margin-top: 2px;
}
.mobile-status-tag {
  flex-shrink: 0;
  align-self: flex-start;
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
