import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { title: '登录', public: true },
  },
  {
    path: '/',
    redirect: '/exhibitions',
  },
  {
    path: '/exhibitions',
    name: 'ExhibitionList',
    component: () => import('@/views/ExhibitionList.vue'),
    meta: { title: '展会列表' },
  },
  {
    path: '/exhibitions/new',
    name: 'ExhibitionCreate',
    component: () => import('@/views/ExhibitionCreate.vue'),
    meta: { title: '创建展会', requireStaff: true },
  },
  {
    path: '/exhibitions/:id',
    name: 'ExhibitionDetail',
    component: () => import('@/views/ExhibitionDetail.vue'),
    meta: { title: '展会详情' },
  },
  {
    path: '/exhibitions/:id/select-products',
    name: 'SelectProducts',
    component: () => import('@/views/SelectProducts.vue'),
    meta: { title: '选择商品', requireStaff: true },
  },
  {
    path: '/exhibitions/:id/checklist',
    name: 'Checklist',
    component: () => import('@/views/Checklist.vue'),
    meta: { title: '清点清单' },
  },
  {
    path: '/exhibitions/:id/inventory',
    name: 'InventoryResult',
    component: () => import('@/views/InventoryResult.vue'),
    meta: { title: '库存差值' },
  },
  {
    path: '/users',
    name: 'UserManagement',
    component: () => import('@/views/UserManagement.vue'),
    meta: { title: '账号管理', requireAdmin: true },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  document.title = `${to.meta.title || '展会管理'} - 展会备货系统`

  // 公开页面（登录页）直接放行
  if (to.meta.public) return true

  const authStore = useAuthStore()

  // 如果 store 中没有用户信息，尝试从后端恢复 session
  if (!authStore.isLoggedIn) {
    await authStore.fetchMe()
  }

  // 未登录 → 跳转登录页
  if (!authStore.isLoggedIn) {
    return { name: 'Login', query: { redirect: to.fullPath } }
  }

  // 需要管理员权限
  if (to.meta.requireAdmin && !authStore.isAdmin) {
    return { name: 'ExhibitionList' }
  }

  // 需要员工权限（游客不可访问）
  if (to.meta.requireStaff && !authStore.isStaff) {
    return { name: 'ExhibitionList' }
  }

  return true
})

export default router
