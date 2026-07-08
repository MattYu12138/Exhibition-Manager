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

    <!-- 搜索框 -->
    <el-card class="filter-bar">
      <el-input
        v-model="searchKeyword"
        :placeholder="t('replenishment.searchPlaceholder')"
        clearable
      >
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
    </el-card>
    <!-- Material 独立筛选卡片 -->
    <el-card v-if="materialCategories.length > 0" class="filter-card">
      <div class="filter-card-title">{{ t('replenishment.filterMaterial') }}</div>
      <div class="category-tags">
        <el-tag
          :class="['cat-tag', selectedMaterial === '' ? 'cat-active' : '']"
          @click="selectedMaterial = ''"
          size="large"
        >{{ t('replenishment.catAll') }}</el-tag>
        <el-tag
          v-for="cat in materialCategories"
          :key="cat.id"
          :class="['cat-tag', selectedMaterial === cat.keyword ? 'cat-active' : '']"
          @click="toggleMaterial(cat.keyword)"
          size="large"
        >{{ cat.name }}</el-tag>
      </div>
    </el-card>
    <!-- Style 独立筛选卡片 -->
    <el-card v-if="styleCategories.length > 0" class="filter-card">
      <div class="filter-card-title">{{ t('replenishment.filterStyle') }}</div>
      <div class="category-tags">
        <el-tag
          :class="['cat-tag', selectedStyle === '' ? 'cat-active' : '']"
          @click="selectedStyle = ''"
          size="large"
        >{{ t('replenishment.catAll') }}</el-tag>
        <el-tag
          v-for="cat in styleCategories"
          :key="cat.id"
          :class="['cat-tag', selectedStyle === cat.keyword ? 'cat-active' : '']"
          @click="toggleStyle(cat.keyword)"
          size="large"
        >{{ cat.name }}</el-tag>
      </div>
    </el-card>

    <!-- 桌面端表格（分组折叠） -->
    <el-card v-loading="loading" class="desktop-table">
      <div v-for="group in filteredGroups" :key="group.product_title" class="product-group">
        <!-- 分组标题行 -->
        <div
          class="group-header"
          :class="groupHeaderClass(group)"
          @click="toggleGroup(group.product_title)"
        >
          <div class="group-header-left">
            <el-icon class="group-toggle-icon" :class="{ expanded: expandedGroups.has(group.product_title) }">
              <ArrowRight />
            </el-icon>
            <el-image
              v-if="group.image_url"
              :src="group.image_url"
              style="width: 36px; height: 36px; border-radius: 6px; flex-shrink: 0"
              fit="cover"
            />
            <span class="group-title">{{ group.product_title }}</span>
            <el-tag v-if="group.priorityCount > 0" type="danger" size="small">
              {{ group.priorityCount }} {{ t('replenishment.statusPriority') }}
            </el-tag>
            <el-tag v-else-if="group.needCount > 0" type="warning" size="small">
              {{ group.needCount }} {{ t('replenishment.statusNeed') }}
            </el-tag>
          </div>
          <div class="group-header-right">
            <span class="group-variant-count">{{ group.variants.length }} {{ t('replenishment.variants') }}</span>
          </div>
        </div>

        <!-- 展开的变体列表 -->
        <div v-if="expandedGroups.has(group.product_title)" class="group-variants">
          <el-table :data="group.variants" :show-header="group === filteredGroups[0] || false" style="width: 100%" :row-class-name="tableRowClass">
            <!-- 表头只在第一组显示 -->
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

            <el-table-column :label="t('replenishment.colVariant')" min-width="140">
              <template #default="{ row }">
                <span class="variant-title">{{ row.variant_title }}</span>
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

            <el-table-column :label="t('replenishment.colSold')" width="90" align="center">
              <template #default="{ row }">
                <span class="sold-num" :class="{ 'sold-low': row.rack_remaining !== undefined && row.rack_remaining <= Math.ceil(row.rack_quantity / 2) }">
                  {{ row.rack_remaining !== undefined ? row.rack_remaining : '-' }}
                </span>
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
        </div>
      </div>
      <el-empty v-if="!loading && filteredGroups.length === 0" :description="t('replenishment.noData')" />
    </el-card>

    <!-- 移动端分组卡片列表 -->
    <div v-loading="loading" class="mobile-list">
      <div v-for="group in filteredGroups" :key="group.product_title" class="mobile-group">
        <!-- 分组标题 -->
        <div
          class="mobile-group-header"
          :class="mobileGroupHeaderClass(group)"
          @click="toggleGroup(group.product_title)"
        >
          <div class="mobile-group-header-left">
            <el-icon class="group-toggle-icon" :class="{ expanded: expandedGroups.has(group.product_title) }">
              <ArrowRight />
            </el-icon>
            <el-image
              v-if="group.image_url"
              :src="group.image_url"
              class="mobile-group-img"
              fit="cover"
            />
            <div class="mobile-group-info">
              <div class="mobile-group-title">{{ group.product_title }}</div>
              <div class="mobile-group-meta">
                <el-tag v-if="group.priorityCount > 0" type="danger" size="small">
                  {{ group.priorityCount }} {{ t('replenishment.statusPriority') }}
                </el-tag>
                <el-tag v-else-if="group.needCount > 0" type="warning" size="small">
                  {{ group.needCount }} {{ t('replenishment.statusNeed') }}
                </el-tag>
                <span class="group-variant-count">{{ group.variants.length }} {{ t('replenishment.variants') }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 展开的变体卡片 -->
        <div v-if="expandedGroups.has(group.product_title)" class="mobile-variants">
          <div
            v-for="item in group.variants"
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
              <div class="mobile-product-info">
                <div class="product-variant-large">{{ item.variant_title }}</div>
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
                <span class="sold-num" :class="{ 'sold-low': item.rack_remaining !== undefined && item.rack_remaining <= Math.ceil(item.rack_quantity / 2) }">
                  {{ item.rack_remaining !== undefined ? item.rack_remaining : '-' }}
                </span>
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
        </div>
      </div>
      <el-empty v-if="!loading && filteredGroups.length === 0" :description="t('replenishment.noData')" />
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
const selectedMaterial = ref('')
const selectedStyle = ref('')
const searchKeyword = ref('')

// 按 type 分组分类
const materialCategories = computed(() => categories.value.filter(c => c.type === 'material'))
const styleCategories = computed(() => categories.value.filter(c => c.type === 'style'))
const expandedGroups = ref(new Set())

const needsCount = computed(() => allItems.value.filter(i => i.status === 'need' || i.status === 'priority').length)
const priorityCount = computed(() => allItems.value.filter(i => i.status === 'priority').length)
const selectedItems = computed(() => allItems.value.filter(i => i._selected))
const selectAll = ref(false)
const isIndeterminate = ref(false)

// 按商品名称分组
const groupedItems = computed(() => {
  const map = new Map()
  for (const item of allItems.value) {
    const key = item.product_title || ''
    if (!map.has(key)) {
      map.set(key, {
        product_title: key,
        image_url: item.image_url,
        variants: [],
        priorityCount: 0,
        needCount: 0,
      })
    }
    const group = map.get(key)
    group.variants.push(item)
    if (item.status === 'priority') group.priorityCount++
    else if (item.status === 'need') group.needCount++
  }
  return Array.from(map.values())
})

// 过滤后的分组列表（搜索 + Material + Style 两层筛选，AND 逻辑）
const filteredGroups = computed(() => {
  let groups = groupedItems.value
  if (selectedMaterial.value) {
    groups = groups.filter(g =>
      g.product_title.toLowerCase().includes(selectedMaterial.value.toLowerCase())
    )
  }
  if (selectedStyle.value) {
    groups = groups.filter(g =>
      g.product_title.toLowerCase().includes(selectedStyle.value.toLowerCase())
    )
  }
  if (searchKeyword.value.trim()) {
    const kw = searchKeyword.value.trim().toLowerCase()
    groups = groups
      .map(g => ({
        ...g,
        variants: g.variants.filter(v =>
          (v.product_title || '').toLowerCase().includes(kw) ||
          (v.variant_title || '').toLowerCase().includes(kw)
        ),
      }))
      .filter(g => g.variants.length > 0)
  }
  return groups
})

function toggleGroup(productTitle) {
  const set = new Set(expandedGroups.value)
  if (set.has(productTitle)) {
    set.delete(productTitle)
  } else {
    set.add(productTitle)
  }
  expandedGroups.value = set
}

function groupHeaderClass(group) {
  if (group.priorityCount > 0) return 'group-header-priority'
  if (group.needCount > 0) return 'group-header-need'
  return ''
}

function mobileGroupHeaderClass(group) {
  if (group.priorityCount > 0) return 'mobile-group-priority'
  if (group.needCount > 0) return 'mobile-group-need'
  return ''
}

function toggleMaterial(keyword) {
  selectedMaterial.value = selectedMaterial.value === keyword ? '' : keyword
}

function toggleStyle(keyword) {
  selectedStyle.value = selectedStyle.value === keyword ? '' : keyword
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
    // 默认展开有需要补货的分组
    const set = new Set()
    groupedItems.value.forEach(g => {
      if (g.priorityCount > 0 || g.needCount > 0) set.add(g.product_title)
    })
    expandedGroups.value = set
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
    current_square_qty: item.current_square_qty !== undefined ? item.current_square_qty : null,
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

/* 搜索框 */
.filter-bar { margin-bottom: 12px; }
.filter-bar :deep(.el-card__body) { padding: 14px 16px; }
/* 独立筛选卡片 */
.filter-card { margin-bottom: 12px; }
.filter-card :deep(.el-card__body) { padding: 12px 16px; }
.filter-card-title {
  font-size: 11px;
  font-weight: 700;
  color: #909399;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}
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

/* 分组样式 */
.product-group {
  margin-bottom: 4px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  overflow: hidden;
}
.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  cursor: pointer;
  background: #fafafa;
  transition: background 0.2s;
  user-select: none;
}
.group-header:hover { background: #f0f7ff; }
.group-header-priority { background: #fef0f0; }
.group-header-priority:hover { background: #fde8e8; }
.group-header-need { background: #fdf6ec; }
.group-header-need:hover { background: #faebd4; }
.group-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}
.group-header-right {
  flex-shrink: 0;
  margin-left: 12px;
}
.group-toggle-icon {
  flex-shrink: 0;
  transition: transform 0.2s;
  color: #909399;
}
.group-toggle-icon.expanded { transform: rotate(90deg); }
.group-title {
  font-weight: 600;
  font-size: 14px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.group-variant-count {
  font-size: 12px;
  color: #909399;
}
.group-variants {
  border-top: 1px solid #ebeef5;
}
.variant-title {
  font-size: 13px;
  color: #606266;
}

/* 商品单元格 */
.product-cell { display: flex; align-items: center; gap: 10px; }
.product-title { font-weight: 500; font-size: 14px; }
.product-variant { font-size: 12px; color: #909399; }

/* 数量标签 */
.qty-badge { display: inline-block; padding: 2px 10px; border-radius: 10px; font-weight: 600; font-size: 13px; }
.qty-badge.rack { background: #ecf5ff; color: #409eff; }
.qty-badge.storage { background: #f4f4f5; color: #606266; }
.sold-num { font-weight: 600; color: #409eff; }
.sold-num.sold-low { color: #f56c6c; }
.text-danger { color: #f56c6c; font-weight: 600; }
.text-muted { color: #c0c4cc; }

/* 表格行高亮 */
:deep(.row-priority) { background-color: #fef0f0 !important; }
:deep(.row-need) { background-color: #fdf6ec !important; }
:deep(.row-empty) { background-color: #f4f4f5 !important; opacity: 0.7; }

/* 日志 */
.log-card { margin-top: 16px; }

/* 移动端分组 */
.mobile-list { display: none; }
.mobile-group {
  margin-bottom: 10px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #ebeef5;
}
.mobile-group-header {
  display: flex;
  align-items: center;
  padding: 12px 14px;
  background: #fafafa;
  cursor: pointer;
  user-select: none;
}
.mobile-group-priority { background: #fef0f0; border-color: #f56c6c; }
.mobile-group-need { background: #fdf6ec; border-color: #e6a23c; }
.mobile-group-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}
.mobile-group-img {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  flex-shrink: 0;
}
.mobile-group-info {
  flex: 1;
  min-width: 0;
}
.mobile-group-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
  word-break: break-word;
  white-space: normal;
}
.mobile-group-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  flex-wrap: wrap;
}
.mobile-variants {
  border-top: 1px solid #ebeef5;
  padding: 8px;
  background: #fff;
}

/* 移动端变体卡片 */
.mobile-card {
  background: #fff;
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 8px;
  border: 1px solid #ebeef5;
  transition: all 0.2s;
}
.mobile-card:last-child { margin-bottom: 0; }
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
  align-items: center;
  gap: 8px;
}
.mobile-checkbox {
  flex-shrink: 0;
}
.mobile-product-info {
  flex: 1;
  min-width: 0;
}
.product-variant-large {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.4;
}
.mobile-status-tag {
  flex-shrink: 0;
  align-self: flex-start;
}
.mobile-card-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 10px;
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
  .desktop-table { display: none !important; }
  .mobile-list { display: block; }
  .log-card :deep(.el-card__body) { padding: 12px; }
}
@media (min-width: 769px) {
  .mobile-list { display: none !important; }
  .desktop-table { display: block; }
}
</style>
