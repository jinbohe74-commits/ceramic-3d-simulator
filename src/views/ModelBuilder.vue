<template>
  <div class="ceramic-shaper" ref="shaperEl" tabindex="0">
    <!-- ═══════════ TOP NAV BAR ═══════════ -->
    <div class="top-nav">
      <div class="nav-left">
        <span class="nav-logo">🏺 陶瓷快速塑形</span>
      </div>
      <div class="nav-right">
        <el-button size="small" @click="goBack" class="nav-btn-back">← 返回创作</el-button>
        <el-button size="small" @click="customShapePanel = true" class="nav-btn-custom">📷 自定义器型</el-button>
        <el-button size="small" @click="savePreset" class="nav-btn-save">💾 保存预设</el-button>
        <el-button size="small" type="primary" @click="exportToEditor" class="nav-btn-export">🏺 导出到创作</el-button>
      </div>
    </div>

    <!-- ═══════════ MAIN WORK AREA ═══════════ -->
    <div class="work-area">
      <!-- LEFT PANEL -->
      <div class="left-panel">
        <button class="shape-switch-btn" @click="shapePanelVisible = true">
          🏺 器型切换
        </button>
        <div class="current-shape-label">
          当前：<strong v-if="!isCustomShape">{{ currentShapeName }}</strong>
          <input v-else class="custom-name-input" v-model="customShapeName" @click.stop />
        </div>
        <div class="panel-divider"></div>

        <!-- Active Ring Parameters -->
        <div class="param-section" v-if="selectedRing">
          <div class="section-label">🔵 调节环参数</div>
          <div class="param-hint">高度: {{ (selectedRing.heightPercent).toFixed(0) }}% | 直径: {{ getRingDiameter(selectedRing).toFixed(2) }} (自动)</div>

          <div class="slider-group">
            <label>环宽度</label>
            <input type="range" class="tb-range"
              :value="selectedRing.width"
              @input="updateRingParam('width', +$event.target.value)"
              @change="onSliderRelease"
              min="0.1" max="30" step="0.1" />
            <span class="slider-val">{{ selectedRing.width.toFixed(1) }} cm</span>
          </div>

          <div class="slider-group">
            <label>凹凸强度</label>
            <input type="range" class="tb-range"
              :value="selectedRing.bumpStrength"
              @input="updateRingParam('bumpStrength', +$event.target.value)"
              @change="onSliderRelease"
              :min="effectiveBumpMin" :max="effectiveBumpMax" step="0.05" />
            <span class="slider-val" :class="{ negative: selectedRing.bumpStrength < 0, positive: selectedRing.bumpStrength > 0 }">
              {{ selectedRing.bumpStrength > 0 ? '+' : '' }}{{ selectedRing.bumpStrength.toFixed(2) }} cm
            </span>
          </div>

          <div class="slider-group">
            <label>平滑度</label>
            <input type="range" class="tb-range"
              :value="selectedRing.smoothness"
              @input="updateRingParam('smoothness', +$event.target.value)"
              @change="onSliderRelease"
              min="0.1" max="1" step="0.01" />
            <span class="slider-val">{{ selectedRing.smoothness.toFixed(2) }}</span>
          </div>

          <div class="slider-group">
            <label>过渡半径</label>
            <input type="range" class="tb-range"
              :value="selectedRing.transitionRadius"
              @input="updateRingParam('transitionRadius', +$event.target.value)"
              @change="onSliderRelease"
              min="0.5" max="15" step="0.1" />
            <span class="slider-val">{{ selectedRing.transitionRadius.toFixed(1) }} cm</span>
          </div>
        </div>

        <!-- Global softness -->
        <div class="param-section" v-if="rings.length > 0">
          <div class="section-label">🌊 全局过渡柔和度</div>
          <div class="slider-group">
            <input type="range" class="tb-range"
              :value="transitionSoftness"
              @input="transitionSoftness = +$event.target.value; onGlobalSoftnessChange()"
              @change="onSliderRelease"
              min="0.1" max="1" step="0.01" />
            <span class="slider-val">{{ transitionSoftness.toFixed(2) }}</span>
          </div>
        </div>

        <!-- Strength mode buttons -->
        <div class="param-section" v-if="selectedRing">
          <div style="display:flex;flex-direction:column;gap:4px;">
            <button class="intensity-btn" :class="{ active: bumpMultiplier }" @click="bumpMultiplier = !bumpMultiplier; superStrength = false">
              ⚡ 强度倍增 {{ bumpMultiplier ? '(-20~+20)' : '(-10~+10)' }}
            </button>
            <button class="intensity-btn super" :class="{ active: superStrength }" @click="superStrength = !superStrength; bumpMultiplier = false">
              🔥 超级强度 {{ superStrength ? '(-50~+50)' : '' }}
            </button>
          </div>

          <button class="apply-deform-btn" @click="bakeDeformations" v-if="selectedRing || rings.length > 0">
            ✅ 应用变形（固化到模型）
          </button>

          <button class="remove-ring-btn" @click="deleteRing(selectedRing.id)">✕ 删除此调节环</button>
        </div>

        <!-- No ring selected -->
        <div class="param-section" v-else-if="rings.length > 0">
          <div class="section-label">调节环 ({{ rings.length }})</div>
          <div class="ring-list">
            <div v-for="ring in rings" :key="ring.id" class="ring-list-item"
              @click="selectRing(ring.id)">
              <span>环 #{{ ring.id.slice(-4) }}</span>
              <span style="font-size:10px;color:#888;">{{ ring.heightPercent.toFixed(0) }}% / {{ ring.bumpStrength.toFixed(1) }}cm</span>
            </div>
          </div>
          <button class="remove-ring-btn" @click="clearAllRings" style="margin-top:6px;">🗑 清除所有调节环</button>
        </div>

        <!-- No rings hint -->
        <div class="param-section" v-else>
          <div class="section-label">💡 提示</div>
          <div class="param-hint">点击器型表面任意位置放置调节环。可创建多个环，每个独立调节。</div>
        </div>

        <div class="panel-divider"></div>

        <!-- Mouth Parameters -->
        <div class="param-section" v-if="mouthActive">
          <div class="section-label">👄 瓶口专属调节</div>
          <div class="slider-group">
            <label>瓶口直径</label>
            <input type="range" class="tb-range" :value="mouthDiameter" @input="mouthDiameter = +$event.target.value; onMouthParamDebounced()" min="0.3" max="2.5" step="0.01" />
            <span class="slider-val">{{ (mouthDiameter * 100).toFixed(0) }}%</span>
          </div>
          <div class="slider-group">
            <label>瓶口高度</label>
            <input type="range" class="tb-range" :value="mouthHeight" @input="mouthHeight = +$event.target.value; onMouthParamDebounced()" min="0.3" max="2.5" step="0.01" />
            <span class="slider-val">{{ (mouthHeight * 100).toFixed(0) }}%</span>
          </div>
          <div class="slider-group">
            <label>口沿厚度</label>
            <input type="range" class="tb-range" :value="mouthThickness" @input="mouthThickness = +$event.target.value; onMouthParamDebounced()" min="0.2" max="4" step="0.05" />
            <span class="slider-val">{{ mouthThickness.toFixed(2) }}x</span>
          </div>
          <button class="remove-ring-btn" @click="mouthActive = false">✕ 关闭瓶口调节</button>
        </div>

        <div class="panel-divider"></div>

        <!-- Undo / Redo -->
        <div class="undo-redo-group">
          <button class="undo-btn" :disabled="undoStack.length === 0" @click="undo()">↩ 撤销</button>
          <button class="redo-btn" :disabled="redoStack.length === 0" @click="redo()">↪ 重做</button>
          <button class="reset-btn" @click="resetShape">🔄 重置</button>
        </div>
      </div>

      <!-- CENTER — 3D Viewport -->
      <div class="viewport-container" ref="viewportContainer"></div>

      <!-- RIGHT PANEL -->
      <div class="right-panel">
        <div class="tool-group">
          <button class="tool-btn" :class="{ active: currentTool === 'orbit' }" @click="setTool('orbit')" title="旋转">🔄</button>
          <button class="tool-btn" :class="{ active: currentTool === 'pan' }" @click="setTool('pan')" title="平移">↕</button>
          <button class="tool-btn" :class="{ active: currentTool === 'zoom' }" @click="setTool('zoom')" title="缩放">🔍</button>
        </div>
        <div class="tool-label">视角</div>
        <div class="panel-divider-h"></div>
        <div class="tool-info">
          <div class="info-row"><span>器型</span><strong v-if="!isCustomShape">{{ currentShapeName }}</strong><input v-else class="info-name-input" v-model="customShapeName" @click.stop /></div>
          <div class="info-row"><span>环数</span><strong>{{ rings.length }}</strong></div>
          <div class="info-row"><span>顶点</span><strong>{{ vertexCount }}</strong></div>
          <div class="info-row"><span>面数</span><strong>{{ faceCount }}</strong></div>
        </div>
      </div>
    </div>

    <!-- Status bar -->
    <div class="status-bar">
      <span>{{ statusText }}</span>
      <span class="status-hint">🖱 左键旋转 | 右键平移/删除环 | 滚轮缩放 | 点击放置调节环 | Ctrl+Z/Y | Esc关闭面板</span>
    </div>

    <!-- ═══════════ IMAGE-TO-3D PANEL ═══════════ -->
    <ImageTo3D :visible="customShapePanel" @close="customShapePanel = false" @generate="onCustomShapeGenerated" />

    <!-- ═══════════ FULL-SCREEN SHAPE PANEL ═══════════ -->
    <teleport to="body">
      <div v-if="shapePanelVisible" class="shape-overlay" @click.self="shapePanelVisible = false">
        <div class="shape-dialog">
          <div class="shape-dialog-header">
            <h2>🏺 器型库 ({{ filteredShapeList.length }} 款)</h2>
            <button class="close-btn" @click="shapePanelVisible = false">✕</button>
          </div>
          <div class="shape-dialog-toolbar">
            <input type="text" class="shape-search" v-model="shapeSearch" placeholder="🔍 搜索器型名称、朝代、窑口..." />
            <div class="shape-categories">
              <button v-for="cat in shapeCategories" :key="cat.key" class="cat-btn"
                :class="{ active: activeShapeCategory === cat.key }"
                @click="activeShapeCategory = cat.key; shapePage = 0">{{ cat.icon }} {{ cat.name }}</button>
            </div>
          </div>
          <div class="shape-grid-full">
            <div v-for="shape in pagedShapes" :key="shape.id" class="shape-card"
              :class="{ active: currentShapeId === shape.id }"
              :style="{ '--card-bg': shape.catBg, '--card-border': shape.catBorder }"
              @click="switchToBuiltinModel(shape)">
              <div class="shape-card-img">
                <img v-if="shape.thumbnail" :src="shape.thumbnail" :alt="shape.name" loading="lazy" />
                <span v-else class="shape-placeholder">{{ shape.icon }}</span>
                <span class="shape-cat-badge" :style="{ background: shape.catBorder }">{{ shape.catLabel }}</span>
              </div>
              <div class="shape-card-info">
                <span class="shape-card-name" :title="shape.name">{{ shape.name }}</span>
                <span class="shape-card-feature">{{ shape.feature }}</span>
                <span class="shape-card-meta">{{ shape.dynasty }} · {{ shape.ware }}</span>
              </div>
            </div>
          </div>
          <div v-if="pagedShapes.length === 0" class="shape-empty">没有匹配的器型</div>
          <div class="shape-pagination" v-if="totalPages > 1">
            <button :disabled="shapePage <= 0" @click="shapePage--">◀ 上一页</button>
            <span v-for="p in totalPages" :key="p" class="page-num"
              :class="{ active: p - 1 === shapePage }" @click="shapePage = p - 1">{{ p }}</span>
            <button :disabled="shapePage >= totalPages - 1" @click="shapePage++">下一页 ▶</button>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>

<script setup>
import { ref, shallowRef, markRaw, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useCeramicStore } from '@/stores/ceramic'
import { builtinModels, generateThumbnail } from '@/assets/models'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { ElMessage } from 'element-plus'
import ImageTo3D from '@/components/ImageTo3D.vue'

const router = useRouter()
const ceramicStore = useCeramicStore()

// ─── Refs ───
const shaperEl = ref(null)
const viewportContainer = ref(null)

// ─── UI ───
const shapePanelVisible = ref(false)
const customShapePanel = ref(false)  // Image-to-3D panel
const currentTool = ref('orbit')
const statusText = ref('就绪')
const shapeSearch = ref('')
const activeShapeCategory = ref('all')
const shapePage = ref(0)
const SHAPES_PER_PAGE = 6

// ─── Shape ───
const currentShapeId = ref('bm-010')  // 清雍正·青花缠枝莲赏瓶 — 经典优雅
const isCustomShape = ref(false)       // true when model comes from ImageTo3D custom generation
const customShapeName = ref('自定义器型') // editable name for custom shapes

// ─── Rings System ───
// Each ring: { id, heightPercent, width, bumpStrength, smoothness, transitionRadius }
const rings = ref([])
const selectedRingId = ref(null)
const bumpMultiplier = ref(false)    // -20~+20 mode
const superStrength = ref(false)    // -50~+50 mode
const transitionSoftness = ref(0.7)  // Global transition softness 0.1-1.0

const effectiveBumpMin = computed(() => superStrength.value ? -50 : bumpMultiplier.value ? -20 : -10)
const effectiveBumpMax = computed(() => superStrength.value ? 50 : bumpMultiplier.value ? 20 : 10)

const selectedRing = computed(() => {
  if (!selectedRingId.value) return null
  return rings.value.find(r => r.id === selectedRingId.value) || null
})

function getRingDiameter(ring) {
  if (!ring) return 0
  const pts = currentProfilePoints.value
  if (pts.length === 0) return 0
  const heights = pts.map(p => p.y)
  const minY = Math.min(...heights)
  const maxY = Math.max(...heights)
  const targetY = minY + (maxY - minY) * (ring.heightPercent / 100)
  return getRadiusAtHeight(targetY, pts) * 2
}

// ─── Mouth ───
const mouthActive = ref(false)
const mouthDiameter = ref(1.0)
const mouthHeight = ref(1.0)
const mouthThickness = ref(1.0)
let mouthDebounceTimer = null

// ─── History ───
const undoStack = ref([])
const redoStack = ref([])
const MAX_HISTORY = 50

// ─── Profile ───
const originalProfilePoints = ref([])
const currentProfilePoints = ref([])

// ─── Stats ───
const vertexCount = ref(0)
const faceCount = ref(0)

// ─── Categories ───
const shapeCategories = [
  { key: 'all', name: '全部', icon: '🏺' },
  { key: 'vase', name: '瓶', icon: '🏺' },
  { key: 'jar', name: '罐', icon: '🫙' },
  { key: 'bowl', name: '碗', icon: '🍜' },
  { key: 'plate', name: '盘', icon: '🍽️' },
  { key: 'cup', name: '杯', icon: '🍵' },
  { key: 'teapot', name: '壶', icon: '🫖' },
]

// ─── Shape feature descriptions ───
const shapeFeatures = {
  vase: '瓶类·经典器型', jar: '罐类·丰肩圆腹', bowl: '碗类·敞口深腹',
  plate: '盘类·浅腹平底', cup: '杯类·小口雅致', teapot: '壶类·有流有柄',
}
const categoryColors = {
  vase: { bg: '#1a2a3a', border: '#4a7a9a', label: '瓶' },
  jar: { bg: '#2a1a0a', border: '#9a6a3a', label: '罐' },
  bowl: { bg: '#1a2a1a', border: '#4a8a4a', label: '碗' },
  plate: { bg: '#2a2a0a', border: '#8a8a3a', label: '盘' },
  cup: { bg: '#2a1a2a', border: '#8a4a8a', label: '杯' },
  teapot: { bg: '#2a1a1a', border: '#8a5a4a', label: '壶' },
}

// ─── Lazy thumbnail cache (reactive ref so Vue tracks updates) ───
const thumbnailCache = ref({})

/** Get thumbnail for a model — cached, lazy-generated, reactive */
function getModelThumbnail(model) {
  if (thumbnailCache.value[model.id] !== undefined) {
    return thumbnailCache.value[model.id]
  }
  // Defer generation to avoid blocking initial render
  requestAnimationFrame(() => {
    try {
      const t = generateEnhancedThumbnail(model)
      // Replace entire object to trigger Vue reactivity
      thumbnailCache.value = { ...thumbnailCache.value, [model.id]: t }
    } catch {
      thumbnailCache.value = { ...thumbnailCache.value, [model.id]: '' }
    }
  })
  return ''
}

// ─── Shape list ───
const shapeList = computed(() => {
  return builtinModels.map(m => {
    const icons = { vase: '🏺', jar: '🫙', bowl: '🍜', plate: '🍽️', cup: '🍵', teapot: '🫖' }
    const catColor = categoryColors[m.shape] || categoryColors.vase
    const feature = shapeFeatures[m.shape] || '经典器型'
    return {
      id: m.id, name: m.name, dynasty: m.dynasty || '', ware: m.ware || '',
      shape: m.shape, category: m.category, style: m.style, glaze: m.glaze,
      profile: m.profile, icon: icons[m.shape] || '🏺',
      feature,
      catBg: catColor.bg, catBorder: catColor.border, catLabel: catColor.label,
      get thumbnail() { return getModelThumbnail(m) },
    }
  })
})

/**
 * 基于模型真实剖面曲线生成独一无二的缩略图
 * 每款器型画出其实际轮廓，从根本上消除"千器一面"的问题
 */
function generateEnhancedThumbnail(model, size = 360) {
  try {
    const c = document.createElement('canvas'); c.width = size; c.height = size * 1.25
    const ctx = c.getContext('2d')
    const W = c.width, H = c.height
    const cx = W / 2, pad = W * 0.12

    // ── 背景 ──
    const bg = ctx.createRadialGradient(cx, H * 0.45, W * 0.05, cx, H * 0.45, W * 0.7)
    bg.addColorStop(0, '#3a3a40'); bg.addColorStop(1, '#151518')
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)

    // ── 地面阴影 ──
    ctx.fillStyle = 'rgba(80,80,85,0.4)'
    ctx.beginPath(); ctx.ellipse(cx, H * 0.80, W * 0.38, H * 0.03, 0, 0, Math.PI * 2); ctx.fill()

    // ── 解析剖面数据 → 转换为画布坐标 ──
    const profile = model.profile
    if (!profile || profile.length < 3) {
      // 无剖面数据时回退到简单缩略图
      return generateThumbnail(model, 180)
    }

    // 提取 (r, y) 坐标
    const pts = profile.map(p => ({
      r: typeof p.x === 'number' ? p.x : (p[0] || 0),
      y: typeof p.y === 'number' ? p.y : (p[1] || 0),
    }))

    // 计算剖面范围
    const yVals = pts.map(p => p.y)
    const rVals = pts.map(p => p.r)
    const yMin = Math.min(...yVals)
    const yMax = Math.max(...yVals)
    const rMax = Math.max(...rVals)
    const height = yMax - yMin || 1

    // 缩放到画布
    const drawH = H * 0.68
    const scale = drawH / height
    const maxDrawW = (W - pad * 2) / 2
    const rScale = Math.min(scale, maxDrawW / (rMax || 1))

    function px(r) { return cx + r * rScale }
    function py(y) { return H * 0.82 - (y - yMin) * scale }

    // ── 釉色 ──
    const glaze = model.glaze || '#E8D5B7'

    // ── 背景光晕 ──
    const glowGrad = ctx.createRadialGradient(cx, H * 0.40, W * 0.02, cx, H * 0.40, W * 0.45)
    glowGrad.addColorStop(0, 'rgba(255,255,255,0.06)')
    glowGrad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = glowGrad; ctx.fillRect(0, 0, W, H)

    // ── 3D 光照渐变（水平线性，模拟圆柱体光照）──
    const lightGrad = ctx.createLinearGradient(cx - W * 0.35, 0, cx + W * 0.35, 0)
    lightGrad.addColorStop(0,   darken(glaze, 0.32))
    lightGrad.addColorStop(0.12, darken(glaze, 0.08))
    lightGrad.addColorStop(0.30, glaze)
    lightGrad.addColorStop(0.48, lighten(glaze, 0.38))
    lightGrad.addColorStop(0.65, glaze)
    lightGrad.addColorStop(0.85, darken(glaze, 0.06))
    lightGrad.addColorStop(1,   darken(glaze, 0.34))

    // ── 绘制器型轮廓（基于真实剖面）──
    ctx.fillStyle = lightGrad
    ctx.beginPath()

    // 右侧轮廓（从底到顶）
    const rightPts = []
    for (let i = 0; i < pts.length; i++) {
      rightPts.push({ sx: px(pts[i].r), sy: py(pts[i].y) })
    }
    // 左侧轮廓（从顶到底，镜像）
    const leftPts = []
    for (let i = pts.length - 1; i >= 0; i--) {
      leftPts.push({ sx: px(-pts[i].r), sy: py(pts[i].y) })
    }

    // 绘制路径：从底部中心 → 右侧轮廓 → 顶部 → 左侧轮廓 → 闭合
    const bottomCenter = py(yMin)
    const topCenter = py(yMax)

    ctx.moveTo(cx, bottomCenter)
    // 右侧
    for (const p of rightPts) {
      ctx.lineTo(p.sx, p.sy)
    }
    // 顶部连接（如果有口径则画口沿椭圆印象）
    const topR = pts[pts.length - 1].r
    const topY = py(yMax)
    if (topR > 0.005) {
      // 顶部稍微内弯表示口沿
      ctx.lineTo(px(topR * 0.88), topY)
    }
    // 左侧（从上到下）
    for (const p of leftPts) {
      ctx.lineTo(p.sx, p.sy)
    }
    // 闭合到底部中心
    ctx.closePath()
    ctx.fill()

    // ── 口沿椭圆（如果口径>0）──
    if (topR > 0.005) {
      const mouthRx = topR * rScale
      const mouthRy = Math.max(mouthRx * 0.22, 1.5)
      const mouthY = topY

      // 口沿内部暗面
      ctx.fillStyle = darken(glaze, 0.18)
      ctx.beginPath()
      ctx.ellipse(cx, mouthY - mouthRy * 0.3, mouthRx * 0.92, mouthRy * 1.1, 0, 0, Math.PI * 2)
      ctx.fill()

      // 口沿高光
      ctx.strokeStyle = lighten(glaze, 0.20)
      ctx.lineWidth = 1.0
      ctx.beginPath()
      ctx.ellipse(cx, mouthY - mouthRy * 0.3, mouthRx * 0.95, mouthRy * 0.9, 0, 0, Math.PI * 2)
      ctx.stroke()
    }

    // ── 高光条（模拟陶瓷釉面反光）──
    const hlGrad = ctx.createLinearGradient(cx - W * 0.05, 0, cx + W * 0.18, 0)
    hlGrad.addColorStop(0, 'rgba(255,255,255,0)')
    hlGrad.addColorStop(0.45, 'rgba(255,255,255,0.18)')
    hlGrad.addColorStop(0.55, 'rgba(255,255,255,0.22)')
    hlGrad.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = hlGrad
    ctx.beginPath()
    ctx.ellipse(cx + W * 0.06, H * 0.35, W * 0.10, H * 0.22, -0.08, 0, Math.PI * 2)
    ctx.fill()

    return c.toDataURL('image/png')
  } catch (e) {
    console.warn('[ModelBuilder] thumbnail generation failed, falling back', e)
    try { return generateThumbnail(model, 180) } catch { return '' }
  }
}

function darken(hex, amount) {
  const c = hexToRgb(hex)
  return `rgb(${Math.floor(c.r * (1 - amount))},${Math.floor(c.g * (1 - amount))},${Math.floor(c.b * (1 - amount))})`
}
function lighten(hex, amount) {
  const c = hexToRgb(hex)
  return `rgb(${Math.min(255, Math.floor(c.r + (255 - c.r) * amount))},${Math.min(255, Math.floor(c.g + (255 - c.g) * amount))},${Math.min(255, Math.floor(c.b + (255 - c.b) * amount))})`
}
function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }
}

const filteredShapeList = computed(() => {
  let list = shapeList.value
  if (activeShapeCategory.value !== 'all') list = list.filter(s => s.shape === activeShapeCategory.value)
  if (shapeSearch.value.trim()) {
    const kw = shapeSearch.value.trim().toLowerCase()
    list = list.filter(s =>
      s.name.toLowerCase().includes(kw) ||
      s.dynasty.includes(kw) ||
      s.ware.includes(kw) ||
      s.feature.includes(kw) ||
      s.catLabel.includes(kw)
    )
  }
  return list
})
const totalPages = computed(() => Math.ceil(filteredShapeList.value.length / SHAPES_PER_PAGE))
const pagedShapes = computed(() => {
  const start = shapePage.value * SHAPES_PER_PAGE
  return filteredShapeList.value.slice(start, start + SHAPES_PER_PAGE)
})
const currentShapeName = computed(() => {
  if (isCustomShape.value) return customShapeName.value
  return shapeList.value.find(s => s.id === currentShapeId.value)?.name || '梅瓶'
})

// ─── Three.js ───
let scene = null, camera = null, renderer = null, controls = null
let outerMesh = null, innerMesh = null, bottomMesh = null
let ringLines = [] // Array of { id, line, topLine, bottomLine, band }
let animFrameId = null
let rebuildFrameId = null
let needsUpdate = false
const raycaster = new THREE.Raycaster()
const mouse = new THREE.Vector2()
const LATHE_SEGMENTS = 256

// ─── Cached geometry data for incremental updates ───
let baseProfileCache = null       // Array of {y, r} — the base (undeformed) profile
let segmentAngles = null          // Precomputed cos/sin for each segment
let profileVertexMap = null       // Map: vertex index → profile point index

function getRadiusAtHeight(targetY, pts) {
  if (pts.length < 2) return 0.3
  for (let i = 0; i < pts.length - 1; i++) {
    const y0 = pts[i].y, y1 = pts[i + 1].y
    if ((targetY >= y0 && targetY <= y1) || (targetY <= y0 && targetY >= y1)) {
      const t = (targetY - y0) / (y1 - y0 || 0.001)
      return pts[i].x + (pts[i + 1].x - pts[i].x) * t
    }
  }
  const heights = pts.map(p => p.y)
  return targetY <= Math.min(...heights) ? pts[0].x : pts[pts.length - 1].x
}

function buildGeometryFromProfile(pts) {
  return createWeldedLatheGeometry(pts, LATHE_SEGMENTS)
}

/**
 * 几何体构建（建模器专用）
 * THREE.LatheGeometry + UV偏移 + smooth normals
 */
function createWeldedLatheGeometry(points, segments) {
  const geom = new THREE.LatheGeometry(points, segments)

  const uv = geom.attributes.uv
  for (let i = 0; i < uv.count; i++) {
    uv.setX(i, (uv.getX(i) + 0.25) % 1.0)
  }
  uv.needsUpdate = true

  geom.computeVertexNormals()
  geom.computeBoundingSphere()
  return geom
}

/** Precompute segment angle data for incremental updates (segments+1 columns) */
function buildSegmentCache() {
  segmentAngles = new Float32Array(LATHE_SEGMENTS + 1)
  for (let j = 0; j <= LATHE_SEGMENTS; j++) {
    segmentAngles[j] = (j / LATHE_SEGMENTS) * Math.PI * 2
  }
}

/** Build vertex→profile mapping for the current geometry (segments+1 columns) */
function buildProfileVertexMap(profileCount) {
  profileVertexMap = new Uint16Array((LATHE_SEGMENTS + 1) * profileCount)
  for (let i = 0; i < profileCount; i++) {
    for (let j = 0; j <= LATHE_SEGMENTS; j++) {
      profileVertexMap[i * (LATHE_SEGMENTS + 1) + j] = i
    }
  }
}

/** Incremental geometry update — directly modifies position buffer, 10x faster than full rebuild */
function incrementalGeometryUpdate(profilePts) {
  if (!outerMesh || !outerMesh.geometry) return

  const geo = outerMesh.geometry
  const pos = geo.attributes.position
  const profileCount = profilePts.length

  if (!profileVertexMap || profileVertexMap.length !== (LATHE_SEGMENTS + 1) * profileCount) {
    buildProfileVertexMap(profileCount)
  }
  if (!segmentAngles) buildSegmentCache()

  // Update vertex positions directly in the buffer (segments+1 columns)
  for (let i = 0; i < profileCount; i++) {
    const r = profilePts[i].x
    const y = profilePts[i].y
    const baseIdx = i * (LATHE_SEGMENTS + 1)
    for (let j = 0; j <= LATHE_SEGMENTS; j++) {
      const idx = baseIdx + j
      const angle = segmentAngles[j]
      pos.setXYZ(idx, Math.cos(angle) * r, y, Math.sin(angle) * r)
    }
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  geo.computeBoundingSphere()

  // Update inner mesh (shares same vertex structure)
  if (innerMesh && innerMesh.geometry) {
    const innerPos = innerMesh.geometry.attributes.position
    for (let i = 0; i < profileCount; i++) {
      const r = profilePts[i].x
      const y = profilePts[i].y
      const baseIdx = i * (LATHE_SEGMENTS + 1)
      for (let j = 0; j <= LATHE_SEGMENTS; j++) {
        const idx = baseIdx + j
        const angle = segmentAngles[j]
        innerPos.setXYZ(idx, Math.cos(angle) * r, y, Math.sin(angle) * r)
      }
    }
    innerPos.needsUpdate = true
    innerMesh.geometry.computeVertexNormals()
    innerMesh.geometry.computeBoundingSphere()
  }

  // Update bottom closure
  updateBottomClosure(profilePts)
}

function updateBottomClosure(pts) {
  if (!bottomMesh) return
  const minY = Math.min(...pts.map(p => p.y))
  const bottomPt = pts.find(p => p.y <= minY + 0.005)
  // If bottom converges to center, no disc needed
  if (bottomPt && bottomPt.x < 0.005) {
    bottomMesh.geometry.dispose()
    bottomMesh.geometry = new THREE.BufferGeometry()
    return
  }
  const bottomRadius = pts.find(p => p.y <= minY + 0.05)?.x || 0.3
  const newGeom = new THREE.CircleGeometry(bottomRadius * 1.05, 64)
  newGeom.rotateX(-Math.PI / 2)
  newGeom.translate(0, minY + 0.01, 0)
  bottomMesh.geometry.dispose()
  bottomMesh.geometry = newGeom
}

/** Create bottom closure disc */
function buildBottomClosure(pts) {
  const minY = Math.min(...pts.map(p => p.y))
  // Find the lowest profile point to check if bottom is naturally closed
  const bottomPt = pts.find(p => p.y <= minY + 0.005)
  // If bottom already converges to center (x≈0), LatheGeometry closes it naturally — no disc needed
  if (bottomPt && bottomPt.x < 0.005) return new THREE.BufferGeometry()
  const bottomRadius = pts.find(p => p.y <= minY + 0.05)?.x || 0.3
  const discGeom = new THREE.CircleGeometry(bottomRadius * 1.05, 64)
  discGeom.rotateX(-Math.PI / 2)
  discGeom.translate(0, minY + 0.01, 0)
  return discGeom
}

// ─── Frame-throttled update scheduler ───
function scheduleUpdate() {
  needsUpdate = true
  if (!rebuildFrameId) {
    rebuildFrameId = requestAnimationFrame(doUpdate)
  }
}

function doUpdate() {
  rebuildFrameId = null
  if (!needsUpdate) return
  needsUpdate = false
  const pts = currentProfilePoints.value
  if (pts.length > 0) {
    incrementalGeometryUpdate(pts)
    drawAllRingLines()
    vertexCount.value = (outerMesh?.geometry?.attributes?.position?.count || 0) * 2 + (bottomMesh?.geometry?.attributes?.position?.count || 0)
  }
}

// ─── Scene Init ───
function initScene() {
  const container = viewportContainer.value
  if (!container) return

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1a1a1e)

  const aspect = container.clientWidth / Math.max(container.clientHeight, 1)
  camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 50)
  camera.position.set(0, 0.1, 3.5)
  camera.lookAt(0, 0, 0)

  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.2
  container.appendChild(renderer.domElement)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 0, 0)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = 1.2
  controls.maxDistance = 8
  controls.maxPolarAngle = Math.PI * 0.78

  // Lighting
  scene.add(new THREE.AmbientLight(0xffffff, 0.5))
  const key = new THREE.DirectionalLight(0xfff5e3, 2.0)
  key.position.set(5, 6, 5); key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.camera.near = 0.5; key.shadow.camera.far = 30
  key.shadow.camera.left = -6; key.shadow.camera.right = 6
  key.shadow.camera.top = 6; key.shadow.camera.bottom = -6
  scene.add(key)
  const fillLight = new THREE.DirectionalLight(0xd4e0ff, 0.8)
  fillLight.position.set(-3, 3, 2); scene.add(fillLight)
  const rimLight = new THREE.DirectionalLight(0x88bbff, 0.4)
  rimLight.position.set(0, 0, -4); scene.add(rimLight)

  const grid = new THREE.GridHelper(6, 20, 0x444444, 0x2a2a2a)
  grid.position.y = -1.2; scene.add(grid)

  renderer.domElement.addEventListener('click', onCanvasClick)
  renderer.domElement.addEventListener('contextmenu', onCanvasRightClick)

  loadCurrentModel()
  animate()
}

// ─── Full Model Build (outer + inner + bottom = closed shell) ───
// Only called on shape switch, reset, undo/redo — NOT on parameter drags
function rebuildFullModel() {
  if (!scene) return
  [outerMesh, innerMesh, bottomMesh].forEach(m => { if (m) { scene.remove(m); if (m.geometry) m.geometry.dispose(); if (m.material) m.material.dispose() } })
  outerMesh = null; innerMesh = null; bottomMesh = null
  removeAllRingLines()
  // Clear incremental caches
  profileVertexMap = null
  segmentAngles = null
  baseProfileCache = null

  const pts = currentProfilePoints.value
  if (pts.length === 0) return

  const geometry = buildGeometryFromProfile(pts)

  const outerMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#F5F0E8'), roughness: 0.30, metalness: 0.05,
    side: THREE.FrontSide, flatShading: false, envMapIntensity: 0.5,
  })
  outerMesh = markRaw(new THREE.Mesh(geometry, outerMat))
  outerMesh.castShadow = true; outerMesh.receiveShadow = true
  scene.add(outerMesh)

  const innerMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#EDE8DD'), roughness: 0.35, metalness: 0.05,
    side: THREE.BackSide, flatShading: false,
  })
  innerMesh = markRaw(new THREE.Mesh(geometry.clone(), innerMat))
  innerMesh.renderOrder = 0
  scene.add(innerMesh)

  const bottomGeom = buildBottomClosure(pts)
  const bottomMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#E8E0D5'), roughness: 0.40, metalness: 0.05,
    side: THREE.DoubleSide, flatShading: false,
  })
  bottomMesh = markRaw(new THREE.Mesh(bottomGeom, bottomMat))
  bottomMesh.renderOrder = -1
  scene.add(bottomMesh)

  // Build incremental update caches
  buildSegmentCache()
  buildProfileVertexMap(pts.length)
  baseProfileCache = pts.map(p => ({ y: p.y, r: p.x }))

  vertexCount.value = (geometry.attributes.position?.count || 0) * 2 + (bottomGeom.attributes.position?.count || 0)
  const idx = geometry.index
  faceCount.value = (idx ? Math.floor(idx.count / 3) : Math.floor((geometry.attributes.position?.count || 0) / 3)) * 2 + 64

  // 取消任何待处理的增量更新，防止其覆写刚构建的几何体
  if (rebuildFrameId) { cancelAnimationFrame(rebuildFrameId); rebuildFrameId = null }
  needsUpdate = false

  drawAllRingLines()

  // 双帧渲染刷新 WebGL 管线，确保新几何体立即正确显示
  if (renderer && scene && camera) {
    renderer.render(scene, camera)
    requestAnimationFrame(() => {
      if (renderer && scene && camera) {
        renderer.render(scene, camera)
      }
    })
  }
}

// ─── Ring Line Drawing (with width visualization) ───
function drawAllRingLines() {
  removeAllRingLines()
  if (!scene) return

  const pts = currentProfilePoints.value
  if (pts.length === 0) return
  const heights = pts.map(p => p.y)
  const minY = Math.min(...heights)
  const maxY = Math.max(...heights)
  const totalHeight = maxY - minY

  rings.value.forEach(ring => {
    const centerY = minY + totalHeight * (ring.heightPercent / 100)
    const halfWidth = ring.width * 0.005 // Convert cm to profile-space units
    const topY = Math.min(maxY, centerY + halfWidth)
    const bottomY = Math.max(minY, centerY - halfWidth)
    const centerR = getRadiusAtHeight(centerY, pts)
    const topR = getRadiusAtHeight(topY, pts)
    const bottomR = getRadiusAtHeight(bottomY, pts)
    const isActive = ring.id === selectedRingId.value

    // Helper: create ring line
    const makeRingLine = (y, r, color, opacity, dashPattern) => {
      const segments = 128
      const positions = []
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2
        positions.push(Math.cos(angle) * r, y, Math.sin(angle) * r)
      }
      const geom = new THREE.BufferGeometry()
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      const mat = new THREE.LineBasicMaterial({
        color, transparent: true, opacity, depthTest: true, depthWrite: false,
      })
      const line = markRaw(new THREE.Line(geom, mat))
      line.renderOrder = 1
      line.material.depthTest = true
      line.material.depthWrite = false
      return line
    }

    const activeColor = 0x4488ff; const inactiveColor = 0x666666

    // Center ring (main) — thicker/brighter
    const centerLine = makeRingLine(centerY, centerR, isActive ? 0x44aaff : inactiveColor, isActive ? 0.95 : 0.4)
    scene.add(centerLine)

    // Top boundary line (thin)
    const topLine = makeRingLine(topY, topR, isActive ? activeColor : inactiveColor, isActive ? 0.55 : 0.25)
    scene.add(topLine)

    // Bottom boundary line (thin)
    const bottomLine = makeRingLine(bottomY, bottomR, isActive ? activeColor : inactiveColor, isActive ? 0.55 : 0.25)
    scene.add(bottomLine)

    // Gradient band — visualizes Gaussian weight distribution
    let band = null
    if (Math.abs(topY - bottomY) > 0.001) {
      // Use vertex colors to create gradient: strong at center, fading to edges
      const bandSegments = 64
      const heightSteps = 12 // Vertical subdivisions for gradient
      const bandVerts = []
      const bandColors = []
      const bandIndices = []

      const sigma = (topY - bottomY) / 4 // Gaussian sigma for visual gradient
      const centerBandY = (topY + bottomY) / 2

      for (let hi = 0; hi <= heightSteps; hi++) {
        const t = hi / heightSteps
        const y = bottomY + t * (topY - bottomY)
        // Linear interpolation of radius between bottom and top
        const r = bottomR + t * (topR - bottomR)
        // Gaussian weight at this height (visual only)
        const dist = (y - centerBandY) / sigma
        const weight = Math.exp(-0.5 * dist * dist)

        for (let j = 0; j <= bandSegments; j++) {
          const angle = (j / bandSegments) * Math.PI * 2
          bandVerts.push(Math.cos(angle) * r, y, Math.sin(angle) * r)
          // Color intensity follows Gaussian: strongest at center
          const alpha = weight * (isActive ? 0.2 : 0.08)
          bandColors.push(0.27, 0.53, 1.0, alpha) // RGBA blue
        }
      }

      for (let hi = 0; hi < heightSteps; hi++) {
        for (let j = 0; j < bandSegments; j++) {
          const a = hi * (bandSegments + 1) + j
          const b = a + 1
          const c = a + (bandSegments + 1)
          const d = c + 1
          bandIndices.push(a, b, d, a, d, c)
        }
      }

      const bandGeom = new THREE.BufferGeometry()
      bandGeom.setAttribute('position', new THREE.Float32BufferAttribute(bandVerts, 3))
      bandGeom.setAttribute('color', new THREE.Float32BufferAttribute(bandColors, 4))
      bandGeom.setIndex(bandIndices)
      bandGeom.computeVertexNormals()
      const bandMat = new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: false,
      })
      band = markRaw(new THREE.Mesh(bandGeom, bandMat))
      band.renderOrder = 0
      scene.add(band)
    }

    ringLines.push({ id: ring.id, line: centerLine, topLine, bottomLine, band })
  })
}

function removeAllRingLines() {
  ringLines.forEach(({ line, topLine, bottomLine, band }) => {
    ;[line, topLine, bottomLine, band].forEach(obj => {
      if (obj) { scene?.remove(obj); if (obj.geometry) obj.geometry.dispose(); if (obj.material) obj.material.dispose() }
    })
  })
  ringLines = []
}

// ─── Deformation (cumulative from all rings) ───
// Continuous Gaussian with no hard cutoffs — eliminates all fragmentation
function applyAllDeformations(fastMode = true) {
  const orig = originalProfilePoints.value
  if (orig.length === 0) return

  let pts = orig.map(p => p.clone())
  const heights = pts.map(p => p.y)
  const minY = Math.min(...heights)
  const maxY = Math.max(...heights)
  const totalHeight = maxY - minY

  // Pre-compute per-ring data
  const ringData = rings.value.map(ring => {
    const targetY = minY + totalHeight * (ring.heightPercent / 100)
    // Sigma: minimum floor prevents sharp transitions that cause fragmentation
    // Uses global transitionSoftness as multiplier, ring smoothness as fine-tune
    const globalFactor = transitionSoftness.value
    const ringFactor = ring.smoothness
    // Effective sigma = base width from transitionRadius * softness blending
    // Minimum sigma = 0.04 (profile-space units) ensures no visible seams
    const sigma = Math.max(0.04,
      ring.transitionRadius * 0.02 * (0.5 + globalFactor * 0.8) * (0.3 + ringFactor * 0.7)
    )
    // Pre-compute Gaussian denominator
    const twoSigmaSq = 2 * sigma * sigma
    return { targetY, sigma, twoSigmaSq, bump: ring.bumpStrength * 0.012 }
  })

  // Apply all ring deformations in a single pass per point
  for (let i = 0; i < pts.length; i++) {
    let totalBump = 0
    let totalWeight = 0

    for (const rd of ringData) {
      const dist = pts[i].y - rd.targetY // signed distance
      const distSq = dist * dist
      // Continuous Gaussian — no hard cutoff, naturally decays to zero
      const influence = Math.exp(-distSq / rd.twoSigmaSq)
      // Weighted contribution for multi-ring blending
      totalBump += rd.bump * influence
      totalWeight += influence
    }

    if (totalWeight > 0.0001) {
      // Weighted blend: rings with stronger influence contribute more
      const blendedBump = totalBump / Math.max(totalWeight, 1.0) * Math.min(totalWeight, 1.0)
      pts[i].x = Math.max(0.003, pts[i].x + blendedBump)
    }
  }

  // Check if any ring actually has non-zero deformation
  const hasDeformation = ringData.some(rd => Math.abs(rd.bump) > 0.0001)

  // Only smooth when deformations actually happened
  if (hasDeformation) {
    const avgSmooth = rings.value.length > 0
      ? rings.value.reduce((s, r) => s + r.smoothness, 0) / rings.value.length
      : 0.8
    const smoothStrength = fastMode
      ? Math.min(avgSmooth * 2.5, 3.5)
      : avgSmooth * 3.5
    // Custom shapes: preserve bottom, mild smoothing on body/mouth only
    smoothProfileContinuous(pts, smoothStrength, fastMode, isCustomShape.value)
  }

  currentProfilePoints.value = pts

  if (fastMode) {
    scheduleUpdate()
  } else {
    rebuildFullModel()
  }
}

/** Continuous Gaussian smoothing — no moving-average edges, preserves curvature.
 *  For custom shapes, bottom is excluded from smoothing; body/mouth get mild smoothing only. */
function smoothProfileContinuous(pts, strength, fastMode, preserveBottom = false) {
  const n = pts.length
  const kernelSigma = Math.max(1.5, n * 0.02 * (1.5 - Math.min(strength, 4) / 4 * 0.8))
  const iterations = fastMode ? Math.ceil(strength * 1.5) : Math.ceil(strength * 3)

  // Compute per-point region weight: 0 = no smoothing, 1 = full smoothing
  const regionWeight = new Float64Array(n)
  if (preserveBottom) {
    const heights = pts.map(p => p.y)
    const minY = Math.min(...heights)
    const maxY = Math.max(...heights)
    const range = maxY - minY || 1
    for (let i = 0; i < n; i++) {
      const t = (pts[i].y - minY) / range // 0 at bottom, 1 at top
      if (t < 0.15) {
        regionWeight[i] = 0 // bottom: no smoothing
      } else if (t < 0.22) {
        regionWeight[i] = (t - 0.15) / 0.07 // smooth transition zone
      } else {
        regionWeight[i] = 0.4 // body & mouth: mild smoothing (40% strength)
      }
    }
  } else {
    regionWeight.fill(1) // full smoothing for built-in models
  }

  const smoothed = new Float64Array(n)
  const orig = new Float64Array(n)
  for (let i = 0; i < n; i++) orig[i] = pts[i].x

  const maxIter = Math.min(iterations, 8)
  for (let iter = 0; iter < maxIter; iter++) {
    for (let i = 0; i < n; i++) {
      if (regionWeight[i] < 0.001) { smoothed[i] = orig[i]; continue }
      let sum = 0, weightSum = 0
      const windowRadius = Math.ceil(kernelSigma * 2.5)
      for (let j = Math.max(0, i - windowRadius); j <= Math.min(n - 1, i + windowRadius); j++) {
        const dist = (i - j) / kernelSigma
        const w = Math.exp(-0.5 * dist * dist)
        sum += orig[j] * w
        weightSum += w
      }
      const gaussSmoothed = weightSum > 0 ? sum / weightSum : orig[i]
      // Blend between original and smoothed based on region weight
      smoothed[i] = orig[i] + (gaussSmoothed - orig[i]) * regionWeight[i]
    }
    for (let i = 0; i < n; i++) orig[i] = smoothed[i]
  }

  for (let i = 0; i < n; i++) {
    pts[i].x = Math.max(0.003, orig[i])
  }
}

// ─── Ring Management ───
const MAX_RINGS = 8

function selectRing(id) {
  selectedRingId.value = id
  drawAllRingLines()
  const r = rings.value.find(r => r.id === id)
  statusText.value = '已选中调节环 (高度: ' + (r?.heightPercent || 0).toFixed(0) + '%)'
}

function updateRingParam(param, value) {
  const ring = rings.value.find(r => r.id === selectedRingId.value)
  if (!ring) return
  ring[param] = value
  applyAllDeformations(true) // fast mode for slider drag
}

function addRing(heightPercent) {
  if (rings.value.length >= MAX_RINGS) {
    ElMessage.warning('最多同时激活8个调节环，请删除部分环后再添加')
    return
  }
  pushUndo('放置调节环')
  const ring = {
    id: 'ring_' + Date.now(),
    heightPercent,
    width: 1.0,
    bumpStrength: 0,
    smoothness: 0.8,
    transitionRadius: 2.0,
  }
  rings.value.push(ring)
  selectedRingId.value = ring.id
  applyAllDeformations(false) // Full rebuild for new ring
  statusText.value = '调节环已放置 (高度: ' + heightPercent.toFixed(0) + '%)'
}

function deleteRing(id) {
  // Ring deletion only removes the tool — shape deformations are already baked
  rings.value = rings.value.filter(r => r.id !== id)
  if (selectedRingId.value === id) selectedRingId.value = rings.value.length > 0 ? rings.value[rings.value.length - 1].id : null
  drawAllRingLines()
  statusText.value = '调节环已删除（形状已保留）'
}

function clearAllRings() {
  // Clear all rings but preserve the current shape
  rings.value = []
  selectedRingId.value = null
  drawAllRingLines()
  statusText.value = '所有调节环已清除（形状已保留）'
  ElMessage.success('所有调节环已清除，模型形状保持不变')
}

/** Apply/bake all ring deformations permanently into the model */
function bakeDeformations() {
  if (rings.value.length === 0) {
    ElMessage.info('没有待应用的变形')
    return
  }
  pushUndo('应用变形')
  // Copy current deformed profile as the new original
  originalProfilePoints.value = currentProfilePoints.value.map(p => p.clone())
  // Clear all rings since deformations are now baked
  rings.value = []
  selectedRingId.value = null
  redoStack.value = [] // Clear redo since rings are gone
  drawAllRingLines()
  statusText.value = '变形已永久应用到模型'
  ElMessage.success('变形已固化到模型，可继续添加新的调节环')
}

// ─── Mouth ───
function applyMouthAdjustment() {
  const orig = originalProfilePoints.value
  if (orig.length === 0) return

  let pts = currentProfilePoints.value.map(p => p.clone())
  if (rings.value.length === 0) pts = orig.map(p => p.clone())

  const heights = pts.map(p => p.y)
  const maxY = Math.max(...heights)
  const minY = Math.min(...heights)
  const mouthStartY = maxY - (maxY - minY) * 0.15

  for (let i = 0; i < pts.length; i++) {
    if (pts[i].y >= mouthStartY) {
      const t = (pts[i].y - mouthStartY) / (maxY - mouthStartY || 0.001)
      const blend = t < 0.1 ? (t / 0.1) : 1
      pts[i].x *= 1 + (mouthDiameter.value - 1) * blend
      if (t > 0.7) {
        pts[i].x *= 1 + (mouthThickness.value - 1) * (t - 0.7) / 0.3 * 0.5
      }
    }
  }
  const mouthRegionHeight = maxY - mouthStartY
  for (let i = 0; i < pts.length; i++) {
    if (pts[i].y >= mouthStartY) {
      const t = (pts[i].y - mouthStartY) / (mouthRegionHeight || 0.001)
      pts[i].y = mouthStartY + t * mouthRegionHeight * mouthHeight.value
    }
  }

  smoothProfileContinuous(pts, 2.5, false)
  currentProfilePoints.value = pts
  rebuildFullModel()
}

/** Apply full-quality smoothing after user releases a slider */
function onSliderRelease() {
  const pts = currentProfilePoints.value
  if (pts.length > 0 && rings.value.length > 0) {
    // Re-apply all deformations in full-quality mode
    applyAllDeformations(false)
  }
}

/** Global softness changed — re-deform all rings with new softness */
function onGlobalSoftnessChange() {
  if (rings.value.length > 0) {
    applyAllDeformations(true)
  }
}

function onMouthParamDebounced() {
  if (mouthDebounceTimer) clearTimeout(mouthDebounceTimer)
  mouthDebounceTimer = setTimeout(() => {
    if (!mouthActive.value) return
    pushUndo('调整瓶口参数')
    applyMouthAdjustment()
  }, 150)
}

// ─── Shape Switching ───
function switchToBuiltinModel(shape) {
  pushUndo('切换器型: ' + shape.name)
  currentShapeId.value = shape.id
  isCustomShape.value = false
  rings.value = []
  selectedRingId.value = null
  mouthActive.value = false
  removeAllRingLines()
  const pts = shape.profile
  if (pts && pts.length > 0) {
    originalProfilePoints.value = pts.map(p => new THREE.Vector2(p.x, p.y))
    // Apply moderate Gaussian smoothing to built-in models by default
    const smoothed = pts.map(p => new THREE.Vector2(p.x, p.y))
    smoothProfileContinuous(smoothed, 2.0, false)
    currentProfilePoints.value = smoothed
  }
  redoStack.value = []
  rebuildFullModel()
  adjustCameraForShape(shape.shape)
  shapePanelVisible.value = false
  statusText.value = '已切换: ' + shape.name
}

function adjustCameraForShape(shape) {
  const configs = { vase: { d: 3.2, y: 0 }, jar: { d: 3.6, y: 0 }, bowl: { d: 2.8, y: -0.1 }, plate: { d: 3.8, y: -0.05 }, cup: { d: 2.2, y: 0.1 }, teapot: { d: 3.2, y: 0 } }
  const cfg = configs[shape] || configs.vase
  if (camera && controls) { camera.position.set(0, cfg.y, cfg.d); controls.target.set(0, cfg.y, 0); controls.update() }
}

function resetShape() {
  pushUndo('重置器型')
  rings.value = []; selectedRingId.value = null; mouthActive.value = false
  removeAllRingLines()
  if (isCustomShape.value) {
    // For custom shapes, reset to the original generated profile (no smoothing)
    currentProfilePoints.value = originalProfilePoints.value.map(p => p.clone())
  } else {
    // For built-in models, reload original profile and apply smoothing
    const model = shapeList.value.find(s => s.id === currentShapeId.value)
    const pts = model?.profile || builtinModels[0]?.profile
    if (pts && pts.length > 0) {
      originalProfilePoints.value = pts.map(p => new THREE.Vector2(p.x, p.y))
      const smoothed = pts.map(p => new THREE.Vector2(p.x, p.y))
      smoothProfileContinuous(smoothed, 2.0, false)
      currentProfilePoints.value = smoothed
    }
  }
  redoStack.value = []
  rebuildFullModel()
  statusText.value = '已重置为原始器型'
  ElMessage.success('已恢复到原始状态')
}

/** Handle generated custom shape from image-to-3D */
function onCustomShapeGenerated({ profile, name }) {
  if (!profile || profile.length < 3) {
    ElMessage.warning('生成的轮廓数据不足，请重试')
    return
  }

  pushUndo('自定义器型: ' + (name || '自定义'))
  customShapePanel.value = false
  isCustomShape.value = true
  customShapeName.value = '自定义器型'
  rings.value = []
  selectedRingId.value = null
  mouthActive.value = false
  removeAllRingLines()

  // Convert to Vector2 array — preserve exact generated profile, no auto-smoothing
  const pts = profile.map(p => {
    if (p instanceof THREE.Vector2) return p
    return new THREE.Vector2(p.x ?? p.r ?? 0, p.y ?? 0)
  })

  originalProfilePoints.value = pts
  currentProfilePoints.value = pts.map(p => p.clone())
  redoStack.value = []
  rebuildFullModel()

  // Adjust camera
  const heights = pts.map(p => p.y)
  const maxR = Math.max(...pts.map(p => p.x))
  const distance = Math.max(2.0, maxR * 3.2)
  if (camera && controls) {
    camera.position.set(0, 0, distance)
    controls.target.set(0, 0, 0)
    controls.update()
  }

  statusText.value = '已加载自定义器型: ' + (name || 'AI生成')
  ElMessage.success('自定义器型已生成！可使用所有塑形功能继续编辑')
}

// ─── Canvas Interaction ───
function onCanvasClick(event) {
  if (!renderer || !camera || !scene || !outerMesh) return

  const rect = renderer.domElement.getBoundingClientRect()
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

  raycaster.setFromCamera(mouse, camera)
  const intersects = raycaster.intersectObjects([outerMesh, innerMesh].filter(Boolean), false)

  if (intersects.length > 0) {
    const point = intersects[0].point
    const pts = currentProfilePoints.value
    if (pts.length === 0) return

    const heights = pts.map(p => p.y)
    const minY = Math.min(...heights)
    const maxY = Math.max(...heights)
    const totalHeight = maxY - minY
    const clickPercent = ((point.y - minY) / totalHeight) * 100

    // Check if clicking near an existing ring (within 3% tolerance)
    const nearRing = rings.value.find(r => Math.abs(r.heightPercent - clickPercent) < 3)
    if (nearRing) {
      selectRing(nearRing.id)
      return
    }

    // Mouth detection (top 10%)
    const mouthThreshold = maxY - totalHeight * 0.10
    if (point.y >= mouthThreshold) {
      pushUndo('瓶口调节')
      mouthActive.value = true
      selectedRingId.value = null
      drawAllRingLines()
      statusText.value = '已选中瓶口区域'
    } else {
      // Add new ring
      addRing(clickPercent)
      mouthActive.value = false
    }
  } else {
    // Clicked empty space — deselect ring but keep all rings
    if (selectedRingId.value) {
      selectedRingId.value = null
      mouthActive.value = false
      drawAllRingLines()
      statusText.value = '已取消选中调节环'
    }
  }
}

function onCanvasRightClick(event) {
  event.preventDefault()
  if (!renderer || !camera || !scene) return

  const rect = renderer.domElement.getBoundingClientRect()
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

  raycaster.setFromCamera(mouse, camera)
  // Check if right-click is near any ring line
  const pts = currentProfilePoints.value
  if (pts.length === 0) return

  const heights = pts.map(p => p.y)
  const minY = Math.min(...heights)
  const maxY = Math.max(...heights)

  // Use the intersect point if it hits the model
  const intersects = raycaster.intersectObjects([outerMesh, innerMesh].filter(Boolean), false)
  if (intersects.length > 0) {
    const point = intersects[0].point
    const totalHeight = maxY - minY
    const clickPercent = ((point.y - minY) / totalHeight) * 100
    const nearRing = rings.value.find(r => Math.abs(r.heightPercent - clickPercent) < 3)
    if (nearRing) {
      deleteRing(nearRing.id)
      ElMessage.info('已删除调节环')
    }
  }
}

// ─── Tools ───
function setTool(tool) {
  currentTool.value = tool
  if (controls) {
    switch (tool) {
      case 'orbit': controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }; break
      case 'pan': controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }; break
      case 'zoom': controls.mouseButtons = { LEFT: THREE.MOUSE.DOLLY, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE }; break
    }
  }
}

// ─── Undo/Redo ───
function pushUndo(label) {
  undoStack.value.push(captureSnapshot(label))
  if (undoStack.value.length > MAX_HISTORY) undoStack.value.shift()
  redoStack.value = []
}
function undo() {
  if (undoStack.value.length === 0) return
  redoStack.value.push(captureSnapshot('重做'))
  restoreSnapshot(undoStack.value.pop())
  statusText.value = '已撤销'
}
function redo() {
  if (redoStack.value.length === 0) return
  undoStack.value.push(captureSnapshot('撤销'))
  restoreSnapshot(redoStack.value.pop())
  statusText.value = '已重做'
}
function captureSnapshot(label) {
  return {
    label, shapeId: currentShapeId.value,
    profile: currentProfilePoints.value.map(p => p.clone()),
    original: originalProfilePoints.value.map(p => p.clone()),
    rings: rings.value.map(r => ({ ...r })),
    selectedRingId: selectedRingId.value,
    mouthActive: mouthActive.value,
    mouthDiameter: mouthDiameter.value, mouthHeight: mouthHeight.value, mouthThickness: mouthThickness.value,
    isCustomShape: isCustomShape.value,
    customShapeName: customShapeName.value,
  }
}
function restoreSnapshot(s) {
  currentShapeId.value = s.shapeId
  currentProfilePoints.value = s.profile.map(p => p.clone())
  originalProfilePoints.value = s.original.map(p => p.clone())
  rings.value = s.rings.map(r => ({ ...r }))
  selectedRingId.value = s.selectedRingId
  mouthActive.value = s.mouthActive
  mouthDiameter.value = s.mouthDiameter; mouthHeight.value = s.mouthHeight; mouthThickness.value = s.mouthThickness
  isCustomShape.value = s.isCustomShape ?? false
  customShapeName.value = s.customShapeName ?? '自定义器型'
  rebuildFullModel()
}

// ─── Presets ───
function savePreset() {
  const data = {
    shapeId: currentShapeId.value, name: currentShapeName.value + '_' + new Date().toLocaleDateString('zh-CN').replace(/\//g, ''),
    profile: currentProfilePoints.value.map(p => ({ x: p.x, y: p.y })),
    rings: rings.value.map(r => ({ ...r })), timestamp: Date.now(),
  }
  const presets = JSON.parse(localStorage.getItem('ceramic_shaper_presets_v3') || '[]')
  presets.push(data)
  localStorage.setItem('ceramic_shaper_presets_v3', JSON.stringify(presets.slice(-20)))
  ElMessage.success('预设已保存: ' + data.name)
}

// ─── Export ───
async function exportToEditor() {
  if (!scene || !outerMesh) { ElMessage.warning('没有可导出的模型'); return }

  // Loading indicator
  const loadingMsg = ElMessage({ message: '正在导出模型...', type: 'info', duration: 0 })

  try {
    // Bake any pending deformations first
    if (rings.value.length > 0) {
      originalProfilePoints.value = currentProfilePoints.value.map(p => p.clone())
      rings.value = []
      selectedRingId.value = null
      drawAllRingLines()
    }

    // Take screenshot for thumbnail
    let thumbnail = null
    try {
      const oldBg = scene.background
      scene.background = new THREE.Color(0x1a1a1e)
      renderer.render(scene, camera)
      thumbnail = renderer.domElement.toDataURL('image/png')
      scene.background = oldBg
    } catch { /* ignore thumbnail failure */ }

    // Build export group with clean, complete geometry
    const exportGroup = new THREE.Group()

    // Use a clean geometry build from the profile (not from mesh clones which may have mutated buffers)
    const pts = currentProfilePoints.value
    const cleanGeom = buildGeometryFromProfile(pts)

    // Outer surface
    const outerMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#F5F0E8'), roughness: 0.30, metalness: 0.05,
      side: THREE.FrontSide, flatShading: false,
    })
    const outerClone = new THREE.Mesh(cleanGeom, outerMat)
    outerClone.castShadow = true; outerClone.receiveShadow = true
    exportGroup.add(outerClone)

    // Inner surface
    const innerGeom = cleanGeom.clone()
    const innerMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#EDE8DD'), roughness: 0.35, metalness: 0.05,
      side: THREE.BackSide, flatShading: false,
    })
    const innerClone = new THREE.Mesh(innerGeom, innerMat)
    exportGroup.add(innerClone)

    // Bottom closure
    const bottomGeom = buildBottomClosure(pts)
    const bottomMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#E8E0D5'), roughness: 0.40, metalness: 0.05,
      side: THREE.DoubleSide, flatShading: false,
    })
    const bottomClone = new THREE.Mesh(bottomGeom, bottomMat)
    exportGroup.add(bottomClone)

    // Export to GLB
    const exporter = new GLTFExporter()
    const glbData = await new Promise((resolve, reject) => {
      exporter.parse(exportGroup, (r) => {
        if (r instanceof ArrayBuffer) resolve(r)
        else if (r && r.arrayBuffer) resolve(r.arrayBuffer)
        else reject(new Error('导出数据格式异常'))
      }, (e) => reject(e), { binary: true, includeCustomExtensions: false, embedImages: true })
    })

    // Clean up export group
    exportGroup.traverse(child => {
      if (child.geometry && child.geometry !== cleanGeom && child.geometry !== innerGeom && child.geometry !== bottomGeom) {
        child.geometry.dispose()
      }
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose())
        else child.material.dispose()
      }
    })

    // Save to builtModels — profile-based, no GLB storage needed
    const modelId = 'built_' + Date.now()
    const modelName = currentShapeName.value
    const profileForStorage = currentProfilePoints.value.map(p => ({ x: p.x, y: p.y }))

    const saved = ceramicStore.addBuiltModel({
      id: modelId, name: modelName,
      profile: profileForStorage,
      thumbnail,
      author: '陶瓷快速塑形',
      createdAt: new Date().toISOString(),
    })

    if (!saved) {
      loadingMsg.close()
      ElMessage.error('保存失败：模型数据异常')
      return
    }

    // Select the model for immediate viewing (profile-based path)
    ceramicStore.selectBuiltModel(modelId)

    loadingMsg.close()
    ElMessage.success('模型导入成功！')
    setTimeout(() => router.push('/'), 600)
  } catch (e) {
    loadingMsg.close()
    console.error('Export error:', e)
    ElMessage.error('导出失败: ' + (e.message || '未知错误'))
  }
}

function goBack() { router.push('/') }

// ─── Keyboard ───
function onKeyDown(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
  const ctrl = e.ctrlKey || e.metaKey
  if (e.key === 'z' && ctrl && !e.shiftKey) { e.preventDefault(); undo() }
  else if ((e.key === 'y' && ctrl) || (e.key === 'Z' && ctrl && e.shiftKey)) { e.preventDefault(); redo() }
  else if (e.key === 'Escape') { shapePanelVisible.value = false }
  else if (e.key === 'Delete' && selectedRingId.value) { deleteRing(selectedRingId.value) }
}

function animate() { animFrameId = requestAnimationFrame(animate); if (renderer && scene && camera) { controls?.update(); renderer.render(scene, camera) } }
function onResize() {
  const el = viewportContainer.value
  if (!el || !renderer || !camera) return
  const w = el.clientWidth, h = el.clientHeight
  if (w === 0 || h === 0) return
  renderer.setSize(w, h); camera.aspect = w / Math.max(h, 1); camera.updateProjectionMatrix()
}

function loadCurrentModel() {
  isCustomShape.value = false
  const model = shapeList.value.find(s => s.id === currentShapeId.value)
  const pts = model?.profile || builtinModels[0]?.profile
  if (pts?.length > 0) {
    originalProfilePoints.value = pts.map(p => new THREE.Vector2(p.x, p.y))
    // Apply moderate Gaussian smoothing to built-in models on initial load
    const smoothed = pts.map(p => new THREE.Vector2(p.x, p.y))
    smoothProfileContinuous(smoothed, 2.0, false)
    currentProfilePoints.value = smoothed
  }
  rebuildFullModel()
  adjustCameraForShape(model?.shape || 'vase')
}

onMounted(async () => { await nextTick(); initScene(); window.addEventListener('resize', onResize); window.addEventListener('keydown', onKeyDown); shaperEl.value?.focus() })
onUnmounted(() => {
  if (animFrameId) cancelAnimationFrame(animFrameId)
  if (rebuildFrameId) cancelAnimationFrame(rebuildFrameId)
  window.removeEventListener('resize', onResize); window.removeEventListener('keydown', onKeyDown)
  controls?.dispose()
  if (renderer) { renderer.dispose(); const el = viewportContainer.value; if (el && renderer.domElement.parentNode === el) el.removeChild(renderer.domElement) }
  [outerMesh, innerMesh, bottomMesh].forEach(m => { if (m) { if (m.geometry) m.geometry.dispose(); if (m.material) m.material.dispose() } })
  removeAllRingLines()
  thumbnailCache.value = {}
})
</script>

<style scoped>
.ceramic-shaper { display:flex; flex-direction:column; height:calc(100vh - 56px); overflow:hidden; background:#1a1a1e; color:#ddd; font-family:'Segoe UI',system-ui,sans-serif; outline:none; }
.ceramic-shaper * { box-sizing:border-box; }

.top-nav { display:flex; align-items:center; justify-content:space-between; height:40px; padding:0 12px; background:#252528; border-bottom:1px solid #333; flex-shrink:0; }
.nav-logo { font-size:14px; font-weight:700; color:#d4a76a; }
.nav-right { display:flex; gap:8px; }
.nav-btn-back { background:#555 !important; color:#ddd !important; border:none !important; }
.nav-btn-save { background:#f5f0e8 !important; border-radius:8px !important; font-size:13px !important; }
.nav-btn-custom { background:#4466aa !important; color:#ddeeff !important; border:none !important; }
.nav-btn-custom:hover { background:#5577bb !important; }
.nav-btn-export { background:#b8956a !important; border-color:#a07850 !important; font-size:13px !important; }
.nav-btn-export:hover { background:#c9a87a !important; }

.work-area { display:flex; flex:1; overflow:hidden; }
.left-panel { width:210px; min-width:210px; background:#212124; border-right:1px solid #333; display:flex; flex-direction:column; padding:10px; gap:8px; overflow-y:auto; }
.left-panel::-webkit-scrollbar { width:3px; }
.left-panel::-webkit-scrollbar-thumb { background:#444; border-radius:2px; }

.shape-switch-btn {
  width:100%; padding:12px; font-size:15px; font-weight:700; border-radius:10px;
  border:2px solid #d4782a; background:linear-gradient(135deg,#e88830,#c06820); color:#fff;
  cursor:pointer; transition:all 0.2s;
}
.shape-switch-btn:hover { background:linear-gradient(135deg,#f09840,#d47830); box-shadow:0 4px 15px rgba(212,120,42,0.4); }
.shape-switch-btn:active { transform:scale(0.97); }
.current-shape-label { font-size:11px; color:#999; text-align:center; }
.current-shape-label strong { color:#d4a76a; }
.custom-name-input { width:120px; padding:3px 8px; border-radius:5px; border:1px solid #d4a76a; background:#1a1a1e; color:#d4a76a; font-size:11px; font-weight:600; text-align:center; outline:none; font-family:inherit; }
.custom-name-input:focus { border-color:#d4782a; box-shadow:0 0 0 2px rgba(212,120,42,0.2); }
.panel-divider { height:1px; background:#3a3a3e; margin:4px 0; }
.panel-divider-h { width:100%; height:1px; background:#3a3a3e; margin:8px 0; }

.param-section { background:#2a2a2e; border-radius:10px; padding:10px; border:1px solid #3a3a3e; }
.section-label { font-size:13px; font-weight:600; color:#d4a76a; margin-bottom:6px; }
.param-hint { font-size:11px; color:#888; margin-bottom:6px; text-align:center; line-height:1.4; }
.slider-group { margin-bottom:8px; }
.slider-group label { display:block; font-size:11px; color:#999; margin-bottom:3px; }
.slider-val { display:inline-block; font-size:11px; font-weight:600; color:#4A8BC2; margin-left:4px; }
.slider-val.negative { color:#e8734a; }
.slider-val.positive { color:#5ab87a; }

.tb-range { -webkit-appearance:none; appearance:none; width:100%; height:4px; border-radius:2px; background:#444; outline:none; margin:2px 0; }
.tb-range::-webkit-slider-thumb { -webkit-appearance:none; width:14px; height:14px; border-radius:50%; background:#4A8BC2; cursor:pointer; border:2px solid #fff; box-shadow:0 1px 3px rgba(0,0,0,0.3); }

.intensity-btn { width:100%; padding:5px; border-radius:6px; border:1px solid #8b5e3c; background:transparent; color:#d4a76a; font-size:11px; cursor:pointer; font-weight:600; }
.intensity-btn:hover { background:rgba(212,167,106,0.1); }
.intensity-btn.active { background:rgba(212,167,106,0.25); border-color:#d4782a; color:#e88830; }
.intensity-btn.super { border-color:#c43a4a; color:#e8734a; }
.intensity-btn.super:hover { background:rgba(196,58,74,0.1); }
.intensity-btn.super.active { background:rgba(196,58,74,0.25); border-color:#e8734a; color:#ff6347; }

.remove-ring-btn { width:100%; padding:5px; border-radius:6px; border:1px solid #c43a4a; background:transparent; color:#c43a4a; font-size:11px; cursor:pointer; margin-top:6px; }
.remove-ring-btn:hover { background:rgba(196,58,74,0.15); }

.apply-deform-btn { width:100%; padding:6px; border-radius:6px; border:1px solid #5ab87a; background:rgba(90,184,122,0.1); color:#5ab87a; font-size:11px; cursor:pointer; margin-top:6px; font-weight:600; }
.apply-deform-btn:hover { background:rgba(90,184,122,0.25); }

.ring-list { display:flex; flex-direction:column; gap:4px; max-height:150px; overflow-y:auto; }
.ring-list-item {
  display:flex; justify-content:space-between; align-items:center; padding:5px 8px;
  border-radius:6px; border:1px solid #444; background:#2a2a2e; cursor:pointer; font-size:11px; color:#ccc;
}
.ring-list-item:hover { border-color:#4A8BC2; background:#333; }

.undo-redo-group { margin-top:auto; display:flex; gap:3px; flex-wrap:wrap; }
.undo-btn,.redo-btn,.reset-btn { flex:1; padding:7px 5px; border-radius:8px; border:1px solid #555; background:#2a2a2e; color:#ccc; font-size:11px; cursor:pointer; white-space:nowrap; min-width:48px; }
.undo-btn:hover:not(:disabled),.redo-btn:hover:not(:disabled),.reset-btn:hover:not(:disabled) { background:#3a3a3e; border-color:#888; }
.undo-btn:disabled,.redo-btn:disabled { opacity:0.4; cursor:not-allowed; }
.reset-btn { border-color:#d4a76a; color:#d4a76a; }

.viewport-container { flex:1; background:#111; position:relative; min-width:350px; min-height:400px; overflow:hidden; }
.viewport-container canvas { display:block; }

.right-panel { width:72px; min-width:72px; background:#212124; border-left:1px solid #333; display:flex; flex-direction:column; align-items:center; padding:10px 5px; gap:8px; }
.tool-group { display:flex; flex-direction:column; gap:3px; }
.tool-btn { width:44px; height:44px; border-radius:10px; border:1px solid #444; background:#2a2a2e; color:#aaa; font-size:18px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
.tool-btn:hover { background:#3a3a3e; color:#ddd; }
.tool-btn.active { background:#3a3028; border-color:#b8956a; color:#d4a76a; }
.tool-label { font-size:9px; color:#888; text-align:center; }
.tool-info { width:100%; display:flex; flex-direction:column; gap:5px; }
.info-row { display:flex; flex-direction:column; align-items:center; gap:1px; }
.info-row span { font-size:9px; color:#888; }
.info-row strong { font-size:10px; color:#ddd; }
.info-name-input { width:90px; padding:2px 6px; border-radius:4px; border:1px solid #d4a76a; background:#1a1a1e; color:#d4a76a; font-size:10px; font-weight:600; text-align:center; outline:none; font-family:inherit; }
.info-name-input:focus { border-color:#d4782a; }

.status-bar { display:flex; align-items:center; justify-content:space-between; height:22px; padding:0 10px; background:#252528; border-top:1px solid #333; font-size:10px; color:#aaa; flex-shrink:0; }
.status-hint { color:#666; font-size:9px; }
</style>

<!-- Full-screen shape panel (non-scoped, teleported to body) -->
<style>
.shape-overlay {
  position:fixed; top:0; left:0; width:100vw; height:100vh;
  background:rgba(0,0,0,0.8); z-index:10000; display:flex; align-items:center; justify-content:center;
}
.shape-dialog {
  background:#252528; border-radius:14px; border:1px solid #444;
  width:94vw; max-width:860px; max-height:88vh;
  display:flex; flex-direction:column; overflow:hidden; box-shadow:0 16px 48px rgba(0,0,0,0.6);
}
.shape-dialog-header { display:flex; align-items:center; justify-content:space-between; padding:10px 14px; border-bottom:1px solid #333; }
.shape-dialog-header h2 { margin:0; font-size:14px; color:#d4a76a; }
.close-btn { width:28px; height:28px; border-radius:50%; border:1px solid #555; background:transparent; color:#aaa; font-size:14px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
.close-btn:hover { background:#3a3a3e; color:#ddd; }
.shape-dialog-toolbar { padding:8px 14px; display:flex; flex-direction:column; gap:6px; border-bottom:1px solid #333; }
.shape-search { width:100%; padding:7px 12px; border-radius:6px; border:1px solid #555; background:#1a1a1e; color:#ddd; font-size:12px; outline:none; }
.shape-search:focus { border-color:#d4782a; }
.shape-categories { display:flex; gap:4px; flex-wrap:wrap; }
.cat-btn { padding:3px 12px; border-radius:14px; border:1px solid #555; background:#2a2a2e; color:#ccc; font-size:11px; cursor:pointer; }
.cat-btn:hover { background:#3a3a3e; }
.cat-btn.active { background:#d4782a; border-color:#d4782a; color:#fff; font-weight:600; }
.shape-grid-full {
  flex:1; overflow-y:auto; padding:10px 14px;
  display:grid; grid-template-columns:repeat(3,1fr); gap:8px;
  min-height:0;
}
.shape-grid-full::-webkit-scrollbar { width:4px; }
.shape-grid-full::-webkit-scrollbar-thumb { background:#444; border-radius:2px; }

.shape-card {
  border:2px solid #333; border-radius:10px; overflow:hidden; cursor:pointer;
  background:var(--card-bg, #2a2a2e); transition:all 0.25s cubic-bezier(0.4,0,0.2,1);
  position:relative;
}
.shape-card:hover {
  border-color:var(--card-border, #d4782a) !important;
  transform:translateY(-2px) scale(1.03);
  box-shadow:0 8px 20px rgba(0,0,0,0.6), 0 0 0 1px var(--card-border, #d4782a);
  z-index:2;
}
.shape-card.active { border-color:#d4782a !important; box-shadow:0 0 0 2px #d4782a, 0 4px 12px rgba(212,120,42,0.3); }
.shape-card-img {
  width:100%; height:120px; background:var(--card-bg, #1a1a1e);
  display:flex; align-items:center; justify-content:center; overflow:hidden;
  position:relative;
}
.shape-card-img img { width:100%; height:100%; object-fit:contain; transition:transform 0.3s; }
.shape-card:hover .shape-card-img img { transform:scale(1.06); }
.shape-placeholder { font-size:26px; opacity:0.25; }
.shape-cat-badge {
  position:absolute; top:4px; left:4px;
  padding:2px 7px; border-radius:7px;
  font-size:8px; font-weight:700; color:#fff;
  letter-spacing:0.05em;
}
.shape-card-info { padding:5px 8px; display:flex; flex-direction:column; gap:1px; background:rgba(0,0,0,0.3); }
.shape-card-name { font-size:10px; color:#ddd; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.shape-card-feature { font-size:8px; color:var(--card-border, #888); font-weight:500; }
.shape-card-meta { font-size:8px; color:#777; }

.shape-empty { grid-column:1/-1; text-align:center; padding:24px; color:#888; font-size:12px; }
.shape-pagination { display:flex; align-items:center; justify-content:center; gap:6px; padding:8px 14px; border-top:1px solid #333; flex-shrink:0; }
.shape-pagination button { padding:5px 14px; border-radius:5px; border:1px solid #555; background:#2a2a2e; color:#ccc; font-size:12px; cursor:pointer; }
.shape-pagination button:hover:not(:disabled) { background:#3a3a3e; }
.shape-pagination button:disabled { opacity:0.3; cursor:not-allowed; }
.page-num { width:28px; height:28px; border-radius:5px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:12px; color:#ccc; }
.page-num:hover { background:#3a3a3e; }
.page-num.active { background:#d4782a; color:#fff; font-weight:700; }

@media (max-width:1000px) { .shape-grid-full { grid-template-columns:repeat(3,1fr); } }
@media (max-width:700px) { .shape-grid-full { grid-template-columns:repeat(2,1fr); } }
</style>
