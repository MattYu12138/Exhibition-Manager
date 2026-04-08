<template>
  <el-config-provider :locale="elLocale">
    <div class="app-wrapper">
      <!-- 顶部导航（登录页不显示） -->
      <el-header v-if="!isLoginPage" class="app-header">
        <div class="header-inner">
          <!-- Logo -->
          <div class="logo" @click="$router.push('/')">
            <el-icon size="24" color="#fff"><Box /></el-icon>
            <span>{{ t('nav.appTitle') }}</span>
          </div>

          <!-- 桌面端导航 -->
          <div class="header-nav desktop-nav">
            <el-button text :style="{ color: '#fff' }" @click="$router.push('/exhibitions')">
              <el-icon><List /></el-icon> {{ t('nav.exhibitions') }}
            </el-button>

            <el-button
              v-if="authStore.isAdmin"
              text
              :style="{ color: '#fff' }"
              @click="$router.push('/users')"
            >
              <el-icon><UserFilled /></el-icon> {{ t('nav.userManagement') }}
            </el-button>

            <LangSwitch />

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
                  <el-dropdown-item command="changePassword">
                    <el-icon><Lock /></el-icon> {{ t('userMgmt.changePwdTitle') }}
                  </el-dropdown-item>
                  <el-divider style="margin: 4px 0" />
                  <el-dropdown-item command="logout" style="color: #f56c6c">
                    {{ t('nav.logout') }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>

          <!-- 手机端汉堡菜单 -->
          <div class="mobile-nav">
            <el-dropdown trigger="click" @command="handleMobileCommand" placement="bottom-end">
              <div class="hamburger-btn">
                <span></span>
                <span></span>
                <span></span>
              </div>
              <template #dropdown>
                <el-dropdown-menu>
                  <!-- 用户信息 -->
                  <div v-if="authStore.isLoggedIn" class="mobile-user-info">
                    <el-avatar :size="32" style="background: #0f3460; color: #fff; font-size: 14px">
                      {{ authStore.user?.username?.charAt(0)?.toUpperCase() }}
                    </el-avatar>
                    <div class="mobile-user-text">
                      <span class="mobile-username">{{ authStore.user?.username }}</span>
                      <el-tag size="small" :type="roleTagType">
                        {{ t(`userMgmt.roles.${authStore.user?.role}`) }}
                      </el-tag>
                    </div>
                  </div>
                  <el-divider v-if="authStore.isLoggedIn" style="margin: 4px 0" />

                  <el-dropdown-item command="exhibitions">
                    <el-icon><List /></el-icon> {{ t('nav.exhibitions') }}
                  </el-dropdown-item>

                  <el-dropdown-item v-if="authStore.isAdmin" command="users">
                    <el-icon><UserFilled /></el-icon> {{ t('nav.userManagement') }}
                  </el-dropdown-item>

                  <el-dropdown-item command="lang">
                    <el-icon><Switch /></el-icon>
                    {{ locale === 'zh' ? 'English' : '中文' }}
                  </el-dropdown-item>

                  <el-divider v-if="authStore.isLoggedIn" style="margin: 4px 0" />
                  <el-dropdown-item v-if="authStore.isLoggedIn" command="changePassword">
                    <el-icon><Lock /></el-icon> {{ t('userMgmt.changePwdTitle') }}
                  </el-dropdown-item>
                  <el-dropdown-item v-if="authStore.isLoggedIn" command="logout" style="color: #f56c6c">
                    <el-icon><SwitchButton /></el-icon> {{ t('nav.logout') }}
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

    <!-- 修改密码对话框（全局，任意页面可用） -->
    <el-dialog
      v-model="changePwdVisible"
      :title="t('userMgmt.changePwdTitle')"
      width="400px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="changePwdFormRef"
        :model="changePwdForm"
        :rules="changePwdRules"
        label-position="top"
      >
        <el-form-item :label="t('userMgmt.fieldOldPwd')" prop="oldPassword">
          <el-input
            v-model="changePwdForm.oldPassword"
            type="password"
            show-password
            :placeholder="t('userMgmt.oldPwdPlaceholder')"
          />
        </el-form-item>
        <el-form-item :label="t('userMgmt.fieldNewPwd')" prop="newPassword">
          <el-input
            v-model="changePwdForm.newPassword"
            type="password"
            show-password
            :placeholder="t('userMgmt.newPwdPlaceholder')"
          />
        </el-form-item>
        <el-form-item :label="t('userMgmt.fieldConfirmPwd')" prop="confirmPassword">
          <el-input
            v-model="changePwdForm.confirmPassword"
            type="password"
            show-password
            :placeholder="t('userMgmt.confirmPwdPlaceholder')"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="changePwdVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="changePwdSubmitting" @click="handleChangePassword">
          {{ t('common.confirm') }}
        </el-button>
      </template>
    </el-dialog>
  </el-config-provider>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import en from 'element-plus/es/locale/lang/en'
import axios from 'axios'
import LangSwitch from '@/components/LangSwitch.vue'
import { useAuthStore } from '@/stores/auth'
import { Box, List, UserFilled, ArrowDown, Switch, SwitchButton, Lock } from '@element-plus/icons-vue'

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

// ─── 修改密码 ──────────────────────────────────────────────────
const changePwdVisible = ref(false)
const changePwdSubmitting = ref(false)
const changePwdFormRef = ref(null)
const changePwdForm = ref({ oldPassword: '', newPassword: '', confirmPassword: '' })

const changePwdRules = computed(() => ({
  oldPassword: [{ required: true, message: t('userMgmt.oldPwdRequired'), trigger: 'blur' }],
  newPassword: [
    { required: true, message: t('userMgmt.newPwdRequired'), trigger: 'blur' },
    { min: 4, message: t('userMgmt.passwordMinLength'), trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: t('userMgmt.newPwdRequired'), trigger: 'blur' },
    {
      validator: (rule, value, callback) => {
        if (value !== changePwdForm.value.newPassword) {
          callback(new Error(t('userMgmt.confirmPwdMismatch')))
        } else {
          callback()
        }
      },
      trigger: 'blur',
    },
  ],
}))

function openChangePwd() {
  changePwdForm.value = { oldPassword: '', newPassword: '', confirmPassword: '' }
  changePwdVisible.value = true
}

async function handleChangePassword() {
  const valid = await changePwdFormRef.value?.validate().catch(() => false)
  if (!valid) return
  changePwdSubmitting.value = true
  try {
    await axios.patch('/api/users/me/password', {
      oldPassword: changePwdForm.value.oldPassword,
      newPassword: changePwdForm.value.newPassword,
    }, { withCredentials: true })
    ElMessage.success(t('userMgmt.pwdChanged'))
    changePwdVisible.value = false
  } catch (err) {
    ElMessage.error(err.response?.data?.message || t('userMgmt.pwdChanged') + '失败')
  } finally {
    changePwdSubmitting.value = false
  }
}

// ─── 用户命令处理 ──────────────────────────────────────────────
async function handleUserCommand(cmd) {
  if (cmd === 'logout') {
    await authStore.logout()
    ElMessage.success(t('nav.logoutSuccess'))
    router.push('/login')
  } else if (cmd === 'changePassword') {
    openChangePwd()
  }
}

async function handleMobileCommand(cmd) {
  if (cmd === 'exhibitions') {
    router.push('/exhibitions')
  } else if (cmd === 'users') {
    router.push('/users')
  } else if (cmd === 'lang') {
    locale.value = locale.value === 'zh' ? 'en' : 'zh'
    localStorage.setItem('lang', locale.value)
  } else if (cmd === 'logout') {
    await authStore.logout()
    ElMessage.success(t('nav.logoutSuccess'))
    router.push('/login')
  } else if (cmd === 'changePassword') {
    openChangePwd()
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
  white-space: nowrap;
  flex-shrink: 0;
}

/* 桌面端导航 */
.desktop-nav {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* 手机端汉堡菜单 - 默认隐藏 */
.mobile-nav {
  display: none;
}

/* 响应式：768px 以下切换到汉堡菜单 */
@media (max-width: 768px) {
  .app-header {
    padding: 0 16px;
  }
  .desktop-nav {
    display: none;
  }
  .mobile-nav {
    display: flex;
    align-items: center;
  }
}

/* 汉堡图标 */
.hamburger-btn {
  display: flex;
  flex-direction: column;
  gap: 5px;
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  transition: background 0.2s;
}
.hamburger-btn:hover {
  background: rgba(255, 255, 255, 0.15);
}
.hamburger-btn span {
  display: block;
  width: 22px;
  height: 2px;
  background: #fff;
  border-radius: 2px;
}

/* 手机端下拉菜单用户信息区 */
.mobile-user-info {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px 6px;
}
.mobile-user-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.mobile-username {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
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

@media (max-width: 768px) {
  .app-main {
    padding: 16px 12px;
  }
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
