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
                    <div class="variant-qty" v-if="isSelected(product.id, variant.id)">
                      <el-input-number
                        v-model="getSelection(product.id, variant.id).quantity"
                        :min="1"
                        :max="9999"
                        size="small"
                        style="width: 110px"
                        @click.stop
                      />
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
                <el-tag type="primary" size="small">× {{ sel.quantity }}</el-tag>
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
// 用普通对象替代 Set，key 为 productId，value 为 true，解决 Vue 3 响应式问题
const expandedMap = ref({})
// 用普通对象替代 Map，key 为 `${productId}-${variantId}`
const selectionsMap = ref({})
const saving = ref(false)
// 图片加载失败标记，key 为 productId
const imgError = reactive({})

// 分页
const currentPage = ref(1)
const pageSize = 20

// 计算属性：将 selectionsMap 转为数组，方便渲染
const selectionList = computed(() => Object.values(selectionsMap.value))
const totalSelected = computed(() => selectionList.value.length)
const totalQuantity = computed(() => selectionList.value.reduce((sum, s) => sum + (s.quantity || 0), 0))
// 根据搜索过滤后的商品（用于分页计算）
const filteredProducts = computed(() => store.shopifyProducts)
// 当前页展示的商品
const pagedProducts = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filteredProducts.value.slice(start, start + pageSize)
})
// 仅在首次加载（暂无缓存数据）时显示整块骨架，避免已有数据被 loading 蒙层遮挡
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
        quantity: 1,
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
        quantity: 1,
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

let searchTimer = null
function handleSearch() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(async () => {
    await store.loadShopifyProducts(searchQuery.value)
    currentPage.value = 1
    expandAll()
  }, 400)
}

function expandAll() {
  const map = {}
  pagedProducts.value.forEach((p) => { map[p.id] = true })
  expandedMap.value = map
}

function handlePageChange() {
  // 切页时展开当前页所有商品，并滚动到顶部
  expandAll()
}

async function loadProducts() {
  await store.loadShopifyProducts()
  expandAll()
}

async function saveToExhibition() {
  if (!selectionList.value.length) return
  saving.value = true
  try {
    const items = selectionList.value.map((sel) => ({
      shopify_product_id: sel.product_id,
      shopify_variant_id: sel.variant_id,
      product_title: sel.product_title,
      variant_title: sel.variant_title,
      sku: sel.sku,
      gtin: sel.gtin,
      image_url: sel.image_url,
      planned_quantity: sel.quantity,
    }))
    await store.addItemsToExhibition(id, items)
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
  padding: 10px 14px; transition: background 0.15s;
}
.variant-item:hover { background: #f9f9f9; }
.variant-item.selected { background: #ecf5ff; }
.variant-info { flex: 1; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.variant-title { font-size: 14px; font-weight: 500; color: #303133; }
.variant-sku, .variant-gtin, .variant-stock {
  font-size: 11px; color: #909399; background: #f5f7fa;
  padding: 2px 6px; border-radius: 4px;
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
.sel-remove { cursor: pointer; color: #c0c4cc; font-size: 16px; }
.sel-remove:hover { color: #f56c6c; }

.selection-footer { padding: 16px; border-top: 1px solid #ebeef5; }
.total-info { font-size: 13px; color: #606266; margin-bottom: 12px; }
</style>
