<template>
  <div class="detail-page" v-loading="store.loading">
    <div class="page-header">
      <el-button text @click="$router.push('/exhibitions')">
        <el-icon><ArrowLeft /></el-icon> {{ t('common.back') }}
      </el-button>
    </div>

    <template v-if="store.currentExhibition">
      <!-- 展会信息卡 -->
      <el-card class="info-card">
        <div class="info-header">
          <div>
            <div class="info-title-row">
              <h2 class="info-title">{{ store.currentExhibition.name }}</h2>
              <el-tag :type="statusType" size="default">{{ statusLabel }}</el-tag>
            </div>
            <div class="info-meta">
              <span v-if="store.currentExhibition.date">
                <el-icon><Calendar /></el-icon> {{ store.currentExhibition.date }}
              </span>
              <span v-if="store.currentExhibition.location">
                <el-icon><Location /></el-icon> {{ store.currentExhibition.location }}
              </span>
              <span>
                <el-icon><Box /></el-icon> {{ t('exhibitionDetail.variantCount', { n: store.currentExhibition.items?.length || 0 }) }}
              </span>
            </div>
          </div>
          <div class="info-actions">
            <el-select
              v-model="currentStatus"
              size="small"
              style="width: 120px"
              @change="updateStatus"
            >
              <el-option :label="t('exhibitionList.statusPreparing')" value="preparing" />
              <el-option :label="t('exhibitionList.statusActive')" value="active" />
              <el-option :label="t('exhibitionList.statusCompleted')" value="completed" />
            </el-select>
          </div>
        </div>
      </el-card>

      <!-- 展会流程进度条 -->
      <el-card class="steps-card">
        <el-steps :active="workflowStep" align-center finish-status="success">
          <el-step :title="t('exhibitionDetail.step1Title')" :description="t('exhibitionDetail.step1Desc')" />
          <el-step :title="t('exhibitionDetail.step2Title')" :description="t('exhibitionDetail.step2Desc')" />
          <el-step :title="t('exhibitionDetail.step4Title')" :description="t('exhibitionDetail.step4Desc')" />
        </el-steps>
      </el-card>

      <!-- 功能入口卡片 -->
      <el-row :gutter="16" class="action-row">
        <el-col :xs="24" :sm="12" :md="8">
          <el-card class="action-card" shadow="hover" @click="$router.push(`/exhibitions/${id}/select-products`)">
            <div class="action-icon step1"><el-icon size="32"><ShoppingCart /></el-icon></div>
            <div class="action-label">{{ t('exhibitionDetail.step1Title') }}</div>
            <div class="action-desc">{{ t('exhibitionDetail.step1Desc') }}</div>
            <el-tag size="small" type="info">{{ t('exhibitionDetail.step1Label') }}</el-tag>
          </el-card>
        </el-col>
        <el-col :xs="24" :sm="12" :md="8">
          <el-card class="action-card" shadow="hover" @click="$router.push(`/exhibitions/${id}/checklist`)">
            <div class="action-icon step2"><el-icon size="32"><Finished /></el-icon></div>
            <div class="action-label">{{ t('exhibitionDetail.step2Title') }}</div>
            <div class="action-desc">{{ t('exhibitionDetail.step2Desc') }}</div>
            <el-tag size="small" type="warning">{{ t('exhibitionDetail.step2Label') }}</el-tag>
          </el-card>
        </el-col>
        <el-col :xs="24" :sm="12" :md="8">
          <el-card class="action-card" shadow="hover" @click="$router.push(`/exhibitions/${id}/inventory`)">
            <div class="action-icon step4"><el-icon size="32"><DataAnalysis /></el-icon></div>
            <div class="action-label">{{ t('exhibitionDetail.step4Title') }}</div>
            <div class="action-desc">{{ t('exhibitionDetail.step4Desc') }}</div>
            <el-tag size="small" type="success">{{ t('exhibitionDetail.step3Label') }}</el-tag>
          </el-card>
        </el-col>
      </el-row>

      <!-- 商品清单预览 -->
      <el-card>
        <template #header>
          <div class="card-header">
            <span style="font-weight: 600">{{ t('selectProducts.pageTitle') }}</span>
            <el-button size="small" type="primary" @click="$router.push(`/exhibitions/${id}/select-products`)">
              <el-icon><Plus /></el-icon> {{ t('selectProducts.confirm') }}
            </el-button>
          </div>
        </template>

        <el-empty v-if="!store.currentExhibition.items?.length" :description="t('selectProducts.noProducts')">
          <el-button type="primary" @click="$router.push(`/exhibitions/${id}/select-products`)">
            {{ t('exhibitionDetail.step1Title') }}
          </el-button>
        </el-empty>

        <el-table v-else :data="store.currentExhibition.items" stripe>
          <el-table-column :label="t('inventoryResult.colProduct')" min-width="200">
            <template #default="{ row }">
              <div class="product-cell">
                <el-image
                  v-if="row.image_url"
                  :src="row.image_url"
                  style="width: 40px; height: 40px; border-radius: 6px; flex-shrink: 0"
                  fit="cover"
                />
                <div>
                  <div class="product-title">{{ row.product_title }}</div>
                  <div class="product-variant">{{ row.variant_title }}</div>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="SKU" prop="sku" width="140" />
          <el-table-column label="GTIN" prop="gtin" width="160" />
          <el-table-column :label="t('inventoryResult.colPlanned')" prop="planned_quantity" width="100" align="center" />
          <el-table-column :label="t('checklist.checked')" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="row.checked ? 'success' : 'info'" size="small">
                {{ row.checked ? t('checklist.productChecked') : t('checklist.productUnchecked') }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { useExhibitionStore } from '@/stores/exhibition'

const { t } = useI18n()
const route = useRoute()
const store = useExhibitionStore()
const id = route.params.id
const currentStatus = ref('preparing')

// 根据展会状态计算当前步骤：0=准备中, 1=已选品/清点, 2=已完成
const workflowStep = computed(() => {
  const exhibition = store.currentExhibition
  if (!exhibition) return 0
  if (exhibition.status === 'completed') return 3
  const items = exhibition.items || []
  if (items.length === 0) return 0
  const allChecked = items.every((i) => i.checked)
  if (allChecked) return 2
  return 1
})

const statusType = computed(() => {
  const map = { preparing: 'info', active: 'warning', completed: 'success' }
  return map[store.currentExhibition?.status] || 'info'
})

const statusLabel = computed(() => ({
  preparing: t('exhibitionList.statusPreparing'),
  active: t('exhibitionList.statusActive'),
  completed: t('exhibitionList.statusCompleted'),
}[store.currentExhibition?.status] || ''))

async function updateStatus(val) {
  await store.updateExhibition(id, { status: val })
}

onMounted(async () => {
  await store.loadExhibition(id)
  currentStatus.value = store.currentExhibition?.status || 'preparing'
})
</script>

<style scoped>
.page-header { margin-bottom: 16px; }
.info-card { margin-bottom: 20px; }
.info-header { display: flex; justify-content: space-between; align-items: flex-start; }
.info-title-row { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
.info-title { font-size: 22px; font-weight: 700; }
.info-meta { display: flex; gap: 16px; font-size: 14px; color: #606266; flex-wrap: wrap; }
.info-meta span { display: flex; align-items: center; gap: 6px; }

.steps-card { margin-bottom: 20px; }
.action-row { margin-bottom: 20px; }
.action-card { cursor: pointer; text-align: center; padding: 8px; transition: transform 0.2s; }
.action-card:hover { transform: translateY(-4px); }
.action-icon { width: 64px; height: 64px; border-radius: 16px; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px; }
.action-icon.step1 { background: #ecf5ff; color: #409eff; }
.action-icon.step2 { background: #fdf6ec; color: #e6a23c; }
.action-icon.step3 { background: #ecf5ff; color: #409eff; }
.action-icon.step4 { background: #f0f9eb; color: #67c23a; }
.action-label { font-size: 16px; font-weight: 600; margin-bottom: 6px; }
.action-desc { font-size: 12px; color: #909399; margin-bottom: 10px; line-height: 1.5; }

.card-header { display: flex; justify-content: space-between; align-items: center; }
.product-cell { display: flex; align-items: center; gap: 10px; }
.product-title { font-weight: 500; font-size: 14px; }
.product-variant { font-size: 12px; color: #909399; }
</style>
