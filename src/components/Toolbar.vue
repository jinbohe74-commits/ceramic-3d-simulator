<script setup>
import { ref, watch, onMounted, nextTick, computed } from 'vue'
import { useCeramicStore } from '@/stores/ceramic'
import { useUserStore } from '@/stores/user'
import { useThemeStore, themes } from '@/stores/theme'
import { builtinPatterns, patternCategories, preloadAllPatterns, getPatternDataUrl as resolvePatternUrl } from '@/assets/patterns'
import { ElMessage, ElMessageBox } from 'element-plus'
import { removeBackground, reprocessBackground, floodFillFromPoint } from '@/utils/removeBackground'

const props = defineProps({
  onFire: Function,
  onScreenshot: Function,
  onResetView: Function,
  onFullscreen: Function,
  onSetView: Function,
})

const emit = defineEmits(['place-pattern'])

const ceramicStore = useCeramicStore()
const userStore = useUserStore()
const themeStore = useThemeStore()

// Text input with debounce
const textInput = ref(ceramicStore.patternText)
let debounceTimer = null
watch(textInput, (val) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => ceramicStore.setPatternText(val), 300)
})

// Uploaded patterns
const uploadedPatterns = ref([])
async function loadUploadedPatterns() {
  if (userStore.isLoggedIn) {
    uploadedPatterns.value = await userStore.getUserPatterns()
  }
}
onMounted(() => {
  loadUploadedPatterns()
  // 后台静默预缓存全部50款内置花纹纹理
  preloadAllPatterns()
})
watch(() => userStore.isLoggedIn, loadUploadedPatterns)

// ── 一键上釉色（20260602）20色传统釉色 ──
const glazeColors = [
  { name: '天青', hex: '#7EC8E3' },
  { name: '霁蓝', hex: '#2B4F8D' },
  { name: '郎窑红', hex: '#C43A3A' },
  { name: '粉青', hex: '#B4D8C8' },
  { name: '鹅黄', hex: '#F5D89A' },
  { name: '豇豆红', hex: '#D4878A' },
  { name: '乌金', hex: '#2C2C2C' },
  { name: '松石绿', hex: '#5B9A8B' },
  { name: '茄皮紫', hex: '#5C3A6B' },
  { name: '米白', hex: '#F5F0E8' },
  { name: '胭脂红', hex: '#C43A5A' },
  { name: '影青', hex: '#C8E0E0' },
  // ── 8款新增华丽窑变釉色 ──
  { name: '窑变钧红', hex: '#B82622' },
  { name: '祭红窑变', hex: '#991820' },
  { name: '窑变茄紫', hex: '#572663' },
  { name: '茶叶末釉', hex: '#595238' },
  { name: '胭脂窑变', hex: '#D95A76' },
  { name: '孔雀绿窑变', hex: '#247C6C' },
  { name: '铁锈花釉', hex: '#6B3C28' },
  { name: '洒蓝釉', hex: '#223B70' },
]

// 图案图片预加载缓存（Toolbar 层，用于提前加载图案）
const patternPreloadCache = new Map()

// ── 20260601 花纹分类浏览 ──
const activeCategory = ref('glaze')  // 当前选中的分类
const patternSearch = ref('')        // 搜索关键词
const recentPatterns = ref([])       // 最近使用的花纹ID列表

// 按分类过滤的花纹列表
const filteredPatterns = computed(() => {
  let list = builtinPatterns.filter(p => p.category === activeCategory.value)
  if (patternSearch.value.trim()) {
    const kw = patternSearch.value.trim().toLowerCase()
    list = list.filter(p => p.name.toLowerCase().includes(kw))
  }
  return list
})

// 搜索所有分类
const searchResults = computed(() => {
  if (!patternSearch.value.trim()) return []
  const kw = patternSearch.value.trim().toLowerCase()
  return builtinPatterns.filter(p => p.name.toLowerCase().includes(kw))
})

// 最近使用的花纹
const recentPatternList = computed(() => {
  return recentPatterns.value
    .map(id => builtinPatterns.find(p => p.id === id))
    .filter(Boolean)
    .slice(0, 10)
})

function recordRecentPattern(patternId) {
  recentPatterns.value = [patternId, ...recentPatterns.value.filter(id => id !== patternId)].slice(0, 10)
}

/* ═══════════ 背景去除相关状态 ═══════════ */
const bgRemoveVisible = ref(false)
const bgOriginalDataUrl = ref('')       // 原始图片 data URL
const bgProcessedDataUrl = ref('')      // 当前处理结果
const bgThreshold = ref(30)             // 阈值 0~100
const bgFileName = ref('')
const bgProcessing = ref(false)
const bgAlreadyTransparent = ref(false)  // 原图已有透明通道
const bgKeepWhite = ref(false)           // 保留白色主体
const bgProgress = ref(0)                // 处理进度 0~1
const bgQuality = ref(null)              // 质量检查结果 {valid, ratio, msg}
const bgOverrideColor = ref(null)
const bgPickingColor = ref(false)
const bgLastClickX = ref(0.5)          // 上次点击位置X（比例）
const bgLastClickY = ref(0.5)          // 上次点击位置Y（比例）

// ── 手动笔刷编辑状态 ──
const bgEditMode = ref(false)           // 是否进入手动编辑模式
const bgBrushMode = ref('erase')        // 'erase' | 'restore'
const bgBrushSize = ref(12)             // 笔刷大小
const bgEditCanvasRef = ref(null)       // 编辑canvas引用
const bgEditCtx = ref(null)             // 编辑canvas 2D context
const bgEditDrawing = ref(false)        // 是否正在绘制
const bgOriginalImageData = ref(null)   // 原始处理后图像数据（用于重置）

/**
 * 读取文件为 data URL（Promise 封装）
 */
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}

/**
 * 获取图片原始宽高
 */
function getImageSize(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.width, height: img.height })
    img.onerror = () => resolve({ width: 0, height: 0 })
    img.src = dataUrl
  })
}

/**
 * 等比缩放图片到最大尺寸，保持透明通道（不填充白色背景）
 * @param {string} dataUrl
 * @param {number} maxSize
 * @returns {Promise<string>} PNG data URL
 */
async function resizePreserveAlpha(dataUrl, maxSize = 2048) {
  const { width, height } = await getImageSize(dataUrl)
  if (width <= maxSize && height <= maxSize) return dataUrl

  let w = width, h = height
  if (w > h) {
    if (w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize }
  } else {
    if (h > maxSize) { w = Math.round(w * maxSize / h); h = maxSize }
  }

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  // 不填充白色，保留原始透明通道
  ctx.clearRect(0, 0, w, h)
  ctx.drawImage(await loadImage(dataUrl), 0, 0, w, h)
  return canvas.toDataURL('image/png')
}

/**
 * 加载图片（Promise 封装）
 */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = src
  })
}

/**
 * 压缩图片到指定最大尺寸，保持宽高比，输出 PNG（保留透明通道）
 * @param {File} file - 上传的图片文件
 * @param {number} maxSize - 最大宽/高（默认 2048）
 * @returns {Promise<string>} compressed base64 data URL
 */
function compressImage(file, maxSize = 2048) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target.result
      const img = new Image()
      img.onload = () => {
        let { width, height } = img
        if (width <= maxSize && height <= maxSize) {
          resolve(dataUrl)
          return
        }
        if (width > height) {
          if (width > maxSize) { height = Math.round(height * maxSize / width); width = maxSize }
        } else {
          if (height > maxSize) { width = Math.round(width * maxSize / height); height = maxSize }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/png'))
      }
      img.onerror = () => {
        console.warn('[Toolbar] 图片压缩加载失败，使用原始文件')
        resolve(dataUrl)
      }
      img.src = dataUrl
    }
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}

/**
 * 预加载图案图片到缓存
 */
function preloadPatternImage(dataUrl) {
  if (!dataUrl || patternPreloadCache.has(dataUrl)) return
  const img = new Image()
  img.onload = () => { patternPreloadCache.set(dataUrl, img) }
  img.onerror = () => { console.warn('[Toolbar] 图案预加载失败') }
  img.src = dataUrl
}

/* ═══════════ 背景去除流程 ═══════════ */

/**
 * 保存最终结果到图案库
 * @param {string} finalDataUrl
 */
async function savePatternToDB(finalDataUrl) {
  const result = await userStore.uploadPattern(bgFileName.value, finalDataUrl)
  if (result && result.success) {
    ElMessage.success('图案上传成功')
    await loadUploadedPatterns()
  } else if (result) {
    ElMessage.warning(result.message || '上传失败')
  }
}

/** 保存处理后的图案（用户点击「应用」） */
async function applyBgResult() {
  if (!bgProcessedDataUrl.value) return
  bgProcessing.value = true
  try {
    await savePatternToDB(bgProcessedDataUrl.value)
    bgRemoveVisible.value = false
  } catch (err) {
    console.error('[Toolbar] 背景去除保存失败', err)
    ElMessage.error('保存失败，请重试')
  }
  bgProcessing.value = false
}

/** 调整阈值重新洪泛 */
async function reprocessBg() {
  if (!bgOriginalDataUrl.value) return
  bgProcessing.value = true
  try {
    const result = await floodFillFromPoint(bgOriginalDataUrl.value, bgLastClickX.value, bgLastClickY.value, bgThreshold.value)
    bgProcessedDataUrl.value = result
  } catch (err) {
    ElMessage.error('处理失败')
  }
  bgProcessing.value = false
}

/* ═══════════ 手动笔刷编辑 ═══════════ */

/** 进入手动编辑模式 */
async function enterEditMode() {
  if (!bgProcessedDataUrl.value) return
  bgEditMode.value = true
  await nextTick()
  try { initEditCanvas() } catch (e) { console.warn('Edit canvas init failed:', e) }
}

/** 退出编辑模式 */
function exitEditMode() {
  bgEditMode.value = false
  bgEditDrawing.value = false
}

/** 编辑canvas就绪后初始化 */
function initEditCanvas() {
  const canvas = bgEditCanvasRef.value
  if (!canvas || !bgProcessedDataUrl.value) return
  const img = new Image()
  img.onload = () => {
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0)
    bgEditCtx.value = ctx
    // 保存原始数据用于重置
    bgOriginalImageData.value = ctx.getImageData(0, 0, canvas.width, canvas.height)
  }
  img.src = bgProcessedDataUrl.value
}

/** 笔刷绘制开始 */
function onBrushStart(e) {
  if (!bgEditCtx.value) return
  bgEditDrawing.value = true
  const pos = getCanvasPos(e)
  drawBrush(pos.x, pos.y)
}

/** 笔刷绘制移动 */
function onBrushMove(e) {
  if (!bgEditDrawing.value || !bgEditCtx.value) return
  const pos = getCanvasPos(e)
  drawBrush(pos.x, pos.y)
}

/** 笔刷绘制结束 */
function onBrushEnd() {
  if (!bgEditDrawing.value) return
  bgEditDrawing.value = false
  // 更新处理结果
  if (bgEditCanvasRef.value) {
    bgProcessedDataUrl.value = bgEditCanvasRef.value.toDataURL('image/png')
  }
}

/** 获取canvas相对坐标 */
function getCanvasPos(e) {
  const canvas = bgEditCanvasRef.value
  if (!canvas) return { x: 0, y: 0 }
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  }
}

/** 绘制笔刷圆点 */
function drawBrush(x, y) {
  const ctx = bgEditCtx.value
  if (!ctx) return
  const r = bgBrushSize.value
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  if (bgBrushMode.value === 'erase') {
    // 擦除：设置alpha为0（透明）
    ctx.globalCompositeOperation = 'destination-out'
  } else {
    // 恢复：从原始数据恢复
    ctx.globalCompositeOperation = 'source-over'
    if (bgOriginalImageData.value) {
      const iw = ctx.canvas.width
      const od = bgOriginalImageData.value
      // 从原始图像数据复制笔刷区域
      ctx.putImageData(od, 0, 0)
      ctx.globalCompositeOperation = 'destination-in'
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
      // 重新绘制原始区域
      ctx.save()
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.clip()
      ctx.putImageData(od, 0, 0)
      ctx.restore()
      return
    }
  }
  ctx.fill()
}

/** 一键反选：保留→透明互换 */
function invertSelection() {
  if (!bgEditCtx.value) return
  const ctx = bgEditCtx.value
  const w = ctx.canvas.width, h = ctx.canvas.height
  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data
  for (let i = 3; i < data.length; i += 4) {
    data[i] = 255 - data[i]
  }
  ctx.putImageData(imageData, 0, 0)
  bgProcessedDataUrl.value = bgEditCanvasRef.value.toDataURL('image/png')
}

/** 重置编辑 */
function resetEdit() {
  if (!bgEditCtx.value || !bgOriginalImageData.value) return
  bgEditCtx.value.putImageData(bgOriginalImageData.value, 0, 0)
  bgProcessedDataUrl.value = bgEditCanvasRef.value.toDataURL('image/png')
}

/** 进入颜色拾取模式 */
function initColorPicker() {
  bgPickingColor.value = true
  bgOverrideColor.value = null
  ElMessage.info('请点击预览图中的背景区域选择颜色')
}

/** 点击图片背景区域 → 洪泛填充去除 */
async function pickColorFromPreview(event) {
  if (!bgOriginalDataUrl.value) return
  const img = event.target
  const rect = img.getBoundingClientRect()
  const xRel = (event.clientX - rect.left) / rect.width
  const yRel = (event.clientY - rect.top) / rect.height
  if (xRel < 0 || xRel > 1 || yRel < 0 || yRel > 1) return

  bgLastClickX.value = xRel
  bgLastClickY.value = yRel
  bgProcessing.value = true
  try {
    const result = await floodFillFromPoint(bgOriginalDataUrl.value, xRel, yRel, bgThreshold.value)
    bgProcessedDataUrl.value = result
    ElMessage.success('背景已去除')
  } catch (err) {
    ElMessage.error('处理失败')
  }
  bgProcessing.value = false
}

/**
 * 主上传处理器：集成背景去除流程
 */
async function handleUpload(event) {
  const file = event.target.files[0]
  event.target.value = '' // 立即重置 input
  if (!file) return
  if (file.size > 10 * 1024 * 1024) {
    ElMessage.warning('图案文件不能超过10MB')
    return
  }

  // 1. 读取并压缩（保持透明通道）
  let preparedDataUrl
  try {
    const rawDataUrl = await readFileAsDataURL(file)
    preparedDataUrl = await resizePreserveAlpha(rawDataUrl, 4096) // 最大 4096
    // 如果超过 4096，再压缩到 2048 并填充白色（常规压缩流程）
    const { width, height } = await getImageSize(preparedDataUrl)
    if (width > 4096 || height > 4096) {
      // 超过4096的图片强制缩放到2048再进行背景去除
      preparedDataUrl = await compressImage(file, 2048)
    }
  } catch (err) {
    console.error('[Toolbar] 图片预处理失败', err)
    ElMessage.error('图片读取失败')
    return
  }

  // 2. 显示原图 → 用户点击背景区域去除
  bgFileName.value = file.name
  bgOriginalDataUrl.value = preparedDataUrl
  bgProcessedDataUrl.value = preparedDataUrl // 初始显示原图
  bgThreshold.value = 25
  bgQuality.value = null
  bgOverrideColor.value = null
  bgKeepWhite.value = false
  bgProgress.value = 0
  bgRemoveVisible.value = true
  ElMessage.success('请点击图片中的背景区域去除背景')
}

/**
 * 统一获取图案的 dataUrl
 * 优先从延迟缓存取，兼容内置花纹(_gen)和上传图案(base64)
 */
function getPatternDataUrl(pattern) {
  return resolvePatternUrl(pattern) || pattern.base64 || null
}

/**
 * 确保图案 dataUrl 包含正确的 MIME 类型前缀
 * FileReader.readAsDataURL / canvas.toDataURL 已经包含正确前缀，
 * 此处仅做兜底校验
 */
function normalizeDataUrl(dataUrl) {
  if (!dataUrl) return dataUrl
  // 如果已经有合法前缀则直接返回
  if (dataUrl.startsWith('data:image/')) return dataUrl
  // 如果是裸 base64，添加 PNG 前缀
  if (/^[A-Za-z0-9+/=]+$/.test(dataUrl)) {
    return 'data:image/png;base64,' + dataUrl
  }
  return dataUrl
}

// Apply builtin pattern - sets pending pattern with source info for restore
function applyBuiltinPattern(pattern) {
  const dataUrl = normalizeDataUrl(getPatternDataUrl(pattern))
  if (dataUrl) {
    preloadPatternImage(dataUrl)
    ceramicStore.setPendingPattern(dataUrl, 'builtin', pattern.id)
    recordRecentPattern(pattern.id)
  }
}

// Apply uploaded pattern - sets pending pattern with source info for restore
function applyUploadedPattern(pattern) {
  const dataUrl = normalizeDataUrl(getPatternDataUrl(pattern))
  if (dataUrl) {
    preloadPatternImage(dataUrl)
    ceramicStore.setPendingPattern(dataUrl, 'upload', pattern.id)
  }
}

// Drag-and-drop support — 携带来源信息便于复原时分类查找
function onPatternDragStart(event, pattern) {
  const dataUrl = normalizeDataUrl(getPatternDataUrl(pattern))
  if (!dataUrl) return
  // 内置花纹(_gen) vs 上传图案(base64)
  const source = pattern._gen || pattern.dataUrl ? 'builtin' : 'upload'
  const sourceId = pattern.id
  ceramicStore.setPendingPattern(dataUrl, source, sourceId)
  event.dataTransfer.setData('text/plain', dataUrl)
  event.dataTransfer.effectAllowed = 'copy'
}

// Delete uploaded pattern
async function deleteUploadedPattern(id) {
  await userStore.deletePattern(id)
  await loadUploadedPatterns()
}

/** 获取当前选中图案的表面类型 */
function getSelectedPatternSurface() {
  if (!ceramicStore.selectedPatternId) return 'outer'
  const pat = ceramicStore.attachedPatterns.find(p => p.id === ceramicStore.selectedPatternId)
  return pat?.surfaceType || 'outer'
}

/** 获取选中图案的当前透明度，无选中时返回默认值 */
function getSelectedPatternOpacity() {
  if (!ceramicStore.selectedPatternId) return ceramicStore.patternAttachOpacity
  const pat = ceramicStore.attachedPatterns.find(p => p.id === ceramicStore.selectedPatternId)
  return pat ? (pat.opacity !== undefined ? pat.opacity : ceramicStore.patternAttachOpacity) : ceramicStore.patternAttachOpacity
}

/** 更新选中图案的透明度，同步更新默认值 */
function updateSelectedPatternOpacity(val) {
  ceramicStore.setPatternAttachOpacity(val)
  if (ceramicStore.selectedPatternId) {
    ceramicStore.updateAttachedPattern(ceramicStore.selectedPatternId, { opacity: val })
  }
}

/** 获取选中图案的当前缩放值，无选中时返回默认值 */
function getSelectedPatternScale() {
  if (!ceramicStore.selectedPatternId) return ceramicStore.patternScale
  const pat = ceramicStore.attachedPatterns.find(p => p.id === ceramicStore.selectedPatternId)
  return pat ? (pat.scale !== undefined ? pat.scale : ceramicStore.patternScale) : ceramicStore.patternScale
}

/** 更新选中图案的缩放，同步更新默认值 */
function updateSelectedPatternScale(val) {
  ceramicStore.setPatternScale(val)
  if (ceramicStore.selectedPatternId) {
    ceramicStore.updateAttachedPattern(ceramicStore.selectedPatternId, { scale: val })
  }
}

/** 获取选中图案的当前旋转角度（度），无选中时返回默认值 */
function getSelectedPatternRotationDeg() {
  if (!ceramicStore.selectedPatternId) {
    return ceramicStore.patternRotation * 180 / Math.PI
  }
  const pat = ceramicStore.attachedPatterns.find(p => p.id === ceramicStore.selectedPatternId)
  return pat ? (pat.rotation || 0) * 180 / Math.PI : ceramicStore.patternRotation * 180 / Math.PI
}

/** 更新选中图案的旋转角度（度），同步更新默认值 */
function updateSelectedPatternRotation(deg) {
  const rad = deg * Math.PI / 180
  ceramicStore.setPatternRotation(rad)
  if (ceramicStore.selectedPatternId) {
    ceramicStore.updateAttachedPattern(ceramicStore.selectedPatternId, { rotation: rad })
  }
}

/** 微调选中图案在UV空间的位置 */
function nudgePattern(dir, event) {
  if (!ceramicStore.selectedPatternId) {
    ElMessage.info('请先选中一个图案')
    return
  }
  const pat = ceramicStore.attachedPatterns.find(p => p.id === ceramicStore.selectedPatternId)
  if (!pat || !pat.uv) return
  // Ctrl=精细(0.002), 普通=快速(0.008)
  // UV方向修正：U增大→左移、V增大→下移，因此按键逻辑反置
  const step = event.ctrlKey ? 0.002 : 0.008
  const delta = { x: 0, y: 0 }
  switch (dir) {
    case 'left':  delta.x = +step; break   // U增大 → 左移
    case 'right': delta.x = -step; break   // U减小 → 右移
    case 'up':    delta.y = -step; break   // V减小 → 上移
    case 'down':  delta.y = +step; break   // V增大 → 下移
  }
  ceramicStore.updateAttachedPattern(pat.id, {
    uv: { u: Math.max(0, Math.min(1, pat.uv.u + delta.x)), v: Math.max(0, Math.min(1, pat.uv.v + delta.y)) }
  })
}

/** 删除当前选中的贴附图案 */
function deleteSelectedPattern() {
  if (!ceramicStore.selectedPatternId) return
  ceramicStore.removeAttachedPattern(ceramicStore.selectedPatternId)
}
</script>

<template>
  <aside class="toolbar-unified">
    <!-- ═══════ Group 0: 主题切换 ═══════ -->
    <div class="toolbar-group" style="margin-bottom:6px;">
      <div class="group-title">主题色</div>
      <div class="theme-btn-row">
        <button
          v-for="(t, key) in themes"
          :key="key"
          class="theme-btn"
          :class="{ active: themeStore.currentTheme === key }"
          :style="{ '--theme-swatch': t.primary, '--theme-bg-swatch': t.bg }"
          @click="themeStore.setTheme(key)"
          :title="t.label"
        >
          <span class="theme-swatch"></span>
          <span class="theme-label">{{ t.label }}</span>
        </button>
      </div>
    </div>
    <div class="group-divider"></div>

    <!-- ═══════ Group 1: 样式纹样 ═══════ -->
    <div class="toolbar-group">
      <div class="group-title">样式纹样</div>
      <!-- Style buttons -->
      <div class="btn-row">
        <button class="tb-btn" :class="{ active: ceramicStore.currentStyle === 'qinghua' }" @click="ceramicStore.setStyle('qinghua')" title="青花瓷：钴料绘制，白底蓝花，元明清经典">青花瓷</button>
        <button class="tb-btn" :class="{ active: ceramicStore.currentStyle === 'fencai' }" @click="ceramicStore.setStyle('fencai')" title="粉彩瓷：釉上彩绘，色彩柔和，清代创烧">粉彩瓷</button>
        <button class="tb-btn" :class="{ active: ceramicStore.currentStyle === 'jun' }" @click="ceramicStore.setStyle('jun')" title="钧瓷：窑变无双，入窑一色出窑万彩">钧瓷</button>
        <button class="tb-btn" :class="{ active: ceramicStore.currentStyle === 'bai' }" @click="ceramicStore.setStyle('bai')" title="素面白瓷：纯净素雅，洁白如玉">素面白瓷</button>
        <button class="tb-btn" :class="{ active: ceramicStore.currentStyle === 'ruci' }" @click="ceramicStore.setStyle('ruci')" title="汝瓷：天青釉色，蝉翼冰裂，宋徽宗挚爱">汝瓷</button>
        <button class="tb-btn" :class="{ active: ceramicStore.currentStyle === 'geci' }" @click="ceramicStore.setStyle('geci')" title="哥瓷：金丝铁线，紫口铁足，开片天成">哥瓷</button>
      </div>
      <!-- ═══════ 一键上釉面板（20260602）═══════ -->
      <div class="sub-group" style="margin-top:8px;">
        <div class="sub-group-title">▸ 一键上釉</div>
        <!-- 模式选择 -->
        <div style="display:flex;gap:4px;margin-bottom:6px;">
          <button class="tb-btn-sm" :class="{ active: ceramicStore.glazeMode === 'both' }"
            @click="ceramicStore.setGlazeMode('both')" title="内外表面同时上釉">
            🔄 内外同色
          </button>
          <button class="tb-btn-sm" :class="{ active: ceramicStore.glazeMode === 'outer-only' }"
            @click="ceramicStore.setGlazeMode('outer-only')" title="仅外表面上釉">
            🔵 只外上色
          </button>
          <button class="tb-btn-sm" :class="{ active: ceramicStore.glazeMode === 'inner-only' }"
            @click="ceramicStore.setGlazeMode('inner-only')" title="仅内表面上釉">
            🟢 只内上色
          </button>
        </div>
        <!-- 釉色网格 (12色) -->
        <div class="glaze-grid">
          <div v-for="g in glazeColors" :key="g.name" class="glaze-item"
            @click="ceramicStore.applyGlazeColor(g.hex)" :title="g.name">
            <div class="glaze-swatch" :style="{ background: g.hex }"></div>
            <span class="glaze-name">{{ g.name }}</span>
          </div>
        </div>
        <!-- 清除釉色 -->
        <button class="tb-btn-sm" @click="ceramicStore.clearGlaze()"
          style="margin-top:6px;width:100%;" :disabled="!ceramicStore.outerGlazeColor && !ceramicStore.innerGlazeColor">
          清除釉色（恢复样式默认）
        </button>
      </div>

      <!-- Built-in patterns with category tabs -->
      <div class="sub-group" style="margin-top:8px;">
        <div class="sub-group-title">▸ 内置花纹 (50款)</div>
        <!-- Search -->
        <div style="margin:4px 0;">
          <input type="text" class="tb-input" v-model="patternSearch" placeholder="🔍 搜索花纹..." style="font-size:0.72rem;padding:4px 8px;" />
        </div>
        <!-- Search results (shown when search is active) -->
        <div v-if="patternSearch.trim()" style="margin-bottom:4px;">
          <div v-if="searchResults.length === 0" style="font-size:0.7rem;color:var(--text-secondary);text-align:center;padding:8px;">未找到匹配花纹</div>
          <div v-else class="pattern-grid">
            <div v-for="p in searchResults" :key="p.id" class="pattern-item" draggable="true"
              @click="applyBuiltinPattern(p)" @dragstart="onPatternDragStart($event, p)" :title="p.name">
              <img :src="getPatternDataUrl(p)" :alt="p.name" class="pattern-thumb" />
              <span class="pattern-name">{{ p.name }}</span>
            </div>
          </div>
        </div>
        <!-- Category tabs (hidden during search) -->
        <div v-if="!patternSearch.trim()" class="category-tabs">
          <button v-for="cat in patternCategories" :key="cat.id"
            class="cat-tab" :class="{ active: activeCategory === cat.id }"
            @click="activeCategory = cat.id" :title="cat.name">
            {{ cat.icon }} {{ cat.name }}
          </button>
        </div>
        <!-- Category pattern grid -->
        <div v-if="!patternSearch.trim()" class="pattern-grid">
          <div v-for="p in filteredPatterns" :key="p.id" class="pattern-item" draggable="true"
            @click="applyBuiltinPattern(p)" @dragstart="onPatternDragStart($event, p)" :title="p.name">
            <img :src="getPatternDataUrl(p)" :alt="p.name" class="pattern-thumb" />
            <span class="pattern-name">{{ p.name }}</span>
          </div>
        </div>
        <!-- Recent patterns -->
        <div v-if="recentPatternList.length > 0 && !patternSearch.trim()" style="margin-top:6px;">
          <div class="sub-group-title" style="font-size:0.68rem;">▸ 最近使用</div>
          <div class="pattern-grid">
            <div v-for="p in recentPatternList" :key="'recent-'+p.id" class="pattern-item" draggable="true"
              @click="applyBuiltinPattern(p)" @dragstart="onPatternDragStart($event, p)" :title="p.name">
              <img :src="getPatternDataUrl(p)" :alt="p.name" class="pattern-thumb" />
              <span class="pattern-name">{{ p.name }}</span>
            </div>
          </div>
        </div>
      </div>
      <!-- Pattern text input -->
      <div style="margin-top:8px;">
        <input type="text" class="tb-input" v-model="textInput" placeholder="输入纹样文字..." />
      </div>
      <!-- Pattern opacity -->
      <div class="slider-row">
        <span class="slider-label">纹样可见度</span>
        <input type="range" class="tb-range" :value="ceramicStore.patternOpacity" @input="ceramicStore.setPatternOpacity(parseFloat($event.target.value))" min="0" max="1" step="0.01" />
        <span class="slider-val">{{ ceramicStore.patternOpacity.toFixed(2) }}</span>
      </div>
      <!-- Upload custom pattern -->
      <div class="sub-group" style="margin-top:6px;">
        <div class="sub-group-title">▸ 自定义图案</div>
        <label class="upload-btn">
          上传图案（≤10MB）
          <input type="file" accept="image/*" hidden @change="handleUpload" />
        </label>
        <div v-if="uploadedPatterns.length > 0" class="pattern-grid" style="margin-top:6px;">
          <div
            v-for="p in uploadedPatterns"
            :key="p.id"
            class="pattern-item"
            draggable="true"
            @click="applyUploadedPattern(p)"
            @dragstart="onPatternDragStart($event, p)"
            :title="p.name"
          >
            <img :src="p.base64" :alt="p.name" class="pattern-thumb" />
            <button class="pat-del" @click.stop="deleteUploadedPattern(p.id)">×</button>
          </div>
        </div>
      </div>
      <!-- ── 贴附面选择（20260601 内外表面独立隔离）── -->
      <div class="sub-group" style="margin-top:6px;">
        <div class="sub-group-title">▸ 贴附面选择</div>
        <div style="display:flex;gap:6px;margin-top:4px;">
          <button
            class="tb-btn-sm"
            :class="{ active: ceramicStore.activePlacementSurface === 'outer' }"
            @click="ceramicStore.setActivePlacementSurface('outer')"
            style="flex:1;"
          >
            🔵 外表面
          </button>
          <button
            class="tb-btn-sm"
            :class="{ active: ceramicStore.activePlacementSurface === 'inner' }"
            @click="ceramicStore.setActivePlacementSurface('inner')"
            style="flex:1;"
          >
            🟢 内表面
          </button>
        </div>
        <div style="font-size:0.65rem;color:var(--text-secondary);margin-top:3px;text-align:center;">
          当前贴附面: {{ ceramicStore.activePlacementSurface === 'inner' ? '🟢 内表面' : '🔵 外表面' }}
        </div>
      </div>

      <!-- Attached patterns management -->
      <div v-if="ceramicStore.attachedPatterns.length > 0" class="sub-group" style="margin-top:6px;">
        <div class="sub-group-title">▸ 已贴附图案 ({{ ceramicStore.attachedPatterns.length }})</div>
        <div v-if="ceramicStore.selectedPatternId" class="surface-preview">
          当前选中: {{ getSelectedPatternSurface() === 'inner' ? '🟢 内表面' : '🔵 外表面' }}（终生锁定）
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">
          <button class="tb-btn-sm" @click="ceramicStore.clearAttachedPatterns()">清除全部</button>
          <button class="tb-btn-sm" @click="deleteSelectedPattern" :disabled="!ceramicStore.selectedPatternId">删除选中</button>
        </div>
        <!-- Pattern adjust controls -->
        <div class="slider-row" style="margin-top:6px;">
          <span class="slider-label">大小</span>
          <input type="range" class="tb-range" :value="getSelectedPatternScale()" @input="updateSelectedPatternScale(parseFloat($event.target.value))" min="0.1" max="5.0" step="0.05" />
          <input type="number" class="tb-number-input" :value="getSelectedPatternScale()" @input="updateSelectedPatternScale(parseFloat($event.target.value) || 0.1)" min="0.1" max="5.0" step="0.05" />
        </div>
        <div class="slider-row">
          <span class="slider-label">旋转</span>
          <input type="range" class="tb-range" :value="getSelectedPatternRotationDeg()" @input="updateSelectedPatternRotation(parseFloat($event.target.value))" min="0" max="360" step="1" />
          <input type="number" class="tb-number-input" :value="getSelectedPatternRotationDeg().toFixed(1)" @input="updateSelectedPatternRotation(parseFloat($event.target.value) || 0)" min="0" max="360" step="1" />
        </div>
        <div class="slider-row">
          <span class="slider-label">透明度</span>
          <input type="range" class="tb-range" :value="getSelectedPatternOpacity()" @input="updateSelectedPatternOpacity(parseFloat($event.target.value))" min="0" max="1" step="0.01" />
          <span class="slider-val">{{ getSelectedPatternOpacity().toFixed(2) }}</span>
        </div>
        <!-- Nudge buttons -->
        <div class="nudge-row">
          <span class="slider-label">微调</span>
          <div class="nudge-btn-group">
            <button class="tb-btn-nudge" @click="nudgePattern('left', $event)">&#8592;</button>
            <button class="tb-btn-nudge" @click="nudgePattern('up', $event)">&#8593;</button>
            <button class="tb-btn-nudge" @click="nudgePattern('down', $event)">&#8595;</button>
            <button class="tb-btn-nudge" @click="nudgePattern('right', $event)">&#8594;</button>
          </div>
        </div>
      </div>
      <!-- Fire button -->
      <button class="tb-btn-fire" @click="props.onFire">🔥 窑变 · 烧制</button>
    </div>

    <div class="group-divider"></div>

    <!-- ═══════ Group 2: 器型切换 ═══════ -->
    <div class="toolbar-group">
      <div class="group-title">器型切换</div>
      <div class="btn-row">
        <button class="tb-btn" :class="{ active: ceramicStore.currentShape === 'meiping' }" @click="ceramicStore.useBuiltinShape('meiping')" title="梅瓶：小口短颈丰肩，修长优美">梅瓶</button>
        <button class="tb-btn" :class="{ active: ceramicStore.currentShape === 'yuhuchun' }" @click="ceramicStore.useBuiltinShape('yuhuchun')" title="玉壶春瓶：撇口细颈垂腹，典雅端庄">玉壶春</button>
        <button class="tb-btn" :class="{ active: ceramicStore.currentShape === 'shangping' }" @click="ceramicStore.useBuiltinShape('shangping')" title="赏瓶：撇口长颈圆腹，官窑经典">赏瓶</button>
        <button class="tb-btn" :class="{ active: ceramicStore.currentShape === 'wanzhan' }" @click="ceramicStore.useBuiltinShape('wanzhan')" title="碗盏：敞口深腹，日用经典">碗盏</button>
        <button class="tb-btn" :class="{ active: ceramicStore.currentShape === 'chabei' }" @click="ceramicStore.useBuiltinShape('chabei')" title="茶杯：小口深腹，品茗佳器">茶杯</button>
        <button class="tb-btn" :class="{ active: ceramicStore.currentShape === 'hulu' }" @click="ceramicStore.useBuiltinShape('hulu')" title="葫芦瓶：双球形瓶体，福禄双全">葫芦瓶</button>
        <button class="tb-btn" :class="{ active: ceramicStore.currentShape === 'danping' }" @click="ceramicStore.useBuiltinShape('danping')" title="胆瓶：长颈削肩，形似悬胆">胆瓶</button>
        <button class="tb-btn" :class="{ active: ceramicStore.currentShape === 'congshi' }" @click="ceramicStore.useBuiltinShape('congshi')" title="琮式瓶：内圆外方，仿古玉琮">琮式瓶</button>
        <button class="tb-btn" :class="{ active: ceramicStore.currentShape === 'jiangjun' }" @click="ceramicStore.useBuiltinShape('jiangjun')" title="将军罐：直口丰肩带盖，气势威严">将军罐</button>
        <button class="tb-btn" :class="{ active: ceramicStore.currentShape === 'bitong' }" @click="ceramicStore.useBuiltinShape('bitong')" title="笔筒：直筒形，文房雅器">笔筒</button>
        <button class="tb-btn" :class="{ active: ceramicStore.currentShape === 'panzi' }" @click="ceramicStore.useBuiltinShape('panzi')" title="盘子：浅腹敞口平底，盘壁轻薄">盘子</button>
      </div>
      <!-- 我构建的模型：从建模器导出的模型 -->
      <div v-if="ceramicStore.builtModels.length > 0" class="sub-group" style="margin-top:8px;">
        <div class="sub-group-title">🏗️ 我构建的模型 ({{ ceramicStore.builtModels.length }})</div>
        <div class="btn-row">
          <div v-for="bm in ceramicStore.builtModels" :key="bm.id" style="position:relative;display:inline-block;">
            <button
              class="tb-btn"
              :class="{ active: ceramicStore.importedModel?.id === bm.id && ceramicStore.currentShapeIsBuilt }"
              @click="ceramicStore.selectBuiltModel(bm.id)"
              :title="bm.name + ' · ' + (bm.author || '陶瓷快速塑形')"
              style="font-size:0.68rem;padding-right:22px;border-color:#5ab87a;"
            >
              🔧 {{ bm.name.length > 8 ? bm.name.slice(0, 8) + '...' : bm.name }}
            </button>
            <button
              class="pat-del-dl"
              @click.stop="ElMessageBox.confirm('确定移除该构建模型？删除后无法恢复', '确认删除', {confirmButtonText:'确定',cancelButtonText:'取消',type:'warning'}).then(()=>{ceramicStore.removeBuiltModel(bm.id);ElMessage.success('已删除')}).catch(()=>{})"
              title="删除此模型"
            >×</button>
          </div>
        </div>
      </div>
      <!-- 我的下载：从在线模型库下载的模型 -->
      <div v-if="ceramicStore.downloadedModels.length > 0" class="sub-group" style="margin-top:8px;">
        <div class="sub-group-title">▸ 我的下载 ({{ ceramicStore.downloadedModels.length }})</div>
        <div class="btn-row">
          <div v-for="dm in ceramicStore.downloadedModels" :key="dm.id" style="position:relative;display:inline-block;">
            <button
              class="tb-btn"
              :class="{ active: ceramicStore.builtinModel?.id === dm.id || ceramicStore.importedModel?.id === dm.id }"
              @click="ceramicStore.selectDownloadedModel(dm.id)"
              :title="dm.name + ' · by ' + dm.author"
              style="font-size:0.68rem;padding-right:22px;"
            >
              📥 {{ dm.name.length > 8 ? dm.name.slice(0, 8) + '...' : dm.name }}
            </button>
            <button
              class="pat-del-dl"
              @click.stop="ElMessageBox.confirm('确定移除该模型？删除后无法恢复', '确认删除', {confirmButtonText:'确定',cancelButtonText:'取消',type:'warning'}).then(()=>{ceramicStore.removeDownloadedModel(dm.id);ElMessage.success('已删除')}).catch(()=>{})"
              title="删除此模型"
            >×</button>
          </div>
        </div>
      </div>
    </div>

    <div class="group-divider"></div>

    <!-- ═══════ Group 3: 视角预设 ═══════ -->
    <div class="toolbar-group">
      <div class="group-title">视角预设</div>
      <div class="btn-row">
        <button class="tb-btn" @click="props.onSetView('front')">正面</button>
        <button class="tb-btn" @click="props.onSetView('side')">侧面</button>
        <button class="tb-btn" @click="props.onSetView('top')">俯视</button>
        <button class="tb-btn" @click="props.onSetView('bottom')">仰视</button>
      </div>
    </div>

    <div class="group-divider"></div>

    <!-- ═══════ Group 4: 材质精细调节 ═══════ -->
    <div class="toolbar-group">
      <div class="group-title">材质精细调节</div>
      <div class="slider-row"><span class="slider-label">金属感</span><input type="range" class="tb-range" :value="ceramicStore.metalness" @input="ceramicStore.setMetalness(parseFloat($event.target.value))" min="0" max="0.5" step="0.01" /><span class="slider-val">{{ ceramicStore.metalness.toFixed(2) }}</span></div>
      <div class="slider-row"><span class="slider-label">粗糙度</span><input type="range" class="tb-range" :value="ceramicStore.roughness" @input="ceramicStore.setRoughness(parseFloat($event.target.value))" min="0" max="1" step="0.01" /><span class="slider-val">{{ ceramicStore.roughness.toFixed(2) }}</span></div>
      <div class="slider-row"><span class="slider-label">釉面通透度</span><input type="range" class="tb-range" :value="ceramicStore.opacity" @input="ceramicStore.setOpacity(parseFloat($event.target.value))" min="0.7" max="1" step="0.01" /><span class="slider-val">{{ ceramicStore.opacity.toFixed(2) }}</span></div>
      <div class="slider-row"><span class="slider-label">釉面亮度</span><input type="range" class="tb-range" :value="ceramicStore.brightness" @input="ceramicStore.setBrightness(parseFloat($event.target.value))" min="0" max="1" step="0.01" /><span class="slider-val">{{ ceramicStore.brightness.toFixed(2) }}</span></div>
    </div>

    <div class="group-divider"></div>

    <!-- ═══════ Group 5: 特效开关 ═══════ -->
    <div class="toolbar-group">
      <div class="group-title">特效开关</div>
      <div class="toggle-row"><span>环境光影</span><label class="tb-switch"><input type="checkbox" :checked="ceramicStore.lightingEnabled" @change="ceramicStore.setLightingEnabled($event.target.checked)" /><span class="switch-slider"></span></label></div>
      <div class="toggle-row"><span>参考网格</span><label class="tb-switch"><input type="checkbox" :checked="ceramicStore.gridVisible" @change="ceramicStore.setGridVisible($event.target.checked)" /><span class="switch-slider"></span></label></div>
      <div class="toggle-row"><span>自动旋转</span><label class="tb-switch"><input type="checkbox" :checked="ceramicStore.autoRotate" @change="ceramicStore.setAutoRotate($event.target.checked)" /><span class="switch-slider"></span></label></div>
      <div v-if="ceramicStore.autoRotate" class="auto-rotate-controls">
        <div class="slider-row"><span class="slider-label">转速</span><input type="range" class="tb-range" :value="ceramicStore.autoRotateSpeed" @input="ceramicStore.setAutoRotateSpeed(parseFloat($event.target.value))" min="0.001" max="0.05" step="0.001" /><span class="slider-val">{{ ceramicStore.autoRotateSpeed.toFixed(3) }}</span></div>
        <div class="dir-row">
          <span class="slider-label" style="font-size:0.72rem;">方向</span>
          <button class="tb-btn-sm" :class="{ active: ceramicStore.rotationDirection === 1 }" @click="ceramicStore.setRotationDirection(1)">顺时针</button>
          <button class="tb-btn-sm" :class="{ active: ceramicStore.rotationDirection === -1 }" @click="ceramicStore.setRotationDirection(-1)">逆时针</button>
        </div>
      </div>
    </div>

    <div class="group-divider"></div>

    <!-- ═══════ Group 6: 工具 ═══════ -->
    <div class="toolbar-group">
      <div class="group-title">工具</div>
      <div class="btn-row">
        <button class="tb-btn" @click="props.onResetView">重置视角</button>
        <button class="tb-btn" @click="props.onFullscreen">全屏展示</button>
        <button class="tb-btn" @click="props.onScreenshot">截图导出</button>
      </div>
    </div>

    <div style="height:12px;"></div>
  </aside>

  <!-- ═══════ 背景去除调整面板 v2.0（含手动编辑工具箱）═══════ -->
  <el-dialog
    :model-value="bgRemoveVisible"
    @close="bgRemoveVisible = false; exitEditMode()"
    :title="bgEditMode ? '手动编辑' : '点击背景去除'"
    :width="bgEditMode ? '620px' : '420px'"
    :close-on-click-modal="false"
    top="5vh"
  >
    <!-- ══ 手动编辑模式 ══ -->
    <template v-if="bgEditMode">
      <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;align-items:center;">
        <button class="tb-btn-sm" :class="{ active: bgBrushMode === 'erase' }" @click="bgBrushMode='erase'">🧹 擦除笔</button>
        <button class="tb-btn-sm" :class="{ active: bgBrushMode === 'restore' }" @click="bgBrushMode='restore'">🖌 恢复笔</button>
        <span style="font-size:0.7rem;color:#888;">笔刷大小</span>
        <input type="range" v-model.number="bgBrushSize" min="3" max="40" step="1" style="width:80px;" />
        <span style="font-size:0.68rem;color:#888;">{{ bgBrushSize }}px</span>
        <button class="tb-btn-sm" @click="invertSelection" title="保留↔透明互换">🔄 反选</button>
        <button class="tb-btn-sm" @click="resetEdit" title="恢复自动处理结果">↩ 重置</button>
        <button class="tb-btn-sm" @click="exitEditMode" style="margin-left:auto;">✅ 完成编辑</button>
      </div>
      <div style="border:1px solid var(--border-color);border-radius:6px;overflow:hidden;background:repeating-conic-gradient(#ddd 0% 25%,transparent 0% 50%) 0 0 / 14px 14px;cursor:crosshair;">
        <canvas
          ref="bgEditCanvasRef"
          style="width:100%;display:block;"
          @mousedown="onBrushStart"
          @mousemove="onBrushMove"
          @mouseup="onBrushEnd"
          @mouseleave="onBrushEnd"
        ></canvas>
      </div>
    </template>

    <!-- ══ 自动调整模式 ══ -->
    <template v-else>
      <div style="text-align:center;margin-bottom:10px;">
        <!-- 点击原图去背景 -->
        <div style="margin-bottom:8px;font-size:0.78rem;color:var(--accent-jade);font-weight:600;">
          👆 点击原图中的背景区域即可去除
        </div>
        <div style="display:flex;gap:8px;justify-content:center;">
          <div style="flex:1;">
            <div style="font-size:0.7rem;color:#999;margin-bottom:4px;">原图（点击背景）</div>
            <img :src="bgOriginalDataUrl" alt="点击背景区域" @click="pickColorFromPreview"
              style="width:100%;height:140px;object-fit:contain;border-radius:6px;border:2px solid var(--accent-jade);cursor:crosshair;" />
          </div>
          <div style="flex:1;">
            <div style="font-size:0.7rem;color:#999;margin-bottom:4px;">处理结果</div>
            <div style="width:100%;height:140px;border-radius:6px;border:1px solid var(--border-color);overflow:hidden;background:repeating-conic-gradient(#ddd 0% 25%,transparent 0% 50%) 0 0 / 12px 12px;">
              <img v-if="bgProcessedDataUrl" :src="bgProcessedDataUrl" alt="结果" style="width:100%;height:100%;object-fit:contain;" />
            </div>
          </div>
        </div>
      </div>

      <div v-if="bgProcessing && bgProgress > 0 && bgProgress < 1" style="margin:4px 0;">
        <div style="height:4px;background:var(--border-color);border-radius:2px;overflow:hidden;">
          <div style="height:100%;background:var(--accent-jade);border-radius:2px;transition:width 0.1s;" :style="{ width: (bgProgress * 100) + '%' }"></div>
        </div>
      </div>

      <div v-if="bgQuality && !bgQuality.valid" style="margin:6px 0 4px;padding:6px 10px;border-radius:6px;background:rgba(196,58,74,0.08);border:1px solid rgba(196,58,74,0.25);font-size:0.72rem;color:var(--danger);line-height:1.4;">⚠ {{ bgQuality.msg }}</div>

      <div style="margin:8px 0 6px;">
        <div style="display:flex;justify-content:space-between;font-size:0.78rem;color:var(--text-secondary);margin-bottom:4px;">
          <span>容差范围</span><span style="font-weight:600;color:var(--accent-jade);">{{ bgThreshold }}</span>
        </div>
        <el-slider v-model="bgThreshold" :min="1" :max="100" :step="1" :disabled="bgProcessing" @change="reprocessBg" />
        <div style="display:flex;justify-content:space-between;font-size:0.65rem;color:#aaa;margin-top:2px;">
          <span>精确</span><span>宽松</span>
        </div>
      </div>

      <div style="display:flex;gap:6px;margin:8px 0;">
        <button class="tb-btn-sm" :disabled="!bgProcessedDataUrl" @click="enterEditMode" style="flex:1;">✏️ 手动精修</button>
      </div>

      <div style="font-size:0.68rem;color:#888;text-align:center;">
        提示：先点击原图背景，再调容差，最后手动精修
      </div>
    </template>

    <template #footer>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <el-button size="small" type="primary" :loading="bgProcessing" @click="applyBgResult">
          {{ bgProcessing ? '处理中...' : '应用' }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
/* === Unified Toolbar — All colors via CSS variables for theme support === */
.toolbar-unified {
  width: 300px;
  flex-shrink: 0;
  background: var(--bg-primary, #f5f0e8);
  border-left: 1px solid var(--border-color, #d4c5b2);
  overflow-y: auto;
  overflow-x: hidden;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.toolbar-unified::-webkit-scrollbar { width: 4px; }
.toolbar-unified::-webkit-scrollbar-track { background: transparent; }
.toolbar-unified::-webkit-scrollbar-thumb { background: var(--border-color, #d4c5b2); border-radius: 2px; }

.toolbar-group { margin-bottom: 0; }

.group-divider {
  height: 0;
  border: none;
  border-top: 1px dashed var(--border-color, #d4c5b2);
  margin: 10px 0;
}

.group-title {
  font-family: 'Noto Serif SC', STSong, KaiTi, serif;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-secondary, #7A6B5D);
  margin-bottom: 8px;
  letter-spacing: 0.04em;
}

.sub-group { margin-top: 6px; }
.sub-group-title {
  font-size: 0.72rem;
  color: var(--text-secondary, #7A6B5D);
  margin-bottom: 4px;
  font-weight: 500;
}

/* Button row */
.btn-row { display: flex; flex-wrap: wrap; gap: 5px; }

/* Toolbar buttons - native buttons, not Element Plus */
.tb-btn {
  padding: 5px 11px;
  border-radius: 8px;
  font-size: 0.78rem;
  font-family: 'Noto Sans SC', 'PingFang SC', sans-serif;
  cursor: pointer;
  border: 1px solid var(--border-color, #d4c5b2);
  background: var(--btn-active, #fff);
  color: var(--text-primary, #3D2C1A);
  transition: all 0.2s ease;
  white-space: nowrap;
}
.tb-btn:hover { background: var(--bg-secondary, #ede4d8); box-shadow: 0 2px 6px var(--shadow-color, rgba(61,44,26,0.1)); }
.tb-btn:active { transform: scale(0.95); }
.tb-btn.active { background: var(--accent-jade, #7BA891); color: #fff; border-color: var(--accent-jade, #7BA891); }

.tb-btn-sm {
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 0.72rem;
  cursor: pointer;
  border: 1px solid var(--border-color, #d4c5b2);
  background: var(--btn-active, #fff);
  color: var(--text-primary, #3D2C1A);
  transition: all 0.15s ease;
}
.tb-btn-sm:hover { background: var(--bg-secondary, #ede4d8); }
.tb-btn-sm.active { background: var(--accent-jade, #7BA891); color: #fff; border-color: var(--accent-jade, #7BA891); }

/* Fire button */
.tb-btn-fire {
  width: 100%;
  margin-top: 8px;
  padding: 7px 0;
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  cursor: pointer;
  border: none;
  background: linear-gradient(135deg, var(--fire-start, #C47E5A), var(--fire-end, #A0522D));
  color: #fff;
  box-shadow: 0 3px 10px rgba(160,82,45,0.3);
  transition: all 0.2s ease;
}
.tb-btn-fire:hover { background: linear-gradient(135deg, var(--fire-hover-start, #d4956a), var(--fire-hover-end, #b5633d)); box-shadow: 0 4px 16px rgba(160,82,45,0.4); }
.tb-btn-fire:active { transform: scale(0.97); }
.tb-btn-fire:disabled { background: var(--fire-disabled, #c4b09a); cursor: not-allowed; box-shadow: none; }

/* Text input */
.tb-input {
  width: 100%;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 0.78rem;
  border: 1px solid var(--border-color, #d4c5b2);
  background: var(--btn-active, #fff);
  color: var(--text-primary, #3D2C1A);
  outline: none;
  font-family: inherit;
  transition: border-color 0.2s ease;
}
.tb-input:focus { border-color: var(--accent-jade, #7BA891); }
.tb-input::placeholder { color: var(--input-placeholder, #b0a090); }

/* Range slider */
.tb-range {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: var(--border-color, #d4c5b2);
  outline: none;
  flex: 1;
  min-width: 0;
}
.tb-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--accent-jade, #7BA891);
  cursor: pointer;
  border: 2px solid #fff;
  box-shadow: 0 1px 3px var(--shadow-color, rgba(0,0,0,0.15));
}
.tb-range::-moz-range-thumb {
  width: 14px; height: 14px;
  border-radius: 50%;
  background: var(--accent-jade, #7BA891);
  cursor: pointer;
  border: 2px solid #fff;
}

.slider-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.slider-label {
  font-size: 0.72rem;
  color: var(--text-secondary, #7A6B5D);
  white-space: nowrap;
  min-width: 52px;
}
.slider-val {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--slider-val, #4A6FA5);
  min-width: 32px;
  text-align: right;
}

/* Toggle switches */
.toggle-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.78rem;
  color: var(--text-primary, #3D2C1A);
  margin-bottom: 6px;
}

.tb-switch {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
}
.tb-switch input { opacity: 0; width: 0; height: 0; }
.switch-slider {
  position: absolute;
  cursor: pointer;
  top: 0; left: 0; right: 0; bottom: 0;
  background: var(--border-color, #d4c5b2);
  border-radius: 20px;
  transition: 0.2s ease;
}
.switch-slider::before {
  content: '';
  position: absolute;
  height: 16px;
  width: 16px;
  left: 2px;
  bottom: 2px;
  background: #fff;
  border-radius: 50%;
  transition: 0.2s ease;
}
.tb-switch input:checked + .switch-slider { background: var(--accent-jade, #7BA891); }
.tb-switch input:checked + .switch-slider::before { transform: translateX(16px); }

.dir-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
}

/* Pattern grid */
.pattern-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.pattern-item {
  position: relative;
  border: 1px solid var(--border-color, #d4c5b2);
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  background: var(--btn-active, #fff);
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 3px;
}
.pattern-item:hover { border-color: var(--accent-jade, #7BA891); box-shadow: 0 2px 8px color-mix(in srgb, var(--accent-jade, #7BA891) 25%, transparent); }
.pattern-item:active { transform: scale(0.96); }

.pattern-thumb {
  width: 100%;
  height: 50px;
  object-fit: contain;
  border-radius: 4px;
}
.pattern-name {
  font-size: 0.62rem;
  color: var(--text-secondary, #7A6B5D);
  margin-top: 2px;
  text-align: center;
  line-height: 1.2;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pat-del {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: none;
  background: var(--danger, #C43A4A);
  color: #fff;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
}
.pattern-item:hover .pat-del { opacity: 1; }

/* Download delete button */
.pat-del-dl {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: none;
  background: #C43A4A;
  color: #fff;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
  padding: 0;
  z-index: 2;
}
div:hover > .pat-del-dl { opacity: 1; }

/* Upload button */
.upload-btn {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 0.72rem;
  border: 1px dashed var(--border-color, #d4c5b2);
  background: rgba(255,255,255,0.6);
  color: var(--text-secondary, #7A6B5D);
  cursor: pointer;
  transition: all 0.2s;
}
.upload-btn:hover { border-color: var(--accent-jade, #7BA891); color: var(--accent-jade, #7BA891); background: color-mix(in srgb, var(--accent-jade, #7BA891) 8%, transparent); }

/* Auto-rotate controls */
.auto-rotate-controls {
  margin-top: 6px;
  padding: 6px 8px;
  background: rgba(255,255,255,0.4);
  border-radius: 6px;
}

/* Responsive */
@media (max-width: 768px) {
  .toolbar-unified { width: 100%; max-height: 45vh; border-left: none; border-top: 1px solid var(--border-color, #d4c5b2); }
}

/* ─── 主题切换按钮 ─── */
.theme-btn-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.theme-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px 4px 6px;
  border-radius: 16px;
  cursor: pointer;
  border: 1px solid var(--theme-border, var(--border-color, #d4c5b2));
  background: var(--theme-bg, var(--bg-primary, #f5f0e8));
  color: var(--text-primary, #3D2C1A);
  font-size: 0.72rem;
  font-family: 'Noto Sans SC', 'PingFang SC', sans-serif;
  transition: all 0.3s ease;
}
.theme-btn:hover {
  box-shadow: 0 2px 8px var(--shadow-color, rgba(0,0,0,0.1));
  transform: scale(1.02);
}
.theme-btn.active {
  border-width: 2px;
  border-color: var(--theme-primary, var(--accent-jade, #4a7c59));
  background: var(--theme-accent-light, #e8f0e4);
}
.theme-swatch {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--theme-primary, var(--accent-jade, #4a7c59));
  border: 1px solid rgba(0,0,0,0.1);
  flex-shrink: 0;
}
.theme-label {
  white-space: nowrap;
}

/* Nudge buttons */
.nudge-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}
.nudge-btn-group {
  display: grid;
  grid-template-columns: repeat(4, auto);
  gap: 3px;
}
.tb-btn-nudge {
  width: 30px;
  height: 28px;
  border-radius: 6px;
  font-size: 0.8rem;
  cursor: pointer;
  border: 1px solid var(--border-color, #d4c5b2);
  background: var(--btn-active, #fff);
  color: var(--text-primary, #3D2C1A);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  padding: 0;
}
.tb-btn-nudge:hover { background: var(--bg-secondary, #ede4d8); }
.tb-btn-nudge:active { transform: scale(0.92); }

/* Number input next to sliders */
.tb-number-input {
  width: 52px;
  padding: 2px 4px;
  border-radius: 4px;
  font-size: 0.72rem;
  border: 1px solid var(--border-color, #d4c5b2);
  background: var(--btn-active, #fff);
  color: var(--text-primary, #3D2C1A);
  text-align: center;
  outline: none;
}
.tb-number-input:focus {
  border-color: var(--accent-jade, #7BA891);
}

/* Surface preview indicator */
.surface-preview {
  font-size: 0.68rem;
  color: var(--accent-jade, #7BA891);
  margin-top: 2px;
  font-style: italic;
}

/* Enhanced surface toggle - green tint for inner surface */
.tb-btn-sm.surface-inner {
  border-color: var(--accent-jade, #7BA891);
  box-shadow: 0 0 4px color-mix(in srgb, var(--accent-jade, #7BA891) 30%, transparent);
}

/* Category tabs for patterns */
.category-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  margin-bottom: 6px;
}
.cat-tab {
  padding: 2px 7px;
  border-radius: 10px;
  font-size: 0.64rem;
  cursor: pointer;
  border: 1px solid var(--border-color, #d4c5b2);
  background: var(--btn-active, #fff);
  color: var(--text-secondary, #7A6B5D);
  transition: all 0.15s ease;
  white-space: nowrap;
}
.cat-tab:hover { background: var(--bg-secondary, #ede4d8); }
.cat-tab.active { background: var(--accent-jade, #7BA891); color: #fff; border-color: var(--accent-jade, #7BA891); }

/* Glaze color swatches */
.glaze-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  gap: 5px;
}
.glaze-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  border: 1px solid var(--border-color, #d4c5b2);
  border-radius: 8px;
  padding: 5px;
  background: var(--btn-active, #fff);
  transition: all 0.15s ease;
}
.glaze-item:hover {
  border-color: var(--accent-jade, #7BA891);
  box-shadow: 0 2px 8px rgba(0,0,0,0.12);
  transform: scale(1.04);
}
.glaze-item:active { transform: scale(0.95); }
.glaze-swatch {
  width: 100%;
  height: 36px;
  border-radius: 6px;
  border: 1px solid rgba(0,0,0,0.08);
}
.glaze-name {
  font-size: 0.68rem;
  color: var(--text-primary, #3D2C1A);
  margin-top: 3px;
  text-align: center;
  font-weight: 500;
}
</style>
