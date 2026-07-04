<template>
  <div class="replenishment-page">
    <div class="page-header">
      <el-button text @click="$router.back()">
        <el-icon><ArrowLeft /></el-icon> 返回
      </el-button>
      <h2 class="page-title">展中补货检查</h2>
    </div>

    <!-- 操作栏 -->
    <el-card class="action-bar">
      <div class="bar-content">
        <div class="bar-info">
          <el-tag type="info" size="large">共 {{ items.length }} 个商品</el-tag>
          <el-tag v-if="needsCount > 0" type="danger" size="large">{{ needsCount }} 个需要补货</el-tag>
          <el-tag v-else type="success" size="large">全部库存充足</el-tag>
        </div>
        <div class="bar-actions">
          <el-button type="primary" @click="fetchData" :loading="loading">
            <el-icon><Refresh /></el-icon> 刷新 Square 库存
          </el-button>
          <el-button
            v-if="selectedItems.length > 0"
            type="success"
            @click="confirmReplenishment"
          >
            <el-icon><Check /></el-icon> 确认补货 ({{ selectedItems.length }})
          </el-button>
        </div>
      </div>
    </el-card>

    <!-- 商品列表 -->
    <el-card v-loading="loading">
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

        <el-table-column label="商品" min-width="220">
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

        <el-table-column label="挂衣架" width="90" align="center">
          <template #default="{ row }">
            <span class="qty-badge rack">{{ row.rack_quantity }}</span>
          </template>
        </el-table-column>

        <el-table-column label="Square库存" width="110" align="center">
          <template #default="{ row }">
            <span
              class="qty-badge"
              :class="row.current_square_qty !== null && row.current_square_qty < row.rack_quantity ? 'danger' : 'ok'"
            >
              {{ row.current_square_qty ?? '未同步' }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="已售出" width="80" align="center">
          <template #default="{ row }">
            <span class="sold-num">{{ row.sold }}</span>
          </template>
        </el-table-column>

        <el-table-column label="备货剩余" width="90" align="center">
          <template #default="{ row }">
            <span :class="row.stock_quantity <= 0 ? 'text-danger' : ''">{{ row.stock_quantity }}</span>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="120" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.needs_replenishment" type="danger" size="small">需要补货</el-tag>
            <el-tag v-else type="success" size="small">充足</el-tag>
          </template>
        </el-table-column>

        <el-table-column label="补货数量" width="120" align="center">
          <template #default="{ row }">
            <el-input-number
              v-if="row.needs_replenishment && row._selected"
              v-model="row._replenishQty"
              :min="1"
              :max="row.stock_quantity"
              size="small"
              controls-position="right"
            />
            <span v-else-if="row.needs_replenishment" class="text-muted">-</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 补货历史 -->
    <el-card v-if="logs.length > 0" class="log-card">
      <template #header>
        <span style="font-weight: 600">补货记录</span>
      </template>
      <el-table :data="logs" stripe size="small">
        <el-table-column label="时间" prop="created_at" width="170" />
        <el-table-column label="商品" min-width="200">
          <template #default="{ row }">
            {{ row.product_title }} - {{ row.variant_title }}
          </template>
        </el-table-column>
        <el-table-column label="补货数量" prop="replenish_qty" width="90" align="center" />
        <el-table-column label="挂衣架" width="120" align="center">
          <template #default="{ row }">
            {{ row.rack_qty_before }} → {{ row.rack_qty_after }}
          </template>
        </el-table-column>
        <el-table-column label="备货" width="120" align="center">
          <template #default="{ row }">
            {{ row.stock_qty_before }} → {{ row.stock_qty_after }}
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { squareApi } from '@/api'

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
    // 添加前端辅助字段
    items.value = data.map(item => ({
      ...item,
      _selected: false,
      _replenishQty: item.suggested_qty || 3,
    }))
    logs.value = logRes.data || []
  } catch (err) {
    ElMessage.error('获取数据失败: ' + (err.response?.data?.message || err.message))
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
      `确认从备货中补充 ${toReplenish.length} 个商品到挂衣架？`,
      '确认补货',
      { confirmButtonText: '确认', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return
  }

  try {
    const res = await squareApi.replenishmentConfirm(exhibitionId, toReplenish)
    if (res.success) {
      ElMessage.success(res.message || '补货成功')
      await fetchData() // 刷新数据
    } else {
      ElMessage.error(res.message || '补货失败')
    }
  } catch (err) {
    ElMessage.error('补货失败: ' + (err.response?.data?.message || err.message))
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
.bar-info { display: flex; gap: 8px; }
.bar-actions { display: flex; gap: 8px; }

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
</style>
