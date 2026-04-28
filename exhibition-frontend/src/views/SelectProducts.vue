<template>
  <div class="select-page">
    <div class="page-header">
      <el-button text @click="$router.back()"><el-icon><ArrowLeft /></el-icon> {{ $t('common.back') }}</el-button>
      <div>
        <h1 class="page-title">{{ $t('selectProducts.pageTitle') }}</h1>
        <p class="page-desc">{{ $t('selectProducts.pageDesc') }}</p>
      </div>
    </div>

    <el-row :gutter="20">
      <el-col :xs="24" :lg="14">
        <el-card>
          <template #header>
            <div class="card-header">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <span style="font-weight: 600">{{ $t('selectProducts.shopifyLib') }}（{{ store.shopifyProducts.length }} 个）</span>
                <el-tag v-if="syncStatus === 'syncing'" type="info" size="small" effect="plain">⟳ 同步中...</el-tag>
                <el-tag v-else-if="syncStatus === 'done'" type="success" size="small" effect="plain">✓ 已同步</el-tag>
                <el-tag v-else-if="syncStatus === 'error'" type="danger" size="small" effect="plain">同步失败</el-tag>
                <el-button
                  size="small"
                  :loading="syncStatus === 'syncing'"
                  :disabled="syncStatus === 'syncing' || manualCooldown > 0"
                  @click="syncShopifyProducts(true)"
                  style="margin-left:4px"
                >{{ manualCooldown > 0 ? `${manualCooldown}s` : $t('selectProducts.refreshProducts') }}</el-button>
              </div>
              <el-input
                v-model="searchQuery"
                :placeholder="$t('selectProducts.searchPlaceholder')"
                clearable
                style="width: 200px"
                @input="handleSearch"
              >
                <template #prefix><el-icon><Search /></el-icon></template>
              </el-input>
            </div>
            <!-- 商品状态筛选按钮 -->
            <div class="status-filter">
              <el-button
                v-for="tab in statusTabs"
                :key="tab.value"
                :type="activeStatus === tab.value ? 'primary' : 'default'"
                size="small"
                :class="{ 'status-btn-active': activeStatus === tab.value }"
                @click="switchStatus(tab.value)"
              >{{ tab.label }}</el-button>
            </div>
          </template>

          <div v-loading="listLoading">
            <el-empty
              v-if="!store.shopifyProducts.length && !store.productLoading"
              :description="$t('selectProducts.noProducts')"
            >
              <el-button type="primary" @click="loadProducts">{{ $t('selectProducts.reload') }}</el-button>
            </el-empty>

            <div v-else class="product-list">
              <div
                v-for="product in pagedProducts"
                :key="product.id"
                class="product-item"
              >
                <div class="product-header" @click="toggleProduct(product.id)">
                  <div class="product-info">
                    <img
                      v-if="product.main_image && !imgError[product.id]"
                      :src="product.main_image"
                      class="product-thumb"
                      @error="imgError[product.id] = true"
                    />
                    <div v-else class="product-placeholder"><el-icon><Picture /></el-icon></div>
                    <div class="product-text">
                      <div class="product-name">{{ product.title }}</div>
                      <div class="product-meta">{{ product.variants ? product.variants.length : 0 }} {{ $t('selectProducts.variantCount', { n: '' }).replace('{n} ', '') }}</div>
                    </div>
                  </div>
                  <div class="product-actions">
                    <el-button
                      size="small"
                      type="primary"
                      plain
                      @click.stop="selectAllVariants(product)"
                    >{{ $t('selectProducts.selectAll') }}</el-button>
                    <el-icon
                      class="expand-icon"
                      :class="{ expanded: isExpanded(product.id) }"
                    ><ArrowDown /></el-icon>
                  </div>
                </div>

                <div v-show="isExpanded(product.id)" class="variant-list">
                  <div
                    v-for="variant in product.variants"
                    :key="variant.id"
                    class="variant-item"
                    :class="{ selected: isSelected(product.id, variant.id) }"
                  >
                    <el-checkbox
                      :model-value="isSelected(product.id, variant.id)"
                      @change="(v) => toggleVariant(product, variant, v)"
                    />
                    <div class="variant-info">
                      <span class="variant-title">{{ variant.title }}</span>
                      <span class="variant-sku" v-if="variant.sku">SKU: {{ variant.sku }}</span>
                      <span class="variant-gtin" v-if="variant.gtin">GTIN: {{ variant.gtin }}</span>
                      <span class="variant-stock">{{ $t('selectProducts.stockLabel') }}: {{ variant.inventory_quantity ?? '-' }}</span>
                    </div>

                    <div class="variant-qty" v-if="isSelected(product.id, variant.id)" @click.stop>
                      <div class="qty-group">
                        <div class="qty-field">
                          <div class="qty-field-label">{{ $t('selectProducts.rack') }}</div>
                          <el-input-number
                            v-model="getSelection(product.id, variant.id).rack_quantity"
                            :min="0"
                            :max="9999"
                            size="small"
                            style="width: 90px"
                            @change="onQtyChange(product.id, variant.id)"
                          />
                        </div>
                        <div class="qty-field">
                          <div class="qty-field-label">{{ $t('selectProducts.storage') }}</div>
                          <el-input-number
                            v-model="getSelection(product.id, variant.id).stock_quantity"
                            :min="0"
                            :max="9999"
                            size="small"
                            style="width: 90px"
                            @change="onQtyChange(product.id, variant.id)"
                          />
                        </div>
                        <div class="qty-field qty-total">
                          <div class="qty-field-label">{{ $t('selectProducts.totalLabel') }}</div>
                          <div class="qty-total-value">
                            {{ (getSelection(product.id, variant.id).rack_quantity || 0) + (getSelection(product.id, variant.id).stock_quantity || 0) }}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="pagination-wrap" v-if="filteredProducts.length > pageSize">
              <el-pagination
                v-model:current-page="currentPage"
                :page-size="pageSize"
                :total="filteredProducts.length"
                layout="prev, pager, next, jumper"
                background
                small
                @current-change="handlePageChange"
              />
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :lg="10">
        <el-card class="selection-card" :body-style="{ padding: '0' }">
          <template #header>
            <div class="card-header">
              <span style="font-weight: 600">{{ $t('selectProducts.selected') }} ({{ totalSelected }})</span>
              <el-button
                v-if="selectionList.length > 0"
                size="small"
                type="danger"
                plain
                @click="clearAll"
              >{{ $t('selectProducts.clearBtn') }}</el-button>
            </div>
          </template>

          <el-empty v-if="!selectionList.length" :description="$t('selectProducts.noProducts')" style="padding: 40px 0" />

          <div v-else class="selection-list">
            <div
              v-for="sel in selectionList"
              :key="sel.key"
              class="selection-item"
            >
              <div class="sel-info">
                <div class="sel-title">{{ sel.product_title }}</div>
                <div class="sel-variant">{{ sel.variant_title }}</div>
                <div class="sel-meta">
                  <span v-if="sel.sku">SKU: {{ sel.sku }}</span>
                  <span v-if="sel.gtin">GTIN: {{ sel.gtin }}</span>
                </div>
              </div>
              <div class="sel-right">
                <div class="sel-qty-summary">
                  <span class="sel-qty-item">{{ $t('selectProducts.summaryRack') }}: {{ sel.rack_quantity }}</span>
                  <span class="sel-qty-item">{{ $t('selectProducts.summaryStorage') }}: {{ sel.stock_quantity }}</span>
                  <el-tag type="primary" size="small">{{ $t('selectProducts.summaryTotal') }} {{ sel.rack_quantity + sel.stock_quantity }}</el-tag>
                </div>
                <el-icon class="sel-remove" @click="removeSelection(sel.key)"><Close /></el-icon>
              </div>
            </div>
          </div>

          <div class="selection-footer">
            <div class="total-info">
              {{ $t('selectProducts.selected') }} {{ totalSelected }} · {{ $t('selectProducts.totalQty', { n: totalQuantity }) }}
            </div>
            <el-button
              type="primary"
              size="large"
              :disabled="!selectionList.length"
              :loading="saving"
              @click="saveToExhibition"
              style="width: 100%"
            >
              {{ $t('selectProducts.saveBtn') }}
            </el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useExhibitionStore } from '@/stores/exhibition'
import { exhibitionApi, shopifyApi } from '@/api'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const store = useExhibitionStore()
const id = route.params.id

const searchQuery = ref('')
const expandedMap = ref({})
const selectionsMap = ref({})
const saving = ref(false)
const originalSnapshot = ref({})
const imgError = reactive({})

const currentPage = ref(1)
const pageSize = 20
const syncStatus = ref('idle')
const AUTO_SYNC_COOLDOWN_MS = 10 * 60 * 1000 // 10 minutes for auto-sync
const MANUAL_COOLDOWN_SEC = 30 // 30 seconds for manual refresh
const lastSyncTime = ref(0)
const manualCooldown = ref(0) // seconds remaining for manual button cooldown
let autoCooldownTimer = null
let manualCooldownTimer = null

// 商品状态筛选
const activeStatus = ref('active')
const statusTabs = computed(() => [
  { value: 'active', label: t('selectProducts.statusActive') },
  { value: 'draft', label: t('selectProducts.statusDraft') },
  { value: 'archived', label: t('selectProducts.statusArchived') },
  { value: 'unlisted', label: t('selectProducts.statusUnlisted') },
])

const selectionList = computed(() => Object.values(selectionsMap.value))
const totalSelected = computed(() => selectionList.value.length)
const totalQuantity = computed(() =>
  selectionList.value.reduce((sum, s) => sum + (s.rack_quantity || 0) + (s.stock_quantity || 0), 0)
)

const filteredProducts = computed(() => {
  const raw = searchQuery.value.trim().toLowerCase()
  if (!raw) return store.shopifyProducts
  const keywords = raw.split(/\s+/).filter(Boolean)
  return store.shopifyProducts.filter((p) => {
    const titleLower = p.title.toLowerCase()
    const variantTexts = (p.variants || []).map(
      (v) => `${v.sku || ''} ${v.gtin || ''} ${v.title || ''}`.toLowerCase()
    ).join(' ')
    const searchTarget = `${titleLower} ${variantTexts}`
    return keywords.every((kw) => searchTarget.includes(kw))
  })
})

const pagedProducts = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filteredProducts.value.slice(start, start + pageSize)
})

const listLoading = computed(() => store.productLoading && !store.shopifyProducts.length)

function isExpanded(productId) {
  return !!expandedMap.value[productId]
}

function toggleProduct(productId) {
  expandedMap.value = {
    ...expandedMap.value,
    [productId]: !expandedMap.value[productId],
  }
}

function isSelected(productId, variantId) {
  return !!selectionsMap.value[`${productId}-${variantId}`]
}

function getSelection(productId, variantId) {
  return selectionsMap.value[`${productId}-${variantId}`]
}

function onQtyChange(productId, variantId) {
  const sel = selectionsMap.value[`${productId}-${variantId}`]
  if (sel) {
    sel.quantity = (sel.rack_quantity || 0) + (sel.stock_quantity || 0)
  }
}

function toggleVariant(product, variant, checked) {
  const key = `${product.id}-${variant.id}`
  if (checked) {
    selectionsMap.value = {
      ...selectionsMap.value,
      [key]: {
        key,
        product_id: product.id,
        product_title: product.title,
        variant_id: variant.id,
        variant_title: variant.title,
        sku: variant.sku,
        gtin: variant.gtin,
        image_url: variant.image_url || product.main_image,
        rack_quantity: 5,
        stock_quantity: 5,
        quantity: 10,
      },
    }
  } else {
    const next = { ...selectionsMap.value }
    delete next[key]
    selectionsMap.value = next
  }
}

function selectAllVariants(product) {
  const additions = {}
  for (const variant of product.variants) {
    const key = `${product.id}-${variant.id}`
    if (!selectionsMap.value[key]) {
      additions[key] = {
        key,
        product_id: product.id,
        product_title: product.title,
        variant_id: variant.id,
        variant_title: variant.title,
        sku: variant.sku,
        gtin: variant.gtin,
        image_url: variant.image_url || product.main_image,
        rack_quantity: 5,
        stock_quantity: 5,
        quantity: 10,
      }
    }
  }
  selectionsMap.value = { ...selectionsMap.value, ...additions }
  expandedMap.value = { ...expandedMap.value, [product.id]: true }
}

function removeSelection(key) {
  const next = { ...selectionsMap.value }
  delete next[key]
  selectionsMap.value = next
}

async function clearAll() {
  try {
    await ElMessageBox.confirm(
      t('selectProducts.clearConfirmMsg'),
      t('selectProducts.clearConfirmTitle'),
      {
        confirmButtonText: t('selectProducts.clearConfirmOk'),
        cancelButtonText: t('selectProducts.clearConfirmCancel'),
        type: 'warning',
      }
    )
    await exhibitionApi.clearItems(id)
    selectionsMap.value = {}
    originalSnapshot.value = {}
  } catch (err) {
    if (err && err.message) {
      ElMessage.error(err.message)
    }
  }
}

function handleSearch() {
  currentPage.value = 1
  expandAll()
}

function expandAll() {
  const map = {}
  pagedProducts.value.forEach((p) => { map[p.id] = true })
  expandedMap.value = map
}

function handlePageChange() {
  expandAll()
}

async function switchStatus(status) {
  if (activeStatus.value === status) return
  activeStatus.value = status
  searchQuery.value = ''
  currentPage.value = 1
  await store.loadShopifyProductsByStatus(status)
  expandAll()
}

async function loadProducts() {
  const [, ] = await Promise.all([
    store.loadShopifyProductsByStatus(activeStatus.value),
    store.loadExhibition(id),
  ])

  const snapshot = {}
  const preselected = {}
  const existingItems = store.currentExhibition?.items || []
  for (const item of existingItems) {
    const variantId = String(item.shopify_variant_id)
    const productId = String(item.shopify_product_id)
    const rackQty = item.rack_quantity !== undefined && item.rack_quantity !== null ? item.rack_quantity : 5
    const stockQty = item.stock_quantity !== undefined && item.stock_quantity !== null ? item.stock_quantity : 5
    snapshot[variantId] = {
      db_id: item.id,
      rack_quantity: rackQty,
      stock_quantity: stockQty,
      planned_quantity: item.planned_quantity,
    }
    const key = `${productId}-${variantId}`
    preselected[key] = {
      key,
      product_id: productId,
      // Product info comes from exhibition_items_view (JOIN product_variants)
      product_title: item.product_title,
      variant_id: variantId,
      variant_title: item.variant_title,
      sku: item.sku,
      gtin: item.gtin,
      image_url: item.image_url,
      rack_quantity: rackQty,
      stock_quantity: stockQty,
      quantity: rackQty + stockQty,
    }
  }
  originalSnapshot.value = snapshot
  selectionsMap.value = preselected

  expandAll()
}

async function saveToExhibition() {
  saving.value = true
  try {
    const deltaItems = []
    const snapshot = originalSnapshot.value

    for (const sel of selectionList.value) {
      const variantId = String(sel.variant_id)
      const rackQty = sel.rack_quantity || 0
      const stockQty = sel.stock_quantity || 0
      const totalQty = rackQty + stockQty

      if (!snapshot[variantId]) {
        // action='add': only send IDs and quantities; product info resolved via VIEW on backend
        deltaItems.push({
          action: 'add',
          shopify_product_id: sel.product_id,
          shopify_variant_id: variantId,
          rack_quantity: rackQty,
          stock_quantity: stockQty,
          planned_quantity: totalQty,
        })
      } else {
        const snap = snapshot[variantId]
        if (rackQty !== snap.rack_quantity || stockQty !== snap.stock_quantity) {
          // action='update': only send IDs and quantities
          deltaItems.push({
            action: 'update',
            shopify_product_id: sel.product_id,
            shopify_variant_id: variantId,
            rack_quantity: rackQty,
            stock_quantity: stockQty,
            planned_quantity: totalQty,
          })
        }
      }
    }

    const currentVariantIds = new Set(
      selectionList.value.map((s) => String(s.variant_id))
    )
    for (const variantId of Object.keys(snapshot)) {
      if (!currentVariantIds.has(variantId)) {
        deltaItems.push({
          action: 'remove',
          shopify_variant_id: variantId,
        })
      }
    }

    if (!deltaItems.length) {
      ElMessage.info(t('selectProducts.noChange'))
      router.push(`/exhibitions/${id}`)
      return
    }

    const addCount = deltaItems.filter((i) => i.action === 'add').length
    const updateCount = deltaItems.filter((i) => i.action === 'update').length
    const removeCount = deltaItems.filter((i) => i.action === 'remove').length

    await store.addItemsToExhibition(id, deltaItems)

    const parts = []
    if (addCount) parts.push(`新增 ${addCount} 个`)
    if (updateCount) parts.push(`更新 ${updateCount} 个`)
    if (removeCount) parts.push(`移除 ${removeCount} 个`)
    ElMessage.success(parts.join('、'))

    router.push(`/exhibitions/${id}`)
  } finally {
    saving.value = false
  }
}

function startManualCooldown() {
  if (manualCooldownTimer) clearInterval(manualCooldownTimer)
  manualCooldown.value = MANUAL_COOLDOWN_SEC
  manualCooldownTimer = setInterval(() => {
    manualCooldown.value -= 1
    if (manualCooldown.value <= 0) {
      clearInterval(manualCooldownTimer)
      manualCooldownTimer = null
      manualCooldown.value = 0
    }
  }, 1000)
}

async function syncShopifyProducts(manual = false) {
  if (syncStatus.value === 'syncing') return
  // Auto-sync: skip if within 10-minute cooldown
  if (!manual && lastSyncTime.value && (Date.now() - lastSyncTime.value) < AUTO_SYNC_COOLDOWN_MS) {
    return
  }
  syncStatus.value = 'syncing'
  try {
    await shopifyApi.syncProducts()
    lastSyncTime.value = Date.now()
    syncStatus.value = 'done'
    await store.loadShopifyProductsByStatus(activeStatus.value)
    // Start 30s manual button cooldown after any sync
    startManualCooldown()
  } catch (e) {
    syncStatus.value = 'error'
    console.error('Shopify sync failed:', e)
  }
}

onMounted(() => {
  loadProducts()
  syncShopifyProducts()
})
</script>

<style scoped>
.page-header { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 24px; }
.page-title { font-size: 22px; font-weight: 700; }
.page-desc { font-size: 14px; color: #909399; margin-top: 4px; }
.card-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }

/* 状态筛选按钮行 */
.status-filter {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  flex-wrap: wrap;
}

.product-list { display: flex; flex-direction: column; gap: 8px; padding-right: 4px; }
.pagination-wrap { display: flex; justify-content: center; margin-top: 16px; padding-bottom: 4px; }
.product-item { border: 1px solid #ebeef5; border-radius: 10px; overflow: hidden; }
.product-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 14px; cursor: pointer; background: #fafafa;
  transition: background 0.15s; min-height: 56px;
}
.product-header:hover { background: #f0f2f5; }
.product-info { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; }
.product-text { flex: 1; min-width: 0; }
.product-thumb {
  width: 48px; height: 48px; border-radius: 8px; object-fit: cover; flex-shrink: 0;
}
.product-placeholder {
  width: 48px; height: 48px; border-radius: 8px; background: #f0f2f5;
  display: flex; align-items: center; justify-content: center; color: #c0c4cc; font-size: 20px;
  flex-shrink: 0;
}
.product-name { font-weight: 600; font-size: 14px; color: #303133; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.product-meta { font-size: 12px; color: #909399; margin-top: 2px; }
.product-actions { display: flex; align-items: center; gap: 10px; }
.expand-icon { transition: transform 0.2s; color: #909399; }
.expand-icon.expanded { transform: rotate(180deg); }

.variant-list { border-top: 1px solid #ebeef5; }
.variant-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; transition: background 0.15s; flex-wrap: wrap;
}
.variant-item:hover { background: #f9f9f9; }
.variant-item.selected { background: #ecf5ff; }
.variant-info { flex: 1; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; min-width: 0; }
.variant-title { font-size: 14px; font-weight: 500; color: #303133; }
.variant-sku, .variant-gtin, .variant-stock {
  font-size: 11px; color: #909399; background: #f5f7fa;
  padding: 2px 6px; border-radius: 4px;
}

.variant-qty { width: 100%; padding: 8px 0 4px 28px; }
.qty-group { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
.qty-field { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.qty-field-label { font-size: 11px; color: #909399; font-weight: 500; }
.qty-total { min-width: 56px; }
.qty-total-value {
  font-size: 20px; font-weight: 700; color: #409eff;
  background: #ecf5ff; border-radius: 8px;
  padding: 4px 12px; text-align: center; min-width: 56px;
  border: 1px solid #c6e2ff;
}

.selection-card { position: sticky; top: 80px; }
.selection-list { max-height: 55vh; overflow-y: auto; }
.selection-item {
  display: flex; justify-content: space-between; align-items: flex-start;
  padding: 12px 16px; border-bottom: 1px solid #f0f2f5;
}
.sel-info { flex: 1; }
.sel-title { font-weight: 600; font-size: 14px; color: #303133; }
.sel-variant { font-size: 12px; color: #606266; margin-top: 2px; }
.sel-meta { display: flex; gap: 6px; margin-top: 4px; }
.sel-meta span { font-size: 11px; color: #909399; }
.sel-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; margin-left: 8px; }
.sel-qty-summary { display: flex; align-items: center; gap: 6px; }
.sel-qty-item { font-size: 11px; color: #606266; }
.sel-remove { cursor: pointer; color: #c0c4cc; font-size: 16px; }
.sel-remove:hover { color: #f56c6c; }

.selection-footer { padding: 16px; border-top: 1px solid #ebeef5; }
.total-info { font-size: 13px; color: #606266; margin-bottom: 12px; }

/* 手机端响应式 */
@media (max-width: 768px) {
  .card-header {
    flex-direction: column;
    align-items: flex-start;
  }
  .card-header > .el-input {
    width: 100% !important;
  }
  .status-filter {
    width: 100%;
  }
}
</style>
