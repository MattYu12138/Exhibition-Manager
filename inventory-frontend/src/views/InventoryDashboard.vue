<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <header class="bg-white shadow-sm sticky top-0 z-10">
      <div class="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <a href="#" class="text-sm text-gray-400 hover:text-gray-600" @click.prevent="backToPlatform">{{ t('inventory.backToPlatform') }}</a>
          <span class="text-gray-300">|</span>
          <span class="text-xl">📦</span>
          <div>
            <h1 class="text-lg font-bold text-gray-800">{{ t('inventory.title') }}</h1>
            <p class="text-xs text-gray-500">{{ t('inventory.subtitle') }}</p>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <button @click="toggleLang" class="text-xs text-gray-400 hover:text-gray-600 border rounded px-2 py-1">
            {{ locale === 'zh' ? 'EN' : '中文' }}
          </button>
          <!-- Pending changes badge + commit button -->
          <button
            v-if="pendingCount > 0"
            @click="openCommitModal"
            class="relative bg-amber-500 hover:bg-amber-600 text-white text-sm px-4 py-2 rounded-lg flex items-center gap-2"
          >
            <span class="inline-flex items-center justify-center bg-white text-amber-600 text-xs font-bold rounded-full w-5 h-5">{{ pendingCount }}</span>
            {{ t('inventory.commitChanges') }}
          </button>
          <button
            @click="syncProducts"
            :disabled="syncing"
            class="bg-purple-600 hover:bg-purple-700 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            <span v-if="syncing" class="animate-spin">⟳</span>
            {{ syncing ? t('inventory.syncing') : t('inventory.syncNow') }}
          </button>
        </div>
      </div>
    </header>

    <main class="max-w-7xl mx-auto px-4 py-6">
      <!-- Last Sync Info -->
      <div class="text-xs text-gray-400 mb-4">
        {{ t('inventory.lastSync') }}: {{ lastSync ? new Date(lastSync.synced_at).toLocaleString() : t('inventory.never') }}
      </div>

      <!-- Summary Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-white rounded-xl p-4 shadow-sm text-center">
          <div class="text-2xl font-bold text-gray-800">{{ summary.total }}</div>
          <div class="text-xs text-gray-500 mt-1">{{ t('inventory.totalProducts') }}</div>
        </div>
        <div class="bg-white rounded-xl p-4 shadow-sm text-center border-l-4" :class="summary.withDuplicates > 0 ? 'border-orange-400' : 'border-green-400'">
          <div class="text-2xl font-bold" :class="summary.withDuplicates > 0 ? 'text-orange-600' : 'text-green-600'">{{ summary.withDuplicates }}</div>
          <div class="text-xs text-gray-500 mt-1">{{ t('inventory.withDuplicates') }}</div>
        </div>
        <div class="bg-white rounded-xl p-4 shadow-sm text-center border-l-4" :class="summary.duplicateSKUs > 0 ? 'border-red-400' : 'border-green-400'">
          <div class="text-2xl font-bold" :class="summary.duplicateSKUs > 0 ? 'text-red-600' : 'text-green-600'">{{ summary.duplicateSKUs }}</div>
          <div class="text-xs text-gray-500 mt-1">{{ t('inventory.duplicateSKUs') }}</div>
        </div>
        <div class="bg-white rounded-xl p-4 shadow-sm text-center border-l-4" :class="summary.duplicateBarcodes > 0 ? 'border-red-400' : 'border-green-400'">
          <div class="text-2xl font-bold" :class="summary.duplicateBarcodes > 0 ? 'text-red-600' : 'text-green-600'">{{ summary.duplicateBarcodes }}</div>
          <div class="text-xs text-gray-500 mt-1">{{ t('inventory.duplicateBarcodes') }}</div>
        </div>
      </div>

      <!-- Status Tabs -->
      <div class="flex gap-1 mb-4 border-b border-gray-200">
        <button
          v-for="tab in statusTabs"
          :key="tab.value"
          @click="switchStatus(tab.value)"
          class="px-4 py-2 text-sm font-medium rounded-t-lg transition-colors"
          :class="activeStatus === tab.value
            ? 'bg-white border border-b-white border-gray-200 text-purple-700 -mb-px'
            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Filters -->
      <div class="flex gap-3 mb-4">
        <input
          v-model="searchQuery"
          :placeholder="t('inventory.search')"
          class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          @click="showDuplicatesOnly = false"
          :class="!showDuplicatesOnly ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 border'"
          class="px-4 py-2 rounded-lg text-sm"
        >{{ t('inventory.allProducts') }}</button>
        <button
          @click="showDuplicatesOnly = true"
          :class="showDuplicatesOnly ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 border'"
          class="px-4 py-2 rounded-lg text-sm"
        >⚠ {{ t('inventory.duplicatesOnly') }}</button>
      </div>

      <!-- Products List -->
      <div v-if="loading" class="text-center text-gray-400 py-20">Loading...</div>

      <div v-else-if="filteredProducts.length === 0 && products.length === 0" class="text-center text-gray-400 py-20">
        {{ t('inventory.noProducts') }}
      </div>

      <div v-else-if="filteredProducts.length === 0 && showDuplicatesOnly" class="text-center text-green-600 py-20 text-lg">
        ✅ {{ t('inventory.noDuplicates') }}
      </div>

      <div v-else-if="filteredProducts.length === 0" class="text-center text-gray-400 py-20">
        {{ t('inventory.noProducts') }}
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="product in filteredProducts"
          :key="product.id"
          class="bg-white rounded-xl shadow-sm overflow-hidden"
          :class="[
            product.hasDuplicate ? 'border-l-4 border-orange-400' : '',
            hasProductPendingChanges(product.id) ? 'ring-2 ring-amber-300' : ''
          ]"
        >
          <!-- Product Header -->
          <div class="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50"
            @click="toggleProduct(product.id)">
            <div class="flex items-center gap-3">
              <span v-if="product.hasDuplicate" class="text-orange-500 text-lg">⚠</span>
              <span v-if="hasProductPendingChanges(product.id)" class="text-amber-500 text-sm font-medium">✎</span>
              <div>
                <div class="font-medium text-gray-800">
                  <!-- Show staged title if edited -->
                  <span v-if="stagedProducts[product.id]?.title !== undefined && stagedProducts[product.id].title !== product.title" class="text-amber-600">
                    {{ stagedProducts[product.id].title }}
                  </span>
                  <span v-else>{{ product.title }}</span>
                </div>
                <div class="text-xs text-gray-500">{{ product.vendor }} · {{ product.product_type }} · <span :class="statusBadgeClass(product._computed_status || product.status)">{{ product._computed_status || product.status }}</span></div>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-xs text-gray-400">{{ product.variants?.length }} {{ t('inventory.variants') }}</span>
              <button @click.stop="openEditProduct(product)" class="text-xs text-purple-600 hover:underline">{{ t('inventory.edit') }}</button>
              <span class="text-gray-400">{{ expandedProducts.has(product.id) ? '▲' : '▼' }}</span>
            </div>
          </div>

          <!-- Variants Table -->
          <div v-if="expandedProducts.has(product.id)" class="border-t">
            <table class="w-full text-xs">
              <thead class="bg-gray-50 text-gray-500">
                <tr>
                  <th class="text-left px-4 py-2">Variant</th>
                  <th class="text-left px-4 py-2">{{ t('inventory.sku') }}</th>
                  <th class="text-left px-4 py-2">{{ t('inventory.barcode') }}</th>
                  <th class="text-left px-4 py-2">{{ t('inventory.price') }}</th>
                  <th class="text-left px-4 py-2">{{ t('inventory.issues') }}</th>
                  <th class="text-left px-4 py-2">{{ t('inventory.actions') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="variant in product.variants" :key="variant.id"
                  class="border-t"
                  :class="[
                    (variant.hasDuplicateSKU || variant.hasDuplicateBarcode) ? 'bg-orange-50' : '',
                    hasVariantPendingChanges(product.id, variant.id) ? 'bg-amber-50' : ''
                  ]">
                  <td class="px-4 py-2 text-gray-700">{{ variant.title }}</td>
                  <td class="px-4 py-2">
                    <span v-if="getStagedVariantField(product.id, variant.id, 'sku') !== null" class="text-amber-600 font-medium">
                      {{ getStagedVariantField(product.id, variant.id, 'sku') || '-' }}
                    </span>
                    <span v-else :class="variant.hasDuplicateSKU ? 'text-red-600 font-semibold' : 'text-gray-600'">
                      {{ variant.sku || '-' }}
                    </span>
                  </td>
                  <td class="px-4 py-2">
                    <span v-if="getStagedVariantField(product.id, variant.id, 'barcode') !== null" class="text-amber-600 font-medium">
                      {{ getStagedVariantField(product.id, variant.id, 'barcode') || '-' }}
                    </span>
                    <span v-else :class="variant.hasDuplicateBarcode ? 'text-red-600 font-semibold' : 'text-gray-600'">
                      {{ variant.barcode || '-' }}
                    </span>
                  </td>
                  <td class="px-4 py-2 text-gray-600">
                    <span v-if="getStagedVariantField(product.id, variant.id, 'price') !== null" class="text-amber-600 font-medium">
                      ${{ getStagedVariantField(product.id, variant.id, 'price') }}
                    </span>
                    <span v-else>${{ variant.price }}</span>
                  </td>
                  <td class="px-4 py-2">
                    <span v-if="variant.hasDuplicateSKU" class="bg-red-100 text-red-600 px-1.5 py-0.5 rounded mr-1">{{ t('inventory.dupSKU') }}</span>
                    <span v-if="variant.hasDuplicateBarcode" class="bg-red-100 text-red-600 px-1.5 py-0.5 rounded">{{ t('inventory.dupBarcode') }}</span>
                  </td>
                  <td class="px-4 py-2">
                    <button @click="openEditVariant(product, variant)" class="text-purple-600 hover:underline">{{ t('inventory.edit') }}</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>

    <!-- Edit Product Modal (stages changes locally, no immediate save) -->
    <div v-if="editingProduct" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div class="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl">
        <h2 class="text-lg font-bold mb-1">{{ t('inventory.editProduct') }}</h2>
        <p class="text-xs text-gray-400 mb-4">{{ t('inventory.editStagedNote') }}</p>
        <div class="space-y-3">
          <div>
            <label class="text-sm text-gray-600">Title</label>
            <input v-model="productForm.title" class="input-field mt-1" />
          </div>
          <div>
            <label class="text-sm text-gray-600">{{ t('inventory.vendor') }}</label>
            <input v-model="productForm.vendor" class="input-field mt-1" />
          </div>
          <div>
            <label class="text-sm text-gray-600">{{ t('inventory.type') }}</label>
            <input v-model="productForm.product_type" class="input-field mt-1" />
          </div>
          <div>
            <label class="text-sm text-gray-600">Tags</label>
            <input v-model="productForm.tags" class="input-field mt-1" />
          </div>
          <div>
            <label class="text-sm text-gray-600">{{ t('inventory.status') }}</label>
            <select v-model="productForm.status" class="input-field mt-1">
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>
        <div class="flex gap-3 mt-4">
          <button @click="stageProductEdit" class="flex-1 bg-amber-500 text-white py-2 rounded-lg hover:bg-amber-600">
            {{ t('inventory.stageEdit') }}
          </button>
          <button @click="editingProduct = null" class="flex-1 border py-2 rounded-lg hover:bg-gray-50">{{ t('inventory.cancel') }}</button>
        </div>
      </div>
    </div>

    <!-- Edit Variant Modal (stages changes locally, no immediate save) -->
    <div v-if="editingVariant" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div class="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl">
        <h2 class="text-lg font-bold mb-1">{{ t('inventory.editVariant') }}</h2>
        <p class="text-xs text-gray-400 mb-1">{{ editingVariant.product.title }} — {{ editingVariant.variant.title }}</p>
        <p class="text-xs text-gray-400 mb-4">{{ t('inventory.editStagedNote') }}</p>
        <div class="space-y-3">
          <div>
            <label class="text-sm text-gray-600">{{ t('inventory.sku') }}</label>
            <input v-model="variantForm.sku" class="input-field mt-1"
              :class="editingVariant.variant.hasDuplicateSKU ? 'border-red-400' : ''" />
            <p v-if="editingVariant.variant.hasDuplicateSKU" class="text-red-500 text-xs mt-1">⚠ {{ t('inventory.dupSKU') }}</p>
          </div>
          <div>
            <label class="text-sm text-gray-600">{{ t('inventory.barcode') }}</label>
            <input v-model="variantForm.barcode" class="input-field mt-1"
              :class="editingVariant.variant.hasDuplicateBarcode ? 'border-red-400' : ''" />
            <p v-if="editingVariant.variant.hasDuplicateBarcode" class="text-red-500 text-xs mt-1">⚠ {{ t('inventory.dupBarcode') }}</p>
          </div>
          <div>
            <label class="text-sm text-gray-600">{{ t('inventory.price') }}</label>
            <input v-model="variantForm.price" type="number" step="0.01" class="input-field mt-1" />
          </div>
          <div>
            <label class="text-sm text-gray-600">{{ t('inventory.compareAtPrice') }}</label>
            <input v-model="variantForm.compare_at_price" type="number" step="0.01" class="input-field mt-1" />
          </div>
        </div>
        <div class="flex gap-3 mt-4">
          <button @click="stageVariantEdit" class="flex-1 bg-amber-500 text-white py-2 rounded-lg hover:bg-amber-600">
            {{ t('inventory.stageEdit') }}
          </button>
          <button @click="editingVariant = null" class="flex-1 border py-2 rounded-lg hover:bg-gray-50">{{ t('inventory.cancel') }}</button>
        </div>
      </div>
    </div>

    <!-- Commit Changes Modal (diff view) -->
    <div v-if="showCommitModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh]">
        <!-- Modal Header -->
        <div class="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h2 class="text-lg font-bold text-gray-800">{{ t('inventory.commitTitle') }}</h2>
            <p class="text-xs text-gray-500 mt-0.5">{{ t('inventory.commitSubtitle', { count: pendingCount }) }}</p>
          </div>
          <button @click="showCommitModal = false" class="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <!-- Diff List -->
        <div class="overflow-y-auto flex-1 px-6 py-4 space-y-4">

          <!-- Product-level changes -->
          <div v-for="(changes, productId) in stagedProducts" :key="'p-' + productId">
            <div v-if="Object.keys(changes).length > 0" class="border rounded-lg overflow-hidden">
              <div class="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center justify-between">
                <span>{{ t('inventory.productChange') }}: {{ getProductTitle(productId) }}</span>
                <button @click="discardProductStage(productId)" class="text-red-400 hover:text-red-600 text-xs normal-case font-normal">{{ t('inventory.discard') }}</button>
              </div>
              <table class="w-full text-sm">
                <thead class="bg-gray-100 text-gray-500 text-xs">
                  <tr>
                    <th class="text-left px-4 py-2 w-1/4">{{ t('inventory.field') }}</th>
                    <th class="text-left px-4 py-2 w-5/12">{{ t('inventory.before') }}</th>
                    <th class="text-left px-4 py-2 w-5/12">{{ t('inventory.after') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(newVal, field) in changes" :key="field" class="border-t">
                    <td class="px-4 py-2 text-gray-500 text-xs">{{ field }}</td>
                    <td class="px-4 py-2 text-red-500 line-through text-xs">{{ getOriginalProductField(productId, field) || '—' }}</td>
                    <td class="px-4 py-2 text-green-600 font-medium text-xs">{{ newVal || '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Variant-level changes -->
          <div v-for="(variantMap, productId) in stagedVariants" :key="'v-' + productId">
            <div v-for="(changes, variantId) in variantMap" :key="variantId">
              <div v-if="Object.keys(changes).length > 0" class="border rounded-lg overflow-hidden">
                <div class="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center justify-between">
                  <span>{{ t('inventory.variantChange') }}: {{ getProductTitle(productId) }} — {{ getVariantTitle(productId, variantId) }}</span>
                  <button @click="discardVariantStage(productId, variantId)" class="text-red-400 hover:text-red-600 text-xs normal-case font-normal">{{ t('inventory.discard') }}</button>
                </div>
                <table class="w-full text-sm">
                  <thead class="bg-gray-100 text-gray-500 text-xs">
                    <tr>
                      <th class="text-left px-4 py-2 w-1/4">{{ t('inventory.field') }}</th>
                      <th class="text-left px-4 py-2 w-5/12">{{ t('inventory.before') }}</th>
                      <th class="text-left px-4 py-2 w-5/12">{{ t('inventory.after') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(newVal, field) in changes" :key="field" class="border-t">
                      <td class="px-4 py-2 text-gray-500 text-xs">{{ field }}</td>
                      <td class="px-4 py-2 text-red-500 line-through text-xs">{{ getOriginalVariantField(productId, variantId, field) || '—' }}</td>
                      <td class="px-4 py-2 text-green-600 font-medium text-xs">{{ newVal || '—' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        </div>

        <!-- Modal Footer -->
        <div class="px-6 py-4 border-t flex items-center justify-between bg-gray-50 rounded-b-xl">
          <div v-if="commitError" class="text-red-500 text-sm">{{ commitError }}</div>
          <div v-else class="text-xs text-gray-400">{{ t('inventory.commitWarning') }}</div>
          <div class="flex gap-3">
            <button @click="showCommitModal = false" class="border px-4 py-2 rounded-lg text-sm hover:bg-gray-100">{{ t('inventory.cancel') }}</button>
            <button @click="commitChanges" :disabled="committing" class="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg text-sm disabled:opacity-50 flex items-center gap-2">
              <span v-if="committing" class="animate-spin">⟳</span>
              {{ committing ? t('inventory.committing') : t('inventory.confirmCommit') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import axios from 'axios'

const { t, locale } = useI18n()
const api = axios.create({ baseURL: '/api', withCredentials: true })

const platformUrl = import.meta.env.VITE_PLATFORM_URL || 'http://localhost:5174'

async function backToPlatform() {
  try {
    const res = await api.post('/sso/return-token')
    if (res.data.success) {
      window.location.href = `${platformUrl}/?sso_token=${res.data.token}`
    } else {
      window.location.href = platformUrl
    }
  } catch {
    window.location.href = platformUrl
  }
}

// ─── Core data ───────────────────────────────────────────────────────────────
const products = ref([])
const summary = ref({ total: 0, withDuplicates: 0, duplicateSKUs: 0, duplicateBarcodes: 0 })
const lastSync = ref(null)
const loading = ref(true)
const syncing = ref(false)
const searchQuery = ref('')
const showDuplicatesOnly = ref(false)
const expandedProducts = ref(new Set())
const activeStatus = ref('all')

// ─── Staged changes (pre-edit, not yet sent to Shopify) ──────────────────────
// stagedProducts: { [productId]: { title?, vendor?, product_type?, tags?, status? } }
// stagedVariants: { [productId]: { [variantId]: { sku?, barcode?, price?, compare_at_price? } } }
const stagedProducts = ref({})
const stagedVariants = ref({})

const pendingCount = computed(() => {
  let count = 0
  for (const changes of Object.values(stagedProducts.value)) {
    if (Object.keys(changes).length > 0) count++
  }
  for (const variantMap of Object.values(stagedVariants.value)) {
    for (const changes of Object.values(variantMap)) {
      if (Object.keys(changes).length > 0) count++
    }
  }
  return count
})

// ─── Edit modals ─────────────────────────────────────────────────────────────
const editingProduct = ref(null)
const editingVariant = ref(null)
const productForm = ref({})
const variantForm = ref({})

// ─── Commit modal ─────────────────────────────────────────────────────────────
const showCommitModal = ref(false)
const committing = ref(false)
const commitError = ref('')

// ─── Status tabs ─────────────────────────────────────────────────────────────
const statusTabs = computed(() => [
  { value: 'all', label: t('inventory.statusAll') },
  { value: 'active', label: t('inventory.statusActive') },
  { value: 'draft', label: t('inventory.statusDraft') },
  { value: 'archived', label: t('inventory.statusArchived') },
  { value: 'unlisted', label: t('inventory.statusUnlisted') },
])

function statusBadgeClass(status) {
  const map = {
    active: 'text-green-600 font-medium',
    draft: 'text-yellow-600 font-medium',
    archived: 'text-gray-500 font-medium',
    unlisted: 'text-blue-500 font-medium',
  }
  return map[status] || 'text-gray-600'
}

function toggleLang() {
  locale.value = locale.value === 'zh' ? 'en' : 'zh'
  localStorage.setItem('lang', locale.value)
}

function toggleProduct(id) {
  if (expandedProducts.value.has(id)) {
    expandedProducts.value.delete(id)
  } else {
    expandedProducts.value.add(id)
  }
}

async function switchStatus(status) {
  activeStatus.value = status
  searchQuery.value = ''
  showDuplicatesOnly.value = false
  expandedProducts.value = new Set()
  await fetchProducts()
}

// ─── Staged change helpers ────────────────────────────────────────────────────
function hasProductPendingChanges(productId) {
  const pid = String(productId)
  return stagedProducts.value[pid] && Object.keys(stagedProducts.value[pid]).length > 0
}

function hasVariantPendingChanges(productId, variantId) {
  const pid = String(productId)
  const vid = String(variantId)
  return stagedVariants.value[pid]?.[vid] && Object.keys(stagedVariants.value[pid][vid]).length > 0
}

function getStagedVariantField(productId, variantId, field) {
  const pid = String(productId)
  const vid = String(variantId)
  const staged = stagedVariants.value[pid]?.[vid]
  if (staged && field in staged) return staged[field]
  return null
}

function getProductTitle(productId) {
  const pid = String(productId)
  const p = products.value.find(x => String(x.id) === pid)
  return p?.title || pid
}

function getVariantTitle(productId, variantId) {
  const pid = String(productId)
  const vid = String(variantId)
  const p = products.value.find(x => String(x.id) === pid)
  const v = p?.variants?.find(x => String(x.id) === vid)
  return v?.title || vid
}

function getOriginalProductField(productId, field) {
  const pid = String(productId)
  const p = products.value.find(x => String(x.id) === pid)
  return p ? p[field] : ''
}

function getOriginalVariantField(productId, variantId, field) {
  const pid = String(productId)
  const vid = String(variantId)
  const p = products.value.find(x => String(x.id) === pid)
  const v = p?.variants?.find(x => String(x.id) === vid)
  return v ? v[field] : ''
}

function discardProductStage(productId) {
  const pid = String(productId)
  delete stagedProducts.value[pid]
  stagedProducts.value = { ...stagedProducts.value }
}

function discardVariantStage(productId, variantId) {
  const pid = String(productId)
  const vid = String(variantId)
  if (stagedVariants.value[pid]) {
    delete stagedVariants.value[pid][vid]
    if (Object.keys(stagedVariants.value[pid]).length === 0) {
      delete stagedVariants.value[pid]
    }
    stagedVariants.value = { ...stagedVariants.value }
  }
}

// ─── Filtered products ────────────────────────────────────────────────────────
const filteredProducts = computed(() => {
  let list = products.value
  if (showDuplicatesOnly.value) list = list.filter(p => p.hasDuplicate)
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(p =>
      p.title?.toLowerCase().includes(q) ||
      p.vendor?.toLowerCase().includes(q) ||
      p.variants?.some(v => v.sku?.toLowerCase().includes(q) || v.barcode?.toLowerCase().includes(q))
    )
  }
  return list
})

// ─── Fetch / Sync ─────────────────────────────────────────────────────────────
async function fetchProducts() {
  loading.value = true
  try {
    const params = activeStatus.value !== 'all' ? { status: activeStatus.value } : {}
    const res = await api.get('/products', { params })
    products.value = res.data.products
    summary.value = res.data.summary
    res.data.products.filter(p => p.hasDuplicate).forEach(p => expandedProducts.value.add(p.id))
  } finally {
    loading.value = false
  }
}

async function fetchLastSync() {
  try {
    const res = await api.get('/products/last-sync')
    lastSync.value = res.data
  } catch {}
}

async function syncProducts() {
  syncing.value = true
  try {
    await api.post('/products/sync')
    await fetchProducts()
    await fetchLastSync()
    // Clear staged changes after a fresh sync
    stagedProducts.value = {}
    stagedVariants.value = {}
    alert(t('inventory.syncSuccess'))
  } catch (err) {
    alert(t('inventory.syncError') + ': ' + (err.response?.data?.error || err.message))
  } finally {
    syncing.value = false
  }
}

// ─── Open edit modals ─────────────────────────────────────────────────────────
function openEditProduct(product) {
  editingProduct.value = product
  const pid = String(product.id)
  const existing = stagedProducts.value[pid] || {}
  productForm.value = {
    title: existing.title ?? product.title,
    vendor: existing.vendor ?? product.vendor,
    product_type: existing.product_type ?? product.product_type,
    tags: existing.tags ?? product.tags,
    status: existing.status ?? product.status,
  }
}

function openEditVariant(product, variant) {
  editingVariant.value = { product, variant }
  const pid = String(product.id)
  const vid = String(variant.id)
  const existing = stagedVariants.value[pid]?.[vid] || {}
  variantForm.value = {
    sku: existing.sku ?? variant.sku,
    barcode: existing.barcode ?? variant.barcode,
    price: existing.price ?? variant.price,
    compare_at_price: existing.compare_at_price ?? variant.compare_at_price,
  }
}

// ─── Stage edits (no Shopify call yet) ───────────────────────────────────────
function stageProductEdit() {
  const product = editingProduct.value
  const pid = String(product.id)
  const diff = {}
  const fields = ['title', 'vendor', 'product_type', 'tags', 'status']
  for (const f of fields) {
    if (String(productForm.value[f] ?? '') !== String(product[f] ?? '')) {
      diff[f] = productForm.value[f]
    }
  }
  if (Object.keys(diff).length > 0) {
    stagedProducts.value = { ...stagedProducts.value, [pid]: diff }
  } else {
    // No actual change — remove any previous stage
    discardProductStage(pid)
  }
  editingProduct.value = null
}

function stageVariantEdit() {
  const { product, variant } = editingVariant.value
  const pid = String(product.id)
  const vid = String(variant.id)
  const diff = {}
  const fields = ['sku', 'barcode', 'price', 'compare_at_price']
  for (const f of fields) {
    if (String(variantForm.value[f] ?? '') !== String(variant[f] ?? '')) {
      diff[f] = variantForm.value[f]
    }
  }
  if (Object.keys(diff).length > 0) {
    const existing = { ...(stagedVariants.value[pid] || {}) }
    existing[vid] = diff
    stagedVariants.value = { ...stagedVariants.value, [pid]: existing }
  } else {
    discardVariantStage(pid, vid)
  }
  editingVariant.value = null
}

// ─── Commit modal ─────────────────────────────────────────────────────────────
function openCommitModal() {
  commitError.value = ''
  showCommitModal.value = true
}

async function commitChanges() {
  committing.value = true
  commitError.value = ''
  try {
    // Build batch payload
    const productUpdates = Object.entries(stagedProducts.value)
      .filter(([, changes]) => Object.keys(changes).length > 0)
      .map(([productId, changes]) => ({ productId, changes }))

    const variantUpdates = []
    for (const [productId, variantMap] of Object.entries(stagedVariants.value)) {
      for (const [variantId, changes] of Object.entries(variantMap)) {
        if (Object.keys(changes).length > 0) {
          variantUpdates.push({ productId, variantId, changes })
        }
      }
    }

    await api.post('/products/batch-update', { productUpdates, variantUpdates })

    // Clear staged changes and refresh
    stagedProducts.value = {}
    stagedVariants.value = {}
    showCommitModal.value = false
    await fetchProducts()
    alert(t('inventory.commitSuccess'))
  } catch (err) {
    commitError.value = t('inventory.commitError') + ': ' + (err.response?.data?.error || err.message)
  } finally {
    committing.value = false
  }
}

onMounted(async () => {
  await Promise.all([fetchProducts(), fetchLastSync()])
})
</script>

<style scoped>
.input-field {
  @apply w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm;
}
</style>
