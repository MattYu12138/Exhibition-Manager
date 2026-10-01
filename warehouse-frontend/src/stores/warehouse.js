import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { layoutApi } from '@/api/index.js'

const STORAGE_KEY = 'warehouse_layout_id'

export const useWarehouseStore = defineStore('warehouse', () => {
  const layouts = ref([])
  const selectedLayoutId = ref(localStorage.getItem(STORAGE_KEY) || null)
  const currentLayout = computed(() => layouts.value.find(layout => String(layout.id) === String(selectedLayoutId.value)) || null)
  let pendingLoad = null

  function selectLayout(id, { allowUnknown = false } = {}) {
    if (id == null || id === '') {
      selectedLayoutId.value = null
      localStorage.removeItem(STORAGE_KEY)
      return
    }
    const layout = layouts.value.find(item => String(item.id) === String(id))
    if (!layout && !allowUnknown && layouts.value.length) return
    selectedLayoutId.value = layout?.id ?? id
    localStorage.setItem(STORAGE_KEY, String(selectedLayoutId.value))
  }

  async function loadLayouts() {
    if (pendingLoad) return pendingLoad
    pendingLoad = (async () => {
      const response = await layoutApi.list()
      layouts.value = Array.isArray(response.data) ? response.data : []
      if (!currentLayout.value) {
        const fallback = layouts.value.find(layout => layout.is_active) || layouts.value[0]
        selectLayout(fallback?.id ?? null)
      }
      return layouts.value
    })()
    try { return await pendingLoad } finally { pendingLoad = null }
  }

  return { layouts, selectedLayoutId, currentLayout, loadLayouts, selectLayout }
})
