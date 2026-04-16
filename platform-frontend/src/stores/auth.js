import { defineStore } from 'pinia'
import axios from 'axios'

const api = axios.create({ baseURL: '/api', withCredentials: true })

const USER_CACHE_KEY = 'platform_user_cache'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    // 初始化时从 localStorage 读取缓存，避免页面刷新/后退时闪烁或显示空列表
    user: (() => {
      try { return JSON.parse(localStorage.getItem(USER_CACHE_KEY)) } catch { return null }
    })(),
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
          localStorage.setItem(USER_CACHE_KEY, JSON.stringify(res.data.user))
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
      localStorage.removeItem(USER_CACHE_KEY)
    },
    async fetchMe() {
      try {
        const res = await api.get('/auth/me')
        // 兼容 { success, user } 格式
        this.user = res.data.user || res.data
        // 同步更新 localStorage 缓存
        localStorage.setItem(USER_CACHE_KEY, JSON.stringify(this.user))
      } catch {
        // session 失效时清除缓存，强制重新登录
        this.user = null
        localStorage.removeItem(USER_CACHE_KEY)
      }
    },
    // SSO 登录（从子系统返回时使用）
    async ssoLogin(token) {
      try {
        const res = await api.post('/sso/login', { token })
        if (res.data.success) {
          this.user = res.data.user
          localStorage.setItem(USER_CACHE_KEY, JSON.stringify(res.data.user))
        }
        return res.data
      } catch (err) {
        return { success: false, message: err.response?.data?.message || 'SSO 登录失败' }
      }
    }
  }
})
