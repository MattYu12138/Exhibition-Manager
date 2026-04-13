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
  },
  actions: {
    async fetchMe() {
      try {
        const res = await api.get('/auth/me')
        this.user = res.data.user || res.data
      } catch {
        this.user = null
      }
    },
    async logout() {
      await api.post('/auth/logout').catch(() => {})
      this.user = null
    }
  }
})
