import { defineStore } from 'pinia'
import axios from 'axios'

const api = axios.create({ baseURL: '/api', withCredentials: true })

export const useAuthStore = defineStore('auth', {
  state: () => ({
    // 不再使用 localStorage 缓存用户身份，完全依赖后端 session
    // 避免切换用户/系统时 localStorage 残留旧身份导致混乱
    user: null,
    loading: false
  }),
  getters: {
    isLoggedIn: (state) => !!state.user,
    isAdmin: (state) => state.user?.role === 'admin',
    isStaff: (state) => state.user?.role === 'staff',
  },
  actions: {
    // 登录，返回 { success, message, user }
    async login(username, password) {
      this.loading = true
      try {
        const res = await api.post('/auth/login', { username, password })
        if (res.data.success) {
          this.user = res.data.user
        }
        return res.data
      } catch (err) {
        const message = err.response?.data?.message || '登录失败，请重试'
        return { success: false, message }
      } finally {
        this.loading = false
      }
    },
    async logout() {
      await api.post('/auth/logout').catch(() => {})
      this.user = null
    },
    async fetchMe() {
      try {
        const res = await api.get('/auth/me')
        // 兼容 { success, user } 格式
        this.user = res.data.user || res.data
      } catch {
        // session 失效时清空，强制重新登录
        this.user = null
      }
    },
    // SSO 登录（从子系统返回时使用）
    async ssoLogin(token) {
      try {
        const res = await api.post('/sso/login', { token })
        if (res.data.success) {
          this.user = res.data.user
        }
        return res.data
      } catch (err) {
        return { success: false, message: err.response?.data?.message || 'SSO 登录失败' }
      }
    }
  }
})
