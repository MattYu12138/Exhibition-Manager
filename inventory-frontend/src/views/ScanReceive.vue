<template>
  <div class="min-h-screen bg-gray-50 flex flex-col items-center justify-start p-4">

    <!-- Loading -->
    <div v-if="loading" class="mt-20 text-center text-gray-400">
      <div class="text-3xl mb-3">📦</div>
      <div>Loading...</div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="mt-20 text-center">
      <div class="text-4xl mb-3">❌</div>
      <div class="text-red-600 font-medium">{{ error }}</div>
    </div>

    <!-- Already received -->
    <div v-else-if="box && box.status === 'received'" class="mt-20 text-center">
      <div class="text-4xl mb-3">✅</div>
      <div class="text-green-700 font-bold text-lg">Box already received</div>
      <div class="text-gray-400 text-sm mt-1">{{ shipment?.ref_no }} — Box {{ box.box_no }}</div>
      <div class="text-gray-400 text-xs mt-1">{{ fmtDate(box.received_at) }}</div>
    </div>

    <!-- Confirm receive -->
    <div v-else-if="box" class="w-full max-w-md mt-6">
      <div class="bg-white rounded-2xl shadow-sm p-5 mb-4">
        <div class="flex items-center gap-2 mb-1">
          <span class="text-xs text-gray-400 font-mono">{{ shipment?.ref_no }}</span>
          <span v-if="shipment?.factory" class="text-xs text-gray-400">— {{ shipment.factory }}</span>
        </div>
        <h2 class="text-xl font-bold text-gray-800 mb-4">Box {{ box.box_no }}</h2>

        <div class="space-y-2">
          <div
            v-for="item in box.items"
            :key="item.id"
            class="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
            :class="item.match_status === 'unmatched' ? 'opacity-50' : ''"
          >
            <div class="flex-1 min-w-0">
              <div class="font-mono text-sm text-gray-700">{{ item.raw_sku || item.raw_gtin }}</div>
              <div class="text-xs text-gray-400 truncate">
                <span v-if="item.match_status !== 'unmatched'">{{ item.product_title }}<span v-if="item.variant_title"> / {{ item.variant_title }}</span></span>
                <span v-else class="text-amber-500">⚠ Unmatched — will be skipped</span>
              </div>
            </div>
            <div class="ml-3 text-right shrink-0">
              <div class="font-bold text-gray-800">{{ item.quantity }}</div>
              <div v-if="item.current_stock !== null && item.current_stock !== undefined" class="text-xs text-gray-400">
                stock: {{ item.current_stock }} → {{ (item.current_stock || 0) + item.quantity }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="unmatchedCount > 0" class="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm text-amber-700">
        ⚠ {{ unmatchedCount }} item(s) are unmatched and will be skipped.
      </div>

      <button
        @click="confirmReceive"
        :disabled="receiving || matchedCount === 0"
        class="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold py-4 rounded-2xl text-lg shadow-sm"
      >
        {{ receiving ? 'Receiving...' : `Confirm Receive (${matchedCount} SKU${matchedCount !== 1 ? 's' : ''})` }}
      </button>

      <div v-if="receiveError" class="mt-3 text-center text-red-600 text-sm">{{ receiveError }}</div>
    </div>

    <!-- Success -->
    <div v-if="received" class="fixed inset-0 bg-green-600 flex flex-col items-center justify-center text-white text-center p-6">
      <div class="text-6xl mb-4">✅</div>
      <h2 class="text-2xl font-bold mb-2">Received!</h2>
      <p class="text-green-100 mb-1">{{ result?.totalQty }} units across {{ result?.variantCount }} SKUs</p>
      <p class="text-green-200 text-sm">Inventory updated</p>
      <p class="text-green-200 text-sm mt-4">Returning in {{ countdown }}s...</p>
      <button @click="goHome" class="mt-4 px-6 py-2 bg-white text-green-700 font-semibold rounded-full text-sm shadow">
        Back to Home
      </button>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'

const route = useRoute()
const router = useRouter()
const api = axios.create({ baseURL: '/api', withCredentials: true })

const loading = ref(true)
const error = ref(null)
const box = ref(null)
const shipment = ref(null)
const receiving = ref(false)
const receiveError = ref(null)
const received = ref(false)
const result = ref(null)
const countdown = ref(3)
let countdownTimer = null

const qrToken = computed(() => route.params.qrToken)

const matchedCount = computed(() => (box.value?.items || []).filter(i => i.match_status !== 'unmatched' && i.match_status !== 'ignored').length)
const unmatchedCount = computed(() => (box.value?.items || []).filter(i => i.match_status === 'unmatched').length)

onMounted(async () => {
  try {
    const res = await api.get(`/inbound/scan/${qrToken.value}`)
    const data = res.data.data
    // items are returned at the top level, not nested inside box
    box.value = { ...data.box, items: data.items || [] }
    shipment.value = data.shipment
  } catch (e) {
    error.value = e.response?.data?.error || 'Invalid QR code'
  } finally {
    loading.value = false
  }
})

function goHome() {
  if (countdownTimer) clearInterval(countdownTimer)
  router.push('/')
}

async function confirmReceive() {
  receiving.value = true
  receiveError.value = null
  try {
    const res = await api.post(`/inbound/scan/${qrToken.value}/receive`, {})
    result.value = res.data.data
    received.value = true
    // Auto-redirect after 3 seconds
    countdown.value = 3
    countdownTimer = setInterval(() => {
      countdown.value--
      if (countdown.value <= 0) {
        clearInterval(countdownTimer)
        router.push('/')
      }
    }, 1000)
  } catch (e) {
    receiveError.value = e.response?.data?.error || e.message
  } finally {
    receiving.value = false
  }
}

onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer)
})

function fmtDate(dt) {
  if (!dt) return ''
  return new Date(dt).toLocaleString()
}
</script>
