<template>
  <div class="login-page">
    <div class="login-card">
      <!-- Logo -->
      <div class="login-logo">
        <el-icon size="36" color="#0f3460"><Box /></el-icon>
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
          />
        </el-form-item>

        <!-- 验证码 -->
        <el-form-item :label="t('login.captcha')" prop="captcha">
          <div class="captcha-row">
            <el-input
              v-model="form.captcha"
              :placeholder="t('login.captchaPlaceholder')"
              size="large"
              style="flex: 1"
              @keyup.enter="handleLogin"
            />
            <div class="captcha-img" @click="refreshCaptcha" :title="t('login.refreshCaptcha')">
              <img v-if="captchaUrl" :src="captchaUrl" alt="captcha" />
              <div v-else class="captcha-loading">
                <el-icon class="is-loading"><Loading /></el-icon>
              </div>
            </div>
          </div>
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
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()

const formRef = ref(null)
const captchaUrl = ref('')
const form = ref({ username: '', password: '', captcha: '' })

const rules = {
  username: [{ required: true, message: t('login.usernameRequired'), trigger: 'blur' }],
  password: [{ required: true, message: t('login.passwordRequired'), trigger: 'blur' }],
  captcha: [{ required: true, message: t('login.captchaRequired'), trigger: 'blur' }],
}

function refreshCaptcha() {
  captchaUrl.value = `/api/auth/captcha?t=${Date.now()}`
  form.value.captcha = ''
}

async function handleLogin() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  const result = await authStore.login(form.value.username, form.value.password, form.value.captcha)
  if (result.success) {
    router.push('/')
  } else {
    ElMessage.error(result.message || t('login.loginFailed'))
    refreshCaptcha()
  }
}

onMounted(() => {
  refreshCaptcha()
})
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
}

.login-card {
  background: #fff;
  border-radius: 16px;
  padding: 40px 36px;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
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

.captcha-row {
  display: flex;
  gap: 12px;
  align-items: center;
  width: 100%;
}

.captcha-img {
  width: 120px;
  height: 40px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f0f4ff;
  transition: opacity 0.2s;
}

.captcha-img:hover {
  opacity: 0.8;
}

.captcha-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.captcha-loading {
  color: #909399;
  font-size: 20px;
}
</style>
