import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import axios from 'axios'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/LoginView.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    name: 'InventoryDashboard',
    component: () => import('../views/InventoryDashboard.vue'),
    meta: { requiresAuth: true },
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach(async (to) => {
  if (to.meta.public) return true

  const authStore = useAuthStore()

  // ── SSO 自动登录 ──────────────────────────────────────────────
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
  // ─────────────────────────────────────────────────────────────

  if (!authStore.isLoggedIn) {
    await authStore.fetchMe()
  }

  if (!authStore.isLoggedIn) {
    return { name: 'Login' }
  }

  return true
})

export default router
