import { defineStore } from 'pinia'
import axios from 'axios'

const api = axios.create({ baseURL: '/api', withCredentials: true })

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    loading: false,
    // 当前用户对 warehouse-manager 的权限
    warehousePermission: null, // null | 'viewer' | 'admin'
  }),
  getters: {
    isLoggedIn: (state) => !!state.user,
    isAdmin: (state) => state.user?.role === 'admin',
    isStaff: (state) => state.user?.role === 'staff' || state.user?.role === 'admin',
    isGuest: (state) => state.user?.role === 'guest',
    // 是否有写入权限（admin 全局角色 或 warehouse-manager permission = 'admin'）
    canWrite: (state) => {
      if (!state.user) return false
      if (state.user.role === 'admin') return true
      return state.warehousePermission === 'admin'
    },
    // 是否有读取权限（有 warehouse-manager 的任意权限记录）
    canRead: (state) => {
      if (!state.user) return false
      if (state.user.role === 'admin') return true
      return !!state.warehousePermission
    },
  },
  actions: {
    async fetchMe() {
      try {
        const res = await api.get('/auth/me')
        if (res.data.success) {
          this.user = res.data.user
          this.warehousePermission = res.data.user.warehousePermission || null
        } else {
          this.user = null
        }
      } catch {
        this.user = null
      }
    },
    async login(username, password) {
      this.loading = true
      try {
        const res = await api.post('/auth/login', { username, password })
        if (res.data.success) {
          this.user = res.data.user
          this.warehousePermission = res.data.user.warehousePermission || null
          return { success: true }
        }
        return { success: false, message: res.data.message }
      } catch (err) {
        return { success: false, message: err.response?.data?.message || '登录失败' }
      } finally {
        this.loading = false
      }
    },
    async logout() {
      await api.post('/auth/logout').catch(() => {})
      this.user = null
      this.warehousePermission = null
    },
  },
})
