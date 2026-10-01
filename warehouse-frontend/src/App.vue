<template>
  <el-config-provider :locale="elementLocale">
  <div class="app-wrapper">
    <el-header v-if="!isHiddenNavPage" class="app-header">
      <div class="header-inner">
        <div class="logo" @click="$router.push('/warehouse')">
          <el-icon size="22" color="#fff"><Box /></el-icon>
          <span>{{ $t('common.appName') }}</span>
        </div>
        <div class="header-nav">
          <el-button text :style="{ color: '#fff' }" @click="$router.push('/warehouse')">
            <el-icon><HomeFilled /></el-icon> {{ $t('nav.overview') }}
          </el-button>
          <el-button text :style="{ color: '#fff' }" @click="$router.push('/map')">
            <el-icon><MapLocation /></el-icon> {{ $t('nav.map') }}
          </el-button>
          <el-button text :style="{ color: '#fff' }" @click="$router.push('/locations')">
            <el-icon><Grid /></el-icon> {{ $t('nav.locations') }}
          </el-button>
          <el-button text :style="{ color: '#fff' }" @click="$router.push('/picking')">
            <el-icon><List /></el-icon> {{ $t('nav.picking') }}
          </el-button>
          <el-button text :style="{ color: '#fff', position: 'relative' }" @click="$router.push('/replenishment')">
            🚚 {{ $t('nav.replenishment') }}
            <span v-if="pendingReplenishCount > 0" class="nav-badge">{{ pendingReplenishCount }}</span>
          </el-button>
          <el-button v-if="authStore.isAdmin" text :style="{ color: '#fff' }" @click="$router.push('/map/builder')">
            <el-icon><Setting /></el-icon> {{ $t('nav.builder') }}
          </el-button>
        </div>
        <div class="header-user">
          <el-select v-if="warehouseStore.layouts.length" :model-value="warehouseStore.selectedLayoutId"
            :placeholder="$t('nav.selectWarehouse')" :aria-label="$t('nav.selectWarehouse')"
            class="warehouse-selector" size="small" @change="warehouseStore.selectLayout">
            <el-option v-for="layout in warehouseStore.layouts" :key="layout.id"
              :value="layout.id" :label="`${layout.name} · #${String(layout.id).slice(-6)}`" />
          </el-select>
          <el-select :model-value="language" class="language-selector" size="small"
            :aria-label="$t('common.language')" @change="setLanguage">
            <el-option value="zh" :label="$t('common.chinese')" />
            <el-option value="en" :label="$t('common.english')" />
          </el-select>
          <el-tag v-if="authStore.user" size="small" :type="authStore.isAdmin ? 'danger' : authStore.isStaff ? 'warning' : 'info'">
            {{ authStore.user.username }}
          </el-tag>
          <button class="back-btn" @click="backToPlatform" :title="$t('nav.backToPlatform')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            {{ $t('nav.backToPlatform') }}
          </button>
          <el-button text :style="{ color: 'rgba(255,255,255,0.6)', fontSize: '13px' }" @click="handleLogout">{{ $t('nav.logout') }}</el-button>
        </div>
      </div>
    </el-header>
    <el-main class="app-main" :class="{ 'no-header': isHiddenNavPage, 'wide-map': isMapPage }">
      <router-view v-slot="{ Component, route }">
        <transition name="page-fade" mode="out-in">
          <component :is="Component" :key="route.path" />
        </transition>
      </router-view>
    </el-main>
  </div>
  </el-config-provider>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { replenishmentApi } from '@/api/index.js'
import axios from 'axios'
import { Box, HomeFilled, MapLocation, Grid, List, Setting } from '@element-plus/icons-vue'
import { useWarehouseStore } from '@/stores/warehouse'
import i18n, { setLanguage } from '@/i18n'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import en from 'element-plus/es/locale/lang/en'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const warehouseStore = useWarehouseStore()
const language = computed(() => i18n.global.locale.value)
const elementLocale = computed(() => language.value === 'en' ? en : zhCn)
const isMapPage = computed(() => route.name === 'WarehouseMap' || route.name === 'MapBuilder')

const isHiddenNavPage = computed(() =>
  route.name === 'Login' || route.name === 'ScanLocation'
)

const pendingReplenishCount = ref(0)

// 监听登录状态变化，登录成功后再请求补货数量
// 避免 SSO 登录过程中（session 尚未建立）就发起 API 请求导致 401
watch(
  () => authStore.isLoggedIn,
  async (loggedIn) => {
    if (loggedIn) {
      await warehouseStore.loadLayouts().catch(() => {})
      try {
        const res = await replenishmentApi.getPendingCount()
        pendingReplenishCount.value = res.data?.count || 0
      } catch {}
    } else {
      pendingReplenishCount.value = 0
    }
  },
  { immediate: true }
)

watch(() => warehouseStore.selectedLayoutId, async () => {
  if (!authStore.isLoggedIn) return
  try {
    const res = await replenishmentApi.getPendingCount()
    pendingReplenishCount.value = res.data?.count || 0
  } catch { pendingReplenishCount.value = 0 }
})

async function backToPlatform() {
  try {
    const res = await axios.post('/api/sso/return-token', {}, { withCredentials: true })
    if (res.data.success) {
      const platformUrl = import.meta.env.VITE_PLATFORM_URL || 'https://licplatform.lummiincolour.com.au'
      window.location.href = `${platformUrl}/?sso_token=${res.data.token}`
    } else {
      window.location.href = import.meta.env.VITE_PLATFORM_URL || 'https://licplatform.lummiincolour.com.au'
    }
  } catch {
    window.location.href = import.meta.env.VITE_PLATFORM_URL || 'https://licplatform.lummiincolour.com.au'
  }
}

async function handleLogout() {
  await authStore.logout()
  router.push('/login')
}
</script>

<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f6fa; color: #303133; }
.app-wrapper { display: flex; flex-direction: column; min-height: 100vh; }
.app-header {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  height: 56px !important; padding: 0; position: sticky; top: 0; z-index: 1000;
  box-shadow: 0 2px 12px rgba(0,0,0,0.3);
}
.header-inner { display: flex; align-items: center; height: 100%; padding: 0 20px; gap: 8px; }
.logo { display: flex; align-items: center; gap: 8px; cursor: pointer; color: #fff; font-weight: 700; font-size: 16px; white-space: nowrap; margin-right: 12px; }
.header-nav { display: flex; align-items: center; gap: 2px; flex: 1; min-width: 0; overflow-x: auto; }
.header-user { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.warehouse-selector { width: 185px; flex-shrink: 0; }
.language-selector { width: 90px; flex-shrink: 0; }

/* 返回平台按钮 */
.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  background: rgba(255,255,255,0.12);
  border: 1px solid rgba(255,255,255,0.25);
  border-radius: 20px;
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s, transform 0.15s;
  white-space: nowrap;
}
.back-btn:hover {
  background: rgba(255,255,255,0.22);
  border-color: rgba(255,255,255,0.5);
  transform: translateX(-2px);
}
.back-btn svg { flex-shrink: 0; }

/* 导航补货红点 */
.nav-badge {
  position: absolute;
  top: 2px; right: 2px;
  background: #f56c6c;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  border-radius: 10px;
  padding: 1px 4px;
  min-width: 14px;
  text-align: center;
  line-height: 14px;
  pointer-events: none;
}

.app-main { flex: 1; padding: 24px; max-width: 1400px; margin: 0 auto; width: 100%; }
.app-main.no-header { max-width: 100%; padding: 0; }
.app-main.wide-map { max-width: none; }
@media (max-width: 1500px) {
  .app-header { height: auto !important; min-height: 56px; }
  .header-inner { min-height: 56px; flex-wrap: wrap; padding: 8px 16px; }
  .header-nav { order: 3; flex: 1 0 100%; width: 100%; padding-bottom: 3px; overflow-x: auto; }
  .header-user { margin-left: auto; }
}
@media (max-width: 720px) {
  .header-inner { gap: 4px; padding: 7px 10px; }
  .header-user { flex-wrap: wrap; justify-content: flex-end; }
  .warehouse-selector { width: 150px; }
  .language-selector { width: 84px; }
  .back-btn { font-size: 0; padding: 7px; }
  .app-main { padding: 12px; }
}
.page-fade-enter-active, .page-fade-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.page-fade-enter-from { opacity: 0; transform: translateY(8px); }
.page-fade-leave-to { opacity: 0; transform: translateY(-8px); }
.el-card { border-radius: 12px !important; box-shadow: 0 2px 12px rgba(0,0,0,0.08) !important; }
</style>
