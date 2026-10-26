<script setup>
import { ref, computed, onMounted } from 'vue'
import { isFavorite, toggleFavorite } from '@/services/modelCache'
import { isModelDownloadable as checkSkfbDownload } from '@/services/sketchfab'
import { isModelDownloadable as checkPhDowload } from '@/services/polyhaven'

const props = defineProps({
  model: { type: Object, required: true },
})

const emit = defineEmits(['preview', 'use', 'favorite-toggled'])

const imgError = ref(false)
const imgRetry = ref(0) // Track thumbnail fallback level
const favorited = ref(isFavorite(props.model.id))
const loading = ref(false)
const downloadChecked = ref(false)
const isDownloadable = ref(true) // Assume downloadable until proven otherwise

// Quality score styling
const scoreColor = computed(() => {
  const s = props.model.qualityScore || 0
  if (s >= 85) return '#2e7d32'
  if (s >= 70) return '#7BA891'
  return '#888'
})

const scoreLabel = computed(() => {
  const s = props.model.qualityScore || 0
  if (s >= 90) return '精品'
  if (s >= 80) return '优质'
  if (s >= 70) return '良好'
  return ''
})

// Thumbnail fallback chain
const displayThumb = computed(() => {
  if (!imgError.value || imgRetry.value === 0) return props.model.thumbnail || ''
  if (imgRetry.value === 1 && props.model.thumbnailMedium) return props.model.thumbnailMedium
  if (imgRetry.value === 2 && props.model.thumbnailSmall) return props.model.thumbnailSmall
  return '' // Signal to show placeholder
})

const licenseClass = computed(() => {
  const t = props.model.licenseType || 'CC-BY'
  return 'license-' + t.toLowerCase().replace(/[^a-z0-9]/g, '-')
})

function handleFavorite() {
  const newState = toggleFavorite(props.model.id)
  favorited.value = newState
  emit('favorite-toggled', { id: props.model.id, favorited: newState })
}

function handlePreview() {
  emit('preview', props.model)
}

async function handleUse() {
  if (loading.value || !isDownloadable.value) return
  loading.value = true
  emit('use', props.model)
}

function onImgError() {
  imgRetry.value++
  if (imgRetry.value > 2) {
    imgError.value = true
  }
  // Vue will reactively switch to next thumbnail source
}

// Pre-check download availability on mount (async, non-blocking)
onMounted(async () => {
  if (props.model.source === 'sketchfab') {
    try {
      const ok = await checkSkfbDownload(props.model.sourceId)
      isDownloadable.value = ok
    } catch {
      isDownloadable.value = false
    }
  } else if (props.model.source === 'polyhaven') {
    try {
      const ok = await checkPhDowload(props.model.sourceId)
      isDownloadable.value = ok
    } catch {
      isDownloadable.value = true // Poly Haven usually works
    }
  }
  downloadChecked.value = true
})

defineExpose({ setLoading: (v) => { loading.value = v } })
</script>

<template>
  <div class="model-card">
    <!-- Quality score badge -->
    <div v-if="model.qualityScore >= 70" class="quality-badge" :style="{ background: scoreColor }">
      {{ scoreLabel }} {{ model.qualityScore }}
    </div>

    <!-- Preview Image -->
    <div class="card-image" @click="handlePreview">
      <img
        v-if="!imgError || imgRetry < 3"
        :src="displayThumb"
        :alt="model.name"
        class="model-thumb"
        @error="onImgError"
        loading="lazy"
      />
      <div v-else class="model-placeholder">
        <span class="placeholder-icon">🏺</span>
      </div>
      <div class="image-overlay">
        <span class="overlay-text">点击预览</span>
      </div>
    </div>

    <!-- Info -->
    <div class="card-info">
      <div class="model-name" :title="model.name">{{ model.name }}</div>
      <div class="model-author" :title="model.author">
        by {{ model.author }}
      </div>
      <div class="model-meta">
        <span class="source-badge" :class="'source-' + model.source">
          {{ model.source === 'sketchfab' ? 'Sketchfab' : 'Poly Haven' }}
        </span>
        <span class="license-badge" :class="licenseClass">
          {{ model.licenseType || 'CC-BY' }}
        </span>
        <span v-if="model.faceCount" class="face-badge" :title="model.faceCount.toLocaleString() + ' 面'">
          {{ model.faceCount >= 1000 ? (model.faceCount / 1000).toFixed(1) + 'K' : model.faceCount }}面
        </span>
      </div>
    </div>

    <!-- Action Buttons -->
    <div class="card-actions">
      <button
        class="action-btn fav-btn"
        :class="{ active: favorited }"
        @click="handleFavorite"
        :title="favorited ? '取消收藏' : '收藏'"
      >
        <span v-if="favorited">❤️</span>
        <span v-else>🤍</span>
      </button>
      <button
        class="action-btn preview-btn"
        @click="handlePreview"
        title="360°预览"
      >
        👁️
      </button>
      <button
        v-if="isDownloadable"
        class="action-btn use-btn"
        :disabled="loading"
        @click="handleUse"
        :title="loading ? '下载中...' : '使用此模型'"
      >
        <span v-if="loading" class="btn-spinner"></span>
        <span v-else>📥</span>
      </button>
      <button
        v-else
        class="action-btn use-btn disabled"
        disabled
        title="暂不可用"
      >
        🚫
      </button>
    </div>
  </div>
</template>

<style scoped>
.model-card {
  width: 220px;
  min-height: 300px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  cursor: default;
  position: relative;
}

.model-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
}

/* Quality badge */
.quality-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 5;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.5px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.2);
}

.card-image {
  width: 220px;
  height: 180px;
  position: relative;
  background: #f5f5f5;
  cursor: pointer;
  overflow: hidden;
}

.model-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: opacity 0.3s ease;
}

.model-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f0e8d8, #e8dcc8);
}

.placeholder-icon {
  font-size: 48px;
  opacity: 0.5;
}

.image-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.card-image:hover .image-overlay {
  opacity: 1;
}

.overlay-text {
  color: #fff;
  font-size: 14px;
  font-weight: 500;
}

.card-info {
  padding: 10px 12px 6px;
  flex: 1;
}

.model-name {
  font-size: 14px;
  font-weight: 700;
  color: #3D2C1A;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-author {
  font-size: 12px;
  color: #888;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-meta {
  display: flex;
  gap: 6px;
  margin-top: 6px;
  flex-wrap: wrap;
}

.source-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
}

.source-sketchfab {
  background: #e8f0fe;
  color: #1a73e8;
}

.source-polyhaven {
  background: #e8f5e9;
  color: #2e7d32;
}

.license-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
}

.license-cc0 {
  background: #e8f5e9;
  color: #2e7d32;
}

.license-cc-by {
  background: #fff3e0;
  color: #e65100;
}

.license-cc-by-sa {
  background: #fce4ec;
  color: #c62828;
}

.face-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
  background: #f3e5f5;
  color: #7b1fa2;
}

.card-actions {
  display: flex;
  border-top: 1px solid #f0f0f0;
}

.action-btn {
  flex: 1;
  padding: 8px 0;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 18px;
  transition: background 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-btn:hover:not(:disabled) {
  background: #f5f5f5;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn.disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.fav-btn.active {
  background: #fff5f5;
}

.use-btn {
  border-left: 1px solid #f0f0f0;
}

.preview-btn {
  border-left: 1px solid #f0f0f0;
}

.btn-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid #ccc;
  border-top-color: #666;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  display: inline-block;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
