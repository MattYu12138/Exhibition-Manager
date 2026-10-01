import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import axios from 'axios'
import { watch } from 'vue'
import i18n from '@/i18n'
// Barcode lookup is a core mobile workflow. Keep it in the entry bundle so an
// already-open mobile browser never needs a separately cached route chunk.
import BarcodeLookup from '@/views/BarcodeLookup.vue'
const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { titleKey: 'pageTitle.login', public: true },
  },
  {
    path: '/',
    redirect: '/warehouse',
  },
  {
    path: '/warehouse',
    name: 'WarehouseHome',
    component: () => import('@/views/WarehouseHome.vue'),
    meta: { titleKey: 'pageTitle.overview' },
  },
  {
    path: '/map',
    name: 'WarehouseMap',
    component: () => import('@/views/WarehouseMap.vue'),
    meta: { titleKey: 'pageTitle.map' },
  },
  {
    path: '/map/builder',
    name: 'MapBuilder',
    component: () => import('@/views/MapBuilder.vue'),
    meta: { titleKey: 'pageTitle.builder', requireAdmin: true },
  },
  {
    path: '/locations',
    name: 'LocationList',
    component: () => import('@/views/LocationList.vue'),
    meta: { titleKey: 'pageTitle.locations' },
  },
  {
    path: '/barcode',
    name: 'BarcodeLookup',
    component: BarcodeLookup,
    meta: { titleKey: 'pageTitle.barcodeLookup' },
  },
  {
    path: '/locations/:id',
    name: 'LocationDetail',
    component: () => import('@/views/LocationDetail.vue'),
    meta: { titleKey: 'pageTitle.locationDetail' },
  },
  {
    path: '/replenishment',
    name: 'Replenishment',
    component: () => import('@/views/Replenishment.vue'),
    meta: { titleKey: 'pageTitle.replenishment' },
  },
  {
    path: '/picking',
    name: 'PickingList',
    component: () => import('@/views/PickingList.vue'),
    meta: { titleKey: 'pageTitle.picking' },
  },
  {
    path: '/picking/:id',
    name: 'PickingDetail',
    component: () => import('@/views/PickingDetail.vue'),
    meta: { titleKey: 'pageTitle.pickingDetail' },
  },
  {
    path: '/scan/:token',
    name: 'ScanEntry',
    component: () => import('@/views/ScanLocation.vue'),
    meta: { titleKey: 'pageTitle.scan', public: true },
  },
]
const router = createRouter({
  history: createWebHistory(),
  routes,
})

// A user can keep the app open while a new deploy replaces fingerprinted
// route chunks. Reload once to obtain the fresh HTML manifest instead of
// leaving the router-view blank. The session guard prevents a reload loop if
// there is a genuine unrelated module error.
const staleChunkReloadKey = 'warehouse_stale_chunk_reloaded'
router.onError((error) => {
  const message = String(error?.message || error)
  const staleChunk = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(message)
  if (staleChunk && !sessionStorage.getItem(staleChunkReloadKey)) {
    sessionStorage.setItem(staleChunkReloadKey, '1')
    window.location.reload()
    return
  }
  console.error('[router] navigation error', error)
})

function updateTitle(route) {
  document.title = `${i18n.global.t(route.meta.titleKey || 'common.appName')} - Warehouse Manager`
}
watch(i18n.global.locale, () => updateTitle(router.currentRoute.value))
router.beforeEach(async (to) => {
  updateTitle(to)
  // 公开页面（登录页、扫码页）直接放行
  if (to.meta.public) return true
  const authStore = useAuthStore()
  // ── SSO 自动登录 ──────────────────────────────────────────────
  // 如果 URL 中携带了 sso_token，先用它向后端换取 session
  const ssoToken = to.query.sso_token
  if (ssoToken) {
    try {
      const res = await axios.post('/api/sso/login', { token: ssoToken }, { withCredentials: true })
      if (res.data.success) {
        // SSO 登录成功后，调用 fetchMe() 确认 session cookie 已被浏览器正确保存
        // 这一步至关重要：避免 session 尚未持久化时组件就发起 API 请求
        await authStore.fetchMe()
        // 移除 URL 中的 sso_token 参数，保持 URL 干净
        const cleanQuery = { ...to.query }
        delete cleanQuery.sso_token
        return { ...to, query: cleanQuery, replace: true }
      }
    } catch (err) {
      console.warn('[SSO] 自动登录失败，回退到手动登录', err.message)
    }
    // SSO 失败 → 跳转登录页
    return { name: 'Login', query: { redirect: to.path } }
  }
  // ─────────────────────────────────────────────────────────────
  // 如果 store 中没有用户信息，尝试从后端恢复 session
  if (!authStore.isLoggedIn) {
    await authStore.fetchMe()
  }
  // 未登录 → 跳转登录页
  if (!authStore.isLoggedIn) {
    return { name: 'Login', query: { redirect: to.fullPath } }
  }
  // 需要管理员权限（如地图构建器）
  if (to.meta.requireAdmin && !authStore.isAdmin) {
    return { name: 'WarehouseHome' }
  }
  return true
})
router.afterEach(() => sessionStorage.removeItem(staleChunkReloadKey))
export default router
