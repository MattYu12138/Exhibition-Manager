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
      <div v-else-if="submitted" class="mt-20 text-center">
        <div class="text-4xl mb-3">✅</div>
        <div class="text-green-700 font-bold text-lg">Packing list submitted!</div>
        <div class="text-gray-400 text-sm mt-1">{{ submitSummary }}</div>
      </div>

      <!-- Form -->
      <div v-else-if="shipment">
        <div class="mb-6">
          <h1 class="text-xl font-bold text-gray-800">Packing List</h1>
          <p class="text-sm text-gray-400 mt-1">Batch: <span class="font-mono">{{ shipment.ref_no }}</span></p>
          <p v-if="shipment.note" class="text-sm text-gray-500 mt-1">{{ shipment.note }}</p>
        </div>

        <!-- Boxes -->
        <div class="space-y-4 mb-4">
          <div v-for="(box, bi) in boxes" :key="bi" class="bg-white rounded-xl shadow-sm p-4">
            <div class="flex items-center gap-3 mb-3">
              <span class="font-semibold text-gray-700">Box</span>
              <input
                v-model="box.box_no"
                :placeholder="`${bi + 1}`"
                class="w-20 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <button @click="removeBox(bi)" class="ml-auto text-xs text-red-400 hover:text-red-600">Remove</button>
            </div>

            <!-- Items -->
            <div class="space-y-2 mb-3">
              <div v-for="(item, ii) in box.items" :key="ii" class="flex items-center gap-2">
                <input
                  v-model="item.raw_sku"
                  placeholder="SKU (e.g. GS26020-0000)"
                  class="flex-1 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <input
                  v-model.number="item.quantity"
                  type="number"
                  min="1"
                  placeholder="Qty"
                  class="w-20 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <button @click="removeItem(bi, ii)" class="text-red-400 hover:text-red-600 text-sm">✕</button>
              </div>
            </div>

            <button @click="addItem(bi)" class="text-xs text-blue-600 hover:underline">+ Add SKU</button>
          </div>
        </div>

        <button @click="addBox" class="w-full border-2 border-dashed border-gray-300 rounded-xl py-3 text-sm text-gray-400 hover:border-blue-400 hover:text-blue-500 mb-6">
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
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'

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

const token = route.params.token || route.query.token

onMounted(async () => {
  try {
    const res = await api.get(`/inbound/factory-form/${token}`)
    shipment.value = res.data.data
    // Pre-populate existing boxes if any
    if (res.data.data.boxes && res.data.data.boxes.length > 0) {
      boxes.value = res.data.data.boxes.map(b => ({
        box_no: b.box_no,
        items: (b.items || []).map(i => ({ raw_sku: i.raw_sku || '', quantity: i.quantity }))
      }))
    } else {
      boxes.value = [{ box_no: '1', items: [{ raw_sku: '', quantity: null }] }]
    }
  } catch (e) {
    error.value = e.response?.data?.error || 'Invalid or expired link'
  } finally {
    loading.value = false
  }
})

function addBox() {
  boxes.value.push({ box_no: String(boxes.value.length + 1), items: [{ raw_sku: '', quantity: null }] })
}

function removeBox(bi) {
  boxes.value.splice(bi, 1)
}

function addItem(bi) {
  boxes.value[bi].items.push({ raw_sku: '', quantity: null })
}

function removeItem(bi, ii) {
  boxes.value[bi].items.splice(ii, 1)
}

async function submitForm() {
  submitting.value = true
  submitError.value = null
  try {
    const payload = {
      boxes: boxes.value.map(b => ({
        box_no: b.box_no || String(boxes.value.indexOf(b) + 1),
        items: b.items.filter(i => i.raw_sku && i.quantity > 0).map(i => ({
          raw_sku: i.raw_sku.trim(),
          quantity: i.quantity,
        }))
      })).filter(b => b.items.length > 0)
    }
    if (payload.boxes.length === 0) {
      submitError.value = 'Please add at least one item'
      return
    }
    const res = await api.post(`/inbound/factory-form/${token}/submit`, payload)
    const d = res.data.data
    submitSummary.value = `${d.matched} SKUs matched, ${d.unmatched} unmatched`
    submitted.value = true
  } catch (e) {
    submitError.value = e.response?.data?.error || e.message
  } finally {
    submitting.value = false
  }
}
</script>
