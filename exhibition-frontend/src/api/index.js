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
    // Session 过期或未登录，跳转到登录页
    if (error.response?.status === 401) {
      window.location.href = '/login'
      return Promise.reject(new Error('未登录'))
    }
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
  clearItems: (id) => api.delete(`/exhibitions/${id}/items`),
  copyTemplate: (sourceId, targetId) => api.post(`/exhibitions/${sourceId}/copy-to/${targetId}`),
}
// ==================== Shopify ====================
export const shopifyApi = {
  // status: 'active' | 'draft' | 'archived' | 'unlisted'
  getProducts: (search, status, publishedStatus) => {
    const params = {}
    if (search) params.search = search
    if (publishedStatus === 'unlisted') {
      params.published_status = 'unlisted'
    } else if (status) {
      params.status = status
    }
    return api.get('/shopify/products', { params })
  },
  getProduct: (id) => api.get(`/shopify/products/${id}`),
  syncProducts: () => api.post('/shopify/sync-products'),
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
  createItems: (exhibitionId, items) =>
    api.post('/square/create-items', { exhibition_id: exhibitionId, items }),
}
// ==================== 健康检查 ====================
export const healthApi = {
  check: () => api.get('/health'),
}
