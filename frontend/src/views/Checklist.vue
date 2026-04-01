<template>
  <div class="checklist-page">
    <div class="page-header">
      <el-button text @click="$router.back()"><el-icon><ArrowLeft /></el-icon> {{ $t('common.back') }}</el-button>
      <div>
        <h1 class="page-title">{{ $t('checklist.pageTitle') }}</h1>
        <p class="page-desc">{{ $t('checklist.pageDesc') }}</p>
      </div>
    </div>

    <!-- Progress bar -->
    <el-card class="progress-card">
      <div class="progress-header">
        <div class="progress-info">
          <span class="progress-label">{{ $t('checklist.progress') }}</span>
          <span class="progress-count">{{ store.checkedCount }} / {{ store.totalItems }}</span>
        </div>
        <div class="progress-actions">
          <el-button size="small" @click="checkAll(true)" :disabled="store.checkedCount === store.totalItems">
            {{ $t('checklist.checkAll') }}
          </el-button>
          <el-button size="small" @click="checkAll(false)" :disabled="store.checkedCount === 0">
            {{ $t('checklist.uncheckAll') }}
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
        {{ $t('checklist.allDone') }}
      </div>
    </el-card>

    <!-- Product groups -->
    <div v-loading="store.loading" class="product-groups">
      <el-empty
        v-if="!store.groupedItems.length && !store.loading"
        :description="$t('checklist.emptyHint')"
      >
        <el-button type="primary" @click="$router.push(`/exhibitions/${id}/select-products`)">
          {{ $t('checklist.goSelect') }}
        </el-button>
      </el-empty>

      <el-card
        v-for="group in store.groupedItems"
        :key="group.product_id"
        class="product-group-card"
        :class="{ 'all-checked': isProductAllChecked(group) }"
      >
        <!-- Product title row -->
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
                {{ $t('checklist.sizesChecked', { done: group.variants.filter((v) => v.checked).length, total: group.variants.length }) }}
              </div>
            </div>
          </div>

          <!-- Toggle all variants for this product -->
          <div class="group-check-btn">
            <el-tooltip :content="isProductAllChecked(group) ? $t('checklist.toggleAllChecked') : $t('checklist.toggleAllUnchecked')" placement="top">
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

        <!-- Variant checklist -->
        <div class="variant-checklist">
          <div
            v-for="variant in group.variants"
            :key="variant.id"
            class="variant-check-row"
            :class="{ checked: variant.checked }"
          >
            <!-- Check icon (click to toggle) -->
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

            <!-- Variant info -->
            <div class="variant-detail" @click="toggleVariantCheck(variant)">
              <span class="variant-name">{{ variant.variant_title || '默认' }}</span>
              <div class="variant-tags">
                <el-tag v-if="variant.sku" size="small" type="info">{{ variant.sku }}</el-tag>
                <el-tag v-if="variant.gtin" size="small" type="warning">{{ variant.gtin }}</el-tag>
              </div>
            </div>

            <!-- Qty area: rack + storage + readonly total -->
            <div class="checklist-qty-area" @click.stop>
              <div class="checklist-qty-group">
                <div class="checklist-qty-field">
                  <div class="checklist-qty-label">{{ $t('checklist.rack') }}</div>
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
                  <div class="checklist-qty-label">{{ $t('checklist.storage') }}</div>
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
                  <div class="checklist-qty-label">{{ $t('checklist.totalLabel') }}</div>
                  <div class="checklist-total-value">
                    {{ (localQty[variant.id].rack || 0) + (localQty[variant.id].stock || 0) }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Mark checked button -->
            <el-button
              size="small"
              :type="variant.checked ? 'success' : 'default'"
              @click.stop="toggleVariantCheck(variant)"
              style="min-width: 72px; flex-shrink: 0"
            >
              {{ variant.checked ? $t('checklist.checked') : $t('checklist.markCheck') }}
            </el-button>
          </div>
        </div>
      </el-card>
    </div>

    <!-- Sync footer (fixed at bottom) -->
    <div v-if="store.groupedItems.length" class="sync-footer">
      <el-card class="sync-card">
        <div class="sync-content">
          <div class="sync-info">
            <div class="sync-title">
              <el-icon size="20" color="#409eff"><Upload /></el-icon>
              {{ $t('checklist.syncTitle') }}
            </div>
            <div class="sync-desc">
              {{ $t('checklist.syncDesc') }}
              <el-tag
                v-if="store.checkProgress === 100"
                type="success"
                size="small"
                style="margin-left: 8px"
              >{{ $t('checklist.syncDone') }}</el-tag>
              <el-tag
                v-else
                type="warning"
                size="small"
                style="margin-left: 8px"
              >{{ $t('checklist.syncPending', { done: store.checkedCount, total: store.totalItems }) }}</el-tag>
            </div>
          </div>
          <el-tooltip
            :content="store.checkProgress < 100 ? $t('checklist.syncTooltip', { n: store.totalItems - store.checkedCount }) : ''"
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
                {{ $t('checklist.syncBtn') }}
              </el-button>
            </span>
          </el-tooltip>
        </div>
      </el-card>
    </div>

    <!-- ===== 未匹配商品弹窗 ===== -->
    <el-dialog
      v-model="unmatchedDialogVisible"
      :title="$t('unmatchedDialog.title')"
      width="92%"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
    >
      <el-alert type="warning" :closable="false" style="margin-bottom: 16px">
        <template #title>
          <span style="font-size: 14px">{{ $t('unmatchedDialog.subtitle', { n: unmatchedItems.length }) }}</span>
        </template>
      </el-alert>

      <el-table :data="unmatchedItems" border stripe max-height="460">
        <el-table-column type="index" width="46" align="center" />

        <!-- 商品 / 变体 -->
        <el-table-column :label="$t('unmatchedDialog.colProduct')" min-width="180" fixed>
          <template #default="{ row }">
            <div style="display: flex; align-items: center; gap: 8px">
              <el-image
                v-if="row.image_url"
                :src="row.image_url"
                style="width: 40px; height: 40px; border-radius: 6px; flex-shrink: 0"
                fit="cover"
              />
              <div>
                <div style="font-weight: 600; font-size: 13px; line-height: 1.3">{{ row.product_title }}</div>
                <div style="font-size: 12px; color: #909399">{{ row.variant_title }}</div>
              </div>
            </div>
          </template>
        </el-table-column>

        <!-- SKU -->
        <el-table-column :label="$t('unmatchedDialog.colSku')" width="110">
          <template #default="{ row }">
            <span style="font-size: 12px; color: #606266">{{ row.sku || '-' }}</span>
          </template>
        </el-table-column>

        <!-- GTIN -->
        <el-table-column :label="$t('unmatchedDialog.colGtin')" width="130">
          <template #default="{ row }">
            <span style="font-size: 12px; color: #606266">{{ row.gtin || '-' }}</span>
          </template>
        </el-table-column>

        <!-- 带走数量 -->
        <el-table-column :label="$t('unmatchedDialog.colPlannedQty')" width="90" align="center">
          <template #default="{ row }">
            <el-tag type="info">{{ row.planned_quantity }}</el-tag>
          </template>
        </el-table-column>

        <!-- Square 商品名（可编辑） -->
        <el-table-column :label="$t('unmatchedDialog.colItemName')" width="180">
          <template #default="{ row }">
            <el-input
              v-model="row.customName"
              :placeholder="$t('unmatchedDialog.itemNamePlaceholder')"
              size="small"
              :disabled="!row.includeInSquare"
            />
          </template>
        </el-table-column>

        <!-- Square 变体名（可编辑） -->
        <el-table-column :label="$t('unmatchedDialog.colVariantName')" width="150">
          <template #default="{ row }">
            <el-input
              v-model="row.customVariantName"
              :placeholder="$t('unmatchedDialog.variantNamePlaceholder')"
              size="small"
              :disabled="!row.includeInSquare"
            />
          </template>
        </el-table-column>

        <!-- 售价 -->
        <el-table-column :label="$t('unmatchedDialog.colPrice')" width="130">
          <template #default="{ row }">
            <el-input-number
              v-model="row.customPrice"
              :min="0"
              :precision="2"
              :step="0.01"
              size="small"
              :disabled="!row.includeInSquare"
              style="width: 100%"
            />
          </template>
        </el-table-column>

        <!-- 操作开关 -->
        <el-table-column :label="$t('unmatchedDialog.colAction')" width="130" align="center" fixed="right">
          <template #default="{ row }">
            <el-switch
              v-model="row.includeInSquare"
              :active-text="$t('unmatchedDialog.includeItem')"
              :inactive-text="$t('unmatchedDialog.skipItem')"
              inline-prompt
              style="--el-switch-on-color: #67c23a; --el-switch-off-color: #909399"
            />
          </template>
        </el-table-column>
      </el-table>

      <template #footer>
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px">
          <el-button @click="skipAllUnmatched" :disabled="addingToSquare">
            {{ $t('unmatchedDialog.skipAll') }}
          </el-button>
          <div style="display: flex; gap: 10px">
            <el-button @click="unmatchedDialogVisible = false" :disabled="addingToSquare">
              {{ $t('unmatchedDialog.cancel') }}
            </el-button>
            <el-button type="primary" @click="confirmAddToSquare" :loading="addingToSquare">
              {{ $t('unmatchedDialog.addSelected') }}
            </el-button>
          </div>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useExhibitionStore } from '@/stores/exhibition'
import { ElMessage, ElMessageBox } from 'element-plus'
import { exhibitionApi, squareApi } from '@/api'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const store = useExhibitionStore()
const id = route.params.id
const syncing = ref(false)

// Local qty state: { [variantId]: { rack, stock } }
const localQty = reactive({})

// 未匹配商品弹窗状态
const unmatchedDialogVisible = ref(false)
const unmatchedItems = ref([])
const addingToSquare = ref(false)

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
    if (variant.checked) {
      await store.toggleItemCheck(id, variant.id, false)
    }
  } catch (err) {
    ElMessage.error(t('checklist.qtyUpdateFailed', { msg: err.message }))
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
    ElMessage.warning(t('checklist.uncheckedWarning', { n: store.totalItems - store.checkedCount }))
    return
  }

  syncing.value = true
  try {
    const result = await store.syncBeforeExhibition(id)

    // 检查是否有未匹配商品
    if (result?.unmatched && result.unmatched.length > 0) {
      // 初始化未匹配商品列表，添加自定义字段
      unmatchedItems.value = result.unmatched.map((item) => ({
        ...item,
        customName: item.product_title || '',
        customVariantName: item.variant_title || 'Default',
        customPrice: 0,
        customDescription: '',
        includeInSquare: true,
      }))
      unmatchedDialogVisible.value = true
    } else {
      // 全部匹配成功
      const syncedCount = result?.data?.filter(r => r.status === 'synced').length || 0
      ElMessage.success(t('checklist.syncSuccess'))
      router.push(`/exhibitions/${id}`)
    }
  } catch (err) {
    ElMessage.error(t('checklist.syncFailed', { msg: err.message }))
  } finally {
    syncing.value = false
  }
}

function skipAllUnmatched() {
  unmatchedDialogVisible.value = false
  ElMessage.info(t('unmatchedDialog.skipHint'))
  router.push(`/exhibitions/${id}`)
}

async function confirmAddToSquare() {
  const selectedItems = unmatchedItems.value.filter((item) => item.includeInSquare)

  if (selectedItems.length === 0) {
    ElMessage.warning(t('unmatchedDialog.noItemsSelected'))
    return
  }

  // 验证必填字段
  for (const item of selectedItems) {
    if (!item.customName || !item.customVariantName) {
      ElMessage.warning(`${item.product_title} - ${item.variant_title}: ${t('unmatchedDialog.itemNamePlaceholder')}`)
      return
    }
  }

  await ElMessageBox.confirm(
    t('unmatchedDialog.confirmAddMsg', { n: selectedItems.length }),
    t('unmatchedDialog.confirmAdd'),
    { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
  )

  addingToSquare.value = true
  try {
    const payload = selectedItems.map((item) => ({
      shopify_variant_id: item.shopify_variant_id,
      name: item.customName,
      variantName: item.customVariantName,
      sku: item.sku || '',
      gtin: item.gtin || '',
      priceCents: Math.round((item.customPrice || 0) * 100),
      description: item.customDescription || '',
      planned_quantity: item.planned_quantity,
    }))

    const result = await squareApi.createItems(id, payload)

    const successCount = result?.summary?.created || 0
    const failCount = result?.summary?.failed || 0

    if (failCount === 0) {
      ElMessage.success(t('unmatchedDialog.addSuccess', { n: successCount }))
    } else {
      ElMessage.warning(t('unmatchedDialog.addPartial', { success: successCount, fail: failCount }))
    }

    unmatchedDialogVisible.value = false
    router.push(`/exhibitions/${id}`)
  } catch (err) {
    ElMessage.error(t('unmatchedDialog.addFailed', { msg: err.message || '' }))
  } finally {
    addingToSquare.value = false
  }
}

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

.sync-footer { margin-top: 24px; }
.sync-card { border: 2px solid #409eff; border-radius: 12px; }
.sync-content { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.sync-info { flex: 1; }
.sync-title { display: flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 700; margin-bottom: 6px; color: #303133; }
.sync-desc { font-size: 13px; color: #606266; display: flex; align-items: center; flex-wrap: wrap; }
</style>
