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

        <!-- Print PDF + Continue adding more boxes -->
        <div class="mt-6 pt-5 border-t border-gray-200">
          <div class="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              @click="printLabelsPdf"
              :disabled="generatingPdf"
              class="bg-gray-800 hover:bg-gray-900 disabled:opacity-50 text-white font-semibold px-6 py-3 rounded-xl text-sm flex items-center justify-center gap-2"
            >
              <span>🖨️</span>
              {{ generatingPdf ? 'Generating PDF...' : 'Print Labels (PDF)' }}
            </button>
            <button
              @click="continueAdding"
              class="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl text-sm"
            >+ Add More Boxes</button>
          </div>
          <p class="text-xs text-gray-400 text-center mt-2">PDF contains a printable grid of QR labels — one per box</p>
        </div>
      </div>

      <!-- Form -->
      <div v-else-if="shipment">
        <!-- Header -->
        <div class="mb-4">
          <h1 class="text-xl font-bold text-gray-800">Packing List</h1>
          <p class="text-sm text-gray-400 mt-1">Batch: <span class="font-mono">{{ shipment.ref_no }}</span></p>
          <p v-if="shipment.factory" class="text-sm text-gray-500 mt-0.5">Factory: {{ shipment.factory }}</p>
          <p v-if="shipment.note" class="text-sm text-gray-500 mt-0.5">{{ shipment.note }}</p>
        </div>

        <!-- Overall packing progress bar -->
        <div v-if="overallProgress" class="mb-5 bg-white rounded-xl shadow-sm p-4">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-semibold text-gray-700">Packing Progress</span>
            <span class="text-xs text-gray-500">
              {{ overallProgress.totalAllocated.toLocaleString() }} / {{ overallProgress.totalOrdered.toLocaleString() }} units ({{ overallProgress.pct }}%)
            </span>
          </div>
          <div class="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
            <div
              class="h-3 rounded-full transition-all duration-500"
              :class="overallProgress.pct >= 100 ? 'bg-green-500' : overallProgress.pct >= 50 ? 'bg-blue-500' : 'bg-amber-400'"
              :style="{ width: Math.min(overallProgress.pct, 100) + '%' }"
            ></div>
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
                  <!-- Size dropdown — filtered by remaining qty when PO is linked -->
                  <select
                    v-model="item.size"
                    class="w-28 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                  >
                    <option value="">Size</option>
                    <option
                      v-for="sz in getAvailableSizes(item.base_sku)"
                      :key="sz.code"
                      :value="sz.code"
                    >{{ sz.label }}</option>
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

    <!-- ── Floating PO Reference Drawer Button ─────────────────────────────────── -->
    <button
      v-if="shipment && !submitted && remainingQty.length > 0"
      @click="showPoDrawer = true"
      class="fixed bottom-6 right-4 z-40 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-3 rounded-full shadow-lg transition-all"
    >
      <span class="text-base">📋</span>
      <span class="hidden sm:inline">Order Ref</span>
      <span v-if="totalRemaining > 0" class="bg-white text-blue-600 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0">
        {{ Math.min(totalRemaining, 99) }}
      </span>
      <span v-else class="bg-green-400 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0">✓</span>
    </button>

    <!-- ── PO Reference Drawer ─────────────────────────────────────────────────── -->
    <Transition name="drawer">
      <div v-if="showPoDrawer" class="fixed inset-0 z-50 flex justify-end">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/40" @click="showPoDrawer = false"></div>
        <!-- Drawer panel -->
        <div class="relative w-full max-w-sm bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
          <!-- Drawer header -->
          <div class="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between z-10">
            <div>
              <h2 class="text-sm font-bold text-gray-800">📋 Order Reference</h2>
              <p v-if="poNumbers" class="text-xs text-gray-400 mt-0.5 font-mono">{{ poNumbers }}</p>
            </div>
            <button @click="showPoDrawer = false" class="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
          </div>

          <!-- Overall progress in drawer -->
          <div v-if="overallProgress" class="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-xs font-medium text-gray-600">Overall Progress</span>
              <span class="text-xs text-gray-500">{{ overallProgress.totalAllocated }} / {{ overallProgress.totalOrdered }} units ({{ overallProgress.pct }}%)</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div
                class="h-2 rounded-full transition-all duration-500"
                :class="overallProgress.pct >= 100 ? 'bg-green-500' : overallProgress.pct >= 50 ? 'bg-blue-500' : 'bg-amber-400'"
                :style="{ width: Math.min(overallProgress.pct, 100) + '%' }"
              ></div>
            </div>
          </div>

          <!-- Product cards grouped by style -->
          <div class="flex-1 p-4 space-y-3">
            <div
              v-for="group in productGroups"
              :key="group.styleNo"
              class="bg-white border rounded-xl overflow-hidden shadow-sm"
              :class="group.allDone ? 'border-green-200' : 'border-gray-200'"
            >
              <!-- Card header -->
              <div class="px-3 py-2.5 flex items-start justify-between" :class="group.allDone ? 'bg-green-50' : 'bg-gray-50'">
                <div>
                  <div class="font-mono text-xs font-bold text-gray-700">{{ group.styleNo }}</div>
                  <div v-if="group.productName" class="text-xs text-gray-500 mt-0.5 truncate max-w-[180px]">{{ group.productName }}</div>
                </div>
                <span v-if="group.allDone" class="text-xs text-green-600 font-medium bg-green-100 px-2 py-0.5 rounded-full shrink-0">✓ Done</span>
                <span v-else class="text-xs text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded-full shrink-0">{{ group.totalRemaining }} left</span>
              </div>
              <!-- Size rows -->
              <div class="divide-y divide-gray-50">
                <div
                  v-for="row in group.sizes"
                  :key="row.raw_sku"
                  class="px-3 py-2 flex items-center gap-2 text-xs"
                >
                  <span class="w-12 font-mono text-gray-500 shrink-0">{{ row.sizeCode }}</span>
                  <div class="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      class="h-1.5 rounded-full"
                      :class="row.localRemaining <= 0 ? 'bg-green-400' : row.localAllocated > 0 ? 'bg-blue-400' : 'bg-gray-300'"
                      :style="{ width: row.ordered_qty > 0 ? Math.min(100, Math.round((row.localAllocated / row.ordered_qty) * 100)) + '%' : '0%' }"
                    ></div>
                  </div>
                  <span class="text-gray-400 shrink-0">{{ row.localAllocated }}/{{ row.ordered_qty }}</span>
                  <span
                    class="shrink-0 w-14 text-right font-medium"
                    :class="row.localRemaining <= 0 ? 'text-green-600' : 'text-amber-600'"
                  >{{ row.localRemaining <= 0 ? '✓ done' : row.localRemaining + ' left' }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import QRCode from 'qrcode'
import { jsPDF } from 'jspdf'

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
const generatingPdf = ref(false)

// PO reference drawer
const remainingQty = ref([])   // from server: ordered_qty per SKU
const showPoDrawer = ref(false)

const token = route.params.token || route.query.token
const qrCanvasMap = {}

// ── Size options master list ──────────────────────────────────────────────────
const sizeOptions = [
  { code: '0000', label: '0000 (0-3w)' },
  { code: '000',  label: '000 (0-3m)' },
  { code: '00',   label: '00 (3-6m)' },
  { code: '0',    label: '0 (6-12m)' },
  { code: '1',    label: '1 (12-18m)' },
  { code: 'XXS',  label: 'XXS' },
  { code: 'XS',   label: 'XS' },
  { code: 'S',    label: 'S' },
  { code: 'M',    label: 'M' },
  { code: 'L',    label: 'L' },
  { code: 'XL',   label: 'XL' },
  { code: 'OS',   label: 'OS' },
]

// ── Computed ──────────────────────────────────────────────────────────────────
const poNumbers = computed(() => {
  if (!remainingQty.value.length) return ''
  const nums = [...new Set(remainingQty.value.map(r => r.po_number).filter(Boolean))]
  return nums.join(', ')
})

const totalRemaining = computed(() => {
  return remainingQty.value.reduce((s, r) => s + Math.max(0, getLocalRemaining(r)), 0)
})

// Overall progress (combines server-side allocated + local session)
const overallProgress = computed(() => {
  if (!remainingQty.value.length) return null
  const totalOrdered = remainingQty.value.reduce((s, r) => s + (r.ordered_qty || 0), 0)
  if (totalOrdered === 0) return null
  // totalAllocated = server allocated + current session local
  const totalAllocated = remainingQty.value.reduce((s, r) => {
    const localAlloc = getLocalAllocated(r.raw_sku)
    return s + (r.allocated_qty || 0) + localAlloc
  }, 0)
  return {
    totalOrdered,
    totalAllocated: Math.min(totalAllocated, totalOrdered),
    pct: Math.min(100, Math.round((totalAllocated / totalOrdered) * 100))
  }
})

// Product groups for the drawer — group by style number (base SKU without size)
const productGroups = computed(() => {
  const groups = {}
  for (const row of remainingQty.value) {
    // Extract style no (everything before last dash)
    const parts = row.raw_sku.split('-')
    const styleNo = parts.length > 1 ? parts.slice(0, -1).join('-') : row.raw_sku
    const sizeCode = parts.length > 1 ? parts[parts.length - 1] : ''

    if (!groups[styleNo]) {
      groups[styleNo] = {
        styleNo,
        productName: row.product_title || row.raw_product_name || '',
        sizes: [],
        totalRemaining: 0,
        allDone: false,
      }
    }

    const localAlloc = getLocalAllocated(row.raw_sku)
    const serverAlloc = row.allocated_qty || 0
    const totalAlloc = serverAlloc + localAlloc
    const localRemaining = row.ordered_qty - totalAlloc

    groups[styleNo].sizes.push({
      raw_sku: row.raw_sku,
      sizeCode,
      ordered_qty: row.ordered_qty,
      localAllocated: Math.min(totalAlloc, row.ordered_qty),
      localRemaining,
    })
  }

  // Compute group totals
  for (const g of Object.values(groups)) {
    g.totalRemaining = g.sizes.reduce((s, sz) => s + Math.max(0, sz.localRemaining), 0)
    g.allDone = g.totalRemaining === 0
  }

  return Object.values(groups).sort((a, b) => a.styleNo.localeCompare(b.styleNo))
})

// ── Dynamic size options per base SKU ─────────────────────────────────────────
function getAvailableSizes(baseSku) {
  if (!baseSku || !remainingQty.value.length) return sizeOptions
  // Only show sizes that actually exist in the PO for this base SKU
  // and still have remaining qty > 0
  return sizeOptions.filter(sz => {
    const fullSku = `${baseSku.trim()}-${sz.code}`
    const row = remainingQty.value.find(r => r.raw_sku === fullSku)
    if (!row) return false  // Not in PO — hide this size
    const localAlloc = getLocalAllocated(fullSku)
    const totalAlloc = (row.allocated_qty || 0) + localAlloc
    return (row.ordered_qty - totalAlloc) > 0
  })
}

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

// ── Print QR labels as A4 PDF grid ──────────────────────────────────────────────
async function printLabelsPdf() {
  if (!submittedBoxes.value.length) return
  generatingPdf.value = true
  try {
    // A4 page: 210 x 297 mm
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW = 210
    const pageH = 297
    const margin = 10        // page margin mm
    const cols = 3           // labels per row
    const rows = 3           // labels per column
    const labelsPerPage = cols * rows
    const cellW = (pageW - margin * 2) / cols
    const cellH = (pageH - margin * 2) / rows
    const qrSize = Math.min(cellW, cellH) * 0.55  // QR code takes 55% of cell
    const qrOffX = (cellW - qrSize) / 2           // center QR horizontally

    for (let i = 0; i < submittedBoxes.value.length; i++) {
      const box = submittedBoxes.value[i]
      const page = Math.floor(i / labelsPerPage)
      const pos  = i % labelsPerPage
      const col  = pos % cols
      const row  = Math.floor(pos / cols)

      if (pos === 0 && i > 0) pdf.addPage()

      const x = margin + col * cellW
      const y = margin + row * cellH

      // Cell border
      pdf.setDrawColor(200)
      pdf.setLineWidth(0.3)
      pdf.rect(x, y, cellW, cellH)

      // Generate QR as data URL
      const qrUrl = `${window.location.origin}/scan/${box.qr_token}`
      const qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 256, margin: 1 })

      // Draw QR image centered
      pdf.addImage(qrDataUrl, 'PNG', x + qrOffX, y + 3, qrSize, qrSize)

      // Box label
      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'bold')
      pdf.text(`Box ${box.box_no}`, x + cellW / 2, y + qrSize + 8, { align: 'center' })

      // Shipment ref
      pdf.setFontSize(7)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(120)
      pdf.text(shipment.value?.ref_no || '', x + cellW / 2, y + qrSize + 13, { align: 'center' })
      pdf.setTextColor(0)

      // Item list (up to 4 lines)
      if (box.items?.length) {
        pdf.setFontSize(6)
        const maxLines = 4
        const lines = box.items.slice(0, maxLines)
        lines.forEach((it, li) => {
          const txt = `${it.raw_sku}  ×${it.quantity}`
          pdf.text(txt, x + cellW / 2, y + qrSize + 17 + li * 4, { align: 'center' })
        })
        if (box.items.length > maxLines) {
          pdf.text(`+${box.items.length - maxLines} more...`, x + cellW / 2, y + qrSize + 17 + maxLines * 4, { align: 'center' })
        }
      }
    }

    const filename = `${shipment.value?.ref_no || 'labels'}_QR_labels.pdf`
    pdf.save(filename)
  } catch (e) {
    console.error('PDF generation failed', e)
    alert('Failed to generate PDF: ' + e.message)
  } finally {
    generatingPdf.value = false
  }
}

// ── Continue adding more boxes after submit —————————————————————————————————————————
async function continueAdding() {
  // Reload the current server state so we see all already-submitted boxes
  try {
    const res = await api.get(`/inbound/factory-form/${token}`)
    shipment.value = res.data.data
    const serverBoxes = res.data.data.boxes || []
    const nextBoxNo = serverBoxes.length + 1
    // Restore existing boxes from server (read-only view) + one new empty box
    boxes.value = [
      ...serverBoxes.map(b => ({
        box_no: b.box_no,
        qr_token: b.qr_token || null,
        _submitted: true,  // mark as already submitted
        items: (b.items || []).map(i => {
          const parts = (i.raw_sku || '').split('-')
          const size = parts.length > 1 ? parts[parts.length - 1] : ''
          const base = parts.length > 1 ? parts.slice(0, -1).join('-') : (i.raw_sku || '')
          return { base_sku: base, size, quantity: i.quantity }
        })
      })),
      { box_no: String(nextBoxNo), qr_token: null, items: [{ base_sku: '', size: '', quantity: null }] }
    ]
    // Refresh remaining qty from server
    try {
      const rq = await api.get(`/inbound/factory-form/${token}/remaining-qty`)
      remainingQty.value = rq.data.data || []
    } catch { remainingQty.value = [] }
  } catch (e) {
    // Fallback: just clear submitted state with a fresh empty box
    const nextBoxNo = (submittedBoxes.value.length || 0) + 1
    boxes.value = [{ box_no: String(nextBoxNo), qr_token: null, items: [{ base_sku: '', size: '', quantity: null }] }]
  }
  submitted.value = false
  submittedBoxes.value = []
  submitSummary.value = ''
  submitError.value = null
}
</script>

<style scoped>
/* Drawer slide-in from right */
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.25s ease;
}
.drawer-enter-active .relative,
.drawer-leave-active .relative {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.drawer-enter-from {
  opacity: 0;
}
.drawer-enter-from .relative {
  transform: translateX(100%);
}
.drawer-leave-to {
  opacity: 0;
}
.drawer-leave-to .relative {
  transform: translateX(100%);
}
</style>
