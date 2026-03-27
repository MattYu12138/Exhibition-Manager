<template>
  <div class="create-page">
    <div class="page-header">
      <el-button text @click="$router.back()"><el-icon><ArrowLeft /></el-icon> 返回</el-button>
      <h1 class="page-title">新建展会</h1>
    </div>

    <el-card class="form-card">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="100px" size="large">
        <el-form-item label="展会名称" prop="name">
          <el-input v-model="form.name" placeholder="例如：2024 春季时装展" maxlength="100" show-word-limit />
        </el-form-item>
        <el-form-item label="展会日期" prop="date">
          <el-input v-model="form.date" placeholder="例如：2024-03-15 至 2024-03-17" />
        </el-form-item>
        <el-form-item label="展会地点" prop="location">
          <el-input v-model="form.location" placeholder="例如：上海国家会展中心" />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" size="large" :loading="loading" @click="handleCreate">
            创建展会
          </el-button>
          <el-button size="large" @click="$router.back()">取消</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useExhibitionStore } from '@/stores/exhibition'

const router = useRouter()
const store = useExhibitionStore()
const formRef = ref()
const loading = ref(false)

const form = ref({ name: '', date: '', location: '' })
const rules = {
  name: [{ required: true, message: '请输入展会名称', trigger: 'blur' }],
}

async function handleCreate() {
  await formRef.value.validate()
  loading.value = true
  try {
    const ex = await store.createExhibition(form.value)
    router.push(`/exhibitions/${ex.id}`)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.create-page { max-width: 600px; margin: 0 auto; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
.page-title { font-size: 22px; font-weight: 700; }
.form-card { border-radius: 16px; padding: 8px; }
</style>
