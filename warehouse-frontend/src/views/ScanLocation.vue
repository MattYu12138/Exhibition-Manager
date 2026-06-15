<template>
  <div class="scan-page">
    <div class="scan-card">
      <!-- 加载中 -->
      <div v-if="loading" class="scan-loading">
        <el-icon class="is-loading" size="40" color="#409EFF"><Loading /></el-icon>
        <p>正在加载货位信息...</p>
      </div>
      <!-- 错误 -->
      <div v-else-if="error" class="scan-error">
        <div class="error-icon">❌</div>
        <h2>无效的二维码</h2>
        <p>{{ error }}</p>
      </div>
      <!-- 主界面（公开可见，登录后可操作） -->
      <div v-else class="scan-main">
        <!-- Logo + 货位信息 -->
        <div class="scan-logo">
          <el-icon size="28" color="#0f3460"><Box /></el-icon>
          <span>Warehouse Manager</span>
        </div>
        <div class="location-badge">
          <span class="badge-label">货位</span>
          <span class="badge-code">{{ locationData?.code }}</span>
        </div>
        <div class="location-meta" v-if="locationData?.shelf_code">{{ locationData.shelf_code }}</div>

        <!-- 未登录提示 -->
        <div v-if="!isLoggedIn" class="login-panel">
          <p class="login-hint">请登录后录入或修改货物</p>
          <el-form @submit.prevent="handleLogin">
            <el-input v-model="loginForm.username" placeholder="用户名" size="large" style="margin-bottom:10px" />
            <el-input v-model="loginForm.password" type="password" placeholder="密码" size="large" show-password style="margin-bottom:14px" @keyup.enter="handleLogin" />
            <el-button type="primary" size="large" style="width:100%" :loading="loginLoading" @click="handleLogin">
              登录
            </el-button>
          </el-form>
          <p v-if="loginError" class="login-error">{{ loginError }}</p>
          <!-- 未登录也可查看库存 -->
          <div v-if="inventory.length > 0" class="inv-preview">
            <div class="inv-preview-title">当前库存（{{ totalQty }} 件）</div>
            <div v-for="item in inventory" :key="item.id" class="inv-preview-item">
              <span class="inv-preview-name">{{ item.product_title }}</span>
              <span class="inv-preview-qty">× {{ item.quantity }}</span>
            </div>
          </div>
          <div v-else class="inv-preview">
            <el-empty description="此货位暂无库存" :image-size="50" />
          </div>
        </div>

        <!-- 已登录主界面 -->
        <div v-else>
          <el-tabs v-model="activeTab" class="scan-tabs">
            <!-- 查询/修改库存 Tab -->
            <el-tab-pane label="📦 当前库存" name="inventory">
              <div v-if="!inventory.length" class="empty-stock">
                <el-empty description="此货位暂无库存" :image-size="60" />
                <el-button type="primary" size="small" @click="activeTab = 'add'">+ 录入货物</el-button>
              </div>
              <div v-else>
                <div class="stock-summary">共 {{ totalQty }} 件货物</div>
                <div v-for="item in inventory" :key="item.id" class="inv-item">
                  <div class="inv-item-info">
                    <img v-if="item.image_url || item.main_image" :src="item.image_url || item.main_image" class="inv-thumb" />
                    <div v-else class="inv-thumb-placeholder">📦</div>
                    <div class="inv-item-text">
                      <div class="inv-product-name">{{ item.product_title }}</div>
                      <div class="inv-variant">{{ item.variant_title }}</div>
                      <div class="inv-sku">SKU: {{ item.sku }}</div>
                      <el-tag size="small" :type="item.stock_type === 'exhibition' ? 'warning' : item.stock_type === 'retail_storage' ? 'info' : 'primary'" style="margin-top:4px">
                        {{ stockTypeLabel(item.stock_type) }}
                      </el-tag>
                    </div>
                  </div>
                  <div class="inv-qty-row">
                    <div class="qty-label">数量</div>
                    <div class="qty-control">
                      <el-button text size="small" :disabled="item.quantity <= 0 || item._saving" @click="changeQty(item, -1)">
                        <el-icon><Minus /></el-icon>
                      </el-button>
                      <el-input-number
                        v-model="item.quantity"
                        :min="0"
                        :max="9999"
                        size="small"
                        controls-position="right"
                        style="width:90px"
                        :disabled="item._saving"
                      />
                      <el-button text size="small" :disabled="item._saving" @click="changeQty(item, 1)">
                        <el-icon><Plus /></el-icon>
                      </el-button>
                      <el-button
                        type="primary"
                        size="small"
                        :loading="item._saving"
                        :disabled="item.quantity === item._origQty"
                        @click="saveQty(item)"
                      >保存</el-button>
                    </div>
                    <div v-if="item._saveMsg" class="save-msg" :class="item._saveOk ? 'ok' : 'err'">{{ item._saveMsg }}</div>
                  </div>
                </div>
              </div>
            </el-tab-pane>

            <!-- 录入新货物 Tab -->
            <el-tab-pane label="➕ 录入货物" name="add">
              <el-select
                v-model="form.shopify_variant_id"
                filterable
                remote
                :remote-method="searchProducts"
                :loading="searchLoading"
                placeholder="搜索商品名/SKU..."
                style="width:100%;margin-bottom:12px"
                @change="onVariantSelect"
              >
                <el-option
                  v-for="item in searchResults"
                  :key="item.shopify_variant_id"
                  :label="`${item.title} - ${item.variant_title}`"
                  :value="item.shopify_variant_id"
                >
                  <div style="display:flex;justify-content:space-between">
                    <span>{{ item.title }} · {{ item.variant_title }}</span>
                    <span style="color:#909399;font-size:12px">{{ item.sku }}</span>
                  </div>
                </el-option>
              </el-select>
              <div v-if="selectedVariant" class="selected-product">
                <img v-if="selectedVariant.image_url" :src="selectedVariant.image_url" class="selected-thumb" />
                <div>
                  <div class="selected-name">{{ selectedVariant.title }}</div>
                  <div class="selected-sku">{{ selectedVariant.variant_title }} · {{ selectedVariant.sku }}</div>
                </div>
              </div>
              <el-row :gutter="12" style="margin-bottom:12px">
                <el-col :span="12">
                  <div class="form-label">数量</div>
                  <el-input-number v-model="form.quantity" :min="1" :max="9999" style="width:100%" size="large" />
                </el-col>
                <el-col :span="12">
                  <div class="form-label">类型</div>
                  <el-select v-model="form.stock_type" style="width:100%" size="large">
                    <el-option label="零售上架" value="retail_display" />
                    <el-option label="零售备库" value="retail_storage" />
                    <el-option label="展会货物" value="exhibition" />
                  </el-select>
                </el-col>
              </el-row>
              <el-select
                v-if="form.stock_type === 'exhibition'"
                v-model="form.exhibition_id"
                clearable
                placeholder="关联展会（可选）"
                style="width:100%;margin-bottom:12px"
              >
                <el-option v-for="ex in exhibitions" :key="ex.id" :label="ex.name" :value="ex.id" />
              </el-select>
              <el-button type="primary" size="large" style="width:100%" :loading="submitLoading" @click="submitInventory">
                ✅ 确认录入
              </el-button>
              <div v-if="successMsg" class="success-msg">{{ successMsg }}</div>
            </el-tab-pane>
          </el-tabs>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { Box, Loading, Plus, Minus } from '@element-plus/icons-vue'

const route = useRoute()
const token = route.params.token

const loading = ref(true)
const error = ref('')
const isLoggedIn = ref(false)
const locationData = ref(null)
const inventory = ref([])
const activeTab = ref('inventory')
const searchResults = ref([])
const searchLoading = ref(false)
const selectedVariant = ref(null)
const submitLoading = ref(false)
const successMsg = ref('')
const exhibitions = ref([])
const loginForm = ref({ username: '', password: '' })
const loginLoading = ref(false)
const loginError = ref('')
const form = ref({
  shopify_variant_id: null,
  quantity: 1,
  stock_type: 'retail_display',
  exhibition_id: null,
})

const totalQty = computed(() => inventory.value.reduce((s, i) => s + i.quantity, 0))

function stockTypeLabel(t) {
  return { retail_display: '上架中', retail_storage: '备库中', exhibition: '展会', retail: '零售' }[t] || t
}

function markInventory(items) {
  return items.map(item => ({
    ...item,
    _origQty: item.quantity,
    _saving: false,
    _saveMsg: '',
    _saveOk: true,
  }))
}

async function loadScanData() {
  try {
    const res = await axios.get(`/api/locations/scan/${token}`, { withCredentials: true })
    const data = res.data.data
    locationData.value = data.location
    inventory.value = markInventory(data.inventory || [])
    activeTab.value = data.inventory?.length ? 'inventory' : 'add'
  } catch (err) {
    if (err.response?.status === 404) {
      error.value = err.response?.data?.message || '二维码无效或已过期'
    } else if (err.response?.status !== 401) {
      error.value = err.response?.data?.message || '加载失败，请重试'
    }
  }
}

async function checkLogin() {
  try {
    await axios.get('/api/auth/me', { withCredentials: true })
    isLoggedIn.value = true
  } catch {
    isLoggedIn.value = false
  }
}

async function loadExhibitions() {
  try {
    const res = await axios.get('/api/products/exhibitions', { withCredentials: true })
    exhibitions.value = res.data?.data || []
  } catch {}
}

async function init() {
  loading.value = true
  await Promise.all([loadScanData(), checkLogin()])
  if (isLoggedIn.value) await loadExhibitions()
  loading.value = false
}

async function handleLogin() {
  loginLoading.value = true
  loginError.value = ''
  try {
    await axios.post('/api/auth/login', loginForm.value, { withCredentials: true })
    isLoggedIn.value = true
    await loadExhibitions()
    await loadScanData()
  } catch (err) {
    loginError.value = err.response?.data?.message || '登录失败'
  } finally {
    loginLoading.value = false
  }
}

async function searchProducts(query) {
  if (!query) return
  searchLoading.value = true
  try {
    const res = await axios.get('/api/products', { params: { search: query, limit: 20 }, withCredentials: true })
    searchResults.value = res.data?.data || []
  } finally {
    searchLoading.value = false
  }
}

function onVariantSelect(variantId) {
  selectedVariant.value = searchResults.value.find(r => r.shopify_variant_id === variantId) || null
}

function changeQty(item, delta) {
  item.quantity = Math.max(0, Math.min(9999, item.quantity + delta))
}

async function saveQty(item) {
  item._saving = true
  item._saveMsg = ''
  try {
    await axios.patch(
      `/api/locations/${locationData.value.id}/inventory/${item.id}`,
      { quantity: item.quantity, note: '扫码修改' },
      { withCredentials: true }
    )
    item._origQty = item.quantity
    item._saveOk = true
    item._saveMsg = '✅ 已保存'
    setTimeout(() => { item._saveMsg = '' }, 2000)
  } catch (err) {
    item._saveOk = false
    item._saveMsg = '❌ ' + (err.response?.data?.message || '保存失败')
  } finally {
    item._saving = false
  }
}

async function submitInventory() {
  if (!form.value.shopify_variant_id) {
    successMsg.value = '❌ 请先搜索并选择商品'
    return
  }
  submitLoading.value = true
  successMsg.value = ''
  try {
    await axios.post(`/api/locations/${locationData.value.id}/inventory`, form.value, { withCredentials: true })
    successMsg.value = `✅ 已录入 ${selectedVariant.value?.title || ''} × ${form.value.quantity}`
    form.value = { shopify_variant_id: null, quantity: 1, stock_type: 'retail_display', exhibition_id: null }
    selectedVariant.value = null
    searchResults.value = []
    await loadScanData()
    activeTab.value = 'inventory'
  } catch (err) {
    successMsg.value = '❌ ' + (err.response?.data?.message || '录入失败')
  } finally {
    submitLoading.value = false
  }
}

onMounted(init)
</script>

<style scoped>
.scan-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 20px;
}
.scan-card {
  background: #fff;
  border-radius: 16px;
  padding: 24px 20px;
  width: 100%;
  max-width: 480px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
}
.scan-loading, .scan-error { text-align: center; padding: 40px 0; }
.scan-loading p { margin-top: 16px; color: #909399; }
.error-icon { font-size: 48px; margin-bottom: 12px; }
.scan-error h2 { color: #F56C6C; margin-bottom: 8px; }
.scan-error p { color: #909399; font-size: 14px; }
.scan-logo { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
.scan-logo span { font-size: 16px; font-weight: 700; color: #1a1a2e; }
.location-badge {
  display: flex; align-items: center; gap: 10px;
  background: linear-gradient(135deg, #1a1a2e, #0f3460);
  border-radius: 10px; padding: 12px 16px; margin-bottom: 6px;
}
.badge-label { font-size: 12px; color: rgba(255,255,255,0.6); }
.badge-code { font-size: 24px; font-weight: 700; color: #fff; }
.location-meta { font-size: 12px; color: #909399; margin-bottom: 12px; }
.login-panel { margin-top: 12px; }
.login-hint { color: #606266; font-size: 13px; margin-bottom: 12px; }
.login-error { color: #F56C6C; font-size: 13px; text-align: center; margin-top: 8px; }
.inv-preview { margin-top: 16px; border-top: 1px solid #f0f0f0; padding-top: 12px; }
.inv-preview-title { font-size: 13px; font-weight: 600; color: #606266; margin-bottom: 8px; }
.inv-preview-item { display: flex; justify-content: space-between; font-size: 13px; color: #303133; padding: 4px 0; border-bottom: 1px solid #f5f5f5; }
.inv-preview-qty { color: #909399; }
.stock-summary { font-size: 12px; color: #909399; margin-bottom: 10px; }
.empty-stock { text-align: center; padding: 20px 0; }
.inv-item {
  border: 1px solid #ebeef5;
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 10px;
  background: #fafafa;
}
.inv-item-info { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 10px; }
.inv-thumb { width: 44px; height: 44px; object-fit: cover; border-radius: 6px; flex-shrink: 0; }
.inv-thumb-placeholder { width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; font-size: 22px; background: #f0f2f5; border-radius: 6px; flex-shrink: 0; }
.inv-item-text { flex: 1; min-width: 0; }
.inv-product-name { font-size: 13px; font-weight: 600; color: #303133; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.inv-variant { font-size: 12px; color: #606266; }
.inv-sku { font-size: 11px; color: #909399; }
.inv-qty-row { display: flex; flex-direction: column; gap: 6px; }
.qty-label { font-size: 12px; color: #606266; }
.qty-control { display: flex; align-items: center; gap: 6px; }
.save-msg { font-size: 12px; margin-top: 2px; }
.save-msg.ok { color: #67C23A; }
.save-msg.err { color: #F56C6C; }
.form-label { font-size: 13px; color: #606266; margin-bottom: 6px; }
.selected-product { display: flex; align-items: center; gap: 10px; padding: 10px; background: #f5f7ff; border-radius: 8px; margin-bottom: 12px; }
.selected-thumb { width: 40px; height: 40px; object-fit: cover; border-radius: 6px; }
.selected-name { font-size: 13px; font-weight: 600; color: #303133; }
.selected-sku { font-size: 11px; color: #909399; }
.success-msg { text-align: center; margin-top: 12px; font-size: 14px; color: #67C23A; font-weight: 500; }
.scan-tabs { margin-top: 4px; }
</style>
