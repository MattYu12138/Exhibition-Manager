<template>
  <div class="new-product-entry">
    <!-- Header -->
    <div class="entry-header">
      <button class="back-btn" @click="$emit('close')">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        {{ t('newProduct.back') }}
      </button>
      <h2 class="entry-title">{{ t('newProduct.title') }}</h2>
    </div>

    <!-- Stepper -->
    <div class="stepper">
      <div v-for="(step, idx) in stepsLabels" :key="idx" class="step" :class="{ active: currentStep === idx, done: currentStep > idx }">
        <div class="step-circle">
          <svg v-if="currentStep > idx" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          <span v-else>{{ idx + 1 }}</span>
        </div>
        <span class="step-label">{{ step }}</span>
        <div v-if="idx < stepsLabels.length - 1" class="step-line" :class="{ filled: currentStep > idx }"></div>
      </div>
    </div>

    <!-- Step 1: Select Fields -->
    <transition name="slide-fade" mode="out-in">
      <div v-if="currentStep === 0" key="step0" class="step-content">
        <div class="step-desc">
          <h3>{{ t('newProduct.selectFieldsTitle') }}</h3>
          <p>{{ t('newProduct.selectFieldsDesc') }}</p>
        </div>
        <div class="field-categories">
          <div v-for="cat in fieldCategories" :key="cat.name" class="field-category">
            <h4 class="cat-title">{{ cat.name }}</h4>
            <div class="field-chips">
              <label
                v-for="field in cat.fields"
                :key="field.key"
                class="field-chip"
                :class="{ selected: selectedFields.includes(field.key), required: field.required, disabled: field.required || field.autoGenerate }"
              >
                <input
                  type="checkbox"
                  :checked="selectedFields.includes(field.key)"
                  :disabled="field.required || field.autoGenerate"
                  @change="toggleField(field.key)"
                />
                <span class="chip-text">{{ field.label }}</span>
                <span v-if="field.required" class="chip-badge">{{ t('newProduct.required') }}</span>
                <span v-if="field.autoGenerate" class="chip-badge chip-auto">Auto</span>
              </label>
            </div>
          </div>
        </div>
        <div class="step-actions">
          <button class="btn-primary" @click="goToStep(1)" :disabled="selectedFields.length === 0">
            {{ t('newProduct.nextFillData') }}
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>
    </transition>

    <!-- Step 2: Fill Data - Product Groups with Variants -->
    <transition name="slide-fade" mode="out-in">
      <div v-if="currentStep === 1" key="step1" class="step-content">
        <div class="step-desc">
          <h3>{{ t('newProduct.fillDataTitle') }}</h3>
          <p>{{ locale === 'zh' ? '每个商品可以有多个变体（Variants），点击商品行展开/折叠变体列表。' : 'Each product can have multiple variants. Click a product row to expand/collapse its variants.' }}</p>
        </div>

        <!-- Toolbar -->
        <div class="table-toolbar">
          <button class="btn-primary btn-sm" @click="addProduct">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            {{ locale === 'zh' ? '添加商品' : 'Add Product' }}
          </button>
          <button class="btn-outline btn-sm" @click="showAddColumnDialog = true">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            {{ t('newProduct.addColumn') }}
          </button>
          <span class="row-count">{{ products.length }} {{ locale === 'zh' ? '个商品' : 'product(s)' }}，{{ totalVariants }} {{ locale === 'zh' ? '个变体' : 'variant(s)' }}</span>
        </div>

        <!-- Product Groups -->
        <div class="product-list">
          <div v-for="(product, pIdx) in products" :key="product._id" class="product-group">
            <!-- Product Header Row -->
            <div class="product-row" :class="{ expanded: product._expanded, 'has-error': product._errors && Object.keys(product._errors).length > 0 }" @click="toggleProduct(pIdx)">
              <div class="product-row-left">
                <button class="expand-btn" :class="{ rotated: product._expanded }">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
                <span class="product-index">P{{ pIdx + 1 }}</span>
                <div class="product-title-area">
                  <input
                    class="product-title-input"
                    :class="{ 'input-error': product._errors && product._errors['Title'] }"
                    v-model="product['Title']"
                    :placeholder="locale === 'zh' ? '商品名称（必填）' : 'Product Title (required)'"
                    @click.stop
                  />
                  <span v-if="product._errors && product._errors['Title']" class="inline-error">{{ product._errors['Title'] }}</span>
                </div>
                <div class="product-meta-fields" @click.stop>
                  <input v-if="selectedProductFields.includes('Vendor')" v-model="product['Vendor']" class="meta-input" :placeholder="locale === 'zh' ? '品牌' : 'Vendor'" />
                  <input v-if="selectedProductFields.includes('Type')" v-model="product['Type']" class="meta-input" :placeholder="locale === 'zh' ? '类型' : 'Type'" />
                  <input v-if="selectedProductFields.includes('Tags')" v-model="product['Tags']" class="meta-input" :placeholder="locale === 'zh' ? '标签' : 'Tags'" />
                  <select v-if="selectedProductFields.includes('Status')" v-model="product['Status']" class="meta-input meta-select">
                    <option value="">Status</option>
                    <option value="active">active</option>
                    <option value="draft">draft</option>
                    <option value="archived">archived</option>
                  </select>
                </div>
              </div>
              <div class="product-row-right" @click.stop>
                <span class="variant-count-badge">{{ product.variants.length }} {{ locale === 'zh' ? '个变体' : 'variant(s)' }}</span>
                <button class="btn-icon btn-sm-icon" @click.stop="addVariant(pIdx)" :title="locale === 'zh' ? '添加变体' : 'Add Variant'">
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </button>
                <button class="btn-icon btn-danger btn-sm-icon" @click.stop="removeProduct(pIdx)" :title="locale === 'zh' ? '删除商品' : 'Remove Product'">
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
            </div>

            <!-- Handle preview -->
            <div v-if="product._expanded" class="handle-preview">
              <span class="handle-label">Handle:</span>
              <span class="handle-value">{{ generateHandle(product['Title']) || '—' }}</span>
              <span class="handle-hint">{{ t('newProduct.handleAutoGenerated') }}</span>
            </div>

            <!-- Variants Table (expanded) -->
            <transition name="expand">
              <div v-if="product._expanded" class="variants-wrapper">
                <table class="variants-table">
                  <thead>
                    <tr>
                      <th class="vth-num">#</th>
                      <th v-for="col in variantColumns" :key="col.key" class="vth">
                        <span>{{ col.label }}</span>
                        <span v-if="col.autoGenerate" class="handle-hint-sm">Auto</span>
                      </th>
                      <th class="vth-actions">{{ locale === 'zh' ? '操作' : 'Actions' }}</th>
                    </tr>
                  </thead>
                  <transition-group name="row-fade" tag="tbody">
                    <tr v-for="(variant, vIdx) in product.variants" :key="variant._id" class="variant-row">
                      <td class="vtd-num">{{ vIdx + 1 }}</td>
                      <td v-for="col in variantColumns" :key="col.key" class="vtd" :class="{ 'cell-error': variant._errors && variant._errors[col.key] }">
                        <input
                          v-if="col.autoGenerate"
                          :value="generateHandle(product['Title'])"
                          class="cell-input cell-readonly"
                          readonly
                        />
                        <select v-else-if="col.type === 'select'" v-model="variant[col.key]" class="cell-input">
                          <option value="">-- --</option>
                          <option v-for="opt in col.options" :key="opt" :value="opt">{{ opt }}</option>
                        </select>
                        <textarea v-else-if="col.type === 'textarea'" v-model="variant[col.key]" class="cell-input cell-textarea" rows="2"></textarea>
                        <input v-else v-model="variant[col.key]" class="cell-input" :placeholder="col.placeholder || ''" :type="col.type === 'number' ? 'number' : 'text'" />
                        <span v-if="variant._errors && variant._errors[col.key]" class="cell-error-tip">{{ variant._errors[col.key] }}</span>
                      </td>
                      <td class="vtd-actions">
                        <button class="btn-icon btn-sm-icon" @click="duplicateVariant(pIdx, vIdx)" :title="t('newProduct.duplicateRow')">
                          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        </button>
                        <button class="btn-icon btn-danger btn-sm-icon" @click="removeVariant(pIdx, vIdx)" :title="t('newProduct.deleteRow')" :disabled="product.variants.length <= 1">
                          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                      </td>
                    </tr>
                  </transition-group>
                </table>
                <button class="add-variant-btn" @click="addVariant(pIdx)">
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  {{ locale === 'zh' ? '添加变体' : 'Add Variant' }}
                </button>
              </div>
            </transition>
          </div>

          <!-- Empty state -->
          <div v-if="products.length === 0" class="empty-products">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            <p>{{ locale === 'zh' ? '还没有商品，点击上方"添加商品"开始录入' : 'No products yet. Click "Add Product" to start.' }}</p>
          </div>
        </div>

        <div class="step-actions">
          <button class="btn-secondary" @click="goToStep(0)">{{ t('newProduct.prevStep') }}</button>
          <button class="btn-primary" @click="goToStep(2)" :disabled="products.length === 0">
            {{ t('newProduct.nextValidate') }}
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>
    </transition>

    <!-- Step 3: Validate -->
    <transition name="slide-fade" mode="out-in">
      <div v-if="currentStep === 2" key="step2" class="step-content">
        <div class="step-desc">
          <h3>{{ t('newProduct.validateTitle') }}</h3>
          <p>{{ t('newProduct.validateDesc') }}</p>
        </div>
        <div v-if="validating" class="validate-loading">
          <div class="spinner"></div>
          <span>{{ t('newProduct.validating') }}</span>
        </div>
        <div v-else-if="validationResult" class="validate-result">
          <div v-if="validationResult.valid" class="validate-success">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <h4>{{ t('newProduct.validationPassed') }}</h4>
            <p>{{ validationResult.message }}</p>
            <div class="validate-summary">
              <span><strong>{{ products.length }}</strong> {{ t('newProduct.products') }}</span>
              <span><strong>{{ totalVariants }}</strong> {{ t('newProduct.variants') }}</span>
            </div>
          </div>
          <div v-else class="validate-errors">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            <h4>{{ t('newProduct.validationFailed') }}</h4>
            <p>{{ validationResult.errors.length }} {{ t('newProduct.errors') }}</p>
            <ul class="error-list">
              <li v-for="(err, i) in validationResult.errors" :key="i">
                <strong>{{ err.location }}</strong> — {{ err.field }}: {{ err.message }}
              </li>
            </ul>
          </div>
        </div>
        <div class="step-actions">
          <button class="btn-secondary" @click="goToStep(1)">{{ t('newProduct.backToEdit') }}</button>
          <button class="btn-primary" @click="goToStep(3)" :disabled="!validationResult || !validationResult.valid">
            {{ t('newProduct.nextExport') }}
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>
    </transition>

    <!-- Step 4: Export / Upload -->
    <transition name="slide-fade" mode="out-in">
      <div v-if="currentStep === 3" key="step3" class="step-content">
        <div class="step-desc">
          <h3>{{ t('newProduct.exportTitle') }}</h3>
          <p>{{ t('newProduct.exportDesc') }}</p>
        </div>
        <div class="export-options">
          <!-- Export CSV Card -->
          <div class="export-card" @click="exportCSV">
            <div class="export-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </div>
            <h4>{{ t('newProduct.exportCSV') }}</h4>
            <p>{{ t('newProduct.exportCSVDesc') }}</p>
          </div>
          <!-- Add to Shopify Card - shows confirm dialog first -->
          <div class="export-card" :class="{ uploading }" @click="showShopifyConfirm = true">
            <div class="export-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            </div>
            <h4>{{ uploading ? t('newProduct.uploading') : t('newProduct.addToShopify') }}</h4>
            <p>{{ t('newProduct.addToShopifyDesc') }}</p>
            <div v-if="uploading" class="upload-progress">
              <div class="progress-bar"><div class="progress-fill" :style="{ width: uploadProgress + '%' }"></div></div>
              <span>{{ uploadProgress }}%</span>
            </div>
          </div>
        </div>
        <!-- Upload Result -->
        <div v-if="uploadResult" class="upload-result">
          <div class="result-summary" :class="uploadResult.summary.failed > 0 ? 'partial' : 'success'">
            <span>{{ t('newProduct.uploadSuccess') }}: <strong>{{ uploadResult.summary.created }}</strong></span>
            <span v-if="uploadResult.summary.failed > 0">{{ t('newProduct.uploadFailed') }}: <strong>{{ uploadResult.summary.failed }}</strong></span>
          </div>
          <div v-for="(r, i) in uploadResult.data" :key="i" class="result-item" :class="r.status">
            <span class="result-title">{{ r.title }}</span>
            <span class="result-status">{{ r.status === 'created' ? '✓' : '✗ ' + r.message }}</span>
          </div>
        </div>
        <div class="step-actions">
          <button class="btn-secondary" @click="goToStep(2)">{{ t('newProduct.prevStep') }}</button>
          <button class="btn-primary" @click="$emit('close')">{{ t('newProduct.finish') }}</button>
        </div>
      </div>
    </transition>

    <!-- Add Column Dialog -->
    <transition name="fade">
      <div v-if="showAddColumnDialog" class="dialog-overlay" @click.self="showAddColumnDialog = false">
        <div class="dialog-box">
          <h3>{{ t('newProduct.addColumnTitle') }}</h3>
          <p>{{ t('newProduct.addColumnDesc') }}</p>
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
            <button class="btn-secondary" @click="showAddColumnDialog = false">{{ locale === 'zh' ? '关闭' : 'Close' }}</button>
          </div>
        </div>
      </div>
    </transition>

    <!-- Shopify Confirm Dialog -->
    <transition name="fade">
      <div v-if="showShopifyConfirm" class="dialog-overlay" @click.self="showShopifyConfirm = false">
        <div class="dialog-box dialog-confirm">
          <div class="confirm-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          </div>
          <h3>{{ locale === 'zh' ? '确认上传到 Shopify' : 'Confirm Upload to Shopify' }}</h3>
          <p class="confirm-desc">
            {{ locale === 'zh'
              ? `即将创建 ${products.length} 个商品（共 ${totalVariants} 个变体）到 Shopify，状态默认为 Draft（草稿）。确认后无法撤销，请确认数据无误。`
              : `You are about to create ${products.length} product(s) (${totalVariants} variant(s)) on Shopify. Status will default to Draft. This action cannot be undone.`
            }}
          </p>
          <div class="confirm-summary">
            <div class="confirm-stat">
              <span class="stat-num">{{ products.length }}</span>
              <span class="stat-label">{{ locale === 'zh' ? '个商品' : 'Products' }}</span>
            </div>
            <div class="confirm-stat">
              <span class="stat-num">{{ totalVariants }}</span>
              <span class="stat-label">{{ locale === 'zh' ? '个变体' : 'Variants' }}</span>
            </div>
          </div>
          <div class="dialog-actions">
            <button class="btn-secondary" @click="showShopifyConfirm = false">{{ locale === 'zh' ? '取消' : 'Cancel' }}</button>
            <button class="btn-success" @click="confirmUploadToShopify">
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              {{ locale === 'zh' ? '确认上传' : 'Confirm Upload' }}
            </button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import axios from 'axios'

const { t, locale } = useI18n()
const emit = defineEmits(['close'])

const api = axios.create({ baseURL: '/api', withCredentials: true })

// ─── Handle generation: Title → lowercase, spaces/special → hyphens ───
function generateHandle(title) {
  if (!title) return ''
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

// ─── All available fields ───
const allFields = [
  { key: 'Handle', label: 'Handle', category: '基本信息 / Basic', required: false, autoGenerate: true, type: 'text', isProductLevel: true },
  { key: 'Title', label: 'Title', category: '基本信息 / Basic', required: true, type: 'text', placeholder: 'Product title', isProductLevel: true },
  { key: 'Body (HTML)', label: 'Body (HTML)', category: '基本信息 / Basic', required: false, type: 'textarea', placeholder: 'Description (HTML)', isProductLevel: true },
  { key: 'Vendor', label: 'Vendor', category: '基本信息 / Basic', required: false, type: 'text', placeholder: 'Vendor', isProductLevel: true },
  { key: 'Product Category', label: 'Product Category', category: '基本信息 / Basic', required: false, type: 'text', placeholder: 'Category', isProductLevel: true },
  { key: 'Type', label: 'Type', category: '基本信息 / Basic', required: false, type: 'text', placeholder: 'Product type', isProductLevel: true },
  { key: 'Tags', label: 'Tags', category: '基本信息 / Basic', required: false, type: 'text', placeholder: 'tag1, tag2, ...', isProductLevel: true },
  { key: 'Published', label: 'Published', category: '基本信息 / Basic', required: false, type: 'select', options: ['true', 'false'], isProductLevel: true },
  { key: 'Status', label: 'Status', category: '基本信息 / Basic', required: false, type: 'select', options: ['active', 'draft', 'archived'], isProductLevel: true },
  { key: 'Option1 Name', label: 'Option1 Name', category: '选项 / Options', required: false, type: 'text', placeholder: 'Size', isProductLevel: true },
  { key: 'Option2 Name', label: 'Option2 Name', category: '选项 / Options', required: false, type: 'text', placeholder: 'Color', isProductLevel: true },
  { key: 'Option3 Name', label: 'Option3 Name', category: '选项 / Options', required: false, type: 'text', placeholder: 'Material', isProductLevel: true },
  { key: 'Option1 Value', label: 'Option1 Value', category: '选项 / Options', required: false, type: 'text', placeholder: 'S / M / L', isProductLevel: false },
  { key: 'Option2 Value', label: 'Option2 Value', category: '选项 / Options', required: false, type: 'text', placeholder: 'Red / Blue', isProductLevel: false },
  { key: 'Option3 Value', label: 'Option3 Value', category: '选项 / Options', required: false, type: 'text', placeholder: 'Cotton', isProductLevel: false },
  { key: 'Variant SKU', label: 'Variant SKU', category: '变体 / Variant', required: true, type: 'text', placeholder: 'SKU', isProductLevel: false },
  { key: 'Variant Grams', label: 'Variant Grams', category: '变体 / Variant', required: false, type: 'number', placeholder: 'Weight (g)', isProductLevel: false },
  { key: 'Variant Inventory Tracker', label: 'Variant Inventory Tracker', category: '变体 / Variant', required: false, type: 'select', options: ['shopify', ''], isProductLevel: false },
  { key: 'Variant Inventory Qty', label: 'Variant Inventory Qty', category: '变体 / Variant', required: false, type: 'number', placeholder: 'Qty', isProductLevel: false },
  { key: 'Variant Inventory Policy', label: 'Variant Inventory Policy', category: '变体 / Variant', required: false, type: 'select', options: ['deny', 'continue'], isProductLevel: false },
  { key: 'Variant Fulfillment Service', label: 'Variant Fulfillment Service', category: '变体 / Variant', required: false, type: 'select', options: ['manual'], isProductLevel: false },
  { key: 'Variant Price', label: 'Variant Price', category: '变体 / Variant', required: true, type: 'number', placeholder: 'Price', isProductLevel: false },
  { key: 'Variant Compare At Price', label: 'Variant Compare At Price', category: '变体 / Variant', required: false, type: 'number', placeholder: 'Compare price', isProductLevel: false },
  { key: 'Variant Requires Shipping', label: 'Variant Requires Shipping', category: '变体 / Variant', required: false, type: 'select', options: ['true', 'false'], isProductLevel: false },
  { key: 'Variant Taxable', label: 'Variant Taxable', category: '变体 / Variant', required: false, type: 'select', options: ['true', 'false'], isProductLevel: false },
  { key: 'Variant Barcode', label: 'Variant Barcode', category: '变体 / Variant', required: false, type: 'text', placeholder: 'GTIN/EAN/UPC', isProductLevel: false },
  { key: 'Variant Weight Unit', label: 'Variant Weight Unit', category: '变体 / Variant', required: false, type: 'select', options: ['g', 'kg', 'lb', 'oz'], isProductLevel: false },
  { key: 'Cost per item', label: 'Cost per item', category: '变体 / Variant', required: false, type: 'number', placeholder: 'Cost', isProductLevel: false },
  { key: 'Image Src', label: 'Image Src', category: '图片 / Image', required: false, type: 'text', placeholder: 'https://...', isProductLevel: true },
  { key: 'Image Position', label: 'Image Position', category: '图片 / Image', required: false, type: 'number', placeholder: '1', isProductLevel: true },
  { key: 'Image Alt Text', label: 'Image Alt Text', category: '图片 / Image', required: false, type: 'text', placeholder: 'Alt text', isProductLevel: true },
  { key: 'SEO Title', label: 'SEO Title', category: 'SEO', required: false, type: 'text', placeholder: 'SEO Title', isProductLevel: true },
  { key: 'SEO Description', label: 'SEO Description', category: 'SEO', required: false, type: 'textarea', placeholder: 'SEO Description', isProductLevel: true },
  { key: 'Wholesale AUD (excl GST) (product.metafields.custom.retail_aud)', label: 'Wholesale AUD', category: 'Metafields', required: false, type: 'number', placeholder: 'AUD', isProductLevel: true },
  { key: 'Retail EUR (product.metafields.custom.retail_eur)', label: 'Retail EUR', category: 'Metafields', required: false, type: 'number', placeholder: 'EUR', isProductLevel: true },
  { key: 'Retail GBP (product.metafields.custom.retail_gbp)', label: 'Retail GBP', category: 'Metafields', required: false, type: 'number', placeholder: 'GBP', isProductLevel: true },
  { key: 'Retail NZD (product.metafields.custom.retail_nzd)', label: 'Retail NZD', category: 'Metafields', required: false, type: 'number', placeholder: 'NZD', isProductLevel: true },
  { key: 'Retail SGD (product.metafields.custom.retail_sgd)', label: 'Retail SGD', category: 'Metafields', required: false, type: 'number', placeholder: 'SGD', isProductLevel: true },
  { key: 'Retail USD (product.metafields.custom.retail_usd)', label: 'Retail USD', category: 'Metafields', required: false, type: 'number', placeholder: 'USD', isProductLevel: true },
  { key: 'Included / Australia', label: 'Included / Australia', category: '市场 / Market', required: false, type: 'select', options: ['true', 'false'], isProductLevel: true },
  { key: 'Price / Australia', label: 'Price / Australia', category: '市场 / Market', required: false, type: 'number', isProductLevel: true },
  { key: 'Compare At Price / Australia', label: 'Compare At Price / Australia', category: '市场 / Market', required: false, type: 'number', isProductLevel: true },
]

// ─── Steps ───
const stepsLabels = computed(() => [
  t('newProduct.stepSelectFields'),
  t('newProduct.stepFillData'),
  t('newProduct.stepValidate'),
  t('newProduct.stepExport')
])
const currentStep = ref(0)

// ─── Step 1: Field Selection ───
const selectedFields = ref(['Handle', ...allFields.filter(f => f.required).map(f => f.key)])

const fieldCategories = computed(() => {
  const cats = {}
  allFields.forEach(f => {
    if (!cats[f.category]) cats[f.category] = { name: f.category, fields: [] }
    cats[f.category].fields.push(f)
  })
  return Object.values(cats)
})

function toggleField(key) {
  const field = allFields.find(f => f.key === key)
  if (field && (field.required || field.autoGenerate)) return
  const idx = selectedFields.value.indexOf(key)
  if (idx >= 0) selectedFields.value.splice(idx, 1)
  else selectedFields.value.push(key)
}

// ─── Computed: which fields go to product level vs variant level ───
const selectedProductFields = computed(() =>
  selectedFields.value.filter(key => {
    const f = allFields.find(f => f.key === key)
    return f && f.isProductLevel && !f.autoGenerate
  })
)

const variantColumns = computed(() =>
  selectedFields.value
    .map(key => allFields.find(f => f.key === key))
    .filter(f => f && !f.isProductLevel)
)

const availableFieldsToAdd = computed(() =>
  allFields.filter(f => !selectedFields.value.includes(f.key))
)

// ─── Step 2: Product + Variant data ───
const products = ref([])
const showAddColumnDialog = ref(false)
let idCounter = 0

const totalVariants = computed(() =>
  products.value.reduce((sum, p) => sum + p.variants.length, 0)
)

function createEmptyVariant() {
  const v = { _id: ++idCounter, _errors: null }
  allFields.filter(f => !f.isProductLevel).forEach(f => { v[f.key] = '' })
  return v
}

function createEmptyProduct() {
  const p = { _id: ++idCounter, _errors: null, _expanded: true, variants: [createEmptyVariant()] }
  allFields.filter(f => f.isProductLevel && !f.autoGenerate).forEach(f => { p[f.key] = '' })
  return p
}

function addProduct() {
  products.value.push(createEmptyProduct())
}

function removeProduct(pIdx) {
  products.value.splice(pIdx, 1)
}

function toggleProduct(pIdx) {
  products.value[pIdx]._expanded = !products.value[pIdx]._expanded
}

function addVariant(pIdx) {
  products.value[pIdx].variants.push(createEmptyVariant())
  products.value[pIdx]._expanded = true
}

function removeVariant(pIdx, vIdx) {
  if (products.value[pIdx].variants.length <= 1) return
  products.value[pIdx].variants.splice(vIdx, 1)
}

function duplicateVariant(pIdx, vIdx) {
  const src = products.value[pIdx].variants[vIdx]
  const newV = { ...src, _id: ++idCounter, _errors: null }
  products.value[pIdx].variants.splice(vIdx + 1, 0, newV)
}

function addColumn(key) {
  if (!selectedFields.value.includes(key)) {
    selectedFields.value.push(key)
    const field = allFields.find(f => f.key === key)
    if (field && !field.isProductLevel) {
      products.value.forEach(p => {
        p.variants.forEach(v => { if (!(key in v)) v[key] = '' })
      })
    } else if (field && field.isProductLevel) {
      products.value.forEach(p => { if (!(key in p)) p[key] = '' })
    }
  }
  showAddColumnDialog.value = false
}

// ─── Step 3: Validation ───
const validating = ref(false)
const validationResult = ref(null)

async function validateData() {
  validating.value = true
  validationResult.value = null

  const errors = []
  const allSkus = new Set()

  products.value.forEach((product, pIdx) => {
    product._errors = {}
    // Title required
    if (!product['Title'] || !product['Title'].trim()) {
      errors.push({ location: `Product ${pIdx + 1}`, field: 'Title', message: locale.value === 'zh' ? '商品标题不能为空' : 'Title is required' })
      product._errors['Title'] = locale.value === 'zh' ? '必填' : 'Required'
    }

    product.variants.forEach((variant, vIdx) => {
      variant._errors = {}
      // SKU required and unique
      if (selectedFields.value.includes('Variant SKU')) {
        if (!variant['Variant SKU'] || !variant['Variant SKU'].trim()) {
          errors.push({ location: `P${pIdx + 1} V${vIdx + 1}`, field: 'Variant SKU', message: locale.value === 'zh' ? 'SKU 不能为空' : 'SKU is required' })
          variant._errors['Variant SKU'] = locale.value === 'zh' ? '必填' : 'Required'
        } else if (allSkus.has(variant['Variant SKU'].trim())) {
          errors.push({ location: `P${pIdx + 1} V${vIdx + 1}`, field: 'Variant SKU', message: `SKU "${variant['Variant SKU']}" ${locale.value === 'zh' ? '重复' : 'duplicated'}` })
          variant._errors['Variant SKU'] = locale.value === 'zh' ? 'SKU 重复' : 'Duplicated'
        } else {
          allSkus.add(variant['Variant SKU'].trim())
        }
      }
      // Price must be number
      if (selectedFields.value.includes('Variant Price') && variant['Variant Price']) {
        if (isNaN(Number(variant['Variant Price']))) {
          errors.push({ location: `P${pIdx + 1} V${vIdx + 1}`, field: 'Variant Price', message: locale.value === 'zh' ? '价格必须为数字' : 'Must be a number' })
          variant._errors['Variant Price'] = locale.value === 'zh' ? '必须为数字' : 'Must be number'
        }
      }
      // Grams
      if (variant['Variant Grams'] && isNaN(Number(variant['Variant Grams']))) {
        errors.push({ location: `P${pIdx + 1} V${vIdx + 1}`, field: 'Variant Grams', message: locale.value === 'zh' ? '重量必须为数字' : 'Must be a number' })
        variant._errors['Variant Grams'] = locale.value === 'zh' ? '必须为数字' : 'Must be number'
      }
    })
  })

  await new Promise(r => setTimeout(r, 600))

  if (errors.length > 0) {
    validationResult.value = { valid: false, errors }
  } else {
    const msg = locale.value === 'zh'
      ? `${products.value.length} 个商品、${totalVariants.value} 个变体数据验证通过。`
      : `${products.value.length} product(s), ${totalVariants.value} variant(s) validated.`
    validationResult.value = { valid: true, message: msg }
  }

  validating.value = false
}

// ─── Step 4: Export / Upload ───
const uploading = ref(false)
const uploadProgress = ref(0)
const uploadResult = ref(null)
const showShopifyConfirm = ref(false)

function exportCSV() {
  // Build flat rows from products + variants (Shopify CSV format)
  const csvHeaders = allFields.map(f => f.key)
  const csvRows = []

  products.value.forEach(product => {
    const handle = generateHandle(product['Title'])
    product.variants.forEach((variant, vIdx) => {
      const row = {}
      allFields.forEach(f => {
        if (f.autoGenerate) {
          row[f.key] = handle
        } else if (f.isProductLevel) {
          // Only fill product-level fields on first variant row
          row[f.key] = vIdx === 0 ? (product[f.key] || '') : ''
        } else {
          row[f.key] = variant[f.key] || ''
        }
      })
      csvRows.push(row)
    })
  })

  const headerLine = csvHeaders.map(h => {
    if (h.includes(',') || h.includes('"')) return `"${h.replace(/"/g, '""')}"`
    return h
  }).join(',')

  const lines = csvRows.map(row =>
    csvHeaders.map(key => {
      const val = String(row[key] || '')
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`
      }
      return val
    }).join(',')
  )

  const csvContent = '\ufeff' + [headerLine, ...lines].join('\r\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  // Must append to DOM for Firefox/Safari compatibility
  const a = document.createElement('a')
  a.style.display = 'none'
  a.href = url
  a.download = `shopify_products_${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 200)
}

function confirmUploadToShopify() {
  showShopifyConfirm.value = false
  uploadToShopify()
}

async function uploadToShopify() {
  if (uploading.value) return
  uploading.value = true
  uploadProgress.value = 0
  uploadResult.value = null

  const productPayloads = products.value.map(product => ({
    title: product['Title'] || 'Untitled',
    handle: generateHandle(product['Title']),
    body_html: product['Body (HTML)'] || '',
    vendor: product['Vendor'] || '',
    product_type: product['Type'] || '',
    tags: product['Tags'] || '',
    status: product['Status'] || 'draft',
    option1_name: product['Option1 Name'] || undefined,
    option2_name: product['Option2 Name'] || undefined,
    option3_name: product['Option3 Name'] || undefined,
    images: product['Image Src'] ? [{ src: product['Image Src'], alt: product['Image Alt Text'] || '', position: product['Image Position'] ? Number(product['Image Position']) : undefined }] : [],
    variants: product.variants.map(v => ({
      option1: v['Option1 Value'] || 'Default Title',
      option2: v['Option2 Value'] || undefined,
      option3: v['Option3 Value'] || undefined,
      sku: v['Variant SKU'] || '',
      barcode: v['Variant Barcode'] || '',
      price: v['Variant Price'] || '0.00',
      compare_at_price: v['Variant Compare At Price'] || undefined,
      grams: v['Variant Grams'] || undefined,
      weight_unit: v['Variant Weight Unit'] || 'g',
      inventory_management: v['Variant Inventory Tracker'] || 'shopify',
      inventory_policy: v['Variant Inventory Policy'] || 'deny',
      fulfillment_service: v['Variant Fulfillment Service'] || 'manual',
      requires_shipping: v['Variant Requires Shipping'] !== 'false',
      taxable: v['Variant Taxable'] !== 'false',
      cost: v['Cost per item'] || undefined,
    })),
  }))

  const progressInterval = setInterval(() => {
    if (uploadProgress.value < 90) uploadProgress.value += 10
  }, 500)

  try {
    const res = await api.post('/new-product/create', { products: productPayloads })
    uploadResult.value = res.data
    uploadProgress.value = 100
  } catch (err) {
    uploadResult.value = {
      data: [{ title: locale.value === 'zh' ? '上传失败' : 'Upload failed', status: 'error', message: err.response?.data?.message || err.message }],
      summary: { created: 0, failed: productPayloads.length, total: productPayloads.length },
    }
    uploadProgress.value = 100
  } finally {
    clearInterval(progressInterval)
    uploading.value = false
  }
}

// ─── Navigation ───
function goToStep(step) {
  if (step === 1 && products.value.length === 0) {
    addProduct()
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
.step { display: flex; align-items: center; gap: 8px; flex: 1; }
.step-circle {
  width: 28px; height: 28px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: #e5e7eb; color: #9ca3af; font-size: 13px; font-weight: 600;
  transition: all 0.3s;
}
.step.active .step-circle { background: #9333ea; color: white; }
.step.done .step-circle { background: #10b981; color: white; }
.step-label { font-size: 13px; color: #6b7280; white-space: nowrap; }
.step.active .step-label { color: #9333ea; font-weight: 600; }
.step.done .step-label { color: #10b981; }
.step-line { flex: 1; height: 2px; background: #e5e7eb; margin: 0 8px; transition: background 0.3s; }
.step-line.filled { background: #10b981; }

/* Step content */
.step-content { animation: fadeIn 0.3s ease; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

.step-desc { margin-bottom: 20px; }
.step-desc h3 { font-size: 17px; font-weight: 600; color: #1f2937; margin: 0 0 6px; }
.step-desc p { font-size: 13px; color: #6b7280; margin: 0; }

/* Field selection */
.field-categories { display: flex; flex-direction: column; gap: 16px; }
.field-category { background: #f9fafb; border-radius: 10px; padding: 14px 16px; }
.cat-title { font-size: 13px; font-weight: 600; color: #374151; margin: 0 0 10px; }
.field-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.field-chip {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 10px; border-radius: 20px;
  border: 1.5px solid #e5e7eb; background: white;
  cursor: pointer; font-size: 12px; color: #374151;
  transition: all 0.2s; user-select: none;
}
.field-chip input { display: none; }
.field-chip.selected { border-color: #9333ea; background: #f3e8ff; color: #7c3aed; }
.field-chip.required { border-color: #f59e0b; background: #fffbeb; color: #92400e; cursor: default; }
.field-chip.disabled { opacity: 0.75; cursor: default; }
.chip-badge { font-size: 10px; padding: 1px 5px; border-radius: 4px; background: #fef3c7; color: #92400e; font-weight: 600; }
.chip-auto { background: #e0f2fe; color: #0369a1; }

/* Toolbar */
.table-toolbar {
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 16px; flex-wrap: wrap;
}
.row-count { font-size: 13px; color: #6b7280; margin-left: auto; }

/* Product List */
.product-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; }

.product-group {
  border: 1.5px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
  transition: border-color 0.2s;
}
.product-group:hover { border-color: #c4b5fd; }

.product-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px;
  background: #f8f7ff;
  cursor: pointer;
  transition: background 0.2s;
  gap: 12px;
}
.product-row:hover { background: #f3e8ff; }
.product-row.expanded { background: #ede9fe; border-bottom: 1.5px solid #c4b5fd; }
.product-row.has-error { background: #fef2f2; border-left: 3px solid #ef4444; }

.product-row-left { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
.product-row-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

.expand-btn {
  width: 22px; height: 22px; border: none; background: none;
  cursor: pointer; color: #7c3aed; padding: 0;
  display: flex; align-items: center; justify-content: center;
  transition: transform 0.25s ease;
  flex-shrink: 0;
}
.expand-btn.rotated { transform: rotate(90deg); }

.product-index {
  font-size: 12px; font-weight: 700; color: #7c3aed;
  background: #ede9fe; padding: 2px 7px; border-radius: 4px;
  flex-shrink: 0;
}

.product-title-area { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
.product-title-input {
  flex: 1; min-width: 0;
  border: 1.5px solid transparent; border-radius: 6px;
  padding: 5px 10px; font-size: 14px; font-weight: 600; color: #1f2937;
  background: transparent; outline: none; transition: all 0.2s;
}
.product-title-input:focus { border-color: #9333ea; background: white; }
.product-title-input.input-error { border-color: #ef4444; background: #fef2f2; }
.inline-error { font-size: 11px; color: #ef4444; white-space: nowrap; }

.product-meta-fields { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.meta-input {
  border: 1px solid #e5e7eb; border-radius: 5px;
  padding: 4px 8px; font-size: 12px; color: #374151;
  background: white; outline: none; width: 90px;
  transition: border-color 0.2s;
}
.meta-input:focus { border-color: #9333ea; }
.meta-select { width: 80px; }

.variant-count-badge {
  font-size: 11px; padding: 2px 8px; border-radius: 12px;
  background: #ddd6fe; color: #5b21b6; font-weight: 600;
}

/* Handle preview */
.handle-preview {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 14px; background: #f0fdf4;
  border-bottom: 1px solid #bbf7d0;
  font-size: 12px;
}
.handle-label { color: #6b7280; font-weight: 600; }
.handle-value { color: #059669; font-family: monospace; }
.handle-hint { color: #9ca3af; font-style: italic; }

/* Variants table */
.variants-wrapper {
  padding: 12px 14px 14px;
  background: white;
  overflow-x: auto;
}

.variants-table {
  width: 100%; border-collapse: collapse;
  font-size: 13px;
}
.vth-num, .vtd-num { width: 36px; text-align: center; color: #9ca3af; font-size: 12px; }
.vth {
  padding: 6px 8px; text-align: left;
  background: #f3f4f6; color: #374151; font-weight: 600;
  border-bottom: 2px solid #e5e7eb; white-space: nowrap;
  font-size: 12px;
}
.vth-actions { width: 70px; text-align: center; background: #f3f4f6; border-bottom: 2px solid #e5e7eb; }
.vtd { padding: 4px 6px; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
.vtd-actions { padding: 4px 6px; border-bottom: 1px solid #f3f4f6; text-align: center; }
.handle-hint-sm { font-size: 10px; color: #0369a1; background: #e0f2fe; padding: 1px 4px; border-radius: 3px; margin-left: 4px; }

.variant-row:hover td { background: #fafafa; }
.cell-error td { background: #fef2f2; }
.cell-input {
  width: 100%; border: 1px solid #e5e7eb; border-radius: 5px;
  padding: 4px 7px; font-size: 12px; color: #1f2937;
  background: white; outline: none; transition: border-color 0.2s;
  box-sizing: border-box;
}
.cell-input:focus { border-color: #9333ea; }
.cell-readonly { background: #f0fdf4; color: #059669; font-family: monospace; cursor: default; }
.cell-textarea { resize: vertical; min-height: 40px; }
.cell-error-tip { font-size: 10px; color: #ef4444; display: block; margin-top: 2px; }

.add-variant-btn {
  display: flex; align-items: center; gap: 5px;
  margin-top: 8px; padding: 5px 12px;
  border: 1.5px dashed #c4b5fd; border-radius: 6px;
  background: transparent; color: #7c3aed;
  font-size: 12px; cursor: pointer; transition: all 0.2s;
}
.add-variant-btn:hover { background: #f3e8ff; border-color: #9333ea; }

/* Empty state */
.empty-products {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 48px 24px; gap: 12px; color: #9ca3af;
}
.empty-products p { font-size: 14px; margin: 0; }

/* Validation */
.validate-loading { display: flex; align-items: center; gap: 12px; padding: 40px 0; justify-content: center; }
.spinner {
  width: 28px; height: 28px; border: 3px solid #e5e7eb;
  border-top-color: #9333ea; border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.validate-result { padding: 20px 0; }
.validate-success, .validate-errors {
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  padding: 32px; border-radius: 12px; text-align: center;
}
.validate-success { background: #f0fdf4; }
.validate-errors { background: #fef2f2; }
.validate-success h4 { color: #059669; font-size: 18px; margin: 0; }
.validate-errors h4 { color: #dc2626; font-size: 18px; margin: 0; }
.validate-summary { display: flex; gap: 24px; margin-top: 8px; }
.validate-summary span { font-size: 14px; color: #374151; }
.error-list { text-align: left; width: 100%; max-width: 500px; margin: 0; padding-left: 20px; }
.error-list li { font-size: 13px; color: #374151; margin-bottom: 4px; }

/* Export */
.export-options { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
.export-card {
  flex: 1; min-width: 220px; padding: 24px;
  border: 2px solid #e5e7eb; border-radius: 12px;
  background: white; cursor: pointer; text-align: center;
  transition: all 0.25s; display: flex; flex-direction: column; align-items: center; gap: 10px;
}
.export-card:hover { border-color: #9333ea; box-shadow: 0 4px 16px rgba(147,51,234,0.1); transform: translateY(-2px); }
.export-card.uploading { opacity: 0.7; cursor: not-allowed; }
.export-icon { display: flex; align-items: center; justify-content: center; }
.export-card h4 { font-size: 16px; font-weight: 600; color: #1f2937; margin: 0; }
.export-card p { font-size: 13px; color: #6b7280; margin: 0; }
.upload-progress { width: 100%; }
.progress-bar { width: 100%; height: 6px; background: #e5e7eb; border-radius: 3px; overflow: hidden; }
.progress-fill { height: 100%; background: #10b981; transition: width 0.4s ease; }

/* Upload result */
.upload-result { border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; margin-bottom: 20px; }
.result-summary {
  display: flex; gap: 16px; padding: 12px 16px;
  font-size: 14px; font-weight: 600;
}
.result-summary.success { background: #f0fdf4; color: #059669; }
.result-summary.partial { background: #fffbeb; color: #92400e; }
.result-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 16px; border-top: 1px solid #f3f4f6; font-size: 13px;
}
.result-item.created { color: #374151; }
.result-item.error { color: #dc2626; background: #fef2f2; }
.result-status { font-weight: 600; }

/* Confirm dialog */
.dialog-confirm { max-width: 420px; text-align: center; }
.confirm-icon { display: flex; justify-content: center; margin-bottom: 8px; }
.confirm-desc { font-size: 14px; color: #374151; line-height: 1.6; margin: 8px 0 16px; }
.confirm-summary { display: flex; gap: 24px; justify-content: center; margin-bottom: 20px; }
.confirm-stat { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.stat-num { font-size: 28px; font-weight: 700; color: #7c3aed; }
.stat-label { font-size: 12px; color: #6b7280; }

/* Dialog */
.dialog-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000; backdrop-filter: blur(2px);
}
.dialog-box {
  background: white; border-radius: 14px; padding: 24px;
  width: 90%; max-width: 560px; max-height: 80vh;
  overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.15);
}
.dialog-box h3 { font-size: 16px; font-weight: 700; color: #1f2937; margin: 0 0 8px; }
.dialog-box p { font-size: 13px; color: #6b7280; margin: 0 0 16px; }
.dialog-fields { display: flex; flex-direction: column; gap: 4px; max-height: 360px; overflow-y: auto; }
.dialog-field-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 12px; border-radius: 6px; cursor: pointer;
  font-size: 13px; color: #374151; transition: background 0.15s;
}
.dialog-field-item:hover { background: #f3e8ff; color: #7c3aed; }
.field-cat-tag { font-size: 11px; color: #9ca3af; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }

/* Buttons */
.btn-primary {
  display: flex; align-items: center; gap: 6px;
  padding: 9px 18px; border-radius: 8px; border: none;
  background: #9333ea; color: white; font-size: 14px; font-weight: 600;
  cursor: pointer; transition: all 0.2s;
}
.btn-primary:hover:not(:disabled) { background: #7c3aed; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary {
  padding: 9px 18px; border-radius: 8px;
  border: 1.5px solid #e5e7eb; background: white;
  color: #374151; font-size: 14px; font-weight: 500;
  cursor: pointer; transition: all 0.2s;
}
.btn-secondary:hover { border-color: #9ca3af; }
.btn-success {
  display: flex; align-items: center; gap: 6px;
  padding: 9px 18px; border-radius: 8px; border: none;
  background: #10b981; color: white; font-size: 14px; font-weight: 600;
  cursor: pointer; transition: all 0.2s;
}
.btn-success:hover { background: #059669; }
.btn-outline {
  display: flex; align-items: center; gap: 5px;
  padding: 7px 14px; border-radius: 7px;
  border: 1.5px solid #e5e7eb; background: white;
  color: #374151; font-size: 13px; cursor: pointer; transition: all 0.2s;
}
.btn-outline:hover { border-color: #9333ea; color: #9333ea; }
.btn-sm { padding: 6px 12px; font-size: 12px; }
.btn-icon {
  width: 28px; height: 28px; border: none; background: none;
  cursor: pointer; color: #6b7280; border-radius: 5px;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
}
.btn-icon:hover { background: #f3f4f6; color: #374151; }
.btn-icon.btn-danger:hover { background: #fef2f2; color: #ef4444; }
.btn-icon:disabled { opacity: 0.3; cursor: not-allowed; }
.btn-sm-icon { width: 24px; height: 24px; }

/* Step actions */
.step-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px; padding-top: 16px; border-top: 1px solid #f3f4f6; }

/* Transitions */
.slide-fade-enter-active { transition: all 0.3s ease; }
.slide-fade-leave-active { transition: all 0.2s ease; }
.slide-fade-enter-from { opacity: 0; transform: translateX(20px); }
.slide-fade-leave-to { opacity: 0; transform: translateX(-20px); }

.fade-enter-active, .fade-leave-active { transition: opacity 0.25s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.row-fade-enter-active { transition: all 0.25s ease; }
.row-fade-leave-active { transition: all 0.2s ease; }
.row-fade-enter-from { opacity: 0; transform: translateY(-8px); }
.row-fade-leave-to { opacity: 0; transform: translateY(8px); }

/* Expand/collapse animation */
.expand-enter-active { transition: all 0.3s ease; overflow: hidden; }
.expand-leave-active { transition: all 0.25s ease; overflow: hidden; }
.expand-enter-from { opacity: 0; max-height: 0; }
.expand-enter-to { opacity: 1; max-height: 2000px; }
.expand-leave-from { opacity: 1; max-height: 2000px; }
.expand-leave-to { opacity: 0; max-height: 0; }
</style>
