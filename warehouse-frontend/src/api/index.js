import axios from 'axios'
import router from '@/router'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      // 如果 URL 中有 sso_token，说明 SSO 登录正在进行，不要跳转到 /login
      const hasSsoToken = new URLSearchParams(window.location.search).has('sso_token')
      // 如果已经在登录页，也不要重复跳转
      const isOnLoginPage = window.location.pathname === '/login'
      if (!hasSsoToken && !isOnLoginPage) {
        // 使用 router.push 而非 window.location.href，避免页面重载循环
        router.push({ name: 'Login' }).catch(() => {})
      }
      return Promise.reject(new Error('未登录'))
    }
    const message = error.response?.data?.message || error.message || '请求失败'
    return Promise.reject(new Error(message))
  }
)

export default api

export const locationApi = {
  list: (params) => api.get('/locations', { params }),
  get: (id) => api.get(`/locations/${id}`),
  create: (data) => api.post('/locations', data),
  update: (id, data) => api.patch(`/locations/${id}`, data),
  delete: (id) => api.delete(`/locations/${id}`),
  getInventory: (id) => api.get(`/locations/${id}/inventory`),
  addInventory: (id, data) => api.post(`/locations/${id}/inventory`, data),
  updateInventory: (id, itemId, data) => api.patch(`/locations/${id}/inventory/${itemId}`, data),
  removeInventory: (id, itemId) => api.delete(`/locations/${id}/inventory/${itemId}`),
  transferInventory: (id, data) => api.post(`/locations/${id}/transfer`, data),
  setThreshold: (id, data) => api.patch(`/locations/${id}/threshold`, data),
  getHistory: (id) => api.get(`/locations/${id}/history`),
  scan: (token) => api.get(`/locations/scan/${token}`),
}

export const layoutApi = {
  list: () => api.get('/layouts'),
  getActive: () => api.get('/layouts/active'),
  get: (id) => api.get(`/layouts/${id}`),
  create: (data) => api.post('/layouts', data),
  update: (id, data) => api.put(`/layouts/${id}`, data),
  activate: (id) => api.post(`/layouts/${id}/activate`),
  delete: (id) => api.delete(`/layouts/${id}`),
}

export const pickingApi = {
  listTasks: (params) => api.get('/picking/tasks', { params }),
  getTask: (id) => api.get(`/picking/tasks/${id}`),
  createFromOrder: (data) => api.post('/picking/tasks/from-order', data),
  createFromExhibition: (data) => api.post('/picking/tasks/from-exhibition', data),
  pickLine: (taskId, lineId, data) => api.patch(`/picking/tasks/${taskId}/lines/${lineId}/pick`, data),
  getShopifyOrders: () => api.get('/picking/shopify-orders'),
  inventoryCheck: (variantIds) => api.get('/picking/inventory-check', { params: { shopify_variant_ids: variantIds.join(',') } }),
  deleteTask: (id) => api.delete(`/picking/tasks/${id}`),
  getExhibitions: () => api.get('/picking/exhibitions'),
}

export const productApi = {
  search: (search, limit) => api.get('/products', { params: { search, limit } }),
  getVariant: (variantId) => api.get(`/products/variant/${variantId}`),
  getExhibitions: () => api.get('/products/exhibitions'),
  getInboundShipments: () => api.get('/products/inbound-shipments'),
}

export const replenishmentApi = {
  getPendingCount: () => api.get('/replenishment/pending-count'),
  listTasks: () => api.get('/replenishment/tasks'),
  getTask: (id) => api.get(`/replenishment/tasks/${id}`),
  generateTask: (inbound_shipment_id) => api.post('/replenishment/generate', { inbound_shipment_id }),
  confirmLine: (lineId, confirmed_qty) => api.post(`/replenishment/lines/${lineId}/confirm`, { confirmed_qty }),
  skipLine: (lineId) => api.post(`/replenishment/lines/${lineId}/skip`),
  getBindings: (locationId) => api.get(`/replenishment/bindings/${locationId}`),
  createBinding: (data) => api.post('/replenishment/bindings', data),
  deleteBinding: (bindingId) => api.delete(`/replenishment/bindings/${bindingId}`),
  listInboundShipments: () => api.get('/replenishment/inbound-shipments'),
}

export const healthApi = {
  check: () => api.get('/health'),
}
