<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <header class="bg-white shadow-sm">
      <div class="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <span class="text-2xl">🌈</span>
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
            {{ t('users.title') }}
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
import axios from 'axios'

const { t, locale } = useI18n()
const router = useRouter()
const auth = useAuthStore()
const api = axios.create({ baseURL: '/api', withCredentials: true })

const systems = ref([])
const loading = ref(true)

function toggleLang() {
  locale.value = locale.value === 'zh' ? 'en' : 'zh'
  localStorage.setItem('lang', locale.value)
}

async function handleLogout() {
  await auth.logout()
  router.push('/login')
}

function openSystem(system) {
  window.location.href = system.url
}

onMounted(async () => {
  try {
    const res = await api.get('/systems')
    systems.value = res.data
  } finally {
    loading.value = false
  }
})
</script>
