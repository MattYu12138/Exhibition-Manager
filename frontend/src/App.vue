<template>
  <el-config-provider :locale="elLocale">
    <div class="app-wrapper">
      <!-- 顶部导航（登录页不显示） -->
      <el-header v-if="!isLoginPage" class="app-header">
        <div class="header-inner">
          <div class="logo" @click="$router.push('/')">
            <el-icon size="24" color="#fff"><Box /></el-icon>
            <span>{{ t('nav.appTitle') }}</span>
          </div>
          <div class="header-nav">
            <el-button
              text
              :style="{ color: '#fff' }"
              @click="$router.push('/exhibitions')"
            >
              <el-icon><List /></el-icon> {{ t('nav.exhibitions') }}
            </el-button>

            <!-- 管理员专属：账号管理 -->
            <el-button
              v-if="authStore.isAdmin"
              text
              :style="{ color: '#fff' }"
              @click="$router.push('/users')"
            >
              <el-icon><UserFilled /></el-icon> {{ t('nav.userManagement') }}
            </el-button>

            <LangSwitch />

            <!-- 登录用户信息 + 登出 -->
            <el-dropdown v-if="authStore.isLoggedIn" @command="handleUserCommand">
              <div class="user-info">
                <el-avatar :size="28" style="background: #0f3460; color: #fff; font-size: 13px">
                  {{ authStore.user?.username?.charAt(0)?.toUpperCase() }}
                </el-avatar>
                <span class="username">{{ authStore.user?.username }}</span>
                <el-tag size="small" :type="roleTagType" style="margin-left: 4px">
                  {{ t(`userMgmt.roles.${authStore.user?.role}`) }}
                </el-tag>
                <el-icon style="color: #ccc; margin-left: 4px"><ArrowDown /></el-icon>
              </div>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="logout" icon="SwitchButton">
                    {{ t('nav.logout') }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
      </el-header>

      <!-- 主内容区 -->
      <el-main :class="isLoginPage ? 'app-main-login' : 'app-main'">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </el-main>
    </div>
  </el-config-provider>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import en from 'element-plus/es/locale/lang/en'
import LangSwitch from '@/components/LangSwitch.vue'
import { useAuthStore } from '@/stores/auth'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const elLocale = computed(() => locale.value === 'zh' ? zhCn : en)
const isLoginPage = computed(() => route.name === 'Login')

const roleTagType = computed(() => {
  const map = { admin: 'danger', staff: 'primary', guest: 'info' }
  return map[authStore.user?.role] || 'info'
})

async function handleUserCommand(cmd) {
  if (cmd === 'logout') {
    await authStore.logout()
    ElMessage.success(t('nav.logoutSuccess'))
    router.push('/login')
  }
}
</script>

<style>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  background: #f5f7fa;
  color: #303133;
}

.app-wrapper {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  height: 60px !important;
  padding: 0 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-inner {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  color: #fff;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.header-nav {
  display: flex;
  align-items: center;
  gap: 8px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 8px;
  transition: background 0.2s;
}

.user-info:hover {
  background: rgba(255, 255, 255, 0.1);
}

.username {
  color: #fff;
  font-size: 14px;
  font-weight: 500;
}

.app-main {
  flex: 1;
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}

.app-main-login {
  flex: 1;
  padding: 0;
  width: 100%;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.el-card {
  border-radius: 12px !important;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08) !important;
}
</style>
