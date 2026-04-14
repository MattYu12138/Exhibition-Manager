import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import ElementPlus from 'element-plus'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import 'element-plus/dist/index.css'
import App from './App.vue'
import router from './router'
import './style.css'

import en from './locales/en.js'
import zh from './locales/zh.js'
import { useAuthStore } from './stores/auth'

const i18n = createI18n({
  legacy: false,
  locale: localStorage.getItem('lang') || 'zh',
  fallbackLocale: 'en',
  messages: { en, zh }
})

const app = createApp(App)

// 注册所有 Element Plus 图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

const pinia = createPinia()
app.use(pinia)
app.use(router)
app.use(i18n)
app.use(ElementPlus)

// 在挂载前先恢复 session，确保 router guard 拿到正确的 auth.user
// 避免 fetchMe() 异步完成前组件已渲染导致 role 为空或系统列表为空
const auth = useAuthStore()
auth.fetchMe().finally(() => {
  app.mount('#app')
})
