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

      <!-- Success: show QR labels -->
      <div v-else-if="submitted" class="mt-10">
        <div class="text-center mb-6">
          <div class="text-5xl mb-3">✅</div>
          <div class="text-green-700 font-bold text-xl mb-1">Packing list submitted!</div>
          <div class="text-gray-400 text-sm">{{ submitSummary }}</div>
        </div>

        <div v-if="submittedBoxes.length > 0">
          <h2 class="text-sm font-semibold text-gray-700 mb-3">Print &amp; attach these labels to each box:</h2>
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
                  <div v-for="item in box.items" :key="item.id" class="text-xs text-gray-600">
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
        <!-- Header -->
        <div class="mb-5">
          <h1 class="text-xl font-bold text-gray-800">Packing List</h1>
          <p class="text-sm text-gray-400 mt-1">Batch: <span class="font-mono">{{ shipment.ref_no }}</span></p>
          <p v-if="shipment.factory" class="text-sm text-gray-500 mt-0.5">Factory: {{ shipment.factory }}</p>
          <p v-if="shipment.note" class="text-sm text-gray-500 mt-0.5">{{ shipment.note }}</p>
        </div>

        <!-- PO Reference Panel — shows remaining qty, updates as boxes are filled -->
        <div v-if="remainingQty.length > 0" class="mb-5 bg-blue-50 border border-blue-200 rounded-xl overflow-hidden">
          <div class="flex items-center justify-between px-4 py-3 cursor-pointer" @click="showPoPanel = !showPoPanel">
            <div class="flex items-center gap-2">
              <span class="text-sm font-semibold text-blue-800">📋 Order Reference</span>
              <span v-if="poNumbers" class="font-mono text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded">{{ poNumbers }}</span>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-xs text-blue-500">
                {{ totalRemaining }} units remaining
              </span>
              <span class="text-blue-300 text-xs">{{ showPoPanel ? '▲' : '▼' }}</span>
            </div>
          </div>
          <div v-if="showPoPanel" class="overflow-x-auto border-t border-blue-100">
            <table class="w-full text-xs">
              <thead>
                <tr class="text-blue-500 uppercase bg-blue-100/50">
                  <th class="px-4 py-2 text-left">SKU</th>
                  <th class="px-4 py-2 text-left">Product</th>
                  <th class="px-4 py-2 text-center">Ordered</th>
                  <th class="px-4 py-2 text-center">Packed</th>
                  <th class="px-4 py-2 text-center font-bold text-blue-700">Remaining</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-blue-100">
                <tr v-for="item in remainingQty" :key="item.raw_sku" :class="getLocalRemaining(item) === 0 ? 'opacity-50' : ''">
                  <td class="px-4 py-1.5 font-mono text-blue-800">{{ item.raw_sku }}</td>
                  <td class="px-4 py-1.5 text-blue-700">{{ item.product_title || item.raw_product_name || '—' }}</td>
                  <td class="px-4 py-1.5 text-center text-blue-600">{{ item.ordered_qty }}</td>
                  <td class="px-4 py-1.5 text-center text-gray-600">{{ getLocalAllocated(item.raw_sku) }}</td>
                  <td class="px-4 py-1.5 text-center font-bold" :class="getLocalRemaining(item) > 0 ? 'text-blue-800' : 'text-green-600'">
                    {{ getLocalRemaining(item) > 0 ? getLocalRemaining(item) : '✓' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
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
              <span class="text-xs text-gray-400">{{ boxTotal(box) }} units</span>
              <div v-if="box.qr_token" class="ml-auto flex items-center gap-2">
                <canvas :ref="el => setQrRef(el, box.qr_token)" class="w-10 h-10 rounded"></canvas>
              </div>
              <button v-else @click="removeBox(bi)" class="ml-auto text-xs text-red-400 hover:text-red-600">Remove</button>
            </div>

            <!-- Items -->
            <div class="px-4 py-3 space-y-2">
              <div v-for="(item, ii) in box.items" :key="ii" class="space-y-1">
                <div class="flex items-center gap-2">
                  <!-- Base SKU -->
                  <input
                    v-model="item.base_sku"
                    placeholder="Style No. (e.g. GS26020)"
                    class="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 min-w-0"
                  />
                  <!-- Size dropdown -->
                  <select
                    v-model="item.size"
                    class="w-28 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                  >
                    <option value="">Size</option>
                    <option value="0000">0000 (0-3w)</option>
                    <option value="000">000 (0-3m)</option>
                    <option value="00">00 (3-6m)</option>
                    <option value="0">0 (6-12m)</option>
                    <option value="1">1 (12-18m)</option>
                    <option value="XXS">XXS</option>
                    <option value="XS">XS</option>
                    <option value="S">S</option>
                    <option value="M">M</option>
                    <option value="L">L</option>
                    <option value="XL">XL</option>
                    <option value="OS">OS</option>
                  </select>
                  <!-- Qty -->
                  <input
                    v-model.number="item.quantity"
                    type="number"
                    min="1"
                    placeholder="Qty"
                    class="w-16 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                    :class="isOverAllocated(item) ? 'border-red-400 bg-red-50' : ''"
                  />
                  <button @click="removeItem(bi, ii)" class="text-red-400 hover:text-red-600 text-sm shrink-0">✕</button>
                </div>
                <!-- Remaining hint -->
                <div v-if="item.base_sku && item.size" class="pl-1 flex items-center gap-2">
                  <span v-if="getItemRemaining(item, bi, ii) !== null" class="text-xs" :class="isOverAllocated(item) ? 'text-red-500' : 'text-gray-400'">
                    <span v-if="isOverAllocated(item)">⚠ Over by {{ item.quantity - getItemRemaining(item, bi, ii) - item.quantity + getItemRemaining(item, bi, ii) }} — </span>
                    Remaining in order: <strong>{{ Math.max(0, getItemRemaining(item, bi, ii)) }}</strong>
                  </span>
                </div>
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
import { ref, computed, onMounted, nextTick } from 'vue'
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

// PO reference panel
const remainingQty = ref([])   // from server: ordered_qty per SKU (server-side allocated)
const showPoPanel = ref(true)

const token = route.params.token || route.query.token
const qrCanvasMap = {}

// ── Computed ──────────────────────────────────────────────────────────────────
const poNumbers = computed(() => {
  if (!remainingQty.value.length) return ''
  const nums = [...new Set(remainingQty.value.map(r => r.po_number).filter(Boolean))]
  return nums.join(', ')
})

const totalRemaining = computed(() => {
  return remainingQty.value.reduce((s, r) => s + Math.max(0, getLocalRemaining(r)), 0)
})

// ── Local allocation helpers (real-time as factory fills boxes) ───────────────
function getLocalAllocated(rawSku) {
  let total = 0
  for (const box of boxes.value) {
    for (const item of box.items) {
      const fullSku = item.base_sku && item.size ? `${item.base_sku.trim()}-${item.size}` : item.base_sku?.trim()
      if (fullSku === rawSku && item.quantity > 0) total += item.quantity
    }
  }
  return total
}

function getLocalRemaining(poItem) {
  const allocated = getLocalAllocated(poItem.raw_sku)
  // poItem.ordered_qty is total ordered; poItem.allocated_qty is what's already packed server-side (excluding current session)
  const serverAllocated = poItem.allocated_qty || 0
  return poItem.ordered_qty - serverAllocated - allocated
}

function getItemRemaining(item, bi, ii) {
  if (!item.base_sku || !item.size) return null
  const fullSku = `${item.base_sku.trim()}-${item.size}`
  const poItem = remainingQty.value.find(r => r.raw_sku === fullSku)
  if (!poItem) return null

  // Sum all other items in all boxes with same SKU (excluding current item)
  let otherAllocated = 0
  for (let b = 0; b < boxes.value.length; b++) {
    for (let i = 0; i < boxes.value[b].items.length; i++) {
      if (b === bi && i === ii) continue
      const it = boxes.value[b].items[i]
      const fs = it.base_sku && it.size ? `${it.base_sku.trim()}-${it.size}` : it.base_sku?.trim()
      if (fs === fullSku && it.quantity > 0) otherAllocated += it.quantity
    }
  }
  const serverAllocated = poItem.allocated_qty || 0
  return poItem.ordered_qty - serverAllocated - otherAllocated
}

function isOverAllocated(item) {
  if (!item.base_sku || !item.size || !item.quantity) return false
  const fullSku = `${item.base_sku.trim()}-${item.size}`
  const poItem = remainingQty.value.find(r => r.raw_sku === fullSku)
  if (!poItem) return false
  return getLocalAllocated(fullSku) > (poItem.ordered_qty - (poItem.allocated_qty || 0))
}

function boxTotal(box) {
  return (box.items || []).reduce((s, i) => s + (i.quantity || 0), 0)
}

// ── QR helpers ────────────────────────────────────────────────────────────────
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
  } catch (e) { console.warn('QR render failed', e) }
}

// ── Load form data ────────────────────────────────────────────────────────────
onMounted(async () => {
  try {
    const res = await api.get(`/inbound/factory-form/${token}`)
    shipment.value = res.data.data

    if (res.data.data.boxes?.length > 0) {
      boxes.value = res.data.data.boxes.map(b => ({
        box_no: b.box_no,
        qr_token: b.qr_token || null,
        items: (b.items || []).map(i => {
          const parts = (i.raw_sku || '').split('-')
          const size = parts.length > 1 ? parts[parts.length - 1] : ''
          const base = parts.length > 1 ? parts.slice(0, -1).join('-') : (i.raw_sku || '')
          return { base_sku: base, size, quantity: i.quantity }
        })
      }))
      await nextTick()
      for (const box of boxes.value) {
        if (box.qr_token && qrCanvasMap[box.qr_token]) {
          renderQr(box.qr_token, qrCanvasMap[box.qr_token])
        }
      }
    } else {
      boxes.value = [{ box_no: '1', qr_token: null, items: [{ base_sku: '', size: '', quantity: null }] }]
    }

    // Load remaining qty from server
    try {
      const rq = await api.get(`/inbound/factory-form/${token}/remaining-qty`)
      remainingQty.value = rq.data.data || []
    } catch { remainingQty.value = [] }

  } catch (e) {
    error.value = e.response?.data?.error || 'Invalid or expired link'
  } finally {
    loading.value = false
  }
})

// ── Box/item management ───────────────────────────────────────────────────────
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

// ── Submit ────────────────────────────────────────────────────────────────────
async function submitForm() {
  submitting.value = true
  submitError.value = null
  try {
    const payload = {
      boxes: boxes.value.map((b, idx) => ({
        box_no: b.box_no || String(idx + 1),
        items: b.items
          .filter(i => i.base_sku && i.quantity > 0)
          .map(i => ({
            raw_sku: i.size ? `${i.base_sku.trim()}-${i.size}` : i.base_sku.trim(),
            quantity: i.quantity,
          }))
      })).filter(b => b.items.length > 0)
    }
    if (payload.boxes.length === 0) {
      submitError.value = 'Please add at least one item with SKU and quantity'
      return
    }
    const res = await api.post(`/inbound/factory-form/${token}/submit`, payload)
    const d = res.data.data
    submitSummary.value = `${d.matched} SKUs matched, ${d.unmatched} unmatched`
    submittedBoxes.value = d.boxes || []
    submitted.value = true

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
