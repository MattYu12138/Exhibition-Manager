<template>
  <el-button
    size="small"
    plain
    class="lang-switch-btn"
    @click="toggleLang"
  >
    <el-icon><Translate /></el-icon>
    {{ locale === 'zh' ? 'EN' : '中文' }}
  </el-button>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

const { locale } = useI18n()

function toggleLang() {
  const next = locale.value === 'zh' ? 'en' : 'zh'
  locale.value = next
  localStorage.setItem('lang', next)
  // 刷新页面以同步 Element Plus 组件语言（日期选择器等）
  window.location.reload()
}
</script>

<style scoped>
.lang-switch-btn {
  font-weight: 600;
  letter-spacing: 0.5px;
}
</style>
