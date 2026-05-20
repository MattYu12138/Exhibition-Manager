<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-logo">
        <el-icon size="40" color="#0f3460"><Box /></el-icon>
        <h1>Warehouse Manager</h1>
        <p>仓库管理系统</p>
      </div>
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
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { Box } from '@element-plus/icons-vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const form = ref({ username: '', password: '' })
const loading = ref(false)
const error = ref('')
const formRef = ref(null)

const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

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
</style>
