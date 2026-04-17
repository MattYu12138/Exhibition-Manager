<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <header class="bg-white shadow-sm sticky top-0 z-10">
      <div class="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <a href="#" class="text-sm text-gray-400 hover:text-gray-600" @click.prevent="backToPlatform">{{ t('inventory.backToPlatform') }}</a>
          <span class="text-gray-300">|</span>
          <span class="text-xl">📦</span>
          <div>
            <h1 class="text-lg font-bold text-gray-800">{{ t('inventory.title') }}</h1>
            <p class="text-xs text-gray-500">{{ t('inventory.subtitle') }}</p>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <button @click="toggleLang" class="text-xs text-gray-400 hover:text-gray-600 border rounded px-2 py-1">
            {{ locale === 'zh' ? 'EN' : '中文' }}
          </button>
          <!-- Pending changes badge + commit button -->
          <button
            v-if="pendingCount > 0"
            @click="openCommitModal"
            class="relative bg-amber-500 hover:bg-amber-600 text-white text-sm px-4 py-2 rounded-lg flex items-center gap-2"
          >
            <span class="inline-flex items-center justify-center bg-white text-amber-600 text-xs font-bold rounded-full w-5 h-5">{{ pendingCount }}</span>
            {{ t('inventory.commitChanges') }}
          </button>

          <!-- Sync dropdown -->
          <div class="relative" ref="syncDropdownRef">
            <button
              @click="toggleSyncDropdown"
              :disabled="syncing || syncingSquare"
              class="bg-purple-600 hover:bg-purple-700 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50 flex items-center gap-2"
            >
              <span v-if="syncing || syncingSquare" class="animate-spin">⟳</span>
              {{ (syncing || syncingSquare) ? t('inventory.syncing') : t('inventory.syncNow') }}
              <span class="ml-1">▾</span>
            </button>
            <div v-if="showSyncDropdown" class="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
              <button
                @click="syncShopify"
                class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-t-lg flex items-center gap-2"
              >
                <img :src="shopifyLogoUrl" class="w-4 h-4 object-contain" /> {{ t('inventory.syncShopify') }}
              </button>
              <button
                @click="syncSquare"
                class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-b-lg flex items-center gap-2"
              >
                <img :src="squareLogoUrl" class="w-4 h-4 object-contain" /> {{ t('inventory.syncSquare') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>

    <main class="max-w-7xl mx-auto px-4 py-6">
      <!-- Last Sync Info -->
      <div class="text-xs text-gray-400 mb-4 flex items-center gap-4">
        <span>
          <img :src="shopifyLogoUrl" class="w-3.5 h-3.5 object-contain inline" /> Shopify {{ t('inventory.lastSync') }}: {{ lastSync ? new Date(lastSync.synced_at).toLocaleString() : t('inventory.never') }}
        </span>
        <span v-if="squareLastSync">
          <img :src="squareLogoUrl" class="w-3.5 h-3.5 object-contain inline" /> Square {{ t('inventory.lastSync') }}: {{ new Date(squareLastSync.synced_at).toLocaleString() }}
          <span class="text-gray-300 ml-1">({{ squareLastSync.variation_count }} variations)</span>
        </span>
        <span v-else class="text-gray-300 flex items-center gap-1"><img :src="squareLogoUrl" class="w-3.5 h-3.5 object-contain" /> Square: {{ t('inventory.never') }}</span>
      </div>

      <!-- Summary Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-white rounded-xl p-4 shadow-sm text-center">
          <div class="text-2xl font-bold text-gray-800">{{ activeSummary.total }}</div>
          <div class="text-xs text-gray-500 mt-1">{{ t('inventory.totalProducts') }}</div>
          <div class="text-xs mt-1" :class="activeSource === 'shopify' ? 'text-purple-400' : 'text-gray-400'">
            <span class="flex items-center justify-center gap-1"><img :src="activeSource === 'shopify' ? shopifyLogoUrl : squareLogoUrl" class="w-3.5 h-3.5 object-contain" />{{ activeSource === 'shopify' ? 'Shopify' : 'Square' }}</span>
          </div>
        </div>
        <div class="bg-white rounded-xl p-4 shadow-sm text-center border-l-4" :class="activeSummary.withDuplicates > 0 ? 'border-orange-400' : 'border-green-400'">
          <div class="text-2xl font-bold" :class="activeSummary.withDuplicates > 0 ? 'text-orange-600' : 'text-green-600'">{{ activeSummary.withDuplicates }}</div>
          <div class="text-xs text-gray-500 mt-1">{{ t('inventory.withDuplicates') }}</div>
          <div class="text-xs mt-1" :class="activeSource === 'shopify' ? 'text-purple-400' : 'text-gray-400'">
            <span class="flex items-center justify-center gap-1"><img :src="activeSource === 'shopify' ? shopifyLogoUrl : squareLogoUrl" class="w-3.5 h-3.5 object-contain" />{{ activeSource === 'shopify' ? 'Shopify' : 'Square' }}</span>
          </div>
        </div>
        <div class="bg-white rounded-xl p-4 shadow-sm text-center border-l-4" :class="activeSummary.duplicateSKUs > 0 ? 'border-red-400' : 'border-green-400'">
          <div class="text-2xl font-bold" :class="activeSummary.duplicateSKUs > 0 ? 'text-red-600' : 'text-green-600'">{{ activeSummary.duplicateSKUs }}</div>
          <div class="text-xs text-gray-500 mt-1">{{ t('inventory.duplicateSKUs') }}</div>
          <div class="text-xs mt-1" :class="activeSource === 'shopify' ? 'text-purple-400' : 'text-gray-400'">
            <span class="flex items-center justify-center gap-1"><img :src="activeSource === 'shopify' ? shopifyLogoUrl : squareLogoUrl" class="w-3.5 h-3.5 object-contain" />{{ activeSource === 'shopify' ? 'Shopify' : 'Square' }}</span>
          </div>
        </div>
        <div class="bg-white rounded-xl p-4 shadow-sm text-center border-l-4" :class="activeSummary.duplicateBarcodes > 0 ? 'border-red-400' : 'border-green-400'">
          <div class="text-2xl font-bold" :class="activeSummary.duplicateBarcodes > 0 ? 'text-red-600' : 'text-green-600'">{{ activeSummary.duplicateBarcodes }}</div>
          <div class="text-xs text-gray-500 mt-1">{{ t('inventory.duplicateBarcodes') }}</div>
          <div class="text-xs mt-1" :class="activeSource === 'shopify' ? 'text-purple-400' : 'text-gray-400'">
            <span class="flex items-center justify-center gap-1"><img :src="activeSource === 'shopify' ? shopifyLogoUrl : squareLogoUrl" class="w-3.5 h-3.5 object-contain" />{{ activeSource === 'shopify' ? 'Shopify' : 'Square' }}</span>
          </div>
        </div>
      </div>

      <!-- Square Sync Loading -->
      <div v-if="syncingSquare" class="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 flex items-center gap-3">
        <span class="animate-spin text-blue-500 text-xl">⟳</span>
        <span class="text-blue-700 text-sm">{{ t('inventory.syncingSquare') }}</span>
      </div>

      <!-- Square Issues Panel (staged diffs from cross-match views) -->
      <div v-if="squareDiffs.length > 0 || squareUnmatched.length > 0" class="mb-6">
        <!-- Square Diffs -->
        <div v-if="squareDiffs.length > 0" class="bg-white rounded-xl shadow-sm overflow-hidden mb-3">
          <div class="px-4 py-3 bg-orange-50 border-b border-orange-100 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-orange-500">⚠</span>
              <span class="font-semibold text-orange-700 text-sm">{{ t('inventory.squareIssueLabel') }} ({{ squareDiffs.length }})</span>
            </div>
            <button @click="clearSquareDiffs" class="text-xs text-gray-400 hover:text-gray-600">清除</button>
          </div>
          <div class="divide-y">
            <div v-for="(diff, idx) in squareDiffs" :key="idx" class="px-4 py-3">
              <div class="flex items-start justify-between gap-4">
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium text-gray-800 truncate">
                    {{ diff.shopifyProductTitle }} — {{ diff.shopifyVariantTitle }}
                  </div>
                  <div class="text-xs text-gray-400 mt-0.5">
                    {{ t('inventory.squareItem') }}: {{ diff.squareItemName }} / {{ diff.squareVariationName }}
                    · {{ t('inventory.matchedBy') }}: {{ diff.matchType?.toUpperCase() }}
                  </div>
                  <!-- Diff details -->
                  <div class="mt-2 space-y-1">
                    <div v-for="d in diff.diffs" :key="d.field" class="flex items-center gap-3 text-xs">
                      <span class="w-10 text-gray-500 font-medium uppercase">{{ d.field }}</span>
                      <span class="flex items-center gap-0.5 text-gray-500"><img :src="shopifyLogoUrl" class="w-3 h-3 object-contain" /></span>
                      <span class="text-red-500 font-mono">{{ d.shopifyValue || '—' }}</span>
                      <span class="text-gray-400">vs</span>
                      <span class="flex items-center gap-0.5 text-gray-500"><img :src="squareLogoUrl" class="w-3 h-3 object-contain" /></span>
                      <span class="text-blue-600 font-mono">{{ d.squareValue || '—' }}</span>
                    </div>
                  </div>
                </div>
                <!-- Choice buttons -->
                <div class="flex flex-col gap-1 shrink-0">
                  <div class="flex gap-1">
                    <button
                      @click="stageSquareDiff(diff, 'square')"
                      :class="getSquareDiffChoice(diff) === 'square' ? 'bg-blue-600 text-white' : 'bg-white text-blue-600 border border-blue-300'"
                      class="text-xs px-2 py-1 rounded hover:bg-blue-600 hover:text-white transition-colors flex items-center gap-1"
                    ><img :src="squareLogoUrl" class="w-3 h-3 object-contain" />{{ t('inventory.keepSquare') }}</button>
                    <button
                      @click="stageSquareDiff(diff, 'shopify')"
                      :class="getSquareDiffChoice(diff) === 'shopify' ? 'bg-green-600 text-white' : 'bg-white text-green-600 border border-green-300'"
                      class="text-xs px-2 py-1 rounded hover:bg-green-600 hover:text-white transition-colors flex items-center gap-1"
                    ><img :src="shopifyLogoUrl" class="w-3 h-3 object-contain" />{{ t('inventory.keepShopify') }}</button>
                    <button
                      @click="openManualInput(diff)"
                      :class="getSquareDiffChoice(diff) === 'both' ? 'bg-purple-600 text-white' : 'bg-white text-purple-600 border border-purple-300'"
                      class="text-xs px-2 py-1 rounded hover:bg-purple-600 hover:text-white transition-colors"
                    >{{ t('inventory.manualInput') }}</button>
                  </div>
                  <div v-if="getSquareDiffChoice(diff)" class="text-xs text-center text-gray-400">
                    <span v-if="getSquareDiffChoice(diff) === 'square'" class="text-blue-500">✓ 保留 Square</span>
                    <span v-else-if="getSquareDiffChoice(diff) === 'shopify'" class="text-green-500">✓ 保留 Shopify</span>
                    <span v-else-if="getSquareDiffChoice(diff) === 'both'" class="text-purple-500">✓ 手动输入</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Square Unmatched -->
        <div v-if="squareUnmatched.length > 0" class="bg-white rounded-xl shadow-sm overflow-hidden">
          <div class="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-gray-500">🔍</span>
              <span class="font-semibold text-gray-700 text-sm">{{ t('inventory.squareUnmatchedLabel') }} ({{ squareUnmatched.length }})</span>
            </div>
          </div>
          <div class="divide-y">
            <div v-for="(item, idx) in squareUnmatched" :key="idx" class="px-4 py-3">
              <div class="flex items-start justify-between gap-4">
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium text-gray-800">{{ item.squareItemName }} — {{ item.squareVariationName }}</div>
                  <div class="text-xs text-gray-400 mt-0.5">
                    SKU: <span class="font-mono">{{ item.squareSku || '—' }}</span>
                    · GTIN: <span class="font-mono">{{ item.squareGtin || '—' }}</span>
                  </div>
                </div>
                <button
                  @click="openLinkModal(item)"
                  class="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded border shrink-0"
                >{{ t('inventory.linkToShopify') }}</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Status Tabs (Shopify only) -->
      <div v-if="activeSource === 'shopify'" class="flex gap-1 mb-4 border-b border-gray-200">
        <button
          v-for="tab in statusTabs"
          :key="tab.value"
          @click="switchStatus(tab.value)"
          class="px-4 py-2 text-sm font-medium rounded-t-lg transition-colors"
          :class="activeStatus === tab.value
            ? 'bg-white border border-b-white border-gray-200 text-purple-700 -mb-px'
            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Filters Row -->
      <div class="flex gap-3 mb-4 flex-wrap">
        <input
          v-model="searchQuery"
          :placeholder="t('inventory.search')"
          class="flex-1 min-w-48 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <!-- Source dropdown (全部商品) -->
        <div class="relative" ref="sourceDropdownRef">
          <button
            @click="toggleSourceDropdown"
            :class="viewMode === 'all' ? (activeSource === 'shopify' ? 'bg-purple-600 text-white' : 'bg-gray-700 text-white') : 'bg-white text-gray-600 border'"
            class="px-4 py-2 rounded-lg text-sm flex items-center gap-1"
          >
            <img :src="activeSource === 'shopify' ? shopifyLogoUrl : squareLogoUrl" class="w-4 h-4 object-contain" />
            {{ viewMode === 'all' ? (activeSource === 'shopify' ? t('inventory.allShopify') : t('inventory.allSquare')) : t('inventory.allProducts') }}
            <span class="ml-1">▾</span>
          </button>
          <div v-if="showSourceDropdown" class="absolute left-0 mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
            <button
              @click="setSourceView('shopify')"
              class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-t-lg flex items-center gap-2"
              :class="activeSource === 'shopify' && viewMode === 'all' ? 'bg-purple-50 text-purple-700 font-medium' : ''"
            >
              <img :src="shopifyLogoUrl" class="w-4 h-4 object-contain" /> {{ t('inventory.allShopify') }}
            </button>
            <button
              @click="setSourceView('square')"
              class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-b-lg flex items-center gap-2"
              :class="activeSource === 'square' && viewMode === 'all' ? 'bg-gray-100 text-gray-800 font-medium' : ''"
            >
              <img :src="squareLogoUrl" class="w-4 h-4 object-contain" /> {{ t('inventory.allSquare') }}
            </button>
          </div>
        </div>

        <!-- Issues dropdown (仅显示重复) -->
        <div class="relative" ref="issuesDropdownRef">
          <button
            @click="toggleIssuesDropdown"
            :class="viewMode !== 'all' ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 border'"
            class="px-4 py-2 rounded-lg text-sm flex items-center gap-2"
          >
            <span>⚠</span>
            {{ issuesViewLabel }}
            <span class="ml-1">▾</span>
          </button>
          <div v-if="showIssuesDropdown" class="absolute right-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
            <button
              @click="setIssuesView('shopify-dup')"
              class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-t-lg flex items-center gap-2"
              :class="viewMode === 'shopify-dup' ? 'bg-orange-50 text-orange-700 font-medium' : ''"
            >
              <img :src="shopifyLogoUrl" class="w-4 h-4 object-contain" /> {{ t('inventory.shopifyDuplicates') }}
            </button>
            <button
              @click="setIssuesView('square-dup')"
              class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              :class="viewMode === 'square-dup' ? 'bg-orange-50 text-orange-700 font-medium' : ''"
            >
              <img :src="squareLogoUrl" class="w-4 h-4 object-contain" /> {{ t('inventory.squareDuplicates') }}
            </button>
            <button
              @click="setIssuesView('cross-gtin')"
              class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              :class="viewMode === 'cross-gtin' ? 'bg-orange-50 text-orange-700 font-medium' : ''"
            >
              <span>🔀</span> {{ t('inventory.crossGtinMismatch') }}
            </button>
            <button
              @click="setIssuesView('cross-sku')"
              class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              :class="viewMode === 'cross-sku' ? 'bg-orange-50 text-orange-700 font-medium' : ''"
            >
              <span>🔀</span> {{ t('inventory.crossSkuMismatch') }}
            </button>
            <button
              @click="setIssuesView('cross-both')"
              class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-b-lg flex items-center gap-2"
              :class="viewMode === 'cross-both' ? 'bg-orange-50 text-orange-700 font-medium' : ''"
            >
              <span>⚠️</span> {{ t('inventory.crossBothMismatch') }}
            </button>
          </div>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="loading || crossMatchLoading" class="text-center text-gray-400 py-20 flex flex-col items-center gap-3">
        <span class="animate-spin text-3xl text-purple-400">⟳</span>
        <span class="text-sm">{{ crossMatchLoading ? t('inventory.loadingCrossMatch') : 'Loading...' }}</span>
      </div>

      <!-- ── Shopify Products List ── -->
      <template v-else-if="activeSource === 'shopify' && (viewMode === 'all' || viewMode === 'shopify-dup')">
        <div v-if="filteredProducts.length === 0 && products.length === 0" class="text-center text-gray-400 py-20">
          {{ t('inventory.noProducts') }}
        </div>
        <div v-else-if="filteredProducts.length === 0 && viewMode === 'shopify-dup'" class="text-center text-green-600 py-20 text-lg">
          ✅ {{ t('inventory.noDuplicates') }}
        </div>
        <div v-else-if="filteredProducts.length === 0" class="text-center text-gray-400 py-20">
          {{ t('inventory.noProducts') }}
        </div>
        <div v-else class="space-y-3">
          <div
            v-for="product in filteredProducts"
            :key="product.id"
            class="bg-white rounded-xl shadow-sm overflow-hidden"
            :class="[
              product.hasDuplicate ? 'border-l-4 border-orange-400' : '',
              hasProductPendingChanges(product.id) ? 'ring-2 ring-amber-300' : ''
            ]"
          >
            <!-- Product Header -->
            <div class="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50"
              @click="toggleProduct(product.id)">
              <div class="flex items-center gap-3">
                <span v-if="product.hasDuplicate" class="text-orange-500 text-lg">⚠</span>
                <span v-if="hasProductPendingChanges(product.id)" class="text-amber-500 text-sm font-medium">✎</span>
                <div>
                  <div class="font-medium text-gray-800">
                    <span v-if="stagedProducts[product.id]?.title !== undefined && stagedProducts[product.id].title !== product.title" class="text-amber-600">
                      {{ stagedProducts[product.id].title }}
                    </span>
                    <span v-else>{{ product.title }}</span>
                  </div>
                  <div class="text-xs text-gray-500">{{ product.vendor }} · {{ product.product_type }} · <span :class="statusBadgeClass(product._computed_status || product.status)">{{ product._computed_status || product.status }}</span></div>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-xs text-gray-400">{{ product.variants?.length }} {{ t('inventory.variants') }}</span>
                <button @click.stop="openEditProduct(product)" class="text-xs text-purple-600 hover:underline">{{ t('inventory.edit') }}</button>
                <span class="text-gray-400">{{ expandedProducts.has(product.id) ? '▲' : '▼' }}</span>
              </div>
            </div>

            <!-- Variants Table -->
            <div v-if="expandedProducts.has(product.id)" class="border-t">
              <table class="w-full text-xs">
                <thead class="bg-gray-50 text-gray-500">
                  <tr>
                    <th class="text-left px-4 py-2">Variant</th>
                    <th class="text-left px-4 py-2">{{ t('inventory.sku') }}</th>
                    <th class="text-left px-4 py-2">{{ t('inventory.barcode') }}</th>
                    <th class="text-left px-4 py-2">{{ t('inventory.price') }}</th>
                    <th class="text-left px-4 py-2">{{ t('inventory.issues') }}</th>
                    <th class="text-left px-4 py-2">{{ t('inventory.actions') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="variant in product.variants" :key="variant.id"
                    class="border-t"
                    :class="[
                      (variant.hasDuplicateSKU || variant.hasDuplicateBarcode) ? 'bg-orange-50' : '',
                      hasVariantPendingChanges(product.id, variant.id) ? 'bg-amber-50' : ''
                    ]">
                    <td class="px-4 py-2 text-gray-700">{{ variant.title }}</td>
                    <td class="px-4 py-2">
                      <span v-if="getStagedVariantField(product.id, variant.id, 'sku') !== null" class="text-amber-600 font-medium">
                        {{ getStagedVariantField(product.id, variant.id, 'sku') || '-' }}
                      </span>
                      <span v-else :class="variant.hasDuplicateSKU ? 'text-red-600 font-semibold' : 'text-gray-600'">
                        {{ variant.sku || '-' }}
                      </span>
                    </td>
                    <td class="px-4 py-2">
                      <span v-if="getStagedVariantField(product.id, variant.id, 'barcode') !== null" class="text-amber-600 font-medium">
                        {{ getStagedVariantField(product.id, variant.id, 'barcode') || '-' }}
                      </span>
                      <span v-else :class="variant.hasDuplicateBarcode ? 'text-red-600 font-semibold' : 'text-gray-600'">
                        {{ variant.barcode || '-' }}
                      </span>
                    </td>
                    <td class="px-4 py-2 text-gray-600">
                      <span v-if="getStagedVariantField(product.id, variant.id, 'price') !== null" class="text-amber-600 font-medium">
                        ${{ getStagedVariantField(product.id, variant.id, 'price') }}
                      </span>
                      <span v-else>${{ variant.price }}</span>
                    </td>
                    <td class="px-4 py-2 space-y-0.5">
                      <span v-if="variant.hasDuplicateSKU"
                        class="inline-block bg-red-100 text-red-600 px-1.5 py-0.5 rounded mr-1 text-xs leading-tight">
                        <template v-if="variant.crossProductSKU && variant.duplicateSKUProducts?.length">
                          SKU 与「{{ variant.duplicateSKUProducts.map(d => `${statusLabel(d.status)} · ${d.title}`).join('」「') }}」冲突
                        </template>
                        <template v-else>
                          {{ t('inventory.dupSKU') }}
                        </template>
                      </span>
                      <span v-if="variant.hasDuplicateBarcode"
                        class="inline-block bg-red-100 text-red-600 px-1.5 py-0.5 rounded text-xs leading-tight">
                        <template v-if="variant.crossProductBarcode && variant.duplicateBarcodeProducts?.length">
                          Barcode 与「{{ variant.duplicateBarcodeProducts.map(d => `${statusLabel(d.status)} · ${d.title}`).join('」「') }}」冲突
                        </template>
                        <template v-else>
                          {{ t('inventory.dupBarcode') }}
                        </template>
                      </span>
                    </td>
                    <td class="px-4 py-2">
                      <button @click="openEditVariant(product, variant)" class="text-purple-600 hover:underline">{{ t('inventory.edit') }}</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </template>

      <!-- ── Square Products List ── -->
      <template v-else-if="activeSource === 'square' && (viewMode === 'all' || viewMode === 'square-dup')">
        <div v-if="squareProducts.length === 0" class="text-center text-gray-400 py-20">
          <div class="mb-3"><img :src="squareLogoUrl" class="w-12 h-12 object-contain mx-auto" /></div>
          <div>{{ squareLastSync ? t('inventory.noSquareProducts') : t('inventory.squareNotSynced') }}</div>
          <div v-if="!squareLastSync" class="text-xs text-gray-300 mt-2">{{ t('inventory.squareSyncHint') }}</div>
        </div>
        <div v-else-if="Object.keys(groupedSquareProducts).length === 0 && viewMode === 'square-dup'" class="text-center text-green-600 py-20 text-lg">
          ✅ {{ t('inventory.noDuplicates') }}
        </div>
        <div v-else class="space-y-1">
          <!-- Group by item_name -->
          <div v-for="(group, itemName) in groupedSquareProducts" :key="itemName" class="bg-white rounded-xl shadow-sm overflow-hidden">
            <div class="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50"
              @click="toggleSquareItem(itemName)">
              <div class="flex items-center gap-3">
                <span v-if="group.some(v => v.hasDuplicate)" class="text-orange-500">⚠</span>
                <span class="font-medium text-gray-800">{{ itemName }}</span>
                <span class="text-xs text-gray-400 flex items-center gap-1"><img :src="squareLogoUrl" class="w-3 h-3 object-contain" /> Square</span>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-xs text-gray-400">{{ group.length }} {{ t('inventory.variants') }}</span>
                <span class="text-gray-400">{{ expandedSquareItems.has(itemName) ? '▲' : '▼' }}</span>
              </div>
            </div>
            <div v-if="expandedSquareItems.has(itemName)" class="border-t">
              <table class="w-full text-xs">
                <thead class="bg-gray-50 text-gray-500">
                  <tr>
                    <th class="text-left px-4 py-2">Variation</th>
                    <th class="text-left px-4 py-2">{{ t('inventory.sku') }}</th>
                    <th class="text-left px-4 py-2">GTIN</th>
                    <th class="text-left px-4 py-2">{{ t('inventory.issues') }}</th>
                    <th class="text-left px-4 py-2">{{ t('inventory.actions') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="variation in group" :key="variation.id"
                    class="border-t"
                    :class="[
                      variation.hasDuplicate ? 'bg-orange-50' : '',
                      stagedSquareEdits[variation.id] ? 'bg-amber-50 ring-1 ring-amber-200' : ''
                    ]">
                    <td class="px-4 py-2 text-gray-700">{{ variation.variation_name || '—' }}</td>
                    <!-- SKU cell: inline edit or display -->
                    <td class="px-4 py-2">
                      <template v-if="editingSquareVariation === variation.id">
                        <input v-model="squareEditForm.sku" class="input-field w-28" :placeholder="t('inventory.squareEditSku')" />
                      </template>
                      <template v-else>
                        <span v-if="stagedSquareEdits[variation.id]?.sku !== undefined" class="text-amber-600 font-medium">
                          {{ stagedSquareEdits[variation.id].sku || '—' }}
                        </span>
                        <span v-else :class="variation.hasDuplicateSku ? 'text-red-600 font-semibold' : 'text-gray-600'">
                          {{ variation.sku || '—' }}
                        </span>
                      </template>
                    </td>
                    <!-- GTIN cell: inline edit or display -->
                    <td class="px-4 py-2">
                      <template v-if="editingSquareVariation === variation.id">
                        <input v-model="squareEditForm.gtin" class="input-field w-28" :placeholder="t('inventory.squareEditGtin')" />
                      </template>
                      <template v-else>
                        <span v-if="stagedSquareEdits[variation.id]?.gtin !== undefined" class="text-amber-600 font-medium">
                          {{ stagedSquareEdits[variation.id].gtin || '—' }}
                        </span>
                        <span v-else :class="variation.hasDuplicateGtin ? 'text-red-600 font-semibold' : 'text-gray-600'">
                          {{ variation.gtin || '—' }}
                        </span>
                      </template>
                    </td>
                    <td class="px-4 py-2 space-y-0.5">
                      <span v-if="variation.hasDuplicateSku"
                        class="inline-block bg-red-100 text-red-600 px-1.5 py-0.5 rounded text-xs">
                        <template v-if="variation.duplicateSkuVariations?.length">
                          SKU {{ t('inventory.squareDupConflictWith') }}「{{ variation.duplicateSkuVariations.map(v => `${v.itemName} / ${v.variationName}`).join('」「') }}」
                        </template>
                        <template v-else>{{ t('inventory.dupSKU') }}</template>
                      </span>
                      <span v-if="variation.hasDuplicateGtin"
                        class="inline-block bg-red-100 text-red-600 px-1.5 py-0.5 rounded text-xs">
                        <template v-if="variation.duplicateGtinVariations?.length">
                          GTIN {{ t('inventory.squareDupConflictWith') }}「{{ variation.duplicateGtinVariations.map(v => `${v.itemName} / ${v.variationName}`).join('」「') }}」
                        </template>
                        <template v-else>{{ t('inventory.dupBarcode') }}</template>
                      </span>
                    </td>
                    <!-- Actions cell -->
                    <td class="px-4 py-2">
                      <template v-if="editingSquareVariation === variation.id">
                        <button @click="saveSquareEdit(variation)" class="text-green-600 hover:underline mr-2">{{ t('inventory.squareSaveStaged') }}</button>
                        <button @click="cancelSquareEdit" class="text-gray-400 hover:underline">{{ t('inventory.squareDiscardEdit') }}</button>
                      </template>
                      <template v-else>
                        <button @click="startSquareEdit(variation)" class="text-purple-600 hover:underline mr-2">{{ t('inventory.edit') }}</button>
                        <button v-if="stagedSquareEdits[variation.id]" @click="discardSquareEdit(variation.id)" class="text-red-400 hover:underline text-xs">×</button>
                      </template>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </template>

      <!-- ── Cross-Match View (GTIN match, SKU mismatch) ── -->
      <template v-else-if="viewMode === 'cross-gtin'">
        <div v-if="crossMatchItems.length === 0" class="text-center text-green-600 py-20 text-lg">
          ✅ {{ t('inventory.noCrossMatch') }}
        </div>
        <div v-else class="space-y-3">
          <div
            v-for="(item, idx) in filteredCrossMatchItems"
            :key="idx"
            class="bg-white rounded-xl shadow-sm overflow-hidden"
            :class="[
              getCrossMatchChoice(item, 'cross-gtin') ? 'ring-2 ring-amber-300' : 'border-l-4 border-orange-400'
            ]"
          >
            <!-- Card Header -->
            <div class="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50"
              @click="toggleCrossItem('gtin_' + idx)">
              <div class="flex items-center gap-3">
                <span class="text-orange-500 text-lg">⚠</span>
                <span v-if="getCrossMatchChoice(item, 'cross-gtin')" class="text-amber-500 text-sm font-medium">✎</span>
                <div>
                  <div class="font-medium text-gray-800">{{ item.shopify_product_title }}</div>
                  <div class="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                    <img :src="shopifyLogoUrl" class="w-3 h-3 object-contain" />
                    <span>{{ item.shopify_variant_title }}</span>
                    <span class="text-gray-300 mx-1">·</span>
                    <img :src="squareLogoUrl" class="w-3 h-3 object-contain" />
                    <span>{{ item.square_item_name }} / {{ item.square_variation_name }}</span>
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <span v-if="getCrossMatchChoice(item, 'cross-gtin')" class="text-xs text-amber-500">
                  {{ getCrossMatchChoice(item, 'cross-gtin') === 'square' ? '✓ 保留 Square' : getCrossMatchChoice(item, 'cross-gtin') === 'shopify' ? '✓ 保留 Shopify' : '✓ 手动输入' }}
                </span>
                <span class="text-gray-400">{{ expandedCrossItems.has('gtin_' + idx) ? '▲' : '▼' }}</span>
              </div>
            </div>
            <!-- Expanded: data table with inline buttons -->
            <div v-if="expandedCrossItems.has('gtin_' + idx)" class="border-t">
              <table class="w-full text-xs">
                <thead class="bg-gray-50 text-gray-500">
                  <tr>
                    <th class="text-left px-4 py-2 w-24">字段</th>
                    <th class="text-left px-4 py-2">
                      <span class="flex items-center gap-1"><img :src="shopifyLogoUrl" class="w-3.5 h-3.5 object-contain" /> Shopify</span>
                    </th>
                    <th class="text-left px-4 py-2">
                      <span class="flex items-center gap-1"><img :src="squareLogoUrl" class="w-3.5 h-3.5 object-contain" /> Square</span>
                    </th>
                    <th class="text-left px-4 py-2 w-56">操作</th>
                  </tr>
                </thead>
                <tbody>
                  <!-- SKU row -->
                  <tr class="border-t" :class="item.shopify_sku !== item.square_sku ? 'bg-orange-50' : ''">
                    <td class="px-4 py-2 text-gray-500 uppercase font-medium">SKU</td>
                    <td class="px-4 py-2 font-mono" :class="item.shopify_sku !== item.square_sku ? 'text-red-600 font-semibold' : 'text-gray-600'">{{ item.shopify_sku || '—' }}</td>
                    <td class="px-4 py-2 font-mono text-gray-600">{{ item.square_sku || '—' }}</td>
                    <td class="px-4 py-2">
                      <div v-if="item.shopify_sku !== item.square_sku" class="flex gap-1 flex-wrap">
                        <button
                          @click.stop="stageCrossMatchDiff(item, 'cross-gtin', 'square')"
                          :class="getCrossMatchChoice(item, 'cross-gtin') === 'square' ? 'bg-blue-600 text-white' : 'bg-white text-blue-600 border border-blue-300'"
                          class="text-xs px-2 py-1 rounded hover:bg-blue-600 hover:text-white transition-colors flex items-center gap-1"
                        ><img :src="squareLogoUrl" class="w-3 h-3 object-contain" /> 保留 Square</button>
                        <button
                          @click.stop="stageCrossMatchDiff(item, 'cross-gtin', 'shopify')"
                          :class="getCrossMatchChoice(item, 'cross-gtin') === 'shopify' ? 'bg-green-600 text-white' : 'bg-white text-green-600 border border-green-300'"
                          class="text-xs px-2 py-1 rounded hover:bg-green-600 hover:text-white transition-colors flex items-center gap-1"
                        ><img :src="shopifyLogoUrl" class="w-3 h-3 object-contain" /> 保留 Shopify</button>
                        <button
                          @click.stop="openManualInputCross(item, 'cross-gtin')"
                          :class="getCrossMatchChoice(item, 'cross-gtin') === 'both' ? 'bg-purple-600 text-white' : 'bg-white text-purple-600 border border-purple-300'"
                          class="text-xs px-2 py-1 rounded hover:bg-purple-600 hover:text-white transition-colors"
                        >手动输入</button>
                      </div>
                      <span v-else class="text-green-500 text-xs">✓ 一致</span>
                    </td>
                  </tr>
                  <!-- GTIN row -->
                  <tr class="border-t" :class="item.shopify_gtin !== item.square_gtin ? 'bg-orange-50' : ''">
                    <td class="px-4 py-2 text-gray-500 uppercase font-medium">GTIN</td>
                    <td class="px-4 py-2 font-mono text-gray-600">{{ item.shopify_gtin || '—' }}</td>
                    <td class="px-4 py-2 font-mono" :class="item.shopify_gtin !== item.square_gtin ? 'text-red-600 font-semibold' : 'text-gray-600'">{{ item.square_gtin || '—' }}</td>
                    <td class="px-4 py-2">
                      <span class="text-gray-400 text-xs italic">由 GTIN 匹配</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </template>

      <!-- ── Cross-Match View (SKU match, GTIN mismatch) ── -->
      <template v-else-if="viewMode === 'cross-sku'">
        <div v-if="crossMatchItems.length === 0" class="text-center text-green-600 py-20 text-lg">
          ✅ {{ t('inventory.noCrossMatch') }}
        </div>
        <div v-else class="space-y-3">
          <div
            v-for="(item, idx) in filteredCrossMatchItems"
            :key="idx"
            class="bg-white rounded-xl shadow-sm overflow-hidden"
            :class="[
              getCrossMatchChoice(item, 'cross-sku') ? 'ring-2 ring-amber-300' : 'border-l-4 border-orange-400'
            ]"
          >
            <!-- Card Header -->
            <div class="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50"
              @click="toggleCrossItem('sku_' + idx)">
              <div class="flex items-center gap-3">
                <span class="text-orange-500 text-lg">⚠</span>
                <span v-if="getCrossMatchChoice(item, 'cross-sku')" class="text-amber-500 text-sm font-medium">✎</span>
                <div>
                  <div class="font-medium text-gray-800">{{ item.shopify_product_title }}</div>
                  <div class="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                    <img :src="shopifyLogoUrl" class="w-3 h-3 object-contain" />
                    <span>{{ item.shopify_variant_title }}</span>
                    <span class="text-gray-300 mx-1">·</span>
                    <img :src="squareLogoUrl" class="w-3 h-3 object-contain" />
                    <span>{{ item.square_item_name }} / {{ item.square_variation_name }}</span>
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <span v-if="getCrossMatchChoice(item, 'cross-sku')" class="text-xs text-amber-500">
                  {{ getCrossMatchChoice(item, 'cross-sku') === 'square' ? '✓ 保留 Square' : getCrossMatchChoice(item, 'cross-sku') === 'shopify' ? '✓ 保留 Shopify' : '✓ 手动输入' }}
                </span>
                <span class="text-gray-400">{{ expandedCrossItems.has('sku_' + idx) ? '▲' : '▼' }}</span>
              </div>
            </div>
            <!-- Expanded: data table with inline buttons -->
            <div v-if="expandedCrossItems.has('sku_' + idx)" class="border-t">
              <table class="w-full text-xs">
                <thead class="bg-gray-50 text-gray-500">
                  <tr>
                    <th class="text-left px-4 py-2 w-24">字段</th>
                    <th class="text-left px-4 py-2">
                      <span class="flex items-center gap-1"><img :src="shopifyLogoUrl" class="w-3.5 h-3.5 object-contain" /> Shopify</span>
                    </th>
                    <th class="text-left px-4 py-2">
                      <span class="flex items-center gap-1"><img :src="squareLogoUrl" class="w-3.5 h-3.5 object-contain" /> Square</span>
                    </th>
                    <th class="text-left px-4 py-2 w-56">操作</th>
                  </tr>
                </thead>
                <tbody>
                  <!-- SKU row -->
                  <tr class="border-t" :class="item.shopify_sku !== item.square_sku ? 'bg-orange-50' : ''">
                    <td class="px-4 py-2 text-gray-500 uppercase font-medium">SKU</td>
                    <td class="px-4 py-2 font-mono text-gray-600">{{ item.shopify_sku || '—' }}</td>
                    <td class="px-4 py-2 font-mono text-gray-600">{{ item.square_sku || '—' }}</td>
                    <td class="px-4 py-2">
                      <span class="text-gray-400 text-xs italic">由 SKU 匹配</span>
                    </td>
                  </tr>
                  <!-- GTIN row -->
                  <tr class="border-t" :class="item.shopify_gtin !== item.square_gtin ? 'bg-orange-50' : ''">
                    <td class="px-4 py-2 text-gray-500 uppercase font-medium">GTIN</td>
                    <td class="px-4 py-2 font-mono text-gray-600">{{ item.shopify_gtin || '—' }}</td>
                    <td class="px-4 py-2 font-mono" :class="item.shopify_gtin !== item.square_gtin ? 'text-red-600 font-semibold' : 'text-gray-600'">{{ item.square_gtin || '—' }}</td>
                    <td class="px-4 py-2">
                      <div v-if="item.shopify_gtin !== item.square_gtin" class="flex gap-1 flex-wrap">
                        <button
                          @click.stop="stageCrossMatchDiff(item, 'cross-sku', 'square')"
                          :class="getCrossMatchChoice(item, 'cross-sku') === 'square' ? 'bg-blue-600 text-white' : 'bg-white text-blue-600 border border-blue-300'"
                          class="text-xs px-2 py-1 rounded hover:bg-blue-600 hover:text-white transition-colors flex items-center gap-1"
                        ><img :src="squareLogoUrl" class="w-3 h-3 object-contain" /> 保留 Square</button>
                        <button
                          @click.stop="stageCrossMatchDiff(item, 'cross-sku', 'shopify')"
                          :class="getCrossMatchChoice(item, 'cross-sku') === 'shopify' ? 'bg-green-600 text-white' : 'bg-white text-green-600 border border-green-300'"
                          class="text-xs px-2 py-1 rounded hover:bg-green-600 hover:text-white transition-colors flex items-center gap-1"
                        ><img :src="shopifyLogoUrl" class="w-3 h-3 object-contain" /> 保留 Shopify</button>
                        <button
                          @click.stop="openManualInputCross(item, 'cross-sku')"
                          :class="getCrossMatchChoice(item, 'cross-sku') === 'both' ? 'bg-purple-600 text-white' : 'bg-white text-purple-600 border border-purple-300'"
                          class="text-xs px-2 py-1 rounded hover:bg-purple-600 hover:text-white transition-colors"
                        >手动输入</button>
                      </div>
                      <span v-else class="text-green-500 text-xs">✓ 一致</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </template>


      <!-- ── Cross-Both Mismatch View ── -->
      <template v-else-if="viewMode === 'cross-both'">
        <div v-if="crossMatchItems.length === 0 && !crossMatchLoading" class="text-center text-gray-400 py-20">
          <div class="text-4xl mb-3">✅</div>
          <div class="text-sm">{{ t('inventory.noCrossMatch') }}</div>
        </div>
        <!-- Bulk add button -->
        <div class="flex justify-end mb-3">
          <button
            @click="bulkAddToSquare"
            :disabled="bulkAddLoading"
            class="text-sm bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-medium"
          >
            <span v-if="bulkAddLoading">{{ t('inventory.crossBothBulkAdding') }}</span>
            <span v-else>{{ t('inventory.crossBothBulkAdd') }}</span>
          </button>
        </div>
        <div v-else class="space-y-4">
          <div
            v-for="item in crossMatchItems.filter(i => !crossBothIgnored.has(i.shopify_variant_id))"
            :key="item.shopify_variant_id"
            class="bg-white rounded-xl shadow-sm overflow-hidden"
          >
            <!-- Card header: collapsible -->
            <div
              class="px-4 py-3 bg-orange-50 border-b border-orange-100 flex items-center justify-between cursor-pointer select-none"
              @click="crossBothCollapsed[item.shopify_variant_id] = !crossBothCollapsed[item.shopify_variant_id]"
            >
              <div class="flex items-center gap-2 min-w-0">
                <img :src="shopifyLogoUrl" class="w-4 h-4 object-contain shrink-0" />
                <span class="font-semibold text-orange-800 text-sm truncate">
                  {{ item.shopify_product_title }} — {{ item.shopify_variant_title }}
                </span>
              </div>
              <div class="flex items-center gap-2 shrink-0 ml-2">
                <button @click.stop="ignoreCrossBoth(item)" class="text-xs text-gray-400 hover:text-gray-600">
                  {{ t('inventory.crossBothIgnore') }}
                </button>
                <button
                  @click.stop="addToSquare(item)"
                  class="text-xs bg-green-600 hover:bg-green-700 text-white px-2.5 py-1 rounded"
                >{{ t('inventory.crossBothAddToSquare') }}</button>
                <span class="text-gray-400 text-xs">{{ crossBothCollapsed[item.shopify_variant_id] ? '▶' : '▼' }}</span>
              </div>
            </div>

            <!-- Card body: collapsible -->
            <div v-show="!crossBothCollapsed[item.shopify_variant_id]" class="px-4 py-3">
              <!-- Shopify variant info -->
              <div class="flex gap-6 text-xs text-gray-500 mb-3">
                <span>SKU: <span class="font-mono text-gray-700">{{ item.shopify_sku || '—' }}</span></span>
                <span>GTIN: <span class="font-mono text-gray-700">{{ item.shopify_gtin || '—' }}</span></span>
                <span>Price: <span class="font-mono text-gray-700">{{ item.shopify_price != null ? '$' + item.shopify_price : '—' }}</span></span>
              </div>

              <!-- Manual Square search -->
              <div class="space-y-2">
                <div class="flex gap-2">
                  <input
                    v-model="crossBothSearchQuery[item.shopify_variant_id]"
                    @input="debouncedSquareSearch(item.shopify_variant_id)"
                    type="text"
                    :placeholder="t('inventory.crossBothSearchPlaceholder')"
                    class="flex-1 text-xs border border-gray-200 rounded px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
                <!-- Search results -->
                <div v-if="crossBothSearchResults[item.shopify_variant_id] && crossBothSearchResults[item.shopify_variant_id].length > 0" class="space-y-1.5">
                  <div
                    v-for="candidate in crossBothSearchResults[item.shopify_variant_id]"
                    :key="candidate.item_id"
                    class="bg-gray-50 rounded-lg px-3 py-2"
                  >
                    <div class="flex items-center gap-1.5 mb-1.5">
                      <img :src="squareLogoUrl" class="w-3.5 h-3.5 object-contain shrink-0" />
                      <span class="text-sm font-medium text-gray-800">{{ candidate.item_name }}</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <select
                        v-model="crossBothSelectedVariation[item.shopify_variant_id + '|' + candidate.item_id]"
                        class="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 bg-white text-gray-700 min-w-0"
                      >
                        <option value="" disabled>{{ t('inventory.crossBothSelectVariation') }}</option>
                        <option
                          v-for="v in candidate.variations"
                          :key="v.variation_id"
                          :value="v.variation_id"
                        >
                          {{ v.variation_name }}
                          <template v-if="v.sku"> · SKU: {{ v.sku }}</template>
                          <template v-if="v.gtin"> · GTIN: {{ v.gtin }}</template>
                          <template v-if="v.price != null"> · ${{ (v.price / 100).toFixed(2) }}</template>
                        </option>
                      </select>
                      <button
                        @click="linkCrossBoth(item, candidate, crossBothSelectedVariation[item.shopify_variant_id + '|' + candidate.item_id])"
                        :disabled="!crossBothSelectedVariation[item.shopify_variant_id + '|' + candidate.item_id]"
                        class="text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded shrink-0"
                      >{{ t('inventory.crossBothLinkTo') }}</button>
                    </div>
                  </div>
                </div>
                <div
                  v-else-if="crossBothSearchQuery[item.shopify_variant_id] && crossBothSearchQuery[item.shopify_variant_id].length >= 2"
                  class="text-xs text-gray-400 px-1"
                >{{ t('inventory.crossBothNoSearchResults') }}</div>
              </div>
            </div>
          </div>
        </div>
      </template>

    </main>

    <!-- Edit Product Modal -->
    <div v-if="editingProduct" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div class="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl">
        <h2 class="text-lg font-bold mb-1">{{ t('inventory.editProduct') }}</h2>
        <p class="text-xs text-gray-400 mb-4">{{ t('inventory.editStagedNote') }}</p>
        <div class="space-y-3">
          <div>
            <label class="text-sm text-gray-600">Title</label>
            <input v-model="productForm.title" class="input-field mt-1" />
          </div>
          <div>
            <label class="text-sm text-gray-600">{{ t('inventory.vendor') }}</label>
            <input v-model="productForm.vendor" class="input-field mt-1" />
          </div>
          <div>
            <label class="text-sm text-gray-600">{{ t('inventory.type') }}</label>
            <input v-model="productForm.product_type" class="input-field mt-1" />
          </div>
          <div>
            <label class="text-sm text-gray-600">Tags</label>
            <input v-model="productForm.tags" class="input-field mt-1" />
          </div>
          <div>
            <label class="text-sm text-gray-600">{{ t('inventory.status') }}</label>
            <select v-model="productForm.status" class="input-field mt-1">
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>
        <div class="flex gap-3 mt-4">
          <button @click="stageProductEdit" class="flex-1 bg-amber-500 text-white py-2 rounded-lg hover:bg-amber-600">
            {{ t('inventory.stageEdit') }}
          </button>
          <button @click="editingProduct = null" class="flex-1 border py-2 rounded-lg hover:bg-gray-50">{{ t('inventory.cancel') }}</button>
        </div>
      </div>
    </div>

    <!-- Edit Variant Modal -->
    <div v-if="editingVariant" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div class="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl">
        <h2 class="text-lg font-bold mb-1">{{ t('inventory.editVariant') }}</h2>
        <p class="text-xs text-gray-400 mb-1">{{ editingVariant.product.title }} — {{ editingVariant.variant.title }}</p>
        <p class="text-xs text-gray-400 mb-4">{{ t('inventory.editStagedNote') }}</p>
        <div class="space-y-3">
          <div>
            <label class="text-sm text-gray-600">{{ t('inventory.sku') }}</label>
            <input v-model="variantForm.sku" class="input-field mt-1"
              :class="editingVariant.variant.hasDuplicateSKU ? 'border-red-400' : ''" />
            <p v-if="editingVariant.variant.hasDuplicateSKU" class="text-red-500 text-xs mt-1">⚠ {{ t('inventory.dupSKU') }}</p>
          </div>
          <div>
            <label class="text-sm text-gray-600">{{ t('inventory.barcode') }}</label>
            <input v-model="variantForm.barcode" class="input-field mt-1"
              :class="editingVariant.variant.hasDuplicateBarcode ? 'border-red-400' : ''" />
            <p v-if="editingVariant.variant.hasDuplicateBarcode" class="text-red-500 text-xs mt-1">⚠ {{ t('inventory.dupBarcode') }}</p>
          </div>
          <div>
            <label class="text-sm text-gray-600">{{ t('inventory.price') }}</label>
            <input v-model="variantForm.price" type="number" step="0.01" class="input-field mt-1" />
          </div>
          <div>
            <label class="text-sm text-gray-600">{{ t('inventory.compareAtPrice') }}</label>
            <input v-model="variantForm.compare_at_price" type="number" step="0.01" class="input-field mt-1" />
          </div>
        </div>
        <div class="flex gap-3 mt-4">
          <button @click="stageVariantEdit" class="flex-1 bg-amber-500 text-white py-2 rounded-lg hover:bg-amber-600">
            {{ t('inventory.stageEdit') }}
          </button>
          <button @click="editingVariant = null" class="flex-1 border py-2 rounded-lg hover:bg-gray-50">{{ t('inventory.cancel') }}</button>
        </div>
      </div>
    </div>

    <!-- Manual Input Modal (for Square diff / cross-match) -->
    <div v-if="manualInputTarget" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div class="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <h2 class="text-lg font-bold mb-1">{{ t('inventory.manualInput') }}</h2>
        <p class="text-xs text-gray-400 mb-4">
          {{ manualInputTarget.shopifyProductTitle || manualInputTarget.shopify_product_title }} — {{ manualInputTarget.shopifyVariantTitle || manualInputTarget.shopify_variant_title }}
        </p>
        <div class="space-y-3">
          <div>
            <label class="text-sm text-gray-600">SKU</label>
            <div class="flex gap-2 mt-1 text-xs text-gray-400 mb-1">
              <span>Shopify: <span class="font-mono text-gray-600">{{ manualInputTarget.shopifySku || manualInputTarget.shopify_sku || '—' }}</span></span>
              <span>·</span>
              <span>Square: <span class="font-mono text-blue-600">{{ manualInputTarget.squareSku || manualInputTarget.square_sku || '—' }}</span></span>
            </div>
            <input v-model="manualForm.sku" class="input-field" />
          </div>
          <div>
            <label class="text-sm text-gray-600">GTIN</label>
            <div class="flex gap-2 mt-1 text-xs text-gray-400 mb-1">
              <span>Shopify: <span class="font-mono text-gray-600">{{ manualInputTarget.shopifyGtin || manualInputTarget.shopify_gtin || '—' }}</span></span>
              <span>·</span>
              <span>Square: <span class="font-mono text-blue-600">{{ manualInputTarget.squareGtin || manualInputTarget.square_gtin || '—' }}</span></span>
            </div>
            <input v-model="manualForm.gtin" class="input-field" />
          </div>
        </div>
        <div class="flex gap-3 mt-4">
          <button @click="confirmManualInput" class="flex-1 bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700">
            {{ t('inventory.stageEdit') }}
          </button>
          <button @click="manualInputTarget = null" class="flex-1 border py-2 rounded-lg hover:bg-gray-50">{{ t('inventory.cancel') }}</button>
        </div>
      </div>
    </div>

    <!-- Link to Shopify Modal (for unmatched Square items) -->
    <div v-if="linkModalTarget" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div class="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl">
        <h2 class="text-lg font-bold mb-1">{{ t('inventory.linkToShopify') }}</h2>
        <p class="text-xs text-gray-400 mb-4">
          Square: {{ linkModalTarget.squareItemName }} — {{ linkModalTarget.squareVariationName }}
          <br>SKU: {{ linkModalTarget.squareSku || '—' }} · GTIN: {{ linkModalTarget.squareGtin || '—' }}
        </p>
        <div>
          <label class="text-sm text-gray-600">{{ t('inventory.selectShopifyVariant') }}</label>
          <input
            v-model="linkSearchQuery"
            :placeholder="t('inventory.search')"
            class="input-field mt-1 mb-2"
          />
          <div class="max-h-60 overflow-y-auto border rounded-lg divide-y">
            <div v-if="filteredLinkVariants.length === 0" class="px-4 py-3 text-sm text-gray-400 text-center">
              暂无匹配结果
            </div>
            <button
              v-for="v in filteredLinkVariants"
              :key="v.variantId"
              @click="selectLinkVariant(v)"
              class="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm"
              :class="linkSelectedVariant?.variantId === v.variantId ? 'bg-purple-50 text-purple-700 font-medium' : 'text-gray-700'"
            >
              <div>{{ v.productTitle }}</div>
              <div class="text-xs text-gray-400">{{ v.variantTitle }} · SKU: {{ v.sku || '—' }} · GTIN: {{ v.gtin || '—' }}</div>
            </button>
          </div>
        </div>
        <div class="flex gap-3 mt-4">
          <button
            @click="confirmLink"
            :disabled="!linkSelectedVariant"
            class="flex-1 bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50"
          >
            {{ t('inventory.linkConfirm') }}
          </button>
          <button @click="linkModalTarget = null" class="flex-1 border py-2 rounded-lg hover:bg-gray-50">{{ t('inventory.cancel') }}</button>
        </div>
      </div>
    </div>

    <!-- Commit Changes Modal (diff view) -->
    <div v-if="showCommitModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh]">
        <!-- Modal Header -->
        <div class="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h2 class="text-lg font-bold text-gray-800">{{ t('inventory.commitTitle') }}</h2>
            <p class="text-xs text-gray-500 mt-0.5">{{ t('inventory.commitSubtitle', { count: pendingCount }) }}</p>
          </div>
          <button @click="showCommitModal = false" class="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <!-- Diff List -->
        <div class="overflow-y-auto flex-1 px-6 py-4 space-y-4">

          <!-- Regular product-level changes -->
          <div v-for="(changes, productId) in stagedProducts" :key="'p-' + productId">
            <div v-if="Object.keys(changes).length > 0" class="border rounded-lg overflow-hidden">
              <div class="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center justify-between">
                <span>{{ t('inventory.productChange') }}: {{ getProductTitle(productId) }}</span>
                <button @click="discardProductStage(productId)" class="text-red-400 hover:text-red-600 text-xs normal-case font-normal">{{ t('inventory.discard') }}</button>
              </div>
              <table class="w-full text-sm">
                <thead class="bg-gray-100 text-gray-500 text-xs">
                  <tr>
                    <th class="text-left px-4 py-2 w-1/4">{{ t('inventory.field') }}</th>
                    <th class="text-left px-4 py-2 w-5/12">{{ t('inventory.before') }}</th>
                    <th class="text-left px-4 py-2 w-5/12">{{ t('inventory.after') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(newVal, field) in changes" :key="field" class="border-t">
                    <td class="px-4 py-2 text-gray-500 text-xs">{{ field }}</td>
                    <td class="px-4 py-2 text-red-500 line-through text-xs">{{ getOriginalProductField(productId, field) || '—' }}</td>
                    <td class="px-4 py-2 text-green-600 font-medium text-xs">{{ newVal || '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Regular variant-level changes -->
          <div v-for="(variantMap, productId) in stagedVariants" :key="'v-' + productId">
            <div v-for="(changes, variantId) in variantMap" :key="variantId">
              <div v-if="Object.keys(changes).length > 0" class="border rounded-lg overflow-hidden">
                <div class="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center justify-between">
                  <span>{{ t('inventory.variantChange') }}: {{ getProductTitle(productId) }} — {{ getVariantTitle(productId, variantId) }}</span>
                  <button @click="discardVariantStage(productId, variantId)" class="text-red-400 hover:text-red-600 text-xs normal-case font-normal">{{ t('inventory.discard') }}</button>
                </div>
                <table class="w-full text-sm">
                  <thead class="bg-gray-100 text-gray-500 text-xs">
                    <tr>
                      <th class="text-left px-4 py-2 w-1/4">{{ t('inventory.field') }}</th>
                      <th class="text-left px-4 py-2 w-5/12">{{ t('inventory.before') }}</th>
                      <th class="text-left px-4 py-2 w-5/12">{{ t('inventory.after') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(newVal, field) in changes" :key="field" class="border-t">
                      <td class="px-4 py-2 text-gray-500 text-xs">{{ field }}</td>
                      <td class="px-4 py-2 text-red-500 line-through text-xs">{{ getOriginalVariantField(productId, variantId, field) || '—' }}</td>
                      <td class="px-4 py-2 text-green-600 font-medium text-xs">{{ newVal || '—' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- Square diff staged changes (two-column layout) -->
          <div v-for="(staged, key) in stagedSquareDiffs" :key="'sq-' + key">
            <div v-if="staged" class="border rounded-lg overflow-hidden">
              <div class="bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-700 uppercase tracking-wide flex items-center justify-between">
                <span>
                  Square 对比: {{ staged.shopifyProductTitle || staged.shopify_product_title }} — {{ staged.shopifyVariantTitle || staged.shopify_variant_title }}
                  <span class="ml-2 text-blue-400 normal-case font-normal">
                    ({{ staged.target === 'square' ? '保留 Square → 更新 Shopify' : staged.target === 'shopify' ? '保留 Shopify → 更新 Square' : '手动输入 → 同步双方' }})
                  </span>
                </span>
                <button @click="discardSquareDiff(key)" class="text-red-400 hover:text-red-600 text-xs normal-case font-normal">{{ t('inventory.discard') }}</button>
              </div>
              <!-- Two-column diff table -->
              <div class="grid grid-cols-2 divide-x">
                <!-- Left: Shopify changes -->
                <div>
                  <div class="bg-gray-50 px-4 py-2 text-xs font-medium text-gray-600 border-b flex items-center gap-1"><img :src="shopifyLogoUrl" class="w-3.5 h-3.5 object-contain" />{{ t('inventory.shopifyModify') }}</div>
                  <table class="w-full text-xs">
                    <thead class="bg-gray-50 text-gray-400">
                      <tr>
                        <th class="text-left px-3 py-1.5 w-1/4">字段</th>
                        <th class="text-left px-3 py-1.5">变更</th>
                      </tr>
                    </thead>
                    <tbody>
                      <template v-for="d in (staged.diffs || buildDiffsFromCross(staged))" :key="'shopify-' + d.field">
                        <!-- 保留 Square(target=square) 或 手动输入(both) 时，Shopify 那边会变 -->
                        <tr v-if="staged.target === 'square' || staged.target === 'both'" class="border-t">
                          <td class="px-3 py-2 text-gray-500 uppercase">{{ d.field }}</td>
                          <td class="px-3 py-2">
                            <span v-if="staged.target === 'square'">
                              <span class="text-red-500 line-through">{{ d.shopifyValue || '—' }}</span>
                              <span class="text-gray-400 mx-1">→</span>
                              <span class="text-green-600 font-medium">{{ d.squareValue || '—' }}</span>
                            </span>
                            <span v-else>
                              <span class="text-red-500 line-through">{{ d.shopifyValue || '—' }}</span>
                              <span class="text-gray-400 mx-1">→</span>
                              <span class="text-green-600 font-medium">{{ staged.manualValues?.[d.field] || '—' }}</span>
                            </span>
                          </td>
                        </tr>
                        <tr v-else class="border-t">
                          <td class="px-3 py-2 text-gray-500 uppercase">{{ d.field }}</td>
                          <td class="px-3 py-2 text-gray-400 italic">不变 ✓</td>
                        </tr>
                      </template>
                    </tbody>
                  </table>
                </div>
                <!-- Right: Square changes -->
                <div>
                  <div class="bg-blue-50 px-4 py-2 text-xs font-medium text-blue-600 border-b flex items-center gap-1"><img :src="squareLogoUrl" class="w-3.5 h-3.5 object-contain" />{{ t('inventory.squareModify') }}</div>
                  <table class="w-full text-xs">
                    <thead class="bg-blue-50 text-blue-300">
                      <tr>
                        <th class="text-left px-3 py-1.5 w-1/4">字段</th>
                        <th class="text-left px-3 py-1.5">变更</th>
                      </tr>
                    </thead>
                    <tbody>
                      <template v-for="d in (staged.diffs || buildDiffsFromCross(staged))" :key="'square-' + d.field">
                        <!-- 保留 Shopify(target=shopify) 或 手动输入(both) 时，Square 那边会变 -->
                        <tr v-if="staged.target === 'shopify' || staged.target === 'both'" class="border-t">
                          <td class="px-3 py-2 text-gray-500 uppercase">{{ d.field }}</td>
                          <td class="px-3 py-2">
                            <span v-if="staged.target === 'shopify'">
                              <span class="text-red-500 line-through">{{ d.squareValue || '—' }}</span>
                              <span class="text-gray-400 mx-1">→</span>
                              <span class="text-green-600 font-medium">{{ d.shopifyValue || '—' }}</span>
                            </span>
                            <span v-else>
                              <span class="text-red-500 line-through">{{ d.squareValue || '—' }}</span>
                              <span class="text-gray-400 mx-1">→</span>
                              <span class="text-green-600 font-medium">{{ staged.manualValues?.[d.field] || '—' }}</span>
                            </span>
                          </td>
                        </tr>
                        <tr v-else class="border-t">
                          <td class="px-3 py-2 text-gray-500 uppercase">{{ d.field }}</td>
                          <td class="px-3 py-2 text-gray-400 italic">不变</td>
                        </tr>
                      </template>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          <!-- Square inline edits (need 4) -->
          <div v-for="(edited, variationId) in stagedSquareEdits" :key="'se-' + variationId">
            <div class="border rounded-lg overflow-hidden">
              <div class="bg-orange-50 px-4 py-2 text-xs font-semibold text-orange-700 uppercase tracking-wide flex items-center justify-between">
                <span class="flex items-center gap-1">
                  <img :src="squareLogoUrl" class="w-3.5 h-3.5 object-contain" />
                  Square 直接编辑: {{ squareProducts.find(v => String(v.id) === String(variationId))?.item_name || variationId }} — {{ squareProducts.find(v => String(v.id) === String(variationId))?.variation_name || '' }}
                </span>
                <button @click="discardSquareEdit(variationId)" class="text-red-400 hover:text-red-600 text-xs normal-case font-normal">{{ t('inventory.discard') }}</button>
              </div>
              <table class="w-full text-sm">
                <thead class="bg-gray-100 text-gray-500 text-xs">
                  <tr>
                    <th class="text-left px-4 py-2 w-1/4">字段</th>
                    <th class="text-left px-4 py-2 w-5/12">之前</th>
                    <th class="text-left px-4 py-2 w-5/12">之后</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="edited.sku !== undefined" class="border-t">
                    <td class="px-4 py-2 text-gray-500 text-xs">SKU</td>
                    <td class="px-4 py-2 text-red-500 line-through text-xs">{{ squareProducts.find(v => String(v.id) === String(variationId))?.sku || '—' }}</td>
                    <td class="px-4 py-2 text-green-600 font-medium text-xs">{{ edited.sku || '—' }}</td>
                  </tr>
                  <tr v-if="edited.gtin !== undefined" class="border-t">
                    <td class="px-4 py-2 text-gray-500 text-xs">GTIN</td>
                    <td class="px-4 py-2 text-red-500 line-through text-xs">{{ squareProducts.find(v => String(v.id) === String(variationId))?.gtin || '—' }}</td>
                    <td class="px-4 py-2 text-green-600 font-medium text-xs">{{ edited.gtin || '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

        </div>

        <!-- Modal Footer -->
        <div class="px-6 py-4 border-t flex items-center justify-between bg-gray-50 rounded-b-xl">
          <div v-if="commitError" class="text-red-500 text-sm">{{ commitError }}</div>
          <div v-else class="text-xs text-gray-400">{{ t('inventory.commitWarning') }}</div>
          <div class="flex gap-3">
            <button @click="showCommitModal = false" class="border px-4 py-2 rounded-lg text-sm hover:bg-gray-100">{{ t('inventory.cancel') }}</button>
            <button @click="commitChanges" :disabled="committing" class="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg text-sm disabled:opacity-50 flex items-center gap-2">
              <span v-if="committing" class="animate-spin">⟳</span>
              {{ committing ? t('inventory.committing') : t('inventory.confirmCommit') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import axios from 'axios'
import shopifyLogoUrl from '../assets/shopify-logo.png'
import squareLogoUrl from '../assets/square-logo.png'

const { t, locale } = useI18n()
const api = axios.create({ baseURL: '/api', withCredentials: true })

const platformUrl = import.meta.env.VITE_PLATFORM_URL || 'http://localhost:5174'

async function backToPlatform() {
  try {
    const res = await api.post('/sso/return-token')
    if (res.data.success) {
      window.location.href = `${platformUrl}/?sso_token=${res.data.token}`
    } else {
      window.location.href = platformUrl
    }
  } catch {
    window.location.href = platformUrl
  }
}

// ─── Core data ───────────────────────────────────────────────────────────────
const products = ref([])
const allProductsCache = ref({})
const summary = ref({ total: 0, withDuplicates: 0, duplicateSKUs: 0, duplicateBarcodes: 0 })
const lastSync = ref(null)
const loading = ref(true)
const syncing = ref(false)
const syncingSquare = ref(false)
const searchQuery = ref('')
const expandedProducts = ref(new Set())
const activeStatus = ref('active')

// ─── Source & View mode ───────────────────────────────────────────────────────
// activeSource: 'shopify' | 'square'
const activeSource = ref('shopify')
// viewMode: 'all' | 'shopify-dup' | 'square-dup' | 'cross-gtin' | 'cross-sku'
const viewMode = ref('all')

// ─── Square data ──────────────────────────────────────────────────────────────
const squareProducts = ref([])
const squareSummary = ref({ total: 0, withDuplicates: 0, duplicateSkus: 0, duplicateGtins: 0 })
const squareLastSync = ref(null)
const expandedSquareItems = ref(new Set())
const expandedCrossItems = ref(new Set())

// ─── Cross-match data ─────────────────────────────────────────────────────────
const crossMatchItems = ref([])
const crossMatchLoading = ref(false)
const crossBothIgnored = ref(new Set())
const crossBothCollapsed = reactive({})
const crossBothLinked = ref(new Set())
// Map of "shopify_variant_id|item_id" -> selected variation_id
const crossBothSelectedVariation = ref({})
// Manual Square search per card
const crossBothSearchQuery = reactive({})
const crossBothSearchResults = reactive({})
const bulkAddLoading = ref(false)

// ─── Computed summary (switches by activeSource) ──────────────────────────────
const activeSummary = computed(() => {
  if (activeSource.value === 'square') {
    return {
      total: squareSummary.value.total,
      withDuplicates: squareSummary.value.withDuplicates,
      duplicateSKUs: squareSummary.value.duplicateSkus,
      duplicateBarcodes: squareSummary.value.duplicateGtins,
    }
  }
  return summary.value
})

// ─── Grouped Square products ──────────────────────────────────────────────────
const groupedSquareProducts = computed(() => {
  const list = viewMode.value === 'square-dup'
    ? squareProducts.value.filter(v => v.hasDuplicate)
    : squareProducts.value

  const filtered = searchQuery.value.trim()
    ? list.filter(v => {
        const kw = searchQuery.value.trim().toLowerCase()
        return (v.item_name || '').toLowerCase().includes(kw) ||
               (v.variation_name || '').toLowerCase().includes(kw) ||
               (v.sku || '').toLowerCase().includes(kw) ||
               (v.gtin || '').toLowerCase().includes(kw)
      })
    : list

  const groups = {}
  for (const v of filtered) {
    const name = v.item_name || '(no name)'
    if (!groups[name]) groups[name] = []
    groups[name].push(v)
  }
  return groups
})

// ─── Filtered cross-match items ───────────────────────────────────────────────
const filteredCrossMatchItems = computed(() => {
  if (!searchQuery.value.trim()) return crossMatchItems.value
  const kw = searchQuery.value.trim().toLowerCase()
  return crossMatchItems.value.filter(item =>
    (item.shopify_product_title || '').toLowerCase().includes(kw) ||
    (item.shopify_variant_title || '').toLowerCase().includes(kw) ||
    (item.square_item_name || '').toLowerCase().includes(kw) ||
    (item.shopify_sku || '').toLowerCase().includes(kw) ||
    (item.square_sku || '').toLowerCase().includes(kw) ||
    (item.shopify_gtin || '').toLowerCase().includes(kw) ||
    (item.square_gtin || '').toLowerCase().includes(kw)
  )
})

// ─── Issues view label ────────────────────────────────────────────────────────
const issuesViewLabel = computed(() => {
  const map = {
    'all': t('inventory.duplicatesOnly'),
    'shopify-dup': t('inventory.shopifyDuplicates'),
    'square-dup': t('inventory.squareDuplicates'),
    'cross-gtin': t('inventory.crossGtinMismatch'),
    'cross-sku': t('inventory.crossSkuMismatch'),
    'cross-both': t('inventory.crossBothMismatch'),
  }
  return map[viewMode.value] || t('inventory.duplicatesOnly')
})

// ─── Sync dropdown ────────────────────────────────────────────────────────────
const showSyncDropdown = ref(false)
const syncDropdownRef = ref(null)

function toggleSyncDropdown() {
  showSyncDropdown.value = !showSyncDropdown.value
}

function closeSyncDropdown(e) {
  if (syncDropdownRef.value && !syncDropdownRef.value.contains(e.target)) {
    showSyncDropdown.value = false
  }
}

// ─── Source dropdown ──────────────────────────────────────────────────────────
const showSourceDropdown = ref(false)
const sourceDropdownRef = ref(null)

function toggleSourceDropdown() {
  showSourceDropdown.value = !showSourceDropdown.value
}

function closeSourceDropdown(e) {
  if (sourceDropdownRef.value && !sourceDropdownRef.value.contains(e.target)) {
    showSourceDropdown.value = false
  }
}

async function setSourceView(source) {
  showSourceDropdown.value = false
  activeSource.value = source
  viewMode.value = 'all'
  searchQuery.value = ''
  if (source === 'square' && squareProducts.value.length === 0) {
    await fetchSquareProducts()
  }
}

// ─── Issues dropdown ──────────────────────────────────────────────────────────
const showIssuesDropdown = ref(false)
const issuesDropdownRef = ref(null)

function toggleIssuesDropdown() {
  showIssuesDropdown.value = !showIssuesDropdown.value
}

function closeIssuesDropdown(e) {
  if (issuesDropdownRef.value && !issuesDropdownRef.value.contains(e.target)) {
    showIssuesDropdown.value = false
  }
}

async function setIssuesView(mode) {
  showIssuesDropdown.value = false
  viewMode.value = mode
  searchQuery.value = ''

  if (mode === 'square-dup') {
    activeSource.value = 'square'
    if (squareProducts.value.length === 0) await fetchSquareProducts()
  } else if (mode === 'shopify-dup') {
    activeSource.value = 'shopify'
  } else if (mode === 'cross-gtin' || mode === 'cross-sku' || mode === 'cross-both') {
    activeSource.value = 'shopify' // doesn't matter, cross-match has its own template
    await fetchCrossMatch(mode)
  } else if (mode === 'cross-both') {
    activeSource.value = 'shopify'
    await fetchCrossMatch('cross-both')
  }
}

onMounted(() => {
  document.addEventListener('click', closeSyncDropdown)
  document.addEventListener('click', closeSourceDropdown)
  document.addEventListener('click', closeIssuesDropdown)
})
onUnmounted(() => {
  document.removeEventListener('click', closeSyncDropdown)
  document.removeEventListener('click', closeSourceDropdown)
  document.removeEventListener('click', closeIssuesDropdown)
})

// ─── Square compare state ─────────────────────────────────────────────────────
const squareDiffs = ref([])
const squareUnmatched = ref([])
const stagedSquareDiffs = ref({})

function squareDiffKey(diff) {
  const shopifyId = diff.shopifyVariantId || diff.shopify_variant_id
  const squareId = diff.squareVariationId || diff.square_variation_id
  return `${shopifyId}_${squareId}`
}

function getSquareDiffChoice(diff) {
  const key = squareDiffKey(diff)
  return stagedSquareDiffs.value[key]?.target || null
}

function stageSquareDiff(diff, target) {
  const key = squareDiffKey(diff)
  stagedSquareDiffs.value = {
    ...stagedSquareDiffs.value,
    [key]: { ...diff, target, manualValues: null }
  }
}

function discardSquareDiff(key) {
  const copy = { ...stagedSquareDiffs.value }
  delete copy[key]
  stagedSquareDiffs.value = copy
}

function clearSquareDiffs() {
  squareDiffs.value = []
  squareUnmatched.value = []
  stagedSquareDiffs.value = {}
}

// ─── Cross-match staging ──────────────────────────────────────────────────────
function crossMatchKey(item) {
  return `cross_${item.shopify_variant_id}_${item.square_variation_id}`
}

function getCrossMatchChoice(item, _mode) {
  const key = crossMatchKey(item)
  return stagedSquareDiffs.value[key]?.target || null
}

function stageCrossMatchDiff(item, _mode, target) {
  const key = crossMatchKey(item)
  // Build diffs array from cross-match item
  const diffs = buildDiffsFromCross(item)
  stagedSquareDiffs.value = {
    ...stagedSquareDiffs.value,
    [key]: {
      shopifyVariantId: item.shopify_variant_id,
      shopifyShopifyVariantId: item.shopify_raw_variant_id,
      shopifyProductId: item.shopify_product_sys_id,
      shopifyProductTitle: item.shopify_product_title,
      shopifyVariantTitle: item.shopify_variant_title,
      shopifySku: item.shopify_sku,
      shopifyGtin: item.shopify_gtin,
      squareVariationId: item.square_variation_id,
      squareItemId: item.square_item_id,
      squareItemName: item.square_item_name,
      squareVariationName: item.square_variation_name,
      squareSku: item.square_sku,
      squareGtin: item.square_gtin,
      diffs,
      target,
      manualValues: null,
    }
  }
}

function buildDiffsFromCross(item) {
  const diffs = []
  const shopifySku = (item.shopifySku || item.shopify_sku || '').trim()
  const squareSku = (item.squareSku || item.square_sku || '').trim()
  const shopifyGtin = (item.shopifyGtin || item.shopify_gtin || '').trim()
  const squareGtin = (item.squareGtin || item.square_gtin || '').trim()
  if (shopifySku !== squareSku) diffs.push({ field: 'sku', shopifyValue: shopifySku, squareValue: squareSku })
  if (shopifyGtin !== squareGtin) diffs.push({ field: 'gtin', shopifyValue: shopifyGtin, squareValue: squareGtin })
  return diffs
}

function openManualInputCross(item, _mode) {
  manualInputTarget.value = {
    shopifyProductTitle: item.shopify_product_title,
    shopifyVariantTitle: item.shopify_variant_title,
    shopifySku: item.shopify_sku,
    shopifyGtin: item.shopify_gtin,
    squareSku: item.square_sku,
    squareGtin: item.square_gtin,
    _crossItem: item,
    _crossMode: _mode,
  }
  manualForm.value = {
    sku: item.shopify_sku || '',
    gtin: item.shopify_gtin || ''
  }
}

// ─── Manual input modal ───────────────────────────────────────────────────────
const manualInputTarget = ref(null)
const manualForm = ref({ sku: '', gtin: '' })

function openManualInput(diff) {
  manualInputTarget.value = diff
  manualForm.value = {
    sku: diff.shopifySku || '',
    gtin: diff.shopifyGtin || ''
  }
}

function confirmManualInput() {
  const target = manualInputTarget.value
  if (target._crossItem) {
    // Cross-match manual input
    const item = target._crossItem
    const key = crossMatchKey(item)
    const diffs = buildDiffsFromCross(item)
    stagedSquareDiffs.value = {
      ...stagedSquareDiffs.value,
      [key]: {
        shopifyVariantId: item.shopify_variant_id,
        shopifyShopifyVariantId: item.shopify_raw_variant_id,
        shopifyProductId: item.shopify_product_sys_id,
        shopifyProductTitle: item.shopify_product_title,
        shopifyVariantTitle: item.shopify_variant_title,
        shopifySku: item.shopify_sku,
        shopifyGtin: item.shopify_gtin,
        squareVariationId: item.square_variation_id,
        squareItemId: item.square_item_id,
        squareItemName: item.square_item_name,
        squareVariationName: item.square_variation_name,
        squareSku: item.square_sku,
        squareGtin: item.square_gtin,
        diffs,
        target: 'both',
        manualValues: { sku: manualForm.value.sku, gtin: manualForm.value.gtin },
      }
    }
  } else {
    // Regular squareDiff manual input
    const diff = target
    const key = squareDiffKey(diff)
    stagedSquareDiffs.value = {
      ...stagedSquareDiffs.value,
      [key]: {
        ...diff,
        target: 'both',
        manualValues: { sku: manualForm.value.sku, gtin: manualForm.value.gtin }
      }
    }
  }
  manualInputTarget.value = null
}

// ─── Link modal (unmatched Square items) ─────────────────────────────────────
const linkModalTarget = ref(null)
const linkSearchQuery = ref('')
const linkSelectedVariant = ref(null)

const allVariantsFlat = computed(() => {
  const list = []
  for (const p of Object.values(allProductsCache.value)) {
    for (const v of (p.variants || [])) {
      list.push({
        variantId: String(v.id),
        productTitle: p.title,
        variantTitle: v.title,
        sku: v.sku,
        gtin: v.barcode,
        shopifyVariantId: v.shopify_variant_id,
      })
    }
  }
  return list
})

const filteredLinkVariants = computed(() => {
  if (!linkSearchQuery.value.trim()) return allVariantsFlat.value.slice(0, 50)
  const kw = linkSearchQuery.value.trim().toLowerCase()
  return allVariantsFlat.value.filter(v =>
    (v.productTitle || '').toLowerCase().includes(kw) ||
    (v.variantTitle || '').toLowerCase().includes(kw) ||
    (v.sku || '').toLowerCase().includes(kw) ||
    (v.gtin || '').toLowerCase().includes(kw)
  ).slice(0, 50)
})

function openLinkModal(item) {
  linkModalTarget.value = item
  linkSearchQuery.value = item.squareSku || item.squareGtin || ''
  linkSelectedVariant.value = null
}

function selectLinkVariant(v) {
  linkSelectedVariant.value = v
}

function confirmLink() {
  const squareItem = linkModalTarget.value
  const shopifyVariant = linkSelectedVariant.value
  if (!squareItem || !shopifyVariant) return

  const diffs = []
  if (squareItem.squareSku !== (shopifyVariant.sku || '')) {
    diffs.push({ field: 'sku', shopifyValue: shopifyVariant.sku || '', squareValue: squareItem.squareSku })
  }
  if (squareItem.squareGtin !== (shopifyVariant.gtin || '')) {
    diffs.push({ field: 'gtin', shopifyValue: shopifyVariant.gtin || '', squareValue: squareItem.squareGtin })
  }

  if (diffs.length > 0) {
    const newDiff = {
      matchType: 'manual',
      squareItemId: squareItem.squareItemId,
      squareItemName: squareItem.squareItemName,
      squareVariationId: squareItem.squareVariationId,
      squareVariationName: squareItem.squareVariationName,
      squareSku: squareItem.squareSku,
      squareGtin: squareItem.squareGtin,
      shopifyVariantId: shopifyVariant.variantId,
      shopifyShopifyVariantId: shopifyVariant.shopifyVariantId,
      shopifyProductTitle: shopifyVariant.productTitle,
      shopifyVariantTitle: shopifyVariant.variantTitle,
      shopifySku: shopifyVariant.sku || '',
      shopifyGtin: shopifyVariant.gtin || '',
      diffs,
    }
    squareDiffs.value = [...squareDiffs.value, newDiff]
  }

  squareUnmatched.value = squareUnmatched.value.filter(
    u => u.squareVariationId !== squareItem.squareVariationId
  )

  linkModalTarget.value = null
}

// ─── Staged changes (pre-edit, not yet sent) ─────────────────────────────────
const stagedProducts = ref({})
const stagedVariants = ref({})

// ─── Square inline edit state (need 4) ───────────────────────────────────────
const stagedSquareEdits = ref({})   // { [variationId]: { sku, gtin } }
const editingSquareVariation = ref(null)  // variation.id currently being edited
const squareEditForm = ref({ sku: '', gtin: '' })

function startSquareEdit(variation) {
  editingSquareVariation.value = variation.id
  const existing = stagedSquareEdits.value[variation.id] || {}
  squareEditForm.value = {
    sku: existing.sku !== undefined ? existing.sku : (variation.sku || ''),
    gtin: existing.gtin !== undefined ? existing.gtin : (variation.gtin || ''),
  }
}

function saveSquareEdit(variation) {
  const vid = variation.id
  const orig = { sku: variation.sku || '', gtin: variation.gtin || '' }
  const edited = { sku: squareEditForm.value.sku.trim(), gtin: squareEditForm.value.gtin.trim() }
  if (edited.sku !== orig.sku || edited.gtin !== orig.gtin) {
    stagedSquareEdits.value = { ...stagedSquareEdits.value, [vid]: edited }
  } else {
    // No change — remove any previous staged edit
    const copy = { ...stagedSquareEdits.value }
    delete copy[vid]
    stagedSquareEdits.value = copy
  }
  editingSquareVariation.value = null
}

function cancelSquareEdit() {
  editingSquareVariation.value = null
}

function discardSquareEdit(variationId) {
  const copy = { ...stagedSquareEdits.value }
  delete copy[variationId]
  stagedSquareEdits.value = copy
}

const pendingCount = computed(() => {
  let count = 0
  for (const changes of Object.values(stagedProducts.value)) {
    if (Object.keys(changes).length > 0) count++
  }
  for (const variantMap of Object.values(stagedVariants.value)) {
    for (const changes of Object.values(variantMap)) {
      if (Object.keys(changes).length > 0) count++
    }
  }
  count += Object.values(stagedSquareDiffs.value).filter(Boolean).length
  count += Object.keys(stagedSquareEdits.value).length
  return count
})

// ─── Edit modals ─────────────────────────────────────────────────────────────
const editingProduct = ref(null)
const editingVariant = ref(null)
const productForm = ref({})
const variantForm = ref({})

// ─── Commit modal ─────────────────────────────────────────────────────────────
const showCommitModal = ref(false)
const committing = ref(false)
const commitError = ref('')

// ─── Status tabs ─────────────────────────────────────────────────────────────
const statusTabs = computed(() => [
  { value: 'active', label: t('inventory.statusActive') },
  { value: 'draft', label: t('inventory.statusDraft') },
  { value: 'archived', label: t('inventory.statusArchived') },
  { value: 'unlisted', label: t('inventory.statusUnlisted') },
])

function statusLabel(status) {
  const map = {
    active: t('inventory.statusActive'),
    draft: t('inventory.statusDraft'),
    archived: t('inventory.statusArchived'),
    unlisted: t('inventory.statusUnlisted'),
  }
  return map[status] || status
}

function statusBadgeClass(status) {
  const map = {
    active: 'text-green-600 font-medium',
    draft: 'text-yellow-600 font-medium',
    archived: 'text-gray-500 font-medium',
    unlisted: 'text-blue-500 font-medium',
  }
  return map[status] || 'text-gray-600'
}

function toggleLang() {
  locale.value = locale.value === 'zh' ? 'en' : 'zh'
  localStorage.setItem('lang', locale.value)
}

function toggleProduct(id) {
  if (expandedProducts.value.has(id)) {
    expandedProducts.value.delete(id)
  } else {
    expandedProducts.value.add(id)
  }
  expandedProducts.value = new Set(expandedProducts.value)
}

function toggleSquareItem(name) {
  if (expandedSquareItems.value.has(name)) {
    expandedSquareItems.value.delete(name)
  } else {
    expandedSquareItems.value.add(name)
  }
  expandedSquareItems.value = new Set(expandedSquareItems.value)
}

function toggleCrossItem(key) {
  if (expandedCrossItems.value.has(key)) {
    expandedCrossItems.value.delete(key)
  } else {
    expandedCrossItems.value.add(key)
  }
  // Force reactivity
  expandedCrossItems.value = new Set(expandedCrossItems.value)
}

async function switchStatus(status) {
  activeStatus.value = status
  viewMode.value = 'all'
  expandedProducts.value = new Set()
  await fetchProducts()
}

// ─── Staged change helpers ────────────────────────────────────────────────────
function hasProductPendingChanges(productId) {
  const pid = String(productId)
  return stagedProducts.value[pid] && Object.keys(stagedProducts.value[pid]).length > 0
}

function hasVariantPendingChanges(productId, variantId) {
  const pid = String(productId)
  const vid = String(variantId)
  return stagedVariants.value[pid]?.[vid] && Object.keys(stagedVariants.value[pid][vid]).length > 0
}

function getStagedVariantField(productId, variantId, field) {
  const pid = String(productId)
  const vid = String(variantId)
  const staged = stagedVariants.value[pid]?.[vid]
  if (staged && field in staged) return staged[field]
  return null
}

function getProductTitle(productId) {
  const pid = String(productId)
  const p = products.value.find(x => String(x.id) === pid) || allProductsCache.value[pid]
  return p?.title || pid
}

function getVariantTitle(productId, variantId) {
  const pid = String(productId)
  const vid = String(variantId)
  const p = products.value.find(x => String(x.id) === pid) || allProductsCache.value[pid]
  const v = p?.variants?.find(x => String(x.id) === vid)
  return v?.title || vid
}

function getOriginalProductField(productId, field) {
  const pid = String(productId)
  const p = products.value.find(x => String(x.id) === pid) || allProductsCache.value[pid]
  return p ? p[field] : ''
}

function getOriginalVariantField(productId, variantId, field) {
  const pid = String(productId)
  const vid = String(variantId)
  const p = products.value.find(x => String(x.id) === pid) || allProductsCache.value[pid]
  const v = p?.variants?.find(x => String(x.id) === vid)
  return v ? v[field] : ''
}

function discardProductStage(productId) {
  const pid = String(productId)
  delete stagedProducts.value[pid]
  stagedProducts.value = { ...stagedProducts.value }
}

function discardVariantStage(productId, variantId) {
  const pid = String(productId)
  const vid = String(variantId)
  if (stagedVariants.value[pid]) {
    delete stagedVariants.value[pid][vid]
    if (Object.keys(stagedVariants.value[pid]).length === 0) {
      delete stagedVariants.value[pid]
    }
    stagedVariants.value = { ...stagedVariants.value }
  }
}

// ─── Filtered products ────────────────────────────────────────────────────────
const filteredProducts = computed(() => {
  let list = products.value
  if (viewMode.value === 'shopify-dup') list = list.filter(p => p.hasDuplicate)
  if (searchQuery.value) {
    const raw = searchQuery.value.trim().toLowerCase()
    const keywords = raw.split(/\s+/).filter(Boolean)
    list = list.filter(p => {
      const titleLower = (p.title || '').toLowerCase()
      const vendorLower = (p.vendor || '').toLowerCase()
      const variantTexts = (p.variants || []).map(
        v => `${v.sku || ''} ${v.barcode || ''} ${v.title || ''}`.toLowerCase()
      ).join(' ')
      const searchTarget = `${titleLower} ${vendorLower} ${variantTexts}`
      return keywords.every(kw => searchTarget.includes(kw))
    })
  }
  return list
})

// ─── Fetch / Sync ─────────────────────────────────────────────────────────────
async function fetchProducts() {
  loading.value = true
  try {
    const params = activeStatus.value !== 'all' ? { status: activeStatus.value } : {}
    const res = await api.get('/products', { params })
    products.value = res.data.products
    summary.value = res.data.summary
    res.data.products.filter(p => p.hasDuplicate).forEach(p => expandedProducts.value.add(p.id))
    res.data.products.forEach(p => { allProductsCache.value[String(p.id)] = p })
  } finally {
    loading.value = false
  }
}

async function fetchLastSync() {
  try {
    const res = await api.get('/products/last-sync')
    lastSync.value = res.data
  } catch {}
}

async function fetchSquareLastSync() {
  try {
    const res = await api.get('/products/square-last-sync')
    squareLastSync.value = res.data
  } catch {}
}

async function fetchSquareProducts() {
  try {
    const res = await api.get('/products/square-products')
    squareProducts.value = res.data.products || []
    squareSummary.value = res.data.summary || { total: 0, withDuplicates: 0, duplicateSkus: 0, duplicateGtins: 0 }
  } catch (err) {
    console.error('Failed to fetch Square products:', err.message)
  }
}

async function fetchCrossMatch(mode) {
  crossMatchLoading.value = true
  crossMatchItems.value = []
  try {
    const endpointMap = {
      'cross-gtin': '/products/cross-match/gtin-sku-mismatch',
      'cross-sku': '/products/cross-match/sku-gtin-mismatch',
      'cross-both': '/products/cross-match/both-mismatch',
    }
    const endpoint = endpointMap[mode] || '/products/cross-match/sku-gtin-mismatch'
    const res = await api.get(endpoint)
    crossMatchItems.value = res.data.items || []
  } catch (err) {
    console.error('Failed to fetch cross-match:', err.message)
  } finally {
    crossMatchLoading.value = false
  }
}


// ─── Cross-Both methods ───────────────────────────────────────────────────────
function ignoreCrossBoth(item) {
  const newSet = new Set(crossBothIgnored.value)
  newSet.add(item.shopify_variant_id)
  crossBothIgnored.value = newSet
}

async function addToSquare(item) {
  if (!confirm(t('inventory.crossBothAddConfirm'))) return
  try {
    await api.post('/products/square-add-item', { shopifyProductSysId: item.shopify_product_sys_id })
    alert(t('inventory.crossBothAddSuccess'))
    const newSet = new Set(crossBothLinked.value)
    newSet.add(item.shopify_variant_id)
    crossBothLinked.value = newSet
  } catch (err) {
    alert(t('inventory.crossBothAddError') + ': ' + (err.response?.data?.error || err.message))
  }
}

async function linkCrossBoth(item, candidate, selectedVariationId) {
  if (!selectedVariationId) {
    alert(t('inventory.crossBothSelectVariation'))
    return
  }
  // Find the selected variation details from candidate.variations
  const variation = (candidate.variations || []).find(v => v.variation_id === selectedVariationId)
  if (!variation) return

  // Stage a diff for user to resolve which side to keep
  const diffs = []
  if (item.shopify_sku !== variation.sku) {
    diffs.push({ field: 'sku', shopifyValue: item.shopify_sku, squareValue: variation.sku })
  }
  if (item.shopify_gtin !== variation.gtin) {
    diffs.push({ field: 'gtin', shopifyValue: item.shopify_gtin, squareValue: variation.gtin })
  }
  const priceSquare = variation.price != null ? (variation.price / 100).toFixed(2) : null
  if (item.shopify_price != null && priceSquare != null && String(item.shopify_price) !== priceSquare) {
    diffs.push({ field: 'price', shopifyValue: String(item.shopify_price), squareValue: priceSquare })
  }
  if (diffs.length > 0) {
    squareDiffs.value = [
      ...squareDiffs.value,
      {
        shopifyProductTitle: item.shopify_product_title,
        shopifyVariantTitle: item.shopify_variant_title,
        shopifyProductId: item.shopify_product_id,
        shopifyVariantId: item.shopify_variant_id,
        squareItemId: candidate.item_id,
        squareVariationId: variation.variation_id,
        squareItemName: candidate.item_name,
        squareVariationName: variation.variation_name,
        matchType: 'manual',
        diffs,
      }
    ]
  }
  const newSet = new Set(crossBothLinked.value)
  newSet.add(item.shopify_variant_id)
  crossBothLinked.value = newSet
}

// Debounced Square search for cross-both cards
let squareSearchTimers = {}
async function debouncedSquareSearch(variantId) {
  clearTimeout(squareSearchTimers[variantId])
  const q = (crossBothSearchQuery[variantId] || '').trim()
  if (q.length < 2) {
    crossBothSearchResults[variantId] = []
    return
  }
  squareSearchTimers[variantId] = setTimeout(async () => {
    try {
      const res = await api.get('/products/square-search', { params: { q } })
      crossBothSearchResults[variantId] = res.data.items || []
    } catch (err) {
      crossBothSearchResults[variantId] = []
    }
  }, 300)
}

async function bulkAddToSquare() {
  if (!confirm(t('inventory.crossBothBulkAddConfirm'))) return
  bulkAddLoading.value = true
  try {
    const res = await api.post('/products/bulk-add-to-square')
    const { added, failed } = res.data
    alert(t('inventory.crossBothBulkAddResult', { added, failed }))
    await fetchCrossMatch('cross-both')
  } catch (err) {
    alert(t('inventory.crossBothAddError') + ': ' + (err.response?.data?.error || err.message))
  } finally {
    bulkAddLoading.value = false
  }
}

async function syncShopify() {
  showSyncDropdown.value = false
  syncing.value = true
  try {
    await api.post('/products/sync')
    await fetchProducts()
    await fetchLastSync()
    stagedProducts.value = {}
    stagedVariants.value = {}
    alert(t('inventory.syncSuccess'))
  } catch (err) {
    alert(t('inventory.syncError') + ': ' + (err.response?.data?.error || err.message))
  } finally {
    syncing.value = false
  }
}

async function syncSquare() {
  showSyncDropdown.value = false
  syncingSquare.value = true
  try {
    const res = await api.post('/products/square-sync')
    await fetchSquareLastSync()
    // Refresh square products if currently viewing square
    if (activeSource.value === 'square') {
      await fetchSquareProducts()
    }
    const removedMsg = res.data.removedCount > 0 ? `\n${t('inventory.squareSyncRemoved')}: ${res.data.removedCount}` : ''
    alert(`${t('inventory.squareSyncSuccess')}：${res.data.itemCount} items, ${res.data.variationCount} variations synced.${removedMsg}`)
  } catch (err) {
    alert(t('inventory.squareSyncError') + ': ' + (err.response?.data?.error || err.message))
  } finally {
    syncingSquare.value = false
  }
}

// ─── Open edit modals ─────────────────────────────────────────────────────────
function openEditProduct(product) {
  editingProduct.value = product
  const pid = String(product.id)
  const existing = stagedProducts.value[pid] || {}
  productForm.value = {
    title: existing.title ?? product.title,
    vendor: existing.vendor ?? product.vendor,
    product_type: existing.product_type ?? product.product_type,
    tags: existing.tags ?? product.tags,
    status: existing.status ?? product.status,
  }
}

function openEditVariant(product, variant) {
  editingVariant.value = { product, variant }
  const pid = String(product.id)
  const vid = String(variant.id)
  const existing = stagedVariants.value[pid]?.[vid] || {}
  variantForm.value = {
    sku: existing.sku ?? variant.sku,
    barcode: existing.barcode ?? variant.barcode,
    price: existing.price ?? variant.price,
    compare_at_price: existing.compare_at_price ?? variant.compare_at_price,
  }
}

// ─── Stage edits ──────────────────────────────────────────────────────────────
function stageProductEdit() {
  const product = editingProduct.value
  const pid = String(product.id)
  const diff = {}
  const fields = ['title', 'vendor', 'product_type', 'tags', 'status']
  for (const f of fields) {
    if (String(productForm.value[f] ?? '') !== String(product[f] ?? '')) {
      diff[f] = productForm.value[f]
    }
  }
  if (Object.keys(diff).length > 0) {
    stagedProducts.value = { ...stagedProducts.value, [pid]: diff }
  } else {
    discardProductStage(pid)
  }
  editingProduct.value = null
}

function stageVariantEdit() {
  const { product, variant } = editingVariant.value
  const pid = String(product.id)
  const vid = String(variant.id)
  const diff = {}
  const fields = ['sku', 'barcode', 'price', 'compare_at_price']
  for (const f of fields) {
    if (String(variantForm.value[f] ?? '') !== String(variant[f] ?? '')) {
      diff[f] = variantForm.value[f]
    }
  }
  if (Object.keys(diff).length > 0) {
    const existing = { ...(stagedVariants.value[pid] || {}) }
    existing[vid] = diff
    stagedVariants.value = { ...stagedVariants.value, [pid]: existing }
  } else {
    discardVariantStage(pid, vid)
  }
  editingVariant.value = null
}

// ─── Commit modal ─────────────────────────────────────────────────────────────
function openCommitModal() {
  commitError.value = ''
  showCommitModal.value = true
}

async function commitChanges() {
  committing.value = true
  commitError.value = ''

  // Optimistic update: immediately remove resolved cross-match items from the list
  const squareItemsToRemove = Object.values(stagedSquareDiffs.value).filter(Boolean)
  const removedCrossItems = crossMatchItems.value.filter(item => {
    const key = `cross_${item.shopify_variant_id}_${item.square_variation_id}`
    return squareItemsToRemove.some(s => `cross_${s.shopifyVariantId}_${s.squareVariationId}` === key)
  })
  if (squareItemsToRemove.length > 0) {
    crossMatchItems.value = crossMatchItems.value.filter(item => {
      const key = `cross_${item.shopify_variant_id}_${item.square_variation_id}`
      return !squareItemsToRemove.some(s => `cross_${s.shopifyVariantId}_${s.squareVariationId}` === key)
    })
  }

  try {
    // 1. Regular Shopify updates
    const productUpdates = Object.entries(stagedProducts.value)
      .filter(([, changes]) => Object.keys(changes).length > 0)
      .map(([productId, changes]) => ({ productId, changes }))

    const variantUpdates = []
    for (const [productId, variantMap] of Object.entries(stagedVariants.value)) {
      for (const [variantId, changes] of Object.entries(variantMap)) {
        if (Object.keys(changes).length > 0) {
          variantUpdates.push({ productId, variantId, changes })
        }
      }
    }

    if (productUpdates.length > 0 || variantUpdates.length > 0) {
      const res = await api.post('/products/batch-update', { productUpdates, variantUpdates })
      for (const { productId, changes } of productUpdates) {
        const pid = String(productId)
        const idx = products.value.findIndex(p => String(p.id) === pid)
        if (idx !== -1) {
          products.value[idx] = { ...products.value[idx], ...changes }
          allProductsCache.value[pid] = products.value[idx]
        }
      }
      for (const { productId, variantId, changes } of variantUpdates) {
        const pid = String(productId)
        const vid = String(variantId)
        const product = products.value.find(p => String(p.id) === pid)
        if (product) {
          const vIdx = product.variants?.findIndex(v => String(v.id) === vid)
          if (vIdx !== undefined && vIdx !== -1) {
            product.variants[vIdx] = { ...product.variants[vIdx], ...changes }
          }
          allProductsCache.value[pid] = product
        }
      }
      if (res.data.errors && res.data.errors.length > 0) {
        throw new Error(res.data.errors.map(e => `${e.type} ${e.variantId || e.productId}: ${JSON.stringify(e.error)}`).join('\n'))
      }
    }

    // 2. Square diff updates
    const squareItems = Object.values(stagedSquareDiffs.value).filter(Boolean)
    if (squareItems.length > 0) {
      const items = squareItems.map(staged => ({
        shopifyVariantId: staged.shopifyVariantId,
        shopifyShopifyVariantId: staged.shopifyShopifyVariantId,
        squareVariationId: staged.squareVariationId,
        target: staged.target,
        shopifySku: staged.shopifySku,
        shopifyGtin: staged.shopifyGtin,
        squareSku: staged.squareSku,
        squareGtin: staged.squareGtin,
        manualSku: staged.manualValues?.sku,
        manualGtin: staged.manualValues?.gtin,
      }))
      const sqRes = await api.post('/products/square-batch-update', { items })
      if (sqRes.data.errors && sqRes.data.errors.length > 0) {
        throw new Error('Square 更新失败: ' + sqRes.data.errors.map(e => e.error).join(', '))
      }
    }

    // 3. Square inline edits (need 4)
    const squareEditEntries = Object.entries(stagedSquareEdits.value)
    if (squareEditEntries.length > 0) {
      const editItems = squareEditEntries.map(([variationId, edited]) => ({
        squareVariationId: variationId,
        target: 'square-direct',
        newSku: edited.sku,
        newGtin: edited.gtin,
      }))
      const seRes = await api.post('/products/square-batch-update', { items: editItems })
      if (seRes.data.errors && seRes.data.errors.length > 0) {
        throw new Error('Square 直接编辑失败: ' + seRes.data.errors.map(e => e.error).join(', '))
      }
      // Update local squareProducts cache
      for (const [variationId, edited] of squareEditEntries) {
        const idx = squareProducts.value.findIndex(v => String(v.id) === String(variationId))
        if (idx !== -1) {
          squareProducts.value[idx] = { ...squareProducts.value[idx], sku: edited.sku, gtin: edited.gtin }
        }
      }
    }

    // Clear all staged
    stagedProducts.value = {}
    stagedVariants.value = {}
    stagedSquareDiffs.value = {}
    stagedSquareEdits.value = {}
    squareDiffs.value = squareDiffs.value.filter(d => {
      const key = squareDiffKey(d)
      return !squareItems.some(s => `${s.shopifyVariantId}_${s.squareVariationId}` === key)
    })
    // Remove resolved cross-match items from the list
    if (squareItems.length > 0) {
      crossMatchItems.value = crossMatchItems.value.filter(item => {
        const key = `cross_${item.shopify_variant_id}_${item.square_variation_id}`
        return !squareItems.some(s => `cross_${s.shopifyVariantId}_${s.squareVariationId}` === key)
      })
    }

    showCommitModal.value = false
    alert(t('inventory.commitSuccess'))
  } catch (err) {
    commitError.value = t('inventory.commitError') + ': ' + (err.response?.data?.error || err.message)
  } finally {
    committing.value = false
  }
}

onMounted(async () => {
  await Promise.all([fetchProducts(), fetchLastSync(), fetchSquareLastSync()])
})
</script>

<style scoped>
.input-field {
  @apply w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm;
}
</style>
