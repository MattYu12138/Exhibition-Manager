<template>
  <div class="app-wrapper">
    <el-header v-if="!isHiddenNavPage" class="app-header">
      <div class="header-inner">
        <div class="logo" @click="$router.push('/warehouse')">
          <el-icon size="22" color="#fff"><Box /></el-icon>
          <span>Warehouse Manager</span>
        </div>
        <div class="header-nav">
          <a href="#" class="back-link" @click.prevent="backToPlatform">← 返回平台</a>
          <el-button text :style="{ color: '#fff' }" @click="$router.push('/warehouse')">
            <el-icon><HomeFilled /></el-icon> 总览
          </el-button>
          <el-button text :style="{ color: '#fff' }" @click="$router.push('/map')">
            <el-icon><MapLocation /></el-icon> 仓库地图
          </el-button>
          <el-button text :style="{ color: '#fff' }" @click="$router.push('/locations')">
            <el-icon><Grid /></el-icon> 货位
          </el-button>
          <el-button text :style="{ color: '#fff' }" @click="$router.push('/picking')">
            <el-icon><List /></el-icon> 拣货
          </el-button>
          <el-button v-if="authStore.isAdmin" text :style="{ color: '#fff' }" @click="$router.push('/map/builder')">
            <el-icon><Setting /></el-icon> 构建器
          </el-button>
        </div>
        <div class="header-user">
          <el-tag v-if="authStore.user" size="small" :type="authStore.isAdmin ? 'danger' : authStore.isStaff ? 'warning' : 'info'">
            {{ authStore.user.username }}
          </el-tag>
          <el-button text :style="{ color: 'rgba(255,255,255,0.7)', fontSize: '13px' }" @click="handleLogout">退出</el-button>
        </div>
      </div>
    </el-header>
    <el-main class="app-main" :class="{ 'no-header': isHiddenNavPage }">
      <router-view v-slot="{ Component, route }">
        <transition name="page-fade" mode="out-in">
          <component :is="Component" :key="route.path" />
        </transition>
      </router-view>
    </el-main>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import axios from 'axios'
import { Box, HomeFilled, MapLocation, Grid, List, Setting } from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const isHiddenNavPage = computed(() =>
  route.name === 'Login' || route.name === 'ScanLocation'
)

async function backToPlatform() {
  try {
    const res = await axios.post('/api/sso/return-token', {}, { withCredentials: true })
    if (res.data.success) {
      const platformUrl = import.meta.env.VITE_PLATFORM_URL || 'https://licplatform.lummiincolour.com.au'
      window.location.href = `${platformUrl}/?sso_token=${res.data.token}`
    }
  } catch {
    window.location.href = import.meta.env.VITE_PLATFORM_URL || 'https://licplatform.lummiincolour.com.au'
  }
}

async function handleLogout() {
  await authStore.logout()
  router.push('/login')
}
</script>

<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f6fa; color: #303133; }
.app-wrapper { display: flex; flex-direction: column; min-height: 100vh; }
.app-header {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  height: 56px !important; padding: 0; position: sticky; top: 0; z-index: 1000;
  box-shadow: 0 2px 12px rgba(0,0,0,0.3);
}
.header-inner { display: flex; align-items: center; height: 100%; padding: 0 20px; gap: 8px; }
.logo { display: flex; align-items: center; gap: 8px; cursor: pointer; color: #fff; font-weight: 700; font-size: 16px; white-space: nowrap; margin-right: 8px; }
.header-nav { display: flex; align-items: center; gap: 2px; flex: 1; }
.back-link { color: rgba(255,255,255,0.6); font-size: 12px; text-decoration: none; padding: 4px 8px; border-right: 1px solid rgba(255,255,255,0.2); margin-right: 8px; transition: color 0.2s; }
.back-link:hover { color: #fff; }
.header-user { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.app-main { flex: 1; padding: 24px; max-width: 1400px; margin: 0 auto; width: 100%; }
.app-main.no-header { max-width: 100%; padding: 0; }
.page-fade-enter-active, .page-fade-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.page-fade-enter-from { opacity: 0; transform: translateY(8px); }
.page-fade-leave-to { opacity: 0; transform: translateY(-8px); }
.el-card { border-radius: 12px !important; box-shadow: 0 2px 12px rgba(0,0,0,0.08) !important; }
</style>
