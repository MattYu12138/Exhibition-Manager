<template>
  <div class="trace-admin-page">
    <header class="trace-header">
      <div class="header-inner">
        <div class="header-left">
          <router-link to="/" class="back-link"><el-icon><ArrowLeft /></el-icon>{{ t('common.back') }}</router-link>
          <div class="header-divider"></div>
          <div class="header-title">
            <span class="trace-icon"><el-icon><Connection /></el-icon></span>
            <div>
              <h1>{{ t('traceability.pageTitle') }}</h1>
              <p>{{ t('traceability.pageDesc') }}</p>
            </div>
          </div>
        </div>
        <div class="header-actions">
          <button class="lang-button" @click="toggleLang">{{ locale === 'zh' ? 'EN' : '中文' }}</button>
          <a class="preview-link" :href="publicUrl" target="_blank" rel="noopener noreferrer">
            <el-icon><TopRight /></el-icon>{{ t('traceability.previewPublic') }}
          </a>
        </div>
      </div>
    </header>

    <main class="trace-main">
      <section class="stats-grid">
        <article class="stat-card"><span>{{ t('traceability.totalRecords') }}</span><strong>{{ stats.total_records || 0 }}</strong></article>
        <article class="stat-card published"><span>{{ t('traceability.publishedRecords') }}</span><strong>{{ stats.published_records || 0 }}</strong></article>
        <article class="stat-card queries"><span>{{ t('traceability.totalQueries') }}</span><strong>{{ stats.total_queries || 0 }}</strong></article>
        <article class="stat-card unresolved"><span>{{ t('traceability.unresolvedQueries') }}</span><strong>{{ stats.unresolved_queries || 0 }}</strong></article>
      </section>

      <section class="content-card">
        <el-tabs v-model="activeTab" @tab-change="handleTabChange">
          <el-tab-pane :label="t('traceability.records')" name="records">
            <div class="toolbar">
              <el-input
                v-model="search"
                clearable
                :placeholder="t('traceability.searchPlaceholder')"
                class="search-input"
                @keyup.enter="loadRecords(1)"
                @clear="loadRecords(1)"
              >
                <template #prefix><el-icon><Search /></el-icon></template>
              </el-input>
              <el-select v-model="statusFilter" class="status-filter" @change="loadRecords(1)">
                <el-option :label="t('traceability.records')" value="" />
                <el-option :label="t('traceability.published')" value="published" />
                <el-option :label="t('traceability.draft')" value="draft" />
              </el-select>
              <el-button type="primary" @click="openCreate"><el-icon><Plus /></el-icon>{{ t('traceability.newRecord') }}</el-button>
            </div>

            <el-table v-loading="recordsLoading" :data="records" stripe class="records-table" empty-text="">
              <el-table-column :label="t('traceability.productName')" min-width="230">
                <template #default="{ row }">
                  <div class="product-cell">
                    <strong>{{ row.product_name }}</strong>
                    <small>{{ row.variant_title || '—' }}</small>
                  </div>
                </template>
              </el-table-column>
              <el-table-column :label="t('traceability.styleNumber')" prop="sku" min-width="130" />
              <el-table-column :label="t('traceability.barcode')" prop="barcode" min-width="145" />
              <el-table-column :label="t('traceability.batchNumber')" prop="batch_no" min-width="130" />
              <el-table-column :label="t('traceability.publishStatus')" width="110" align="center">
                <template #default="{ row }">
                  <el-tag :type="row.is_published ? 'success' : 'info'" effect="light">
                    {{ row.is_published ? t('traceability.published') : t('traceability.draft') }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column :label="t('traceability.actions')" width="150" fixed="right">
                <template #default="{ row }">
                  <el-button link type="primary" @click="openEdit(row)">{{ t('traceability.edit') }}</el-button>
                  <el-button link type="danger" @click="removeRecord(row)">{{ t('traceability.delete') }}</el-button>
                </template>
              </el-table-column>
              <template #empty><el-empty :description="t('traceability.noRecords')" /></template>
            </el-table>

            <div class="pagination-row">
              <el-pagination
                v-model:current-page="page"
                :page-size="pageSize"
                :total="total"
                layout="prev, pager, next, total"
                @current-change="loadRecords"
              />
            </div>
          </el-tab-pane>

          <el-tab-pane :label="t('traceability.analytics')" name="analytics">
            <div v-loading="statsLoading" class="analytics-grid">
              <article class="analytics-card trend-card">
                <h3>{{ t('traceability.dailyQueries') }}</h3>
                <div v-if="daily.length" class="bar-chart">
                  <div v-for="day in daily" :key="day.date" class="bar-column">
                    <span class="bar-value">{{ day.queries }}</span>
                    <div class="bar-track"><div class="bar-fill" :style="{ height: `${barHeight(day.queries)}%` }"></div></div>
                    <small>{{ shortDate(day.date) }}</small>
                  </div>
                </div>
                <el-empty v-else :description="t('traceability.noRecords')" :image-size="72" />
              </article>

              <article class="analytics-card">
                <h3>{{ t('traceability.topBarcodes') }}</h3>
                <div v-if="topBarcodes.length" class="rank-list">
                  <div v-for="(item, index) in topBarcodes" :key="item.barcode" class="rank-row">
                    <span class="rank">{{ index + 1 }}</span>
                    <div><strong>{{ item.product_name || item.barcode }}</strong><small>{{ item.sku || item.barcode }}</small></div>
                    <b>{{ item.queries }}</b>
                  </div>
                </div>
                <el-empty v-else :description="t('traceability.noRecords')" :image-size="72" />
              </article>
            </div>

            <article class="analytics-card recent-card">
              <h3>{{ t('traceability.recentQueries') }}</h3>
              <el-table :data="recentQueries" size="small">
                <el-table-column :label="t('traceability.queriedAt')" min-width="160">
                  <template #default="{ row }">{{ formatDate(row.queried_at) }}</template>
                </el-table-column>
                <el-table-column :label="t('traceability.barcode')" prop="barcode" min-width="140" />
                <el-table-column :label="t('traceability.productName')" prop="product_name" min-width="210" />
                <el-table-column :label="t('traceability.result')" width="130">
                  <template #default="{ row }"><el-tag :type="resultTagType(row.result_status)">{{ resultLabel(row.result_status) }}</el-tag></template>
                </el-table-column>
              </el-table>
            </article>
          </el-tab-pane>
        </el-tabs>
      </section>
    </main>

    <el-dialog v-model="dialogVisible" :title="editingId ? t('traceability.editRecord') : t('traceability.newRecord')" width="min(760px, 94vw)" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="trace-form">
        <el-form-item :label="t('traceability.selectProduct')" prop="product_variant_id">
          <el-select
            v-model="form.product_variant_id"
            filterable
            remote
            reserve-keyword
            :remote-method="searchVariants"
            :loading="variantsLoading"
            :placeholder="t('traceability.selectProductPlaceholder')"
            style="width: 100%"
            :disabled="Boolean(editingId)"
          >
            <el-option v-for="option in variantOptions" :key="option.product_variant_id" :label="variantLabel(option)" :value="option.product_variant_id">
              <div class="variant-option">
                <strong>{{ option.product_name }}</strong>
                <span>{{ option.variant_title }} · {{ option.sku || '—' }} · {{ option.barcode }}</span>
              </div>
            </el-option>
          </el-select>
          <p class="form-hint">{{ t('traceability.barcodeRequired') }}</p>
        </el-form-item>

        <div class="form-grid">
          <el-form-item :label="t('traceability.batchNumber')" prop="batch_no"><el-input v-model="form.batch_no" /></el-form-item>
          <el-form-item :label="t('traceability.certification')"><el-input v-model="form.certification_standard" /></el-form-item>
          <el-form-item :label="t('traceability.fibreZh')" prop="fiber_composition_zh"><el-input v-model="form.fiber_composition_zh" /></el-form-item>
          <el-form-item :label="t('traceability.fibreEn')" prop="fiber_composition_en"><el-input v-model="form.fiber_composition_en" /></el-form-item>
          <el-form-item :label="t('traceability.certifyingBody')"><el-input v-model="form.certifying_body" /></el-form-item>
          <el-form-item :label="t('traceability.licenceNumber')"><el-input v-model="form.licence_no" /></el-form-item>
          <el-form-item :label="t('traceability.originZh')"><el-input v-model="form.production_origin_zh" /></el-form-item>
          <el-form-item :label="t('traceability.originEn')"><el-input v-model="form.production_origin_en" /></el-form-item>
        </div>
        <el-form-item :label="t('traceability.verificationUrl')"><el-input v-model="form.gots_verification_url" /></el-form-item>
        <el-form-item :label="t('traceability.traceCode')"><el-input v-model="form.trace_code" /></el-form-item>
        <div class="switch-row">
          <label><span>{{ t('traceability.defaultBatch') }}</span><el-switch v-model="form.is_default" /></label>
          <label><span>{{ t('traceability.publishStatus') }}</span><el-switch v-model="form.is_published" /></label>
        </div>
        <p class="form-hint">{{ t('traceability.requiredHint') }}</p>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="saveRecord">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const { t, locale } = useI18n()
const api = axios.create({ baseURL: '/api', withCredentials: true })
const publicUrl = import.meta.env.VITE_TRACEABILITY_URL || 'https://trace.lummiincolour.com.au'
const activeTab = ref('records')
const records = ref([])
const recordsLoading = ref(false)
const statsLoading = ref(false)
const search = ref('')
const statusFilter = ref('')
const page = ref(1)
const pageSize = 25
const total = ref(0)
const dialogVisible = ref(false)
const editingId = ref(null)
const saving = ref(false)
const formRef = ref(null)
const variantOptions = ref([])
const variantsLoading = ref(false)
const stats = reactive({ total_records: 0, published_records: 0, total_queries: 0, unresolved_queries: 0 })
const daily = ref([])
const topBarcodes = ref([])
const recentQueries = ref([])

const blankForm = () => ({
  product_variant_id: '',
  batch_no: '',
  trace_code: '',
  is_default: true,
  fiber_composition_zh: t('traceability.defaultFibreZh'),
  fiber_composition_en: t('traceability.defaultFibreEn'),
  certification_standard: 'GOTS organic',
  certifying_body: '',
  licence_no: '',
  production_origin_zh: t('traceability.defaultOriginZh'),
  production_origin_en: t('traceability.defaultOriginEn'),
  gots_verification_url: 'https://global-standards.org/suppliers/certified-suppliers',
  is_published: false,
})
const form = reactive(blankForm())
const rules = computed(() => ({
  product_variant_id: [{ required: true, message: t('traceability.selectProduct'), trigger: 'change' }],
  batch_no: [{ required: true, message: t('traceability.batchNumber'), trigger: 'blur' }],
  fiber_composition_zh: [{ required: true, message: t('traceability.fibreZh'), trigger: 'blur' }],
  fiber_composition_en: [{ required: true, message: t('traceability.fibreEn'), trigger: 'blur' }],
}))

function toggleLang() {
  locale.value = locale.value === 'zh' ? 'en' : 'zh'
  localStorage.setItem('lang', locale.value)
}
function variantLabel(option) {
  return `${option.product_name} · ${option.variant_title || '—'} · ${option.barcode}`
}
function shortDate(date) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(locale.value === 'zh' ? 'zh-CN' : 'en-AU', { month: 'short', day: 'numeric' })
}
function formatDate(value) {
  if (!value) return '—'
  return new Date(`${value.replace(' ', 'T')}Z`).toLocaleString(locale.value === 'zh' ? 'zh-CN' : 'en-AU')
}
function resultTagType(status) {
  return status === 'found' ? 'success' : status === 'not_published' ? 'warning' : 'danger'
}
function resultLabel(status) {
  const labels = { found: 'found', not_found: 'notFound', not_published: 'notPublished', ambiguous: 'ambiguous', invalid: 'invalid' }
  return t(`traceability.${labels[status] || 'invalid'}`)
}
function barHeight(value) {
  const max = Math.max(...daily.value.map(item => item.queries), 1)
  return Math.max(8, Math.round((value / max) * 100))
}

async function loadRecords(targetPage = page.value) {
  page.value = targetPage
  recordsLoading.value = true
  try {
    const response = await api.get('/traceability/records', {
      params: { page: page.value, pageSize, search: search.value, status: statusFilter.value },
    })
    records.value = response.data.data
    total.value = response.data.total
  } catch (error) {
    ElMessage.error(error.response?.data?.message || t('traceability.loadFailed'))
  } finally {
    recordsLoading.value = false
  }
}

async function searchVariants(query = '') {
  variantsLoading.value = true
  try {
    const response = await api.get('/traceability/variants', { params: { search: query, limit: 50 } })
    variantOptions.value = response.data.data
  } catch (error) {
    ElMessage.error(error.response?.data?.message || t('traceability.loadFailed'))
  } finally {
    variantsLoading.value = false
  }
}

async function loadStats() {
  statsLoading.value = true
  try {
    const response = await api.get('/traceability/stats', { params: { days: 30 } })
    Object.assign(stats, response.data.data.summary)
    daily.value = response.data.data.daily
    topBarcodes.value = response.data.data.top_barcodes
    recentQueries.value = response.data.data.recent_queries
  } catch (error) {
    ElMessage.error(error.response?.data?.message || t('traceability.loadFailed'))
  } finally {
    statsLoading.value = false
  }
}

function handleTabChange(name) {
  if (name === 'analytics') loadStats()
}

async function openCreate() {
  editingId.value = null
  Object.assign(form, blankForm())
  await searchVariants('')
  dialogVisible.value = true
}

function openEdit(row) {
  editingId.value = row.id
  variantOptions.value = [{
    product_variant_id: row.product_variant_id,
    product_name: row.product_name,
    variant_title: row.variant_title,
    sku: row.sku,
    barcode: row.barcode,
  }]
  Object.assign(form, {
    product_variant_id: row.product_variant_id,
    batch_no: row.batch_no || '',
    trace_code: row.trace_code || '',
    is_default: Boolean(row.is_default),
    fiber_composition_zh: row.fiber_composition_zh || '',
    fiber_composition_en: row.fiber_composition_en || '',
    certification_standard: row.certification_standard || 'GOTS organic',
    certifying_body: row.certifying_body || '',
    licence_no: row.licence_no || '',
    production_origin_zh: row.production_origin_zh || '',
    production_origin_en: row.production_origin_en || '',
    gots_verification_url: row.gots_verification_url || '',
    is_published: Boolean(row.is_published),
  })
  dialogVisible.value = true
}

async function saveRecord() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    if (editingId.value) {
      await api.put(`/traceability/records/${editingId.value}`, form)
      ElMessage.success(t('traceability.updateSuccess'))
    } else {
      await api.post('/traceability/records', form)
      ElMessage.success(t('traceability.createSuccess'))
    }
    dialogVisible.value = false
    await Promise.all([loadRecords(1), loadStats()])
  } catch (error) {
    ElMessage.error(error.response?.data?.message || t('traceability.saveFailed'))
  } finally {
    saving.value = false
  }
}

async function removeRecord(row) {
  try {
    await ElMessageBox.confirm(t('traceability.deleteConfirm'), t('traceability.delete'), { type: 'warning' })
    await api.delete(`/traceability/records/${row.id}`)
    ElMessage.success(t('traceability.deleteSuccess'))
    await Promise.all([loadRecords(1), loadStats()])
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error.response?.data?.message || t('traceability.saveFailed'))
  }
}

onMounted(() => Promise.all([loadRecords(1), loadStats()]))
</script>

<style scoped>
.trace-admin-page { min-height: 100vh; color: #30352f; background: linear-gradient(145deg, #f5f1e9 0%, #f8f8f6 48%, #eef3ed 100%); }
.trace-header { position: sticky; top: 0; z-index: 20; border-bottom: 1px solid rgba(72, 80, 70, .08); background: rgba(255,255,255,.88); backdrop-filter: blur(18px); }
.header-inner { max-width: 1320px; margin: 0 auto; padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; gap: 20px; }
.header-left, .header-title, .header-actions { display: flex; align-items: center; }
.header-left { gap: 18px; min-width: 0; }
.header-title { gap: 12px; }
.header-title h1 { margin: 0; font-size: 20px; }
.header-title p { margin: 3px 0 0; color: #7c817a; font-size: 12px; }
.trace-icon { display: grid; width: 42px; height: 42px; place-items: center; border-radius: 14px; color: #536b50; background: #e8efe4; font-size: 21px; }
.header-divider { width: 1px; height: 32px; background: #e2e4df; }
.back-link { display: inline-flex; align-items: center; gap: 4px; color: #737972; text-decoration: none; font-size: 13px; }
.header-actions { gap: 10px; }
.lang-button, .preview-link { height: 36px; border-radius: 10px; padding: 0 12px; display: inline-flex; align-items: center; gap: 6px; border: 1px solid #dfe4dc; background: #fff; color: #566056; text-decoration: none; cursor: pointer; font-size: 12px; }
.preview-link { color: #fff; border-color: #61795d; background: #61795d; }
.trace-main { max-width: 1320px; margin: 0 auto; padding: 28px 24px 54px; }
.stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 18px; }
.stat-card { min-height: 112px; padding: 20px; border: 1px solid rgba(70,78,68,.08); border-radius: 18px; background: rgba(255,255,255,.82); box-shadow: 0 12px 30px rgba(70,78,68,.07); }
.stat-card span { display: block; color: #80857e; font-size: 12px; }
.stat-card strong { display: block; margin-top: 12px; font-size: 30px; }
.stat-card.published { border-top: 3px solid #78926f; }
.stat-card.queries { border-top: 3px solid #6d8ea1; }
.stat-card.unresolved { border-top: 3px solid #c89764; }
.content-card { padding: 8px 20px 22px; border: 1px solid rgba(70,78,68,.08); border-radius: 20px; background: rgba(255,255,255,.9); box-shadow: 0 16px 40px rgba(70,78,68,.08); }
.toolbar { display: flex; align-items: center; gap: 10px; margin: 12px 0 18px; }
.search-input { max-width: 520px; }
.status-filter { width: 150px; }
.records-table { width: 100%; }
.product-cell { display: flex; flex-direction: column; gap: 3px; }
.product-cell strong { color: #323832; }
.product-cell small { color: #8a8f88; }
.pagination-row { display: flex; justify-content: flex-end; padding-top: 18px; }
.analytics-grid { display: grid; grid-template-columns: 1.45fr 1fr; gap: 16px; }
.analytics-card { padding: 20px; border: 1px solid #eceee9; border-radius: 16px; background: #fff; }
.analytics-card h3 { margin: 0 0 18px; font-size: 15px; }
.recent-card { margin-top: 16px; }
.bar-chart { display: flex; align-items: end; gap: 8px; height: 230px; overflow-x: auto; padding: 12px 0 0; }
.bar-column { display: grid; grid-template-rows: 20px 1fr 22px; align-items: end; min-width: 31px; height: 100%; text-align: center; }
.bar-value, .bar-column small { color: #858b83; font-size: 9px; }
.bar-track { position: relative; height: 100%; border-radius: 8px; background: #eef2ec; overflow: hidden; }
.bar-fill { position: absolute; inset: auto 0 0; border-radius: 8px; background: linear-gradient(#8ba483, #5f785b); }
.rank-list { display: grid; gap: 5px; }
.rank-row { display: grid; grid-template-columns: 28px 1fr auto; align-items: center; gap: 9px; padding: 9px 0; border-bottom: 1px solid #eef0ec; }
.rank { display: grid; width: 24px; height: 24px; place-items: center; border-radius: 8px; color: #60715d; background: #edf2ea; font-size: 11px; }
.rank-row div { min-width: 0; }
.rank-row strong, .rank-row small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rank-row strong { font-size: 11px; }.rank-row small { color: #8a8f88; font-size: 10px; }.rank-row b { color: #61795d; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }
.form-hint { margin: 4px 0 0; color: #969b94; font-size: 11px; }
.switch-row { display: flex; gap: 28px; padding: 5px 0 14px; }
.switch-row label { display: flex; align-items: center; gap: 10px; color: #596057; font-size: 13px; }
.variant-option { display: flex; flex-direction: column; line-height: 1.25; }
.variant-option span { color: #929790; font-size: 11px; }
@media (max-width: 820px) {
  .header-inner, .trace-main { padding-left: 14px; padding-right: 14px; }
  .header-title p, .header-divider { display: none; }
  .header-actions { gap: 6px; }
  .preview-link { width: 38px; padding: 0; justify-content: center; font-size: 0; }
  .stats-grid { grid-template-columns: 1fr 1fr; }
  .stat-card { min-height: 92px; padding: 15px; }
  .stat-card strong { font-size: 25px; }
  .toolbar { flex-wrap: wrap; }
  .search-input { max-width: none; width: 100%; }
  .status-filter { flex: 1; }
  .analytics-grid { grid-template-columns: 1fr; }
  .form-grid { grid-template-columns: 1fr; }
}
</style>
