<template>
  <div class="inventory-page">
    <div class="page-header">
      <el-button text @click="$router.back()"><el-icon><ArrowLeft /></el-icon> 返回</el-button>
      <div>
        <h1 class="page-title">展会库存管理</h1>
        <p class="page-desc">同步库存到 Square &rarr; 展会销售 &rarr; 获取剩余量用于清点</p>
      </div>
    </div>

    <el-card class="steps-card">
      <el-steps :active="currentStep" align-center>
        <el-step title="出发前同步" description="将带走数量写入 Square" />
        <el-step title="展会进行中" description="在 Square POS 正常销售" />
        <el-step title="展会结束" description="从 Square 读取剩余量" />
      </el-steps>
    </el-card>

    <el-card class="action-card">
      <el-row :gutter="16" justify="center">
        <el-col :span="10">
          <el-button type="warning" size="large" style="width: 100%" :loading="syncing === 'before'" @click="handleSyncBefore">
            <el-icon><Upload /></el-icon> 出发前：同步数量到 Square
          </el-button>
          <div class="btn-hint">清点打包完成后点击，将带走数量写入 Square 库存</div>
        </el-col>
        <el-col :span="10">
          <el-button type="primary" size="large" style="width: 100%" :loading="syncing === 'after'" @click="handleSyncAfter">
            <el-icon><Download /></el-icon> 展会结束：获取剩余量
          </el-button>
          <div class="btn-hint">展会结束后点击，从 Square 获取剩余库存，计算卖出量</div>
        </el-col>
      </el-row>
    </el-card>

    <el-card>
      <template #header>
        <div class="card-header">
          <span style="font-weight: 600">清点对照表</span>
          <div class="header-right">
            <el-tag v-if="snapshots.length" type="success" size="default">共 {{ snapshots.length }} 条记录</el-tag>
            <el-button size="small" @click="loadSnapshotData" :loading="loadingSnap">
              <el-icon><Refresh /></el-icon> 刷新
            </el-button>
          </div>
        </div>
      </template>

      <el-empty v-if="!snapshots.length && !loadingSnap" description="暂无数据，请先执行出发前同步" />

      <div v-else v-loading="loadingSnap">
        <el-row :gutter="16" class="summary-row" v-if="snapshots.length">
          <el-col :span="8">
            <div class="summary-item">
              <div class="summary-num blue">{{ totalPlanned }}</div>
              <div class="summary-label">带走总件数</div>
            </div>
          </el-col>
          <el-col :span="8">
            <div class="summary-item">
              <div class="summary-num orange">{{ totalSold }}</div>
              <div class="summary-label">卖出总件数</div>
            </div>
          </el-col>
          <el-col :span="8">
            <div class="summary-item">
              <div class="summary-num green">{{ totalRemaining }}</div>
              <div class="summary-label">应剩余总件数（待清点）</div>
            </div>
          </el-col>
        </el-row>

        <el-table :data="snapshots" stripe border style="margin-top: 16px">
          <el-table-column label="商品" min-width="200">
            <template #default="{ row }">
              <div>
                <div style="font-weight: 600; font-size: 14px">{{ row.product_title }}</div>
                <div style="font-size: 12px; color: #909399">{{ row.variant_title }}</div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="带走数量" width="110" align="center">
            <template #default="{ row }">
              <el-tag type="info">{{ row.square_quantity_before ?? row.item_planned_qty ?? '-' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="Square 剩余" width="120" align="center">
            <template #default="{ row }">
              <span v-if="row.square_quantity_after !== null && row.square_quantity_after !== undefined">
                {{ row.square_quantity_after }}
              </span>
              <span v-else style="color: #c0c4cc">待同步</span>
            </template>
          </el-table-column>
          <el-table-column label="卖出数量" width="110" align="center">
            <template #default="{ row }">
              <el-tag type="warning" v-if="row.sold_quantity !== null && row.sold_quantity !== undefined && row.sold_quantity > 0">
                {{ row.sold_quantity }}
              </el-tag>
              <span v-else-if="row.sold_quantity === 0" style="color: #909399">0</span>
              <span v-else style="color: #c0c4cc">-</span>
            </template>
          </el-table-column>
          <el-table-column label="应剩余（待清点）" width="140" align="center">
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
          <el-table-column label="Square 匹配" width="110" align="center">
            <template #default="{ row }">
              <el-tag :type="row.square_catalog_variation_id ? 'success' : 'danger'" size="small">
                {{ row.square_catalog_variation_id ? '已匹配' : '未匹配' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="同步时间" width="160" align="center">
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
import { ElMessage, ElMessageBox } from 'element-plus'
import { useExhibitionStore } from '@/stores/exhibition'

const route = useRoute()
const store = useExhibitionStore()
const id = route.params.id

const snapshots = ref([])
const syncing = ref(null)
const loadingSnap = ref(false)
const currentStep = ref(0)

const totalPlanned = computed(() =>
  snapshots.value.reduce((s, r) => s + (r.square_quantity_before || r.item_planned_qty || 0), 0)
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
    '确定要将带走数量同步到 Square 吗？这会将每个商品的计划带走数量写入 Square 库存。',
    '确认同步',
    { type: 'warning', confirmButtonText: '确认同步' }
  )
  syncing.value = 'before'
  try {
    const result = await store.syncBeforeExhibition(id)
    await loadSnapshotData()
    currentStep.value = 1
    const syncedCount = result?.data?.filter(r => r.status === 'synced').length || 0
    ElMessage.success(`已将 ${syncedCount} 个商品的数量同步到 Square`)
  } catch (err) {
    ElMessage.error('同步失败: ' + (err.message || '未知错误'))
  } finally {
    syncing.value = null
  }
}

async function handleSyncAfter() {
  await ElMessageBox.confirm(
    '确定要从 Square 获取展会后的剩余库存吗？将自动计算每个商品的卖出量和应剩余数量。',
    '确认获取',
    { type: 'info', confirmButtonText: '确认获取' }
  )
  syncing.value = 'after'
  try {
    await store.syncAfterExhibition(id)
    await loadSnapshotData()
    currentStep.value = 2
    ElMessage.success('已获取 Square 剩余库存，请核对清点对照表')
  } catch (err) {
    ElMessage.error('获取失败: ' + (err.message || '未知错误'))
  } finally {
    syncing.value = null
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN')
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

.steps-card { margin-bottom: 20px; }
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
