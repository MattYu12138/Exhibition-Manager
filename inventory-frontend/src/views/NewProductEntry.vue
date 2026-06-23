<template>
  <div class="new-product-entry">
    <!-- Header -->
    <div class="entry-header">
      <button class="back-btn" @click="$emit('close')">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        返回
      </button>
      <h2 class="entry-title">录入新商品</h2>
    </div>

    <!-- Stepper -->
    <div class="stepper">
      <div v-for="(step, idx) in steps" :key="idx" class="step" :class="{ active: currentStep === idx, done: currentStep > idx }">
        <div class="step-circle">
          <svg v-if="currentStep > idx" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          <span v-else>{{ idx + 1 }}</span>
        </div>
        <span class="step-label">{{ step }}</span>
        <div v-if="idx < steps.length - 1" class="step-line" :class="{ filled: currentStep > idx }"></div>
      </div>
    </div>

    <!-- Step 1: Select Fields -->
    <transition name="slide-fade" mode="out-in">
      <div v-if="currentStep === 0" key="step0" class="step-content">
        <div class="step-desc">
          <h3>选择此次需要填写的字段</h3>
          <p>必填字段已自动选中且不可取消，可根据需要勾选其他字段。</p>
        </div>
        <div class="field-categories">
          <div v-for="cat in fieldCategories" :key="cat.name" class="field-category">
            <h4 class="cat-title">{{ cat.name }}</h4>
            <div class="field-chips">
              <label
                v-for="field in cat.fields"
                :key="field.key"
                class="field-chip"
                :class="{ selected: selectedFields.includes(field.key), required: field.required, disabled: field.required }"
              >
                <input
                  type="checkbox"
                  :checked="selectedFields.includes(field.key)"
                  :disabled="field.required"
                  @change="toggleField(field.key)"
                />
                <span class="chip-text">{{ field.label }}</span>
                <span v-if="field.required" class="chip-badge">必填</span>
              </label>
            </div>
          </div>
        </div>
        <div class="step-actions">
          <button class="btn-primary" @click="goToStep(1)" :disabled="selectedFields.length === 0">
            下一步：填写数据
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>
    </transition>

    <!-- Step 2: Fill Data Table -->
    <transition name="slide-fade" mode="out-in">
      <div v-if="currentStep === 1" key="step1" class="step-content">
        <div class="step-desc">
          <h3>填写商品数据</h3>
          <p>每行代表一个商品变体（同一商品的多个变体共享 Title、Vendor 等信息）。</p>
        </div>
        <!-- Add Column Button -->
        <div class="table-toolbar">
          <button class="btn-outline btn-sm" @click="showAddColumnDialog = true">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            添加列
          </button>
          <button class="btn-outline btn-sm" @click="addRow">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            添加行
          </button>
          <span class="row-count">共 {{ rows.length }} 行</span>
        </div>
        <!-- Data Table -->
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th class="row-num">#</th>
                <th v-for="col in activeColumns" :key="col.key" class="col-header">
                  <span>{{ col.label }}</span>
                  <button v-if="!col.required" class="col-remove" @click="removeColumn(col.key)" title="移除此列">×</button>
                </th>
                <th class="row-actions">操作</th>
              </tr>
            </thead>
            <transition-group name="row-fade" tag="tbody">
              <tr v-for="(row, rIdx) in rows" :key="row._id">
                <td class="row-num">{{ rIdx + 1 }}</td>
                <td v-for="col in activeColumns" :key="col.key" class="cell" :class="{ 'cell-error': row._errors && row._errors[col.key] }">
                  <select v-if="col.type === 'select'" v-model="row[col.key]" class="cell-input">
                    <option value="">-- 选择 --</option>
                    <option v-for="opt in col.options" :key="opt" :value="opt">{{ opt }}</option>
                  </select>
                  <textarea v-else-if="col.type === 'textarea'" v-model="row[col.key]" class="cell-input cell-textarea" rows="2"></textarea>
                  <input v-else v-model="row[col.key]" class="cell-input" :placeholder="col.placeholder || ''" :type="col.type === 'number' ? 'number' : 'text'" />
                  <span v-if="row._errors && row._errors[col.key]" class="cell-error-tip">{{ row._errors[col.key] }}</span>
                </td>
                <td class="row-actions">
                  <button class="btn-icon btn-danger" @click="removeRow(rIdx)" title="删除行">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                  <button class="btn-icon" @click="duplicateRow(rIdx)" title="复制行">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  </button>
                </td>
              </tr>
            </transition-group>
          </table>
        </div>
        <div class="step-actions">
          <button class="btn-secondary" @click="goToStep(0)">上一步</button>
          <button class="btn-primary" @click="goToStep(2)" :disabled="rows.length === 0">
            下一步：验证数据
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>
    </transition>

    <!-- Step 3: Validate -->
    <transition name="slide-fade" mode="out-in">
      <div v-if="currentStep === 2" key="step2" class="step-content">
        <div class="step-desc">
          <h3>数据验证</h3>
          <p>检查所有数据是否符合 Shopify 商品导入格式要求。</p>
        </div>
        <div v-if="validating" class="validate-loading">
          <div class="spinner"></div>
          <span>正在验证数据...</span>
        </div>
        <div v-else-if="validationResult" class="validate-result">
          <div v-if="validationResult.valid" class="validate-success">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <h4>验证通过</h4>
            <p>{{ validationResult.message }}</p>
            <div class="validate-summary">
              <span>共 <strong>{{ productCount }}</strong> 个商品</span>
              <span>共 <strong>{{ rows.length }}</strong> 个变体</span>
            </div>
          </div>
          <div v-else class="validate-errors">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            <h4>验证失败</h4>
            <p>发现 {{ validationResult.errors.length }} 个问题，请返回修正：</p>
            <ul class="error-list">
              <li v-for="(err, i) in validationResult.errors" :key="i">
                <strong>第 {{ err.row }} 行</strong>
                <span v-if="err.variant">（变体 {{ err.variant }}）</span>
                — {{ err.field }}: {{ err.message }}
              </li>
            </ul>
          </div>
        </div>
        <div class="step-actions">
          <button class="btn-secondary" @click="goToStep(1)">返回修改</button>
          <button class="btn-primary" @click="goToStep(3)" :disabled="!validationResult || !validationResult.valid">
            下一步：导出/上传
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>
    </transition>

    <!-- Step 4: Export / Upload -->
    <transition name="slide-fade" mode="out-in">
      <div v-if="currentStep === 3" key="step3" class="step-content">
        <div class="step-desc">
          <h3>导出或上传到 Shopify</h3>
          <p>选择导出 CSV 文件手动上传，或直接通过 API 添加到 Shopify。</p>
        </div>
        <div class="export-options">
          <div class="export-card" @click="exportCSV">
            <div class="export-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </div>
            <h4>导出 CSV</h4>
            <p>生成 Shopify 标准格式 CSV 文件，可手动上传到 Shopify 后台。</p>
          </div>
          <div class="export-card" :class="{ uploading }" @click="uploadToShopify">
            <div class="export-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            </div>
            <h4>{{ uploading ? '正在上传...' : '添加到 Shopify' }}</h4>
            <p>直接通过 Shopify API 创建商品（状态默认为 Draft）。</p>
            <div v-if="uploading" class="upload-progress">
              <div class="progress-bar"><div class="progress-fill" :style="{ width: uploadProgress + '%' }"></div></div>
              <span>{{ uploadProgress }}%</span>
            </div>
          </div>
        </div>
        <!-- Upload Result -->
        <div v-if="uploadResult" class="upload-result">
          <div class="result-summary" :class="uploadResult.summary.failed > 0 ? 'partial' : 'success'">
            <span>创建成功: <strong>{{ uploadResult.summary.created }}</strong></span>
            <span v-if="uploadResult.summary.failed > 0">失败: <strong>{{ uploadResult.summary.failed }}</strong></span>
          </div>
          <div v-for="(r, i) in uploadResult.data" :key="i" class="result-item" :class="r.status">
            <span class="result-title">{{ r.title }}</span>
            <span class="result-status">{{ r.status === 'created' ? '✓ 已创建' : '✗ ' + r.message }}</span>
          </div>
        </div>
        <div class="step-actions">
          <button class="btn-secondary" @click="goToStep(2)">上一步</button>
          <button class="btn-primary" @click="$emit('close')">完成</button>
        </div>
      </div>
    </transition>

    <!-- Add Column Dialog -->
    <transition name="fade">
      <div v-if="showAddColumnDialog" class="dialog-overlay" @click.self="showAddColumnDialog = false">
        <div class="dialog-box">
          <h3>添加列</h3>
          <p>选择要添加到表格中的字段：</p>
          <div class="dialog-fields">
            <label
              v-for="field in availableFieldsToAdd"
              :key="field.key"
              class="dialog-field-item"
              @click="addColumn(field.key)"
            >
              <span>{{ field.label }}</span>
              <span class="field-cat-tag">{{ field.category }}</span>
            </label>
          </div>
          <div class="dialog-actions">
            <button class="btn-secondary" @click="showAddColumnDialog = false">关闭</button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, reactive, nextTick } from 'vue'
import axios from 'axios'

const emit = defineEmits(['close'])

const api = axios.create({ baseURL: '/api', withCredentials: true })

// ─── All available fields based on Shopify CSV format ───
const allFields = [
  // Product level
  { key: 'Handle', label: 'Handle', category: '基本信息', required: false, type: 'text', placeholder: 'product-handle' },
  { key: 'Title', label: 'Title', category: '基本信息', required: true, type: 'text', placeholder: '商品标题' },
  { key: 'Body (HTML)', label: 'Body (HTML)', category: '基本信息', required: false, type: 'textarea', placeholder: '商品描述（HTML）' },
  { key: 'Vendor', label: 'Vendor', category: '基本信息', required: false, type: 'text', placeholder: '供应商' },
  { key: 'Product Category', label: 'Product Category', category: '基本信息', required: false, type: 'text', placeholder: '商品分类' },
  { key: 'Type', label: 'Type', category: '基本信息', required: false, type: 'text', placeholder: '商品类型' },
  { key: 'Tags', label: 'Tags', category: '基本信息', required: false, type: 'text', placeholder: '标签，逗号分隔' },
  { key: 'Published', label: 'Published', category: '基本信息', required: false, type: 'select', options: ['true', 'false'] },
  { key: 'Status', label: 'Status', category: '基本信息', required: false, type: 'select', options: ['active', 'draft', 'archived'] },
  // Options
  { key: 'Option1 Name', label: 'Option1 Name', category: '选项', required: false, type: 'text', placeholder: 'Size' },
  { key: 'Option1 Value', label: 'Option1 Value', category: '选项', required: false, type: 'text', placeholder: 'S / M / L' },
  { key: 'Option2 Name', label: 'Option2 Name', category: '选项', required: false, type: 'text', placeholder: 'Color' },
  { key: 'Option2 Value', label: 'Option2 Value', category: '选项', required: false, type: 'text', placeholder: 'Red / Blue' },
  { key: 'Option3 Name', label: 'Option3 Name', category: '选项', required: false, type: 'text', placeholder: 'Material' },
  { key: 'Option3 Value', label: 'Option3 Value', category: '选项', required: false, type: 'text', placeholder: 'Cotton' },
  // Variant
  { key: 'Variant SKU', label: 'Variant SKU', category: '变体', required: true, type: 'text', placeholder: 'SKU 编码' },
  { key: 'Variant Grams', label: 'Variant Grams', category: '变体', required: false, type: 'number', placeholder: '重量(g)' },
  { key: 'Variant Inventory Tracker', label: 'Variant Inventory Tracker', category: '变体', required: false, type: 'select', options: ['shopify', ''] },
  { key: 'Variant Inventory Qty', label: 'Variant Inventory Qty', category: '变体', required: false, type: 'number', placeholder: '库存数量' },
  { key: 'Variant Inventory Policy', label: 'Variant Inventory Policy', category: '变体', required: false, type: 'select', options: ['deny', 'continue'] },
  { key: 'Variant Fulfillment Service', label: 'Variant Fulfillment Service', category: '变体', required: false, type: 'select', options: ['manual'] },
  { key: 'Variant Price', label: 'Variant Price', category: '变体', required: true, type: 'number', placeholder: '价格' },
  { key: 'Variant Compare At Price', label: 'Variant Compare At Price', category: '变体', required: false, type: 'number', placeholder: '对比价格' },
  { key: 'Variant Requires Shipping', label: 'Variant Requires Shipping', category: '变体', required: false, type: 'select', options: ['true', 'false'] },
  { key: 'Variant Taxable', label: 'Variant Taxable', category: '变体', required: false, type: 'select', options: ['true', 'false'] },
  { key: 'Variant Barcode', label: 'Variant Barcode', category: '变体', required: false, type: 'text', placeholder: 'GTIN/EAN/UPC' },
  { key: 'Variant Weight Unit', label: 'Variant Weight Unit', category: '变体', required: false, type: 'select', options: ['g', 'kg', 'lb', 'oz'] },
  { key: 'Cost per item', label: 'Cost per item', category: '变体', required: false, type: 'number', placeholder: '成本' },
  // Image
  { key: 'Image Src', label: 'Image Src', category: '图片', required: false, type: 'text', placeholder: 'https://...' },
  { key: 'Image Position', label: 'Image Position', category: '图片', required: false, type: 'number', placeholder: '1' },
  { key: 'Image Alt Text', label: 'Image Alt Text', category: '图片', required: false, type: 'text', placeholder: '图片描述' },
  // SEO
  { key: 'SEO Title', label: 'SEO Title', category: 'SEO', required: false, type: 'text', placeholder: 'SEO 标题' },
  { key: 'SEO Description', label: 'SEO Description', category: 'SEO', required: false, type: 'textarea', placeholder: 'SEO 描述' },
  // Metafields
  { key: 'Wholesale AUD (excl GST) (product.metafields.custom.retail_aud)', label: 'Wholesale AUD', category: 'Metafields', required: false, type: 'number', placeholder: '批发价 AUD' },
  { key: 'Retail EUR (product.metafields.custom.retail_eur)', label: 'Retail EUR', category: 'Metafields', required: false, type: 'number', placeholder: '零售价 EUR' },
  { key: 'Retail GBP (product.metafields.custom.retail_gbp)', label: 'Retail GBP', category: 'Metafields', required: false, type: 'number', placeholder: '零售价 GBP' },
  { key: 'Retail NZD (product.metafields.custom.retail_nzd)', label: 'Retail NZD', category: 'Metafields', required: false, type: 'number', placeholder: '零售价 NZD' },
  { key: 'Retail SGD (product.metafields.custom.retail_sgd)', label: 'Retail SGD', category: 'Metafields', required: false, type: 'number', placeholder: '零售价 SGD' },
  { key: 'Retail USD (product.metafields.custom.retail_usd)', label: 'Retail USD', category: 'Metafields', required: false, type: 'number', placeholder: '零售价 USD' },
  // Markets
  { key: 'Included / Australia', label: 'Included / Australia', category: '市场', required: false, type: 'select', options: ['true', 'false'] },
  { key: 'Price / Australia', label: 'Price / Australia', category: '市场', required: false, type: 'number', placeholder: '' },
  { key: 'Compare At Price / Australia', label: 'Compare At Price / Australia', category: '市场', required: false, type: 'number', placeholder: '' },
]

// ─── Steps ───
const steps = ['选择字段', '填写数据', '数据验证', '导出/上传']
const currentStep = ref(0)

// ─── Step 1: Field Selection ───
const selectedFields = ref(allFields.filter(f => f.required).map(f => f.key))

const fieldCategories = computed(() => {
  const cats = {}
  allFields.forEach(f => {
    if (!cats[f.category]) cats[f.category] = { name: f.category, fields: [] }
    cats[f.category].fields.push(f)
  })
  return Object.values(cats)
})

function toggleField(key) {
  const idx = selectedFields.value.indexOf(key)
  if (idx >= 0) selectedFields.value.splice(idx, 1)
  else selectedFields.value.push(key)
}

// ─── Step 2: Data Table ───
const rows = ref([])
const showAddColumnDialog = ref(false)
let rowIdCounter = 0

const activeColumns = computed(() => {
  return selectedFields.value.map(key => allFields.find(f => f.key === key)).filter(Boolean)
})

const availableFieldsToAdd = computed(() => {
  return allFields.filter(f => !selectedFields.value.includes(f.key))
})

function createEmptyRow() {
  const row = { _id: ++rowIdCounter, _errors: null }
  selectedFields.value.forEach(key => { row[key] = '' })
  return row
}

function addRow() {
  rows.value.push(createEmptyRow())
}

function removeRow(idx) {
  rows.value.splice(idx, 1)
}

function duplicateRow(idx) {
  const src = rows.value[idx]
  const newRow = { ...src, _id: ++rowIdCounter, _errors: null }
  rows.value.splice(idx + 1, 0, newRow)
}

function addColumn(key) {
  if (!selectedFields.value.includes(key)) {
    selectedFields.value.push(key)
    // 给已有行添加该字段
    rows.value.forEach(row => { if (!(key in row)) row[key] = '' })
  }
  showAddColumnDialog.value = false
}

function removeColumn(key) {
  const idx = selectedFields.value.indexOf(key)
  if (idx >= 0) selectedFields.value.splice(idx, 1)
}

// ─── Step 3: Validation ───
const validating = ref(false)
const validationResult = ref(null)

const productCount = computed(() => {
  const titles = new Set(rows.value.map(r => r['Title']).filter(Boolean))
  return titles.size || (rows.value.length > 0 ? 1 : 0)
})

async function validateData() {
  validating.value = true
  validationResult.value = null

  // Client-side validation
  const errors = []
  const skus = new Set()

  rows.value.forEach((row, idx) => {
    row._errors = {}

    // Title required
    if (selectedFields.value.includes('Title') && (!row['Title'] || !row['Title'].trim())) {
      errors.push({ row: idx + 1, field: 'Title', message: '商品标题不能为空' })
      row._errors['Title'] = '必填'
    }

    // SKU required and unique
    if (selectedFields.value.includes('Variant SKU')) {
      if (!row['Variant SKU'] || !row['Variant SKU'].trim()) {
        errors.push({ row: idx + 1, field: 'Variant SKU', message: 'SKU 不能为空' })
        row._errors['Variant SKU'] = '必填'
      } else if (skus.has(row['Variant SKU'].trim())) {
        errors.push({ row: idx + 1, field: 'Variant SKU', message: `SKU "${row['Variant SKU']}" 重复` })
        row._errors['Variant SKU'] = 'SKU 重复'
      } else {
        skus.add(row['Variant SKU'].trim())
      }
    }

    // Price must be number
    if (selectedFields.value.includes('Variant Price') && row['Variant Price']) {
      if (isNaN(Number(row['Variant Price']))) {
        errors.push({ row: idx + 1, field: 'Variant Price', message: '价格必须为数字' })
        row._errors['Variant Price'] = '必须为数字'
      }
    }

    // Compare at price
    if (row['Variant Compare At Price'] && isNaN(Number(row['Variant Compare At Price']))) {
      errors.push({ row: idx + 1, field: 'Variant Compare At Price', message: '对比价格必须为数字' })
      row._errors['Variant Compare At Price'] = '必须为数字'
    }

    // Grams
    if (row['Variant Grams'] && isNaN(Number(row['Variant Grams']))) {
      errors.push({ row: idx + 1, field: 'Variant Grams', message: '重量必须为数字' })
      row._errors['Variant Grams'] = '必须为数字'
    }
  })

  await new Promise(r => setTimeout(r, 600)) // Simulate processing

  if (errors.length > 0) {
    validationResult.value = { valid: false, errors }
  } else {
    validationResult.value = { valid: true, message: `${productCount.value} 个商品、${rows.value.length} 个变体数据验证通过，可以导出或上传。` }
  }

  validating.value = false
}

// ─── Step 4: Export / Upload ───
const uploading = ref(false)
const uploadProgress = ref(0)
const uploadResult = ref(null)

function exportCSV() {
  // Build CSV with all Shopify columns
  const allCsvHeaders = allFields.map(f => f.key)
  const headerLine = allCsvHeaders.join(',')

  const csvRows = rows.value.map(row => {
    return allCsvHeaders.map(key => {
      const val = row[key] || ''
      // Escape CSV value
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`
      }
      return val
    }).join(',')
  })

  const csv = [headerLine, ...csvRows].join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `shopify_products_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

async function uploadToShopify() {
  if (uploading.value) return
  uploading.value = true
  uploadProgress.value = 0
  uploadResult.value = null

  // Group rows by Title into products
  const productMap = {}
  rows.value.forEach(row => {
    const title = row['Title'] || 'Untitled'
    if (!productMap[title]) {
      productMap[title] = {
        title,
        body_html: row['Body (HTML)'] || '',
        vendor: row['Vendor'] || '',
        product_type: row['Type'] || '',
        tags: row['Tags'] || '',
        status: row['Status'] || 'draft',
        option1_name: row['Option1 Name'] || undefined,
        option2_name: row['Option2 Name'] || undefined,
        option3_name: row['Option3 Name'] || undefined,
        variants: [],
        images: [],
      }
    }
    productMap[title].variants.push({
      option1: row['Option1 Value'] || 'Default Title',
      option2: row['Option2 Value'] || undefined,
      option3: row['Option3 Value'] || undefined,
      sku: row['Variant SKU'] || '',
      barcode: row['Variant Barcode'] || '',
      price: row['Variant Price'] || '0.00',
      compare_at_price: row['Variant Compare At Price'] || undefined,
      grams: row['Variant Grams'] || undefined,
      weight_unit: row['Variant Weight Unit'] || 'g',
      inventory_management: row['Variant Inventory Tracker'] || 'shopify',
      inventory_policy: row['Variant Inventory Policy'] || 'deny',
      fulfillment_service: row['Variant Fulfillment Service'] || 'manual',
      requires_shipping: row['Variant Requires Shipping'] !== 'false',
      taxable: row['Variant Taxable'] !== 'false',
      cost: row['Cost per item'] || undefined,
    })
    if (row['Image Src']) {
      productMap[title].images.push({
        src: row['Image Src'],
        alt: row['Image Alt Text'] || '',
        position: row['Image Position'] ? Number(row['Image Position']) : undefined,
      })
    }
  })

  const products = Object.values(productMap)

  // Simulate progress
  const progressInterval = setInterval(() => {
    if (uploadProgress.value < 90) uploadProgress.value += 10
  }, 500)

  try {
    const res = await api.post('/new-product/create', { products })
    uploadResult.value = res.data
    uploadProgress.value = 100
  } catch (err) {
    uploadResult.value = {
      data: [{ title: '上传失败', status: 'error', message: err.response?.data?.message || err.message }],
      summary: { created: 0, failed: products.length, total: products.length },
    }
    uploadProgress.value = 100
  } finally {
    clearInterval(progressInterval)
    uploading.value = false
  }
}

// ─── Navigation ───
function goToStep(step) {
  if (step === 1 && rows.value.length === 0) {
    // Initialize with one empty row
    addRow()
  }
  if (step === 2) {
    validateData()
  }
  currentStep.value = step
}
</script>

<style scoped>
.new-product-entry {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 16px;
}

/* Header */
.entry-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}
.back-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: white;
  color: #6b7280;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}
.back-btn:hover { border-color: #9333ea; color: #9333ea; }
.entry-title { font-size: 22px; font-weight: 700; color: #1f2937; }

/* Stepper */
.stepper {
  display: flex;
  align-items: center;
  margin-bottom: 32px;
  padding: 16px 24px;
  background: #f9fafb;
  border-radius: 12px;
}
.step {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}
.step-circle {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  background: #e5e7eb;
  color: #9ca3af;
  transition: all 0.3s;
  flex-shrink: 0;
}
.step.active .step-circle { background: #9333ea; color: white; }
.step.done .step-circle { background: #10b981; color: white; }
.step-label { font-size: 13px; color: #6b7280; white-space: nowrap; transition: all 0.3s; }
.step.active .step-label { color: #9333ea; font-weight: 600; }
.step.done .step-label { color: #10b981; }
.step-line {
  flex: 1;
  height: 2px;
  background: #e5e7eb;
  margin: 0 12px;
  transition: all 0.3s;
}
.step-line.filled { background: #10b981; }

/* Step Content */
.step-content { animation: slideIn 0.3s ease; }
.step-desc { margin-bottom: 20px; }
.step-desc h3 { font-size: 18px; font-weight: 600; color: #1f2937; margin-bottom: 4px; }
.step-desc p { font-size: 14px; color: #6b7280; }

/* Field Selection */
.field-categories { display: flex; flex-direction: column; gap: 20px; }
.cat-title { font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 8px; }
.field-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.field-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 20px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
}
.field-chip:hover { border-color: #9333ea; }
.field-chip.selected { background: #f3e8ff; border-color: #9333ea; color: #7c3aed; }
.field-chip.required { background: #fef3c7; border-color: #f59e0b; }
.field-chip.disabled { cursor: not-allowed; opacity: 0.8; }
.field-chip input { display: none; }
.chip-badge { font-size: 10px; background: #f59e0b; color: white; padding: 1px 5px; border-radius: 8px; }

/* Table */
.table-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.row-count { font-size: 13px; color: #9ca3af; margin-left: auto; }
.table-wrapper {
  overflow-x: auto;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  margin-bottom: 20px;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.data-table th, .data-table td {
  padding: 8px 10px;
  border-bottom: 1px solid #f3f4f6;
  text-align: left;
  white-space: nowrap;
}
.data-table th {
  background: #f9fafb;
  font-weight: 600;
  color: #374151;
  position: sticky;
  top: 0;
  z-index: 1;
}
.col-header { position: relative; }
.col-remove {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 16px;
  height: 16px;
  border: none;
  background: #ef4444;
  color: white;
  border-radius: 50%;
  font-size: 11px;
  cursor: pointer;
  display: none;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
.col-header:hover .col-remove { display: flex; }
.row-num { width: 36px; text-align: center; color: #9ca3af; }
.row-actions { width: 70px; text-align: center; }
.cell { min-width: 120px; position: relative; }
.cell-error { background: #fef2f2; }
.cell-input {
  width: 100%;
  padding: 4px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  font-size: 13px;
  transition: border-color 0.2s;
}
.cell-input:focus { border-color: #9333ea; outline: none; }
.cell-textarea { resize: vertical; min-height: 40px; }
.cell-error-tip {
  position: absolute;
  bottom: -14px;
  left: 10px;
  font-size: 10px;
  color: #ef4444;
}

/* Buttons */
.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  background: #9333ea;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-primary:hover { background: #7c3aed; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary {
  padding: 10px 20px;
  background: white;
  color: #374151;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-secondary:hover { border-color: #9333ea; color: #9333ea; }
.btn-outline {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: white;
  color: #6b7280;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-outline:hover { border-color: #9333ea; color: #9333ea; }
.btn-sm { padding: 5px 10px; font-size: 12px; }
.btn-icon {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  color: #6b7280;
  transition: all 0.2s;
}
.btn-icon:hover { background: #f3f4f6; }
.btn-icon.btn-danger:hover { background: #fef2f2; color: #ef4444; }
.step-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px; }

/* Validation */
.validate-loading { display: flex; align-items: center; gap: 12px; padding: 40px; justify-content: center; }
.spinner {
  width: 24px; height: 24px;
  border: 3px solid #e5e7eb;
  border-top-color: #9333ea;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.validate-result { text-align: center; padding: 40px 20px; }
.validate-success h4 { color: #10b981; font-size: 18px; margin: 12px 0 8px; }
.validate-success p { color: #6b7280; }
.validate-summary { margin-top: 12px; display: flex; gap: 20px; justify-content: center; font-size: 14px; color: #374151; }
.validate-errors h4 { color: #ef4444; font-size: 18px; margin: 12px 0 8px; }
.validate-errors p { color: #6b7280; margin-bottom: 12px; }
.error-list { text-align: left; max-width: 500px; margin: 0 auto; list-style: none; padding: 0; }
.error-list li { padding: 6px 0; border-bottom: 1px solid #fef2f2; font-size: 13px; color: #374151; }

/* Export */
.export-options { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
.export-card {
  padding: 32px 24px;
  border: 2px solid #e5e7eb;
  border-radius: 12px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s;
}
.export-card:hover { border-color: #9333ea; transform: translateY(-2px); box-shadow: 0 4px 12px rgba(147, 51, 234, 0.1); }
.export-card.uploading { pointer-events: none; opacity: 0.7; }
.export-icon { margin-bottom: 12px; }
.export-card h4 { font-size: 16px; font-weight: 600; color: #1f2937; margin-bottom: 8px; }
.export-card p { font-size: 13px; color: #6b7280; }
.upload-progress { margin-top: 12px; display: flex; align-items: center; gap: 8px; }
.progress-bar { flex: 1; height: 6px; background: #e5e7eb; border-radius: 3px; overflow: hidden; }
.progress-fill { height: 100%; background: #10b981; transition: width 0.3s; border-radius: 3px; }

/* Upload Result */
.upload-result { margin-bottom: 20px; }
.result-summary { padding: 12px 16px; border-radius: 8px; font-size: 14px; display: flex; gap: 16px; }
.result-summary.success { background: #ecfdf5; color: #065f46; }
.result-summary.partial { background: #fef3c7; color: #92400e; }
.result-item { padding: 8px 16px; border-bottom: 1px solid #f3f4f6; display: flex; justify-content: space-between; font-size: 13px; }
.result-item.created .result-status { color: #10b981; }
.result-item.error .result-status { color: #ef4444; }

/* Dialog */
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.dialog-box {
  background: white;
  border-radius: 12px;
  padding: 24px;
  max-width: 500px;
  width: 90%;
  max-height: 70vh;
  overflow-y: auto;
}
.dialog-box h3 { font-size: 18px; font-weight: 600; margin-bottom: 8px; }
.dialog-box p { font-size: 14px; color: #6b7280; margin-bottom: 16px; }
.dialog-fields { display: flex; flex-direction: column; gap: 4px; }
.dialog-field-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
  font-size: 13px;
}
.dialog-field-item:hover { background: #f3e8ff; }
.field-cat-tag { font-size: 11px; color: #9ca3af; background: #f3f4f6; padding: 2px 6px; border-radius: 4px; }
.dialog-actions { margin-top: 16px; display: flex; justify-content: flex-end; }

/* Transitions */
.slide-fade-enter-active { transition: all 0.3s ease; }
.slide-fade-leave-active { transition: all 0.2s ease; }
.slide-fade-enter-from { transform: translateX(20px); opacity: 0; }
.slide-fade-leave-to { transform: translateX(-20px); opacity: 0; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.row-fade-enter-active { transition: all 0.3s ease; }
.row-fade-leave-active { transition: all 0.2s ease; }
.row-fade-enter-from { opacity: 0; transform: translateY(-10px); }
.row-fade-leave-to { opacity: 0; transform: translateX(20px); }
@keyframes slideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
</style>
