import { createRouter, createWebHistory } from 'vue-router'

const routes = [
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
    meta: { title: '创建展会' },
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
    meta: { title: '选择商品' },
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
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  document.title = `${to.meta.title || '展会管理'} - 展会备货系统`
})

export default router
