<template>
  <div class="select-page">
    <div class="page-header">
      <el-button text @click="$router.back()"><el-icon><ArrowLeft /></el-icon> 返回</el-button>
      <div>
        <h1 class="page-title">选择展会商品</h1>
        <p class="page-desc">从 Shopify 商品库中选择要带到展会的商品及数量</p>
      </div>
    </div>

    <el-row :gutter="20">
      <!-- 左侧：Shopify 商品列表 -->
      <el-col :xs="24" :lg="14">
        <el-card>
          <template #header>
            <div class="card-header">
              <span style="font-weight: 600">Shopify 商品库（{{ store.shopifyProducts.length }} 个）</span>
              <el-input
                v-model="searchQuery"
                placeholder="搜索商品名称..."
                clearable
                style="width: 220px"
                @input="handleSearch"
              >
                <template #prefix><el-icon><Search /></el-icon></template>
              </el-input>
            </div>
          </template>

          <div v-loading="listLoading">
            <el-empty
              v-if="!store.shopifyProducts.length && !store.productLoading"
              description="暂无商品数据"
            >
              <el-button type="primary" @click="loadProducts">重新加载</el-button>
            </el-empty>

            <div v-else class="product-list">
              <div
                v-for="product in pagedProducts"
                :key="product.id"
                class="product-item"
              >
                <!-- 商品头部（可折叠） -->
                <div class="product-header" @click="toggleProduct(product.id)">
                  <div class="product-info">
                    <img
                      v-if="product.main_image && !imgError[product.id]"
                      :src="product.main_image"
                      class="product-thumb"
                      @error="imgError[product.id] = true"
                    />
                    <div v-else class="product-placeholder"><el-icon><Picture /></el-icon></div>
                    <div class="product-text">
                      <div class="product-name">{{ product.title }}</div>
                      <div class="product-meta">{{ product.variants ? product.variants.length : 0 }} 个变体</div>
                    </div>
                  </div>
                  <div class="product-actions">
                    <el-button
                      size="small"
                      type="primary"
                      plain
                      @click.stop="selectAllVariants(product)"
                    >全选</el-button>
                    <el-icon
                      class="expand-icon"
                      :class="{ expanded: isExpanded(product.id) }"
                    ><ArrowDown /></el-icon>
                  </div>
                </div>

                <!-- 变体列表 -->
                <div v-show="isExpanded(product.id)" class="variant-list">
                  <div
                    v-for="variant in product.variants"
                    :key="variant.id"
                    class="variant-item"
                    :class="{ selected: isSelected(product.id, variant.id) }"
                  >
                    <el-checkbox
                      :model-value="isSelected(product.id, variant.id)"
                      @change="(v) => toggleVariant(product, variant, v)"
                    />
                    <div class="variant-info">
                      <span class="variant-title">{{ variant.title }}</span>
                      <span class="variant-sku" v-if="variant.sku">SKU: {{ variant.sku }}</span>
                      <span class="variant-gtin" v-if="variant.gtin">GTIN: {{ variant.gtin }}</span>
                      <span class="variant-stock">库存: {{ variant.inventory_quantity ?? '-' }}</span>
                    </div>

                    <!-- 数量输入区：挂衣架 + 备货 + 只读总数 -->
                    <div class="variant-qty" v-if="isSelected(product.id, variant.id)" @click.stop>
                      <div class="qty-group">
                        <div class="qty-field">
                          <div class="qty-field-label">挂衣架</div>
                          <el-input-number
                            v-model="getSelection(product.id, variant.id).rack_quantity"
                            :min="0"
                            :max="9999"
                            size="small"
                            style="width: 90px"
                            @change="onQtyChange(product.id, variant.id)"
                          />
                        </div>
                        <div class="qty-field">
                          <div class="qty-field-label">备货</div>
                          <el-input-number
                            v-model="getSelection(product.id, variant.id).stock_quantity"
                            :min="0"
                            :max="9999"
                            size="small"
                            style="width: 90px"
                            @change="onQtyChange(product.id, variant.id)"
                          />
                        </div>
                        <div class="qty-field qty-total">
                          <div class="qty-field-label">总数</div>
                          <div class="qty-total-value">
                            {{ (getSelection(product.id, variant.id).rack_quantity || 0) + (getSelection(product.id, variant.id).stock_quantity || 0) }}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 分页 -->
            <div class="pagination-wrap" v-if="filteredProducts.length > pageSize">
              <el-pagination
                v-model:current-page="currentPage"
                :page-size="pageSize"
                :total="filteredProducts.length"
                layout="prev, pager, next, jumper"
                background
                small
                @current-change="handlePageChange"
              />
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- 右侧：已选商品清单 -->
      <el-col :xs="24" :lg="10">
        <el-card class="selection-card" :body-style="{ padding: '0' }">
          <template #header>
            <div class="card-header">
              <span style="font-weight: 600">已选商品 ({{ totalSelected }})</span>
              <el-button
                v-if="selectionList.length > 0"
                size="small"
                type="danger"
                plain
                @click="clearAll"
              >清空</el-button>
            </div>
          </template>

          <el-empty v-if="!selectionList.length" description="尚未选择商品" style="padding: 40px 0" />

          <div v-else class="selection-list">
            <div
              v-for="sel in selectionList"
              :key="sel.key"
              class="selection-item"
            >
              <div class="sel-info">
                <div class="sel-title">{{ sel.product_title }}</div>
                <div class="sel-variant">{{ sel.variant_title }}</div>
                <div class="sel-meta">
                  <span v-if="sel.sku">SKU: {{ sel.sku }}</span>
                  <span v-if="sel.gtin">GTIN: {{ sel.gtin }}</span>
                </div>
              </div>
              <div class="sel-right">
                <div class="sel-qty-summary">
                  <span class="sel-qty-item">架: {{ sel.rack_quantity }}</span>
                  <span class="sel-qty-item">货: {{ sel.stock_quantity }}</span>
                  <el-tag type="primary" size="small">共 {{ sel.rack_quantity + sel.stock_quantity }}</el-tag>
                </div>
                <el-icon class="sel-remove" @click="removeSelection(sel.key)"><Close /></el-icon>
              </div>
            </div>
          </div>

          <div class="selection-footer">
            <div class="total-info">
              共 {{ totalSelected }} 个变体，合计 {{ totalQuantity }} 件
            </div>
            <el-button
              type="primary"
              size="large"
              :disabled="!selectionList.length"
              :loading="saving"
              @click="saveToExhibition"
              style="width: 100%"
            >
              保存到展会清单
            </el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useExhibitionStore } from '@/stores/exhibition'

const route = useRoute()
const router = useRouter()
const store = useExhibitionStore()
const id = route.params.id

const searchQuery = ref('')
const expandedMap = ref({})
const selectionsMap = ref({})
const saving = ref(false)
// 进入页面时记录已有商品的快照：key=shopify_variant_id, value={ db_id, rack_quantity, stock_quantity, planned_quantity }
const originalSnapshot = ref({})
const imgError = reactive({})

// 分页
const currentPage = ref(1)
const pageSize = 20

// 计算属性
const selectionList = computed(() => Object.values(selectionsMap.value))
const totalSelected = computed(() => selectionList.value.length)
const totalQuantity = computed(() =>
  selectionList.value.reduce((sum, s) => sum + (s.rack_quantity || 0) + (s.stock_quantity || 0), 0)
)

// 多关键词跳字模糊搜索
const filteredProducts = computed(() => {
  const raw = searchQuery.value.trim().toLowerCase()
  if (!raw) return store.shopifyProducts
  const keywords = raw.split(/\s+/).filter(Boolean)
  return store.shopifyProducts.filter((p) => {
    const titleLower = p.title.toLowerCase()
    const variantTexts = (p.variants || []).map(
      (v) => `${v.sku || ''} ${v.gtin || ''} ${v.title || ''}`.toLowerCase()
    ).join(' ')
    const searchTarget = `${titleLower} ${variantTexts}`
    return keywords.every((kw) => searchTarget.includes(kw))
  })
})

const pagedProducts = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filteredProducts.value.slice(start, start + pageSize)
})

const listLoading = computed(() => store.productLoading && !store.shopifyProducts.length)

function isExpanded(productId) {
  return !!expandedMap.value[productId]
}

function toggleProduct(productId) {
  expandedMap.value = {
    ...expandedMap.value,
    [productId]: !expandedMap.value[productId],
  }
}

function isSelected(productId, variantId) {
  return !!selectionsMap.value[`${productId}-${variantId}`]
}

function getSelection(productId, variantId) {
  return selectionsMap.value[`${productId}-${variantId}`]
}

// 当挂衣架或备货数量变化时，同步更新 quantity（用于兼容旧逻辑）
function onQtyChange(productId, variantId) {
  const sel = selectionsMap.value[`${productId}-${variantId}`]
  if (sel) {
    sel.quantity = (sel.rack_quantity || 0) + (sel.stock_quantity || 0)
  }
}

function toggleVariant(product, variant, checked) {
  const key = `${product.id}-${variant.id}`
  if (checked) {
    selectionsMap.value = {
      ...selectionsMap.value,
      [key]: {
        key,
        product_id: product.id,
        product_title: product.title,
        variant_id: variant.id,
        variant_title: variant.title,
        sku: variant.sku,
        gtin: variant.gtin,
        image_url: variant.image_url || product.main_image,
        rack_quantity: 5,
        stock_quantity: 5,
        quantity: 10,
      },
    }
  } else {
    const next = { ...selectionsMap.value }
    delete next[key]
    selectionsMap.value = next
  }
}

function selectAllVariants(product) {
  const additions = {}
  for (const variant of product.variants) {
    const key = `${product.id}-${variant.id}`
    if (!selectionsMap.value[key]) {
      additions[key] = {
        key,
        product_id: product.id,
        product_title: product.title,
        variant_id: variant.id,
        variant_title: variant.title,
        sku: variant.sku,
        gtin: variant.gtin,
        image_url: variant.image_url || product.main_image,
        rack_quantity: 5,
        stock_quantity: 5,
        quantity: 10,
      }
    }
  }
  selectionsMap.value = { ...selectionsMap.value, ...additions }
  expandedMap.value = { ...expandedMap.value, [product.id]: true }
}

function removeSelection(key) {
  const next = { ...selectionsMap.value }
  delete next[key]
  selectionsMap.value = next
}

function clearAll() {
  selectionsMap.value = {}
}

function handleSearch() {
  currentPage.value = 1
  expandAll()
}

function expandAll() {
  const map = {}
  pagedProducts.value.forEach((p) => { map[p.id] = true })
  expandedMap.value = map
}

function handlePageChange() {
  expandAll()
}

async function loadProducts() {
  const [, exhibition] = await Promise.all([
    store.loadShopifyProducts(),
    store.loadExhibition(id),
  ])

  const snapshot = {}
  const preselected = {}
  const existingItems = store.currentExhibition?.items || []
  for (const item of existingItems) {
    const variantId = String(item.shopify_variant_id)
    const productId = String(item.shopify_product_id)
    const rackQty = item.rack_quantity !== undefined && item.rack_quantity !== null ? item.rack_quantity : 5
    const stockQty = item.stock_quantity !== undefined && item.stock_quantity !== null ? item.stock_quantity : 5
    snapshot[variantId] = {
      db_id: item.id,
      rack_quantity: rackQty,
      stock_quantity: stockQty,
      planned_quantity: item.planned_quantity,
    }
    const key = `${productId}-${variantId}`
    preselected[key] = {
      key,
      product_id: productId,
      product_title: item.product_title,
      variant_id: variantId,
      variant_title: item.variant_title,
      sku: item.sku,
      gtin: item.gtin,
      image_url: item.image_url,
      rack_quantity: rackQty,
      stock_quantity: stockQty,
      quantity: rackQty + stockQty,
    }
  }
  originalSnapshot.value = snapshot
  selectionsMap.value = preselected

  expandAll()
}

async function saveToExhibition() {
  saving.value = true
  try {
    const deltaItems = []
    const snapshot = originalSnapshot.value
    const currentMap = selectionsMap.value

    // 1. 找出新增或数量变化的变体
    for (const sel of selectionList.value) {
      const variantId = String(sel.variant_id)
      const rackQty = sel.rack_quantity || 0
      const stockQty = sel.stock_quantity || 0
      const totalQty = rackQty + stockQty

      if (!snapshot[variantId]) {
        // 全新变体 → action='add'
        deltaItems.push({
          action: 'add',
          shopify_product_id: sel.product_id,
          shopify_variant_id: variantId,
          product_title: sel.product_title,
          variant_title: sel.variant_title,
          sku: sel.sku,
          gtin: sel.gtin,
          image_url: sel.image_url,
          rack_quantity: rackQty,
          stock_quantity: stockQty,
          planned_quantity: totalQty,
        })
      } else {
        const snap = snapshot[variantId]
        if (rackQty !== snap.rack_quantity || stockQty !== snap.stock_quantity) {
          // 数量有变化 → action='update'
          deltaItems.push({
            action: 'update',
            shopify_product_id: sel.product_id,
            shopify_variant_id: variantId,
            product_title: sel.product_title,
            variant_title: sel.variant_title,
            sku: sel.sku,
            gtin: sel.gtin,
            image_url: sel.image_url,
            rack_quantity: rackQty,
            stock_quantity: stockQty,
            planned_quantity: totalQty,
          })
        }
        // 无变化 → 不提交
      }
    }

    // 2. 找出被移除的变体
    const currentVariantIds = new Set(
      selectionList.value.map((s) => String(s.variant_id))
    )
    for (const variantId of Object.keys(snapshot)) {
      if (!currentVariantIds.has(variantId)) {
        deltaItems.push({
          action: 'remove',
          shopify_variant_id: variantId,
          shopify_product_id: '',
          product_title: '',
          variant_title: '',
          rack_quantity: 0,
          stock_quantity: 0,
          planned_quantity: 0,
        })
      }
    }

    if (!deltaItems.length) {
      ElMessage.info('没有检测到变化，无需保存')
      router.push(`/exhibitions/${id}`)
      return
    }

    const addCount = deltaItems.filter((i) => i.action === 'add').length
    const updateCount = deltaItems.filter((i) => i.action === 'update').length
    const removeCount = deltaItems.filter((i) => i.action === 'remove').length

    await store.addItemsToExhibition(id, deltaItems)

    const parts = []
    if (addCount) parts.push(`新增 ${addCount} 个`)
    if (updateCount) parts.push(`更新 ${updateCount} 个`)
    if (removeCount) parts.push(`移除 ${removeCount} 个`)
    ElMessage.success(parts.join('、'))

    router.push(`/exhibitions/${id}`)
  } finally {
    saving.value = false
  }
}

onMounted(loadProducts)
</script>

<style scoped>
.page-header { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 24px; }
.page-title { font-size: 22px; font-weight: 700; }
.page-desc { font-size: 14px; color: #909399; margin-top: 4px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }

.product-list { display: flex; flex-direction: column; gap: 8px; padding-right: 4px; }
.pagination-wrap { display: flex; justify-content: center; margin-top: 16px; padding-bottom: 4px; }
.product-item { border: 1px solid #ebeef5; border-radius: 10px; overflow: hidden; }
.product-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 14px; cursor: pointer; background: #fafafa;
  transition: background 0.15s; min-height: 56px;
}
.product-header:hover { background: #f0f2f5; }
.product-info { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; }
.product-text { flex: 1; min-width: 0; }
.product-thumb {
  width: 48px; height: 48px; border-radius: 8px; object-fit: cover; flex-shrink: 0;
}
.product-placeholder {
  width: 48px; height: 48px; border-radius: 8px; background: #f0f2f5;
  display: flex; align-items: center; justify-content: center; color: #c0c4cc; font-size: 20px;
  flex-shrink: 0;
}
.product-name { font-weight: 600; font-size: 14px; color: #303133; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.product-meta { font-size: 12px; color: #909399; margin-top: 2px; }
.product-actions { display: flex; align-items: center; gap: 10px; }
.expand-icon { transition: transform 0.2s; color: #909399; }
.expand-icon.expanded { transform: rotate(180deg); }

.variant-list { border-top: 1px solid #ebeef5; }
.variant-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; transition: background 0.15s; flex-wrap: wrap;
}
.variant-item:hover { background: #f9f9f9; }
.variant-item.selected { background: #ecf5ff; }
.variant-info { flex: 1; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; min-width: 0; }
.variant-title { font-size: 14px; font-weight: 500; color: #303133; }
.variant-sku, .variant-gtin, .variant-stock {
  font-size: 11px; color: #909399; background: #f5f7fa;
  padding: 2px 6px; border-radius: 4px;
}

/* 数量输入区 */
.variant-qty { width: 100%; padding: 8px 0 4px 28px; }
.qty-group { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
.qty-field { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.qty-field-label { font-size: 11px; color: #909399; font-weight: 500; }
.qty-total { min-width: 56px; }
.qty-total-value {
  font-size: 20px; font-weight: 700; color: #409eff;
  background: #ecf5ff; border-radius: 8px;
  padding: 4px 12px; text-align: center; min-width: 56px;
  border: 1px solid #c6e2ff;
}

.selection-card { position: sticky; top: 80px; }
.selection-list { max-height: 55vh; overflow-y: auto; }
.selection-item {
  display: flex; justify-content: space-between; align-items: flex-start;
  padding: 12px 16px; border-bottom: 1px solid #f0f2f5;
}
.sel-info { flex: 1; }
.sel-title { font-weight: 600; font-size: 14px; color: #303133; }
.sel-variant { font-size: 12px; color: #606266; margin-top: 2px; }
.sel-meta { display: flex; gap: 6px; margin-top: 4px; }
.sel-meta span { font-size: 11px; color: #909399; }
.sel-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; margin-left: 8px; }
.sel-qty-summary { display: flex; align-items: center; gap: 6px; }
.sel-qty-item { font-size: 11px; color: #606266; }
.sel-remove { cursor: pointer; color: #c0c4cc; font-size: 16px; }
.sel-remove:hover { color: #f56c6c; }

.selection-footer { padding: 16px; border-top: 1px solid #ebeef5; }
.total-info { font-size: 13px; color: #606266; margin-bottom: 12px; }
</style>
