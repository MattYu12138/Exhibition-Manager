<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <header class="bg-white shadow-sm">
      <div class="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <img src="@/assets/LIC_Logo.png" alt="logo" class="w-10 h-10 object-contain" />
          <div>
            <h1 class="text-lg font-bold text-gray-800">{{ t('platform.title') }}</h1>
            <p class="text-xs text-gray-500">{{ t('platform.subtitle') }}</p>
          </div>
        </div>
        <div class="flex items-center gap-4">
          <span class="text-sm text-gray-600">
            {{ t('platform.welcome') }}, <strong>{{ auth.user?.displayName }}</strong>
            <span class="ml-1 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
              {{ auth.user?.role === 'admin' ? t('platform.admin') : t('platform.staff') }}
            </span>
          </span>
          <button @click="toggleLang" class="text-xs text-gray-400 hover:text-gray-600 border rounded px-2 py-1">
            {{ locale === 'zh' ? 'EN' : '中文' }}
          </button>
          <router-link v-if="auth.isAdmin" to="/admin/users" class="text-sm text-purple-600 hover:underline">
            {{ t('userMgmt.pageTitle') }}
          </router-link>
          <router-link v-if="auth.isAdmin" to="/admin/database" class="text-sm text-red-600 hover:underline">
            {{ t('dbAdmin.pageTitle') }}
          </router-link>
          <button @click="handleLogout" class="text-sm text-gray-500 hover:text-red-500">
            {{ t('platform.logout') }}
          </button>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="max-w-6xl mx-auto px-4 py-10">
      <div class="text-center mb-10">
        <h2 class="text-2xl font-bold text-gray-800">{{ t('platform.selectSystem') }}</h2>
        <p class="text-gray-500 mt-2">{{ t('platform.selectSystemDesc') }}</p>
      </div>

      <div v-if="loading" class="text-center text-gray-400">Loading...</div>

      <div v-else-if="systems.length === 0" class="text-center text-gray-400 py-20">
        {{ t('platform.noAccess') }}
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div
          v-for="system in systems"
          :key="system.id"
          @click="openSystem(system)"
          class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 cursor-pointer hover:shadow-md hover:border-purple-200 transition group"
          :class="{ 'opacity-50 pointer-events-none': openingSystem === system.id }"
        >
          <div class="text-4xl mb-4">{{ system.icon }}</div>
          <h3 class="text-lg font-semibold text-gray-800 group-hover:text-purple-700">{{ system.display_name }}</h3>
          <p class="text-sm text-gray-500 mt-1 mb-4">{{ system.description }}</p>
          <div class="flex gap-2">
            <span v-if="system.can_read" class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
              {{ t('platform.readOnly') }}
            </span>
            <span v-if="system.can_write" class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
              {{ t('platform.readWrite') }}
            </span>
            <span v-if="openingSystem === system.id" class="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
              跳转中...
            </span>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { ElMessage } from 'element-plus'
import axios from 'axios'

const { t, locale } = useI18n()
const router = useRouter()
const auth = useAuthStore()
const api = axios.create({ baseURL: '/api', withCredentials: true })

const systems = ref([])
const loading = ref(true)
const openingSystem = ref(null)

function toggleLang() {
  locale.value = locale.value === 'zh' ? 'en' : 'zh'
  localStorage.setItem('lang', locale.value)
}

async function handleLogout() {
  await auth.logout()
  router.push('/login')
}

// 系统 name => SSO system 标识映射
const SYSTEM_SSO_MAP = {
  'exhibition-manager': 'exhibition',
  'inventory-manager': 'inventory',
}

async function openSystem(system) {
  const ssoSystem = SYSTEM_SSO_MAP[system.name]

  // 如果没有 SSO 映射，直接跳转
  if (!ssoSystem) {
    window.location.href = system.url
    return
  }

  openingSystem.value = system.id
  try {
    // 向 platform-backend 申请一次性 SSO token
    const res = await api.post('/sso/token', { system: ssoSystem })
    if (res.data.success) {
      // 携带 token 跳转到子系统，子系统前端会自动完成 SSO 登录
      window.location.href = `${system.url}?sso_token=${res.data.token}`
    } else {
      ElMessage.error('SSO 跳转失败，请重试')
    }
  } catch (err) {
    ElMessage.error('无法连接到认证服务')
  } finally {
    openingSystem.value = null
  }
}

onMounted(async () => {
  // 确保 session 已恢复（从其他子系统返回时 Pinia store 可能已有 user，
  // 但也可能是刚刚由 router guard 的 fetchMe 恢复的，这里再确认一次）
  if (!auth.user) {
    await auth.fetchMe()
  }
  try {
    const res = await api.get('/systems')
    systems.value = res.data
  } catch (err) {
    // 如果 401，说明 session 真的失效了，router guard 会处理跳转
    console.warn('[Dashboard] 加载系统列表失败:', err.message)
  } finally {
    loading.value = false
  }
})
</script>
