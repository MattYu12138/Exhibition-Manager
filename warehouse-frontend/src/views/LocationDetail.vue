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
        <el-col :span="16">
          <el-alert v-if="stockAlert === 'empty'" title="⚠️ 上架货位已空" type="error"
            :description="transferAvailable.length > 0 ? `发现 ${transferAvailable.length} 个 SKU 在备库中有货，可内部调拨↓` : '请通过补货流程从入库批次补货'"
            show-icon :closable="false" style="margin-bottom:16px" />
          <el-alert v-else-if="stockAlert === 'low'"
            :title="`⚠️ 库存不足（当前 ${totalQty} 件，预警阈值 ${location?.low_stock_threshold || 10} 件）`"
            type="warning" show-icon :closable="false" style="margin-bottom:16px" />

          <el-card>
            <template #header>
              <div class="card-header">
                <span>当前库存</span>
                <el-tag :type="stockAlert === 'ok' ? 'success' : stockAlert === 'low' ? 'warning' : 'danger'">{{ totalQty }} 件</el-tag>
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
              <el-table-column label="类型" width="110">
                <template #default="{ row }">
                  <el-tag size="small" :type="row.stock_type === 'exhibition' ? 'warning' : row.stock_type === 'retail_storage' ? 'info' : 'primary'">
                    {{ stockTypeLabel(row.stock_type) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="数量" width="120">
                <template #default="{ row }">
                  <div class="qty-control">
                    <el-button text size="small" @click="adjustQty(row, -1)" :disabled="row.quantity <= 0"><el-icon><Minus /></el-icon></el-button>
                    <span class="qty-value">{{ row.quantity }}</span>
                    <el-button text size="small" @click="adjustQty(row, 1)"><el-icon><Plus /></el-icon></el-button>
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
                <template #default="{ row }"><span class="date-text">{{ formatDate(row.created_at) }}</span></template>
              </el-table-column>
              <el-table-column label="" width="50">
                <template #default="{ row }">
                  <el-button text type="danger" size="small" @click="deleteInventory(row)"><el-icon><Delete /></el-icon></el-button>
                </template>
              </el-table-column>
            </el-table>
            <el-empty v-if="!loading && inventory.length === 0" description="此货位暂无库存" :image-size="60" />
          </el-card>
        </el-col>

        <el-col :span="8">
          <el-card class="qr-card">
            <template #header><span>货位二维码</span></template>
            <div class="qr-wrapper">
              <img v-if="qrCodeUrl" :src="qrCodeUrl" class="qr-image" />
              <div v-else class="qr-loading"><el-icon class="is-loading"><Loading /></el-icon></div>
            </div>
            <div class="qr-code-text">{{ location?.code }}</div>
            <div class="qr-hint">扫码后可直接录入货物到此货位</div>
            <el-button style="width:100%;margin-top:12px" @click="printQrCode"><el-icon><Printer /></el-icon> 打印二维码</el-button>
          </el-card>

          <el-card style="margin-top:16px">
            <template #header>
              <div class="card-header">
                <span>⚙️ 库存预警阈值</span>
                <el-tag size="small" :type="stockAlert === 'ok' ? 'success' : stockAlert === 'low' ? 'warning' : 'danger'">
                  {{ stockAlert === 'ok' ? '正常' : stockAlert === 'low' ? '低库存' : '空货位' }}
                </el-tag>
              </div>
            </template>
            <div class="threshold-body">
              <p class="threshold-hint">当库存低于此数值时触发预警提醒</p>
              <div class="threshold-row">
                <el-input-number v-model="thresholdInput" :min="0" :max="9999" style="width:120px" @change="thresholdDirty = true" />
                <span class="threshold-unit">件</span>
                <el-button type="primary" size="small" :disabled="!thresholdDirty" :loading="thresholdSaving" @click="saveThreshold">保存</el-button>
              </div>
              <div class="threshold-current">当前库存：<strong :class="stockAlert !== 'ok' ? 'text-warn' : ''">{{ totalQty }} 件</strong></div>
            </div>
          </el-card>

          <el-card v-if="transferAvailable.length > 0" style="margin-top:16px" class="transfer-card">
            <template #header>
              <div class="card-header">
                <span>🔄 内部调拨（备库→上架）</span>
                <el-tag type="success" size="small">可调拨</el-tag>
              </div>
            </template>
            <p class="transfer-hint">以下 SKU 在备库中有货，可直接调拨到本货位上架</p>
            <div v-for="item in transferAvailable" :key="item.shopify_variant_id" class="transfer-item">
              <div class="transfer-item-info">
                <div class="transfer-sku-name">{{ item.product_title }}</div>
                <div class="transfer-sku-sub">{{ item.variant_title }} · 备库共 {{ item.storage_qty }} 件</div>
                <div class="transfer-sku-from">来自：{{ item.from_location_code }}</div>
              </div>
              <div class="transfer-item-action">
                <el-input-number v-model="item.transfer_qty" :min="1" :max="item.storage_qty" size="small" style="width:100px" />
                <el-button type="success" size="small" :loading="item.transferring" @click="doTransfer(item)">调拨</el-button>
              </div>
            </div>
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

    <el-dialog v-model="showAddDialog" title="录入货物" width="500px" :close-on-click-modal="false">
      <el-form :model="addForm" label-position="top">
        <el-form-item label="搜索商品（名称/SKU/条码）" required>
          <el-select v-model="addForm.shopify_variant_id" filterable remote :remote-method="searchProducts"
            :loading="searchLoading" placeholder="输入关键词搜索..." style="width:100%" @change="onVariantSelect">
            <el-option v-for="item in searchResults" :key="item.variant_id"
              :label="`${item.title} - ${item.variant_title} (${item.sku})`" :value="item.shopify_variant_id" />
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
                <el-option label="零售上架" value="retail_display" />
                <el-option label="零售备库" value="retail_storage" />
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
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { locationApi, productApi } from '@/api/index.js'
import { ArrowLeft, Plus, Minus, Delete, Printer, Loading } from '@element-plus/icons-vue'

const route = useRoute()
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
const thresholdInput = ref(10)
const thresholdDirty = ref(false)
const thresholdSaving = ref(false)
const transferAvailable = ref([])

const addForm = ref({ shopify_variant_id: null, quantity: 1, stock_type: 'retail_display', exhibition_id: null, notes: '' })
const totalQty = computed(() => inventory.value.reduce((s, i) => s + i.quantity, 0))
const stockAlert = computed(() => {
  if (!location.value) return 'ok'
  const threshold = location.value.low_stock_threshold ?? 10
  if (totalQty.value === 0) return 'empty'
  if (totalQty.value < threshold) return 'low'
  return 'ok'
})

function stockTypeLabel(t) {
  return { retail_display: '上架中', retail_storage: '备库中', exhibition: '展会', retail: '零售' }[t] || t
}
function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}
function logLabel(a) {
  return { add: '入库', remove: '出库', adjust: '调整', pick: '拣货', transfer: '调拨' }[a] || a
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
    inventory.value = locRes.data.inventory || []
    logs.value = locRes.data.logs || []
    qrCodeUrl.value = qrRes.data?.qr_data_url || ''
    exhibitions.value = exRes.data || []
    thresholdInput.value = location.value?.low_stock_threshold ?? 10
    thresholdDirty.value = false
    await loadTransferAvailable()
  } finally {
    loading.value = false
  }
}

async function loadTransferAvailable() {
  try {
    const res = await locationApi.getAlerts()
    const alerts = res.data || []
    const myAlert = alerts.find(a => String(a.id) === String(locationId))
    if (myAlert?.transfer_available?.length > 0) {
      transferAvailable.value = myAlert.transfer_available.map(item => ({
        ...item,
        transfer_qty: Math.min(item.storage_qty, 10),
        transferring: false,
      }))
    } else {
      transferAvailable.value = []
    }
  } catch {
    transferAvailable.value = []
  }
}

async function saveThreshold() {
  thresholdSaving.value = true
  try {
    await locationApi.updateThreshold(locationId, thresholdInput.value)
    location.value.low_stock_threshold = thresholdInput.value
    thresholdDirty.value = false
    ElMessage.success('预警阈值已更新')
  } catch (err) {
    ElMessage.error(err.message || '保存失败')
  } finally {
    thresholdSaving.value = false
  }
}

async function doTransfer(item) {
  if (!item.transfer_qty || item.transfer_qty < 1) { ElMessage.warning('请输入调拨数量'); return }
  try {
    await ElMessageBox.confirm(
      `确认从备库货位 ${item.from_location_code} 调拨 ${item.transfer_qty} 件「${item.product_title} ${item.variant_title}」到本货位上架？`,
      '确认内部调拨', { type: 'info', confirmButtonText: '确认调拨', cancelButtonText: '取消' }
    )
  } catch { return }
  item.transferring = true
  try {
    await locationApi.transfer(locationId, {
      shopify_variant_id: item.shopify_variant_id,
      quantity: item.transfer_qty,
      from_location_id: item.from_location_id,
      note: `内部调拨：从 ${item.from_location_code} 调拨 ${item.transfer_qty} 件到 ${location.value?.code}`,
    })
    ElMessage.success(`已成功调拨 ${item.transfer_qty} 件到本货位`)
    await loadData()
  } catch (err) {
    ElMessage.error(err.message || '调拨失败')
  } finally {
    item.transferring = false
  }
}

async function searchProducts(query) {
  if (!query) return
  searchLoading.value = true
  try {
    const res = await productApi.search(query, 20)
    searchResults.value = res.data || []
  } finally { searchLoading.value = false }
}

function onVariantSelect(variantId) {
  selectedVariant.value = searchResults.value.find(r => r.shopify_variant_id === variantId) || null
}

async function addInventory() {
  if (!addForm.value.shopify_variant_id) { ElMessage.warning('请选择商品'); return }
  addLoading.value = true
  try {
    await locationApi.addInventory(locationId, addForm.value)
    ElMessage.success('录入成功')
    showAddDialog.value = false
    addForm.value = { shopify_variant_id: null, quantity: 1, stock_type: 'retail_display', exhibition_id: null, notes: '' }
    selectedVariant.value = null
    await loadData()
  } catch (err) {
    ElMessage.error(err.message || '录入失败')
  } finally { addLoading.value = false }
}

async function adjustQty(row, delta) {
  try {
    await locationApi.adjustInventory(locationId, row.id, { quantity_delta: delta })
    row.quantity += delta
    if (row.quantity <= 0) inventory.value = inventory.value.filter(i => i.id !== row.id)
  } catch (err) { ElMessage.error(err.message) }
}

async function deleteInventory(row) {
  await ElMessageBox.confirm(`确认删除 ${row.product_title} × ${row.quantity}？`, '确认删除', { type: 'warning' })
  await locationApi.deleteInventory(locationId, row.id)
  inventory.value = inventory.value.filter(i => i.id !== row.id)
  ElMessage.success('已删除')
}

function printQrCode() {
  if (!qrCodeUrl.value) return
  // 构建库存货物行 HTML
  const invRows = inventory.value.map(item => {
    const typeLabel = { retail_display: '上架', retail_storage: '备库', exhibition: '展会' }[item.stock_type] || item.stock_type
    const name = [item.product_title, item.variant_title].filter(Boolean).join(' · ')
    return `<div class="inv-row"><div class="inv-name">${name}</div><div class="inv-meta">SKU: ${item.sku || '—'} &nbsp;|&nbsp; ${typeLabel} × ${item.quantity}</div></div>`
  }).join('')
  const win = window.open('', '_blank')
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>货位 ${location.value?.code}</title>
<style>
@page { size: 46mm 150mm; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { width: 46mm; height: 150mm; font-family: Arial, 'PingFang SC', sans-serif; overflow: hidden; background: #fff; }
.label-wrap { width: 46mm; height: 150mm; display: flex; flex-direction: column; padding: 2mm; }
.qr-section { display: flex; justify-content: center; align-items: center; padding: 2mm 0 1mm; }
.qr-section img { width: 38mm; height: 38mm; }
.code-section { text-align: center; padding: 1mm 0 1.5mm; border-bottom: 0.5pt solid #ccc; margin-bottom: 1.5mm; }
.code { font-size: 13pt; font-weight: bold; letter-spacing: 1px; color: #1a1a2e; }
.shelf { font-size: 6.5pt; color: #666; margin-top: 0.5mm; }
.inv-section { flex: 1; overflow: hidden; }
.inv-title { font-size: 5.5pt; color: #999; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 1mm; }
.inv-row { margin-bottom: 1.5mm; padding-bottom: 1.5mm; border-bottom: 0.3pt solid #eee; }
.inv-row:last-child { border-bottom: none; margin-bottom: 0; }
.inv-name { font-size: 6.5pt; font-weight: 600; color: #222; line-height: 1.3; }
.inv-meta { font-size: 5.5pt; color: #888; margin-top: 0.3mm; }
.no-inv { font-size: 6.5pt; color: #bbb; text-align: center; padding: 3mm 0; }
</style></head>
<body><div class="label-wrap">
  <div class="qr-section"><img src="${qrCodeUrl.value}" /></div>
  <div class="code-section"><div class="code">${location.value?.code || ''}</div><div class="shelf">${location.value?.shelf_code || ''}</div></div>
  <div class="inv-section">${invRows ? '<div class="inv-title">库存货物</div>' + invRows : '<div class="no-inv">暂无库存</div>'}</div>
</div>
<script>window.onload = function(){ window.print(); }<\/script>
</body></html>`)
  win.document.close()
}

onMounted(loadData)
</script>

<style scoped>
.location-detail{animation:fadeIn .3s ease}
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.page-header{display:flex;align-items:center;gap:16px;margin-bottom:20px}
.header-center{flex:1}
.page-title{font-size:22px;font-weight:700;color:#1a1a2e;margin:0 0 2px}
.page-subtitle{color:#909399;font-size:13px}
.header-actions{display:flex;gap:10px}
.card-header{display:flex;align-items:center;justify-content:space-between}
.product-cell{display:flex;align-items:center;gap:10px}
.product-thumb{width:40px;height:40px;object-fit:cover;border-radius:6px;flex-shrink:0}
.product-title{font-size:13px;font-weight:600;color:#303133}
.product-variant{font-size:12px;color:#606266}
.product-sku{font-size:11px;color:#909399}
.qty-control{display:flex;align-items:center;gap:4px}
.qty-value{font-size:16px;font-weight:700;color:#303133;min-width:32px;text-align:center}
.exhibition-tag{font-size:12px;color:#E6A23C}
.no-link{color:#c0c4cc}
.date-text{font-size:12px;color:#909399}
.qr-card{text-align:center}
.qr-wrapper{display:flex;justify-content:center;padding:16px 0 8px}
.qr-image{width:160px;height:160px}
.qr-loading{width:160px;height:160px;display:flex;align-items:center;justify-content:center;font-size:32px;color:#c0c4cc}
.qr-code-text{font-size:18px;font-weight:700;color:#1a1a2e;margin-bottom:4px}
.qr-hint{font-size:12px;color:#909399}
.threshold-body{padding:4px 0}
.threshold-hint{font-size:12px;color:#909399;margin:0 0 12px}
.threshold-row{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.threshold-unit{font-size:13px;color:#606266}
.threshold-current{font-size:13px;color:#606266}
.text-warn{color:#E6A23C}
.transfer-card{border:1px solid #b3e19d}
.transfer-hint{font-size:12px;color:#67C23A;margin:0 0 12px}
.transfer-item{border:1px solid #f0f0f0;border-radius:8px;padding:10px;margin-bottom:10px}
.transfer-item:last-child{margin-bottom:0}
.transfer-item-info{margin-bottom:8px}
.transfer-sku-name{font-size:13px;font-weight:600;color:#303133}
.transfer-sku-sub{font-size:12px;color:#606266;margin-top:2px}
.transfer-sku-from{font-size:11px;color:#909399;margin-top:2px}
.transfer-item-action{display:flex;align-items:center;gap:8px}
.log-list{display:flex;flex-direction:column;gap:8px;max-height:300px;overflow-y:auto}
.log-item{padding:8px;border-radius:6px;background:#f9f9f9}
.log-action{font-size:11px;font-weight:600;margin-bottom:2px}
.log-action.add{color:#67C23A}
.log-action.remove{color:#F56C6C}
.log-action.pick{color:#409EFF}
.log-action.adjust{color:#E6A23C}
.log-action.transfer{color:#67C23A}
.log-detail{font-size:12px;color:#606266}
.log-time{font-size:11px;color:#c0c4cc;margin-top:2px}
.selected-product{display:flex;align-items:center;gap:12px;padding:12px;background:#f5f7ff;border-radius:8px;margin-bottom:16px}
.selected-thumb{width:48px;height:48px;object-fit:cover;border-radius:6px}
.selected-name{font-size:14px;font-weight:600;color:#303133}
.selected-variant{font-size:12px;color:#606266}
.selected-sku{font-size:11px;color:#909399}
</style>
