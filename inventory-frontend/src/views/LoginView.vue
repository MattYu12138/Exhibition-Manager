<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50">
    <div class="text-center">
      <p class="text-gray-500 mb-4">请通过管理平台登录后访问此系统</p>
      <a
        :href="platformUrl"
        class="inline-block bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition"
      >
        前往管理平台登录
      </a>
    </div>
  </div>
</template>

<script setup>
const platformUrl = import.meta.env.VITE_PLATFORM_URL || 'http://localhost:5174'
</script>
