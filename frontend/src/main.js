import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import en from 'element-plus/es/locale/lang/en'

import App from './App.vue'
import router from './router'
import i18n from './i18n'

const app = createApp(App)

// 注册所有图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

// 根据保存的语言设置 Element Plus locale
const savedLang = localStorage.getItem('lang') || 'zh'
const elLocale = savedLang === 'en' ? en : zhCn

app.use(createPinia())
app.use(router)
app.use(i18n)
app.use(ElementPlus, { locale: elLocale })

app.mount('#app')
