<template>
  <div class="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 flex items-center justify-center p-4">
    <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
      <!-- Logo / Title -->
      <div class="text-center mb-8">
        <div class="text-5xl mb-3">🌈</div>
        <h1 class="text-2xl font-bold text-gray-800">{{ t('platform.title') }}</h1>
        <p class="text-gray-500 mt-1">{{ t('platform.subtitle') }}</p>
      </div>

      <!-- Login Form -->
      <form @submit.prevent="handleLogin" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('platform.username') }}</label>
          <input
            v-model="form.username"
            type="text"
            required
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            :placeholder="t('platform.username')"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('platform.password') }}</label>
          <input
            v-model="form.password"
            type="password"
            required
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            :placeholder="t('platform.password')"
          />
        </div>

        <div v-if="error" class="text-red-500 text-sm text-center">{{ error }}</div>

        <button
          type="submit"
          :disabled="loading"
          class="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-50"
        >
          {{ loading ? '...' : t('platform.loginBtn') }}
        </button>
      </form>

      <!-- Language Toggle -->
      <div class="mt-6 text-center">
        <button @click="toggleLang" class="text-sm text-gray-400 hover:text-gray-600">
          {{ locale === 'zh' ? 'English' : '中文' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const { t, locale } = useI18n()
const router = useRouter()
const auth = useAuthStore()

const form = ref({ username: '', password: '' })
const error = ref('')
const loading = ref(false)

function toggleLang() {
  locale.value = locale.value === 'zh' ? 'en' : 'zh'
  localStorage.setItem('lang', locale.value)
}

async function handleLogin() {
  error.value = ''
  loading.value = true
  try {
    await auth.login(form.value.username, form.value.password)
    router.push('/')
  } catch {
    error.value = t('platform.loginError')
  } finally {
    loading.value = false
  }
}
</script>
