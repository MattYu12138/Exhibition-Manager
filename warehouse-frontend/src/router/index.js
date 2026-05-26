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

// 防止 SSO 登录时重复处理（一次性 token 只能用一次）
let ssoProcessing = false

router.beforeEach(async (to) => {
  document.title = `${to.meta.title || '仓库管理'} - Warehouse Manager`

  // 公开路由直接放行
  if (to.meta.public) return true

  const authStore = useAuthStore()
  const ssoToken = to.query.sso_token

  // ── SSO 自动登录 ──────────────────────────────────────────────────────────
  if (ssoToken && !ssoProcessing) {
    ssoProcessing = true
    try {
      const res = await axios.post('/api/sso/login', { token: ssoToken }, { withCredentials: true })
      if (res.data.success) {
        // SSO 后端已建立 session，再调用 fetchMe 确认 session cookie 已持久化
        await authStore.fetchMe()
        // 清除 URL 中的 sso_token 参数，避免重复使用
        const cleanQuery = { ...to.query }
        delete cleanQuery.sso_token
        ssoProcessing = false
        return { ...to, query: cleanQuery, replace: true }
      } else {
        console.warn('[SSO] 登录失败:', res.data.message)
      }
    } catch (err) {
      console.warn('[SSO] 自动登录失败', err.message)
    } finally {
      ssoProcessing = false
    }
  }

  // ── 普通 session 验证 ─────────────────────────────────────────────────────
  if (!authStore.isLoggedIn) {
    await authStore.fetchMe()
  }

  if (!authStore.isLoggedIn) {
    // 如果 URL 里还有 sso_token（说明 SSO 失败了），跳转登录页时保留 redirect
    const redirectPath = to.fullPath.replace(/[?&]sso_token=[^&]*/g, '').replace(/[?&]$/, '') || to.path
    return { name: 'Login', query: { redirect: redirectPath } }
  }

  if (to.meta.requireAdmin && !authStore.isAdmin) {
    return { name: 'WarehouseHome' }
  }

  if (to.meta.requireStaff && !authStore.isStaff) {
    return { name: 'WarehouseHome' }
  }

  return true
})

export default router
