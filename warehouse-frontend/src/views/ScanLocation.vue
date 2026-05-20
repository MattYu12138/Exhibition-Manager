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

      <!-- 需要登录 -->
      <div v-else-if="needLogin" class="scan-login">
        <div class="scan-logo">
          <el-icon size="36" color="#0f3460"><Box /></el-icon>
          <h2>Warehouse Manager</h2>
        </div>
        <div class="location-badge">
          <span class="badge-label">货位</span>
          <span class="badge-code">{{ locationInfo?.code }}</span>
        </div>
        <p class="login-hint">请登录后录入货物</p>
        <el-form :model="loginForm" @submit.prevent="handleLogin">
          <el-input v-model="loginForm.username" placeholder="用户名" size="large" style="margin-bottom:12px" />
          <el-input v-model="loginForm.password" type="password" placeholder="密码" size="large" show-password style="margin-bottom:16px" @keyup.enter="handleLogin" />
          <el-button type="primary" size="large" style="width:100%" :loading="loginLoading" @click="handleLogin">
            登录并录入
          </el-button>
        </el-form>
        <p v-if="loginError" class="login-error">{{ loginError }}</p>
      </div>

      <!-- 录入界面 -->
      <div v-else class="scan-form">
        <div class="scan-logo">
          <el-icon size="28" color="#0f3460"><Box /></el-icon>
          <span>Warehouse Manager</span>
        </div>

        <div class="location-badge">
          <span class="badge-label">货位</span>
          <span class="badge-code">{{ locationInfo?.code }}</span>
        </div>
        <div class="location-meta">{{ locationInfo?.shelf_code }}</div>

        <!-- 当前库存摘要 -->
        <div v-if="locationInfo?.inventory?.length" class="current-stock">
          <div class="stock-title">当前库存 ({{ totalQty }} 件)</div>
          <div v-for="item in locationInfo.inventory.slice(0, 3)" :key="item.id" class="stock-item">
            <span class="stock-name">{{ item.product_title }} · {{ item.variant_title }}</span>
            <el-tag size="small" :type="item.stock_type === 'exhibition' ? 'warning' : 'primary'">{{ item.quantity }}</el-tag>
          </div>
          <div v-if="locationInfo.inventory.length > 3" class="stock-more">+{{ locationInfo.inventory.length - 3 }} 更多</div>
        </div>

        <el-divider>录入新货物</el-divider>

        <el-select
          v-model="form.shopify_variant_id"
          filterable
          remote
          :remote-method="searchProducts"
          :loading="searchLoading"
          placeholder="搜索商品名/SKU/条码..."
          style="width:100%;margin-bottom:12px"
          @change="onVariantSelect"
        >
          <el-option
            v-for="item in searchResults"
            :key="item.variant_id"
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
              <el-option label="零售货物" value="retail" />
              <el-option label="展会货物" value="exhibition" />
            </el-select>
          </el-col>
        </el-row>

        <el-select v-if="form.stock_type === 'exhibition'" v-model="form.exhibition_id" clearable placeholder="关联展会（可选）" style="width:100%;margin-bottom:12px">
          <el-option v-for="ex in exhibitions" :key="ex.id" :label="ex.name" :value="ex.id" />
        </el-select>

        <el-button type="primary" size="large" style="width:100%" :loading="submitLoading" @click="submitInventory">
          ✅ 确认录入
        </el-button>

        <div v-if="successMsg" class="success-msg">{{ successMsg }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { Box, Loading } from '@element-plus/icons-vue'

const route = useRoute()
const token = route.params.token

const loading = ref(true)
const error = ref('')
const needLogin = ref(false)
const locationInfo = ref(null)
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
  stock_type: 'retail',
  exhibition_id: null,
})

const totalQty = computed(() => locationInfo.value?.inventory?.reduce((s, i) => s + i.quantity, 0) || 0)

async function init() {
  try {
    const res = await axios.get(`/api/locations/scan/${token}`, { withCredentials: true })
    locationInfo.value = res.data.data
    const exRes = await axios.get('/api/products/exhibitions', { withCredentials: true })
    exhibitions.value = exRes.data?.data || []
    loading.value = false
  } catch (err) {
    if (err.response?.status === 401) {
      // 先获取货位基本信息
      try {
        const infoRes = await axios.get(`/api/locations/scan/${token}/info`, { withCredentials: true })
        locationInfo.value = infoRes.data?.data
      } catch {}
      needLogin.value = true
      loading.value = false
    } else {
      error.value = err.response?.data?.message || '二维码无效或已过期'
      loading.value = false
    }
  }
}

async function handleLogin() {
  loginLoading.value = true
  loginError.value = ''
  try {
    await axios.post('/api/auth/login', loginForm.value, { withCredentials: true })
    needLogin.value = false
    await init()
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

async function submitInventory() {
  if (!form.value.shopify_variant_id) {
    return
  }
  submitLoading.value = true
  successMsg.value = ''
  try {
    await axios.post(`/api/locations/${locationInfo.value.id}/inventory`, form.value, { withCredentials: true })
    successMsg.value = `✅ 已录入 ${selectedVariant.value?.title} × ${form.value.quantity}`
    form.value = { shopify_variant_id: null, quantity: 1, stock_type: 'retail', exhibition_id: null }
    selectedVariant.value = null
    await init()
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
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.scan-card {
  background: #fff;
  border-radius: 16px;
  padding: 28px 24px;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
}
.scan-loading, .scan-error { text-align: center; padding: 40px 0; }
.scan-loading p { margin-top: 16px; color: #909399; }
.error-icon { font-size: 48px; margin-bottom: 12px; }
.scan-error h2 { color: #F56C6C; margin-bottom: 8px; }
.scan-error p { color: #909399; font-size: 14px; }

.scan-logo { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; }
.scan-logo h2, .scan-logo span { font-size: 16px; font-weight: 700; color: #1a1a2e; }

.location-badge { display: flex; align-items: center; gap: 10px; background: linear-gradient(135deg, #1a1a2e, #0f3460); border-radius: 10px; padding: 12px 16px; margin-bottom: 8px; }
.badge-label { font-size: 12px; color: rgba(255,255,255,0.6); }
.badge-code { font-size: 24px; font-weight: 700; color: #fff; }
.location-meta { font-size: 12px; color: #909399; margin-bottom: 16px; }

.current-stock { background: #f9f9f9; border-radius: 8px; padding: 12px; margin-bottom: 16px; }
.stock-title { font-size: 12px; font-weight: 600; color: #909399; margin-bottom: 8px; }
.stock-item { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.stock-name { font-size: 12px; color: #606266; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px; }
.stock-more { font-size: 11px; color: #c0c4cc; margin-top: 4px; }

.form-label { font-size: 13px; color: #606266; margin-bottom: 6px; }

.selected-product { display: flex; align-items: center; gap: 10px; padding: 10px; background: #f5f7ff; border-radius: 8px; margin-bottom: 12px; }
.selected-thumb { width: 40px; height: 40px; object-fit: cover; border-radius: 6px; }
.selected-name { font-size: 13px; font-weight: 600; color: #303133; }
.selected-sku { font-size: 11px; color: #909399; }

.success-msg { text-align: center; margin-top: 12px; font-size: 14px; color: #67C23A; font-weight: 500; }
.login-hint { color: #606266; font-size: 13px; margin-bottom: 16px; }
.login-error { color: #F56C6C; font-size: 13px; text-align: center; margin-top: 8px; }
</style>
