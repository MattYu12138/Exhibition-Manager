<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-language"><label for="login-language">{{ $t('common.language') }}</label>
        <select id="login-language" :value="language" @change="setLanguage($event.target.value)">
          <option value="zh">中文</option><option value="en">English</option>
        </select>
      </div>
      <!-- Logo / Title -->
      <div class="login-logo">
        <span class="logo-icon">🏭</span>
        <h1>{{ $t('common.appName') }}</h1>
        <p class="login-subtitle">Lummi in Colour</p>
      </div>

      <form @submit.prevent="handleLogin">
        <!-- 用户名 -->
        <div class="form-item">
          <label>{{ $t('login.username') }}</label>
          <input
            v-model="form.username"
            type="text"
            :placeholder="$t('login.usernamePlaceholder')"
            autocomplete="username"
            class="form-input"
          />
        </div>

        <!-- 密码 -->
        <div class="form-item">
          <label>{{ $t('login.password') }}</label>
          <input
            v-model="form.password"
            type="password"
            :placeholder="$t('login.passwordPlaceholder')"
            autocomplete="current-password"
            class="form-input"
            @keyup.enter="handleLogin"
          />
        </div>

        <!-- 错误提示 -->
        <div v-if="errorMsg" class="error-msg">{{ errorMsg }}</div>

        <!-- 登录按钮 -->
        <button type="submit" :disabled="loading" class="login-btn">
          {{ loading ? $t('login.signingIn') : $t('login.signIn') }}
        </button>
      </form>

      <!-- 返回平台 -->
      <div class="back-link">
        <a :href="platformUrl">← {{ $t('nav.backToPlatform') }}</a>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useI18n } from 'vue-i18n'
import i18n, { setLanguage, localizedError } from '@/i18n'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const { t } = useI18n()
const language = computed(() => i18n.global.locale.value)

const platformUrl = import.meta.env.VITE_PLATFORM_URL || 'https://licplatform.lummiincolour.com.au'

const form = ref({ username: '', password: '' })
const loading = ref(false)
const errorMsg = ref('')

async function handleLogin() {
  if (!form.value.username || !form.value.password) {
    errorMsg.value = t('login.required')
    return
  }
  loading.value = true
  errorMsg.value = ''

  const result = await authStore.login(form.value.username, form.value.password)

  loading.value = false
  if (result.success) {
    const redirect = route.query.redirect
    router.push(redirect && redirect !== '/login' ? redirect : '/warehouse')
  } else {
    errorMsg.value = result.message === '未登录' ? t('common.unauthorized') : localizedError({ message: result.message }, t, 'login.failed')
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
.login-language { display: flex; justify-content: flex-end; align-items: center; gap: 8px; font-size: 12px; color: #606266; margin: -14px -8px 12px 0; }
.login-language select { font: inherit; padding: 4px 6px; border-radius: 6px; border: 1px solid #d1d5db; background: #fff; }

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
  border-color: #0f3460;
  box-shadow: 0 0 0 2px rgba(15, 52, 96, 0.1);
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
  background: #0f3460;
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
  background: #16213e;
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
  color: #0f3460;
  text-decoration: none;
}

.back-link a:hover {
  text-decoration: underline;
}
</style>
