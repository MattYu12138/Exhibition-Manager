<template>
  <div class="location-detail">
    <div class="page-header">
      <el-button text @click="$router.back()"><el-icon><ArrowLeft /></el-icon> 返回</el-button>
      <div class="header-center" v-if="location">
        <h1 class="page-title">📍 货位 {{ location.code }}</h1>
        <p class="page-subtitle">{{ location.shelf_code }} · {{ location.row_label }} 行 {{ location.col_label }} 列</p>
      </div>
      <div class="header-actions">
        <el-button @click="printQrCode"><el-icon><Printer /></el-icon> 打印二维码</el-button>
        <el-button type="primary" @click="showAddDialog = true"><el-icon><Plus /></el-icon> 录入货物</el-button>
      </div>
    </div>

    <div v-loading="loading" class="detail-body">
      <el-row :gutter="20">
        <!-- 左：库存列表 -->
        <el-col :span="16">
          <el-card>
            <template #header>
              <div class="card-header">
                <span>当前库存</span>
                <el-tag type="success">{{ totalQty }} 件</el-tag>
              </div>
            </template>

            <el-table :data="inventory" size="default">
              <el-table-column label="商品" min-width="200">
                <template #default="{ row }">
                  <div class="product-cell">
                    <img v-if="row.image_url" :src="row.image_url" class="product-thumb" />
                    <div>
                      <div class="product-title">{{ row.product_title }}</div>
                      <div class="product-variant">{{ row.variant_title }}</div>
                      <div class="product-sku">SKU: {{ row.sku }}</div>
                    </div>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="类型" width="90">
                <template #default="{ row }">
                  <el-tag size="small" :type="row.stock_type === 'exhibition' ? 'warning' : 'primary'">
                    {{ row.stock_type === 'exhibition' ? '展会' : '零售' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="数量" width="120">
                <template #default="{ row }">
                  <div class="qty-control">
                    <el-button text size="small" @click="adjustQty(row, -1)" :disabled="row.quantity <= 0">
                      <el-icon><Minus /></el-icon>
                    </el-button>
                    <span class="qty-value">{{ row.quantity }}</span>
                    <el-button text size="small" @click="adjustQty(row, 1)">
                      <el-icon><Plus /></el-icon>
                    </el-button>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="关联展会" min-width="120">
                <template #default="{ row }">
                  <span v-if="row.exhibition_name" class="exhibition-tag">{{ row.exhibition_name }}</span>
                  <span v-else class="no-link">—</span>
                </template>
              </el-table-column>
              <el-table-column label="入库时间" width="110">
                <template #default="{ row }">
                  <span class="date-text">{{ formatDate(row.created_at) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="" width="50">
                <template #default="{ row }">
                  <el-button text type="danger" size="small" @click="deleteInventory(row)">
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </template>
              </el-table-column>
            </el-table>

            <el-empty v-if="!loading && inventory.length === 0" description="此货位暂无库存" :image-size="60" />
          </el-card>
        </el-col>

        <!-- 右：二维码 + 操作日志 -->
        <el-col :span="8">
          <el-card class="qr-card">
            <template #header><span>货位二维码</span></template>
            <div class="qr-wrapper">
              <img v-if="qrCodeUrl" :src="qrCodeUrl" class="qr-image" />
              <div v-else class="qr-loading"><el-icon class="is-loading"><Loading /></el-icon></div>
            </div>
            <div class="qr-code-text">{{ location?.code }}</div>
            <div class="qr-hint">扫码后可直接录入货物到此货位</div>
            <el-button style="width:100%;margin-top:12px" @click="printQrCode">
              <el-icon><Printer /></el-icon> 打印二维码
            </el-button>
          </el-card>

          <el-card style="margin-top:16px">
            <template #header><span>操作日志</span></template>
            <div class="log-list">
              <div v-for="log in logs" :key="log.id" class="log-item">
                <div class="log-action" :class="log.action">{{ logLabel(log.action) }}</div>
                <div class="log-detail">{{ log.product_title }} × {{ log.quantity }}</div>
                <div class="log-time">{{ formatDate(log.created_at) }}</div>
              </div>
              <el-empty v-if="logs.length === 0" description="暂无日志" :image-size="40" />
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <!-- 录入货物对话框 -->
    <el-dialog v-model="showAddDialog" title="录入货物" width="500px" :close-on-click-modal="false">
      <el-form :model="addForm" label-position="top" ref="addFormRef">
        <el-form-item label="搜索商品（名称/SKU/条码）" required>
          <el-select
            v-model="addForm.shopify_variant_id"
            filterable
            remote
            :remote-method="searchProducts"
            :loading="searchLoading"
            placeholder="输入关键词搜索..."
            style="width:100%"
            @change="onVariantSelect"
          >
            <el-option
              v-for="item in searchResults"
              :key="item.variant_id"
              :label="`${item.title} - ${item.variant_title} (${item.sku})`"
              :value="item.shopify_variant_id"
            />
          </el-select>
        </el-form-item>

        <div v-if="selectedVariant" class="selected-product">
          <img v-if="selectedVariant.image_url" :src="selectedVariant.image_url" class="selected-thumb" />
          <div>
            <div class="selected-name">{{ selectedVariant.title }}</div>
            <div class="selected-variant">{{ selectedVariant.variant_title }}</div>
            <div class="selected-sku">SKU: {{ selectedVariant.sku }}</div>
          </div>
        </div>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="数量" required>
              <el-input-number v-model="addForm.quantity" :min="1" :max="9999" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="货物类型" required>
              <el-select v-model="addForm.stock_type" style="width:100%">
                <el-option label="零售货物" value="retail" />
                <el-option label="展会货物" value="exhibition" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item v-if="addForm.stock_type === 'exhibition'" label="关联展会（可选）">
          <el-select v-model="addForm.exhibition_id" clearable placeholder="选择展会" style="width:100%">
            <el-option v-for="ex in exhibitions" :key="ex.id" :label="ex.name" :value="ex.id" />
          </el-select>
        </el-form-item>

        <el-form-item label="备注">
          <el-input v-model="addForm.notes" placeholder="可选备注" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" :loading="addLoading" @click="addInventory">确认录入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { locationApi, productApi } from '@/api/index.js'
import { ArrowLeft, Plus, Minus, Delete, Printer, Loading } from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const locationId = route.params.id

const location = ref(null)
const inventory = ref([])
const logs = ref([])
const loading = ref(false)
const qrCodeUrl = ref('')
const showAddDialog = ref(false)
const addLoading = ref(false)
const searchLoading = ref(false)
const searchResults = ref([])
const selectedVariant = ref(null)
const exhibitions = ref([])

const addForm = ref({
  shopify_variant_id: null,
  quantity: 1,
  stock_type: 'retail',
  exhibition_id: null,
  notes: '',
})

const totalQty = computed(() => inventory.value.reduce((s, i) => s + i.quantity, 0))

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

function logLabel(action) {
  return { add: '入库', remove: '出库', adjust: '调整', pick: '拣货' }[action] || action
}

async function loadData() {
  loading.value = true
  try {
    const [locRes, qrRes, exRes] = await Promise.all([
      locationApi.get(locationId),
      locationApi.getQrCode(locationId),
      productApi.getExhibitions(),
    ])
    location.value = locRes.data
    inventory.value = locRes.data?.inventory || []
    logs.value = locRes.data?.logs || []
    qrCodeUrl.value = qrRes.data?.qr_data_url || ''
    exhibitions.value = exRes.data || []
  } finally {
    loading.value = false
  }
}

async function searchProducts(query) {
  if (!query || query.length < 1) return
  searchLoading.value = true
  try {
    const res = await productApi.search(query, 20)
    searchResults.value = res.data || []
  } finally {
    searchLoading.value = false
  }
}

function onVariantSelect(variantId) {
  selectedVariant.value = searchResults.value.find(r => r.shopify_variant_id === variantId) || null
}

async function addInventory() {
  if (!addForm.value.shopify_variant_id) {
    ElMessage.warning('请选择商品')
    return
  }
  addLoading.value = true
  try {
    await locationApi.addInventory(locationId, addForm.value)
    ElMessage.success('录入成功')
    showAddDialog.value = false
    addForm.value = { shopify_variant_id: null, quantity: 1, stock_type: 'retail', exhibition_id: null, notes: '' }
    selectedVariant.value = null
    await loadData()
  } catch (err) {
    ElMessage.error(err.message || '录入失败')
  } finally {
    addLoading.value = false
  }
}

async function adjustQty(row, delta) {
  try {
    await locationApi.adjustInventory(locationId, row.id, { quantity_delta: delta })
    row.quantity += delta
    if (row.quantity <= 0) {
      inventory.value = inventory.value.filter(i => i.id !== row.id)
    }
  } catch (err) {
    ElMessage.error(err.message)
  }
}

async function deleteInventory(row) {
  await ElMessageBox.confirm(`确认删除 ${row.product_title} × ${row.quantity}？`, '确认删除', { type: 'warning' })
  await locationApi.deleteInventory(locationId, row.id)
  inventory.value = inventory.value.filter(i => i.id !== row.id)
  ElMessage.success('已删除')
}

function printQrCode() {
  if (!qrCodeUrl.value) return
  const win = window.open('', '_blank')
  win.document.write(`
    <html><head><title>货位 ${location.value?.code} 二维码</title>
    <style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;}
    img{width:240px;height:240px;} h2{margin:16px 0 4px;font-size:24px;} p{color:#666;font-size:14px;}</style></head>
    <body>
      <img src="${qrCodeUrl.value}" />
      <h2>${location.value?.code}</h2>
      <p>${location.value?.shelf_code || ''}</p>
      <script>window.onload=()=>window.print()<\/script>
    </body></html>
  `)
  win.document.close()
}

onMounted(loadData)
</script>

<style scoped>
.location-detail { animation: fadeIn 0.3s ease; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

.page-header { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
.header-center { flex: 1; }
.page-title { font-size: 22px; font-weight: 700; color: #1a1a2e; margin: 0 0 2px; }
.page-subtitle { color: #909399; font-size: 13px; }
.header-actions { display: flex; gap: 10px; }

.card-header { display: flex; align-items: center; justify-content: space-between; }

.product-cell { display: flex; align-items: center; gap: 10px; }
.product-thumb { width: 40px; height: 40px; object-fit: cover; border-radius: 6px; flex-shrink: 0; }
.product-title { font-size: 13px; font-weight: 600; color: #303133; }
.product-variant { font-size: 12px; color: #606266; }
.product-sku { font-size: 11px; color: #909399; }

.qty-control { display: flex; align-items: center; gap: 4px; }
.qty-value { font-size: 16px; font-weight: 700; color: #303133; min-width: 32px; text-align: center; }
.exhibition-tag { font-size: 12px; color: #E6A23C; }
.no-link { color: #c0c4cc; }
.date-text { font-size: 12px; color: #909399; }

.qr-card { text-align: center; }
.qr-wrapper { display: flex; justify-content: center; padding: 16px 0 8px; }
.qr-image { width: 160px; height: 160px; }
.qr-loading { width: 160px; height: 160px; display: flex; align-items: center; justify-content: center; font-size: 32px; color: #c0c4cc; }
.qr-code-text { font-size: 18px; font-weight: 700; color: #1a1a2e; margin-bottom: 4px; }
.qr-hint { font-size: 12px; color: #909399; }

.log-list { display: flex; flex-direction: column; gap: 8px; max-height: 300px; overflow-y: auto; }
.log-item { padding: 8px; border-radius: 6px; background: #f9f9f9; }
.log-action { font-size: 11px; font-weight: 600; margin-bottom: 2px; }
.log-action.add { color: #67C23A; }
.log-action.remove { color: #F56C6C; }
.log-action.pick { color: #409EFF; }
.log-action.adjust { color: #E6A23C; }
.log-detail { font-size: 12px; color: #606266; }
.log-time { font-size: 11px; color: #c0c4cc; margin-top: 2px; }

.selected-product { display: flex; align-items: center; gap: 12px; padding: 12px; background: #f5f7ff; border-radius: 8px; margin-bottom: 16px; }
.selected-thumb { width: 48px; height: 48px; object-fit: cover; border-radius: 6px; }
.selected-name { font-size: 14px; font-weight: 600; color: #303133; }
.selected-variant { font-size: 12px; color: #606266; }
.selected-sku { font-size: 11px; color: #909399; }
</style>
