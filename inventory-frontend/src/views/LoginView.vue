<template>
  <div class="login-page">
    <div class="login-card">
      <!-- Logo / Title -->
      <div class="login-logo">
        <span class="logo-icon">📦</span>
        <h1>Inventory Manager</h1>
        <p class="login-subtitle">Lummi in Colour</p>
      </div>

      <form @submit.prevent="handleLogin">
        <!-- 用户名 -->
        <div class="form-item">
          <label>用户名</label>
          <input
            v-model="form.username"
            type="text"
            placeholder="请输入用户名"
            autocomplete="username"
            class="form-input"
          />
        </div>

        <!-- 密码 -->
        <div class="form-item">
          <label>密码</label>
          <input
            v-model="form.password"
            type="password"
            placeholder="请输入密码"
            autocomplete="current-password"
            class="form-input"
            @keyup.enter="handleLogin"
          />
        </div>

        <!-- 错误提示 -->
        <div v-if="errorMsg" class="error-msg">{{ errorMsg }}</div>

        <!-- 登录按钮 -->
        <button type="submit" :disabled="loading" class="login-btn">
          {{ loading ? '登录中...' : '登录' }}
        </button>
      </form>

      <!-- 返回平台 -->
      <div class="back-link">
        <a :href="platformUrl">← 返回管理平台</a>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import axios from 'axios'

const router = useRouter()
const authStore = useAuthStore()
const api = axios.create({ baseURL: '/api', withCredentials: true })

const platformUrl = import.meta.env.VITE_PLATFORM_URL || 'http://localhost:5174'

const form = ref({ username: '', password: '' })
const loading = ref(false)
const errorMsg = ref('')

async function handleLogin() {
  if (!form.value.username || !form.value.password) {
    errorMsg.value = '请填写用户名和密码'
    return
  }
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await api.post('/auth/login', {
      username: form.value.username,
      password: form.value.password,
    })
    if (res.data.success) {
      authStore.user = res.data.user
      router.push('/')
    } else {
      errorMsg.value = res.data.message || '登录失败'
    }
  } catch (err) {
    errorMsg.value = err.response?.data?.message || '登录失败，请重试'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #F5EFE6;
}

.login-card {
  background: #fff;
  border: 1px solid #EFE7DD;
  border-radius: 16px;
  padding: 40px 36px;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
}

.login-logo {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-bottom: 32px;
}

.logo-icon {
  font-size: 48px;
}

.login-logo h1 {
  font-size: 20px;
  font-weight: 700;
  color: #1a1a2e;
  margin: 0;
}

.login-subtitle {
  font-size: 13px;
  color: #9ca3af;
  margin: 0;
}

.form-item {
  margin-bottom: 16px;
}

.form-item label {
  display: block;
  font-size: 14px;
  color: #374151;
  margin-bottom: 6px;
  font-weight: 500;
}

.form-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.form-input:focus {
  border-color: #7c3aed;
  box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.1);
}

.error-msg {
  color: #dc2626;
  font-size: 13px;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: #fef2f2;
  border-radius: 6px;
}

.login-btn {
  width: 100%;
  padding: 12px;
  background: #7c3aed;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  margin-top: 8px;
}

.login-btn:hover:not(:disabled) {
  background: #6d28d9;
}

.login-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.back-link {
  text-align: center;
  margin-top: 20px;
}

.back-link a {
  font-size: 13px;
  color: #7c3aed;
  text-decoration: none;
}

.back-link a:hover {
  text-decoration: underline;
}
</style>
