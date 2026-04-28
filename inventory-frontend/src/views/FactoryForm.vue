<template>
  <div class="min-h-screen bg-gray-50 p-4">
    <div class="max-w-2xl mx-auto">

      <!-- Loading -->
      <div v-if="loading" class="mt-20 text-center text-gray-400">Loading...</div>

      <!-- Error -->
      <div v-else-if="error" class="mt-20 text-center">
        <div class="text-4xl mb-3">❌</div>
        <div class="text-red-600 font-medium">{{ error }}</div>
      </div>

      <!-- Success -->
      <div v-else-if="submitted" class="mt-10 text-center">
        <div class="text-5xl mb-4">✅</div>
        <div class="text-green-700 font-bold text-xl mb-1">Packing list submitted!</div>
        <div class="text-gray-400 text-sm mb-8">{{ submitSummary }}</div>

        <!-- Show QR codes for each box after submission -->
        <div v-if="submittedBoxes.length > 0" class="text-left">
          <h2 class="text-base font-semibold text-gray-700 mb-3">Print & attach these labels to each box:</h2>
          <div class="space-y-4">
            <div
              v-for="box in submittedBoxes"
              :key="box.id"
              class="bg-white rounded-xl shadow-sm p-4 flex items-start gap-4"
            >
              <canvas :ref="el => setQrRef(el, box.qr_token)" class="w-24 h-24 shrink-0 rounded"></canvas>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-gray-800 text-sm">Box {{ box.box_no }}</div>
                <div class="text-xs text-gray-400 font-mono mt-0.5">{{ shipment.ref_no }}</div>
                <div class="mt-2 space-y-0.5">
                  <div
                    v-for="item in box.items"
                    :key="item.id"
                    class="text-xs text-gray-600"
                  >
                    <span class="font-mono">{{ item.raw_sku }}</span>
                    <span class="text-gray-400 ml-1">× {{ item.quantity }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Form -->
      <div v-else-if="shipment">
        <div class="mb-6">
          <h1 class="text-xl font-bold text-gray-800">Packing List</h1>
          <p class="text-sm text-gray-400 mt-1">Batch: <span class="font-mono">{{ shipment.ref_no }}</span></p>
          <p v-if="shipment.factory" class="text-sm text-gray-500 mt-0.5">Factory: {{ shipment.factory }}</p>
          <p v-if="shipment.note" class="text-sm text-gray-500 mt-0.5">{{ shipment.note }}</p>
        </div>

        <!-- Boxes -->
        <div class="space-y-4 mb-4">
          <div v-for="(box, bi) in boxes" :key="bi" class="bg-white rounded-xl shadow-sm overflow-hidden">

            <!-- Box header -->
            <div class="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-gray-100">
              <span class="font-semibold text-gray-700 text-sm">Box</span>
              <input
                v-model="box.box_no"
                :placeholder="`${bi + 1}`"
                class="w-16 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <!-- QR code preview if box already has a qr_token (pre-existing) -->
              <div v-if="box.qr_token" class="ml-auto flex items-center gap-2">
                <canvas :ref="el => setQrRef(el, box.qr_token)" class="w-10 h-10 rounded"></canvas>
              </div>
              <button
                v-else
                @click="removeBox(bi)"
                class="ml-auto text-xs text-red-400 hover:text-red-600"
              >Remove</button>
            </div>

            <!-- Items -->
            <div class="px-4 py-3 space-y-2">
              <div v-for="(item, ii) in box.items" :key="ii" class="flex items-center gap-2">
                <!-- Base SKU input -->
                <input
                  v-model="item.base_sku"
                  placeholder="SKU (e.g. GS26020)"
                  class="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 min-w-0"
                />
                <!-- Size dropdown -->
                <select
                  v-model="item.size"
                  class="w-24 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                >
                  <option value="">Size</option>
                  <option value="0000">0000</option>
                  <option value="000">000</option>
                  <option value="00">00</option>
                  <option value="0">0</option>
                  <option value="1">1</option>
                </select>
                <!-- Qty input -->
                <input
                  v-model.number="item.quantity"
                  type="number"
                  min="1"
                  placeholder="Qty"
                  class="w-16 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <button @click="removeItem(bi, ii)" class="text-red-400 hover:text-red-600 text-sm shrink-0">✕</button>
              </div>
            </div>

            <div class="px-4 pb-4">
              <button @click="addItem(bi)" class="text-xs text-blue-600 hover:underline">+ Add SKU</button>
            </div>
          </div>
        </div>

        <button
          @click="addBox"
          class="w-full border-2 border-dashed border-gray-300 rounded-xl py-3 text-sm text-gray-400 hover:border-blue-400 hover:text-blue-500 mb-6"
        >
          + Add Box
        </button>

        <button
          @click="submitForm"
          :disabled="submitting || boxes.length === 0"
          class="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-4 rounded-2xl text-base"
        >
          {{ submitting ? 'Submitting...' : 'Submit Packing List' }}
        </button>

        <div v-if="submitError" class="mt-3 text-center text-red-600 text-sm">{{ submitError }}</div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import QRCode from 'qrcode'

const route = useRoute()
const api = axios.create({ baseURL: '/api', withCredentials: false })

const loading = ref(true)
const error = ref(null)
const shipment = ref(null)
const boxes = ref([])
const submitting = ref(false)
const submitted = ref(false)
const submitError = ref(null)
const submitSummary = ref('')
const submittedBoxes = ref([])

const token = route.params.token || route.query.token

// Map of qr_token -> canvas element for rendering QR codes
const qrCanvasMap = {}

function setQrRef(el, qrToken) {
  if (el && qrToken) {
    qrCanvasMap[qrToken] = el
    renderQr(qrToken, el)
  }
}

async function renderQr(qrToken, canvas) {
  if (!canvas || !qrToken) return
  const url = `${window.location.origin}/scan/${qrToken}`
  try {
    await QRCode.toCanvas(canvas, url, { width: 96, margin: 1 })
  } catch (e) {
    console.warn('QR render failed', e)
  }
}

onMounted(async () => {
  try {
    const res = await api.get(`/inbound/factory-form/${token}`)
    shipment.value = res.data.data
    if (res.data.data.boxes && res.data.data.boxes.length > 0) {
      boxes.value = res.data.data.boxes.map(b => ({
        box_no: b.box_no,
        qr_token: b.qr_token || null,
        items: (b.items || []).map(i => {
          // Parse existing raw_sku back into base_sku + size
          const parts = (i.raw_sku || '').split('-')
          const size = parts.length > 1 ? parts[parts.length - 1] : ''
          const base = parts.length > 1 ? parts.slice(0, -1).join('-') : (i.raw_sku || '')
          return { base_sku: base, size, quantity: i.quantity }
        })
      }))
      // Render QR codes for pre-existing boxes
      await nextTick()
      for (const box of boxes.value) {
        if (box.qr_token && qrCanvasMap[box.qr_token]) {
          renderQr(box.qr_token, qrCanvasMap[box.qr_token])
        }
      }
    } else {
      boxes.value = [{ box_no: '1', qr_token: null, items: [{ base_sku: '', size: '', quantity: null }] }]
    }
  } catch (e) {
    error.value = e.response?.data?.error || 'Invalid or expired link'
  } finally {
    loading.value = false
  }
})

function addBox() {
  boxes.value.push({
    box_no: String(boxes.value.length + 1),
    qr_token: null,
    items: [{ base_sku: '', size: '', quantity: null }]
  })
}

function removeBox(bi) {
  boxes.value.splice(bi, 1)
}

function addItem(bi) {
  boxes.value[bi].items.push({ base_sku: '', size: '', quantity: null })
}

function removeItem(bi, ii) {
  boxes.value[bi].items.splice(ii, 1)
}

async function submitForm() {
  submitting.value = true
  submitError.value = null
  try {
    const payload = {
      boxes: boxes.value.map((b, idx) => ({
        box_no: b.box_no || String(idx + 1),
        items: b.items
          .filter(i => i.base_sku && i.size && i.quantity > 0)
          .map(i => ({
            raw_sku: `${i.base_sku.trim()}-${i.size}`,
            quantity: i.quantity,
          }))
      })).filter(b => b.items.length > 0)
    }
    if (payload.boxes.length === 0) {
      submitError.value = 'Please add at least one item with SKU, size and quantity'
      return
    }
    const res = await api.post(`/inbound/factory-form/${token}/submit`, payload)
    const d = res.data.data
    submitSummary.value = `${d.matched} SKUs matched, ${d.unmatched} unmatched`
    submittedBoxes.value = d.boxes || []
    submitted.value = true

    // Render QR codes for submitted boxes
    await nextTick()
    for (const box of submittedBoxes.value) {
      if (box.qr_token && qrCanvasMap[box.qr_token]) {
        renderQr(box.qr_token, qrCanvasMap[box.qr_token])
      }
    }
  } catch (e) {
    submitError.value = e.response?.data?.error || e.message
  } finally {
    submitting.value = false
  }
}
</script>
