<template>
  <div class="inventory-page">
    <div class="page-header">
      <el-button text @click="$router.back()"><el-icon><ArrowLeft /></el-icon> 返回</el-button>
      <div>
        <h1 class="page-title">展会结束盘点</h1>
        <p class="page-desc">通过 Square 库存变动计算剩余货品数量</p>
      </div>
    </div>

    <!-- 操作步骤 -->
    <el-card class="steps-card">
      <el-steps :active="currentStep" align-center>
        <el-step title="出发前同步" description="记录 Square 当前库存" />
        <el-step title="展会进行中" description="在 Square POS 正常销售" />
        <el-step title="展会结束同步" description="获取 Square 最新库存" />
        <el-step title="更新剩余库存" description="将剩余数量写回 Square" />
      </el-steps>
    </el-card>

    <!-- 操作按钮区 -->
    <el-card class="action-card">
      <el-row :gutter="16">
        <el-col :span="8">
          <el-button
            type="warning"
            size="large"
            style="width: 100%"
            :loading="syncing === 'before'"
            @click="handleSyncBefore"
          >
            <el-icon><Upload /></el-icon>
            出发前：记录库存快照
          </el-button>
          <div class="btn-hint">在出发去展会前点击，记录 Square 当前库存</div>
        </el-col>
        <el-col :span="8">
          <el-button
            type="primary"
            size="large"
            style="width: 100%"
            :loading="syncing === 'after'"
            @click="handleSyncAfter"
          >
            <el-icon><Download /></el-icon>
            展会结束：计算差值
          </el-button>
          <div class="btn-hint">展会结束后点击，自动计算剩余货品数量</div>
        </el-col>
        <el-col :span="8">
          <el-button
            type="success"
            size="large"
            style="width: 100%"
            :loading="syncing === 'update'"
            :disabled="!snapshots.length"
            @click="handleUpdateRemaining"
          >
            <el-icon><Refresh /></el-icon>
            将剩余数量同步至 Square
          </el-button>
          <div class="btn-hint">确认剩余数量无误后，更新回 Square 库存</div>
        </el-col>
      </el-row>
    </el-card>

    <!-- 差值结果表格 -->
    <el-card>
      <template #header>
        <div class="card-header">
          <span style="font-weight: 600">库存差值明细</span>
          <div class="header-right">
            <el-tag v-if="snapshots.length" type="success" size="default">
              共 {{ snapshots.length }} 条记录
            </el-tag>
            <el-button size="small" @click="loadSnapshotData" :loading="loadingSnap">
              <el-icon><Refresh /></el-icon> 刷新
            </el-button>
          </div>
        </div>
      </template>

      <el-empty v-if="!snapshots.length && !loadingSnap" description="暂无数据，请先执行同步操作" />

      <div v-else v-loading="loadingSnap">
        <!-- 汇总统计 -->
        <el-row :gutter="16" class="summary-row" v-if="snapshots.length">
          <el-col :span="6">
            <div class="summary-item">
              <div class="summary-num blue">{{ totalPlanned }}</div>
              <div class="summary-label">计划带走总件数</div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="summary-item">
              <div class="summary-num orange">{{ totalSold }}</div>
              <div class="summary-label">展会销售总件数</div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="summary-item">
              <div class="summary-num green">{{ totalRemaining }}</div>
              <div class="summary-label">剩余货品总件数</div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="summary-item">
              <div class="summary-num" :class="matchRate === 100 ? 'green' : 'red'">
                {{ matchRate }}%
              </div>
              <div class="summary-label">Square 匹配率</div>
            </div>
          </el-col>
        </el-row>

        <el-table :data="snapshots" stripe border style="margin-top: 16px">
          <el-table-column label="商品" min-width="180">
            <template #default="{ row }">
              <div>
                <div style="font-weight: 600; font-size: 14px">{{ row.product_title || row.item_planned_qty }}</div>
                <div style="font-size: 12px; color: #909399">{{ row.variant_title }}</div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="计划带走" prop="planned_quantity" width="100" align="center">
            <template #default="{ row }">
              <el-tag type="info">{{ row.item_planned_qty || row.planned_quantity || '-' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="出发前 Square 库存" width="140" align="center">
            <template #default="{ row }">
              <span>{{ row.square_quantity_before ?? '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="展会后 Square 库存" width="140" align="center">
            <template #default="{ row }">
              <span>{{ row.square_quantity_after ?? '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="展会销售量" width="110" align="center">
            <template #default="{ row }">
              <el-tag type="warning" v-if="row.sold_quantity !== null && row.sold_quantity !== undefined">
                -{{ row.sold_quantity }}
              </el-tag>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column label="剩余数量" width="110" align="center">
            <template #default="{ row }">
              <el-tag
                :type="row.remaining_quantity > 0 ? 'success' : 'danger'"
                size="default"
                v-if="row.remaining_quantity !== null && row.remaining_quantity !== undefined"
              >
                {{ row.remaining_quantity }}
              </el-tag>
              <span v-else>-</span>
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
  snapshots.value.reduce((s, r) => s + (r.item_planned_qty || 0), 0)
)
const totalSold = computed(() =>
  snapshots.value.reduce((s, r) => s + (r.sold_quantity || 0), 0)
)
const totalRemaining = computed(() =>
  snapshots.value.reduce((s, r) => s + (r.remaining_quantity || 0), 0)
)
const matchRate = computed(() => {
  if (!snapshots.value.length) return 0
  const matched = snapshots.value.filter((r) => r.square_catalog_variation_id).length
  return Math.round((matched / snapshots.value.length) * 100)
})

async function loadSnapshotData() {
  loadingSnap.value = true
  try {
    const data = await store.loadSnapshots(id)
    snapshots.value = data || []
    if (snapshots.value.some((s) => s.square_quantity_before !== null)) currentStep.value = 1
    if (snapshots.value.some((s) => s.square_quantity_after !== null)) currentStep.value = 2
  } finally {
    loadingSnap.value = false
  }
}

async function handleSyncBefore() {
  syncing.value = 'before'
  try {
    await store.syncBeforeExhibition(id)
    await loadSnapshotData()
    currentStep.value = 1
  } finally {
    syncing.value = null
  }
}

async function handleSyncAfter() {
  syncing.value = 'after'
  try {
    await store.syncAfterExhibition(id)
    await loadSnapshotData()
    currentStep.value = 2
  } finally {
    syncing.value = null
  }
}

async function handleUpdateRemaining() {
  await ElMessageBox.confirm(
    '确定要将剩余数量更新至 Square 库存吗？此操作将覆盖 Square 中对应商品的库存数量。',
    '确认更新',
    { type: 'warning', confirmButtonText: '确认更新' }
  )
  syncing.value = 'update'
  try {
    await store.updateRemainingToSquare(id)
    currentStep.value = 3
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
