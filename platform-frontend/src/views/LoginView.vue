<template>
  <div class="login-page">
    <div class="login-card">
      <!-- Logo -->
      <div class="login-logo">
        <img class="login-logo-img" src="@/assets/LIC_Logo.png" alt="logo">
        <h1>{{ t('nav.appTitle') }}</h1>
      </div>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        @submit.prevent="handleLogin"
      >
        <!-- 用户名 -->
        <el-form-item :label="t('login.username')" prop="username">
          <el-input
            v-model="form.username"
            :placeholder="t('login.usernamePlaceholder')"
            size="large"
            prefix-icon="User"
            autocomplete="username"
          />
        </el-form-item>

        <!-- 密码 -->
        <el-form-item :label="t('login.password')" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            :placeholder="t('login.passwordPlaceholder')"
            size="large"
            prefix-icon="Lock"
            show-password
            autocomplete="current-password"
            @keyup.enter="handleLogin"
          />
        </el-form-item>

        <!-- 登录按钮 -->
        <el-form-item>
          <el-button
            type="primary"
            size="large"
            :loading="authStore.loading"
            style="width: 100%; margin-top: 8px"
            @click="handleLogin"
          >
            {{ t('login.loginBtn') }}
          </el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()

const formRef = ref(null)
const form = ref({ username: '', password: '' })

const rules = {
  username: [{ required: true, message: t('login.usernameRequired'), trigger: 'blur' }],
  password: [{ required: true, message: t('login.passwordRequired'), trigger: 'blur' }],
}

async function handleLogin() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  const result = await authStore.login(form.value.username, form.value.password)
  if (result.success) {
    router.push('/')
  } else {
    ElMessage.error(result.message || t('login.loginFailed'))
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

.login-logo-img {
  width: 100px;
  height: 100px;
  object-fit: contain;
}

.login-card {
  background: #fff;
  border-color: #EFE7DD;
  border-radius: 16px;
  padding: 40px 36px;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.06);
}

.login-logo {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-bottom: 32px;
}

.login-logo h1 {
  font-size: 20px;
  font-weight: 700;
  color: #1a1a2e;
  text-align: center;
}
</style>
