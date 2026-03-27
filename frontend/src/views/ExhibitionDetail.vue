<template>
  <div class="detail-page" v-loading="store.loading">
    <div class="page-header">
      <el-button text @click="$router.push('/exhibitions')">
        <el-icon><ArrowLeft /></el-icon> 返回列表
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
                <el-icon><Box /></el-icon> {{ store.currentExhibition.items?.length || 0 }} 个商品变体
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
              <el-option label="准备中" value="preparing" />
              <el-option label="进行中" value="active" />
              <el-option label="已完成" value="completed" />
            </el-select>
          </div>
        </div>
      </el-card>

      <!-- 功能入口卡片 -->
      <el-row :gutter="16" class="action-row">
        <el-col :xs="24" :sm="12" :md="6">
          <el-card class="action-card" shadow="hover" @click="$router.push(`/exhibitions/${id}/select-products`)">
            <div class="action-icon step1"><el-icon size="32"><ShoppingCart /></el-icon></div>
            <div class="action-label">选择商品</div>
            <div class="action-desc">从 Shopify 选择展会商品并设置数量</div>
            <el-tag size="small" type="info">第 1 步</el-tag>
          </el-card>
        </el-col>
        <el-col :xs="24" :sm="12" :md="6">
          <el-card class="action-card" shadow="hover" @click="handleSyncBefore">
            <div class="action-icon step2"><el-icon size="32"><Upload /></el-icon></div>
            <div class="action-label">出发前同步</div>
            <div class="action-desc">记录 Square 当前库存快照</div>
            <el-tag size="small" type="warning">第 2 步</el-tag>
          </el-card>
        </el-col>
        <el-col :xs="24" :sm="12" :md="6">
          <el-card class="action-card" shadow="hover" @click="$router.push(`/exhibitions/${id}/checklist`)">
            <div class="action-icon step3"><el-icon size="32"><Finished /></el-icon></div>
            <div class="action-label">清点货品</div>
            <div class="action-desc">逐件清点，打勾确认已收集</div>
            <el-tag size="small" type="primary">第 3 步</el-tag>
          </el-card>
        </el-col>
        <el-col :xs="24" :sm="12" :md="6">
          <el-card class="action-card" shadow="hover" @click="$router.push(`/exhibitions/${id}/inventory`)">
            <div class="action-icon step4"><el-icon size="32"><DataAnalysis /></el-icon></div>
            <div class="action-label">展会结束盘点</div>
            <div class="action-desc">计算剩余差值并同步回 Square</div>
            <el-tag size="small" type="success">第 4 步</el-tag>
          </el-card>
        </el-col>
      </el-row>

      <!-- 商品清单预览 -->
      <el-card>
        <template #header>
          <div class="card-header">
            <span style="font-weight: 600">商品清单预览</span>
            <el-button size="small" type="primary" @click="$router.push(`/exhibitions/${id}/select-products`)">
              <el-icon><Plus /></el-icon> 添加商品
            </el-button>
          </div>
        </template>

        <el-empty v-if="!store.currentExhibition.items?.length" description="尚未添加商品">
          <el-button type="primary" @click="$router.push(`/exhibitions/${id}/select-products`)">
            去选择商品
          </el-button>
        </el-empty>

        <el-table v-else :data="store.currentExhibition.items" stripe>
          <el-table-column label="商品" min-width="200">
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
          <el-table-column label="计划数量" prop="planned_quantity" width="100" align="center" />
          <el-table-column label="清点状态" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="row.checked ? 'success' : 'info'" size="small">
                {{ row.checked ? '已清点' : '待清点' }}
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
import { ElMessage } from 'element-plus'
import { useExhibitionStore } from '@/stores/exhibition'

const route = useRoute()
const store = useExhibitionStore()
const id = route.params.id
const currentStatus = ref('preparing')

const statusType = computed(() => {
  const map = { preparing: 'info', active: 'warning', completed: 'success' }
  return map[store.currentExhibition?.status] || 'info'
})

const statusLabel = computed(() => {
  const map = { preparing: '准备中', active: '进行中', completed: '已完成' }
  return map[store.currentExhibition?.status] || ''
})
async function updateStatus(val) {
  await store.updateExhibition(id, { status: val })
}

async function handleSyncBefore() {
  if (!store.currentExhibition?.items?.length) {
    ElMessage.warning('请先添加商品到清单')
    return
  }
  await store.syncBeforeExhibition(id)
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
