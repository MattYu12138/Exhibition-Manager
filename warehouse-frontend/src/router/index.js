import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import axios from 'axios'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { title: '登录', public: true },
  },
  {
    path: '/scan/:token',
    name: 'ScanLocation',
    component: () => import('@/views/ScanLocation.vue'),
    meta: { title: '扫码录入', public: true },
  },
  {
    path: '/',
    redirect: '/warehouse',
  },
  {
    path: '/warehouse',
    name: 'WarehouseHome',
    component: () => import('@/views/WarehouseHome.vue'),
    meta: { title: '仓库总览' },
  },
  {
    path: '/map',
    name: 'WarehouseMap',
    component: () => import('@/views/WarehouseMap.vue'),
    meta: { title: '仓库地图' },
  },
  {
    path: '/map/builder',
    name: 'MapBuilder',
    component: () => import('@/views/MapBuilder.vue'),
    meta: { title: '地图构建器', requireAdmin: true },
  },
  {
    path: '/locations',
    name: 'LocationList',
    component: () => import('@/views/LocationList.vue'),
    meta: { title: '货位管理' },
  },
  {
    path: '/locations/:id',
    name: 'LocationDetail',
    component: () => import('@/views/LocationDetail.vue'),
    meta: { title: '货位详情' },
  },
  {
    path: '/replenishment',
    name: 'Replenishment',
    component: () => import('@/views/Replenishment.vue'),
    meta: { title: '补货管理' },
  },
  {
    path: '/picking',
    name: 'PickingList',
    component: () => import('@/views/PickingList.vue'),
    meta: { title: '拣货任务' },
  },
  {
    path: '/picking/:id',
    name: 'PickingDetail',
    component: () => import('@/views/PickingDetail.vue'),
    meta: { title: '拣货导航' },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  document.title = `${to.meta.title || '仓库管理'} - Warehouse Manager`

  if (to.meta.public) return true

  const authStore = useAuthStore()

  // ── SSO 自动登录（与 inventory 保持完全一致）────────────────────────────
  const ssoToken = to.query.sso_token
  if (ssoToken && !authStore.isLoggedIn) {
    try {
      const res = await axios.post('/api/sso/login', { token: ssoToken }, { withCredentials: true })
      if (res.data.success) {
        authStore.user = res.data.user
        const cleanQuery = { ...to.query }
        delete cleanQuery.sso_token
        return { ...to, query: cleanQuery, replace: true }
      }
    } catch (err) {
      console.warn('[SSO] 自动登录失败', err.message)
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  if 