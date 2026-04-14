import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

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
  if (ssoToken) {
    const result = await auth.ssoLogin(ssoToken)
    if (result.success) {
      const cleanQuery = { ...to.query }
      delete cleanQuery.sso_token
      return next({ path: to.path, query: cleanQuery, replace: true })
    }
    // SSO 失败则继续走正常流程（可能 localStorage 里有缓存）
  }

  // 始终向后端验证 session 是否有效（main.js 已在挂载前调用一次，这里处理路由切换场景）
  // 如果 auth.user 已从 localStorage 恢复，仍需后台验证确保 session 有效
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
