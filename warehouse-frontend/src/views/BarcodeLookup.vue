<template>
  <main class="barcode-page">
    <header class="page-heading">
      <div>
        <span class="eyebrow">{{ $t('barcodeLookup.breadcrumb') }}</span>
        <h1>{{ $t('barcodeLookup.title') }}</h1>
        <p>{{ $t('barcodeLookup.subtitle') }}</p>
      </div>
      <el-tag v-if="selectedWarehouse" effect="plain" class="warehouse-tag">
        {{ selectedWarehouse.name }} · #{{ String(selectedWarehouse.id).slice(-6) }}
      </el-tag>
    </header>

    <section class="search-card" :aria-label="$t('barcodeLookup.title')">
      <div class="search-icon" aria-hidden="true"><el-icon :size="27"><Search /></el-icon></div>
      <div class="search-content">
        <label for="warehouse-barcode">{{ $t('barcodeLookup.label') }}</label>
        <form class="search-form" @submit.prevent="lookup">
          <el-input id="warehouse-barcode" ref="barcodeInput" v-model="barcode" :placeholder="$t('barcodeLookup.placeholder')"
            inputmode="numeric" autocomplete="off" :maxlength="32" :disabled="loading"
            clearable size="large" class="barcode-input" />
          <el-button type="primary" size="large" native-type="submit" :loading="loading" :disabled="!selectedWarehouse">
            {{ $t('barcodeLookup.search') }}
          </el-button>
        </form>
        <span class="input-hint">{{ $t('barcodeLookup.hint') }}</span>
      </div>
    </section>

    <el-alert v-if="!selectedWarehouse" type="warning" :closable="false" show-icon
      :title="$t('barcodeLookup.chooseWarehouse')" class="result-alert" />
    <el-alert v-if="errorText" type="error" :closable="false" show-icon
      :title="errorText" class="result-alert" />

    <section v-if="hasSearched && !loading && !errorText && selectedWarehouse" class="results" aria-live="polite">
      <div class="results-heading">
        <h2>{{ $t('barcodeLookup.results') }}</h2>
        <span>{{ $t('barcodeLookup.resultCount', { count: matches.length }) }}</span>
      </div>
      <el-alert v-if="matches.length > 1" type="warning" :closable="false" show-icon
        :title="$t('barcodeLookup.duplicate', { count: matches.length })" class="result-alert" />
      <el-empty v-if="matches.length === 0" :description="$t('barcodeLookup.notFound')" />

      <article v-for="match in matches" :key="match.variant_id" class="product-card">
        <div class="product-image">
          <img v-if="match.image_url || match.main_image" :src="match.image_url || match.main_image"
            :alt="match.product_title" loading="lazy" />
          <el-icon v-else :size="33"><Goods /></el-icon>
        </div>
        <div class="product-detail">
          <div class="product-heading">
            <div>
              <h3>{{ match.product_title }}</h3>
              <p>{{ match.variant_title || '—' }}</p>
            </div>
            <el-tag :type="match.total_quantity > 0 ? 'success' : 'info'" effect="plain">
              {{ match.total_quantity > 0 ? $t('barcodeLookup.stockCount', { count: match.total_quantity }) : $t('barcodeLookup.noStock') }}
            </el-tag>
          </div>
          <div class="product-meta">
            <span>{{ $t('barcodeLookup.barcode') }} <strong>{{ match.barcode }}</strong></span>
            <span>{{ $t('common.sku') }} <strong>{{ match.sku || '—' }}</strong></span>
          </div>
          <template v-if="match.locations.length">
            <div class="location-heading">{{ $t('barcodeLookup.stockLocations') }}</div>
            <div class="stock-locations">
              <button v-for="stock in match.locations"
                :key="`${stock.location_id}:${stock.stock_type}:${stock.exhibition_id || ''}`"
                type="button" class="stock-location" @click="router.push(`/locations/${stock.location_id}`)">
                <span class="location-code">{{ stock.location_code }} <el-icon><ArrowRight /></el-icon></span>
                <span class="location-kind">{{ stockLabel(stock) }}</span>
                <strong>{{ stock.quantity }} {{ $t('common.piece') }}</strong>
              </button>
            </div>
          </template>
          <div v-else class="no-stock-note">{{ $t('barcodeLookup.catalogueOnly') }}</div>
          <section v-if="evidenceAccess" class="evidence-box" :aria-label="$t('barcodeLookup.tradeHeading')">
            <h4>{{ $t('barcodeLookup.tradeHeading') }}</h4>
            <p class="evidence-warning">{{ $t('barcodeLookup.tradeWarning') }}</p>
            <div v-if="match.trade_documents?.length" class="evidence-list">
              <div v-for="line in match.trade_documents" :key="`${line.invoice_ref}:${line.document_sku}`" class="evidence-row">
                <div class="evidence-row-title">
                  <strong>{{ line.document_title }} · {{ line.document_sku }}</strong>
                  <el-tag size="small" :type="line.relation === 'catalogue_sku_candidate' ? 'info' : 'warning'" effect="plain">
                    {{ $t(line.relation === 'catalogue_sku_candidate' ? 'barcodeLookup.exactSku' : 'barcodeLookup.barcodeCandidate') }}
                  </el-tag>
                </div>
                <span>{{ $t('barcodeLookup.docs', { po: line.po_ref, invoice: line.invoice_ref, bol: line.bol_ref || '—' }) }}</span>
                <span>{{ $t('barcodeLookup.documentQuantity', { qty: line.invoice_quantity }) }} · {{ line.supplier_name }} · {{ line.shipped_at }}</span>
              </div>
            </div>
            <p v-else class="evidence-empty">{{ $t('barcodeLookup.noTradeDocuments') }}</p>
            <p class="receipt-status">{{ $t('barcodeLookup.receiptMissing') }}</p>
          </section>
        </div>
      </article>
    </section>
  </main>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ArrowRight, Goods, Search } from '@element-plus/icons-vue'
import { productApi } from '@/api/index.js'
import { localizedError } from '@/i18n'
import { useWarehouseStore } from '@/stores/warehouse'

const router = useRouter()
const { t } = useI18n()
const warehouseStore = useWarehouseStore()
const selectedWarehouse = computed(() => warehouseStore.layouts.find(layout => layout.id === warehouseStore.selectedLayoutId))
const barcodeInput = ref(null)
const barcode = ref('')
const matches = ref([])
const evidenceAccess = ref(false)
const hasSearched = ref(false)
const errorText = ref('')
const loading = ref(false)
let requestSequence = 0

function stockLabel(stock) {
  const label = {
    retail: 'barcodeLookup.retail',
    retail_display: 'common.retailDisplay',
    retail_storage: 'common.retailStorage',
    exhibition: 'common.exhibition',
  }[stock.stock_type] || 'common.retail'
  return stock.exhibition_name ? `${t(label)} · ${stock.exhibition_name}` : t(label)
}

async function lookup() {
  const value = barcode.value.replace(/\s+/g, '')
  barcode.value = value
  if (!/^\d{8}$/.test(value)) {
    errorText.value = t('barcodeLookup.invalid')
    matches.value = []
    hasSearched.value = false
    return
  }
  if (!selectedWarehouse.value) {
    errorText.value = t('barcodeLookup.chooseWarehouse')
    return
  }
  const warehouseId = selectedWarehouse.value.id
  const sequence = ++requestSequence
  errorText.value = ''
  loading.value = true
  try {
    const result = await productApi.lookupBarcode(value)
    if (sequence !== requestSequence || warehouseStore.selectedLayoutId !== warehouseId) return
    if (result.data?.layout_id !== warehouseId || result.data?.barcode !== value) {
      throw new Error(t('barcodeLookup.warehouseChanged'))
    }
    matches.value = result.data.matches || []
    evidenceAccess.value = result.data.evidence_access === true
    hasSearched.value = true
    await nextTick()
    barcodeInput.value?.select?.()
  } catch (error) {
    if (sequence !== requestSequence) return
    errorText.value = localizedError(error, t, 'common.requestFailed')
    matches.value = []
    evidenceAccess.value = false
    hasSearched.value = false
  } finally {
    if (sequence === requestSequence) loading.value = false
  }
}

watch(() => warehouseStore.selectedLayoutId, () => {
  ++requestSequence
  matches.value = []
  evidenceAccess.value = false
  hasSearched.value = false
  errorText.value = ''
  loading.value = false
})
onMounted(() => barcodeInput.value?.focus?.())
</script>

<style scoped>
.barcode-page { max-width: 1020px; margin: 0 auto; padding: 18px 0 54px; }
.page-heading { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 26px; }
.eyebrow { color: #9a765c; font-size: 11px; font-weight: 700; letter-spacing: .14em; }
.page-heading h1 { margin: 6px 0 7px; font-size: clamp(24px, 3vw, 31px); line-height: 1.2; color: #25262b; }
.page-heading p { margin: 0; color: #696b70; line-height: 1.5; }
.warehouse-tag { margin-top: 8px; color: #785841; border-color: #e1cbb4; background: #faf3eb; }
.search-card { display: flex; gap: 18px; padding: 24px; border-radius: 17px; border: 1px solid #e9e1d8;
  background: linear-gradient(120deg, #faf5ee 0%, #fff 65%); box-shadow: 0 10px 35px rgba(56, 42, 28, .045); }
.search-icon { width: 50px; height: 50px; flex: 0 0 50px; border-radius: 14px; display: grid; place-items: center;
  background: #eee1d0; color: #725b47; }
.search-content { flex: 1; min-width: 0; }
.search-content label { display: block; font-size: 14px; font-weight: 650; margin-bottom: 10px; color: #3a332f; }
.search-form { display: flex; align-items: stretch; gap: 10px; }
.barcode-input { flex: 1; min-width: 0; }
.search-form :deep(.el-input__wrapper) { box-shadow: 0 0 0 1px #d7cabc inset; border-radius: 9px; }
.search-form :deep(.el-input__inner) { font-size: 18px; letter-spacing: .075em; font-variant-numeric: tabular-nums; }
.search-form :deep(.el-button--primary) { background: #273d59; border-color: #273d59; padding: 0 25px; }
.input-hint { display: block; margin-top: 10px; color: #88817c; font-size: 12px; }
.result-alert { margin-top: 16px; }
.results { margin-top: 28px; }
.results-heading { display: flex; align-items: baseline; gap: 12px; margin-bottom: 4px; }
.results-heading h2 { font-size: 19px; margin: 0; }
.results-heading span { color: #999; font-size: 13px; }
.product-card { display: flex; gap: 18px; background: #fff; border: 1px solid #ece6df; padding: 18px;
  border-radius: 16px; margin-top: 15px; box-shadow: 0 4px 20px rgba(34, 27, 21, .045); }
.product-image { width: 108px; height: 108px; flex: 0 0 108px; border-radius: 11px; background: #f4f1ed;
  color: #baaea2; overflow: hidden; display: grid; place-items: center; }
.product-image img { width: 100%; height: 100%; object-fit: cover; }
.product-detail { min-width: 0; flex: 1; }
.product-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.product-heading h3 { color: #303030; font-size: 17px; line-height: 1.35; margin: 1px 0 4px; }
.product-heading p { color: #777; margin: 0; font-size: 14px; }
.product-meta { display: flex; flex-wrap: wrap; gap: 12px 23px; color: #84786c; font-size: 12px; padding: 16px 0; }
.product-meta strong { margin-left: 5px; color: #4d4138; font-variant-numeric: tabular-nums; }
.location-heading { font-size: 12px; font-weight: 700; color: #706861; padding: 0 0 8px; }
.stock-locations { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 9px; }
.stock-location { text-align: left; border: 1px solid #e7e4de; border-radius: 9px; background: #faf9f6;
  display: flex; flex-direction: column; gap: 4px; padding: 11px 13px; cursor: pointer; color: #292929; transition: border-color .18s, transform .18s, box-shadow .18s; }
.stock-location:hover, .stock-location:focus-visible { border-color: #b6a38d; transform: translateY(-2px); box-shadow: 0 5px 16px rgba(89, 67, 41, .1); outline: none; }
.location-code { font-size: 15px; font-weight: 700; color: #2d4d70; display: flex; align-items: center; gap: 6px; }
.location-kind { color: #84796d; font-size: 12px; }
.stock-location strong { margin-top: 3px; font-size: 15px; }
.no-stock-note { color: #8a7a6c; font-size: 13px; background: #faf5ef; border-radius: 8px; padding: 10px 13px; }
.evidence-box { border-top: 1px solid #eee8df; margin-top: 17px; padding-top: 15px; }
.evidence-box h4 { font-size: 14px; margin: 0 0 6px; color: #3b4540; }
.evidence-warning, .evidence-empty, .receipt-status { color: #785c47; font-size: 12px; line-height: 1.55; margin: 6px 0; }
.evidence-list { display: grid; gap: 8px; margin: 12px 0; }
.evidence-row { background: #f8f7f3; border: 1px solid #ebe6dc; padding: 11px 13px; border-radius: 10px; display: grid; gap: 4px; font-size: 12px; color: #676b63; }
.evidence-row-title { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; color: #373b37; }
.receipt-status { font-weight: 600; }
@media (max-width: 640px) {
  .barcode-page { padding: 6px 0 34px; }
  .page-heading { display: block; margin-bottom: 18px; }
  .warehouse-tag { margin-top: 12px; }
  .search-card { padding: 16px; gap: 10px; }
  .search-icon { width: 40px; height: 40px; flex-basis: 40px; }
  .search-form { flex-direction: column; }
  .search-form :deep(.el-button) { width: 100%; }
  .product-card { gap: 12px; padding: 13px; }
  .product-image { width: 72px; height: 72px; flex-basis: 72px; }
  .product-heading { display: block; }
  .product-heading .el-tag { margin-top: 9px; }
  .product-meta { gap: 6px; flex-direction: column; padding: 12px 0; }
}
</style>
