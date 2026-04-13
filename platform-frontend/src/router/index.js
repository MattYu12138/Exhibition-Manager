import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import axios from 'axios'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/LoginView.vue'),
    meta: { public: true }
  },
  {
    path: '/',
    name: 'Dashboard',
    component: () => import('../views/DashboardView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/admin/users',
    name: 'UserManagement',
    component: () => import('../views/UserManagementView.vue'),
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/admin/database',
    name: 'DatabaseAdmin',
    component: () => import('../views/DatabaseAdminView.vue'),
    meta: { requiresAuth: true, requiresAdmin: true }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach(async (to, from, next) => {
  const auth = useAuthStore()

  // SSO 自动登录：子系统返回 platform 时携带 sso_token
  const ssoToken = to.query.sso_token
  if (ssoToken && !auth.isLoggedIn) {
    try {
      const res = await axios.post('/api/sso/login', { token: ssoToken }, { withCredentials: true })
      if (res.data.success) {
        auth.user = res.data.user
        const cleanQuery = { ...to.query }
        delete cleanQuery.sso_token
        return next({ path: to.path, query: cleanQuery, replace: true })
      }
    } catch (err) {
      console.warn('[SSO] platform 自动登录失败', err.message)
    }
  }

  if (!auth.user) {
    await auth.fetchMe()
  }
  if (to.meta.requiresAuth && !auth.isLoggedIn) {
    return next('/login')
  }
  if (to.meta.requiresAdmin && !auth.isAdmin) {
    return next('/')
  }
  if (to.path === '/login' && auth.isLoggedIn) {
    return next('/')
  }
  next()
})

export default router
