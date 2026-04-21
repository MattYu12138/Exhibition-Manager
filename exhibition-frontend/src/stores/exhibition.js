import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { exhibitionApi, shopifyApi, squareApi } from '@/api'
import { ElMessage } from 'element-plus'


function normalizeShopifyProducts(payload) {
  let source = payload

  // 兼容某些环境返回 JSON 字符串
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source)
    } catch {
      return []
    }
  }

  let rawProducts = []
  if (Array.isArray(source)) rawProducts = source
  else if (Array.isArray(source?.data)) rawProducts = source.data
  else if (Array.isArray(source?.products)) rawProducts = source.products
  else if (Array.isArray(source?.data?.products)) rawProducts = source.data.products

  return rawProducts
    .filter((product) => product && typeof product === 'object')
    .map((product) => {
      const productImages = product.images || []
      const mainImage = product.main_image || product.mainImage || product.image?.src || productImages[0]?.src || null

      const variantEdges = Array.isArray(product?.variants?.edges)
        ? product.variants.edges.map((edge) => edge?.node).filter(Boolean)
        : null

      const variantsSource = Array.isArray(product.variants)
        ? product.variants
        : variantEdges || []

      const variants = variantsSource.map((variant) => ({
        id: String(variant.id ?? variant.variant_id ?? ''),
        title: variant.title || variant.name || '默认变体',
        sku: variant.sku || '',
        gtin: variant.gtin || variant.barcode || '',
        price: variant.price,
        inventory_quantity: variant.inventory_quantity ?? variant.inventoryQuantity ?? variant.available ?? 0,
        inventory_item_id: variant.inventory_item_id ? String(variant.inventory_item_id) : '',
        option1: variant.option1,
        option2: variant.option2,
        option3: variant.option3,
        image_url: variant.image_url || variant.image?.src || mainImage,
      }))

      return {
        id: String(product.id ?? product.product_id ?? ''),
        title: product.title || product.name || '',
        options: Array.isArray(product.options) ? product.options : [],
        main_image: mainImage,
        variants,
      }
    })
    .filter((product) => product.id && product.title)
}

export const useExhibitionStore = defineStore('exhibition', () => {
  // ==================== 状态 ====================
  const exhibitions = ref([])
  const currentExhibition = ref(null)
  const shopifyProducts = ref([])
  const snapshots = ref([])
  const loading = ref(false)
  const productLoading = ref(false)

  // ==================== 计算属性 ====================
  const checkedCount = computed(() => {
    if (!currentExhibition.value?.items) return 0
    return currentExhibition.value.items.filter((i) => i.checked).length
  })

  const totalItems = computed(() => {
    return currentExhibition.value?.items?.length || 0
  })

  const checkProgress = computed(() => {
    if (!totalItems.value) return 0
    return Math.round((checkedCount.value / totalItems.value) * 100)
  })

  // 按商品分组的清单（将同一商品的不同变体归组）
  const groupedItems = computed(() => {
    if (!currentExhibition.value?.items) return []
    const groups = {}
    for (const item of currentExhibition.value.items) {
      if (!groups[item.shopify_product_id]) {
        groups[item.shopify_product_id] = {
          product_id: item.shopify_product_id,
          product_title: item.product_title,
          image_url: item.image_url,
          variants: [],
        }
      }
      groups[item.shopify_product_id].variants.push(item)
    }
    return Object.values(groups)
  })

  // ==================== 展会管理 ====================
  async function loadExhibitions() {
    loading.value = true
    try {
      const res = await exhibitionApi.list()
      exhibitions.value = res.data || []
    } catch (err) {
      ElMessage.error('加载展会列表失败: ' + err.message)
    } finally {
      loading.value = false
    }
  }

  async function loadExhibition(id) {
    loading.value = true
    try {
      const res = await exhibitionApi.get(id)
      currentExhibition.value = res.data
      return res.data
    } catch (err) {
      ElMessage.error('加载展会详情失败: ' + err.message)
    } finally {
      loading.value = false
    }
  }

  async function createExhibition(data) {
    try {
      const res = await exhibitionApi.create(data)
      exhibitions.value.unshift(res.data)
      ElMessage.success('展会创建成功')
      return res.data
    } catch (err) {
      ElMessage.error('创建展会失败: ' + err.message)
      throw err
    }
  }

  async function updateExhibition(id, data) {
    try {
      const res = await exhibitionApi.update(id, data)
      const idx = exhibitions.value.findIndex((e) => e.id === id)
      if (idx !== -1) exhibitions.value[idx] = res.data
      if (currentExhibition.value?.id === id) {
        currentExhibition.value = { ...currentExhibition.value, ...res.data }
      }
      ElMessage.success('展会信息已更新')
      return res.data
    } catch (err) {
      ElMessage.error('更新展会失败: ' + err.message)
      throw err
    }
  }

  async function deleteExhibition(id) {
    try {
      await exhibitionApi.delete(id)
      exhibitions.value = exhibitions.value.filter((e) => e.id !== id)
      ElMessage.success('展会已删除')
    } catch (err) {
      ElMessage.error('删除展会失败: ' + err.message)
      throw err
    }
  }

  // ==================== 商品清单管理 ====================
  async function addItemsToExhibition(exhibitionId, items) {
    try {
      const res = await exhibitionApi.addItems(exhibitionId, items)
      if (currentExhibition.value?.id === exhibitionId) {
        currentExhibition.value.items = res.data
      }
      // 成功提示由调用方自行控制（差量模式下提示内容更丰富）
      return res.data
    } catch (err) {
      ElMessage.error('添加商品失败: ' + err.message)
      throw err
    }
  }

  async function toggleItemCheck(exhibitionId, itemId, checked) {
    try {
      const res = await exhibitionApi.updateItem(exhibitionId, itemId, { checked })
      if (currentExhibition.value?.items) {
        const idx = currentExhibition.value.items.findIndex((i) => i.id === itemId)
        if (idx !== -1) currentExhibition.value.items[idx] = res.data
      }
    } catch (err) {
      ElMessage.error('更新清点状态失败: ' + err.message)
    }
  }

  // 切换子状态：hanger_done 或 storage_done
  async function toggleItemSubState(exhibitionId, itemId, field, value) {
    try {
      const res = await exhibitionApi.updateItem(exhibitionId, itemId, { [field]: value })
      if (currentExhibition.value?.items) {
        const idx = currentExhibition.value.items.findIndex((i) => i.id === itemId)
        if (idx !== -1) currentExhibition.value.items[idx] = res.data
      }
    } catch (err) {
      ElMessage.error('更新状态失败: ' + err.message)
    }
  }

  async function toggleProductCheck(exhibitionId, productId, checked) {
    try {
      const res = await exhibitionApi.checkProduct(exhibitionId, productId, checked)
      if (currentExhibition.value?.items) {
        currentExhibition.value.items = res.data
      }
    } catch (err) {
      ElMessage.error('更新清点状态失败: ' + err.message)
    }
  }

  async function updateItemQuantity(exhibitionId, itemId, quantity) {
    try {
      const res = await exhibitionApi.updateItem(exhibitionId, itemId, { planned_quantity: quantity })
      if (currentExhibition.value?.items) {
        const idx = currentExhibition.value.items.findIndex((i) => i.id === itemId)
        if (idx !== -1) currentExhibition.value.items[idx] = res.data
      }
    } catch (err) {
      ElMessage.error('更新数量失败: ' + err.message)
    }
  }

  async function removeItem(exhibitionId, itemId) {
    try {
      await exhibitionApi.deleteItem(exhibitionId, itemId)
      if (currentExhibition.value?.items) {
        currentExhibition.value.items = currentExhibition.value.items.filter((i) => i.id !== itemId)
      }
      ElMessage.success('商品已从清单移除')
    } catch (err) {
      ElMessage.error('移除商品失败: ' + err.message)
    }
  }

  // ==================== Shopify 商品 ====================
  async function loadShopifyProducts(search = '') {
    productLoading.value = true
    try {
      const res = await shopifyApi.getProducts(search)
      shopifyProducts.value = normalizeShopifyProducts(res?.data ?? res)
    } catch (err) {
      ElMessage.error('获取 Shopify 商品失败: ' + err.message)
    } finally {
      productLoading.value = false
    }
  }

  /**
   * 按商品状态加载 Shopify 商品
   * @param {string} status - 'active' | 'draft' | 'archived' | 'unlisted'
   * @param {string} search - 可选搜索关键词
   */
  async function loadShopifyProductsByStatus(status = 'active', search = '') {
    productLoading.value = true
    shopifyProducts.value = []
    try {
      const publishedStatus = status === 'unlisted' ? 'unlisted' : null
      const actualStatus = status === 'unlisted' ? 'active' : status
      const res = await shopifyApi.getProducts(search || '', actualStatus, publishedStatus)
      shopifyProducts.value = normalizeShopifyProducts(res?.data ?? res)
    } catch (err) {
      ElMessage.error('获取 Shopify 商品失败: ' + err.message)
    } finally {
      productLoading.value = false
    }
  }

  // ==================== Square 同步 ====================
  async function syncBeforeExhibition(exhibitionId) {
    loading.value = true
    try {
      const res = await squareApi.syncBefore(exhibitionId)
      // 不再自动显示成功提示，由调用方根据 unmatched 情况决定
      return res
    } catch (err) {
      ElMessage.error('同步失败: ' + err.message)
      throw err
    } finally {
      loading.value = false
    }
  }

  async function syncAfterExhibition(exhibitionId) {
    loading.value = true
    try {
      const res = await squareApi.syncAfter(exhibitionId)
      ElMessage.success('已获取 Square 剩余库存')
      return res.data
    } catch (err) {
      ElMessage.error('同步失败: ' + err.message)
      throw err
    } finally {
      loading.value = false
    }
  }

  async function updateRemainingToSquare(exhibitionId) {
    loading.value = true
    try {
      const res = await squareApi.updateRemaining(exhibitionId)
      ElMessage.success(res.message || '剩余库存已更新至 Square')
      return res
    } catch (err) {
      ElMessage.error('更新 Square 库存失败: ' + err.message)
      throw err
    } finally {
      loading.value = false
    }
  }

  async function loadSnapshots(exhibitionId) {
    try {
      const res = await squareApi.getSnapshots(exhibitionId)
      snapshots.value = res.data || []
      return res.data
    } catch (err) {
      ElMessage.error('加载库存快照失败: ' + err.message)
    }
  }

  return {
    exhibitions,
    currentExhibition,
    shopifyProducts,
    snapshots,
    loading,
    productLoading,
    checkedCount,
    totalItems,
    checkProgress,
    groupedItems,
    loadExhibitions,
    loadExhibition,
    createExhibition,
    updateExhibition,
    deleteExhibition,
    addItemsToExhibition,
    toggleItemCheck,
    toggleItemSubState,
    toggleProductCheck,
    updateItemQuantity,
    removeItem,
    loadShopifyProducts,
    loadShopifyProductsByStatus,
    syncBeforeExhibition,
    syncAfterExhibition,
    updateRemainingToSquare,
    loadSnapshots,
  }
})
