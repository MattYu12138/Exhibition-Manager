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
          :class="product.hasDuplicate ? 'border-l-4 border-orange-400' : ''"
        >
          <!-- Product Header -->
          <div class="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50"
            @click="toggleProduct(product.id)">
            <div class="flex items-center gap-3">
              <span v-if="product.hasDuplicate" class="text-orange-500 text-lg">⚠</span>
              <div>
                <div class="font-medium text-gray-800">{{ product.title }}</div>
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
                  :class="(variant.hasDuplicateSKU || variant.hasDuplicateBarcode) ? 'bg-orange-50' : ''">
                  <td class="px-4 py-2 text-gray-700">{{ variant.title }}</td>
                  <td class="px-4 py-2">
                    <span :class="variant.hasDuplicateSKU ? 'text-red-600 font-semibold' : 'text-gray-600'">
                      {{ variant.sku || '-' }}
                    </span>
                  </td>
                  <td class="px-4 py-2">
                    <span :class="variant.hasDuplicateBarcode ? 'text-red-600 font-semibold' : 'text-gray-600'">
                      {{ variant.barcode || '-' }}
                    </span>
                  </td>
                  <td class="px-4 py-2 text-gray-600">${{ variant.price }}</td>
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

    <!-- Edit Product Modal -->
    <div v-if="editingProduct" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div class="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl">
        <h2 class="text-lg font-bold mb-4">{{ t('inventory.editProduct') }}</h2>
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
        <div v-if="saveError" class="text-red-500 text-sm mt-2">{{ saveError }}</div>
        <div class="flex gap-3 mt-4">
          <button @click="saveProduct" :disabled="saving" class="flex-1 bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50">
            {{ saving ? '...' : t('inventory.save') }}
          </button>
          <button @click="editingProduct = null" class="flex-1 border py-2 rounded-lg hover:bg-gray-50">{{ t('inventory.cancel') }}</button>
        </div>
      </div>
    </div>

    <!-- Edit Variant Modal -->
    <div v-if="editingVariant" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div class="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl">
        <h2 class="text-lg font-bold mb-1">{{ t('inventory.editVariant') }}</h2>
        <p class="text-sm text-gray-500 mb-4">{{ editingVariant.product.title }} — {{ editingVariant.variant.title }}</p>
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
        <div v-if="saveError" class="text-red-500 text-sm mt-2">{{ saveError }}</div>
        <div class="flex gap-3 mt-4">
          <button @click="saveVariant" :disabled="saving" class="flex-1 bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50">
            {{ saving ? '...' : t('inventory.save') }}
          </button>
          <button @click="editingVariant = null" class="flex-1 border py-2 rounded-lg hover:bg-gray-50">{{ t('inventory.cancel') }}</button>
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

const products = ref([])
const summary = ref({ total: 0, withDuplicates: 0, duplicateSKUs: 0, duplicateBarcodes: 0 })
const lastSync = ref(null)
const loading = ref(true)
const syncing = ref(false)
const searchQuery = ref('')
const showDuplicatesOnly = ref(false)
const expandedProducts = ref(new Set())
const activeStatus = ref('all')

const editingProduct = ref(null)
const editingVariant = ref(null)
const productForm = ref({})
const variantForm = ref({})
const saving = ref(false)
const saveError = ref('')

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

async function fetchProducts() {
  loading.value = true
  try {
    const params = activeStatus.value !== 'all' ? { status: activeStatus.value } : {}
    const res = await api.get('/products', { params })
    products.value = res.data.products
    summary.value = res.data.summary
    // Auto-expand products with duplicates
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
    alert(t('inventory.syncSuccess'))
  } catch (err) {
    alert(t('inventory.syncError') + ': ' + (err.response?.data?.error || err.message))
  } finally {
    syncing.value = false
  }
}

function openEditProduct(product) {
  editingProduct.value = product
  productForm.value = {
    title: product.title,
    vendor: product.vendor,
    product_type: product.product_type,
    tags: product.tags,
    status: product.status
  }
  saveError.value = ''
}

function openEditVariant(product, variant) {
  editingVariant.value = { product, variant }
  variantForm.value = {
    sku: variant.sku,
    barcode: variant.barcode,
    price: variant.price,
    compare_at_price: variant.compare_at_price
  }
  saveError.value = ''
}

async function saveProduct() {
  saving.value = true
  saveError.value = ''
  try {
    await api.put(`/products/${editingProduct.value.id}`, productForm.value)
    editingProduct.value = null
    await fetchProducts()
    alert(t('inventory.saveSuccess'))
  } catch (err) {
    saveError.value = t('inventory.saveError') + ': ' + (err.response?.data?.error || err.message)
  } finally {
    saving.value = false
  }
}

async function saveVariant() {
  saving.value = true
  saveError.value = ''
  try {
    const { product, variant } = editingVariant.value
    await api.put(`/products/${product.id}/variants/${variant.id}`, variantForm.value)
    editingVariant.value = null
    await fetchProducts()
    alert(t('inventory.saveSuccess'))
  } catch (err) {
    saveError.value = t('inventory.saveError') + ': ' + (err.response?.data?.error || err.message)
  } finally {
    saving.value = false
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
