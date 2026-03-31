<template>
  <div class="checklist-page">
    <div class="page-header">
      <el-button text @click="$router.back()"><el-icon><ArrowLeft /></el-icon> 返回</el-button>
      <div>
        <h1 class="page-title">货品清点</h1>
        <p class="page-desc">逐件清点展会货品，完成后打勾确认</p>
      </div>
    </div>

    <!-- 进度条 -->
    <el-card class="progress-card">
      <div class="progress-header">
        <div class="progress-info">
          <span class="progress-label">清点进度</span>
          <span class="progress-count">{{ store.checkedCount }} / {{ store.totalItems }}</span>
        </div>
        <div class="progress-actions">
          <el-button size="small" @click="checkAll(true)" :disabled="store.checkedCount === store.totalItems">
            全部打勾
          </el-button>
          <el-button size="small" @click="checkAll(false)" :disabled="store.checkedCount === 0">
            全部取消
          </el-button>
        </div>
      </div>
      <el-progress
        :percentage="store.checkProgress"
        :status="store.checkProgress === 100 ? 'success' : ''"
        :stroke-width="12"
        striped
        striped-flow
        :duration="10"
      />
      <div v-if="store.checkProgress === 100" class="all-done">
        <el-icon color="#67c23a"><CircleCheck /></el-icon>
        所有货品已清点完成！可以点击下方按钮同步到 Square。
      </div>
    </el-card>

    <!-- 按商品分组的清单 -->
    <div v-loading="store.loading" class="product-groups">
      <el-empty
        v-if="!store.groupedItems.length && !store.loading"
        description="清单为空，请先添加商品"
      >
        <el-button type="primary" @click="$router.push(`/exhibitions/${id}/select-products`)">
          去选择商品
        </el-button>
      </el-empty>

      <el-card
        v-for="group in store.groupedItems"
        :key="group.product_id"
        class="product-group-card"
        :class="{ 'all-checked': isProductAllChecked(group) }"
      >
        <!-- 商品标题行 -->
        <div class="group-header">
          <div class="group-title-area">
            <el-image
              v-if="group.image_url"
              :src="group.image_url"
              style="width: 52px; height: 52px; border-radius: 10px; flex-shrink: 0"
              fit="cover"
            />
            <div v-else class="group-placeholder"><el-icon><Box /></el-icon></div>
            <div>
              <div class="group-title">{{ group.product_title }}</div>
              <div class="group-meta">
                {{ group.variants.filter((v) => v.checked).length }} / {{ group.variants.length }} 个尺码已清点
              </div>
            </div>
          </div>

          <!-- 整个商品一键打勾 -->
          <div class="group-check-btn">
            <el-tooltip :content="isProductAllChecked(group) ? '取消全部' : '整件商品全部打勾'" placement="top">
              <el-button
                :type="isProductAllChecked(group) ? 'success' : 'default'"
                :icon="isProductAllChecked(group) ? 'CircleCheck' : 'Check'"
                circle
                size="large"
                @click="toggleProductCheck(group)"
              />
            </el-tooltip>
          </div>
        </div>

        <!-- 变体清单 -->
        <div class="variant-checklist">
          <div
            v-for="variant in group.variants"
            :key="variant.id"
            class="variant-check-row"
            :class="{ checked: variant.checked }"
          >
            <!-- 左侧：勾选图标（点击切换清点状态） -->
            <div class="check-icon-wrap" @click="toggleVariantCheck(variant)">
              <transition name="check-bounce">
                <el-icon v-if="variant.checked" class="check-icon checked-icon" size="22" color="#67c23a">
                  <CircleCheck />
                </el-icon>
                <el-icon v-else class="check-icon unchecked-icon" size="22" color="#dcdfe6">
                  <CircleClose />
                </el-icon>
              </transition>
            </div>

            <!-- 变体信息 -->
            <div class="variant-detail" @click="toggleVariantCheck(variant)">
              <span class="variant-name">{{ variant.variant_title || '默认' }}</span>
              <div class="variant-tags">
                <el-tag v-if="variant.sku" size="small" type="info">{{ variant.sku }}</el-tag>
                <el-tag v-if="variant.gtin" size="small" type="warning">{{ variant.gtin }}</el-tag>
              </div>
            </div>

            <!-- 数量区：挂衣架 + 备货 + 只读总数 -->
            <div class="checklist-qty-area" @click.stop>
              <div class="checklist-qty-group">
                <div class="checklist-qty-field">
                  <div class="checklist-qty-label">挂衣架</div>
                  <el-input-number
                    v-model="localQty[variant.id].rack"
                    :min="0"
                    :max="9999"
                    size="small"
                    style="width: 80px"
                    @change="onLocalQtyChange(variant)"
                  />
                </div>
                <div class="checklist-qty-field">
                  <div class="checklist-qty-label">备货</div>
                  <el-input-number
                    v-model="localQty[variant.id].stock"
                    :min="0"
                    :max="9999"
                    size="small"
                    style="width: 80px"
                    @change="onLocalQtyChange(variant)"
                  />
                </div>
                <div class="checklist-qty-field checklist-qty-total">
                  <div class="checklist-qty-label">总数</div>
                  <div class="checklist-total-value">
                    {{ (localQty[variant.id].rack || 0) + (localQty[variant.id].stock || 0) }}
                  </div>
                </div>
              </div>
            </div>

            <!-- 清点按钮 -->
            <el-button
              size="small"
              :type="variant.checked ? 'success' : 'default'"
              @click.stop="toggleVariantCheck(variant)"
              style="min-width: 72px; flex-shrink: 0"
            >
              {{ variant.checked ? '已清点 ✓' : '标记清点' }}
            </el-button>
          </div>
        </div>
      </el-card>
    </div>

    <!-- 出发前同步按钮（底部固定区域） -->
    <div v-if="store.groupedItems.length" class="sync-footer">
      <el-card class="sync-card">
        <div class="sync-content">
          <div class="sync-info">
            <div class="sync-title">
              <el-icon size="20" color="#409eff"><Upload /></el-icon>
              出发前同步到 Square
            </div>
            <div class="sync-desc">
              清点完成后点击此按钮，将带走数量写入 Square 库存
              <el-tag
                v-if="store.checkProgress === 100"
                type="success"
                size="small"
                style="margin-left: 8px"
              >清点已完成</el-tag>
              <el-tag
                v-else
                type="warning"
                size="small"
                style="margin-left: 8px"
              >{{ store.checkedCount }}/{{ store.totalItems }} 已清点</el-tag>
            </div>
          </div>
          <el-tooltip
            :content="store.checkProgress < 100 ? `还有 ${store.totalItems - store.checkedCount} 件未清点，请先完成全部清点` : ''"
            :disabled="store.checkProgress === 100"
            placement="top"
          >
            <span>
              <el-button
                type="primary"
                size="large"
                :loading="syncing"
                :disabled="store.checkProgress < 100"
                @click="syncToSquare"
              >
                <el-icon><Upload /></el-icon>
                同步数量到 Square
              </el-button>
            </span>
          </el-tooltip>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useExhibitionStore } from '@/stores/exhibition'
import { ElMessage } from 'element-plus'
import { exhibitionApi } from '@/api'

const route = useRoute()
const router = useRouter()
const store = useExhibitionStore()
const id = route.params.id
const syncing = ref(false)

// 本地数量状态：{ [variantId]: { rack, stock } }
const localQty = reactive({})

// 初始化本地数量（从 store 加载后填充）
function initLocalQty() {
  for (const group of store.groupedItems) {
    for (const variant of group.variants) {
      if (!localQty[variant.id]) {
        localQty[variant.id] = {
          rack: variant.rack_quantity !== undefined && variant.rack_quantity !== null
            ? variant.rack_quantity : 5,
          stock: variant.stock_quantity !== undefined && variant.stock_quantity !== null
            ? variant.stock_quantity : 5,
        }
      }
    }
  }
}

// 当用户修改清点页数量时，保存到后端并重置清点状态
async function onLocalQtyChange(variant) {
  const qty = localQty[variant.id]
  const newRack = qty.rack || 0
  const newStock = qty.stock || 0
  const newTotal = newRack + newStock

  try {
    await exhibitionApi.updateItem(id, variant.id, {
      rack_quantity: newRack,
      stock_quantity: newStock,
      planned_quantity: newTotal,
    })
    // 数量变动后重置清点状态
    if (variant.checked) {
      await store.toggleItemCheck(id, variant.id, false)
    }
  } catch (err) {
    ElMessage.error('数量更新失败: ' + err.message)
  }
}

function isProductAllChecked(group) {
  return group.variants.every((v) => v.checked)
}

async function toggleVariantCheck(variant) {
  await store.toggleItemCheck(id, variant.id, !variant.checked)
}

async function toggleProductCheck(group) {
  const allChecked = isProductAllChecked(group)
  await store.toggleProductCheck(id, group.product_id, !allChecked)
}

async function checkAll(checked) {
  for (const group of store.groupedItems) {
    await store.toggleProductCheck(id, group.product_id, checked)
  }
}

async function syncToSquare() {
  if (store.checkProgress < 100) {
    ElMessage.warning(`还有 ${store.totalItems - store.checkedCount} 件货品未清点，请先完成全部清点`)
    return
  }

  syncing.value = true
  try {
    // 将清点页修改后的实际数量写入 planned_quantity，再同步
    await store.syncBeforeExhibition(id)
    ElMessage.success('同步成功！数量已写入 Square 库存')
    router.push(`/exhibitions/${id}`)
  } catch (err) {
    ElMessage.error('同步失败: ' + err.message)
  } finally {
    syncing.value = false
  }
}

// 监听 store 数据加载完成后初始化本地数量
watch(() => store.groupedItems, (items) => {
  if (items.length) initLocalQty()
}, { immediate: true })

onMounted(() => store.loadExhibition(id))
</script>

<style scoped>
.page-header { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 24px; }
.page-title { font-size: 22px; font-weight: 700; }
.page-desc { font-size: 14px; color: #909399; margin-top: 4px; }

.progress-card { margin-bottom: 20px; }
.progress-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.progress-info { display: flex; align-items: baseline; gap: 8px; }
.progress-label { font-size: 15px; font-weight: 600; }
.progress-count { font-size: 22px; font-weight: 700; color: #409eff; }
.progress-actions { display: flex; gap: 8px; }
.all-done { display: flex; align-items: center; gap: 6px; margin-top: 12px; color: #67c23a; font-weight: 600; font-size: 15px; }

.product-groups { display: flex; flex-direction: column; gap: 16px; }

.product-group-card { transition: all 0.3s; }
.product-group-card.all-checked { border-color: #67c23a; background: linear-gradient(135deg, #f0f9eb 0%, #fff 100%); }

.group-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.group-title-area { display: flex; align-items: center; gap: 14px; }
.group-placeholder {
  width: 52px; height: 52px; border-radius: 10px; background: #f5f7fa;
  display: flex; align-items: center; justify-content: center; color: #c0c4cc; font-size: 24px;
}
.group-title { font-size: 16px; font-weight: 700; }
.group-meta { font-size: 13px; color: #909399; margin-top: 4px; }

.variant-checklist { display: flex; flex-direction: column; gap: 8px; }
.variant-check-row {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 16px; border-radius: 10px; border: 2px solid #ebeef5;
  transition: all 0.2s; background: #fff; flex-wrap: wrap;
}
.variant-check-row:hover { border-color: #c6e2ff; background: #f5f9ff; }
.variant-check-row.checked { border-color: #b3e19d; background: #f0f9eb; }

.check-icon-wrap { width: 28px; display: flex; justify-content: center; cursor: pointer; }
.check-bounce-enter-active { animation: checkBounce 0.3s ease; }
@keyframes checkBounce {
  0% { transform: scale(0.5); opacity: 0; }
  70% { transform: scale(1.2); }
  100% { transform: scale(1); opacity: 1; }
}

.variant-detail { flex: 1; cursor: pointer; min-width: 120px; }
.variant-name { font-size: 14px; font-weight: 600; display: block; margin-bottom: 4px; }
.variant-tags { display: flex; gap: 6px; flex-wrap: wrap; }

/* 清点页数量区 */
.checklist-qty-area { display: flex; align-items: center; }
.checklist-qty-group { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; }
.checklist-qty-field { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.checklist-qty-label { font-size: 11px; color: #909399; font-weight: 500; }
.checklist-qty-total { min-width: 52px; }
.checklist-total-value {
  font-size: 18px; font-weight: 700; color: #409eff;
  background: #ecf5ff; border-radius: 8px;
  padding: 3px 10px; text-align: center; min-width: 52px;
  border: 1px solid #c6e2ff;
}

/* 底部同步区域 */
.sync-footer { margin-top: 24px; }
.sync-card { border: 2px solid #409eff; border-radius: 12px; }
.sync-content { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.sync-info { flex: 1; }
.sync-title { display: flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 700; margin-bottom: 6px; color: #303133; }
.sync-desc { font-size: 13px; color: #606266; display: flex; align-items: center; flex-wrap: wrap; }
</style>
