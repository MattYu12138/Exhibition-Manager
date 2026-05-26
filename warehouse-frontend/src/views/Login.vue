<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-logo">
        <el-icon size="40" color="#0f3460"><Box /></el-icon>
        <h1>Warehouse Manager</h1>
        <p>仓库管理系统</p>
      </div>

      <!-- SSO 自动登录中 -->
      <div v-if="ssoLoading" class="sso-loading">
        <el-icon class="is-loading" size="24"><Loading /></el-icon>
        <p>正在通过平台账号登录...</p>
      </div>

      <!-- 手动登录表单 -->
      <template v-else>
        <el-form ref="formRef" :model="form" :rules="rules" @submit.prevent="handleLogin">
          <el-form-item prop="username">
            <el-input v-model="form.username" placeholder="用户名" size="large" prefix-icon="User" />
          </el-form-item>
          <el-form-item prop="password">
            <el-input v-model="form.password" type="password" placeholder="密码" size="large" prefix-icon="Lock" show-password @keyup.enter="handleLogin" />
          </el-form-item>
          <el-button type="primary" size="large" :loading="loading" style="width:100%;margin-top:8px" @click="handleLogin">
            登录
          </el-button>
        </el-form>
        <p v-if="error" class="error-msg">{{ error }}</p>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import axios from 'axios'
import { Box, Loading } from '@element-plus/icons-vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const form = ref({ username: '', password: '' })
const loading = ref(false)
const ssoLoading = ref(false)
const error = ref('')
const formRef = ref(null)

const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

// 兜底：如果路由守卫没处理 sso_token（极少数情况），Login 页自己处理
onMounted(async () => {
  const ssoToken = route.query.sso_token
  if (ssoToken) {
    ssoLoading.value = true
    try {
      const res = await axios.post('/api/sso/login', { token: ssoToken }, { withCredentials: true })
      if (res.data.success) {
        await authStore.fetchMe()
        if (authStore.isLoggedIn) {
          const redirect = route.query.redirect || '/warehouse'
          router.replace(redirect)
          return
        }
      }
      error.value = 'SSO 自动登录失败，请手动输入账号密码'
    } catch (err) {
      error.value = 'SSO 登录出错，请手动输入账号密码'
    } finally {
      ssoLoading.value = false
    }
  }
})

async function handleLogin() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  loading.value = true
  error.value = ''
  const result = await authStore.login(form.value.username, form.value.password)
  loading.value = false
  if (result.success) {
    const redirect = route.query.redirect || '/warehouse'
    router.push(redirect)
  } else {
    error.value = result.message || '登录失败'
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  display: flex;
  align-items: center;
  justify-content: center;
}
.login-card {
  background: #fff;
  border-radius: 16px;
  padding: 40px;
  width: 360px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
}
.login-logo {
  text-align: center;
  margin-bottom: 32px;
}
.login-logo h1 {
  font-size: 20px;
  font-weight: 700;
  color: #1a1a2e;
  margin: 12px 0 4px;
}
.login-logo p {
  color: #909399;
  font-size: 13px;
}
.error-msg {
  color: #f56c6c;
  font-size: 13px;
  text-align: center;
  margin-top: 12px;
}
.sso-loading {
  text-align: center;
  padding: 20px 0;
  color: #606266;
}
.sso-loading p {
  margin-top: 12px;
  font-size: 14px;
}
</style>
