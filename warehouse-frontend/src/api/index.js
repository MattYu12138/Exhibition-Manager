import axios from 'axios'

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
      window.location.href = '/login'
      return Promise.reject(new Error('未登录'))
    }
    const message = error.response?.data?.message || error.message || '请求失败'
    return Promise.reject(new Error(message))
  }
)

export const layoutApi = {
  list: () => api.get('/layouts'),
  getActive: () => api.get('/layouts/active'),
  get: (id) => api.get(`/layouts/${id}`),
  create: (data) => api.post('/layouts', data),
  update: (id, data) => api.put(`/layouts/${id}`, data),
  activate: (id) => api.patch(`/layouts/${id}/activate`),
  delete: (id) => api.delete(`/layouts/${id}`),
}

export const locationApi = {
  list: (params) => api.get('/locations', { params }),
  scan: (token) => api.get(`/locations/scan/${token}`),
  get: (id) => api.get(`/locations/${id}`),
  getQrCode: (id) => api.get(`/locations/${id}/qrcode`),
  addInventory: (id, data) => api.post(`/locations/${id}/inventory`, data),
  adjustInventory: (id, invId, data) => api.patch(`/locations/${id}/inventory/${invId}`, data),
  deleteInventory: (id, invId) => api.delete(`/locations/${id}/inventory/${invId}`),
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
