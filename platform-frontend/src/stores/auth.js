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
    isAdmin: (state) => state.user?.role === 'admin'
  },
  actions: {
    async login(username, password) {
      const res = await api.post('/auth/login', { username, password })
      this.user = res.data.user
      return res.data
    },
    async logout() {
      await api.post('/auth/logout')
      this.user = null
    },
    async fetchMe() {
      try {
        const res = await api.get('/auth/me')
        this.user = res.data
      } catch {
        this.user = null
      }
    }
  }
})
