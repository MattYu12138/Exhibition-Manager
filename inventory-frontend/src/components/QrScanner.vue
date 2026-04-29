<template>
  <div class="qr-scanner-overlay" @click.self="$emit('close')">
    <div class="qr-scanner-modal">
      <!-- Header -->
      <div class="scanner-header">
        <span class="scanner-title">{{ t('inbound.scanToReceive') }}</span>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>

      <!-- Camera viewport -->
      <div class="scanner-viewport">
        <video ref="videoEl" class="scanner-video" autoplay playsinline muted></video>
        <canvas ref="canvasEl" class="scanner-canvas" style="display:none;"></canvas>
        <!-- Scan frame overlay -->
        <div class="scan-frame">
          <div class="corner tl"></div>
          <div class="corner tr"></div>
          <div class="corner bl"></div>
          <div class="corner br"></div>
          <div class="scan-line" :class="{ scanning: isScanning }"></div>
        </div>
        <!-- Status messages -->
        <div v-if="statusMsg" class="scanner-status">{{ statusMsg }}</div>
      </div>

      <!-- Controls -->
      <div class="scanner-controls">
        <button v-if="!isScanning && !cameraError" class="btn-start" @click="startCamera">
          {{ t('inbound.startCamera') }}
        </button>
        <button v-if="isScanning" class="btn-stop" @click="stopCamera">
          {{ t('inbound.stopCamera') }}
        </button>
        <div v-if="cameraError" class="error-msg">{{ cameraError }}</div>
        <!-- Manual token input fallback -->
        <div class="manual-input">
          <span class="manual-label">{{ t('inbound.orEnterManually') }}</span>
          <div class="manual-row">
            <input
              v-model="manualToken"
              class="manual-field"
              :placeholder="t('inbound.qrTokenPlaceholder')"
              @keyup.enter="submitManual"
            />
            <button class="btn-manual" @click="submitManual">{{ t('inbound.go') }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

const { t } = useI18n();
const router = useRouter();

const emit = defineEmits(['close', 'scanned']);

const videoEl = ref(null);
const canvasEl = ref(null);
const isScanning = ref(false);
const cameraError = ref('');
const statusMsg = ref('');
const manualToken = ref('');

let stream = null;
let animFrameId = null;
let jsQR = null;

// Lazy-load jsQR
async function loadJsQR() {
  if (!jsQR) {
    const mod = await import('jsqr');
    jsQR = mod.default;
  }
  return jsQR;
}

async function startCamera() {
  cameraError.value = '';
  statusMsg.value = '';
  try {
    // Request rear camera on mobile
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    videoEl.value.srcObject = stream;
    await videoEl.value.play();
    isScanning.value = true;
    statusMsg.value = t('inbound.scannerReady');
    await loadJsQR();
    scanFrame();
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      cameraError.value = t('inbound.cameraPermissionDenied');
    } else if (err.name === 'NotFoundError') {
      cameraError.value = t('inbound.cameraNotFound');
    } else {
      cameraError.value = `${t('inbound.cameraError')}: ${err.message}`;
    }
  }
}

function stopCamera() {
  if (animFrameId) cancelAnimationFrame(animFrameId);
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  isScanning.value = false;
  statusMsg.value = '';
}

function scanFrame() {
  if (!isScanning.value || !videoEl.value || videoEl.value.readyState < 2) {
    animFrameId = requestAnimationFrame(scanFrame);
    return;
  }

  const video = videoEl.value;
  const canvas = canvasEl.value;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: 'dontInvert',
  });

  if (code) {
    handleQrResult(code.data);
    return; // stop scanning after hit
  }

  animFrameId = requestAnimationFrame(scanFrame);
}

function handleQrResult(data) {
  stopCamera();
  statusMsg.value = t('inbound.qrDetected');

  // Extract token from URL or use raw value
  // Expected URL format: .../scan/:token  OR  .../receive/:token
  let token = data;
  try {
    const url = new URL(data);
    const parts = url.pathname.split('/');
    // find 'scan' or 'receive' segment and take the next part
    const scanIdx = parts.findIndex(p => p === 'scan' || p === 'receive');
    if (scanIdx !== -1 && parts[scanIdx + 1]) {
      token = parts[scanIdx + 1];
    } else {
      // fallback: last non-empty segment
      token = parts.filter(Boolean).pop() || data;
    }
  } catch {
    // not a URL — use raw value as token
  }

  emit('scanned', token);
  // Navigation is handled by the parent via @scanned event
}

function submitManual() {
  const raw = manualToken.value.trim();
  if (!raw) return;
  handleQrResult(raw);
}

onMounted(() => {
  // Auto-start camera when modal opens
  startCamera();
});

onUnmounted(() => {
  stopCamera();
});
</script>

<style scoped>
.qr-scanner-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.qr-scanner-modal {
  background: #fff;
  border-radius: 16px;
  overflow: hidden;
  width: min(480px, 96vw);
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0,0,0,0.4);
}

.scanner-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #e5e7eb;
}

.scanner-title {
  font-weight: 600;
  font-size: 16px;
  color: #111827;
}

.close-btn {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: #6b7280;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 0.15s;
}
.close-btn:hover { background: #f3f4f6; }

.scanner-viewport {
  position: relative;
  background: #000;
  aspect-ratio: 4/3;
  overflow: hidden;
}

.scanner-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.scanner-canvas {
  position: absolute;
  inset: 0;
}

.scan-frame {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.scan-frame::before {
  content: '';
  position: absolute;
  width: 60%;
  height: 60%;
  border: 2px solid rgba(255,255,255,0.3);
  border-radius: 4px;
}

.corner {
  position: absolute;
  width: 24px;
  height: 24px;
  border-color: #6366f1;
  border-style: solid;
}
.corner.tl { top: 20%; left: 20%; border-width: 3px 0 0 3px; }
.corner.tr { top: 20%; right: 20%; border-width: 3px 3px 0 0; }
.corner.bl { bottom: 20%; left: 20%; border-width: 0 0 3px 3px; }
.corner.br { bottom: 20%; right: 20%; border-width: 0 3px 3px 0; }

.scan-line {
  position: absolute;
  left: 20%;
  right: 20%;
  height: 2px;
  background: linear-gradient(90deg, transparent, #6366f1, transparent);
  top: 20%;
  transition: top 1.5s ease-in-out;
}
.scan-line.scanning {
  animation: scanMove 2s ease-in-out infinite;
}

@keyframes scanMove {
  0%   { top: 22%; }
  50%  { top: 76%; }
  100% { top: 22%; }
}

.scanner-status {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0,0,0,0.6);
  color: #fff;
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 13px;
  white-space: nowrap;
}

.scanner-controls {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.btn-start, .btn-stop {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}
.btn-start { background: #6366f1; color: #fff; }
.btn-stop  { background: #ef4444; color: #fff; }
.btn-start:hover, .btn-stop:hover { opacity: 0.85; }

.error-msg {
  color: #ef4444;
  font-size: 13px;
  text-align: center;
  padding: 8px;
  background: #fef2f2;
  border-radius: 8px;
}

.manual-input {
  border-top: 1px solid #f3f4f6;
  padding-top: 12px;
}

.manual-label {
  font-size: 12px;
  color: #9ca3af;
  display: block;
  margin-bottom: 8px;
  text-align: center;
}

.manual-row {
  display: flex;
  gap: 8px;
}

.manual-field {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
}
.manual-field:focus { border-color: #6366f1; }

.btn-manual {
  padding: 8px 16px;
  background: #111827;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}
.btn-manual:hover { opacity: 0.8; }
</style>
