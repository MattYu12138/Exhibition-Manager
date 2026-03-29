<template>
  <div class="create-page">
    <div class="page-header">
      <el-button text @click="$router.back()"><el-icon><ArrowLeft /></el-icon> {{ t('common.back') }}</el-button>
      <h1 class="page-title">{{ t('exhibitionCreate.pageTitle') }}</h1>
    </div>

    <el-card class="form-card">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="100px" size="large">
        <el-form-item :label="t('exhibitionCreate.fieldName')" prop="name">
          <el-input v-model="form.name" :placeholder="t('exhibitionCreate.namePlaceholder')" maxlength="100" show-word-limit />
        </el-form-item>
        <el-form-item :label="t('exhibitionCreate.fieldDate')" prop="dateRange">
          <el-date-picker
            v-model="form.dateRange"
            type="daterange"
            range-separator="至"
            :start-placeholder="t('exhibitionCreate.dateStart')"
            :end-placeholder="t('exhibitionCreate.dateEnd')"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item :label="t('exhibitionCreate.fieldLocation')" prop="location">
          <el-input v-model="form.location" :placeholder="t('exhibitionCreate.locationPlaceholder')" />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" size="large" :loading="loading" @click="handleCreate">
            {{ t('exhibitionCreate.submit') }}
          </el-button>
          <el-button size="large" @click="$router.back()">{{ t('common.cancel') }}</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useExhibitionStore } from '@/stores/exhibition'

const { t } = useI18n()
const router = useRouter()
const store = useExhibitionStore()
const formRef = ref()
const loading = ref(false)

function getDefaultDateRange() {
  const today = new Date()
  const dayAfterTomorrow = new Date()
  dayAfterTomorrow.setDate(today.getDate() + 2)
  const fmt = (d) => d.toISOString().slice(0, 10)
  return [fmt(today), fmt(dayAfterTomorrow)]
}

const form = ref({
  name: '',
  dateRange: getDefaultDateRange(),
  location: '',
})

const rules = {
  name: [{ required: true, message: t('exhibitionCreate.namePlaceholder'), trigger: 'blur' }],
}

async function handleCreate() {
  await formRef.value.validate()
  loading.value = true
  try {
    const dateStr = form.value.dateRange
      ? `${form.value.dateRange[0]} 至 ${form.value.dateRange[1]}`
      : ''
    const payload = {
      name: form.value.name,
      date: dateStr,
      location: form.value.location,
    }
    const ex = await store.createExhibition(payload)
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
