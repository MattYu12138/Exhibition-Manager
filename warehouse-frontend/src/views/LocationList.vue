<template>
  <div class="location-list">
    <div class="page-header">
      <div>
        <h1 class="page-title">📍 {{ $t('locations.title') }}</h1>
        <p class="page-subtitle">{{ $t('locations.subtitle') }}</p>
      </div>
    </div>

    <!-- 筛选栏 -->
    <el-card class="filter-card">
      <div class="filter-row">
        <el-input v-model="search" :placeholder="$t('locations.search')" clearable style="width:220px" @input="loadLocations">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-select v-model="filterType" :placeholder="$t('locations.stockType')" clearable style="width:140px" @change="loadLocations">
          <el-option :label="$t('common.all')" value="" />
          <el-option :label="$t('common.retail')" value="retail" />
          <el-option :label="$t('common.exhibition')" value="exhibition" />
        </el-select>
        <el-select v-model="filterEmpty" :placeholder="$t('locations.stockStatus')" clearable style="width:140px" @change="loadLocations">
          <el-option :label="$t('common.all')" value="" />
          <el-option :label="$t('locations.stocked')" value="stocked" />
          <el-option :label="$t('locations.emptyLocations')" value="empty" />
          <el-option :label="$t('locations.lowStock')" value="low_stock" />
        </el-select>
        <el-tag type="info" style="margin-left:auto">{{ $t('common.locations', { count: total }) }}</el-tag>
        <el-tag v-if="alertCount > 0" type="danger" style="cursor:pointer" @click="filterEmpty='low_stock';loadLocations()">
          ⚠️ {{ $t('locations.needsAttention', { count: alertCount }) }}
        </el-tag>
      </div>
    </el-card>

    <!-- 货位网格 -->
    <div v-loading="loading" class="locations-grid">
      <div
        v-for="loc in locations"
        :key="loc.id"
        class="location-card"
        :class="{
          'has-stock': loc.total_qty > 0 && loc.stock_alert === 'ok',
          'is-empty': loc.total_qty === 0,
          'is-low': loc.stock_alert === 'low',
          'is-alert-empty': loc.stock_alert === 'empty' && loc.total_qty === 0
        }"
        @click="$router.push(`/locations/${loc.id}`)"
      >
        <div class="loc-header">
          <span class="loc-code">{{ loc.code }}</span>
          <el-tag size="small"
            :type="loc.total_qty === 0 ? 'info' : loc.stock_alert === 'low' ? 'warning' : 'success'">
            {{ loc.total_qty > 0 ? $t('common.pieces', { count: loc.total_qty }) : $t('common.empty') }}
          </el-tag>
        </div>
        <!-- 预警提示条 -->
        <div v-if="loc.stock_alert === 'low'" class="alert-bar alert-low">
          ⚠️ {{ $t('locations.lowStockWarning', { threshold: loc.low_stock_threshold || 10 }) }}
        </div>
        <div v-else-if="loc.stock_alert === 'empty' && loc.total_qty === 0 && loc.has_display_binding" class="alert-bar alert-empty">
          🔴 {{ $t('locations.displayEmpty') }}
        </div>
        <div class="loc-body">
          <div v-if="loc.top_items?.length" class="top-items">
            <div v-for="item in loc.top_items.slice(0, 2)" :key="item.variant_id" class="top-item">
              <span class="item-name">{{ item.product_title }}</span>
              <span class="item-qty">×{{ item.quantity }}</span>
            </div>
          </div>
          <div v-else class="empty-hint">{{ $t('locations.emptyLocations') }}</div>
        </div>
        <div class="loc-footer">
          <el-tag v-if="loc.has_exhibition" size="small" type="warning" style="margin-right:4px">{{ $t('common.exhibition') }}</el-tag>
          <el-tag v-if="loc.has_retail" size="small" type="primary">{{ $t('common.retail') }}</el-tag>
        </div>
      </div>
    </div>

    <el-empty v-if="!loading && locations.length === 0" :description="$t('locations.noLocations')" :image-size="80">
      <el-button type="primary" @click="$router.push('/map/builder')">{{ $t('locations.goToBuilder') }}</el-button>
    </el-empty>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { locationApi } from '@/api/index.js'
import { useWarehouseStore } from '@/stores/warehouse'
import { Search } from '@element-plus/icons-vue'

const locations = ref([])
const warehouseStore = useWarehouseStore()
const loading = ref(false)
const search = ref('')
const filterType = ref('')
const filterEmpty = ref('')
const total = ref(0)
const alertCount = ref(0)

async function loadLocations() {
  loading.value = true
  try {
    const res = await locationApi.list({
      layout_id: warehouseStore.selectedLayoutId || undefined,
      search: search.value || undefined,
      stock_type: filterType.value || undefined,
      stock_status: filterEmpty.value || undefined,
    })
    locations.value = res.data || []
    total.value = locations.value.length
    // 统计预警数量
    alertCount.value = locations.value.filter(l => l.stock_alert === 'low' || l.stock_alert === 'empty').length
  } finally {
    loading.value = false
  }
}

watch(() => warehouseStore.selectedLayoutId, loadLocations, { immediate: true })
</script>

<style scoped>
.location-list { animation: fadeIn 0.3s ease; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

.page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; }
.page-title { font-size: 22px; font-weight: 700; color: #1a1a2e; margin: 0 0 4px; }
.page-subtitle { color: #909399; font-size: 13px; }

.filter-card { margin-bottom: 20px; }
.filter-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }

.locations-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

.location-card {
  background: #fff;
  border-radius: 10px;
  padding: 14px;
  cursor: pointer;
  border: 2px solid #f0f0f0;
  transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
}
.location-card:hover { transform: translateY(-3px); box-shadow: 0 6px 20px rgba(0,0,0,0.1); }
.location-card.has-stock { border-color: #b3d8ff; }
.location-card.is-empty { opacity: 0.7; }
.location-card.is-low { border-color: #f6a623; background: #fffbf0; }
.location-card.is-alert-empty { border-color: #f56c6c; background: #fff5f5; }

.alert-bar {
  font-size: 11px;
  padding: 3px 6px;
  border-radius: 4px;
  margin-bottom: 6px;
}
.alert-low { background: #fdf6ec; color: #e6a23c; }
.alert-empty { background: #fef0f0; color: #f56c6c; }

.loc-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.loc-code { font-size: 15px; font-weight: 700; color: #1a1a2e; }
.loc-body { min-height: 36px; margin-bottom: 8px; }
.top-items { display: flex; flex-direction: column; gap: 3px; }
.top-item { display: flex; justify-content: space-between; font-size: 11px; }
.item-name { color: #606266; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 110px; }
.item-qty { color: #409EFF; font-weight: 600; }
.empty-hint { font-size: 12px; color: #c0c4cc; }
.loc-footer { display: flex; flex-wrap: wrap; gap: 4px; }
</style>
