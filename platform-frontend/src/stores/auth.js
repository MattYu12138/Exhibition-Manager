import { defineStore } from 'pinia'
import axios from 'axios'

const api = axios.create({ baseURL: '/api', withCredentials: true })

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    loading: false
  }),
  getters: {
    isLoggedIn: (state) => !!state.user,
    isAdmin: (state) => state.user?.role === 'admin',
    isStaff: (state) => state.user?.role === 'staff',
  },
  actions: {
    // 登录（含验证码），返回 { success, message, user }
    async login(username, password, captcha) {
      this.loading = true
      try {
        const res = await api.post('/auth/login', { username, password, captcha })
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
        this.user = null
      }
    }
  }
})
