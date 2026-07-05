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
  getSyncStatus: (exhibitionId) => api.get(`/square/sync-status/${exhibitionId}`),
  syncBefore: (exhibitionId, force = false) =>
    api.post('/square/sync', { exhibition_id: exhibitionId, sync_type: 'before', force }),
  syncAfter: (exhibitionId) =>
    api.post('/square/sync', { exhibition_id: exhibitionId, sync_type: 'after' }),
  updateRemaining: (exhibitionId) =>
    api.post('/square/sync/update-remaining', { exhibition_id: exhibitionId }),
  getSnapshots: (exhibitionId) => api.get(`/square/snapshots/${exhibitionId}`),
  createItems: (exhibitionId, items) =>
    api.post('/square/create-items', { exhibition_id: exhibitionId, items }),
  // 展中补货
  replenishmentCheck: (exhibitionId) => api.get(`/square/replenishment-check/${exhibitionId}`),
  replenishmentConfirm: (exhibitionId, items) =>
    api.post('/square/replenishment-confirm', { exhibition_id: exhibitionId, items }),
  replenishmentLog: (exhibitionId) => api.get(`/square/replenishment-log/${exhibitionId}`),
}
// ==================== 健康检查 ====================
export const healthApi = {
  check: () => api.get('/health'),
}
// ==================== 分类管理 ====================
export const categoriesApi = {
  getAll: () => api.get('/categories'),
  create: (data) => api.post('/categories', data),
  update: (id, data) => api.put(`/categories/${id}`, data),
  delete: (id) => api.delete(`/categories/${id}`),
}
// ==================== 图表分析 ====================
export const analyticsApi = {
  overview: () => api.get('/analytics/overview'),
  byCategory: () => api.get('/analytics/by-category'),
  checklistProgress: () => api.get('/analytics/checklist-progress'),
  topProducts: (params) => api.get('/analytics/top-products', { params }),
  rackStock: () => api.get('/analytics/rack-stock'),
  schema: () => api.get('/analytics/schema'),
  query: (sql) => api.post('/analytics/query', { sql }),
  aiStatus: () => api.get('/analytics/ai-status'),
  aiToSql: (prompt) => api.post('/analytics/ai-to-sql', { prompt }),
  categoryDrilldown: (product_type, exhibition_id) =>
    api.get('/analytics/category-drilldown', { params: { product_type, exhibition_id } }),
}
