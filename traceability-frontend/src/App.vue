<template>
  <main class="trace-page" :class="{ 'has-result': result }">
    <header class="brand-bar">
      <a class="brand" href="/" aria-label="Lummi in Colour home">
        <span class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 44 44" role="img">
            <path d="M13 11.5 22 6l9 5.5v8.2c0 8.7-4.6 15-9 17.8-4.4-2.8-9-9.1-9-17.8Z" />
            <path d="M17.5 15.2c2.9 1.8 6.1 1.8 9 0M22 7v29" />
          </svg>
        </span>
        <span>
          <strong>LUMMI IN COLOUR</strong>
          <small>{{ copy.brandLine }}</small>
        </span>
      </a>
      <button class="lang-button" type="button" @click="toggleLanguage">
        {{ language === 'zh' ? 'EN' : '中文' }}
      </button>
    </header>

    <section class="hero" aria-label="Lummi in Colour product">
      <div class="hero-haze hero-haze-one"></div>
      <div class="hero-haze hero-haze-two"></div>
      <img class="hero-image" src="./assets/traceability-hero.jpg" alt="Lummi in Colour baby product" />
      <div class="hero-wash"></div>

      <div class="hero-copy">
        <p class="eyebrow">LUMMI IN COLOUR</p>
        <h1>{{ result ? copy.verifiedTitle : copy.heroTitle }}</h1>
        <p>{{ result ? copy.verifiedSubtitle : copy.heroSubtitle }}</p>
      </div>
    </section>

    <section class="content-shell" aria-live="polite">
      <div v-if="!result" class="search-card glass-card">
        <div class="card-heading">
          <span class="leaf-icon" aria-hidden="true">
            <svg viewBox="0 0 28 28"><path d="M23.5 4.5C14 4.8 7.8 8.6 6 15.2c-1.2 4.3 1.2 7.4 5.3 6.9 6.7-.8 10.7-7.1 12.2-17.6Z"/><path d="M6.1 22.8c2.7-5 6.8-8.7 12.1-11.1"/></svg>
          </span>
          <div>
            <p class="card-kicker">PRODUCT TRACEABILITY</p>
            <h2>{{ copy.searchTitle }}</h2>
          </div>
        </div>
        <p class="intro">{{ copy.searchDescription }}</p>

        <form class="search-form" @submit.prevent="lookup">
          <label for="barcode">{{ copy.barcodeLabel }}</label>
          <div class="input-wrap" :class="{ focused: inputFocused }">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5v14M6 5v14M10 5v14M13 5v14M18 5v14M21 5v14"/></svg>
            <input
              id="barcode"
              v-model.trim="barcode"
              type="text"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              inputmode="numeric"
              :placeholder="copy.barcodePlaceholder"
              @focus="inputFocused = true"
              @blur="inputFocused = false"
            />
          </div>
          <button class="primary-button" type="submit" :disabled="loading || !barcode">
            <span v-if="loading" class="spinner" aria-hidden="true"></span>
            <span>{{ loading ? copy.searching : copy.searchButton }}</span>
            <svg v-if="!loading" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
          </button>
        </form>

        <div v-if="error" class="message error-message" role="alert">
          <div class="message-icon">!</div>
          <div>
            <strong>{{ copy.notFoundTitle }}</strong>
            <p>{{ error }}</p>
            <a :href="supportLink">{{ copy.contactSupport }}</a>
          </div>
        </div>

        <p class="privacy-note">{{ copy.privacyNote }}</p>
      </div>

      <article v-else class="result-card glass-card">
        <div class="result-topline">
          <div>
            <p class="card-kicker">{{ copy.traceabilityEnglish }}</p>
            <h2>{{ copy.traceabilityTitle }}</h2>
          </div>
          <span class="verified-pill">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>
            {{ copy.verified }}
          </span>
        </div>

        <div class="product-identity">
          <span class="identity-label">{{ copy.productName }}</span>
          <strong>{{ result.product_name }}</strong>
          <small v-if="result.variant && result.variant !== 'Default Title'">{{ result.variant }}</small>
        </div>

        <dl class="trace-grid">
          <div class="trace-row">
            <dt>{{ copy.styleNumber }}</dt>
            <dd>{{ displayValue(result.style_number) }}</dd>
          </div>
          <div class="trace-row">
            <dt>{{ copy.barcode }}</dt>
            <dd class="numeric">{{ displayValue(result.barcode) }}</dd>
          </div>
          <div class="trace-row">
            <dt>{{ copy.batchNumber }}</dt>
            <dd>{{ displayValue(result.batch_no) }}</dd>
          </div>
          <div class="trace-row">
            <dt>{{ copy.fibreComposition }}</dt>
            <dd>{{ displayValue(result.fiber_composition) }}</dd>
          </div>
          <div class="trace-row">
            <dt>{{ copy.productionOrigin }}</dt>
            <dd>{{ displayValue(result.production_origin) }}</dd>
          </div>
        </dl>

        <div class="certification-panel">
          <div class="gots-seal" aria-hidden="true">
            <span>GOTS</span>
            <small>ORGANIC</small>
          </div>
          <div class="certificate-copy">
            <h3>{{ result.certification_standard || 'GOTS organic' }}</h3>
            <p>{{ copy.certifiedBy }} <strong>{{ displayValue(result.certifying_body) }}</strong></p>
            <p>{{ copy.licenceNumber }} <strong>{{ displayValue(result.licence_no) }}</strong></p>
          </div>
        </div>

        <a
          class="verification-link"
          :href="result.gots_verification_url"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span>{{ copy.verifyCertificate }}</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>
        </a>

        <div class="result-actions">
          <button class="secondary-button" type="button" @click="resetSearch">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>
            {{ copy.searchAnother }}
          </button>
          <a class="support-button" :href="supportLink">{{ copy.needHelp }}</a>
        </div>
      </article>
    </section>

    <footer>
      <span>© {{ currentYear }} Lummi in Colour</span>
      <a :href="supportLink">{{ copy.customerCare }}</a>
    </footer>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import axios from 'axios'

const translations = {
  en: {
    brandLine: 'Naturally considered essentials',
    heroTitle: 'Know the story behind every piece.',
    heroSubtitle: 'Enter the barcode on your Lummi in Colour product to view its origin, materials and certification details.',
    verifiedTitle: 'Made with care. Verified with clarity.',
    verifiedSubtitle: 'A transparent record of the materials and certification behind your product.',
    searchTitle: 'Trace your product',
    searchDescription: 'Find the barcode printed on the product label or packaging, then enter it below.',
    barcodeLabel: 'Product barcode',
    barcodePlaceholder: 'Enter barcode',
    searchButton: 'View traceability',
    searching: 'Searching…',
    notFoundTitle: 'We could not verify this barcode',
    contactSupport: 'Contact customer care',
    privacyNote: 'Your search is used only to retrieve product information and improve this service.',
    traceabilityEnglish: 'PRODUCT TRACEABILITY',
    traceabilityTitle: 'Product traceability',
    verified: 'Verified record',
    productName: 'Product name',
    styleNumber: 'Style number',
    barcode: 'Barcode',
    batchNumber: 'Product batch',
    fibreComposition: 'Fibre composition',
    productionOrigin: 'Made in',
    certifiedBy: 'Certified by',
    licenceNumber: 'Licence No.',
    verifyCertificate: 'Verify in the official GOTS database',
    searchAnother: 'Search another product',
    needHelp: 'Need help?',
    customerCare: 'Customer care',
    emptyValue: 'To be confirmed',
  },
  zh: {
    brandLine: '自然、安心、用心制作',
    heroTitle: '了解每一件产品背后的故事',
    heroSubtitle: '输入 Lummi in Colour 产品上的条码，查看产品来源、材质与认证信息。',
    verifiedTitle: '用心制作，清晰可溯',
    verifiedSubtitle: '透明呈现产品背后的材质、生产与认证信息。',
    searchTitle: '查询产品溯源',
    searchDescription: '请查找产品标签或包装上的条码，并在下方输入。',
    barcodeLabel: '产品条码',
    barcodePlaceholder: '请输入 Barcode',
    searchButton: '查询溯源信息',
    searching: '正在查询…',
    notFoundTitle: '暂时无法核验该条码',
    contactSupport: '联系客服',
    privacyNote: '查询信息仅用于获取产品资料及改善本服务。',
    traceabilityEnglish: 'PRODUCT TRACEABILITY',
    traceabilityTitle: '产品溯源',
    verified: '已核验记录',
    productName: '产品名称',
    styleNumber: '产品款号',
    barcode: '产品条码',
    batchNumber: '产品批次',
    fibreComposition: '纤维成分',
    productionOrigin: '生产地',
    certifiedBy: '认证机构',
    licenceNumber: '许可证编号',
    verifyCertificate: '前往 GOTS 官方数据库核验',
    searchAnother: '查询其他产品',
    needHelp: '需要帮助？',
    customerCare: '客户服务',
    emptyValue: '待确认',
  },
}

const language = ref(localStorage.getItem('trace-language') || (navigator.language?.startsWith('zh') ? 'zh' : 'en'))
const barcode = ref('')
const loading = ref(false)
const inputFocused = ref(false)
const result = ref(null)
const error = ref('')
const supportEmail = ref('admin@lummiincolour.com.au')
const currentYear = new Date().getFullYear()
const copy = computed(() => translations[language.value])
const supportLink = computed(() => `mailto:${supportEmail.value}?subject=${encodeURIComponent('Product traceability enquiry')}`)

function displayValue(value) {
  return value || copy.value.emptyValue
}

async function lookup() {
  const normalized = String(barcode.value || '').trim().replace(/\s+/g, '')
  if (!normalized || loading.value) return

  loading.value = true
  error.value = ''
  result.value = null
  try {
    const response = await axios.get('/api/public/traceability', {
      params: { barcode: normalized, lang: language.value },
    })
    result.value = response.data.data
    supportEmail.value = response.data.support_email || supportEmail.value
    window.history.replaceState({}, '', `?barcode=${encodeURIComponent(normalized)}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  } catch (requestError) {
    const payload = requestError.response?.data
    error.value = payload?.message || (language.value === 'zh' ? '查询暂时不可用，请稍后重试。' : 'The lookup service is temporarily unavailable. Please try again.')
    supportEmail.value = payload?.support_email || supportEmail.value
  } finally {
    loading.value = false
  }
}

function resetSearch() {
  result.value = null
  error.value = ''
  barcode.value = ''
  window.history.replaceState({}, '', window.location.pathname)
  requestAnimationFrame(() => document.getElementById('barcode')?.focus())
}

async function toggleLanguage() {
  language.value = language.value === 'zh' ? 'en' : 'zh'
  localStorage.setItem('trace-language', language.value)
  document.documentElement.lang = language.value === 'zh' ? 'zh-CN' : 'en'
  if (result.value && barcode.value) await lookup()
}

onMounted(() => {
  document.documentElement.lang = language.value === 'zh' ? 'zh-CN' : 'en'
  const initialBarcode = new URLSearchParams(window.location.search).get('barcode')
  if (initialBarcode) {
    barcode.value = initialBarcode
    lookup()
  }
})
</script>
