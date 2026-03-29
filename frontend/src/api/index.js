import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message = error.response?.data?.message || error.message || '请求失败'
    return Promise.reject(new Error(message))
  }
)

// ==================== 展会管理 ====================
export const exhibitionApi = {
  list: () => api.get('/exhibitions'),
  get: (id) => api.get(`/exhibitions/${id}`),
  create: (data) => api.post('/exhibitions', data),
  update: (id, data) => api.put(`/exhibitions/${id}`, data),
  delete: (id) => api.delete(`/exhibitions/${id}`),
  addItems: (id, items) => api.post(`/exhibitions/${id}/items`, { items }),
  updateItem: (id, itemId, data) => api.put(`/exhibitions/${id}/items/${itemId}`, data),
  checkProduct: (id, productId, checked) =>
    api.put(`/exhibitions/${id}/items/product/${productId}/check`, { checked }),
  deleteItem: (id, itemId) => api.delete(`/exhibitions/${id}/items/${itemId}`),
  copyTemplate: (sourceId, targetId) => api.post(`/exhibitions/${sourceId}/copy-to/${targetId}`),
}

// ==================== Shopify ====================
export const shopifyApi = {
  getProducts: (search) => api.get('/shopify/products', { params: search ? { search } : {} }),
  getProduct: (id) => api.get(`/shopify/products/${id}`),
}

// ==================== Square ====================
export const squareApi = {
  getCatalog: () => api.get('/square/catalog'),
  syncBefore: (exhibitionId) =>
    api.post('/square/sync', { exhibition_id: exhibitionId, sync_type: 'before' }),
  syncAfter: (exhibitionId) =>
    api.post('/square/sync', { exhibition_id: exhibitionId, sync_type: 'after' }),
  updateRemaining: (exhibitionId) =>
    api.post('/square/sync/update-remaining', { exhibition_id: exhibitionId }),
  getSnapshots: (exhibitionId) => api.get(`/square/snapshots/${exhibitionId}`),
}

// ==================== 健康检查 ====================
export const healthApi = {
  check: () => api.get('/health'),
}
