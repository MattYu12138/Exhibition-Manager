<template>
  <div class="p-4 max-w-5xl mx-auto">

    <!-- ── Inner tab bar ──────────────────────────────────────────────────────── -->
    <div class="flex items-center justify-between mb-5 flex-wrap gap-3">
      <div class="flex gap-1 bg-gray-100 rounded-lg p-1">
        <button
          @click="inboundTab = 'shipments'"
          :class="inboundTab === 'shipments' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'"
          class="px-4 py-1.5 rounded-md text-sm font-medium transition-all"
        >{{ t('inbound.tabShipments') }}</button>
        <button
          @click="inboundTab = 'pos'; loadPos()"
          :class="inboundTab === 'pos' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'"
          class="px-4 py-1.5 rounded-md text-sm font-medium transition-all"
        >{{ t('inbound.tabPurchaseOrders') }}</button>
      </div>
      <!-- Scan to Receive button -->
      <button
        @click="showScanner = true"
        class="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-2 rounded-lg shadow"
      >📷 {{ t('inbound.scanToReceive') }}</button>
    </div>

    <!-- ══════════════════════════════════════════════════════════════════════════
         SHIPMENTS TAB
    ══════════════════════════════════════════════════════════════════════════ -->
    <div v-if="inboundTab === 'shipments'">

      <!-- Shipment list -->
      <div v-if="!activeShipment">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-base font-bold text-gray-800">{{ t('inbound.shipments') }} <span class="text-gray-400 font-normal text-sm">({{ shipments.length }})</span></h2>
          <button @click="showCreateModal = true" class="bg-gray-700 hover:bg-gray-800 text-white text-sm px-4 py-2 rounded-lg">+ {{ t('inbound.newShipment') }}</button>
        </div>

        <div v-if="loading" class="text-center py-12 text-gray-400">{{ t('inbound.loading') }}</div>
        <div v-else-if="shipments.length === 0" class="text-center py-12 text-gray-400">{{ t('inbound.noShipments') }}</div>
        <div v-else class="space-y-2">
          <div
            v-for="s in shipments"
            :key="s.id"
            @click="openShipment(s)"
            class="bg-white rounded-xl shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow flex items-center gap-4"
          >
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-mono text-sm font-bold text-gray-700">{{ s.ref_no }}</span>
                <span class="text-xs px-2 py-0.5 rounded-full font-medium" :class="statusClass(s.status)">{{ t('inbound.status_' + s.status) }}</span>
                <span v-if="s.po_numbers" class="text-xs text-purple-600 bg-purple-50 border border-purple-100 rounded px-2 py-0.5">{{ s.po_numbers }}</span>
              </div>
              <div class="text-xs text-gray-400 mt-1">
                <span v-if="s.factory">{{ s.factory }} · </span>
                {{ s.total_boxes || 0 }} {{ t('inbound.boxes') }} · {{ s.total_qty || 0 }} {{ t('inbound.units') }} · {{ formatDate(s.created_at) }}
              </div>
            </div>
            <button
              v-if="s.status !== 'received'"
              @click.stop="deleteShipment(s)"
              class="shrink-0 text-xs text-red-400 hover:text-red-600 p-1.5 rounded hover:bg-red-50"
            >🗑</button>
            <svg class="w-4 h-4 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
          </div>
        </div>
      </div>

      <!-- Shipment detail -->
      <div v-else>
        <!-- Header -->
        <div class="flex items-center gap-3 mb-5 flex-wrap">
          <button @click="closeShipment" class="text-sm text-gray-400 hover:text-gray-600">← {{ t('inbound.back') }}</button>
          <span class="text-gray-300">|</span>
          <span class="font-mono text-sm font-bold text-gray-700">{{ activeShipment.ref_no }}</span>
          <span class="text-xs px-2 py-0.5 rounded-full font-medium" :class="statusClass(activeShipment.status)">{{ t('inbound.status_' + activeShipment.status) }}</span>
          <span v-if="activeShipment.factory" class="text-sm text-gray-500">— {{ activeShipment.factory }}</span>
          <div class="ml-auto flex items-center gap-2 flex-wrap">
            <span v-if="unmatchedCount > 0" class="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              ⚠ {{ unmatchedCount }} {{ t('inbound.unmatchedItems') }}
            </span>
            <button
              v-if="activeShipment.status !== 'received'"
              @click="generateFormLink"
              :disabled="generatingLink"
              class="text-xs border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-50"
            >🔗 {{ t('inbound.generateFormLink') }}</button>
            <button
              v-if="activeShipment.status !== 'received'"
              @click="addBox"
              :disabled="addingBox"
              class="text-xs bg-gray-700 hover:bg-gray-800 text-white rounded px-3 py-1.5"
            >+ {{ t('inbound.addBox') }}</button>
            <button
              v-if="activeShipment.status !== 'received'"
              @click="deleteShipment(activeShipment)"
              class="text-xs text-red-400 hover:text-red-600 border border-red-200 hover:border-red-400 rounded px-3 py-1.5"
            >🗑 {{ t('inbound.deleteShipment') }}</button>
          </div>
        </div>

        <!-- Form link display -->
        <div v-if="formLink" class="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm flex items-center gap-3 flex-wrap">
          <span class="text-blue-700 font-medium">{{ t('inbound.formLinkReady') }}</span>
          <code class="text-xs bg-white border rounded px-2 py-1 flex-1 min-w-0 truncate">{{ formLink }}</code>
          <button @click="copyFormLink" class="text-xs text-blue-600 hover:underline shrink-0">{{ t('inbound.copy') }}</button>
        </div>

        <!-- Linked POs section -->
        <div class="mb-4 bg-white rounded-xl shadow-sm overflow-hidden">
          <div class="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
            <span class="text-sm font-semibold text-gray-700">{{ t('inbound.linkedPOs') }} <span class="text-gray-400 font-normal">({{ activeShipment.pos?.length || 0 }})</span></span>
            <div class="flex items-center gap-2">
              <label class="cursor-pointer text-xs border border-purple-300 text-purple-600 rounded px-3 py-1.5 hover:bg-purple-50">
                {{ uploadingPo ? t('inbound.importing') : '+ ' + t('inbound.importPoExcel') }}
                <input type="file" accept=".xlsx,.xls" class="hidden" @change="handlePoUpload" :disabled="uploadingPo" />
              </label>
              <a :href="api.defaults.baseURL + '/inbound/purchase-orders/po-template'" target="_blank"
                class="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2 py-1.5">
                ↓ {{ t('inbound.downloadPoTemplate') }}
              </a>
            </div>
          </div>
          <div v-if="!activeShipment.pos || activeShipment.pos.length === 0" class="px-4 py-3 text-xs text-gray-400">
            {{ t('inbound.noPosLinked') }}
          </div>
          <div v-else class="divide-y divide-gray-50">
            <div v-for="po in activeShipment.pos" :key="po.id" class="px-4 py-2.5 flex items-center gap-3 text-xs">
              <span class="font-mono font-semibold text-gray-700">{{ po.po_number }}</span>
              <span v-if="po.source_file_name" class="text-gray-400 truncate max-w-xs">{{ po.source_file_name }}</span>
              <span class="ml-auto text-gray-500">{{ po.item_count }} SKUs · {{ po.total_ordered }} {{ t('inbound.ordered') }}</span>
              <span class="text-green-600">{{ po.total_received }} {{ t('inbound.received') }}</span>
            </div>
          </div>
          <div v-if="poImportResult" class="px-4 py-2 text-xs text-green-700 bg-green-50 border-t border-green-100">
            ✓ {{ poImportResult }}
          </div>
        </div>

        <!-- Overall packing progress bar (shown when POs are linked) -->
        <div v-if="activeShipment.pos?.length > 0 && overallProgress" class="mb-4 bg-white rounded-xl shadow-sm p-4">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-semibold text-gray-700">{{ t('inbound.packingProgress') }}</span>
            <span class="text-xs text-gray-500">
              {{ overallProgress.totalAllocated.toLocaleString() }} / {{ overallProgress.totalOrdered.toLocaleString() }} {{ t('inbound.units') }} ({{ overallProgress.pct }}%)
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

        <!-- Remaining qty panel (shown when POs are linked) -->
        <div v-if="activeShipment.pos?.length > 0 && remainingQty.length > 0" class="mb-4 bg-white rounded-xl shadow-sm overflow-hidden">
          <div class="flex items-center justify-between px-4 py-3 bg-amber-50 border-b border-amber-100 cursor-pointer" @click="showRemainingPanel = !showRemainingPanel">
            <span class="text-sm font-semibold text-amber-800">📦 {{ t('inbound.remainingToPackTitle') }}</span>
            <div class="flex items-center gap-3">
              <span class="text-xs text-amber-600">
                {{ remainingQty.filter(r => r.remaining_qty > 0).length }} {{ t('inbound.skusRemaining') }}
                · {{ remainingQty.reduce((s, r) => s + r.remaining_qty, 0) }} {{ t('inbound.unitsRemaining') }}
              </span>
              <span class="text-amber-400 text-xs">{{ showRemainingPanel ? '▲' : '▼' }}</span>
            </div>
          </div>
          <div v-if="showRemainingPanel" class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead class="text-gray-400 uppercase bg-gray-50">
                <tr>
                  <th class="px-4 py-2 text-left">{{ t('inbound.sku') }}</th>
                  <th class="px-4 py-2 text-left">{{ t('inbound.product') }}</th>
                  <th class="px-4 py-2 text-center">{{ t('inbound.poOrdered') }}</th>
                  <th class="px-4 py-2 text-center">{{ t('inbound.allocated') }}</th>
                  <th class="px-4 py-2 text-center font-bold text-amber-700">{{ t('inbound.remaining') }}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-50">
                <tr v-for="r in remainingQty" :key="r.raw_sku" :class="r.remaining_qty === 0 ? 'opacity-40' : ''">
                  <td class="px-4 py-2 font-mono text-gray-700">{{ r.raw_sku }}</td>
                  <td class="px-4 py-2 text-gray-500">{{ r.product_title || r.raw_product_name }}<span v-if="r.variant_title" class="text-gray-400"> / {{ r.variant_title }}</span></td>
                  <td class="px-4 py-2 text-center text-gray-600">{{ r.ordered_qty }}</td>
                  <td class="px-4 py-2 text-center text-blue-600">{{ r.allocated_qty }}</td>
                  <td class="px-4 py-2 text-center font-bold" :class="r.remaining_qty > 0 ? 'text-amber-700' : 'text-green-600'">
                    {{ r.remaining_qty > 0 ? r.remaining_qty : '✓' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Boxes -->
        <div v-if="!activeShipment.boxes || activeShipment.boxes.length === 0" class="text-center py-12 text-gray-400">{{ t('inbound.noBoxes') }}</div>
        <div v-else class="space-y-4">
          <div v-for="box in activeShipment.boxes" :key="box.id" class="bg-white rounded-xl shadow-sm overflow-hidden">
            <!-- Box header -->
            <div class="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
              <div class="flex items-center gap-3">
                <span class="font-semibold text-gray-700">{{ t('inbound.box') }} {{ box.box_no }}</span>
                <span class="text-xs px-2 py-0.5 rounded-full" :class="box.status === 'received' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'">
                  {{ box.status === 'received' ? t('inbound.received') : t('inbound.pending') }}
                </span>
                <span class="text-xs text-gray-400">{{ box.items?.length || 0 }} {{ t('inbound.skus') }} · {{ boxTotal(box) }} {{ t('inbound.units') }}</span>
              </div>
              <div class="flex items-center gap-2">
                <button @click="showQr(box)" class="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2 py-1">QR</button>
                <button v-if="box.status !== 'received' && activeShipment.status !== 'received'" @click="deleteBox(box)" class="text-xs text-red-400 hover:text-red-600">{{ t('inbound.delete') }}</button>
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
                <tr v-for="item in box.items" :key="item.id" :class="item.match_status === 'unmatched' ? 'bg-amber-50' : ''">
                  <td class="px-4 py-2 font-mono text-gray-700">{{ item.raw_sku || item.raw_gtin || '—' }}</td>
                  <td class="px-4 py-2 text-gray-600">
                    <span v-if="item.match_status !== 'unmatched'">{{ item.product_title }}<span v-if="item.variant_title" class="text-gray-400"> / {{ item.variant_title }}</span></span>
                    <span v-else class="text-amber-600">{{ t('inbound.noMatch') }}</span>
                  </td>
                  <td class="px-4 py-2 text-center">
                    <span class="px-1.5 py-0.5 rounded text-xs" :class="matchClass(item.match_status)">{{ t('inbound.match_' + item.match_status) }}</span>
                  </td>
                  <td class="px-4 py-2 text-center font-medium text-gray-700">{{ item.quantity }}</td>
                  <td class="px-4 py-2 text-right flex items-center justify-end gap-2">
                    <button v-if="item.match_status === 'unmatched' && box.status !== 'received'" @click="openManualMatch(item)" class="text-xs text-blue-500 hover:underline">{{ t('inbound.manualMatch') }}</button>
                    <button v-if="box.status !== 'received' && activeShipment.status !== 'received'" @click="deleteItem(item, box)" class="text-xs text-red-400 hover:text-red-600">✕</button>
                  </td>
                </tr>
              </tbody>
            </table>

            <!-- Add item row — SKU + Size split input -->
            <div v-if="box.status !== 'received' && activeShipment.status !== 'received'" class="px-4 py-3 border-t border-gray-100">
              <div v-if="addingItemBoxId !== box.id">
                <button @click="startAddItem(box.id)" class="text-xs text-purple-600 hover:underline">+ {{ t('inbound.addItem') }}</button>
              </div>
              <div v-else class="space-y-2">
                <div class="flex items-start gap-2 flex-wrap">
                  <!-- Base SKU input with suggestions -->
                  <div class="relative flex-1 min-w-32">
                    <label class="text-xs text-gray-400 mb-1 block">{{ t('inbound.styleNo') }}</label>
                    <input
                      v-model="newItem.base_sku"
                      @input="onBaseSkuInput"
                      :placeholder="t('inbound.styleNoPlaceholder')"
                      class="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-400"
                    />
                    <div v-if="baseSkuSuggestions.length > 0" class="absolute z-20 left-0 right-0 bg-white border border-gray-200 rounded shadow-lg max-h-40 overflow-y-auto">
                      <div
                        v-for="s in baseSkuSuggestions"
                        :key="s"
                        @click="selectBaseSku(s)"
                        class="px-3 py-1.5 hover:bg-purple-50 cursor-pointer font-mono text-xs text-gray-700"
                      >{{ s }}</div>
                    </div>
                  </div>

                  <!-- Size dropdown -->
                  <div class="w-36">
                    <label class="text-xs text-gray-400 mb-1 block">{{ t('inbound.size') }}</label>
                    <select
                      v-model="newItem.size_code"
                      @change="onSizeChange"
                      class="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-400 bg-white"
                    >
                      <option value="">{{ t('inbound.selectSize') }}</option>
                      <option v-for="sz in availableSizeOptions" :key="sz.code" :value="sz.code">{{ sz.label }}</option>
                    </select>
                  </div>

                  <!-- Matched product preview -->
                  <div class="flex-1 min-w-32">
                    <label class="text-xs text-gray-400 mb-1 block">{{ t('inbound.matchedProduct') }}</label>
                    <div class="border border-gray-200 rounded px-2 py-1.5 text-xs min-h-[28px]" :class="newItem.match_status === 'matched' ? 'bg-green-50 text-green-700' : newItem.match_status === 'unmatched' ? 'bg-amber-50 text-amber-600' : 'bg-gray-50 text-gray-400'">
                      <span v-if="newItem.match_status === 'matched'">✓ {{ newItem.product_title }}<span v-if="newItem.variant_title"> / {{ newItem.variant_title }}</span></span>
                      <span v-else-if="newItem.match_status === 'unmatched'">⚠ {{ t('inbound.noMatch') }}</span>
                      <span v-else>—</span>
                    </div>
                  </div>

                  <!-- Quantity with remaining hint -->
                  <div class="w-28">
                    <label class="text-xs text-gray-400 mb-1 block">
                      {{ t('inbound.qty') }}
                      <span v-if="getRemainingForSku(newItem.base_sku, newItem.size_code) !== null" class="text-amber-600 ml-1">
                        ({{ t('inbound.remaining') }}: {{ getRemainingForSku(newItem.base_sku, newItem.size_code) }})
                      </span>
                    </label>
                    <input
                      v-model.number="newItem.quantity"
                      type="number"
                      min="1"
                      :max="getRemainingForSku(newItem.base_sku, newItem.size_code) || undefined"
                      :placeholder="t('inbound.qtyPlaceholder')"
                      class="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-400"
                      :class="isOverAllocated(newItem.base_sku, newItem.size_code, newItem.quantity) ? 'border-red-400 bg-red-50' : ''"
                    />
                    <p v-if="isOverAllocated(newItem.base_sku, newItem.size_code, newItem.quantity)" class="text-xs text-red-500 mt-0.5">{{ t('inbound.overAllocated') }}</p>
                  </div>
                </div>

                <div class="flex items-center gap-2">
                  <button
                    @click="submitAddItem(box.id)"
                    :disabled="!newItem.base_sku || !newItem.quantity || newItem.quantity <= 0"
                    class="text-xs bg-purple-600 text-white rounded px-3 py-1.5 disabled:opacity-50"
                  >{{ t('inbound.add') }}</button>
                  <button @click="cancelAddItem" class="text-xs text-gray-400 hover:text-gray-600">{{ t('inbound.cancel') }}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════════════════════════
         PURCHASE ORDERS TAB
    ══════════════════════════════════════════════════════════════════════════ -->
    <div v-if="inboundTab === 'pos'">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-base font-bold text-gray-800">{{ t('inbound.tabPurchaseOrders') }} <span class="text-gray-400 font-normal text-sm">({{ pos.length }})</span></h2>
        <div class="flex items-center gap-2">
          <a :href="api.defaults.baseURL + '/inbound/purchase-orders/po-template'" target="_blank"
            class="text-xs border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-50 text-gray-600">
            ↓ {{ t('inbound.downloadPoTemplate') }}
          </a>
          <label class="cursor-pointer text-xs bg-purple-600 hover:bg-purple-700 text-white rounded px-3 py-1.5">
            {{ uploadingPo ? t('inbound.importing') : '↑ ' + t('inbound.importPoExcel') }}
            <input type="file" accept=".xlsx,.xls" class="hidden" @change="handlePoUploadStandalone" :disabled="uploadingPo" />
          </label>
        </div>
      </div>

      <div v-if="poImportResult" class="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center justify-between">
        <span>✓ {{ poImportResult }}</span>
        <button @click="poImportResult = ''" class="text-green-400 hover:text-green-600">✕</button>
      </div>

      <div v-if="posLoading" class="text-center py-12 text-gray-400">{{ t('inbound.loading') }}</div>
      <div v-else-if="pos.length === 0" class="text-center py-12 text-gray-400">{{ t('inbound.noPurchaseOrders') }}</div>
      <div v-else class="bg-white rounded-xl shadow-sm overflow-hidden">
        <table class="w-full text-sm">
          <thead class="text-xs text-gray-400 uppercase bg-gray-50 border-b border-gray-100">
            <tr>
              <th class="px-4 py-3 text-left">{{ t('inbound.poNumber') }}</th>
              <th class="px-4 py-3 text-left">{{ t('inbound.factory') }}</th>
              <th class="px-4 py-3 text-center">{{ t('inbound.poItems') }}</th>
              <th class="px-4 py-3 text-center">{{ t('inbound.poOrdered') }}</th>
              <th class="px-4 py-3 text-center">{{ t('inbound.poReceived') }}</th>
              <th class="px-4 py-3 text-center">{{ t('inbound.status') }}</th>
              <th class="px-4 py-3 text-left">{{ t('inbound.created') }}</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            <tr v-for="po in pos" :key="po.id">
              <td class="px-4 py-3 font-mono font-semibold text-gray-700">{{ po.po_number }}</td>
              <td class="px-4 py-3 text-gray-500">{{ po.factory || '—' }}</td>
              <td class="px-4 py-3 text-center text-gray-600">{{ po.item_count }}</td>
              <td class="px-4 py-3 text-center text-gray-600">{{ po.total_ordered }}</td>
              <td class="px-4 py-3 text-center text-green-600">{{ po.total_received }}</td>
              <td class="px-4 py-3 text-center">
                <span class="px-2 py-0.5 rounded-full text-xs font-medium" :class="poStatusClass(po.status)">{{ t('inbound.poStatus_' + po.status) }}</span>
              </td>
              <td class="px-4 py-3 text-gray-400 text-xs">{{ formatDate(po.created_at) }}</td>
              <td class="px-4 py-3 text-right">
                <div class="flex items-center gap-2 justify-end">
                  <button v-if="!po.shipment_id" @click="createShipmentFromPo(po)" class="text-xs text-purple-600 hover:underline">{{ t('inbound.createShipment') }}</button>
                  <button v-else @click="goToShipment(po.shipment_id)" class="text-xs text-blue-600 hover:underline">{{ t('inbound.viewShipment') }}</button>
                  <button @click="deletePo(po)" class="text-xs text-red-400 hover:text-red-600">{{ t('inbound.delete') }}</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ── Create Shipment Modal ───────────────────────────────────────────────── -->
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

    <!-- ── QR Code Modal ───────────────────────────────────────────────────────── -->
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

    <!-- ── Manual Match Modal ─────────────────────────────────────────────────── -->
    <div v-if="manualMatchItem" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
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
          <div v-for="r in manualSearchResults" :key="r.shopify_variant_id" @click="applyManualMatch(r)" class="px-3 py-2 hover:bg-purple-50 cursor-pointer">
            <div class="font-mono text-xs text-gray-700">{{ r.sku }}</div>
            <div class="text-xs text-gray-500">{{ r.product_title }} <span v-if="r.variant_title">/ {{ r.variant_title }}</span></div>
          </div>
        </div>
        <div class="flex justify-end mt-4">
          <button @click="manualMatchItem = null" class="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">{{ t('inbound.cancel') }}</button>
        </div>
      </div>
    </div>

    <!-- ── QR Scanner Modal ─────────────────────────────────────────────────────── -->
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

// ── Size options ──────────────────────────────────────────────────────────────
const sizeOptions = [
  { code: '0000', label: '0000 (0-3 weeks)' },
  { code: '000',  label: '000 (0-3 months)' },
  { code: '00',   label: '00 (3-6 months)' },
  { code: '0',    label: '0 (6-12 months)' },
  { code: '1',    label: '1 (12-18 months)' },
  { code: 'XXS',  label: 'XXS' },
  { code: 'XS',   label: 'XS' },
  { code: 'S',    label: 'S' },
  { code: 'M',    label: 'M' },
  { code: 'L',    label: 'L' },
  { code: 'XL',   label: 'XL' },
  { code: 'OS',   label: 'OS (One Size)' },
]

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

const addingItemBoxId = ref(null)
const newItem = ref({ base_sku: '', size_code: '', quantity: null, match_status: '', product_title: '', variant_title: '' })
const baseSkuSuggestions = ref([])
let skuDebounce = null

const qrBox = ref(null)
const qrCanvas = ref(null)
const qrUrl = computed(() => {
  if (!qrBox.value) return ''
  return `${window.location.origin}/scan/${qrBox.value.qr_token}`
})

const manualMatchItem = ref(null)
const manualMatchQuery = ref('')
const manualSearchResults = ref([])
let manualDebounce = null

// ── Inner tab + scanner ───────────────────────────────────────────────────────
const inboundTab = ref('shipments')
const showScanner = ref(false)

// ── Purchase Orders ───────────────────────────────────────────────────────────
const pos = ref([])
const posLoading = ref(false)
const uploadingPo = ref(false)
const poImportResult = ref('')

// ── Remaining qty ─────────────────────────────────────────────────────────────
const remainingQty = ref([])
const showRemainingPanel = ref(true)

// ── Computed ──────────────────────────────────────────────────────────────────
const unmatchedCount = computed(() => {
  if (!activeShipment.value?.boxes) return 0
  return activeShipment.value.boxes.reduce((n, b) => n + (b.items?.filter(i => i.match_status === 'unmatched').length || 0), 0)
})

// ── Available size options (filtered by remaining qty) ───────────────────────
const availableSizeOptions = computed(() => {
  if (!newItem.value.base_sku || remainingQty.value.length === 0) return sizeOptions
  return sizeOptions.filter(sz => {
    const fullSku = `${newItem.value.base_sku}-${sz.code}`
    const row = remainingQty.value.find(r => r.raw_sku === fullSku)
    // If no PO row for this size, include it (might be untracked); if row exists, only include if remaining > 0
    return !row || row.remaining_qty > 0
  })
})

// ── Overall packing progress ──────────────────────────────────────────────────
const overallProgress = computed(() => {
  if (remainingQty.value.length === 0) return null
  const totalOrdered = remainingQty.value.reduce((s, r) => s + (r.ordered_qty || 0), 0)
  const totalAllocated = remainingQty.value.reduce((s, r) => s + (r.allocated_qty || 0), 0)
  if (totalOrdered === 0) return null
  return { totalOrdered, totalAllocated, pct: Math.round((totalAllocated / totalOrdered) * 100) }
})

// ── Helpers ───────────────────────────────────────────────────────────────────
function statusClass(s) {
  return s === 'received' ? 'bg-green-100 text-green-700'
    : s === 'partial' ? 'bg-blue-100 text-blue-700'
    : 'bg-gray-100 text-gray-500'
}
function matchClass(s) {
  return s === 'matched' ? 'bg-green-100 text-green-700'
    : s === 'manual' ? 'bg-blue-100 text-blue-700'
    : s === 'ignored' ? 'bg-gray-100 text-gray-400'
    : 'bg-amber-100 text-amber-700'
}
function poStatusClass(s) {
  return s === 'fulfilled' ? 'bg-green-100 text-green-700'
    : s === 'partial' ? 'bg-blue-100 text-blue-700'
    : s === 'cancelled' ? 'bg-gray-100 text-gray-400'
    : 'bg-amber-100 text-amber-700'
}
function formatDate(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleDateString()
}
function boxTotal(box) {
  return (box.items || []).reduce((s, i) => s + (i.quantity || 0), 0)
}

// ── Remaining qty helpers ─────────────────────────────────────────────────────
function getRemainingForSku(baseSku, sizeCode) {
  if (!baseSku || remainingQty.value.length === 0) return null
  const fullSku = sizeCode ? `${baseSku}-${sizeCode}` : baseSku
  const row = remainingQty.value.find(r => r.raw_sku === fullSku)
  return row ? row.remaining_qty : null
}
function isOverAllocated(baseSku, sizeCode, qty) {
  const rem = getRemainingForSku(baseSku, sizeCode)
  return rem !== null && qty > rem
}

async function loadRemainingQty() {
  if (!activeShipment.value?.pos?.length) { remainingQty.value = []; return }
  try {
    const { data } = await api.get(`/inbound/shipments/${activeShipment.value.id}/remaining-qty`)
    remainingQty.value = data.data || []
  } catch { remainingQty.value = [] }
}

// ── Load shipments ────────────────────────────────────────────────────────────
async function loadShipments() {
  loading.value = true
  try {
    const { data } = await api.get('/inbound/shipments')
    shipments.value = data.data || []
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

async function openShipment(s) {
  try {
    const { data } = await api.get(`/inbound/shipments/${s.id}`)
    activeShipment.value = data.data
    formLink.value = ''
    addingItemBoxId.value = null
    await loadRemainingQty()
  } catch (e) { console.error(e) }
}

function closeShipment() {
  activeShipment.value = null
  remainingQty.value = []
  loadShipments()
}

async function deleteShipment(s) {
  if (!confirm(t('inbound.confirmDeleteShipment'))) return
  try {
    await api.delete(`/inbound/shipments/${s.id}`)
    if (activeShipment.value?.id === s.id) {
      activeShipment.value = null
      remainingQty.value = []
    }
    await loadShipments()
  } catch (e) {
    alert(e.response?.data?.error || 'Delete failed')
  }
}

// ── Create shipment ───────────────────────────────────────────────────────────
async function createShipment() {
  creating.value = true
  try {
    const { data } = await api.post('/inbound/shipments', createForm.value)
    showCreateModal.value = false
    createForm.value = { factory: '', note: '' }
    await openShipment(data.data)
  } catch (e) { console.error(e) } finally { creating.value = false }
}

// ── Add box ───────────────────────────────────────────────────────────────────
async function addBox() {
  addingBox.value = true
  try {
    const { data } = await api.post(`/inbound/shipments/${activeShipment.value.id}/boxes`, {})
    activeShipment.value.boxes = [...(activeShipment.value.boxes || []), data.data]
  } catch (e) { console.error(e) } finally { addingBox.value = false }
}

async function deleteBox(box) {
  if (!confirm(t('inbound.confirmDeleteBox'))) return
  try {
    await api.delete(`/inbound/boxes/${box.id}`)
    activeShipment.value.boxes = activeShipment.value.boxes.filter(b => b.id !== box.id)
    await loadRemainingQty()
  } catch (e) { console.error(e) }
}

// ── Add item (SKU+size split) ─────────────────────────────────────────────────
function startAddItem(boxId) {
  addingItemBoxId.value = boxId
  newItem.value = { base_sku: '', size_code: '', quantity: null, match_status: '', product_title: '', variant_title: '' }
  baseSkuSuggestions.value = []
}

function cancelAddItem() {
  addingItemBoxId.value = null
  baseSkuSuggestions.value = []
}

function onBaseSkuInput() {
  clearTimeout(skuDebounce)
  newItem.value.match_status = ''
  newItem.value.product_title = ''
  newItem.value.variant_title = ''
  if (!newItem.value.base_sku || newItem.value.base_sku.length < 2) {
    baseSkuSuggestions.value = []
    return
  }
  skuDebounce = setTimeout(async () => {
    try {
      const { data } = await api.get('/inbound/sku-search', { params: { q: newItem.value.base_sku } })
      // Extract unique base SKUs (part before the dash)
      const uniqueBases = [...new Set((data.data || []).map(r => {
        const parts = r.sku.split('-')
        return parts.length > 1 ? parts.slice(0, -1).join('-') : r.sku
      }))]
      baseSkuSuggestions.value = uniqueBases.slice(0, 10)
    } catch { baseSkuSuggestions.value = [] }
  }, 250)
}

function selectBaseSku(base) {
  newItem.value.base_sku = base
  baseSkuSuggestions.value = []
  if (newItem.value.size_code) onSizeChange()
}

async function onSizeChange() {
  if (!newItem.value.base_sku || !newItem.value.size_code) {
    newItem.value.match_status = ''
    newItem.value.product_title = ''
    newItem.value.variant_title = ''
    return
  }
  try {
    const { data } = await api.get('/inbound/sku-search', {
      params: { q: newItem.value.base_sku, size: newItem.value.size_code }
    })
    const match = data.data?.[0]
    if (match) {
      newItem.value.match_status = 'matched'
      newItem.value.product_title = match.product_title
      newItem.value.variant_title = match.variant_title
    } else {
      newItem.value.match_status = 'unmatched'
      newItem.value.product_title = ''
      newItem.value.variant_title = ''
    }
  } catch { newItem.value.match_status = '' }
}

async function submitAddItem(boxId) {
  if (!newItem.value.base_sku || !newItem.value.quantity || newItem.value.quantity <= 0) return
  try {
    const { data } = await api.post(`/inbound/boxes/${boxId}/items`, {
      base_sku: newItem.value.base_sku,
      size_code: newItem.value.size_code || '',
      quantity: newItem.value.quantity,
    })
    const box = activeShipment.value.boxes.find(b => b.id === boxId)
    if (box) box.items = [...(box.items || []), data.data]
    cancelAddItem()
    await loadRemainingQty()
  } catch (e) { console.error(e) }
}

async function deleteItem(item, box) {
  try {
    await api.delete(`/inbound/items/${item.id}`)
    box.items = box.items.filter(i => i.id !== item.id)
    await loadRemainingQty()
  } catch (e) { console.error(e) }
}

// ── Form link ─────────────────────────────────────────────────────────────────
async function generateFormLink() {
  generatingLink.value = true
  try {
    const { data } = await api.post(`/inbound/shipments/${activeShipment.value.id}/form-token`)
    const token = data.data.form_token
    formLink.value = `${window.location.origin}/factory/submit?token=${token}`
  } catch (e) { console.error(e) } finally { generatingLink.value = false }
}

function copyFormLink() {
  navigator.clipboard.writeText(formLink.value)
}

// ── PO import (within shipment detail) ───────────────────────────────────────
async function handlePoUpload(e) {
  const file = e.target.files?.[0]
  if (!file) return
  uploadingPo.value = true
  poImportResult.value = ''
  try {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('shipment_id', activeShipment.value.id)
    const { data } = await api.post('/inbound/purchase-orders/import-excel', fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    poImportResult.value = `${data.data.po_number} — ${data.summary.matched} matched, ${data.summary.unmatched} unmatched`
    // Reload shipment to get updated POs
    const { data: sd } = await api.get(`/inbound/shipments/${activeShipment.value.id}`)
    activeShipment.value = sd.data
    await loadRemainingQty()
  } catch (e) {
    poImportResult.value = e.response?.data?.error || 'Import failed'
  } finally {
    uploadingPo.value = false
    e.target.value = ''
  }
}

// ── PO import (standalone in PO tab) ─────────────────────────────────────────
async function loadPos() {
  posLoading.value = true
  try {
    const { data } = await api.get('/inbound/purchase-orders')
    pos.value = data.data || []
  } catch (e) { console.error(e) } finally { posLoading.value = false }
}

async function handlePoUploadStandalone(e) {
  const file = e.target.files?.[0]
  if (!file) return
  uploadingPo.value = true
  poImportResult.value = ''
  try {
    const fd = new FormData()
    fd.append('file', file)
    const { data } = await api.post('/inbound/purchase-orders/import-excel', fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    poImportResult.value = `${data.data.po_number} — ${data.summary.matched} matched, ${data.summary.unmatched} unmatched`
    await loadPos()
  } catch (e) {
    poImportResult.value = e.response?.data?.error || 'Import failed'
  } finally {
    uploadingPo.value = false
    e.target.value = ''
  }
}

async function createShipmentFromPo(po) {
  try {
    const { data } = await api.post(`/inbound/purchase-orders/${po.id}/create-shipment`)
    inboundTab.value = 'shipments'
    await loadShipments()
    await openShipment(data.data)
  } catch (e) { console.error(e) }
}

function goToShipment(shipmentId) {
  inboundTab.value = 'shipments'
  const s = shipments.value.find(x => x.id === shipmentId)
  if (s) openShipment(s)
  else loadShipments().then(() => {
    const found = shipments.value.find(x => x.id === shipmentId)
    if (found) openShipment(found)
  })
}

async function deletePo(po) {
  if (!confirm(`Delete ${po.po_number}?`)) return
  try {
    await api.delete(`/inbound/purchase-orders/${po.id}`)
    pos.value = pos.value.filter(p => p.id !== po.id)
  } catch (e) { alert(e.response?.data?.error || 'Delete failed') }
}

// ── QR code ───────────────────────────────────────────────────────────────────
async function showQr(box) {
  qrBox.value = box
  await nextTick()
  if (qrCanvas.value) {
    QRCode.toCanvas(qrCanvas.value, `${window.location.origin}/scan/${box.qr_token}`, { width: 200 })
  }
}

function printQr() {
  const url = qrUrl.value
  const w = window.open('', '_blank')
  w.document.write(`<html><body style="text-align:center;padding:20px">
    <h3 style="font-family:monospace">${activeShipment.value?.ref_no} — Box ${qrBox.value?.box_no}</h3>
    <img src="${qrCanvas.value?.toDataURL()}" style="width:200px;height:200px" />
    <p style="font-size:10px;word-break:break-all">${url}</p>
    <script>window.onload=()=>window.print()<\/script>
  </body></html>`)
  w.document.close()
}

// ── Manual match ──────────────────────────────────────────────────────────────
function openManualMatch(item) {
  manualMatchItem.value = item
  manualMatchQuery.value = ''
  manualSearchResults.value = []
}

function onManualSearchInput() {
  clearTimeout(manualDebounce)
  if (!manualMatchQuery.value || manualMatchQuery.value.length < 2) { manualSearchResults.value = []; return }
  manualDebounce = setTimeout(async () => {
    try {
      const { data } = await api.get('/inbound/sku-search', { params: { q: manualMatchQuery.value } })
      manualSearchResults.value = data.data || []
    } catch { manualSearchResults.value = [] }
  }, 250)
}

async function applyManualMatch(variant) {
  try {
    const { data } = await api.patch(`/inbound/items/${manualMatchItem.value.id}`, {
      shopify_variant_id: variant.shopify_variant_id
    })
    // Update item in place
    for (const box of activeShipment.value.boxes) {
      const idx = box.items?.findIndex(i => i.id === manualMatchItem.value.id)
      if (idx >= 0) { box.items[idx] = data.data; break }
    }
    manualMatchItem.value = null
  } catch (e) { console.error(e) }
}

// ── QR scanner callback ───────────────────────────────────────────────────────
function onScanned(token) {
  showScanner.value = false
  router.push({ name: 'ScanReceive', params: { token } })
}

// ── Init ──────────────────────────────────────────────────────────────────────
onMounted(() => {
  loadShipments()
})
</script>
