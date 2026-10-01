<template>
  <main class="trace-page" :class="{ 'has-result': result || pendingProduct }">
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
    </header>

    <section class="hero" aria-label="Lummi in Colour product">
      <div class="hero-haze hero-haze-one"></div>
      <div class="hero-haze hero-haze-two"></div>
      <img class="hero-image" src="./assets/traceability-hero.jpg" alt="Lummi in Colour baby product" />
      <div class="hero-wash"></div>

      <div class="hero-copy">
        <p class="eyebrow">LUMMI IN COLOUR</p>
        <h1>{{ result ? copy.verifiedTitle : pendingProduct ? copy.identifiedHeroTitle : copy.heroTitle }}</h1>
        <p>{{ result ? copy.verifiedSubtitle : pendingProduct ? copy.identifiedHeroSubtitle : copy.heroSubtitle }}</p>
      </div>
    </section>

    <section class="content-shell" aria-live="polite">
      <div v-if="!result && !pendingProduct" class="search-card glass-card">
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

        <form class="search-form" novalidate @submit.prevent="lookup">
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
              pattern="[0-9]{8}"
              maxlength="8"
              :placeholder="copy.barcodePlaceholder"
              @focus="inputFocused = true"
              @blur="inputFocused = false"
            />
          </div>
          <button class="camera-button" type="button" :disabled="loading" @click="openScanner">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3l1.4-2h7.2L17 7h3v12H4V7Zm8 3.5a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4Z"/></svg>
            {{ copy.scanButton }}
          </button>
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

      <article v-else-if="pendingProduct" class="pending-card glass-card">
        <div class="result-topline">
          <div>
            <p class="card-kicker">{{ copy.traceabilityEnglish }}</p>
            <h2>{{ copy.productIdentified }}</h2>
          </div>
          <span class="pending-pill">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7v5l3 2M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9Z"/></svg>
            {{ copy.preparing }}
          </span>
        </div>

        <div class="product-identity">
          <span class="identity-label">{{ copy.productName }}</span>
          <strong>{{ pendingProduct.product_name }}</strong>
          <small v-if="pendingProduct.variant && pendingProduct.variant !== 'Default Title'">{{ pendingProduct.variant }}</small>
        </div>

        <dl class="trace-grid">
          <div class="trace-row">
            <dt>{{ copy.styleNumber }}</dt>
            <dd>{{ displayValue(pendingProduct.style_number) }}</dd>
          </div>
          <div class="trace-row">
            <dt>{{ copy.variant }}</dt>
            <dd>{{ displayValue(pendingProduct.variant) }}</dd>
          </div>
          <div class="trace-row">
            <dt>{{ copy.barcode }}</dt>
            <dd class="numeric">{{ displayValue(pendingProduct.barcode) }}</dd>
          </div>
        </dl>

        <div class="preparing-panel">
          <span class="preparing-icon" aria-hidden="true">i</span>
          <div>
            <strong>{{ copy.pendingTitle }}</strong>
            <p>{{ copy.pendingDescription }}</p>
          </div>
        </div>

        <div class="result-actions">
          <button class="secondary-button" type="button" @click="resetSearch">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>
            {{ copy.searchAnother }}
          </button>
          <a class="support-button" :href="supportLink">{{ copy.needHelp }}</a>
        </div>
      </article>

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

    <div v-if="scannerOpen" class="scanner-overlay" @click.self="closeScanner">
      <section class="scanner-dialog" role="dialog" aria-modal="true" aria-labelledby="scanner-title">
        <header class="scanner-heading">
          <div>
            <p class="card-kicker">PRODUCT TRACEABILITY</p>
            <h2 id="scanner-title">{{ copy.scannerTitle }}</h2>
          </div>
          <button type="button" class="scanner-close" :aria-label="copy.closeScanner" @click="closeScanner">&times;</button>
        </header>
        <div class="scanner-camera">
          <video ref="scannerVideo" autoplay muted playsinline :aria-label="copy.scannerTitle"></video>
          <span class="scanner-target" aria-hidden="true"></span>
        </div>
        <p class="scanner-help">{{ copy.scannerHelp }}</p>
        <p v-if="scannerError" class="scanner-error" role="alert">{{ scannerError }}</p>
        <button type="button" class="scanner-done" @click="closeScanner">{{ copy.closeScanner }}</button>
      </section>
    </div>
  </main>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import axios from 'axios'

const copy = {
  brandLine: 'Naturally considered essentials',
  heroTitle: 'Know the story behind every piece.',
  heroSubtitle: 'Enter the barcode on your Lummi in Colour product to view its origin, materials and certification details.',
  verifiedTitle: 'Made with care. Verified with clarity.',
  verifiedSubtitle: 'A transparent record of the materials and certification behind your product.',
  identifiedHeroTitle: 'Product found. Its story is coming soon.',
  identifiedHeroSubtitle: 'We identified your product and are preparing its detailed traceability record.',
  searchTitle: 'Trace your product',
  searchDescription: 'Find the barcode printed on the product label or packaging, then enter it below.',
  barcodeLabel: 'Product barcode',
  barcodePlaceholder: 'Enter 8-digit barcode',
  invalidBarcode: 'Please enter the 8-digit number printed below the barcode.',
  searchButton: 'View traceability',
  searching: 'Searching…',
  notFoundTitle: 'We could not verify this barcode',
  contactSupport: 'Contact customer care',
  privacyNote: 'Your search is used only to retrieve product information and improve this service.',
  scanButton: 'Scan with camera',
  scannerTitle: 'Scan product barcode',
  scannerHelp: 'Point the camera at the bars on your product label. The 8-digit number will be entered automatically.',
  scannerWrongCode: 'This is not an 8-digit product barcode. Try another label.',
  scannerUnavailable: 'The camera is unavailable. Please type the 8-digit number instead.',
  scannerPermission: 'Camera access was not granted. Allow access in your browser settings, or type the barcode.',
  closeScanner: 'Close camera',
  traceabilityEnglish: 'PRODUCT TRACEABILITY',
  traceabilityTitle: 'Product traceability',
  verified: 'Verified record',
  productIdentified: 'Product identified',
  preparing: 'Preparing',
  pendingTitle: 'Traceability details are being prepared',
  pendingDescription: 'The product has been identified successfully. Its origin, materials and certification details will appear here once published.',
  productName: 'Product name',
  styleNumber: 'Style number',
  variant: 'Product variant',
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
}

const barcode = ref('')
const loading = ref(false)
const inputFocused = ref(false)
const result = ref(null)
const pendingProduct = ref(null)
const error = ref('')
const supportEmail = ref('admin@lummiincolour.com.au')
const currentYear = new Date().getFullYear()
const scannerOpen = ref(false)
const scannerError = ref('')
const scannerVideo = ref(null)
let scannerControls = null
let scanSession = 0
const supportLink = computed(() => `mailto:${supportEmail.value}?subject=${encodeURIComponent('Product traceability enquiry')}`)

function closeScanner() {
  scanSession += 1
  scannerControls?.stop()
  scannerControls = null
  const video = scannerVideo.value
  if (video?.srcObject) {
    video.srcObject.getTracks().forEach(track => track.stop())
    video.srcObject = null
  }
  scannerOpen.value = false
  scannerError.value = ''
}

async function openScanner() {
  if (scannerOpen.value || loading.value) return
  const session = ++scanSession
  scannerOpen.value = true
  scannerError.value = ''
  await nextTick()
  if (!navigator.mediaDevices?.getUserMedia) {
    scannerError.value = copy.scannerUnavailable
    return
  }
  try {
    const [{ BrowserMultiFormatOneDReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
      import('@zxing/browser'), import('@zxing/library'),
    ])
    if (session !== scanSession || !scannerOpen.value) return
    const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.CODE_128, BarcodeFormat.EAN_8, BarcodeFormat.EAN_13, BarcodeFormat.UPC_A,
    ]]])
    const reader = new BrowserMultiFormatOneDReader(hints, { delayBetweenScanAttempts: 280 })
    const controls = await reader.decodeFromConstraints({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    }, scannerVideo.value, (scanResult) => {
      if (!scannerOpen.value || session !== scanSession || !scanResult) return
      const digits = String(scanResult.getText() || '').trim()
      if (!/^\d{8}$/.test(digits)) {
        scannerError.value = copy.scannerWrongCode
        return
      }
      barcode.value = digits
      closeScanner()
      lookup()
    })
    if (session !== scanSession || !scannerOpen.value) controls.stop()
    else scannerControls = controls
  } catch (err) {
    if (session === scanSession && scannerOpen.value) {
      scannerError.value = ['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(err?.name)
        ? copy.scannerPermission : copy.scannerUnavailable
    }
  }
}

function handleScannerVisibility() {
  if (document.hidden && scannerOpen.value) closeScanner()
}

function displayValue(value) {
  return value || copy.emptyValue
}

async function lookup() {
  const normalized = String(barcode.value || '').trim().replace(/\s+/g, '')
  if (loading.value) return
  if (!/^\d{8}$/.test(normalized)) {
    error.value = copy.invalidBarcode
    return
  }

  loading.value = true
  error.value = ''
  result.value = null
  pendingProduct.value = null
  try {
    const response = await axios.get('/api/public/traceability', {
      params: { barcode: normalized },
    })
    result.value = response.data.data
    supportEmail.value = response.data.support_email || supportEmail.value
    window.history.replaceState({}, '', `?barcode=${encodeURIComponent(normalized)}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  } catch (requestError) {
    const payload = requestError.response?.data
    supportEmail.value = payload?.support_email || supportEmail.value
    if (payload?.code === 'NOT_PUBLISHED' && payload?.data) {
      pendingProduct.value = payload.data
      error.value = ''
      window.history.replaceState({}, '', `?barcode=${encodeURIComponent(normalized)}`)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      error.value = payload?.message || 'The lookup service is temporarily unavailable. Please try again.'
    }
  } finally {
    loading.value = false
  }
}

function resetSearch() {
  result.value = null
  pendingProduct.value = null
  error.value = ''
  barcode.value = ''
  window.history.replaceState({}, '', window.location.pathname)
  requestAnimationFrame(() => document.getElementById('barcode')?.focus())
}

onMounted(() => {
  document.documentElement.lang = 'en'
  document.addEventListener('visibilitychange', handleScannerVisibility)
  const initialBarcode = new URLSearchParams(window.location.search).get('barcode')
  if (initialBarcode) {
    barcode.value = initialBarcode
    lookup()
  }
})
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', handleScannerVisibility)
  closeScanner()
})
</script>
