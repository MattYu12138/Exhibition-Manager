<template>
  <div class="location-detail">
    <div class="page-header">
      <el-button text @click="$router.back()"><el-icon><ArrowLeft /></el-icon> {{ $t('common.back') }}</el-button>
      <div class="header-center" v-if="location">
        <h1 class="page-title">📍 {{ $t('locationDetail.location', { code: location.code }) }}</h1>
        <p class="page-subtitle">{{ $t('locationDetail.coordinates', { shelf: location.shelf_code, row: location.row_label, column: location.col_label }) }}</p>
      </div>
      <div class="header-actions">
        <el-button @click="printQrCode"><el-icon><Printer /></el-icon> {{ $t('locationDetail.printQr') }}</el-button>
        <el-button type="primary" @click="showAddDialog = true"><el-icon><Plus /></el-icon> {{ $t('locationDetail.addGoods') }}</el-button>
      </div>
    </div>

    <div v-loading="loading" class="detail-body">
      <el-row :gutter="20">
        <el-col :span="16">
          <el-alert v-if="stockAlert === 'empty'" :title="`⚠️ ${$t('locationDetail.displayEmpty')}`" type="error"
            :description="transferAvailable.length > 0 ? $t('locationDetail.transferAvailable', { count: transferAvailable.length }) : $t('locationDetail.replenishViaInbound')"
            show-icon :closable="false" style="margin-bottom:16px" />
          <el-alert v-else-if="stockAlert === 'low'"
            :title="`⚠️ ${$t('locationDetail.lowStock', { count: totalQty, threshold: location?.low_stock_threshold || 10 })}`"
            type="warning" show-icon :closable="false" style="margin-bottom:16px" />

          <el-card>
            <template #header>
              <div class="card-header">
                <span>{{ $t('locationDetail.currentInventory') }}</span>
                <el-tag :type="stockAlert === 'ok' ? 'success' : stockAlert === 'low' ? 'warning' : 'danger'">{{ $t('common.pieces', { count: totalQty }) }}</el-tag>
              </div>
            </template>
            <el-table :data="currentInventory" size="default">
              <el-table-column :label="$t('common.product')" min-width="200">
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
              <el-table-column :label="$t('common.type')" width="110">
                <template #default="{ row }">
                  <el-tag size="small" :type="row.stock_type === 'exhibition' ? 'warning' : row.stock_type === 'retail_storage' ? 'info' : 'primary'">
                    {{ stockTypeLabel(row.stock_type) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column :label="$t('common.quantity')" width="120">
                <template #default="{ row }">
                  <div class="qty-control">
                    <el-button text size="small" @click="adjustQty(row, -1)" :disabled="row.quantity <= 0 || adjustingInventoryIds.has(row.id)"><el-icon><Minus /></el-icon></el-button>
                    <span class="qty-value">{{ row.quantity }}</span>
                    <el-button text size="small" @click="adjustQty(row, 1)" :disabled="adjustingInventoryIds.has(row.id)"><el-icon><Plus /></el-icon></el-button>
                  </div>
                </template>
              </el-table-column>
              <el-table-column :label="$t('locationDetail.linkedExhibition')" min-width="120">
                <template #default="{ row }">
                  <span v-if="row.exhibition_name" class="exhibition-tag">{{ row.exhibition_name }}</span>
                  <span v-else class="no-link">—</span>
                </template>
              </el-table-column>
              <el-table-column :label="$t('locationDetail.receivedAt')" width="110">
                <template #default="{ row }"><span class="date-text">{{ formatDate(row.created_at) }}</span></template>
              </el-table-column>
              <el-table-column :label="$t('locationDetail.actions')" width="170">
                <template #default="{ row }">
                  <el-button
                    v-if="row.quantity > 0 && authStore.canWrite"
                    text
                    type="danger"
                    size="small"
                    :loading="removingInventoryIds.has(row.id)"
                    :disabled="removingInventoryIds.has(row.id)"
                    @click="removeInventoryStock(row)"
                  >
                    {{ $t('locationDetail.removeStock') }}
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
            <el-empty v-if="!loading && currentInventory.length === 0" :description="$t('common.noInventory')" :image-size="60" />

            <el-collapse v-if="zeroStockRecords.length > 0" class="zero-stock-records">
              <el-collapse-item name="zero-stock-records">
                <template #title>
                  <span>{{ $t('locationDetail.zeroStockRecords', { count: zeroStockRecords.length }) }}</span>
                </template>
                <p class="zero-stock-hint">{{ $t('locationDetail.zeroStockRecordsHint') }}</p>
                <el-table :data="zeroStockRecords" size="small">
                  <el-table-column :label="$t('common.product')" min-width="180">
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
                  <el-table-column :label="$t('common.type')" width="120">
                    <template #default="{ row }">
                      <el-tag size="small" :type="row.stock_type === 'exhibition' ? 'warning' : row.stock_type === 'retail_storage' ? 'info' : 'primary'">
                        {{ stockTypeLabel(row.stock_type) }}
                      </el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column :label="$t('locationDetail.actions')" width="170">
                    <template #default="{ row }">
                      <el-button
                        v-if="!row.movement_count"
                        text
                        type="danger"
                        size="small"
                        :title="$t('locationDetail.deleteEmptyDraft')"
                        @click="deleteInventory(row)"
                      >
                        {{ $t('locationDetail.deleteEmptyDraft') }}
                      </el-button>
                      <span v-else class="history-preserved">{{ $t('locationDetail.historyPreserved') }}</span>
                    </template>
                  </el-table-column>
                </el-table>
              </el-collapse-item>
            </el-collapse>
          </el-card>
        </el-col>

        <el-col :span="8">
          <el-card class="qr-card">
            <template #header><span>{{ $t('locationDetail.qrCode') }}</span></template>
            <div class="qr-wrapper">
              <img v-if="qrCodeUrl" :src="qrCodeUrl" class="qr-image" />
              <div v-else class="qr-loading"><el-icon class="is-loading"><Loading /></el-icon></div>
            </div>
            <div class="qr-code-text">{{ location?.code }}</div>
            <div class="qr-hint">{{ $t('locationDetail.qrHint') }}</div>
            <el-button style="width:100%;margin-top:12px" @click="printQrCode"><el-icon><Printer /></el-icon> {{ $t('locationDetail.printQr') }}</el-button>
          </el-card>

          <el-card style="margin-top:16px">
            <template #header>
              <div class="card-header">
                <span>⚙️ {{ $t('locationDetail.warningThreshold') }}</span>
                <el-tag size="small" :type="stockAlert === 'ok' ? 'success' : stockAlert === 'low' ? 'warning' : 'danger'">
                  {{ stockAlert === 'ok' ? $t('locationDetail.normal') : stockAlert === 'low' ? $t('locationDetail.low') : $t('locations.emptyLocations') }}
                </el-tag>
              </div>
            </template>
            <div class="threshold-body">
              <p class="threshold-hint">{{ $t('locationDetail.thresholdHint') }}</p>
              <div class="threshold-row">
                <el-input-number v-model="thresholdInput" :min="0" :max="9999" style="width:120px" @change="thresholdDirty = true" />
                <span class="threshold-unit">{{ $t('common.piece') }}</span>
                <el-button type="primary" size="small" :disabled="!thresholdDirty" :loading="thresholdSaving" @click="saveThreshold">{{ $t('common.save') }}</el-button>
              </div>
              <div class="threshold-current">{{ $t('locationDetail.currentStock') }} <strong :class="stockAlert !== 'ok' ? 'text-warn' : ''">{{ $t('common.pieces', { count: totalQty }) }}</strong></div>
            </div>
          </el-card>

          <el-card v-if="transferAvailable.length > 0" style="margin-top:16px" class="transfer-card">
            <template #header>
              <div class="card-header">
                <span>🔄 {{ $t('locationDetail.transferTitle') }}</span>
                <el-tag type="success" size="small">{{ $t('locationDetail.transferReady') }}</el-tag>
              </div>
            </template>
            <p class="transfer-hint">{{ $t('locationDetail.transferHint') }}</p>
            <div v-for="item in transferAvailable" :key="item.shopify_variant_id" class="transfer-item">
              <div class="transfer-item-info">
                <div class="transfer-sku-name">{{ item.product_title }}</div>
                <div class="transfer-sku-sub">{{ item.variant_title }} · {{ $t('locationDetail.storageQty', { count: item.storage_qty }) }}</div>
                <div class="transfer-sku-from">{{ $t('locationDetail.fromLocation', { code: item.from_location_code }) }}</div>
              </div>
              <div class="transfer-item-action">
                <el-input-number v-model="item.transfer_qty" :min="1" :max="item.storage_qty" size="small" style="width:100px" />
                <el-button type="success" size="small" :loading="item.transferring" @click="doTransfer(item)">{{ $t('locationDetail.transfer') }}</el-button>
              </div>
            </div>
          </el-card>

          <el-card style="margin-top:16px">
            <template #header><span>{{ $t('locationDetail.activityLog') }}</span></template>
            <div class="log-list">
              <div v-for="log in logs" :key="log.id" class="log-item">
                <div class="log-action" :class="log.movement_type">{{ logLabel(log) }}</div>
                <div class="log-detail">{{ log.product_title }} · {{ log.quantity_delta > 0 ? '+' : '' }}{{ log.quantity_delta }}</div>
                <div class="log-time">{{ formatDate(log.operated_at) }}</div>
              </div>
              <el-empty v-if="logs.length === 0" :description="$t('locationDetail.noLogs')" :image-size="40" />
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <el-dialog v-model="showAddDialog" :title="$t('locationDetail.addGoods')" width="500px" :close-on-click-modal="false">
      <el-form :model="addForm" label-position="top">
        <el-form-item :label="$t('common.searchProduct')" required>
          <el-select v-model="addForm.shopify_variant_id" filterable remote :remote-method="searchProducts"
            :loading="searchLoading" :placeholder="$t('common.searchKeyword')" style="width:100%" @change="onVariantSelect">
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
            <el-form-item :label="$t('common.quantity')" required>
              <el-input-number v-model="addForm.quantity" :min="1" :max="9999" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="$t('locationDetail.stockType')" required>
              <el-select v-model="addForm.stock_type" style="width:100%">
                <el-option :label="$t('common.retailDisplay')" value="retail_display" />
                <el-option :label="$t('common.retailStorage')" value="retail_storage" />
                <el-option :label="$t('common.exhibition')" value="exhibition" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item v-if="addForm.stock_type === 'exhibition'" :label="$t('locationDetail.linkedExhibitionRequired')" required>
          <el-select v-model="addForm.exhibition_id" clearable :placeholder="$t('common.selectExhibition')" style="width:100%">
            <el-option v-for="ex in exhibitions" :key="ex.id" :label="ex.name" :value="ex.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('common.notes')">
          <el-input v-model="addForm.note" :placeholder="$t('locationDetail.notesPlaceholder')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="addLoading" @click="addInventory">{{ $t('locationDetail.confirmAdd') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { locationApi, productApi } from '@/api/index.js'
import { ArrowLeft, Plus, Minus, Printer, Loading } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { localizedError } from '@/i18n'
import { useWarehouseStore } from '@/stores/warehouse'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const warehouseStore = useWarehouseStore()
const authStore = useAuthStore()
const { t, locale } = useI18n()
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
const adjustingInventoryIds = ref(new Set())
const removingInventoryIds = ref(new Set())
const addForm = ref({ shopify_variant_id: null, quantity: 1, stock_type: 'retail_display', exhibition_id: null, note: '' })
const currentInventory = computed(() => inventory.value.filter(item => item.quantity > 0))
const zeroStockRecords = computed(() => inventory.value.filter(item => item.quantity === 0))
const totalQty = computed(() => currentInventory.value.reduce((s, i) => s + i.quantity, 0))
const stockAlert = computed(() => {
  if (!location.value) return 'ok'
  const threshold = location.value.low_stock_threshold ?? 10
  if (totalQty.value === 0) return 'empty'
  if (totalQty.value < threshold) return 'low'
  return 'ok'
})

function stockTypeLabel(t) {
  const labels = { retail_display: 'common.displayStock', retail_storage: 'common.storageStock', exhibition: 'common.exhibition', retail: 'common.retail' }
  return labels[t] ? useLabel(labels[t]) : t
}
function useLabel(key) { return t(key) }
function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(locale.value === 'en' ? 'en-AU' : 'zh-CN', { month: '2-digit', day: '2-digit' })
}
function logLabel(log) {
  const labels = {
    inbound: 'locationDetail.logAdd', outbound: log.reference_type === 'pick_task' ? 'locationDetail.logPick' : 'locationDetail.logRemove',
    adjustment: 'locationDetail.logAdjust', transfer: 'locationDetail.logTransfer',
  }
  return labels[log.movement_type] ? t(labels[log.movement_type]) : log.movement_type
}

async function loadData() {
  loading.value = true
  try {
    const locRes = await locationApi.get(locationId)
    location.value = locRes.data
    inventory.value = locRes.data.inventory || []
    logs.value = locRes.data.logs || []
    // QR and the optional Exhibition picker must not block the core stock list.
    const [qrResult, exResult] = await Promise.allSettled([
      locationApi.getQrCode(locationId), productApi.getExhibitions(),
    ])
    qrCodeUrl.value = qrResult.status === 'fulfilled' ? qrResult.value.data?.qr_data_url || '' : ''
    exhibitions.value = exResult.status === 'fulfilled' ? exResult.value.data || [] : []
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
    ElMessage.success(t('locationDetail.thresholdSaved'))
  } catch (err) {
    ElMessage.error(localizedError(err, t, 'common.saveFailed'))
  } finally {
    thresholdSaving.value = false
  }
}

async function doTransfer(item) {
  if (!item.transfer_qty || item.transfer_qty < 1) { ElMessage.warning(t('locationDetail.transferQtyRequired')); return }
  try {
    await ElMessageBox.confirm(
      t('locationDetail.transferConfirm', { from: item.from_location_code, count: item.transfer_qty, product: `${item.product_title} ${item.variant_title}` }),
      t('locationDetail.transferConfirmTitle'), { type: 'info', confirmButtonText: t('locationDetail.confirmTransfer'), cancelButtonText: t('common.cancel') }
    )
  } catch { return }
  item.transferring = true
  try {
    await locationApi.transfer(locationId, {
      shopify_variant_id: item.shopify_variant_id,
      quantity: item.transfer_qty,
      from_location_id: item.from_location_id,
      note: t('locationDetail.transferNote', { from: item.from_location_code, to: location.value?.code, count: item.transfer_qty }),
    })
    ElMessage.success(t('locationDetail.transferSuccess', { count: item.transfer_qty }))
    await loadData()
  } catch (err) {
    ElMessage.error(localizedError(err, t, 'locationDetail.transferFailed'))
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
  if (!addForm.value.shopify_variant_id) { ElMessage.warning(t('locationDetail.selectProduct')); return }
  if (addForm.value.stock_type === 'exhibition' && !addForm.value.exhibition_id) { ElMessage.warning(t('locationDetail.selectExhibition')); return }
  addLoading.value = true
  try {
    await locationApi.addInventory(locationId, addForm.value)
    ElMessage.success(t('locationDetail.addSuccess'))
    showAddDialog.value = false
    addForm.value = { shopify_variant_id: null, quantity: 1, stock_type: 'retail_display', exhibition_id: null, note: '' }
    selectedVariant.value = null
    await loadData()
  } catch (err) {
    ElMessage.error(localizedError(err, t, 'locationDetail.addFailed'))
  } finally { addLoading.value = false }
}

async function adjustQty(row, delta) {
  if (adjustingInventoryIds.value.has(row.id)) return
  adjustingInventoryIds.value.add(row.id)
  try {
    await locationApi.adjustInventory(locationId, row.id, { quantity: row.quantity + delta, expected_quantity: row.quantity })
    await loadData() // Keep zero-quantity records and their movement history visible.
  } catch (err) { ElMessage.error(localizedError(err, t)) }
  finally { adjustingInventoryIds.value.delete(row.id) }
}

function inventoryProductLabel(row) {
  return [row.product_title, row.variant_title].filter(Boolean).join(' · ') || row.sku || '—'
}

async function removeInventoryStock(row) {
  if (row.quantity <= 0 || removingInventoryIds.value.has(row.id)) return
  const expectedQuantity = row.quantity
  try {
    await ElMessageBox.confirm(
      t('locationDetail.removeStockConfirm', {
        product: inventoryProductLabel(row),
        count: expectedQuantity,
        stockType: stockTypeLabel(row.stock_type),
      }),
      t('locationDetail.removeStockTitle'),
      { type: 'warning', confirmButtonText: t('locationDetail.confirmRemoveStock'), cancelButtonText: t('common.cancel') }
    )
  } catch { return }

  removingInventoryIds.value.add(row.id)
  try {
    await locationApi.removeInventoryStock(locationId, row.id, { expected_quantity: expectedQuantity })
    ElMessage.success(t('locationDetail.removeStockSuccess', { count: expectedQuantity }))
    // The backend keeps the row and movement history at a zero quantity.
    await loadData()
  } catch (err) {
    ElMessage.error(localizedError(err, t, 'locationDetail.removeStockFailed'))
  } finally {
    removingInventoryIds.value.delete(row.id)
  }
}

async function deleteInventory(row) {
  if (row.quantity !== 0) return
  try {
    await ElMessageBox.confirm(t('locationDetail.deleteEmptyConfirm', { product: row.product_title }), t('locationDetail.deleteEmptyDraft'), { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') })
    await locationApi.deleteInventory(locationId, row.id)
    await loadData()
    ElMessage.success(t('locationDetail.deleted'))
  } catch (err) {
    if (err !== 'cancel' && err !== 'close') ElMessage.error(localizedError(err, t, 'common.deleteFailed'))
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}
function printQrCode() {
  if (!qrCodeUrl.value) return
  // 构建库存货物行 HTML
  const invRows = inventory.value.map(item => {
    const labels = { retail_display: 'locationDetail.printDisplay', retail_storage: 'locationDetail.printStorage', exhibition: 'common.exhibition' }
    const typeLabel = labels[item.stock_type] ? t(labels[item.stock_type]) : item.stock_type
    const name = [item.product_title, item.variant_title].filter(Boolean).join(' · ')
    return `<div class="inv-row"><div class="inv-name">${escapeHtml(name)}</div><div class="inv-meta">SKU: ${escapeHtml(item.sku || '—')} &nbsp;|&nbsp; ${escapeHtml(typeLabel)} × ${escapeHtml(item.quantity)}</div></div>`
  }).join('')
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(`<!DOCTYPE html><html lang="${locale.value === 'en' ? 'en' : 'zh-CN'}"><head><meta charset="UTF-8"><title>${escapeHtml(t('locationDetail.printTitle', { code: location.value?.code || '' }))}</title>
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
  <div class="qr-section"><img src="${escapeHtml(qrCodeUrl.value)}" /></div>
  <div class="code-section"><div class="code">${escapeHtml(location.value?.code || '')}</div><div class="shelf">${escapeHtml(location.value?.shelf_code || '')}</div></div>
  <div class="inv-section">${invRows ? `<div class="inv-title">${escapeHtml(t('locationDetail.printInventory'))}</div>` + invRows : `<div class="no-inv">${escapeHtml(t('locationDetail.printEmpty'))}</div>`}</div>
</div>
<script>window.onload = function(){ window.print(); }<\/script>
</body></html>`)
  win.document.close()
}

watch(() => warehouseStore.selectedLayoutId, (id, oldId) => {
  if (String(id) !== String(oldId)) router.replace('/locations')
})
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
.zero-stock-records{margin-top:16px}
.zero-stock-hint{font-size:12px;color:#909399;margin:0 0 12px}
.history-preserved{font-size:12px;color:#909399}
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
.log-action.inbound{color:#67C23A}
.log-action.outbound{color:#F56C6C}
.log-action.adjustment{color:#E6A23C}
.log-action.transfer{color:#67C23A}
.log-detail{font-size:12px;color:#606266}
.log-time{font-size:11px;color:#c0c4cc;margin-top:2px}
.selected-product{display:flex;align-items:center;gap:12px;padding:12px;background:#f5f7ff;border-radius:8px;margin-bottom:16px}
.selected-thumb{width:48px;height:48px;object-fit:cover;border-radius:6px}
.selected-name{font-size:14px;font-weight:600;color:#303133}
.selected-variant{font-size:12px;color:#606266}
.selected-sku{font-size:11px;color:#909399}
</style>
