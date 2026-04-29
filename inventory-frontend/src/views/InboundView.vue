<template>
  <div class="inbound-view">

    <!-- ── Shipment List ──────────────────────────────────────────────────── -->
    <div v-if="!activeShipment">

      <!-- Inner tab bar: Shipments / Purchase Orders -->
      <div class="flex items-center gap-1 mb-5 border-b border-gray-200">
        <button
          @click="inboundTab = 'shipments'"
          class="px-4 py-2 text-sm font-medium transition-colors"
          :class="inboundTab === 'shipments' ? 'text-purple-600 border-b-2 border-purple-600 -mb-px' : 'text-gray-500 hover:text-gray-700'"
        >{{ t('inbound.tabShipments') }}</button>
        <button
          @click="inboundTab = 'po'"
          class="px-4 py-2 text-sm font-medium transition-colors"
          :class="inboundTab === 'po' ? 'text-purple-600 border-b-2 border-purple-600 -mb-px' : 'text-gray-500 hover:text-gray-700'"
        >{{ t('inbound.tabPurchaseOrders') }}</button>
      </div>

      <!-- ── Shipments Tab ── -->
      <div v-if="inboundTab === 'shipments'">
      <!-- Toolbar -->
      <div class="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div class="flex items-center gap-3">
          <h2 class="text-base font-bold text-gray-800">{{ t('inbound.title') }}</h2>
          <span class="text-xs text-gray-400">({{ shipments.length }})</span>
        </div>
        <div class="flex items-center gap-2">
          <!-- Scan to Receive button -->
          <button
            @click="showScanner = true"
            class="text-sm border border-purple-300 text-purple-600 hover:bg-purple-50 px-3 py-2 rounded-lg flex items-center gap-1.5"
          >📷 {{ t('inbound.scanToReceive') }}</button>
          <a
            :href="excelTemplateUrl"
            class="text-xs text-gray-500 hover:text-gray-700 border border-gray-300 rounded px-3 py-1.5 flex items-center gap-1"
          >⬇ {{ t('inbound.downloadTemplate') }}</a>
          <button
            @click="openCreateModal"
            class="bg-purple-600 hover:bg-purple-700 text-white text-sm px-4 py-2 rounded-lg"
          >+ {{ t('inbound.newShipment') }}</button>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="text-center py-20 text-gray-400">{{ t('inbound.loading') }}</div>

      <!-- Empty -->
      <div v-else-if="shipments.length === 0" class="text-center py-20 text-gray-400">
        <div class="text-4xl mb-3">📦</div>
        <div>{{ t('inbound.noShipments') }}</div>
      </div>

      <!-- Table -->
      <div v-else class="bg-white rounded-xl shadow-sm overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th class="px-4 py-3 text-left">{{ t('inbound.refNo') }}</th>
              <th class="px-4 py-3 text-left">{{ t('inbound.factory') }}</th>
              <th class="px-4 py-3 text-left">{{ t('inbound.source') }}</th>
              <th class="px-4 py-3 text-center">{{ t('inbound.boxes') }}</th>
              <th class="px-4 py-3 text-center">{{ t('inbound.totalQty') }}</th>
              <th class="px-4 py-3 text-center">{{ t('inbound.status') }}</th>
              <th class="px-4 py-3 text-left">{{ t('inbound.createdAt') }}</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr
              v-for="s in shipments"
              :key="s.id"
              class="hover:bg-gray-50 cursor-pointer"
              @click="openShipment(s.id)"
            >
              <td class="px-4 py-3 font-mono text-xs text-gray-700">{{ s.ref_no }}</td>
              <td class="px-4 py-3 text-gray-700">{{ s.factory || '—' }}</td>
              <td class="px-4 py-3">
                <span class="text-xs px-2 py-0.5 rounded-full" :class="sourceClass(s.source)">{{ t('inbound.source_' + s.source) }}</span>
              </td>
              <td class="px-4 py-3 text-center text-gray-600">
                {{ s.received_boxes }}/{{ s.total_boxes }}
              </td>
              <td class="px-4 py-3 text-center text-gray-600">{{ s.total_qty }}</td>
              <td class="px-4 py-3 text-center">
                <span class="text-xs px-2 py-0.5 rounded-full font-medium" :class="statusClass(s.status)">
                  {{ t('inbound.status_' + s.status) }}
                </span>
              </td>
              <td class="px-4 py-3 text-xs text-gray-400">{{ fmtDate(s.created_at) }}</td>
              <td class="px-4 py-3 text-right">
                <button
                  v-if="s.status !== 'received'"
                  @click.stop="confirmDelete(s)"
                  class="text-xs text-red-400 hover:text-red-600"
                >{{ t('inbound.delete') }}</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      </div><!-- end shipments tab -->

      <!-- ── Purchase Orders Tab ── -->
      <div v-if="inboundTab === 'po'">
        <!-- PO Toolbar -->
        <div class="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div class="flex items-center gap-3">
            <h2 class="text-base font-bold text-gray-800">{{ t('inbound.tabPurchaseOrders') }}</h2>
            <span class="text-xs text-gray-400">({{ purchaseOrders.length }})</span>
          </div>
          <div class="flex items-center gap-2">
            <!-- Import PO Excel -->
            <label class="cursor-pointer text-xs border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-50 flex items-center gap-1">
              {{ importingPo ? t('inbound.importing') : '⬆ ' + t('inbound.importPoExcel') }}
              <input type="file" accept=".xlsx,.xls" class="hidden" @change="handlePoImport" :disabled="importingPo" />
            </label>
          </div>
        </div>

        <!-- PO import result -->
        <div v-if="poImportResult" class="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          ✓ {{ t('inbound.poImported') }}: {{ poImportResult.po_number }} —
          {{ poImportResult.summary?.matched }} {{ t('inbound.matched') }},
          {{ poImportResult.summary?.unmatched }} {{ t('inbound.unmatched') }}
          <button @click="poImportResult = null" class="ml-2 text-green-500 hover:text-green-700">✕</button>
        </div>

        <!-- PO loading -->
        <div v-if="poLoading" class="text-center py-20 text-gray-400">{{ t('inbound.loading') }}</div>

        <!-- PO empty -->
        <div v-else-if="purchaseOrders.length === 0" class="text-center py-20 text-gray-400">
          <div class="text-4xl mb-3">📋</div>
          <div>{{ t('inbound.noPurchaseOrders') }}</div>
          <p class="text-xs mt-2 text-gray-400">{{ t('inbound.importPoHint') }}</p>
        </div>

        <!-- PO table -->
        <div v-else class="bg-white rounded-xl shadow-sm overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th class="px-4 py-3 text-left">{{ t('inbound.poNumber') }}</th>
                <th class="px-4 py-3 text-left">{{ t('inbound.factory') }}</th>
                <th class="px-4 py-3 text-center">{{ t('inbound.poItems') }}</th>
                <th class="px-4 py-3 text-center">{{ t('inbound.poOrdered') }}</th>
                <th class="px-4 py-3 text-center">{{ t('inbound.poReceived') }}</th>
                <th class="px-4 py-3 text-center">{{ t('inbound.status') }}</th>
                <th class="px-4 py-3 text-left">{{ t('inbound.createdAt') }}</th>
                <th class="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr
                v-for="po in purchaseOrders"
                :key="po.id"
                class="hover:bg-gray-50"
              >
                <td class="px-4 py-3 font-mono text-xs font-bold text-gray-700">{{ po.po_number }}</td>
                <td class="px-4 py-3 text-gray-600">{{ po.factory || '—' }}</td>
                <td class="px-4 py-3 text-center text-gray-600">{{ po.item_count }}</td>
                <td class="px-4 py-3 text-center text-gray-600">{{ po.total_ordered }}</td>
                <td class="px-4 py-3 text-center text-gray-600">{{ po.total_received }}</td>
                <td class="px-4 py-3 text-center">
                  <span class="text-xs px-2 py-0.5 rounded-full font-medium" :class="poStatusClass(po.status)">
                    {{ t('inbound.poStatus_' + po.status) }}
                  </span>
                </td>
                <td class="px-4 py-3 text-xs text-gray-400">{{ fmtDate(po.created_at) }}</td>
                <td class="px-4 py-3 text-right flex items-center justify-end gap-2">
                  <!-- Create shipment from PO -->
                  <button
                    v-if="!po.shipment_id"
                    @click="createShipmentFromPo(po)"
                    class="text-xs text-purple-500 hover:text-purple-700 border border-purple-200 rounded px-2 py-1"
                  >{{ t('inbound.createShipment') }}</button>
                  <button
                    v-else
                    @click="openShipment(po.shipment_id); inboundTab = 'shipments'"
                    class="text-xs text-blue-500 hover:text-blue-700 border border-blue-200 rounded px-2 py-1"
                  >{{ t('inbound.viewShipment') }}</button>
                  <button
                    v-if="po.status !== 'fulfilled'"
                    @click="confirmDeletePo(po)"
                    class="text-xs text-red-400 hover:text-red-600"
                  >{{ t('inbound.delete') }}</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div><!-- end po tab -->

    </div><!-- end !activeShipment outer -->

    <!-- ── Shipment Detail ────────────────────────────────────────────────── -->
    <div v-else>
      <!-- Back + Header -->
      <div class="flex items-center gap-3 mb-5 flex-wrap">
        <button @click="closeShipment" class="text-sm text-gray-400 hover:text-gray-600">← {{ t('inbound.back') }}</button>
        <span class="text-gray-300">|</span>
        <span class="font-mono text-sm font-bold text-gray-700">{{ activeShipment.ref_no }}</span>
        <span class="text-xs px-2 py-0.5 rounded-full font-medium" :class="statusClass(activeShipment.status)">
          {{ t('inbound.status_' + activeShipment.status) }}
        </span>
        <span v-if="activeShipment.factory" class="text-sm text-gray-500">— {{ activeShipment.factory }}</span>
        <div class="ml-auto flex items-center gap-2 flex-wrap">
          <!-- Unmatched warning -->
          <span v-if="unmatchedCount > 0" class="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            ⚠ {{ unmatchedCount }} {{ t('inbound.unmatchedItems') }}
          </span>
          <!-- Form link -->
          <button
            v-if="activeShipment.status !== 'received'"
            @click="generateFormLink"
            :disabled="generatingLink"
            class="text-xs border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-50"
          >🔗 {{ t('inbound.generateFormLink') }}</button>
          <!-- Add box -->
          <button
            v-if="activeShipment.status !== 'received'"
            @click="addBox"
            :disabled="addingBox"
            class="text-xs bg-gray-700 hover:bg-gray-800 text-white rounded px-3 py-1.5"
          >+ {{ t('inbound.addBox') }}</button>
        </div>
      </div>

      <!-- Form link display -->
      <div v-if="formLink" class="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm flex items-center gap-3 flex-wrap">
        <span class="text-blue-700 font-medium">{{ t('inbound.formLinkReady') }}</span>
        <code class="text-xs bg-white border rounded px-2 py-1 flex-1 min-w-0 truncate">{{ formLink }}</code>
        <button @click="copyFormLink" class="text-xs text-blue-600 hover:underline shrink-0">{{ t('inbound.copy') }}</button>
      </div>

      <!-- Excel upload -->
      <div
        v-if="activeShipment.status !== 'received'"
        class="mb-4 p-3 bg-gray-50 border border-dashed border-gray-300 rounded-lg flex items-center gap-3 flex-wrap"
      >
        <span class="text-sm text-gray-500">{{ t('inbound.uploadExcel') }}</span>
        <label class="cursor-pointer text-xs bg-white border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-50">
          {{ uploadingExcel ? t('inbound.uploading') : t('inbound.chooseFile') }}
          <input type="file" accept=".xlsx,.xls,.csv" class="hidden" @change="handleExcelUpload" :disabled="uploadingExcel" />
        </label>
        <span v-if="excelResult" class="text-xs text-green-600">
          ✓ {{ excelResult.boxes_created }} {{ t('inbound.boxesCreated') }}, {{ excelResult.items_matched }} {{ t('inbound.matched') }}, {{ excelResult.items_unmatched }} {{ t('inbound.unmatched') }}
        </span>
      </div>

      <!-- Boxes -->
      <div v-if="!activeShipment.boxes || activeShipment.boxes.length === 0" class="text-center py-12 text-gray-400">
        {{ t('inbound.noBoxes') }}
      </div>

      <div v-else class="space-y-4">
        <div
          v-for="box in activeShipment.boxes"
          :key="box.id"
          class="bg-white rounded-xl shadow-sm overflow-hidden"
        >
          <!-- Box header -->
          <div class="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
            <div class="flex items-center gap-3">
              <span class="font-semibold text-gray-700">{{ t('inbound.box') }} {{ box.box_no }}</span>
              <span class="text-xs px-2 py-0.5 rounded-full" :class="box.status === 'received' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'">
                {{ box.status === 'received' ? t('inbound.received') : t('inbound.pending') }}
              </span>
              <span class="text-xs text-gray-400">{{ box.items?.length || 0 }} {{ t('inbound.skus') }}</span>
            </div>
            <div class="flex items-center gap-2">
              <!-- QR code -->
              <button
                @click="showQr(box)"
                class="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2 py-1"
              >QR</button>
              <!-- Delete box -->
              <button
                v-if="box.status !== 'received' && activeShipment.status !== 'received'"
                @click="deleteBox(box)"
                class="text-xs text-red-400 hover:text-red-600"
              >{{ t('inbound.delete') }}</button>
            </div>
          </div>

          <!-- Items table -->
          <table class="w-full text-xs">
            <thead class="text-gray-400 uppercase">
              <tr>
                <th class="px-4 py-2 text-left">{{ t('inbound.sku') }}</th>
                <th class="px-4 py-2 text-left">{{ t('inbound.product') }}</th>
                <th class="px-4 py-2 text-center">{{ t('inbound.matchStatus') }}</th>
                <th class="px-4 py-2 text-center">{{ t('inbound.qty') }}</th>
                <th class="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              <tr
                v-for="item in box.items"
                :key="item.id"
                :class="item.match_status === 'unmatched' ? 'bg-amber-50' : ''"
              >
                <td class="px-4 py-2 font-mono text-gray-700">
                  {{ item.raw_sku || item.raw_gtin || '—' }}
                </td>
                <td class="px-4 py-2 text-gray-600">
                  <span v-if="item.match_status !== 'unmatched'">
                    {{ item.product_title }}<span v-if="item.variant_title" class="text-gray-400"> / {{ item.variant_title }}</span>
                  </span>
                  <span v-else class="text-amber-600">{{ t('inbound.noMatch') }}</span>
                </td>
                <td class="px-4 py-2 text-center">
                  <span class="px-1.5 py-0.5 rounded text-xs" :class="matchClass(item.match_status)">
                    {{ t('inbound.match_' + item.match_status) }}
                  </span>
                </td>
                <td class="px-4 py-2 text-center font-medium text-gray-700">{{ item.quantity }}</td>
                <td class="px-4 py-2 text-right flex items-center justify-end gap-2">
                  <!-- Manual match for unmatched items -->
                  <button
                    v-if="item.match_status === 'unmatched' && box.status !== 'received'"
                    @click="openManualMatch(item)"
                    class="text-xs text-blue-500 hover:underline"
                  >{{ t('inbound.manualMatch') }}</button>
                  <button
                    v-if="box.status !== 'received' && activeShipment.status !== 'received'"
                    @click="deleteItem(item, box)"
                    class="text-xs text-red-400 hover:text-red-600"
                  >✕</button>
                </td>
              </tr>
            </tbody>
          </table>

          <!-- Add item row -->
          <div v-if="box.status !== 'received' && activeShipment.status !== 'received'" class="px-4 py-2 border-t border-gray-100">
            <div v-if="addingItemBoxId !== box.id">
              <button @click="startAddItem(box.id)" class="text-xs text-purple-600 hover:underline">+ {{ t('inbound.addItem') }}</button>
            </div>
            <div v-else class="flex items-center gap-2 flex-wrap">
              <!-- SKU search -->
              <div class="relative flex-1 min-w-40">
                <input
                  v-model="newItem.raw_sku"
                  @input="onSkuInput"
                  :placeholder="t('inbound.skuPlaceholder')"
                  class="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-purple-400"
                />
                <div v-if="skuSuggestions.length > 0" class="absolute z-20 left-0 right-0 bg-white border border-gray-200 rounded shadow-lg max-h-48 overflow-y-auto">
                  <div
                    v-for="s in skuSuggestions"
                    :key="s.shopify_variant_id"
                    @click="selectSku(s)"
                    class="px-3 py-2 hover:bg-purple-50 cursor-pointer"
                  >
                    <div class="font-mono text-xs text-gray-700">{{ s.sku }}</div>
                    <div class="text-xs text-gray-400">{{ s.product_title }} <span v-if="s.variant_title">/ {{ s.variant_title }}</span></div>
                  </div>
                </div>
              </div>
              <input
                v-model.number="newItem.quantity"
                type="number"
                min="1"
                :placeholder="t('inbound.qtyPlaceholder')"
                class="w-20 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-purple-400"
              />
              <button @click="submitAddItem(box.id)" :disabled="!newItem.raw_sku || !newItem.quantity" class="text-xs bg-purple-600 text-white rounded px-3 py-1 disabled:opacity-50">{{ t('inbound.add') }}</button>
              <button @click="cancelAddItem" class="text-xs text-gray-400 hover:text-gray-600">{{ t('inbound.cancel') }}</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Create Shipment Modal ───────────────────────────────────────────── -->
    <div v-if="showCreateModal" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h3 class="text-base font-bold text-gray-800 mb-4">{{ t('inbound.newShipment') }}</h3>
        <div class="space-y-3">
          <div>
            <label class="text-xs text-gray-500 mb-1 block">{{ t('inbound.factory') }}</label>
            <input v-model="createForm.factory" :placeholder="t('inbound.factoryPlaceholder')" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
          </div>
          <div>
            <label class="text-xs text-gray-500 mb-1 block">{{ t('inbound.note') }}</label>
            <textarea v-model="createForm.note" rows="2" :placeholder="t('inbound.notePlaceholder')" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none"></textarea>
          </div>
        </div>
        <div class="flex justify-end gap-2 mt-5">
          <button @click="showCreateModal = false" class="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">{{ t('inbound.cancel') }}</button>
          <button @click="createShipment" :disabled="creating" class="bg-purple-600 hover:bg-purple-700 text-white text-sm px-5 py-2 rounded-lg disabled:opacity-50">
            {{ creating ? t('inbound.creating') : t('inbound.create') }}
          </button>
        </div>
      </div>
    </div>

    <!-- ── QR Code Modal ───────────────────────────────────────────────────── -->
    <div v-if="qrBox" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" @click.self="qrBox = null">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
        <h3 class="text-base font-bold text-gray-800 mb-1">{{ t('inbound.box') }} {{ qrBox.box_no }}</h3>
        <p class="text-xs text-gray-400 mb-4">{{ activeShipment?.ref_no }}</p>
        <div class="flex justify-center mb-4">
          <canvas ref="qrCanvas" width="200" height="200"></canvas>
        </div>
        <p class="text-xs text-gray-400 break-all mb-4">{{ qrUrl }}</p>
        <div class="flex gap-2 justify-center">
          <button @click="printQr" class="text-sm bg-gray-800 text-white rounded-lg px-4 py-2">🖨 {{ t('inbound.print') }}</button>
          <button @click="qrBox = null" class="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">{{ t('inbound.close') }}</button>
        </div>
      </div>
    </div>

    <!-- ── Manual Match Modal ─────────────────────────────────────────────── -->
    <div v-if="manualMatchItem" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" @click.self="manualMatchItem = null">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
        <h3 class="text-base font-bold text-gray-800 mb-1">{{ t('inbound.manualMatch') }}</h3>
        <p class="text-xs text-gray-400 mb-4">{{ t('inbound.manualMatchDesc') }}: <code class="bg-gray-100 px-1 rounded">{{ manualMatchItem.raw_sku || manualMatchItem.raw_gtin }}</code></p>
        <input
          v-model="manualMatchQuery"
          @input="onManualSearchInput"
          :placeholder="t('inbound.skuPlaceholder')"
          class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-purple-400"
        />
        <div class="max-h-60 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
          <div v-if="manualSearchResults.length === 0" class="text-center py-6 text-gray-400 text-sm">{{ t('inbound.noResults') }}</div>
          <div
            v-for="r in manualSearchResults"
            :key="r.shopify_variant_id"
            @click="applyManualMatch(r)"
            class="px-3 py-2 hover:bg-purple-50 cursor-pointer"
          >
            <div class="font-mono text-xs text-gray-700">{{ r.sku }}</div>
            <div class="text-xs text-gray-500">{{ r.product_title }} <span v-if="r.variant_title">/ {{ r.variant_title }}</span></div>
          </div>
        </div>
        <div class="flex justify-end mt-4">
          <button @click="manualMatchItem = null" class="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">{{ t('inbound.cancel') }}</button>
        </div>
      </div>
    </div>

    <!-- ── QR Scanner Modal ─────────────────────────────────────────────────── -->
    <QrScanner v-if="showScanner" @close="showScanner = false" @scanned="onScanned" />

  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import axios from 'axios'
import QRCode from 'qrcode'
import QrScanner from '../components/QrScanner.vue'

const { t } = useI18n()
const router = useRouter()
const api = axios.create({ baseURL: '/api', withCredentials: true })

// ── State ─────────────────────────────────────────────────────────────────────
const shipments = ref([])
const loading = ref(true)
const activeShipment = ref(null)

const showCreateModal = ref(false)
const creating = ref(false)
const createForm = ref({ factory: '', note: '' })

const addingBox = ref(false)
const generatingLink = ref(false)
const formLink = ref('')

const uploadingExcel = ref(false)
const excelResult = ref(null)

const addingItemBoxId = ref(null)
const newItem = ref({ raw_sku: '', quantity: null, shopify_variant_id: null, variant_title: null, product_title: null })
const skuSuggestions = ref([])
let skuDebounce = null

const qrBox = ref(null)
const qrCanvas = ref(null)
const qrUrl = computed(() => {
  if (!qrBox.value) return ''
  const base = window.location.origin
  return `${base}/scan/${qrBox.value.qr_token}`
})

const manualMatchItem = ref(null)
const manualMatchQuery = ref('')
const manualSearchResults = ref([])
let manualDebounce = null

// ── Inner tab + scanner ───────────────────────────────────────────────────────
const inboundTab = ref('shipments')
const showScanner = ref(false)

// ── Purchase Orders ───────────────────────────────────────────────────────────
const purchaseOrders = ref([])
const poLoading = ref(false)
const importingPo = ref(false)
const poImportResult = ref(null)

// ── Computed ──────────────────────────────────────────────────────────────────
const unmatchedCount = computed(() => {
  if (!activeShipment.value?.boxes) return 0
  return activeShipment.value.boxes.reduce((acc, box) => {
    return acc + (box.items || []).filter(i => i.match_status === 'unmatched').length
  }, 0)
})

const excelTemplateUrl = '/api/inbound/excel-template'

// ── Lifecycle ─────────────────────────────────────────────────────────────────
loadShipments()

async function loadShipments() {
  loading.value = true
  try {
    const res = await api.get('/inbound/shipments')
    shipments.value = res.data.data
  } catch (e) {
    console.error('load shipments:', e)
  } finally {
    loading.value = false
  }
}

async function openShipment(id) {
  try {
    const res = await api.get(`/inbound/shipments/${id}`)
    activeShipment.value = res.data.data
    formLink.value = ''
    excelResult.value = null
  } catch (e) {
    console.error('open shipment:', e)
  }
}

function closeShipment() {
  activeShipment.value = null
  loadShipments()
}

// ── Create shipment ───────────────────────────────────────────────────────────
function openCreateModal() {
  createForm.value = { factory: '', note: '' }
  showCreateModal.value = true
}

async function createShipment() {
  creating.value = true
  try {
    const res = await api.post('/inbound/shipments', createForm.value)
    showCreateModal.value = false
    await openShipment(res.data.data.id)
  } catch (e) {
    alert(e.response?.data?.error || e.message)
  } finally {
    creating.value = false
  }
}

// ── Delete shipment ───────────────────────────────────────────────────────────
async function confirmDelete(s) {
  if (!confirm(`${t('inbound.confirmDelete')} ${s.ref_no}?`)) return
  try {
    await api.delete(`/inbound/shipments/${s.id}`)
    await loadShipments()
  } catch (e) {
    alert(e.response?.data?.error || e.message)
  }
}

// ── Add box ───────────────────────────────────────────────────────────────────
async function addBox() {
  addingBox.value = true
  try {
    const res = await api.post(`/inbound/shipments/${activeShipment.value.id}/boxes`, {})
    activeShipment.value.boxes.push({ ...res.data.data, items: [] })
    activeShipment.value.total_boxes = (activeShipment.value.total_boxes || 0) + 1
  } catch (e) {
    alert(e.response?.data?.error || e.message)
  } finally {
    addingBox.value = false
  }
}

// ── Delete box ────────────────────────────────────────────────────────────────
async function deleteBox(box) {
  if (!confirm(`${t('inbound.confirmDeleteBox')} ${box.box_no}?`)) return
  try {
    await api.delete(`/inbound/boxes/${box.id}`)
    activeShipment.value.boxes = activeShipment.value.boxes.filter(b => b.id !== box.id)
  } catch (e) {
    alert(e.response?.data?.error || e.message)
  }
}

// ── Add item ──────────────────────────────────────────────────────────────────
function startAddItem(boxId) {
  addingItemBoxId.value = boxId
  newItem.value = { raw_sku: '', quantity: null, shopify_variant_id: null, variant_title: null, product_title: null }
  skuSuggestions.value = []
}

function cancelAddItem() {
  addingItemBoxId.value = null
  skuSuggestions.value = []
}

function onSkuInput() {
  clearTimeout(skuDebounce)
  const q = newItem.value.raw_sku.trim()
  if (q.length < 2) { skuSuggestions.value = []; return }
  skuDebounce = setTimeout(async () => {
    try {
      const res = await api.get(`/inbound/sku-search?q=${encodeURIComponent(q)}`)
      skuSuggestions.value = res.data.data
    } catch (_) {}
  }, 250)
}

function selectSku(s) {
  newItem.value.raw_sku = s.sku
  newItem.value.shopify_variant_id = s.shopify_variant_id
  newItem.value.variant_title = s.variant_title
  newItem.value.product_title = s.product_title
  skuSuggestions.value = []
}

async function submitAddItem(boxId) {
  if (!newItem.value.raw_sku || !newItem.value.quantity) return
  try {
    const res = await api.post(`/inbound/boxes/${boxId}/items`, {
      raw_sku: newItem.value.raw_sku,
      quantity: newItem.value.quantity,
    })
    const box = activeShipment.value.boxes.find(b => b.id === boxId)
    if (box) box.items.push(res.data.data)
    cancelAddItem()
  } catch (e) {
    alert(e.response?.data?.error || e.message)
  }
}

// ── Delete item ───────────────────────────────────────────────────────────────
async function deleteItem(item, box) {
  try {
    await api.delete(`/inbound/items/${item.id}`)
    box.items = box.items.filter(i => i.id !== item.id)
  } catch (e) {
    alert(e.response?.data?.error || e.message)
  }
}

// ── Form link ─────────────────────────────────────────────────────────────────
async function generateFormLink() {
  generatingLink.value = true
  try {
    const res = await api.post(`/inbound/shipments/${activeShipment.value.id}/form-token`)
    formLink.value = res.data.url
  } catch (e) {
    alert(e.response?.data?.error || e.message)
  } finally {
    generatingLink.value = false
  }
}

function copyFormLink() {
  navigator.clipboard.writeText(formLink.value).then(() => alert(t('inbound.copied')))
}

// ── Excel upload ──────────────────────────────────────────────────────────────
async function handleExcelUpload(e) {
  const file = e.target.files[0]
  if (!file) return
  uploadingExcel.value = true
  excelResult.value = null
  try {
    const formData = new FormData()
    formData.append('file', file)
    const res = await api.post(`/inbound/shipments/${activeShipment.value.id}/upload-excel`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    excelResult.value = res.data.summary
    // Reload shipment detail
    await openShipment(activeShipment.value.id)
  } catch (e) {
    alert(e.response?.data?.error || e.message)
  } finally {
    uploadingExcel.value = false
    e.target.value = ''
  }
}

// ── QR Code ───────────────────────────────────────────────────────────────────
async function showQr(box) {
  qrBox.value = box
  await nextTick()
  const url = `${window.location.origin}/scan/${box.qr_token}`
  if (qrCanvas.value) {
    await QRCode.toCanvas(qrCanvas.value, url, { width: 200, margin: 2 })
  }
}

function printQr() {
  const canvas = qrCanvas.value
  if (!canvas) return
  const dataUrl = canvas.toDataURL()
  const win = window.open('', '_blank')
  win.document.write(`
    <html><body style="text-align:center;font-family:sans-serif;padding:20px">
      <h3 style="margin-bottom:4px">${activeShipment.value?.ref_no || ''} — Box ${qrBox.value?.box_no}</h3>
      <p style="font-size:11px;color:#888;margin:0 0 12px">${qrUrl.value}</p>
      <img src="${dataUrl}" style="width:200px;height:200px" />
    </body></html>
  `)
  win.document.close()
  win.print()
}

// ── Manual match ──────────────────────────────────────────────────────────────
function openManualMatch(item) {
  manualMatchItem.value = item
  manualMatchQuery.value = item.raw_sku || item.raw_gtin || ''
  manualSearchResults.value = []
  onManualSearchInput()
}

function onManualSearchInput() {
  clearTimeout(manualDebounce)
  const q = manualMatchQuery.value.trim()
  if (q.length < 2) { manualSearchResults.value = []; return }
  manualDebounce = setTimeout(async () => {
    try {
      const res = await api.get(`/inbound/sku-search?q=${encodeURIComponent(q)}`)
      manualSearchResults.value = res.data.data
    } catch (_) {}
  }, 250)
}

async function applyManualMatch(variant) {
  try {
    await api.patch(`/inbound/items/${manualMatchItem.value.id}`, {
      shopify_variant_id: variant.shopify_variant_id,
      match_status: 'manual',
    })
    // Update locally
    for (const box of activeShipment.value.boxes) {
      const idx = box.items.findIndex(i => i.id === manualMatchItem.value.id)
      if (idx !== -1) {
        box.items[idx] = {
          ...box.items[idx],
          shopify_variant_id: variant.shopify_variant_id,
          variant_title: variant.variant_title,
          product_title: variant.product_title,
          match_status: 'manual',
        }
        break
      }
    }
    manualMatchItem.value = null
  } catch (e) {
    alert(e.response?.data?.error || e.message)
  }
}

// ── Scanner ───────────────────────────────────────────────────────────────────
function onScanned(token) {
  showScanner.value = false
  router.push({ name: 'ScanReceive', params: { token } })
}

// ── Purchase Orders ───────────────────────────────────────────────────────────
async function loadPurchaseOrders() {
  poLoading.value = true
  try {
    const res = await api.get('/inbound/purchase-orders')
    purchaseOrders.value = res.data.data
  } catch (e) {
    console.error('load POs:', e)
  } finally {
    poLoading.value = false
  }
}

async function handlePoImport(e) {
  const file = e.target.files[0]
  if (!file) return
  importingPo.value = true
  poImportResult.value = null
  try {
    const formData = new FormData()
    formData.append('file', file)
    const res = await api.post('/inbound/purchase-orders/import-excel', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    poImportResult.value = { po_number: res.data.data.po_number, summary: res.data.summary }
    await loadPurchaseOrders()
  } catch (e) {
    alert(e.response?.data?.error || e.message)
  } finally {
    importingPo.value = false
    e.target.value = ''
  }
}

async function createShipmentFromPo(po) {
  try {
    const res = await api.post(`/inbound/purchase-orders/${po.id}/create-shipment`)
    const shipmentId = res.data.data.id
    // Update local PO record
    const idx = purchaseOrders.value.findIndex(p => p.id === po.id)
    if (idx !== -1) purchaseOrders.value[idx].shipment_id = shipmentId
    // Switch to shipments tab and open the new shipment
    inboundTab.value = 'shipments'
    await openShipment(shipmentId)
  } catch (e) {
    alert(e.response?.data?.error || e.message)
  }
}

async function confirmDeletePo(po) {
  if (!confirm(`${t('inbound.confirmDelete')} ${po.po_number}?`)) return
  try {
    await api.delete(`/inbound/purchase-orders/${po.id}`)
    await loadPurchaseOrders()
  } catch (e) {
    alert(e.response?.data?.error || e.message)
  }
}

// Watch tab to lazy-load POs
watch(inboundTab, (tab) => {
  if (tab === 'po' && purchaseOrders.value.length === 0) loadPurchaseOrders()
})

// ── Style helpers ─────────────────────────────────────────────────────────────
function statusClass(status) {
  return {
    pending: 'bg-gray-100 text-gray-600',
    partial: 'bg-blue-100 text-blue-700',
    received: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-600',
  }[status] || 'bg-gray-100 text-gray-500'
}

function sourceClass(source) {
  return {
    manual: 'bg-gray-100 text-gray-600',
    form: 'bg-blue-100 text-blue-700',
    excel: 'bg-purple-100 text-purple-700',
  }[source] || 'bg-gray-100 text-gray-500'
}

function matchClass(status) {
  return {
    matched: 'bg-green-100 text-green-700',
    unmatched: 'bg-amber-100 text-amber-700',
    manual: 'bg-blue-100 text-blue-700',
    ignored: 'bg-gray-100 text-gray-400',
  }[status] || 'bg-gray-100 text-gray-500'
}

function fmtDate(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleDateString()
}

function poStatusClass(status) {
  return {
    open: 'bg-blue-100 text-blue-700',
    partial: 'bg-amber-100 text-amber-700',
    fulfilled: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-600',
  }[status] || 'bg-gray-100 text-gray-500'
}
</script>
