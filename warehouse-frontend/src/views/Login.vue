<template>
  <div class="login-page">
    <div class="login-card">
      <!-- Logo / Title -->
      <div class="login-logo">
        <span class="logo-icon">🏭</span>
        <h1>Warehouse Manager</h1>
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
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import axios from 'axios'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const api = axios.create({ baseURL: '/api', withCredentials: true })

const platformUrl = import.meta.env.VITE_PLATFORM_URL || 'https://licplatform.lummiincolour.com.au'

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
      const redirect = route.query.redirect
      router.push(redirect && redirect !== '/login' ? redirect : '/warehouse')
    } else {
      errorMsg.value = res.data.message || '登录失败'
    }
  } catch (err) {
    errorMsg.value = err.response?.data?.message || '登录失败，请重试'
  } finally {
 