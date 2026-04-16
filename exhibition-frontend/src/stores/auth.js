import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const loading = ref(false)

  const isLoggedIn = computed(() => !!user.value)
  const isAdmin = computed(() => user.value?.role === 'admin')
  const isStaff = computed(() => user.value?.role === 'staff' || user.value?.role === 'admin')
  const isGuest = computed(() => user.value?.role === 'guest')
  const canEdit = computed(() => isStaff.value) // admin + staff 可编辑，guest 只读

  // 从后端获取当前登录用户（页面刷新时调用）
  async function fetchMe() {
    try {
      const res = await axios.get('/api/auth/me', { withCredentials: true })
      if (res.data.success) {
        user.value = res.data.user
      }
    } catch {
      user.value = null
    }
  }

  // 登录
  async function login(username, password) {
    loading.value = true
    try {
      const res = await axios.post('/api/auth/login', { username, password }, { withCredentials: true })
      if (res.data.success) {
        user.value = res.data.user
        return { success: true }
      }
      return { success: false, message: res.data.message }
    } catch (err) {
      return { success: false, message: err.response?.data?.message || '登录失败' }
    } finally {
      loading.value = false
    }
  }

  // 登出
  async function logout() {
    try {
      await axios.post('/api/auth/logout', {}, { withCredentials: true })
    } finally {
      user.value = null
    }
  }

  return { user, loading, isLoggedIn, isAdmin, isStaff, isGuest, canEdit, fetchMe, login, logout }
})
