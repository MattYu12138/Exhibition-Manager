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
          <el-tag v-if="selectedNoStockItems.length > 0" type="danger" effect="plain" size="large">
            {{ t('replenishment.pendingNoStockCount', { n: selectedNoStockItems.length }) }}
          </el-tag>
          <!-- 补满模式开关 -->
          <div class="mode-toggle">
            <span class="mode-label" :class="{ active: !fillUpMode }">{{ t('replenishment.modeNormal') || '正常' }}</span>
            <el-switch v-model="fillUpMode" :active-text="''" :inactive-text="''" style="margin: 0 6px" />
            <span class="mode-label" :class="{ active: fillUpMode }">{{ t('replenishment.modeFillUp') || '补满' }}</span>
          </div>
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

    <!-- 人工备货状态分类 -->
    <el-card class="filter-card stock-status-filter">
      <div class="filter-card-title">{{ t('replenishment.stockStatusFilter') }}</div>
      <div class="stock-status-tabs">
        <button
          type="button"
          :class="['stock-status-tab', { active: selectedStockView === 'available' }]"
          @click="selectedStockView = 'available'"
        >
          {{ t('replenishment.stockAvailable') }}
          <span class="stock-status-count">{{ availableStockCount }}</span>
        </button>
        <button
          type="button"
          :class="['stock-status-tab', 'empty', { active: selectedStockView === 'unavailable' }]"
          @click="selectedStockView = 'unavailable'"
        >
          {{ t('replenishment.stockUnavailable') }}
          <span class="stock-status-count">{{ unavailableStockCount }}</span>
        </button>
      </div>
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

            <el-table-column :label="t('replenishment.colSold')" width="110" align="center">
              <template #default="{ row }">
                <span class="sold-num" :class="{ 'sold-low': row.rack_remaining !== undefined && row.rack_remaining <= Math.ceil(row.rack_quantity / 2) }">
                  {{ row.rack_remaining !== undefined ? row.rack_remaining : '-' }}
                </span>
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

            <el-table-column :label="t('replenishment.stockAction')" width="230" align="center">
              <template #default="{ row }">
                <el-button
                  v-if="!row.stock_available"
                  type="success"
                  plain
                  size="small"
                  @click="restoreStockAvailability(row)"
                >{{ t('replenishment.restoreStock') }}</el-button>
                <el-radio-group
                  v-else-if="row._selected"
                  v-model="row._action"
                  size="small"
                  class="action-choice"
                >
                  <el-radio-button value="replenish">{{ t('replenishment.actionReplenish') }}</el-radio-button>
                  <el-radio-button value="no_stock">{{ t('replenishment.markNoStock') }}</el-radio-button>
                </el-radio-group>
                <span v-else class="text-muted">{{ t('replenishment.selectFirst') }}</span>
              </template>
            </el-table-column>

            <el-table-column :label="t('replenishment.colReplenishQty')" width="120" align="center">
              <template #default="{ row }">
                <el-input-number
                  v-if="row._selected && row._action === 'replenish'"
                  v-model="row._replenishQty"
                  :min="1"
                  :max="999"
                  size="small"
                  controls-position="right"
                />
                <el-tag v-else-if="row._selected && row._action === 'no_stock'" type="danger" effect="plain" size="small">
                  {{ t('replenishment.pendingNoStock') }}
                </el-tag>
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
            <div class="mobile-card-body rack-only-stats">
              <div class="mobile-stat">
                <span class="stat-label">{{ t('replenishment.colRack') }}</span>
                <span class="qty-badge rack">{{ item.rack_quantity }}</span>
              </div>
              <div class="mobile-stat">
                <span class="stat-label">{{ t('replenishment.colSold') }}</span>
                <span class="sold-num" :class="{ 'sold-low': item.rack_remaining !== undefined && item.rack_remaining <= Math.ceil(item.rack_quantity / 2) }">
                  {{ item.rack_remaining !== undefined ? item.rack_remaining : '-' }}
                </span>
              </div>
            </div>
            <div class="mobile-stock-action">
              <template v-if="!item.stock_available">
                <span class="stock-state-text unavailable">{{ t('replenishment.stockUnavailable') }}</span>
                <el-button
                  type="success"
                  plain
                  size="small"
                  @click="restoreStockAvailability(item)"
                >{{ t('replenishment.restoreStock') }}</el-button>
              </template>
              <template v-else-if="item._selected">
                <span class="stock-state-text">{{ t('replenishment.chooseAction') }}</span>
                <el-radio-group v-model="item._action" size="small" class="action-choice mobile-action-choice">
                  <el-radio-button value="replenish">{{ t('replenishment.actionReplenish') }}</el-radio-button>
                  <el-radio-button value="no_stock">{{ t('replenishment.markNoStock') }}</el-radio-button>
                </el-radio-group>
              </template>
              <template v-else>
                <span class="stock-state-text">{{ t('replenishment.stockAvailable') }}</span>
                <span class="select-action-hint">{{ t('replenishment.selectFirst') }}</span>
              </template>
            </div>
            <Transition name="operation-panel" mode="out-in">
              <div v-if="item._selected && item._action === 'replenish'" key="replenish" class="mobile-card-footer">
                <span class="replenish-qty-label">{{ t('replenishment.colReplenishQty') }}</span>
                <el-input-number
                  v-model="item._replenishQty"
                  :min="1"
                  :max="999"
                  size="default"
                />
              </div>
              <div v-else-if="item._selected && item._action === 'no_stock'" key="no-stock" class="mobile-no-stock-pending">
                {{ t('replenishment.pendingNoStockHint') }}
              </div>
            </Transition>
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
        <el-table-column :label="t('replenishment.logQty')" prop="replenish_qty" width="110" align="center" />
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

    <!-- 移动端固定浮窗按钮 -->
    <div class="fab-container">
      <div class="fab fab-left" @click="fetchData" :class="{ 'fab-loading': loading }">
        <el-icon :size="24"><Refresh /></el-icon>
      </div>
      <div
        class="fab fab-right"
        :class="{ 'fab-disabled': selectedItems.length === 0 }"
        @click="selectedItems.length > 0 && confirmReplenishment()"
      >
        <el-icon :size="24"><Check /></el-icon>
        <span v-if="selectedItems.length > 0" class="fab-badge">{{ selectedItems.length }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
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
const selectedStockView = ref(localStorage.getItem('replenish_stockView') || 'available')

// 补满模式开关（刷新后保留状态）
const fillUpMode = ref(localStorage.getItem('replenish_fillUpMode') === 'true')

// 按 type 分组分类
const materialCategories = computed(() => categories.value.filter(c => c.type === 'material'))
const styleCategories = computed(() => categories.value.filter(c => c.type === 'style'))
const expandedGroups = ref(new Set())
const availableStockCount = computed(() => allItems.value.filter(i => i.stock_available).length)
const unavailableStockCount = computed(() => allItems.value.filter(i => !i.stock_available).length)

function getNormalStatus(item) {
  if (!item.stock_available) return 'storage_empty'
  if (item.rack_quantity > 0 && item.rack_remaining <= 0) return 'priority'
  if (item.rack_quantity > 0 && item.rack_remaining < Math.ceil(item.rack_quantity / 2)) return 'need'
  return 'ok'
}

// 正常模式按半数阈值；补满模式只要衣架未满就提醒；无备货始终不提醒
function getEffectiveStatus(item) {
  if (!item.stock_available) return 'storage_empty'
  if (!fillUpMode.value) return getNormalStatus(item)
  return item.rack_quantity > 0 && item.rack_remaining < item.rack_quantity ? 'need' : 'ok'
}

function applyDisplayMode() {
  for (const item of allItems.value) {
    item.status = getEffectiveStatus(item)
    item._replenishQty = Math.max(1, item.rack_quantity - item.rack_remaining)
    if (item.status !== 'need' && item.status !== 'priority') item._selected = false
  }
  updateSelection()
}

watch(fillUpMode, (val) => {
  localStorage.setItem('replenish_fillUpMode', val ? 'true' : 'false')
  applyDisplayMode()
})
watch(selectedStockView, (val) => {
  localStorage.setItem('replenish_stockView', val)
  selectAll.value = false
  isIndeterminate.value = false
})

const needsCount = computed(() => allItems.value.filter(i => i.status === 'need' || i.status === 'priority').length)
const priorityCount = computed(() => allItems.value.filter(i => i.status === 'priority').length)
const selectedItems = computed(() => allItems.value.filter(i => i._selected))
const selectedReplenishmentItems = computed(() => selectedItems.value.filter(i => i._action === 'replenish'))
const selectedNoStockItems = computed(() => selectedItems.value.filter(i => i._action === 'no_stock'))
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

// 过滤后的分组列表（备货状态 + 搜索 + Material + Style，AND 逻辑）
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

  const kw = searchKeyword.value.trim().toLowerCase()
  const showAvailable = selectedStockView.value === 'available'
  groups = groups
    .map(g => {
      const variants = g.variants.filter(v => {
        if (Boolean(v.stock_available) !== showAvailable) return false
        if (!kw) return true
        return (v.product_title || '').toLowerCase().includes(kw) ||
          (v.variant_title || '').toLowerCase().includes(kw)
      })
      return {
        ...g,
        variants,
        priorityCount: variants.filter(v => v.status === 'priority').length,
        needCount: variants.filter(v => v.status === 'need').length,
      }
    })
    .filter(g => g.variants.length > 0)

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
    'card-selected': item._selected,
  }
}

// ─── 人工备货状态 ───
// 标记无备货随补货统一提交；恢复有货在“没有备货”分类中即时处理。
async function restoreStockAvailability(item) {
  try {
    await squareApi.updateReplenishmentStockStatus(
      exhibitionId,
      item.shopify_variant_id,
      true
    )
    item.stock_available = true
    item._selected = false
    item._action = 'replenish'
    item.status = getEffectiveStatus(item)
    item._replenishQty = Math.max(1, item.rack_quantity - item.rack_remaining)
    updateSelection()
    ElMessage.success(t('replenishment.restoreStockSuccess'))
  } catch (err) {
    ElMessage.error(t('replenishment.stockStatusUpdateFailed') + ': ' + (err.message || ''))
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
      stock_available: item.stock_available !== false,
      _selected: false,
      _action: 'replenish',
      _replenishQty: Math.max(1, item.rack_quantity - item.rack_remaining),
    }))
    applyDisplayMode()
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
  const toReplenish = selectedReplenishmentItems.value.map(item => ({
    shopify_variant_id: item.shopify_variant_id,
    replenish_qty: item._replenishQty || 1,
  }))
  const noStockVariantIds = selectedNoStockItems.value.map(item => item.shopify_variant_id)

  let confirmMessage = t('replenishment.confirmMsg', { n: toReplenish.length })
  if (noStockVariantIds.length > 0 && toReplenish.length > 0) {
    confirmMessage = t('replenishment.confirmMixedMsg', {
      replenish: toReplenish.length,
      noStock: noStockVariantIds.length,
    })
  } else if (noStockVariantIds.length > 0) {
    confirmMessage = t('replenishment.confirmNoStockMsg', { n: noStockVariantIds.length })
  }

  try {
    await ElMessageBox.confirm(
      confirmMessage,
      noStockVariantIds.length > 0
        ? t('replenishment.noStockWarningTitle')
        : t('replenishment.confirmTitle'),
      {
        confirmButtonText: t('replenishment.confirmOk'),
        cancelButtonText: t('replenishment.confirmCancel'),
        type: noStockVariantIds.length > 0 ? 'warning' : 'info',
      }
    )
  } catch {
    return
  }

  try {
    const res = await squareApi.replenishmentConfirm(
      exhibitionId,
      toReplenish,
      noStockVariantIds
    )
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

/* 补满模式开关 */
.mode-toggle { display: flex; align-items: center; margin-left: 12px; padding: 4px 10px; background: #f5f5f5; border-radius: 20px; }
.mode-label { font-size: 12px; color: #999; transition: all 0.3s; cursor: default; }
.mode-label.active { color: #409eff; font-weight: 600; }

/* 人工备货状态分类 */
.stock-status-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  max-width: 440px;
}
.stock-status-tab {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  padding: 8px 16px;
  border: 1px solid #dcdfe6;
  border-radius: 10px;
  background: #fff;
  color: #606266;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}
.stock-status-tab:hover { border-color: #79bbff; color: #409eff; }
.stock-status-tab.active {
  border-color: #409eff;
  background: #ecf5ff;
  color: #337ecc;
  box-shadow: 0 3px 10px rgba(64, 158, 255, 0.12);
}
.stock-status-tab.empty.active {
  border-color: #909399;
  background: #f4f4f5;
  color: #606266;
  box-shadow: 0 3px 10px rgba(96, 98, 102, 0.1);
}
.stock-status-count {
  min-width: 24px;
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(64, 158, 255, 0.12);
  font-size: 12px;
  line-height: 20px;
}
.stock-status-tab.empty .stock-status-count { background: rgba(96, 98, 102, 0.12); }

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
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 8px;
  border: 1px solid #ebeef5;
  transition: border-color 0.28s ease, background-color 0.28s ease, box-shadow 0.28s ease, transform 0.2s ease;
  will-change: transform;
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
  opacity: 0.78;
}
.mobile-card.card-selected {
  border-color: #409eff;
  box-shadow: 0 8px 22px rgba(64, 158, 255, 0.14);
  transform: translateY(-1px);
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
.mobile-stock-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 7px;
  padding-top: 8px;
  border-top: 1px solid rgba(144, 147, 153, 0.12);
}
.stock-state-text {
  font-size: 11px;
  font-weight: 600;
  color: #67c23a;
}
.stock-state-text.unavailable { color: #909399; }
.select-action-hint { font-size: 11px; color: #a8abb2; }
.action-choice { white-space: nowrap; transition: opacity 0.2s ease, transform 0.2s ease; }
.action-choice :deep(.el-radio-button__inner) { padding: 5px 8px; font-size: 11px; line-height: 18px; transition: all 0.2s ease; }
.action-choice :deep(.el-radio-button:last-child .el-radio-button__inner) { color: #c45656; }
.action-choice :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  color: #fff;
}
.mobile-stock-action .el-button {
  min-height: 30px;
  padding: 5px 10px;
  border-radius: 8px;
  font-size: 11px;
}
.mobile-no-stock-pending {
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px solid #fab6b6;
  border-radius: 10px;
  background: #fef0f0;
  color: #c45656;
  font-size: 12px;
  line-height: 1.45;
}

.mobile-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
  padding: 12px;
  border: 1px solid rgba(64, 158, 255, 0.18);
  border-radius: 12px;
  background: rgba(236, 245, 255, 0.62);
}
.replenish-qty-label {
  color: #337ecc;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}
.mobile-card-footer .el-input-number {
  width: 204px;
}
.mobile-card-footer .el-input-number .el-input__wrapper {
  min-height: 54px;
  border-radius: 12px;
}
.mobile-card-footer .el-input-number .el-input__inner {
  font-size: 26px;
  font-weight: 750;
  height: 54px;
  line-height: 54px;
  color: #1f6fb5;
}
.mobile-card-footer .el-input-number .el-input-number__decrease,
.mobile-card-footer .el-input-number .el-input-number__increase {
  width: 52px;
  font-size: 21px;
  transition: background-color 0.18s ease, color 0.18s ease, transform 0.12s ease;
}
.mobile-card-footer .el-input-number .el-input-number__decrease:active,
.mobile-card-footer .el-input-number .el-input-number__increase:active {
  transform: scale(0.94);
}
.operation-panel-enter-active,
.operation-panel-leave-active {
  transition: opacity 0.2s ease, transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
}
.operation-panel-enter-from,
.operation-panel-leave-to {
  opacity: 0;
  transform: translateY(-5px);
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
  .bar-content { flex-direction: column; align-items: flex-start; gap: 10px; }
  .bar-info { width: 100%; justify-content: space-between; align-items: center; }
  .bar-info .el-tag { font-size: 12px; }
  .mode-toggle { margin-left: 0; margin-top: 4px; width: 100%; justify-content: center; padding: 8px 16px; background: #f8f8f8; border-radius: 24px; }
  .mode-label { font-size: 14px; }
  .bar-actions { width: 100%; display: flex; }
  .bar-actions .el-button { flex: 1; height: 40px; font-size: 14px; }
  .desktop-table { display: none !important; }
  .mobile-list { display: block; }
  .log-card :deep(.el-card__body) { padding: 12px; }
  .filter-card { margin-bottom: 8px; }
  .filter-card :deep(.el-card__body) { padding: 10px 12px; }
  .filter-card-title { font-size: 11px; margin-bottom: 6px; }
  .stock-status-tabs { max-width: none; gap: 7px; }
  .stock-status-tab { min-height: 44px; padding: 8px 10px; font-size: 13px; border-radius: 12px; }
  .category-tags { gap: 6px; }
  .cat-tag { font-size: 12px; padding: 4px 10px; }
  .mobile-card-body { grid-template-columns: 1fr 1fr; gap: 10px; }
  .rack-only-stats { padding: 12px 4px; }
  .mobile-stat { flex-direction: column; align-items: center; gap: 4px; }
  .stat-label { font-size: 11px; }
  .mobile-stat .qty-badge, .mobile-stat .sold-num { font-size: 18px; }
  .mobile-stock-action { margin-top: 5px; padding-top: 7px; flex-wrap: nowrap; }
  .mobile-stock-action .el-button { min-width: 88px; min-height: 30px; }
  .mobile-action-choice { width: auto; display: flex; margin-left: auto; }
  .mobile-action-choice :deep(.el-radio-button) { flex: none; }
  .mobile-action-choice :deep(.el-radio-button__inner) { width: auto; min-height: 30px; display: flex; align-items: center; justify-content: center; padding: 5px 9px; }
  .mobile-card-footer .el-input-number { width: min(204px, 62vw); }
  .mobile-card:active { transform: scale(0.995); }
}
@media (min-width: 769px) {
  .mobile-list { display: none !important; }
  .desktop-table { display: block; }
  .fab-container { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .mobile-card,
  .action-choice,
  .operation-panel-enter-active,
  .operation-panel-leave-active,
  .mobile-card-footer .el-input-number .el-input-number__decrease,
  .mobile-card-footer .el-input-number .el-input-number__increase {
    transition: none !important;
  }
}

/* 固定浮窗按钮 */
.fab-container {
  position: fixed;
  bottom: 80px;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-between;
  padding: 0 20px;
  pointer-events: none;
  z-index: 999;
}
.fab {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  pointer-events: auto;
  cursor: pointer;
  position: relative;
  transition: transform 0.2s, opacity 0.2s;
}
.fab:active {
  transform: scale(0.9);
}
.fab-left {
  background: #409eff;
  color: #fff;
}
.fab-left.fab-loading {
  animation: fab-spin 1s linear infinite;
}
@keyframes fab-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.fab-right {
  background: #67c23a;
  color: #fff;
}
.fab-right.fab-disabled {
  background: #c0c4cc;
  opacity: 0.6;
  cursor: not-allowed;
}
.fab-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #f56c6c;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  min-width: 20px;
  height: 20px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}
</style>
