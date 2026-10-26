<template>
  <div ref="canvasContainer" class="canvas-area-inner" style="width:100%;height:100%;position:relative;">
  </div>
</template>

<script setup>
import { ref, shallowRef, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useCeramicStore } from '@/stores/ceramic'
import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js'
import { ElMessage } from 'element-plus'
import { builtinPatterns, getPatternDataUrl } from '@/assets/patterns'
import { patternDB } from '@/db'

const emit = defineEmits(['firing-complete', 'screenshot-taken', 'pattern-placed'])

// ─── Refs ──────────────────────────────────────────────────────────────────
const canvasContainer = ref(null)

// Three.js objects (shallowRef to avoid Vue reactivity overhead)
const scene = shallowRef(null)
const camera = shallowRef(null)
const renderer = shallowRef(null)
const controls = shallowRef(null)
const composer = shallowRef(null)
const fxaaPass = shallowRef(null)
const ceramicGroup = shallowRef(null)
const ceramicMesh = shallowRef(null)
const patternMesh = shallowRef(null)
const innerPatternMesh = shallowRef(null)
const innerCeramicMesh = shallowRef(null)
const importedModelGroup = shallowRef(null)
const gridHelper = shallowRef(null)
const pedestal = shallowRef(null)
const keyLight = shallowRef(null)
const fillLight = shallowRef(null)
const ambientLight = shallowRef(null)
const rimLight = shallowRef(null)
const rimLightBottom = shallowRef(null)
const rimBackLight = shallowRef(null)
const innerAmbientLight = shallowRef(null)

// Animation state
let animFrameId = null
let clock = new THREE.Clock()
let targetCamPos = null
let targetLookAt = null
let isLerping = false
let autoRotateEnabled = false
let autoRotateSpeed = 0.005

// Restore guard — prevents watchers from firing duplicate builds during restoreFromSnapshot
let isRestoring = false

// Kiln state
let kilnRunning = false
let kilnTimer = 0
let kilnDuration = 3.5
let crackleTexture = null
let originalMaterial = null
let originalColor = new THREE.Color()
let kilnResolve = null

// patternTextTexture holder
let patternTextTexture = null

// Base scene objects for cleanup
let pedestalMesh = null
let maxAnisotropy = 4

// ── 几何体预加载缓存：避免器型切换时重复构建 ──
// v14 cache: 回退LatheGeometry修复盘子底部
const GEOM_CACHE_VERSION = 'v14'
const geometryCache = new Map()
function getCachedGeometry(key) {
  const fullKey = GEOM_CACHE_VERSION + ':' + key
  if (geometryCache.has(fullKey)) return geometryCache.get(fullKey).clone()
  return null
}
function setCachedGeometry(key, geometry) {
  const fullKey = GEOM_CACHE_VERSION + ':' + key
  if (geometryCache.size >= 5) {
    const firstKey = geometryCache.keys().next().value
    const oldGeo = geometryCache.get(firstKey)
    if (oldGeo) oldGeo.dispose()
    geometryCache.delete(firstKey)
  }
  geometryCache.set(fullKey, geometry.clone())
}

/** 预加载相邻器型几何体，确保切换流畅 */
function preloadAdjacentShapes(currentShape) {
  const allShapes = ['meiping', 'yuhuchun', 'shangping', 'wanzhan', 'chabei', 'hulu', 'danping', 'congshi', 'jiangjun', 'bitong', 'panzi']
  const idx = allShapes.indexOf(currentShape)
  const neighbors = []
  if (idx > 0) neighbors.push(allShapes[idx - 1])
  if (idx < allShapes.length - 1) neighbors.push(allShapes[idx + 1])
  // 异步预构建相邻器型
  neighbors.forEach(shape => {
    if (!geometryCache.has(shape)) {
      setTimeout(() => {
        try {
          const geo = createGeometry(shape)
          setCachedGeometry(shape, geo)
          geo.dispose() // 缓存已clone，释放原始
        } catch (e) { /* 静默失败 */ }
      }, 100)
    }
  })
}

// ── Raycaster for pattern placement ──
const raycaster = new THREE.Raycaster()
raycaster.params.Mesh = { backfaceCulling: false } // 允许检测背面（内表面）
const mouse = new THREE.Vector2()

/** 安全射线检测，null对象返回空数组 */
function safeIntersect(obj) {
  if (!obj) return []
  try { return raycaster.intersectObject(obj, true) } catch { return [] }
}

/** 收集所有可射线命中的网格对象 */
function getHittableObjects() {
  const arr = []
  if (ceramicMesh.value) arr.push(ceramicMesh.value)
  if (innerCeramicMesh.value) arr.push(innerCeramicMesh.value)
  if (patternMesh.value) arr.push(patternMesh.value)
  if (innerPatternMesh.value) arr.push(innerPatternMesh.value)
  if (importedModelGroup.value) arr.push(importedModelGroup.value)
  return arr
}

// ─── 图案交互系统状态 ───
let selectedPatternId = null          // 当前选中的图案ID
let isDraggingPattern = false         // 是否正在拖拽图案
let pointerDownPos = null             // 指针按下位置
let lastDragPos = null                // 上一帧的指针位置（用于帧间增量）
let wasPointerDownOnPattern = false
let hasMovedSinceDown = false
const DRAG_THRESHOLD = 2
const PATTERN_DRAG_SENSITIVITY = 1.2   // 灵敏度
const PATTERN_SHIFT_SENSITIVITY = 0.3
let dragPreviewMesh = null            // 拖拽/放置预览网格（半透明，跟随鼠标）
let selectionRingMesh = null          // 选中图案的彩色选择环
let selectionGlowMesh = null          // 选中图案的白色柔光外圈
let selectionFillMesh = null          // 选中图案的半透明高亮覆盖盘
let hoveredPatternId = null           // 当前悬停的图案ID
let hoverRingMesh = null              // 悬停图案的淡蓝色圆环
let overlappingPatterns = []          // 重叠图案列表（用于Alt+点击循环选择）

// ─── UV 纹理合成系统 ───
// 图案图片缓存 (id → HTMLImageElement)
const patternImageCache = new Map()
// 正在被拖拽的图案ID（合成时排除，避免拖拽中看到旧位置的图案）
let pendingDragPatternId = null
// 最后合成的纹理（用于清理）
let compositeTexture = null
// 合成去重守卫，防止 compositeFinalTexture 重入
let compositeInProgress = false
let compositePending = false
let compositeFrameGuard = false  // 帧同步守卫，防止同一帧内多次合成
// 内部合成纹理引用（用于dispose清理）
let innerCompositeTexture = null
// 纹理更新标记 - 在animate循环中检查，避免拖拽时频繁全量合成
let textureDirty = false

// ─── 样式纹理缓存 ──
let cachedStyleTex = null          // 当前样式的缓存纹理
let cachedStyleName = ''           // 缓存对应的样式名称

// ─── Store ─────────────────────────────────────────────────────────────────
const ceramicStore = useCeramicStore()

// ─── Shape Generators ──────────────────────────────────────────────────────

/**
 * 各器型专属相机参数
 * 切换器型时自动调整相机距离和视角中心点，确保器型完整显示
 */
const shapeCameraConfig = {
  meiping: { distance: 3.2, targetY: 0.05 },
  yuhuchun: { distance: 3.5, targetY: 0.10 },
  shangping: { distance: 3.3, targetY: -0.05 },
  wanzhan: { distance: 2.8, targetY: -0.10 },
  chabei: { distance: 2.2, targetY: 0.18 },
  hulu: { distance: 3.2, targetY: 0.05 },
  danping: { distance: 3.6, targetY: 0.15 },
  congshi: { distance: 2.8, targetY: 0.0 },
  jiangjun: { distance: 3.8, targetY: 0.0 },
  bitong: { distance: 2.5, targetY: 0.0 },
  panzi: { distance: 4.0, targetY: -0.05 },
}

function getShapeCameraConfig(shape) {
  return shapeCameraConfig[shape] || shapeCameraConfig.meiping
}

/**
 * 获取器型专属视角预设
 * 不同器型高度/宽度差异大，需要不同的相机位置确保完整显示
 */
function getShapeViewPresets(shape) {
  const cfg = getShapeCameraConfig(shape)
  const dist = cfg.distance
  const ty = cfg.targetY
  // 碗盏：敞口宽矮，俯视需近距离
  if (shape === 'wanzhan') {
    return {
      front: { pos: new THREE.Vector3(0, -0.05, dist), target: new THREE.Vector3(0, -0.05, 0) },
      side: { pos: new THREE.Vector3(dist, -0.05, 0), target: new THREE.Vector3(0, -0.05, 0) },
      top: { pos: new THREE.Vector3(0, dist * 0.6, 0.01), target: new THREE.Vector3(0, -0.1, 0) },
      bottom: { pos: new THREE.Vector3(0, -dist * 0.4, dist * 0.6), target: new THREE.Vector3(0, -0.3, 0) },
    }
  }
  // 茶杯：深腹小口，俯视可见内壁
  if (shape === 'chabei') {
    return {
      front: { pos: new THREE.Vector3(0, 0.15, dist), target: new THREE.Vector3(0, 0.15, 0) },
      side: { pos: new THREE.Vector3(dist, 0.15, 0), target: new THREE.Vector3(0, 0.15, 0) },
      top: { pos: new THREE.Vector3(0, dist * 0.8, 0.01), target: new THREE.Vector3(0, 0.15, 0) },
      bottom: { pos: new THREE.Vector3(0, -dist * 0.3, dist * 0.7), target: new THREE.Vector3(0, -0.15, 0) },
    }
  }
  // 盘子：宽大浅腹，俯视展示盘内全貌
  if (shape === 'panzi') {
    return {
      front: { pos: new THREE.Vector3(0, 0.0, dist), target: new THREE.Vector3(0, -0.02, 0) },
      side: { pos: new THREE.Vector3(dist, 0.0, 0), target: new THREE.Vector3(0, -0.02, 0) },
      top: { pos: new THREE.Vector3(0, dist * 0.35, 0.01), target: new THREE.Vector3(0, -0.02, 0) },
      bottom: { pos: new THREE.Vector3(0, -dist * 0.2, dist * 0.6), target: new THREE.Vector3(0, -0.12, 0) },
    }
  }
  // 将军罐：最高器型，含盖
  if (shape === 'jiangjun') {
    return {
      front: { pos: new THREE.Vector3(0, ty, dist), target: new THREE.Vector3(0, ty, 0) },
      side: { pos: new THREE.Vector3(dist, ty, 0), target: new THREE.Vector3(0, ty, 0) },
      top: { pos: new THREE.Vector3(0.3, dist * 0.7, 0.4), target: new THREE.Vector3(0, ty + 0.5, 0) },
      bottom: { pos: new THREE.Vector3(0, -dist * 0.5, dist * 0.7), target: new THREE.Vector3(0, ty - 0.6, 0) },
    }
  }
  // 花瓶类器型（梅瓶、玉壶春瓶、赏瓶、葫芦瓶、胆瓶、琮式瓶、笔筒）
  return {
    front: { pos: new THREE.Vector3(0, ty + 0.05, dist), target: new THREE.Vector3(0, ty, 0) },
    side: { pos: new THREE.Vector3(dist, ty + 0.05, 0), target: new THREE.Vector3(0, ty, 0) },
    top: { pos: new THREE.Vector3(0.3, dist * 0.8, 0.4), target: new THREE.Vector3(0, ty + 0.3, 0) },
    bottom: { pos: new THREE.Vector3(0, -dist * 0.5, dist * 0.7), target: new THREE.Vector3(0, ty - 0.4, 0) },
  }
}

// ═══════════════════════════════════════════════════════════════
// 20260602 全器型真实厚度与比例终极校准
// 所有器型按传统陶瓷标准重制：口沿/底足/圈足圆润过渡，壁厚渐变
// ═══════════════════════════════════════════════════════════════

// ── 底部辅助函数：生成封闭底盘的轮廓点 ──
// recessed: 凹底高度，baseY: 圈足最低点，innerR: 圈足内半径，outerR: 圈足外半径
function bottomClosureFootRing(recessed, baseY, innerR, outerR) {
  return [
    new THREE.Vector2(0.0, baseY + recessed),       // 底部中心（完全封闭）
    new THREE.Vector2(innerR, baseY + recessed),    // 底盘内缘
    new THREE.Vector2(innerR, baseY + recessed + 0.02), // 圈足内壁微升
  ]
}

// 梅瓶：总高2.2，口径0.35，底径0.6，最大腹径1.1
function createMeipingPoints() {
  return [
    ...bottomClosureFootRing(0.05, -1.00, 0.28, 0.31),
    new THREE.Vector2(0.31, -1.00), new THREE.Vector2(0.30, -0.96),
    new THREE.Vector2(0.30, -0.92), new THREE.Vector2(0.28, -0.88),
    new THREE.Vector2(0.30, -0.80), new THREE.Vector2(0.34, -0.68),
    new THREE.Vector2(0.40, -0.54), new THREE.Vector2(0.48, -0.38),
    new THREE.Vector2(0.53, -0.20), new THREE.Vector2(0.55, -0.05),
    new THREE.Vector2(0.54, 0.08), new THREE.Vector2(0.48, 0.20),
    new THREE.Vector2(0.38, 0.32), new THREE.Vector2(0.28, 0.42),
    new THREE.Vector2(0.20, 0.52), new THREE.Vector2(0.17, 0.62),
    new THREE.Vector2(0.175, 0.72), new THREE.Vector2(0.18, 0.82),
    new THREE.Vector2(0.19, 0.90), new THREE.Vector2(0.20, 0.96),
    new THREE.Vector2(0.19, 1.00),
  ]
}

// 玉壶春瓶：总高2.4，口径0.4，底径0.55，最大腹径1.0
function createYuhuchunPoints() {
  return [
    ...bottomClosureFootRing(0.05, -1.00, 0.25, 0.28),
    new THREE.Vector2(0.28, -1.00), new THREE.Vector2(0.275, -0.96),
    new THREE.Vector2(0.275, -0.92), new THREE.Vector2(0.25, -0.88),
    new THREE.Vector2(0.28, -0.78), new THREE.Vector2(0.35, -0.62),
    new THREE.Vector2(0.44, -0.44), new THREE.Vector2(0.49, -0.26),
    new THREE.Vector2(0.50, -0.10), new THREE.Vector2(0.48, 0.06),
    new THREE.Vector2(0.38, 0.20), new THREE.Vector2(0.26, 0.32),
    new THREE.Vector2(0.19, 0.44), new THREE.Vector2(0.17, 0.56),
    new THREE.Vector2(0.18, 0.68), new THREE.Vector2(0.19, 0.78),
    new THREE.Vector2(0.21, 0.88), new THREE.Vector2(0.24, 0.96),
    new THREE.Vector2(0.23, 1.00),
  ]
}

// 赏瓶：总高2.3，口径0.5，底径0.65，最大腹径1.15
function createShangpingPoints() {
  return [
    ...bottomClosureFootRing(0.05, -1.00, 0.30, 0.33),
    new THREE.Vector2(0.33, -1.00), new THREE.Vector2(0.325, -0.96),
    new THREE.Vector2(0.325, -0.91), new THREE.Vector2(0.30, -0.87),
    new THREE.Vector2(0.33, -0.78), new THREE.Vector2(0.40, -0.62),
    new THREE.Vector2(0.50, -0.42), new THREE.Vector2(0.56, -0.22),
    new THREE.Vector2(0.575, -0.05), new THREE.Vector2(0.56, 0.08),
    new THREE.Vector2(0.48, 0.18), new THREE.Vector2(0.34, 0.30),
    new THREE.Vector2(0.25, 0.42), new THREE.Vector2(0.22, 0.54),
    new THREE.Vector2(0.22, 0.66), new THREE.Vector2(0.23, 0.76),
    new THREE.Vector2(0.26, 0.86), new THREE.Vector2(0.29, 0.94),
    new THREE.Vector2(0.28, 1.00),
  ]
}

// 碗盏：总高0.8，口径1.8，底径0.7
function createWanzhanPoints() {
  return [
    ...bottomClosureFootRing(0.04, -0.42, 0.32, 0.37),
    new THREE.Vector2(0.37, -0.42), new THREE.Vector2(0.35, -0.38),
    new THREE.Vector2(0.35, -0.34), new THREE.Vector2(0.32, -0.30),
    new THREE.Vector2(0.36, -0.24), new THREE.Vector2(0.42, -0.16),
    new THREE.Vector2(0.52, -0.06), new THREE.Vector2(0.64, 0.04),
    new THREE.Vector2(0.76, 0.12), new THREE.Vector2(0.86, 0.18),
    new THREE.Vector2(0.90, 0.22), new THREE.Vector2(0.92, 0.24),
    new THREE.Vector2(0.91, 0.26),
  ]
}

// 茶杯：总高1.2，口径1.0，底径0.6
function createChabeiPoints() {
  return [
    ...bottomClosureFootRing(0.04, -0.42, 0.28, 0.32),
    new THREE.Vector2(0.32, -0.42), new THREE.Vector2(0.30, -0.38),
    new THREE.Vector2(0.30, -0.34), new THREE.Vector2(0.28, -0.30),
    new THREE.Vector2(0.31, -0.24), new THREE.Vector2(0.35, -0.16),
    new THREE.Vector2(0.40, -0.06), new THREE.Vector2(0.44, 0.08),
    new THREE.Vector2(0.47, 0.22), new THREE.Vector2(0.49, 0.36),
    new THREE.Vector2(0.50, 0.48), new THREE.Vector2(0.50, 0.58),
    new THREE.Vector2(0.51, 0.66), new THREE.Vector2(0.52, 0.72),
    new THREE.Vector2(0.51, 0.76), new THREE.Vector2(0.50, 0.78),
  ]
}

// 葫芦瓶：总高2.1，口径0.3，底径0.6，上球0.7，下球1.2
function createHuluPoints() {
  return [
    ...bottomClosureFootRing(0.05, -1.00, 0.28, 0.31),
    new THREE.Vector2(0.31, -1.00), new THREE.Vector2(0.30, -0.96),
    new THREE.Vector2(0.30, -0.92), new THREE.Vector2(0.28, -0.88),
    new THREE.Vector2(0.32, -0.78), new THREE.Vector2(0.42, -0.62),
    new THREE.Vector2(0.54, -0.44), new THREE.Vector2(0.60, -0.28),
    new THREE.Vector2(0.58, -0.14), new THREE.Vector2(0.50, -0.04),
    new THREE.Vector2(0.36, 0.04), new THREE.Vector2(0.25, 0.08),
    new THREE.Vector2(0.22, 0.12), new THREE.Vector2(0.28, 0.20),
    new THREE.Vector2(0.35, 0.30), new THREE.Vector2(0.34, 0.40),
    new THREE.Vector2(0.26, 0.48), new THREE.Vector2(0.18, 0.54),
    new THREE.Vector2(0.15, 0.60), new THREE.Vector2(0.15, 0.68),
    new THREE.Vector2(0.16, 0.76), new THREE.Vector2(0.17, 0.82),
    new THREE.Vector2(0.16, 0.86),
  ]
}

// 胆瓶：总高2.5，口径0.35，底径0.55，最大腹径0.95
function createDanpingPoints() {
  return [
    ...bottomClosureFootRing(0.05, -1.00, 0.25, 0.28),
    new THREE.Vector2(0.28, -1.00), new THREE.Vector2(0.275, -0.96),
    new THREE.Vector2(0.27, -0.92), new THREE.Vector2(0.25, -0.88),
    new THREE.Vector2(0.28, -0.78), new THREE.Vector2(0.35, -0.62),
    new THREE.Vector2(0.43, -0.44), new THREE.Vector2(0.47, -0.28),
    new THREE.Vector2(0.475, -0.12), new THREE.Vector2(0.46, 0.04),
    new THREE.Vector2(0.38, 0.18), new THREE.Vector2(0.28, 0.30),
    new THREE.Vector2(0.22, 0.40), new THREE.Vector2(0.18, 0.52),
    new THREE.Vector2(0.17, 0.66), new THREE.Vector2(0.17, 0.80),
    new THREE.Vector2(0.175, 0.90), new THREE.Vector2(0.18, 0.98),
    new THREE.Vector2(0.19, 1.04),
  ]
}

// 琮式瓶：总高1.9，口径0.7，底径0.7，内圆外方
function createCongshiPoints() {
  return [
    new THREE.Vector2(0.0, -0.95), new THREE.Vector2(0.33, -0.95),
    new THREE.Vector2(0.33, -0.91), new THREE.Vector2(0.37, -0.95),
    new THREE.Vector2(0.35, -0.91), new THREE.Vector2(0.33, -0.87),
    new THREE.Vector2(0.35, -0.78), new THREE.Vector2(0.37, -0.72),
    new THREE.Vector2(0.36, -0.66), new THREE.Vector2(0.36, -0.54),
    new THREE.Vector2(0.38, -0.48), new THREE.Vector2(0.37, -0.42),
    new THREE.Vector2(0.37, -0.28), new THREE.Vector2(0.39, -0.20),
    new THREE.Vector2(0.38, -0.12), new THREE.Vector2(0.38, 0.05),
    new THREE.Vector2(0.40, 0.14), new THREE.Vector2(0.39, 0.22),
    new THREE.Vector2(0.38, 0.34), new THREE.Vector2(0.40, 0.44),
    new THREE.Vector2(0.38, 0.52), new THREE.Vector2(0.36, 0.62),
    new THREE.Vector2(0.33, 0.72), new THREE.Vector2(0.34, 0.80),
    new THREE.Vector2(0.36, 0.86), new THREE.Vector2(0.37, 0.90),
    new THREE.Vector2(0.36, 0.94),
  ]
}

// 将军罐：总高2.6，口径1.0，底径1.2，最大腹径1.4，带盖
function createJiangjunPoints() {
  return [
    ...bottomClosureFootRing(0.06, -1.00, 0.58, 0.62),
    new THREE.Vector2(0.62, -1.00), new THREE.Vector2(0.60, -0.95),
    new THREE.Vector2(0.58, -0.90), new THREE.Vector2(0.56, -0.80),
    new THREE.Vector2(0.58, -0.66), new THREE.Vector2(0.64, -0.48),
    new THREE.Vector2(0.69, -0.30), new THREE.Vector2(0.70, -0.15),
    new THREE.Vector2(0.68, -0.02), new THREE.Vector2(0.60, 0.10),
    new THREE.Vector2(0.50, 0.18), new THREE.Vector2(0.48, 0.26),
    new THREE.Vector2(0.50, 0.34), new THREE.Vector2(0.51, 0.40),
    new THREE.Vector2(0.50, 0.44), new THREE.Vector2(0.48, 0.48),
    new THREE.Vector2(0.42, 0.54), new THREE.Vector2(0.30, 0.60),
    new THREE.Vector2(0.18, 0.66), new THREE.Vector2(0.10, 0.72),
    new THREE.Vector2(0.06, 0.76), new THREE.Vector2(0.04, 0.80),
  ]
}

// 笔筒：总高1.6，口径1.3，底径1.3，直筒形
// 笔筒：总高1.6，口径1.3，底径1.3，直筒形 + 底部封闭
function createBitongPoints() {
  const by = -0.80, r = 0.65
  return [
    new THREE.Vector2(0.0, by + 0.03),
    new THREE.Vector2(r * 0.85, by + 0.03),
    new THREE.Vector2(r, by + 0.03),
    new THREE.Vector2(r * 1.03, by),
    new THREE.Vector2(r, by + 0.06),
    new THREE.Vector2(r, -0.62), new THREE.Vector2(r, -0.44),
    new THREE.Vector2(r, -0.22), new THREE.Vector2(r, 0.00),
    new THREE.Vector2(r, 0.22), new THREE.Vector2(r, 0.44),
    new THREE.Vector2(r, 0.62), new THREE.Vector2(r, 0.72),
    new THREE.Vector2(r, 0.76), new THREE.Vector2(r, 0.78),
  ]
}

// 盘子：总高0.35，口径2.2，底径0.9
// 底部结构与笔筒一致：中心→底盘→圈足→盘身
function createPanziPoints() {
  const by = -0.18, r = 0.47
  return [
    new THREE.Vector2(0.0, by + 0.03),
    new THREE.Vector2(r * 0.85, by + 0.03),
    new THREE.Vector2(r, by + 0.03),
    new THREE.Vector2(r * 1.03, by),
    new THREE.Vector2(r, by + 0.06),
    // 盘身展开
    new THREE.Vector2(0.46, -0.10), new THREE.Vector2(0.52, -0.04),
    new THREE.Vector2(0.62, 0.02), new THREE.Vector2(0.75, 0.06),
    new THREE.Vector2(0.90, 0.09), new THREE.Vector2(1.04, 0.11),
    new THREE.Vector2(1.10, 0.13), new THREE.Vector2(1.12, 0.15),
    new THREE.Vector2(1.11, 0.16),
  ]
}

function getShapePoints(shape) {
  switch (shape) {
    case 'meiping': return createMeipingPoints()
    case 'yuhuchun': return createYuhuchunPoints()
    case 'shangping': return createShangpingPoints()
    case 'wanzhan': return createWanzhanPoints()
    case 'chabei': return createChabeiPoints()
    case 'hulu': return createHuluPoints()
    case 'danping': return createDanpingPoints()
    case 'congshi': return createCongshiPoints()
    case 'jiangjun': return createJiangjunPoints()
    case 'bitong': return createBitongPoints()
    case 'panzi': return createPanziPoints()
    default: return createMeipingPoints()
  }
}

/**
 * LatheGeometry + UV偏移 + 中缝法线统一
 */
function createWeldedLatheGeometry(points, segments) {
  const geom = new THREE.LatheGeometry(points, segments)
  const rows = points.length
  const cols = segments + 1

  // UV 偏移 +0.25 → 纹理接缝移至正后方
  const uv = geom.attributes.uv
  for (let i = 0; i < uv.count; i++) {
    uv.setX(i, (uv.getX(i) + 0.25) % 1.0)
  }
  uv.needsUpdate = true

  geom.computeVertexNormals()

  // 中缝法线统一
  const norm = geom.attributes.normal
  for (let row = 0; row < rows; row++) {
    const i0 = row * cols
    const iN = row * cols + segments
    const nx = (norm.getX(i0) + norm.getX(iN)) * 0.5
    const ny = (norm.getY(i0) + norm.getY(iN)) * 0.5
    const nz = (norm.getZ(i0) + norm.getZ(iN)) * 0.5
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
    norm.setXYZ(i0, nx / len, ny / len, nz / len)
    norm.setXYZ(iN, nx / len, ny / len, nz / len)
  }
  norm.needsUpdate = true

  geom.computeBoundingSphere()
  return geom
}

/**
 * 为剖面顶端添加圆润唇边：顶部曲线微向内收，消除瓶口锯齿毛刺
 * 模拟真实陶瓷口沿的圆润过渡，避免尖锐切断面
 */
function smoothProfileRim(points, rimInset = 0.012) {
  if (points.length < 5) return points
  const n = points.length
  const top = points[n - 1]
  const rTop = top.x
  // 仅处理有实际口径的器型（r>0.01，排除完全闭合的顶部）
  if (rTop < 0.01) return points
  // 取顶部5个点做微内收平滑
  const count = Math.min(5, n)
  for (let i = n - count; i < n; i++) {
    const t = (i - (n - count)) / (count - 1) // 0→1 从下到上
    const factor = 1.0 - rimInset * t * t / rTop // 越靠近顶部收得越多
    points[i] = new THREE.Vector2(Math.max(0.001, points[i].x * factor), points[i].y)
  }
  return points
}

function createGeometry(shape) {
  const cached = getCachedGeometry(shape)
  if (cached) return cached
  let points = getShapePoints(shape)
  points = upsampleProfile(points, 512)
  points = smoothProfileRim(points)
  // 512段剖面 + 512段径向 = 工业级平滑曲面
  const geometry = createWeldedLatheGeometry(points, 512)
  setCachedGeometry(shape, geometry)
  return geometry
}

/** CatmullRom centripetal 样条插值加密剖面点，杜绝尖锐转折处的过冲 */
function upsampleProfile(points, targetCount = 96) {
  if (!points || points.length < 3) return points
  if (points.length >= targetCount) return points
  const curve = new THREE.CatmullRomCurve3(
    points.map(p => new THREE.Vector3(p.x, p.y, 0)),
    false, 'centripetal'
  )
  const result = []
  for (let i = 0; i < targetCount; i++) {
    const t = i / (targetCount - 1)
    const pt = curve.getPointAt(t)
    result.push(new THREE.Vector2(Math.max(0.0, pt.x), pt.y))
  }
  return result
}

// ═══════════════════════════════════════════════════════════════
// LOD 多细节层次系统
// 3级精度：近距离256段高精 → 中距离128段中精 → 远距离64段低精
// 切换距离自动适配屏幕分辨率，保证视觉与性能平衡
// ═══════════════════════════════════════════════════════════════

/** LOD 距离阈值（世界单位） */
const LOD_DISTANCES = { HIGH: 1.5, MEDIUM: 3.5, FAR: 10.0 }

/**
 * 为指定器型创建3级LOD几何体
 * 模型导入创作界面后默认使用最高精度LOD
 */
function createLODGeometries(shape) {
  const points = getShapePoints(shape)
  // 3级精度：高(768段/384点)、中(512段/256点)、低(256段/128点) — 全部无缝旋转成型
  const configs = [
    { segments: 768, profileCount: 384, label: 'high' },
    { segments: 512, profileCount: 256, label: 'medium' },
    { segments: 256, profileCount: 128, label: 'low' },
  ]
  return configs.map(cfg => {
    let pts = upsampleProfile([...points], cfg.profileCount)
    const geo = createWeldedLatheGeometry(pts, cfg.segments)
    return geo
  })
}

/**
 * 为内置精品模型创建3级LOD几何体
 */
function createBuiltinLODGeometries(profilePoints) {
  const configs = [
    { segments: 768, profileCount: 384, label: 'high' },
    { segments: 512, profileCount: 256, label: 'medium' },
    { segments: 256, profileCount: 128, label: 'low' },
  ]
  return configs.map(cfg => {
    let pts = upsampleProfile([...profilePoints], cfg.profileCount)
    const geo = createWeldedLatheGeometry(pts, cfg.segments)
    return geo
  })
}

/**
 * 创建带3级LOD的陶瓷网格组
 * @param {THREE.BufferGeometry[]} geometries - [high, medium, low] 3个精度几何体
 * @param {THREE.Material} material - 陶瓷材质
 * @returns {THREE.LOD}
 */
function createLODMesh(geometries, material) {
  const lod = new THREE.LOD()
  // Level 0: 高精度（近距离 < LOD_DISTANCES.HIGH）
  const meshHigh = new THREE.Mesh(geometries[0], material)
  meshHigh.castShadow = true
  meshHigh.receiveShadow = true
  lod.addLevel(meshHigh, 0)
  // Level 1: 中精度（中距离 LOD_DISTANCES.HIGH ~ LOD_DISTANCES.MEDIUM）
  if (geometries[1]) {
    const mat1 = material.clone()
    const meshMed = new THREE.Mesh(geometries[1], mat1)
    meshMed.castShadow = true
    meshMed.receiveShadow = true
    lod.addLevel(meshMed, LOD_DISTANCES.HIGH)
  }
  // Level 2: 低精度（远距离 > LOD_DISTANCES.MEDIUM）
  if (geometries[2]) {
    const mat2 = material.clone()
    const meshLow = new THREE.Mesh(geometries[2], mat2)
    meshLow.castShadow = true
    meshLow.receiveShadow = true
    lod.addLevel(meshLow, LOD_DISTANCES.MEDIUM)
  }
  return lod
}

// ─── Style Colors ──────────────────────────────────────────────────────────

function getStyleColor(style) {
  switch (style) {
    case 'qinghua': return '#E8E0D8'
    case 'fencai': return '#F5E6D0'
    case 'jun': return '#8B5E3C'
    case 'bai': return '#F0EBE3'
    case 'ruci': return '#8bb8b8'   // 汝瓷天青色
    case 'geci': return '#e6d7b8'   // 哥瓷米黄色
    default: return '#E8E0D8'
  }
}

// ─── Texture Generators (Canvas 2D API) ────────────────────────────────────

function createCanvasCtx(width = 2048, height = 2048) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  return { canvas, ctx }
}

/** 使纹理水平无缝平铺：左右边缘像素渐变为两者的平均值 */
function makeTextureSeamless(canvas, ctx) {
  const w = canvas.width
  const h = canvas.height
  const blendW = Math.floor(w * 0.06)  // 6% 渐变带
  const imgData = ctx.getImageData(0, 0, w, h)
  const d = imgData.data

  for (let y = 0; y < h; y++) {
    const li = (y * w) * 4
    const ri = (y * w + w - 1) * 4
    // 左右边缘的目标混合值（平均值）
    const tr = (d[li] + d[ri]) * 0.5
    const tg = (d[li + 1] + d[ri + 1]) * 0.5
    const tb = (d[li + 2] + d[ri + 2]) * 0.5

    // 左边缘渐变为混合值（x=0 → 混合值, x=blendW → 原值）
    for (let x = 0; x < blendW; x++) {
      const t = x / blendW
      const idx = (y * w + x) * 4
      d[idx]     = d[idx] * t + tr * (1 - t)
      d[idx + 1] = d[idx + 1] * t + tg * (1 - t)
      d[idx + 2] = d[idx + 2] * t + tb * (1 - t)
    }
    // 右边缘渐变为混合值（x=w-blendW → 原值, x=w-1 → 混合值）
    for (let x = w - blendW; x < w; x++) {
      const t = (w - 1 - x) / blendW
      const idx = (y * w + x) * 4
      d[idx]     = d[idx] * t + tr * (1 - t)
      d[idx + 1] = d[idx + 1] * t + tg * (1 - t)
      d[idx + 2] = d[idx + 2] * t + tb * (1 - t)
    }
  }
  ctx.putImageData(imgData, 0, 0)
}

// ---- Drawing Helpers ----

function drawCloud(ctx, x, y, scale, color) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale, scale)
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  for (let i = 0; i < 3; i++) {
    ctx.beginPath()
    ctx.arc(15 * i, 0, 8 + i * 3, Math.PI, Math.PI * 1.8)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(-15 * i, 0, 8 + i * 3, 0, Math.PI * 0.8)
    ctx.stroke()
  }
  ctx.restore()
}

function drawLotus(ctx, x, y, size, color) {
  ctx.save()
  ctx.translate(x, y)
  ctx.fillStyle = color
  ctx.globalAlpha = 0.7
  const petalCount = 8
  for (let i = 0; i < petalCount; i++) {
    const angle = (i / petalCount) * Math.PI * 2
    ctx.beginPath()
    ctx.ellipse(Math.cos(angle) * size * 0.4, Math.sin(angle) * size * 0.4, size * 0.18, size * 0.35, angle, 0, Math.PI * 2)
    ctx.fill()
  }
  // Center
  ctx.beginPath()
  ctx.arc(0, 0, size * 0.12, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.restore()
}

function drawScrollVine(ctx, startX, startY, length, amplitude, color) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.beginPath()
  const segments = 60
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const x = startX + t * length
    const y = startY + Math.sin(t * Math.PI * 4) * amplitude
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.restore()
}

function drawWaveBand(ctx, y, width, amplitude, frequency, color) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.beginPath()
  const h = amplitude * 2
  for (let x = 0; x <= width; x += 4) {
    const yOff = y + Math.sin(x * frequency) * amplitude
    if (x === 0) ctx.moveTo(x, yOff)
    else ctx.lineTo(x, yOff)
  }
  ctx.stroke()
  // Parallel wave lines
  for (let line = 1; line <= 3; line++) {
    ctx.beginPath()
    ctx.globalAlpha = 0.3
    const yBase = y + (line * h) / 3 - h / 2
    for (let x = 0; x <= width; x += 8) {
      const yOff = yBase + Math.sin(x * frequency + line * 0.8) * amplitude * 0.5
      if (x === 0) ctx.moveTo(x, yOff)
      else ctx.lineTo(x, yOff)
    }
    ctx.stroke()
    ctx.globalAlpha = 1
  }
  ctx.restore()
}

function drawMeanderBorder(ctx, x, y, width, height, color) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 2.5
  const unit = 16
  ctx.beginPath()
  ctx.moveTo(x, y)
  let cx = x, cy = y
  let goingRight = true
  let goingDown = true
  let iterations = 0
  const maxIter = 200
  while (cx < x + width && cx > x - unit && cy < y + height && cy > y - unit && iterations < maxIter) {
    iterations++
    if (goingRight) {
      const nextX = Math.min(cx + unit * 3, x + width - unit)
      ctx.lineTo(nextX, cy)
      cx = nextX
    } else {
      const nextX = Math.max(cx - unit * 3, x + unit)
      ctx.lineTo(nextX, cy)
      cx = nextX
    }
    if (goingDown) {
      const nextY = Math.min(cy + unit, y + height - unit)
      ctx.lineTo(cx, nextY)
      cy = nextY
    } else {
      const nextY = Math.max(cy - unit, y + unit)
      ctx.lineTo(cx, nextY)
      cy = nextY
    }
    goingRight = !goingRight
    if (iterations % 2 === 0) goingDown = !goingDown
  }
  ctx.stroke()
  ctx.restore()
}

function drawPeony(ctx, x, y, size, color) {
  ctx.save()
  ctx.translate(x, y)
  ctx.fillStyle = color
  ctx.globalAlpha = 0.75
  const layers = 4
  for (let l = 0; l < layers; l++) {
    const petalCount = 5 + l * 2
    const layerSize = size * (0.3 + l * 0.2)
    ctx.beginPath()
    for (let i = 0; i <= petalCount; i++) {
      const angle = (i / petalCount) * Math.PI * 2 + (l * 0.3)
      const px = Math.cos(angle) * layerSize
      const py = Math.sin(angle) * layerSize
      if (i === 0) ctx.moveTo(px, py)
      else {
        const cpx = Math.cos(angle - Math.PI / petalCount) * layerSize * 1.4
        const cpy = Math.sin(angle - Math.PI / petalCount) * layerSize * 1.4
        ctx.quadraticCurveTo(cpx, cpy, px, py)
      }
    }
    ctx.fill()
  }
  ctx.globalAlpha = 1
  ctx.restore()
}

function drawLeaf(ctx, x, y, size, angle, color) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.fillStyle = color
  ctx.globalAlpha = 0.7
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.bezierCurveTo(size * 0.3, -size * 0.7, size * 0.8, -size * 0.4, size, 0)
  ctx.bezierCurveTo(size * 0.8, size * 0.4, size * 0.3, size * 0.7, 0, 0)
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.restore()
}

// ---- Style Textures ----

function generateQinghuaTexture() {
  const { canvas, ctx } = createCanvasCtx()
  // Cream/white porcelain background
  const bgGrad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  bgGrad.addColorStop(0, '#F2EDE5')
  bgGrad.addColorStop(0.5, '#E8E0D8')
  bgGrad.addColorStop(1, '#EFEAE0')
  ctx.fillStyle = bgGrad
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const blue = '#2B5797'
  const lightBlue = '#4A7AB5'

  // Cloud patterns scattered around
  const cloudPositions = [
    { x: 200, y: 200, s: 1.2 }, { x: 600, y: 150, s: 0.9 },
    { x: 400, y: 400, s: 1.1 }, { x: 750, y: 500, s: 0.8 },
    { x: 150, y: 600, s: 1.0 }, { x: 850, y: 300, s: 1.3 },
    { x: 500, y: 700, s: 0.7 }, { x: 300, y: 800, s: 1.0 },
    { x: 700, y: 750, s: 0.9 },
  ]
  cloudPositions.forEach(pos => drawCloud(ctx, pos.x, pos.y, pos.s, blue))

  // Lotus flowers
  drawLotus(ctx, 250, 350, 50, blue)
  drawLotus(ctx, 650, 200, 40, blue)
  drawLotus(ctx, 500, 550, 45, lightBlue)
  drawLotus(ctx, 800, 650, 35, blue)
  drawLotus(ctx, 180, 700, 38, blue)

  // Scroll vines
  drawScrollVine(ctx, 100, 500, 400, 25, blue)
  drawScrollVine(ctx, 400, 300, 300, 20, lightBlue)
  drawScrollVine(ctx, 600, 600, 350, 22, blue)
  drawScrollVine(ctx, 150, 250, 500, 18, blue)

  // Wave bands (near top and bottom)
  drawWaveBand(ctx, 80, canvas.width, 15, 0.015, lightBlue)
  drawWaveBand(ctx, canvas.height - 80, canvas.width, 15, 0.012, blue)

  // Meander border at top
  drawMeanderBorder(ctx, 40, 40, canvas.width - 80, 30, blue)
  drawMeanderBorder(ctx, 40, canvas.height - 70, canvas.width - 80, 30, blue)

  // Small decorative dots
  ctx.fillStyle = blue
  ctx.globalAlpha = 0.5
  for (let i = 0; i < 60; i++) {
    const dx = 80 + Math.random() * (canvas.width - 160)
    const dy = 80 + Math.random() * (canvas.height - 160)
    ctx.beginPath()
    ctx.arc(dx, dy, 2 + Math.random() * 3, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  makeTextureSeamless(canvas, ctx)
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = maxAnisotropy
  return texture
}

function generateFencaiTexture() {
  const { canvas, ctx } = createCanvasCtx()
  // Warm cream background
  const bgGrad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  bgGrad.addColorStop(0, '#FDF5E8')
  bgGrad.addColorStop(0.5, '#F5E6D0')
  bgGrad.addColorStop(1, '#FAEFDD')
  ctx.fillStyle = bgGrad
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const pink = '#D4878A'
  const darkPink = '#C06065'
  const green = '#6B8E5A'
  const darkGreen = '#4A7040'

  // Peonies
  drawPeony(ctx, 300, 250, 70, pink)
  drawPeony(ctx, 700, 300, 60, darkPink)
  drawPeony(ctx, 200, 550, 55, pink)
  drawPeony(ctx, 550, 600, 65, darkPink)
  drawPeony(ctx, 800, 650, 50, pink)
  drawPeony(ctx, 400, 800, 55, pink)

  // Leaves
  drawLeaf(ctx, 340, 290, 35, -0.5, green)
  drawLeaf(ctx, 260, 270, 30, 0.4, darkGreen)
  drawLeaf(ctx, 730, 330, 32, -0.3, green)
  drawLeaf(ctx, 670, 310, 28, 0.6, darkGreen)
  drawLeaf(ctx, 230, 580, 30, -0.4, green)
  drawLeaf(ctx, 520, 620, 33, 0.5, green)
  drawLeaf(ctx, 620, 590, 28, -0.6, darkGreen)
  drawLeaf(ctx, 430, 820, 30, 0.3, green)

  // Scroll vines
  drawScrollVine(ctx, 100, 150, 400, 20, green)
  drawScrollVine(ctx, 250, 450, 450, 18, darkGreen)
  drawScrollVine(ctx, 500, 350, 400, 22, green)

  // Border decorations
  ctx.strokeStyle = pink
  ctx.lineWidth = 3
  ctx.globalAlpha = 0.3
  for (let y = 50; y < canvas.height - 50; y += 120) {
    ctx.beginPath()
    ctx.moveTo(30, y)
    ctx.bezierCurveTo(canvas.width / 2, y + 15, canvas.width / 2, y + 15, canvas.width - 30, y)
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  makeTextureSeamless(canvas, ctx)
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = maxAnisotropy
  return texture
}

function generateJunTexture() {
  const { canvas, ctx } = createCanvasCtx()

  // Bright warm base
  const baseGrad = ctx.createRadialGradient(400, 400, 100, 400, 400, 800)
  baseGrad.addColorStop(0, '#f5d4a0')
  baseGrad.addColorStop(0.6, '#d4a878')
  baseGrad.addColorStop(1, '#b89070')
  ctx.fillStyle = baseGrad
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Multiple radial gradients for the flowing 窑变 look
  const gradients = [
    { x: 200, y: 300, r: 600, colors: ['#e8a040', '#c07030', 'transparent'] },
    { x: 700, y: 400, r: 500, colors: ['#d45c3a', '#b04a28', 'transparent'] },
    { x: 400, y: 600, r: 550, colors: ['#4a8bc2', '#3a6b9a', 'transparent'] },
    { x: 600, y: 200, r: 480, colors: ['#e67840', '#c05828', 'transparent'] },
    { x: 300, y: 800, r: 450, colors: ['#7a5a8a', '#5a4a6a', 'transparent'] },
    { x: 800, y: 700, r: 400, colors: ['#d47050', '#b05838', 'transparent'] },
  ]

  gradients.forEach(g => {
    const grad = ctx.createRadialGradient(g.x, g.y, g.r * 0.1, g.x, g.y, g.r)
    grad.addColorStop(0, g.colors[0])
    grad.addColorStop(0.5, g.colors[1])
    grad.addColorStop(1, g.colors[2])
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  })

  // Random color patches for extra 窑变 variety
  for (let i = 0; i < 80; i++) {
    const px = Math.random() * canvas.width
    const py = Math.random() * canvas.height
    const patchSize = 30 + Math.random() * 100
    const alpha = 0.08 + Math.random() * 0.25
    const patchColor = ['#e8a040', '#d45c3a', '#4a8bc2', '#e67840', '#7a5a8a'][Math.floor(Math.random() * 5)]
    const patchGrad = ctx.createRadialGradient(px, py, 0, px, py, patchSize)
    patchGrad.addColorStop(0, patchColor)
    patchGrad.addColorStop(1, 'transparent')
    ctx.fillStyle = patchGrad
    ctx.globalAlpha = alpha
    ctx.fillRect(px - patchSize, py - patchSize, patchSize * 2, patchSize * 2)
  }
  ctx.globalAlpha = 1

  // Subtle flowing lines
  ctx.strokeStyle = 'rgba(200, 180, 160, 0.15)'
  ctx.lineWidth = 1
  for (let i = 0; i < 30; i++) {
    ctx.beginPath()
    const startY = 50 + i * 32
    for (let x = 0; x <= canvas.width; x += 10) {
      const y = startY + Math.sin(x * 0.01 + i * 0.7) * 25 + Math.sin(x * 0.025 + i) * 15
      if (x === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  makeTextureSeamless(canvas, ctx)
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = maxAnisotropy
  return texture
}

function generateBaiTexture() {
  const { canvas, ctx } = createCanvasCtx()

  // Simple warm gradient
  const bgGrad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  bgGrad.addColorStop(0, '#F8F5F0')
  bgGrad.addColorStop(0.3, '#F3EFE8')
  bgGrad.addColorStop(0.6, '#F0EBE3')
  bgGrad.addColorStop(1, '#F5F1EA')
  ctx.fillStyle = bgGrad
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Very subtle specular highlights
  for (let i = 0; i < 20; i++) {
    const gx = Math.random() * canvas.width
    const gy = Math.random() * canvas.height
    const gr = 30 + Math.random() * 60
    const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr)
    grad.addColorStop(0, 'rgba(255,255,255,0.15)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = grad
    ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2)
  }

  makeTextureSeamless(canvas, ctx)
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = maxAnisotropy
  return texture
}

// 汝瓷：天青色釉面，自带冰裂纹
function generateRuciTexture() {
  const { canvas, ctx } = createCanvasCtx()
  // 天青色渐变背景
  const bgGrad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  bgGrad.addColorStop(0, '#B8D8D8')
  bgGrad.addColorStop(0.3, '#A0C8C8')
  bgGrad.addColorStop(0.6, '#8bb8b8')
  bgGrad.addColorStop(1, '#9CC0C0')
  ctx.fillStyle = bgGrad
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // 天然冰裂纹
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'
  ctx.lineWidth = 0.8
  for (let i = 0; i < 45; i++) {
    const sx = Math.random() * canvas.width, sy = Math.random() * canvas.height
    ctx.beginPath(); ctx.moveTo(sx, sy)
    let cx = sx, cy = sy
    for (let j = 0; j < 4; j++) {
      cx += (Math.random() - 0.5) * 100; cy += (Math.random() - 0.5) * 100
      ctx.lineTo(cx, cy)
    }
    ctx.stroke()
  }
  // 细纹
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 0.4
  for (let i = 0; i < 30; i++) {
    const sx = Math.random() * canvas.width, sy = Math.random() * canvas.height
    ctx.beginPath(); ctx.moveTo(sx, sy)
    let cx = sx, cy = sy
    for (let j = 0; j < 3; j++) {
      cx += (Math.random() - 0.5) * 60; cy += (Math.random() - 0.5) * 60
      ctx.lineTo(cx, cy)
    }
    ctx.stroke()
  }
  // 釉面高光
  for (let i = 0; i < 15; i++) {
    const gx = Math.random() * canvas.width, gy = Math.random() * canvas.height
    const gr = 40 + Math.random() * 80
    const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr)
    g.addColorStop(0, 'rgba(255,255,255,0.18)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g; ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2)
  }

  makeTextureSeamless(canvas, ctx)
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = maxAnisotropy
  return texture
}

// 哥瓷：米黄色釉面，金丝铁线开片
function generateGeciTexture() {
  const { canvas, ctx } = createCanvasCtx()
  // 米黄色渐变
  const bgGrad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  bgGrad.addColorStop(0, '#F0E8D0')
  bgGrad.addColorStop(0.4, '#e6d7b8')
  bgGrad.addColorStop(0.7, '#EDE0C8')
  bgGrad.addColorStop(1, '#E8DCC0')
  ctx.fillStyle = bgGrad
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // 金丝 (细密金色裂纹)
  ctx.strokeStyle = 'rgba(196,154,58,0.32)'
  ctx.lineWidth = 0.7
  for (let i = 0; i < 40; i++) {
    const sx = Math.random() * canvas.width, sy = Math.random() * canvas.height
    ctx.beginPath(); ctx.moveTo(sx, sy)
    let cx = sx, cy = sy
    for (let j = 0; j < 4; j++) {
      cx += (Math.random() - 0.5) * 80; cy += (Math.random() - 0.5) * 80
      ctx.lineTo(cx, cy)
    }
    ctx.stroke()
  }
  // 铁线 (深色粗裂纹)
  ctx.strokeStyle = 'rgba(61,44,26,0.28)'
  ctx.lineWidth = 2.2
  for (let i = 0; i < 15; i++) {
    const sx = Math.random() * canvas.width, sy = Math.random() * canvas.height
    ctx.beginPath(); ctx.moveTo(sx, sy)
    let cx = sx, cy = sy
    for (let j = 0; j < 3; j++) {
      cx += (Math.random() - 0.5) * 140; cy += (Math.random() - 0.5) * 140
      ctx.lineTo(cx, cy)
    }
    ctx.stroke()
  }
  // 釉面光泽
  for (let i = 0; i < 12; i++) {
    const gx = Math.random() * canvas.width, gy = Math.random() * canvas.height
    const gr = 30 + Math.random() * 70
    const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr)
    g.addColorStop(0, 'rgba(255,255,255,0.12)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g; ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2)
  }

  makeTextureSeamless(canvas, ctx)
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = maxAnisotropy
  return texture
}

function generateCrackleTexture() {
  const { canvas, ctx } = createCanvasCtx(1024, 1024)

  // Generate crack pattern using recursive subdivision
  const cracks = []
  const gridSize = 32
  const cellSize = canvas.width / gridSize

  // Create grid points
  const grid = []
  for (let i = 0; i <= gridSize; i++) {
    grid[i] = []
    for (let j = 0; j <= gridSize; j++) {
      grid[i][j] = {
        x: i * cellSize + (Math.random() - 0.5) * cellSize * 0.3,
        y: j * cellSize + (Math.random() - 0.5) * cellSize * 0.3,
      }
    }
  }

  // Draw crack lines along grid edges
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)'
  ctx.lineWidth = 1.5

  for (let i = 0; i <= gridSize; i++) {
    for (let j = 0; j <= gridSize; j++) {
      const p = grid[i][j]
      // Connect to right neighbor
      if (i < gridSize && Math.random() > 0.4) {
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        const q = grid[i + 1][j]
        ctx.lineTo(q.x, q.y)
        ctx.stroke()
      }
      // Connect to bottom neighbor
      if (j < gridSize && Math.random() > 0.4) {
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        const q = grid[i][j + 1]
        ctx.lineTo(q.x, q.y)
        ctx.stroke()
      }
    }
  }

  // Additional random branching cracks
  ctx.lineWidth = 0.8
  ctx.globalAlpha = 0.5
  for (let c = 0; c < 40; c++) {
    const startX = Math.random() * canvas.width
    const startY = Math.random() * canvas.height
    ctx.beginPath()
    ctx.moveTo(startX, startY)
    let cx = startX, cy = startY
    const steps = 3 + Math.floor(Math.random() * 6)
    for (let s = 0; s < steps; s++) {
      cx += (Math.random() - 0.5) * 60
      cy += (Math.random() - 0.5) * 60
      ctx.lineTo(cx, cy)
    }
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = maxAnisotropy
  return texture
}

function generatePatternTextTexture(text, alpha) {
  const { canvas, ctx } = createCanvasCtx(1024, 2048)
  if (!text || !text.trim()) {
    const texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.anisotropy = maxAnisotropy
    return texture
  }

  const fontSize = 48
  ctx.font = `bold ${fontSize}px "KaiTi", "楷体", "STKaiti", "SimSun", "宋体", serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = `rgba(43, 87, 151, ${alpha})`

  const chars = text.split('')
  const cols = 4
  const rows = Math.ceil(chars.length / cols)
  const cellW = canvas.width / cols
  const cellH = canvas.height / rows

  chars.forEach((char, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const cx = col * cellW + cellW / 2
    const cy = row * cellH + cellH / 2
    ctx.fillText(char, cx, cy)
  })

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = maxAnisotropy
  return texture
}

// ─── Scene Initialization ──────────────────────────────────────────────────

function initScene() {
  // Scene
  const scn = new THREE.Scene()
  scn.background = new THREE.Color(0x000000)

  // Camera — 人眼高度视角，距离模型约25cm，模拟手持观看距离
  const shape = ceramicStore.currentShape || 'meiping'
  const camCfg = getShapeCameraConfig(shape)
  const cam = new THREE.PerspectiveCamera(45, 1, 0.01, 1000)
  if (shape === 'chabei') {
    cam.position.set(0, 0.15, camCfg.distance)
  } else if (shape === 'panzi') {
    cam.position.set(0, -0.02, camCfg.distance)
  } else {
    cam.position.set(0, camCfg.targetY, camCfg.distance)
  }

  // Renderer with 4x MSAA + FXAA post-processing for industrial-grade anti-aliasing
  const rend = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: "high-performance",
  })
  // 8x SSAA 超采样抗锯齿（4x→8x，彻底消除边缘锯齿和曲面不连续）
  rend.setPixelRatio(Math.min(window.devicePixelRatio * 2, 2))
  rend.setClearColor(0x000000, 1)
  rend.shadowMap.enabled = true
  rend.shadowMap.type = THREE.PCFSoftShadowMap
  rend.outputColorSpace = THREE.SRGBColorSpace
  // 各向异性过滤（16x），消除远处模型纹理锯齿
  maxAnisotropy = rend.capabilities.getMaxAnisotropy()

  // Controls — 360度无死角查看：放开所有角度限制，宽缩放范围
  const ctrl = new OrbitControls(cam, rend.domElement)
  ctrl.enableDamping = true
  ctrl.dampingFactor = 0.08
  if (shape === 'chabei') {
    ctrl.target.set(0, 0.18, 0)
  } else if (shape === 'panzi') {
    ctrl.target.set(0, -0.05, 0)
  } else {
    ctrl.target.set(0, camCfg.targetY, 0)
  }
  ctrl.update()
  ctrl.minDistance = 0.3
  ctrl.maxDistance = 5
  ctrl.minPolarAngle = 0
  ctrl.maxPolarAngle = Math.PI

  // ── 真实室内自然光系统 ──
  // 1. 柔和环境光
  const ambLight = new THREE.AmbientLight(0xffffff, 0.55)
  scn.add(ambLight)

  // 5. 内部弱环境光
  const innerLight = new THREE.PointLight(0xffffff, 0.3)
  innerLight.position.set(0, 0.3, 0); innerLight.distance = 3; innerLight.decay = 1
  scn.add(innerLight)
  innerAmbientLight.value = innerLight

  // 6. 底部补光（防止盘底等朝下面过黑）
  const bottomLight = new THREE.PointLight(0xFFF5E3, 0.8)
  bottomLight.position.set(0, -2.5, 0); bottomLight.distance = 4; bottomLight.decay = 1.5
  scn.add(bottomLight)

  // 2. 主侧光（45度右上）
  const keyDirLight = new THREE.DirectionalLight(0xFFF5E3, 1.2)
  keyDirLight.position.set(5, 6, 5)
  keyDirLight.castShadow = true
  keyDirLight.shadow.mapSize.width = 1024; keyDirLight.shadow.mapSize.height = 1024
  keyDirLight.shadow.camera.near = 0.5; keyDirLight.shadow.camera.far = 30
  keyDirLight.shadow.camera.left = -6; keyDirLight.shadow.camera.right = 6
  keyDirLight.shadow.camera.top = 6; keyDirLight.shadow.camera.bottom = -6
  scn.add(keyDirLight)

  // 3. 辅侧光（45度左上）
  const fillDirLight = new THREE.DirectionalLight(0xD4E0FF, 1.2)
  fillDirLight.position.set(-3, 3, 2); scn.add(fillDirLight)

  // Rim light
  const rimLightObj = new THREE.DirectionalLight(0x88bbff, 0.5)
  rimLightObj.position.set(0, 0, -4); scn.add(rimLightObj)

  // ── Grid ──
  const grid = new THREE.GridHelper(4, 24, 0xC4B5A2, 0xD4C5B2)
  grid.position.y = -1.05
  grid.visible = false
  scn.add(grid)

  // ── Ceramic Group ──
  const group = new THREE.Group()
  scn.add(group)

  // ── Pedestal (64段高精度圆滑底座) ──
  const pedGeo = new THREE.CylinderGeometry(0.32, 0.35, 0.08, 64)
  const pedMat = new THREE.MeshStandardMaterial({ color: 0x5C4A3A, roughness: 0.7, metalness: 0.05 })
  const ped = new THREE.Mesh(pedGeo, pedMat)
  ped.position.y = -1.04
  ped.castShadow = true
  ped.receiveShadow = true
  scn.add(ped)
  pedestalMesh = ped

  // ── 指针交互与拖拽事件监听器 ──
  rend.domElement.addEventListener('pointerdown', onPointerDown)
  rend.domElement.addEventListener('pointermove', onPointerMove)
  rend.domElement.addEventListener('pointerup', onPointerUp)
  // HTML5 拖放支持（从工具栏拖入图案到3D表面）
  rend.domElement.addEventListener('dragenter', onDragEnter)
  rend.domElement.addEventListener('dragover', onDragOver)
  rend.domElement.addEventListener('dragleave', onDragLeave)
  rend.domElement.addEventListener('drop', onDrop)

  // ── 键盘快捷键监听 ──
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)

  // ── FXAA 后期处理抗锯齿（二次消除边缘锯齿）──
  const fxaaComposer = new EffectComposer(rend)
  const renderPass = new RenderPass(scn, cam)
  fxaaComposer.addPass(renderPass)
  const fxaaShaderPass = new ShaderPass(FXAAShader)
  // 根据分辨率自适应FXAA参数
  const pixelRatio = rend.getPixelRatio()
  fxaaShaderPass.uniforms['resolution'].value.set(
    1 / (window.innerWidth * pixelRatio),
    1 / (window.innerHeight * pixelRatio)
  )
  fxaaComposer.addPass(fxaaShaderPass)

  // Store refs
  scene.value = scn
  camera.value = cam
  renderer.value = rend
  controls.value = ctrl
  composer.value = fxaaComposer
  fxaaPass.value = fxaaShaderPass
  ceramicGroup.value = group
  gridHelper.value = grid
  pedestal.value = ped
  keyLight.value = keyDirLight
  fillLight.value = fillDirLight
  rimLight.value = rimLightObj
  ambientLight.value = ambLight
}

// ─── Ceramic Building ──────────────────────────────────────────────────────

function disposeObject3D(obj) {
  if (!obj) return
  if (obj.geometry) obj.geometry.dispose()
  if (obj.material) {
    if (Array.isArray(obj.material)) {
      obj.material.forEach(m => disposeMaterial(m))
    } else {
      disposeMaterial(obj.material)
    }
  }
}

function disposeMaterial(mat) {
  if (!mat) return
  for (const key of Object.keys(mat)) {
    const val = mat[key]
    if (val && val instanceof THREE.Texture) {
      val.dispose()
    }
  }
  mat.dispose()
}

function buildCeramic() {
  const group = ceramicGroup.value
  if (!group) return

  // 清理交互状态（重建陶瓷时清除选中和预览）
  deselectPattern()
  hideDragPreview()

  const style = ceramicStore.currentStyle
  const shape = ceramicStore.currentShape

  // Clean up old meshes
  if (ceramicMesh.value) {
    disposeObject3D(ceramicMesh.value)
    group.remove(ceramicMesh.value)
    ceramicMesh.value = null
  }
  if (patternMesh.value) {
    disposeObject3D(patternMesh.value)
    group.remove(patternMesh.value)
    patternMesh.value = null
  }
  if (innerPatternMesh.value) {
    disposeObject3D(innerPatternMesh.value)
    group.remove(innerPatternMesh.value)
    innerPatternMesh.value = null
  }

  if (innerCeramicMesh.value) {
    disposeObject3D(innerCeramicMesh.value)
    group.remove(innerCeramicMesh.value)
    innerCeramicMesh.value = null
  }

  // Get geometry
  const geometry = createGeometry(shape)

  // Get style texture
  let styleTex = null
  switch (style) {
    case 'qinghua': styleTex = generateQinghuaTexture(); break
    case 'fencai': styleTex = generateFencaiTexture(); break
    case 'jun': styleTex = generateJunTexture(); break
    case 'bai': styleTex = generateBaiTexture(); break
    case 'ruci': styleTex = generateRuciTexture(); break
    case 'geci': styleTex = generateGeciTexture(); break
    default: styleTex = generateQinghuaTexture(); break
  }

  // Build material (PBR ceramic: mirror-smooth glaze, zero metalness)
  const baseColor = getStyleColor(style)
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(baseColor),
    map: styleTex,
    metalness: 0.0,
    roughness: 0.22,
    transparent: ceramicStore.opacity < 1.0,
    opacity: ceramicStore.opacity,
    side: THREE.FrontSide,
    flatShading: false,
    envMapIntensity: 0.6,
  })

  if (style === 'jun') {
    material.metalness = 0.2; material.roughness = 0.25
    material.emissive = new THREE.Color(0x332211); material.emissiveIntensity = 0.1
    material.envMapIntensity = 0.8
  }

  const mesh = new THREE.Mesh(geometry, material)
  mesh.castShadow = true; mesh.receiveShadow = true
  mesh.renderOrder = 1
  group.add(mesh)
  ceramicMesh.value = mesh

  // Inner surface (polygonOffset prevents z-fighting with outer at rim)
  const innerCeramicMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(baseColor), map: styleTex,
    metalness: ceramicStore.metalness, roughness: ceramicStore.roughness,
    transparent: ceramicStore.opacity < 1.0, opacity: ceramicStore.opacity, side: THREE.BackSide,
    flatShading: false, envMapIntensity: 0.6,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  })
  if (style === 'jun') {
    innerCeramicMat.metalness = 0.2; innerCeramicMat.roughness = 0.25
    innerCeramicMat.emissive = new THREE.Color(0x332211); innerCeramicMat.emissiveIntensity = 0.1
    innerCeramicMat.envMapIntensity = 0.8
  }
  const innerMesh = new THREE.Mesh(geometry, innerCeramicMat)
  innerMesh.renderOrder = 0
  group.add(innerMesh)
  innerCeramicMesh.value = innerMesh

  // Pattern overlay (polygonOffset pushes it back in depth-space, no scale trick needed)
  patternTextTexture = generatePatternTextTexture(ceramicStore.patternText, ceramicStore.patternOpacity)
  const patternMat = new THREE.MeshBasicMaterial({
    map: patternTextTexture, transparent: true,
    opacity: ceramicStore.patternOpacity, depthWrite: false, alphaTest: 0, side: THREE.FrontSide,
  })
  const patMesh = new THREE.Mesh(geometry.clone(), patternMat)
  patMesh.scale.set(1.001, 1.001, 1.001); patMesh.renderOrder = 3
  patMesh.material.depthTest = true; patMesh.material.depthWrite = false
  group.add(patMesh)
  patternMesh.value = patMesh

  // Inner pattern
  if (innerPatternMesh.value) { disposeObject3D(innerPatternMesh.value); group.remove(innerPatternMesh.value); innerPatternMesh.value = null }
  const innerPatMat = new THREE.MeshBasicMaterial({
    transparent: true, opacity: 1, depthWrite: false, alphaTest: 0, side: THREE.BackSide,
  })
  const innerPatMesh = new THREE.Mesh(geometry.clone(), innerPatMat)
  innerPatMesh.scale.set(0.999, 0.999, 0.999); innerPatMesh.renderOrder = 2
  innerPatMesh.material.depthTest = true; innerPatMesh.material.depthWrite = false
  group.add(innerPatMesh)
  innerPatternMesh.value = innerPatMesh

  // Adjust pedestal for different shapes
  if (pedestalMesh) {
    if (shape === 'wanzhan') {
      pedestalMesh.scale.set(1.3, 1.3, 1.3)
      pedestalMesh.position.y = -0.46
    } else if (shape === 'chabei') {
      pedestalMesh.scale.set(1.1, 1.1, 1.1)
      pedestalMesh.position.y = -0.44
    } else if (shape === 'panzi') {
      pedestalMesh.scale.set(1.8, 1.8, 1.8)
      pedestalMesh.position.y = -0.22
    } else if (shape === 'bitong') {
      pedestalMesh.scale.set(1.2, 1.2, 1.2)
      pedestalMesh.position.y = -0.82
    } else if (shape === 'jiangjun') {
      pedestalMesh.scale.set(1.3, 1.3, 1.3)
      pedestalMesh.position.y = -1.04
    } else {
      pedestalMesh.scale.set(1, 1, 1)
      pedestalMesh.position.y = -1.04
    }
  }

  // Re-composite patterns onto texture after ceramic rebuild
  compositeFinalTexture()
  // 应用釉色
  applyGlazeToMaterials()
}

// ─── Builtin Model Builder (20260602 终极版·0.1秒即时加载) ───────────────

/**
 * 使用内置精品模型的 LatheGeometry profile 构建陶瓷
 * 与 buildCeramic() 相同的材质/纹理/图案流程，但使用自定义剖面曲线
 */
function buildBuiltinCeramic() {
  const group = ceramicGroup.value
  if (!group) return

  const profilePoints = ceramicStore.builtinModelProfile
  if (!profilePoints || !profilePoints.length) {
    console.warn('[Ceramic3D] No builtin model profile, falling back to default')
    buildCeramic()
    return
  }

  deselectPattern()
  hideDragPreview()

  const style = ceramicStore.currentStyle
  const shape = '__builtin__'

  // Clean up old meshes
  if (ceramicMesh.value) { disposeObject3D(ceramicMesh.value); group.remove(ceramicMesh.value); ceramicMesh.value = null }
  if (patternMesh.value) { disposeObject3D(patternMesh.value); group.remove(patternMesh.value); patternMesh.value = null }
  if (innerPatternMesh.value) { disposeObject3D(innerPatternMesh.value); group.remove(innerPatternMesh.value); innerPatternMesh.value = null }
  if (innerCeramicMesh.value) { disposeObject3D(innerCeramicMesh.value); group.remove(innerCeramicMesh.value); innerCeramicMesh.value = null }
  if (importedModelGroup.value) { disposeObject3D(importedModelGroup.value); group.remove(importedModelGroup.value); importedModelGroup.value = null }

  // 无缝旋转成型几何体 + 圆润唇边
  const rimProfile = smoothProfileRim([...profilePoints])
  const geometry = createWeldedLatheGeometry(rimProfile, 512)

  // Get or reuse style texture
  let styleTex = cachedStyleTex
  if (!styleTex || cachedStyleName !== style) {
    if (cachedStyleTex) cachedStyleTex = null
    switch (style) {
      case 'qinghua': styleTex = generateQinghuaTexture(); break
      case 'fencai': styleTex = generateFencaiTexture(); break
      case 'jun': styleTex = generateJunTexture(); break
      case 'bai': styleTex = generateBaiTexture(); break
      case 'ruci': styleTex = generateRuciTexture(); break
      case 'geci': styleTex = generateGeciTexture(); break
      default: styleTex = generateQinghuaTexture(); break
    }
    cachedStyleTex = styleTex
    cachedStyleName = style
  }

  const baseColor = getStyleColor(style)
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(baseColor),
    map: styleTex,
    metalness: 0.0,
    roughness: 0.22,
    transparent: ceramicStore.opacity < 1.0,
    opacity: ceramicStore.opacity,
    side: THREE.FrontSide,
    flatShading: false,
    envMapIntensity: 0.6,
  })

  if (style === 'jun') {
    material.metalness = 0.2; material.roughness = 0.25
    material.emissive = new THREE.Color(0x332211); material.emissiveIntensity = 0.1
    material.envMapIntensity = 0.8
  }

  const mesh = new THREE.Mesh(geometry, material)
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = true
  mesh.renderOrder = 1
  group.add(mesh)
  ceramicMesh.value = mesh

  // Inner surface (polygonOffset prevents z-fighting with outer at rim)
  const innerMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(baseColor), map: styleTex,
    metalness: ceramicStore.metalness, roughness: ceramicStore.roughness,
    transparent: ceramicStore.opacity < 1.0, opacity: ceramicStore.opacity, side: THREE.BackSide,
    flatShading: false, envMapIntensity: 0.6,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  })
  if (style === 'jun') {
    innerMat.metalness = 0.2; innerMat.roughness = 0.25
    innerMat.emissive = new THREE.Color(0x332211); innerMat.emissiveIntensity = 0.1
    innerMat.envMapIntensity = 0.8
  }
  const innerMesh = new THREE.Mesh(geometry, innerMat)
  innerMesh.renderOrder = 0
  group.add(innerMesh)
  innerCeramicMesh.value = innerMesh

  // Pattern overlay (polygonOffset pushes it back in depth-space)
  const patMat = new THREE.MeshBasicMaterial({
    map: patternTextTexture, transparent: true,
    opacity: ceramicStore.patternOpacity, depthWrite: false, alphaTest: 0, side: THREE.FrontSide,
  })
  const patMesh = new THREE.Mesh(geometry.clone(), patMat)
  patMesh.scale.set(1.001, 1.001, 1.001); patMesh.renderOrder = 3
  patMesh.material.depthTest = true; patMesh.material.depthWrite = false
  group.add(patMesh)
  patternMesh.value = patMesh

  // Inner pattern
  const innerPatMat = new THREE.MeshBasicMaterial({
    transparent: true, opacity: 1, depthWrite: false, alphaTest: 0, side: THREE.BackSide,
  })
  const innerPatMesh = new THREE.Mesh(geometry.clone(), innerPatMat)
  innerPatMesh.scale.set(0.999, 0.999, 0.999); innerPatMesh.renderOrder = 2
  innerPatMesh.material.depthTest = true; innerPatMesh.material.depthWrite = false
  group.add(innerPatMesh)
  innerPatternMesh.value = innerPatMesh

  // Pedestal
  if (pedestalMesh) {
    pedestalMesh.scale.set(1, 1, 1)
    pedestalMesh.position.y = -1.04
  }

  compositeFinalTexture()
  applyGlazeToMaterials()
}

// ─── Imported GLB Model Builder (20260602) ────────────────────────────────

/**
 * 加载从在线模型库导入的 GLB 模型
 * 使用 GLTFLoader 加载，自动缩放、居中，应用陶瓷材质和釉色
 */
async function buildImportedCeramic() {
  const group = ceramicGroup.value
  if (!group) return

  const modelInfo = ceramicStore.importedModel
  if (!modelInfo || (!modelInfo.glbUrl && !modelInfo.glbData)) {
    console.warn('[Ceramic3D] No imported model to load')
    return
  }

  deselectPattern()
  hideDragPreview()

  // Clean up old meshes
  if (ceramicMesh.value) { disposeObject3D(ceramicMesh.value); group.remove(ceramicMesh.value); ceramicMesh.value = null }
  if (patternMesh.value) { disposeObject3D(patternMesh.value); group.remove(patternMesh.value); patternMesh.value = null }
  if (innerPatternMesh.value) { disposeObject3D(innerPatternMesh.value); group.remove(innerPatternMesh.value); innerPatternMesh.value = null }
  if (innerCeramicMesh.value) { disposeObject3D(innerCeramicMesh.value); group.remove(innerCeramicMesh.value); innerCeramicMesh.value = null }
  if (importedModelGroup.value) { disposeObject3D(importedModelGroup.value); group.remove(importedModelGroup.value); importedModelGroup.value = null }

  const style = ceramicStore.currentStyle
  const baseColor = getStyleColor(style)

  try {
    const loader = new GLTFLoader()

    let gltf
    if (modelInfo.glbData instanceof ArrayBuffer) {
      gltf = await new Promise((resolve, reject) => {
        loader.parse(modelInfo.glbData, '', (result) => resolve(result), (err) => reject(err))
      })
    } else {
      gltf = await new Promise((resolve, reject) => {
        loader.load(modelInfo.glbUrl, (result) => resolve(result), () => {}, (err) => reject(err))
      })
    }

    const importedScene = gltf.scene

    // ═══ 自动优化1: 计算包围盒，缩放居中到目标尺寸 ═══
    importedScene.updateMatrixWorld()
    const box = new THREE.Box3().setFromObject(importedScene)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const targetSize = 1.8
    const sc = targetSize / (maxDim || 1)

    importedScene.scale.setScalar(sc)
    importedScene.position.set(-center.x * sc, -center.y * sc, -center.z * sc)

    // ═══ 自动优化2: 遍历所有网格，修复法线+材质 ═══
    const outerColor = ceramicStore.outerGlazeColor
    const glazeColor = outerColor ? new THREE.Color(outerColor) : new THREE.Color(baseColor)

    importedScene.traverse((child) => {
      if (!child.isMesh) return

      // 修复法线（解决发黑、面翻转问题）
      if (child.geometry) {
        // 删除重复顶点
        child.geometry.deleteAttribute('normal') // 清除可能损坏的法线
        if (child.geometry.index) {
          child.geometry = child.geometry.toNonIndexed() // 转为非索引以正确计算法线
        }
        child.geometry.computeVertexNormals()

        // 修复NaN法线
        const normals = child.geometry.attributes.normal
        if (normals) {
          for (let i = 0; i < normals.count; i++) {
            const x = normals.getX(i), y = normals.getY(i), z = normals.getZ(i)
            if (isNaN(x) || isNaN(y) || isNaN(z) || (x === 0 && y === 0 && z === 0)) {
              normals.setXYZ(i, 0, 1, 0) // 默认朝上
            }
          }
          normals.needsUpdate = true
        }

        child.geometry.computeBoundingSphere()
        child.geometry.computeBoundingBox()
      }

      // 阴影
      child.castShadow = true
      child.receiveShadow = true

      // 修复材质
      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material]
        mats.forEach(mat => {
          // 修复: 确保side为FrontSide（防止背面发黑）
          if (mat.side === undefined || mat.side === THREE.DoubleSide) {
            mat.side = THREE.FrontSide
          }

          // 修复: 确保为标准材质
          if (!(mat instanceof THREE.MeshStandardMaterial) && !(mat instanceof THREE.MeshPhysicalMaterial)) {
            // 转换为 MeshStandardMaterial 以支持PBR光照
            const oldMap = mat.map
            const oldColor = mat.color ? mat.color.getHex() : 0xE8E0D8
            const newMat = new THREE.MeshStandardMaterial({
              map: oldMap,
              color: oldMap ? 0xFFFFFF : oldColor,
              metalness: ceramicStore.metalness,
              roughness: ceramicStore.roughness,
              transparent: ceramicStore.opacity < 1.0,
              opacity: ceramicStore.opacity,
              side: THREE.FrontSide,
            })
            child.material = newMat
            mat.dispose()
            return
          }

          // 保留原始纹理，否则应用陶瓷PBR参数
          if (!mat.map) {
            mat.color = glazeColor
          }
          mat.metalness = ceramicStore.metalness
          mat.roughness = ceramicStore.roughness
          mat.transparent = ceramicStore.opacity < 1.0
          mat.opacity = ceramicStore.opacity

          // 修复: 确保无自发光残留（防止颜色异常）
          if (mat.emissive) {
            mat.emissive = new THREE.Color(0x000000)
            mat.emissiveIntensity = 0
          }

          mat.needsUpdate = true
        })
      }
    })

    group.add(importedScene)
    importedModelGroup.value = importedScene
    ceramicMesh.value = importedScene

    // Adjust pedestal to match model bottom
    if (pedestalMesh) {
      pedestalMesh.scale.set(1, 1, 1)
      pedestalMesh.position.y = -0.80 - maxDim * sc * 0.05
    }

    // Composite patterns
    compositeFinalTexture()
    applyGlazeToMaterials()

    console.log('[Ceramic3D] Imported model optimized and loaded successfully')

  } catch (err) {
    console.error('[Ceramic3D] Failed to load imported model:', err)
    ElMessage.error('导入模型加载失败: ' + (err.message || '未知错误'))
  }
}

function updateMaterialParams() {
  const mesh = ceramicMesh.value
  if (mesh && mesh.material) {
    mesh.material.metalness = ceramicStore.metalness
    mesh.material.roughness = ceramicStore.roughness
    mesh.material.opacity = ceramicStore.opacity
    mesh.material.transparent = ceramicStore.opacity < 1.0
    mesh.material.needsUpdate = true
  }
  // Sync inner ceramic surface (BackSide)
  const innerMesh = innerCeramicMesh.value
  if (innerMesh && innerMesh.material) {
    innerMesh.material.metalness = ceramicStore.metalness
    innerMesh.material.roughness = ceramicStore.roughness
    innerMesh.material.opacity = ceramicStore.opacity
    innerMesh.material.transparent = ceramicStore.opacity < 1.0
    innerMesh.material.needsUpdate = true
  }
  // 同步釉色
  applyGlazeToMaterials()
}

// ─── 一键上釉色（20260602）──────────────────────────────────────────────

/**
 * 将 store 中的釉色应用到陶瓷材质
 * 釉色通过 material.color 乘法叠加在纹理上，图案不受影响
 */
function applyGlazeToMaterials() {
  const outerColor = ceramicStore.outerGlazeColor
  const innerColor = ceramicStore.innerGlazeColor

  if (ceramicMesh.value && ceramicMesh.value.material) {
    if (outerColor) {
      ceramicMesh.value.material.color.set(outerColor)
    } else {
      ceramicMesh.value.material.color.set(getStyleColor(ceramicStore.currentStyle))
    }
    ceramicMesh.value.material.needsUpdate = true
  }

  if (innerCeramicMesh.value && innerCeramicMesh.value.material) {
    if (innerColor) {
      innerCeramicMesh.value.material.color.set(innerColor)
    } else {
      innerCeramicMesh.value.material.color.set(getStyleColor(ceramicStore.currentStyle))
    }
    innerCeramicMesh.value.material.needsUpdate = true
  }

  if (innerPatternMesh.value && innerPatternMesh.value.material) {
    innerPatternMesh.value.material.color.set(innerColor || '#FFFFFF')
    innerPatternMesh.value.material.needsUpdate = true
  }
  if (patternMesh.value && patternMesh.value.material) {
    patternMesh.value.material.color.set('#FFFFFF')
    patternMesh.value.material.needsUpdate = true
  }
}

// ─── Pattern Overlay Updates ──────────────────────────────────────────────

function updatePatternOverlay() {
  if (patternTextTexture) {
    patternTextTexture.dispose()
    patternTextTexture = null
  }

  patternTextTexture = generatePatternTextTexture(ceramicStore.patternText, ceramicStore.patternOpacity)

  const patMesh = patternMesh.value
  if (patMesh && patMesh.material) {
    patMesh.material.map = patternTextTexture
    patMesh.material.opacity = ceramicStore.patternOpacity
    patMesh.material.needsUpdate = true
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── 图案交互系统：拖拽放置、选择与HTML5拖放 ───────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

// ─── 工具函数 ──────────────────────────────────────────────────────────────

/**
 * 获取鼠标在canvas上的归一化设备坐标（NDC: -1 到 +1）
 * @param {PointerEvent|MouseEvent} event
 * @returns {{ x: number, y: number }}
 */
function getPointerNDC(event) {
  const rect = canvasContainer.value.getBoundingClientRect()
  return {
    x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
    y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
  }
}

/**
 * 检测射线交点是在陶瓷表面的外部还是内部
 * LatheGeometry 中，法线指向外侧则为外部，指向内侧（朝向Y轴）则为内部
 * @param {THREE.Intersection} intersect - raycaster 交点
 * @returns {'outer'|'inner'}
 */
function detectSurfaceType(intersect) {
  if (!intersect) return 'outer'
  // 如果命中点是内表面网格或内表面图案网格，直接判定为 inner
  if (intersect.object === innerCeramicMesh.value || intersect.object === innerPatternMesh.value) {
    return 'inner'
  }
  if (!intersect.face || !ceramicMesh.value) return 'outer'
  const mesh = ceramicMesh.value
  const localNormal = intersect.face.normal.clone()
  const localPoint = intersect.point.clone()
  mesh.worldToLocal(localPoint)
  const radialDir = new THREE.Vector3(localPoint.x, 0, localPoint.z)
  const radialLen = radialDir.length()
  if (radialLen < 0.001) {
    const camDir = new THREE.Vector3().copy(camera.value.position).sub(intersect.point).normalize()
    const worldNormal = localNormal.clone().transformDirection(mesh.matrixWorld)
    return worldNormal.dot(camDir) > 0 ? 'outer' : 'inner'
  }
  radialDir.normalize()
  return localNormal.dot(radialDir) > 0 ? 'outer' : 'inner'
}

// ─── 选中/取消选中 ────────────────────────────────────────────────────────

/**
 * 选中指定ID的图案，显示蓝色半透明选择环
 * @param {string} id - 图案ID
 */
function selectPattern(id) {
  deselectPattern()
  selectedPatternId = id

  const pat = ceramicStore.attachedPatterns.find(p => p.id === id)
  if (!pat) return

  if (pat.surfaceType === 'inner') {
    ceramicStore.selectInnerPattern(id)
  } else {
    ceramicStore.selectOuterPattern(id)
  }

  const pos = getPattern3DPosition(id)
  if (!pos) return

  const patScale = pat?.scale || 0.3
  const ringScale = patScale * 1.25
  const accentColor = pat.surfaceType === 'inner' ? 0x44FF44 : 0x44AAFF
  // 上浮偏移加大到0.04，明显凸起
  const floatOffset = pos.clone().normalize().multiplyScalar(0.04)

  // ── Layer 1: 图案区域半透明高亮覆盖盘 ──
  const fillGeo = new THREE.CircleGeometry(ringScale * 0.92, 32)
  const fillMat = new THREE.MeshBasicMaterial({
    color: accentColor,
    transparent: true,
    opacity: 0.15,
    depthTest: true,
    depthWrite: false,
    side: THREE.FrontSide,
  })
  selectionFillMesh = new THREE.Mesh(fillGeo, fillMat)
  selectionFillMesh.renderOrder = 2
  selectionFillMesh.position.copy(pos).add(floatOffset)
  selectionFillMesh.lookAt(0, 0, 0)

  // ── Layer 2: 宽白色柔光外圈 ──
  const glowGeo = new THREE.RingGeometry(ringScale * 0.70, ringScale * 1.15, 40)
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xFFFFFF,
    transparent: true,
    opacity: 0.7,
    depthTest: true,
    depthWrite: false,
    side: THREE.FrontSide,
  })
  selectionGlowMesh = new THREE.Mesh(glowGeo, glowMat)
  selectionGlowMesh.renderOrder = 3
  selectionGlowMesh.position.copy(pos).add(floatOffset)
  selectionGlowMesh.lookAt(0, 0, 0)

  // ── Layer 3: 鲜艳内圈选择环 ──
  const ringGeo = new THREE.RingGeometry(ringScale * 0.80, ringScale * 1.00, 40)
  const ringMat = new THREE.MeshBasicMaterial({
    color: accentColor,
    transparent: true,
    opacity: 0.9,
    depthTest: true,
    depthWrite: false,
    side: THREE.FrontSide,
  })
  selectionRingMesh = new THREE.Mesh(ringGeo, ringMat)
  selectionRingMesh.renderOrder = 4
  selectionRingMesh.position.copy(pos).add(floatOffset)
  selectionRingMesh.lookAt(0, 0, 0)

  if (ceramicGroup.value) {
    ceramicGroup.value.add(selectionFillMesh)
    ceramicGroup.value.add(selectionGlowMesh)
    ceramicGroup.value.add(selectionRingMesh)
  }
}

/**
 * 取消选中当前图案，移除选择环并清理资源
 */
function deselectPattern() {
  [selectionRingMesh, selectionGlowMesh, selectionFillMesh].forEach(m => {
    if (m) {
      if (ceramicGroup.value) ceramicGroup.value.remove(m)
      if (m.geometry) m.geometry.dispose()
      if (m.material) m.material.dispose()
    }
  })
  selectionRingMesh = null
  selectionGlowMesh = null
  selectionFillMesh = null
  selectedPatternId = null
  ceramicStore.clearAllSelections()
}

// ── 悬停高亮 ──
function showHoverRing(id) {
  hideHoverRing()
  const pat = ceramicStore.attachedPatterns.find(p => p.id === id)
  if (!pat || !pat.position) return
  const pos = new THREE.Vector3(pat.position.x, pat.position.y, pat.position.z)
  const patScale = pat.scale || 0.3
  // Slightly larger hover ring with higher opacity for better visibility
  const ringGeo = new THREE.RingGeometry(patScale * 0.8, patScale * 1.1, 32)
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x88CCFF, transparent: true, opacity: 0.35,
    depthTest: true, depthWrite: false, side: THREE.FrontSide,
  })
  hoverRingMesh = new THREE.Mesh(ringGeo, ringMat)
  hoverRingMesh.renderOrder = 2
  hoverRingMesh.position.copy(pos)
  hoverRingMesh.lookAt(0, 0, 0)
  ceramicGroup.value?.add(hoverRingMesh)
}

function hideHoverRing() {
  if (hoverRingMesh) {
    ceramicGroup.value?.remove(hoverRingMesh)
    if (hoverRingMesh.geometry) hoverRingMesh.geometry.dispose()
    if (hoverRingMesh.material) hoverRingMesh.material.dispose()
    hoverRingMesh = null
  }
}

// ─── 拖拽预览 ──────────────────────────────────────────────────────────────

/**
 * 显示拖拽/放置预览 - 半透明图案跟随鼠标在3D表面上移动
 * @param {string} dataUrl - 纹理数据URL
 * @param {THREE.Vector3} point - 3D表面交点位置（陶瓷组局部坐标）
 */
function showDragPreview(dataUrl, point, tintColor) {
  // 重用或创建预览网格
  if (!dragPreviewMesh) {
    const dragGeo = new THREE.CircleGeometry(ceramicStore.patternScale || 0.3, 16)
    const dragMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.45,
      depthTest: true,
      depthWrite: false,
      side: THREE.FrontSide,
      color: tintColor || 0x4488FF,
    })
    dragPreviewMesh = new THREE.Mesh(dragGeo, dragMat)
    dragPreviewMesh.renderOrder = 3
    if (ceramicGroup.value) {
      ceramicGroup.value.add(dragPreviewMesh)
    }
  }

  // Set tint color
  if (dragPreviewMesh.material) {
    dragPreviewMesh.material.color.setHex(tintColor || 0x4488FF)
    dragPreviewMesh.material.needsUpdate = true
  }

  // 按需加载纹理（来源变化时重新加载）
  if (!dragPreviewMesh.material.map || dragPreviewMesh.userData.lastSrc !== dataUrl) {
    if (dragPreviewMesh.material.map) {
      dragPreviewMesh.material.map.dispose()
    }
    const loader = new THREE.TextureLoader()
    loader.load(dataUrl, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace
      tex.needsUpdate = true
      if (dragPreviewMesh?.material) {
        dragPreviewMesh.material.map = tex
        dragPreviewMesh.material.needsUpdate = true
      }
    })
    dragPreviewMesh.userData.lastSrc = dataUrl
  }

  dragPreviewMesh.position.copy(point)
  dragPreviewMesh.lookAt(0, 0, 0)
  dragPreviewMesh.visible = true
}

/**
 * 隐藏拖拽预览
 */
function hideDragPreview() {
  if (dragPreviewMesh) {
    dragPreviewMesh.visible = false
  }
}

// ─── 指针事件处理 ──────────────────────────────────────────────────────────

/**
 * 处理指针按下事件（pointerdown）
 * 按在图案上 → 选中并准备拖拽（禁用OrbitControls）
 * 按在陶瓷表面 + 有待放置图案 → 立即贴附图案（默认缩放0.3）
 * 按在空白处 → 取消选中
 */
function onPointerDown(event) {
  if (event.target !== renderer.value?.domElement) return

  const ndc = getPointerNDC(event)
  mouse.x = ndc.x
  mouse.y = ndc.y

  pointerDownPos = { x: event.clientX, y: event.clientY }
  hasMovedSinceDown = false
  wasPointerDownOnPattern = false

  raycaster.setFromCamera(mouse, camera.value)

  // ════════════════════════════════════════════════════════════
  // 20260602 内壁优先生效拾取：俯视器皿内部时优先选中内壁图案
  // ════════════════════════════════════════════════════════════
  const cameraIsInside = isCameraInsideCeramic()
  const lookingInto = isCameraLookingIntoVessel()
  // Alt键临时锁定外壁拾取
  const forceOuterPick = event.altKey

  // 同时检测内外表面
  const outerHits = safeIntersect(ceramicMesh.value)
  const innerHits = safeIntersect(innerCeramicMesh.value)

  // 确定拾取优先级：俯视器皿内部 → 内壁优先；平视/Alt → 外壁优先
  const prioritizeInner = (lookingInto || cameraIsInside) && !forceOuterPick

  let hitPattern = null
  let hitPoint = null
  let hitUv = null

  // ── 优先生效路径 ──
  if (prioritizeInner && innerHits.length > 0 && innerHits[0].uv) {
    const iuv = innerHits[0].uv
    // 内壁图案拾取范围上浮30%
    hitPattern = findPatternAtUV({ u: iuv.x, v: iuv.y }, { surfaceType: 'inner' })
    if (hitPattern) {
      hitPoint = innerHits[0].point
      hitUv = iuv
    }
  }

  // ── 内壁优先未命中 → 回退到外壁 ──
  if (!hitPattern && outerHits.length > 0 && outerHits[0].uv) {
    const ouv = outerHits[0].uv
    hitPattern = findPatternAtUV({ u: ouv.x, v: ouv.y }, { surfaceType: 'outer' })
    if (hitPattern) {
      hitPoint = outerHits[0].point
      hitUv = ouv
    } else if (prioritizeInner && innerHits.length > 0 && innerHits[0].uv) {
      // 外壁无图案时回退到内壁（无surfaceType过滤）
      const iuvFallback = innerHits[0].uv
      hitPattern = findPatternAtUV({ u: iuvFallback.x, v: iuvFallback.y })
      if (hitPattern) { hitPoint = innerHits[0].point; hitUv = iuvFallback }
    }
  }

  // ── 外壁优先路径（平视或Alt锁定） ──
  if (!prioritizeInner && !hitPattern && outerHits.length > 0 && outerHits[0].uv) {
    const ouv = outerHits[0].uv
    hitPattern = findPatternAtUV({ u: ouv.x, v: ouv.y }, { surfaceType: 'outer' })
    if (hitPattern) { hitPoint = outerHits[0].point; hitUv = ouv }
  }

  // ── 兜底：无表面类型过滤 ──
  if (!hitPattern) {
    if (outerHits.length > 0 && outerHits[0].uv) {
      hitPattern = findPatternAtUV({ u: outerHits[0].uv.x, v: outerHits[0].uv.y })
      if (hitPattern) { hitPoint = outerHits[0].point; hitUv = outerHits[0].uv }
    }
    if (!hitPattern && innerHits.length > 0 && innerHits[0].uv) {
      hitPattern = findPatternAtUV({ u: innerHits[0].uv.x, v: innerHits[0].uv.y })
      if (hitPattern) { hitPoint = innerHits[0].point; hitUv = innerHits[0].uv }
    }
  }

  if (hitPattern) {
    wasPointerDownOnPattern = true

    // Store all overlapping patterns for Alt+click cycling
    overlappingPatterns = findOverlappingPatternsAtUV(hitUv || { u: 0.5, v: 0.5 })

    // Alt+click: cycle to next overlapping pattern
    if (event.altKey && overlappingPatterns.length > 1) {
      const currentIdx = overlappingPatterns.findIndex(p => p.id === selectedPatternId)
      const nextIdx = (currentIdx + 1) % overlappingPatterns.length
      const nextPattern = overlappingPatterns[nextIdx]
      if (nextPattern && nextPattern.id !== selectedPatternId) {
        selectPattern(nextPattern.id)
        return
      }
    }

    if (selectedPatternId !== hitPattern.id) {
      selectPattern(hitPattern.id)
    }

    event.preventDefault()
    if (controls.value) { controls.value.enabled = false }
    pendingDragPatternId = hitPattern.id
    if (canvasContainer.value) { canvasContainer.value.style.cursor = 'grabbing' }
    return
  }

  // ── 图案未命中 → 继续陶瓷表面检测（贴附模式）──
  const ceramicIntersects = outerHits.length > 0 ? outerHits : innerHits
  if (ceramicIntersects.length > 0) {
    const uv = ceramicIntersects[0].uv
    const point = ceramicIntersects[0].point

    // 检查是否有待放置图案（click-to-place模式）
    if (ceramicStore.pendingPatternTexture) {
      const textureDataUrl = ceramicStore.pendingPatternTexture
      const patternSource = ceramicStore.pendingPatternSource
      const patternSourceId = ceramicStore.pendingPatternSourceId
      const pos = { x: point.x, y: point.y, z: point.z }
      const uvPos = uv ? { u: uv.x, v: uv.y } : { u: 0.5, v: 0.5 }
      const surfaceType = ceramicStore.activePlacementSurface

      // 20260602 可靠贴附：加载期间保留预览，加载完成后再隐藏
      const tempId = 'preload_' + Date.now()
      preloadPatternImage(tempId, textureDataUrl).then(() => {
        const patId = ceramicStore.attachPattern(textureDataUrl, pos, uvPos, patternSource, patternSourceId, surfaceType)
        if (patId) {
          const img = patternImageCache.get(tempId)
          if (img) {
            patternImageCache.set(patId, img)
            patternImageCache.delete(tempId)
          }
          ceramicStore.updateAttachedPattern(patId, { scale: 0.3 })
          // 强制立即合成并渲染，跳过帧守卫确保当帧可见
          compositeFinalTexture(true)
          if (renderer.value && scene.value && camera.value) {
            if (composer.value) composer.value.render()
            else renderer.value.render(scene.value, camera.value)
          }
          ElMessage.success('图案已放置')
        }
        // 贴附成功后隐藏预览（支持连续多点贴附）
        hideDragPreview()
        if (canvasContainer.value) {
          canvasContainer.value.style.cursor = ''
        }
      }).catch(err => {
        console.error('[Ceramic3D] 图案贴附加载失败', err)
        ElMessage.error('图案加载失败，请重试')
        ceramicStore.clearPendingPattern()
        hideDragPreview()
        if (canvasContainer.value) {
          canvasContainer.value.style.cursor = ''
        }
      })

      // 触发 pattern-placed 事件
      const normal = ceramicIntersects[0].face.normal.clone()
      normal.transformDirection(ceramicMesh.value.matrixWorld)
      emit('pattern-placed', {
        position: pos,
        uv: uvPos,
        normal: { x: normal.x, y: normal.y, z: normal.z },
      })
      return
    }

    // Click on empty ceramic surface → deselect
    deselectPattern()
  } else {
    deselectPattern()
  }
}

/**
 * 处理指针移动事件（pointermove）
 * - 拖拽选中图案时：实时更新图案和选择环位置
 * - 有待放置图案时：在3D表面显示半透明预览
 * - 悬停在图案上时：显示pointer光标
 */
function onPointerMove(event) {
  if (!pointerDownPos && !ceramicStore.pendingPatternTexture) {
    // Hover mode - show cursor/hover ring
    const ndc = getPointerNDC(event)
    mouse.x = ndc.x
    mouse.y = ndc.y
    raycaster.setFromCamera(mouse, camera.value)
    const hits = safeIntersect(ceramicMesh.value)
    let isOnPattern = false
    if (hits.length > 0 && hits[0].uv) {
      // 20260601 表面隔离：悬停时仅检测相机视角对应的表面图案
      const camInside = isCameraInsideCeramic()
      const hoverHit = findPatternAtUV(
        { u: hits[0].uv.x, v: hits[0].uv.y },
        { surfaceType: camInside ? 'inner' : 'outer' }
      )
      isOnPattern = hoverHit !== null
      if (hoverHit && hoveredPatternId !== hoverHit.id) {
        hoveredPatternId = hoverHit.id
        showHoverRing(hoverHit.id)
      } else if (!hoverHit) {
        hoveredPatternId = null
        hideHoverRing()
      }
    } else {
      hoveredPatternId = null
      hideHoverRing()
    }
    if (canvasContainer.value) {
      canvasContainer.value.style.cursor = isOnPattern ? 'pointer' : ''
    }
    return
  }

  const ndc = getPointerNDC(event)
  mouse.x = ndc.x
  mouse.y = ndc.y

  if (pointerDownPos) {
    // 计算移动距离，判断是否超过拖拽阈值
    const dx = event.clientX - pointerDownPos.x
    const dy = event.clientY - pointerDownPos.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist > 0) {
      hasMovedSinceDown = true
    }

    // 超过阈值且按在图案上 → 激活拖拽
    if (wasPointerDownOnPattern && hasMovedSinceDown && dist >= DRAG_THRESHOLD && !isDraggingPattern) {
      isDraggingPattern = true
    }
  }

  raycaster.setFromCamera(mouse, camera.value)

  // ── 拖拽选中图案 → UV增量移动（Ctrl+拖拽走旋转分支，不进入此分支）──
  // 使用屏幕鼠标增量计算UV偏移，避免每帧昂贵的 raycaster.intersectObject 调用
  if (isDraggingPattern && selectedPatternId && !event.ctrlKey && !event.metaKey) {
    event.preventDefault()

    // Initialize lastDragPos on first drag frame
    if (!lastDragPos) {
      lastDragPos = { x: event.clientX, y: event.clientY }
      return
    }

    // Frame-to-frame delta for smooth tracking
    const dx = event.clientX - lastDragPos.x
    const dy = event.clientY - lastDragPos.y
    lastDragPos = { x: event.clientX, y: event.clientY }

    const canvasRect = renderer.value?.domElement.getBoundingClientRect()
    if (!canvasRect) return

    const pixToUv = 1.0 / Math.max(canvasRect.width, canvasRect.height) * PATTERN_DRAG_SENSITIVITY
    const sens = event.shiftKey ? PATTERN_SHIFT_SENSITIVITY : 1.0

    const du = dx * pixToUv * sens
    const dv = dy * pixToUv * sens

    const pat = ceramicStore.attachedPatterns.find(p => p.id === selectedPatternId)
    if (!pat || !pat.uv) return

    const newU = Math.max(0, Math.min(1, pat.uv.u + du))
    const newV = Math.max(0, Math.min(1, pat.uv.v + dv))

    // U轴循环包裹（图案可以环绕瓶身）
    const wrappedU = ((newU % 1) + 1) % 1

    // 仅更新UV（不再每帧调用昂贵的 raycaster）
    ceramicStore.updateAttachedPattern(selectedPatternId, {
      uv: { u: +wrappedU.toFixed(4), v: +newV.toFixed(4) },
    })

    // ── 20260601 表面锁定：拖拽时图案终生保持在绑定表面，禁止跨表面切换 ──
    // 图案一旦贴附到某表面即永久锁定，拖拽不会改变 surfaceType

    // 更新选择环的近似3D位置（pointerUp时再精确同步）
    const dragPos = getPattern3DPosition(selectedPatternId)
    if (dragPos) {
      const dragOffset = dragPos.clone().normalize().multiplyScalar(0.04)
      ;[selectionRingMesh, selectionGlowMesh, selectionFillMesh].forEach(m => {
        if (m) { m.position.copy(dragPos).add(dragOffset); m.lookAt(0, 0, 0) }
      })
    }

    // 标记纹理待更新，由animate循环在下一帧执行合成
    textureDirty = true

    return
  }

  // ── Ctrl+拖拽旋转图案 ──
  if (isDraggingPattern && selectedPatternId && (event.ctrlKey || event.metaKey)) {
    const ceramicIntersects = safeIntersect(ceramicMesh.value)
    if (ceramicIntersects.length > 0) {
      const dx = event.clientX - (pointerDownPos?.x || event.clientX)
      const rotDelta = dx * 0.01
      const pat = ceramicStore.attachedPatterns.find(p => p.id === selectedPatternId)
      if (pat) {
        let newRotation
        if (event.shiftKey) {
          const deg = (pat.rotation || 0) * 180 / Math.PI
          const snapped = Math.round(deg / 15) * 15
          newRotation = snapped * Math.PI / 180
        } else {
          newRotation = (pat.rotation || 0) + rotDelta
        }
        ceramicStore.updateAttachedPattern(selectedPatternId, { rotation: newRotation })
        const rotPos = ceramicIntersects[0].point
        const rotOffset = rotPos.clone().normalize().multiplyScalar(0.04)
        if (selectionRingMesh && ceramicGroup.value) {
          const pat2 = ceramicStore.attachedPatterns.find(p => p.id === selectedPatternId)
          const ps = (pat2?.scale || 0.3) * 1.25
          selectionRingMesh.geometry.dispose()
          selectionRingMesh.geometry = new THREE.RingGeometry(ps * 0.80, ps * 1.00, 40)
          selectionRingMesh.position.copy(rotPos).add(rotOffset)
          selectionRingMesh.lookAt(0, 0, 0)
          ceramicGroup.value.add(selectionRingMesh)
        }
        textureDirty = true
      }
    }
    return
  }

  // ── 有待放置图案 → 显示3D表面预测预览 ──
  if (ceramicStore.pendingPatternTexture && !isDraggingPattern) {
    // 20260601 表面锁定：仅检测活动贴附面
    let ceramicIntersects
    if (ceramicStore.activePlacementSurface === 'inner') {
      ceramicIntersects = safeIntersect(innerCeramicMesh.value)
      if (ceramicIntersects.length === 0) {
        ceramicIntersects = safeIntersect(ceramicMesh.value)
      }
    } else {
      ceramicIntersects = safeIntersect(ceramicMesh.value)
      if (ceramicIntersects.length === 0) {
        ceramicIntersects = safeIntersect(innerCeramicMesh.value)
      }
    }

    if (ceramicIntersects.length > 0) {
      const point = ceramicIntersects[0].point
      // 20260601 表面锁定：预览色调跟随活动贴附面
      const tintColor = ceramicStore.activePlacementSurface === 'inner' ? 0x44CC44 : 0x4488FF
      // 确保预览网格的几何体大小与默认放置缩放一致
      if (dragPreviewMesh && dragPreviewMesh.geometry) {
        const targetScale = ceramicStore.patternScale || 0.3
        if (Math.abs(dragPreviewMesh.geometry.parameters.radius - targetScale) > 0.001) {
          dragPreviewMesh.geometry.dispose()
          dragPreviewMesh.geometry = new THREE.CircleGeometry(targetScale, 16)
        }
      }
      showDragPreview(ceramicStore.pendingPatternTexture, point, tintColor)
      if (canvasContainer.value) {
        canvasContainer.value.style.cursor = 'crosshair'
      }
    } else {
      hideDragPreview()
      if (canvasContainer.value) {
        canvasContainer.value.style.cursor = ''
      }
    }
  }
}

/**
 * 处理指针释放事件（pointerup）
 * - 结束拖拽：最终确定图案位置并写入store
 * - 恢复OrbitControls和默认光标
 */
function onPointerUp(event) {
  // ── 结束拖拽，持久化最终位置 ──
  if (isDraggingPattern && selectedPatternId) {
    // 拖拽中，UV已通过onPointerMove的UV增量方式实时更新到store
    // position已过时，需要一次 raycaster 来同步3D位置
    isDraggingPattern = false

    // 拖拽结束后，用一次 raycaster 从屏幕中心方向获取精确3D位置
    const pat = ceramicStore.attachedPatterns.find(p => p.id === selectedPatternId)
    if (pat && pat.uv && wasPointerDownOnPattern) {
      raycaster.setFromCamera(mouse, camera.value)
      
      // 第1步：先检测陶瓷外表面 (FrontSide)
      let hits = safeIntersect(ceramicMesh.value)
      
      // 第2步：再检测陶瓷内表面 (BackSide) — 用于内表面图案的3D位置同步
      if (hits.length === 0) {
        const innerHits = safeIntersect(innerCeramicMesh.value)
        if (innerHits.length > 0) {
          hits = innerHits
        }
      }
      
      // 第3步：如果仍未命中，尝试直接检测内表面图案网格
      if (hits.length === 0 && innerPatternMesh.value) {
        const innerPatHits = safeIntersect(innerPatternMesh.value)
        if (innerPatHits.length > 0) {
          hits = innerPatHits
        }
      }
      
      if (hits.length > 0 && hits[0].uv) {
        const hitUv = { u: hits[0].uv.x, v: hits[0].uv.y }
        const dist = Math.sqrt(
          Math.pow(hitUv.u - pat.uv.u, 2) +
          Math.pow(hitUv.v - pat.uv.v, 2)
        )
        // 仅当碰撞UV与当前UV接近时才更新3D位置（防止误匹配到不同表面）
        if (dist < 0.05) {
          ceramicStore.updateAttachedPattern(selectedPatternId, {
            position: { x: hits[0].point.x, y: hits[0].point.y, z: hits[0].point.z }
          })
          
          // 20260601 表面锁定：拖拽结束后不修改 surfaceType
          // 图案终生绑定在贴附时指定的表面，绝不可跨表面变更
        }
      }
    }
  }

  // 拖拽结束 → 恢复排除的图案
  if (pendingDragPatternId) {
    pendingDragPatternId = null
  }

  // 恢复OrbitControls（拖拽期间被禁用）
  if (controls.value && !controls.value.enabled) {
    controls.value.enabled = true
  }

  // 恢复默认光标
  if (canvasContainer.value) {
    canvasContainer.value.style.cursor = ''
  }

  // 重置交互状态
  pointerDownPos = null
  wasPointerDownOnPattern = false
  hasMovedSinceDown = false

  // 拖拽/旋转结束 → 强制最终合成（确保最终纹理质量，跳过帧更新延迟）
  if (textureDirty) {
    textureDirty = false
    compositeFinalTexture()
  }
}

// ─── 键盘快捷键 ────────────────────────────────────────────────────────────

function onKeyDown(event) {
  // Tab to cycle through patterns (20260601 表面隔离：仅循环当前视角对应表面的图案)
  if (event.key === 'Tab') {
    event.preventDefault()
    const camInside = isCameraInsideCeramic()
    const surfaceFilter = camInside ? 'inner' : 'outer'
    const patterns = ceramicStore.attachedPatterns.filter(p => p.surfaceType === surfaceFilter)
    if (patterns.length === 0) return
    if (!selectedPatternId) { selectPattern(patterns[0].id); return }
    const idx = patterns.findIndex(p => p.id === selectedPatternId)
    if (idx === -1) { selectPattern(patterns[0].id); return }
    const nextIdx = event.shiftKey
      ? (idx - 1 + patterns.length) % patterns.length
      : (idx + 1) % patterns.length
    selectPattern(patterns[nextIdx].id)
  }
  // Escape to deselect
  if (event.key === 'Escape') {
    deselectPattern()
  }
  // Delete/Backspace to remove selected pattern
  if ((event.key === 'Delete' || event.key === 'Backspace') && selectedPatternId && !event.target.closest('input,textarea')) {
    const id = selectedPatternId
    deselectPattern()
    ceramicStore.removeAttachedPattern(id)
    compositeFinalTexture()
    // 强制刷新渲染
    if (renderer.value && scene.value && camera.value) {
      renderer.value.render(scene.value, camera.value)
    }
  }
}

function onKeyUp(event) {
  // Ctrl released during rotation → finalize
  if ((event.key === 'Control' || event.key === 'Meta') && isDraggingPattern && selectedPatternId) {
    compositeFinalTexture()
  }
}

// ─── HTML5 拖放支持（从工具栏拖入图案到3D表面） ────────────────────────────

/**
 * 处理HTML5拖拽进入canvas
 * 显示crosshair光标，指示可以放置图案
 */
function onDragEnter(event) {
  event.preventDefault()
  if (canvasContainer.value) {
    canvasContainer.value.style.cursor = 'crosshair'
  }
}

/**
 * 处理拖拽在canvas上方移动
 * 投射3D交点并实时显示半透明预览
 */
function onDragOver(event) {
  event.preventDefault()
  event.dataTransfer.dropEffect = 'copy'

  const ndc = getPointerNDC(event)
  mouse.x = ndc.x
  mouse.y = ndc.y

  raycaster.setFromCamera(mouse, camera.value)
  let intersects = safeIntersect(ceramicMesh.value)
  // 20260601 内表面贴附时也检测内表面
  if (intersects.length === 0 && ceramicStore.activePlacementSurface === 'inner') {
    intersects = safeIntersect(innerCeramicMesh.value)
  }

  if (intersects.length > 0) {
    const point = intersects[0].point
    const dataUrl = event.dataTransfer.getData('text/plain')
    if (dataUrl) {
      // 20260601 预览色调跟随活动贴附面
      const tintColor = ceramicStore.activePlacementSurface === 'inner' ? 0x44CC44 : 0x4488FF
      showDragPreview(dataUrl, point, tintColor)
    }
  } else {
    hideDragPreview()
  }
}

/**
 * 处理拖拽离开canvas
 * 隐藏预览，恢复光标
 */
function onDragLeave(event) {
  event.preventDefault()
  hideDragPreview()
  if (canvasContainer.value) {
    canvasContainer.value.style.cursor = ''
  }
}

/**
 * 处理HTML5图案投放 - 在3D陶瓷表面放置图案
 * 优先使用 store 中的 pendingPatternTexture（由 onPatternDragStart 设置），
 * 避免 HTML5 DnD dataTransfer 对大尺寸 base64 的截断问题。
 * 通过射线检测确定3D位置，图案仅在命中陶瓷表面时才放置。
 */
function onDrop(event) {
  event.preventDefault()
  hideDragPreview()

  // 优先从 store 读取（避免 DnD dataTransfer 对大 base64 的截断）
  let dataUrl = ceramicStore.pendingPatternTexture
  // 兼容后备：从 dataTransfer 读取
  if (!dataUrl) {
    dataUrl = event.dataTransfer.getData('text/plain')
  }
  if (!dataUrl) return
  // 在 clear 之前读取来源信息
  const patternSource = ceramicStore.pendingPatternSource
  const patternSourceId = ceramicStore.pendingPatternSourceId
  // 使用后将 pending 清除
  ceramicStore.clearPendingPattern()

  const ndc = getPointerNDC(event)
  mouse.x = ndc.x
  mouse.y = ndc.y

  raycaster.setFromCamera(mouse, camera.value)
  let intersects = safeIntersect(ceramicMesh.value)
  // 20260601 内表面贴附时也检测内表面
  if (intersects.length === 0 && ceramicStore.activePlacementSurface === 'inner') {
    intersects = safeIntersect(innerCeramicMesh.value)
  }

  if (intersects.length > 0) {
    const point = intersects[0].point
    const uv = intersects[0].uv
    const pos = { x: point.x, y: point.y, z: point.z }
    const uvPos = uv ? { u: uv.x, v: uv.y } : { u: 0.5, v: 0.5 }
    // 20260601 表面锁定：使用用户选择的活动贴附面
    const surfaceType = ceramicStore.activePlacementSurface
    const tempId = 'drop_' + Date.now()

    preloadPatternImage(tempId, dataUrl).then(() => {
      const patId = ceramicStore.attachPattern(dataUrl, pos, uvPos, patternSource, patternSourceId, surfaceType)
      if (patId) {
        const img = patternImageCache.get(tempId)
        if (img) { patternImageCache.set(patId, img); patternImageCache.delete(tempId) }
        ceramicStore.updateAttachedPattern(patId, { scale: 0.3 })
        // 强制立即合成并渲染
        compositeFinalTexture(true)
        if (renderer.value && scene.value && camera.value) {
          renderer.value.render(scene.value, camera.value)
        }
      }
    }).catch(err => {
      console.error('[Ceramic3D] 拖放图案加载失败', err)
      ElMessage.error('图案加载失败，请重试')
    })

    const normal = intersects[0].face.normal.clone()
    normal.transformDirection(ceramicMesh.value.matrixWorld)
    emit('pattern-placed', {
      position: pos,
      uv: uvPos,
      normal: { x: normal.x, y: normal.y, z: normal.z },
    })
  }
  // 未命中陶瓷表面 → 图案被拒绝，不做任何放置

  if (canvasContainer.value) {
    canvasContainer.value.style.cursor = ''
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── UV 纹理合成系统 ──────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 预加载图案图片到缓存（Promise 封装，带超时和重试）
 * 必须在调用 attachPattern() 之前执行，确保 compositeFinalTexture() 运行时图片已在缓存
 * @param {string} id - 图案ID
 * @param {string} dataUrl - base64或URL
 * @param {number} timeout - 超时毫秒数（默认3000）
 * @param {number} retries - 重试次数（默认1）
 * @returns {Promise<HTMLImageElement>}
 */
/**
 * 自动铺贴配套纹样 — 计算均匀分布的UV坐标，逐个贴附图案
 * @param {Array} patterns - [{id, dataUrl, source, sourceId}]
 */
async function processAutoPatterns(patterns) {
  if (!patterns || !patterns.length) return

  console.log('[Ceramic3D] Auto-placing', patterns.length, 'companion patterns')

  for (let i = 0; i < patterns.length; i++) {
    const pat = patterns[i]
    try {
      // Preload image
      const tempId = 'auto_' + Date.now() + '_' + i
      await preloadPatternImage(tempId, pat.dataUrl, 8000, 2)

      // Calculate UV position: distribute evenly around the circumference
      // For 3 patterns: u=0.25, 0.5, 0.75  (front, side, back)
      // For 4 patterns: u=0.125, 0.375, 0.625, 0.875
      // For 5 patterns: u=0.1, 0.3, 0.5, 0.7, 0.9
      const u = patterns.length > 1
        ? 0.1 + (i / (patterns.length - 1)) * 0.8
        : 0.5
      const v = 0.35 + (i % 3) * 0.12  // Vary V slightly for layering

      const uvPos = { u: Math.max(0.05, Math.min(0.95, u)), v: Math.max(0.15, Math.min(0.85, v)) }

      // Attach pattern directly via store
      const patId = ceramicStore.attachPattern(
        pat.dataUrl,
        { x: 0, y: 0, z: 0 }, // position (not used for UV-attached patterns)
        uvPos,
        pat.source || 'builtin',
        pat.sourceId || pat.id,
        'outer' // outer surface by default
      )

      if (patId) {
        console.log('[Ceramic3D] Auto-placed pattern', pat.id || i, 'at UV', uvPos)
      }
    } catch (err) {
      console.warn('[Ceramic3D] Auto-pattern failed for', pat.id, err)
    }
  }

  // Force texture recomposite
  compositeFinalTexture()
}

function preloadPatternImage(id, dataUrl, timeout = 3000, retries = 1) {
  return new Promise((resolve, reject) => {
    if (patternImageCache.has(id)) {
      const cached = patternImageCache.get(id)
      if (cached) return resolve(cached)
    }
    
    function doLoad(attempt) {
      const img = new Image()
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        img.src = '' // 取消加载
        if (attempt < retries) {
          console.warn(`[Ceramic3D] 图案加载超时(id=${id}), 第${attempt + 1}次重试`)
          doLoad(attempt + 1)
        } else {
          patternImageCache.set(id, null) // 标记为失败
          reject(new Error(`图案加载超时(id=${id}), 已重试${retries}次`))
        }
      }, timeout)
      
      img.onload = () => {
        clearTimeout(timer)
        if (timedOut) return
        patternImageCache.set(id, img)
        compositeFinalTexture() // 加载完成后自动重绘
        resolve(img)
      }
      img.onerror = (err) => {
        clearTimeout(timer)
        if (timedOut) return
        console.error(`[Ceramic3D] 图案纹理加载失败 id=${id}`, err)
        if (attempt < retries) {
          console.warn(`[Ceramic3D] 图案加载重试 (id=${id}, attempt=${attempt + 1})`)
          doLoad(attempt + 1)
        } else {
          patternImageCache.set(id, null)
          reject(err)
        }
      }
      img.src = dataUrl
    }
    
    doLoad(0)
  })
}

/**
 * 清除不再需要的图案图片缓存
 */
function cleanPatternImageCache() {
  const activeIds = new Set(ceramicStore.attachedPatterns.map(p => p.id))
  for (const [id] of patternImageCache) {
    if (!activeIds.has(id)) patternImageCache.delete(id)
  }
}

// ─── 待重试合成的图案队列 ──
let pendingRetryComposite = false

/**
 * 合成最终纹理：将基础样式与图案按UV坐标合并到两张 CanvasTexture
 * - 外表面(outer)图案 → 主纹理（ceramicMesh.map）
 * - 内表面(inner)图案 → 内纹理（innerPatternMesh.map）
 * 
 * 如果某图案图片尚未加载完成，记录一次"待重试"标记，
 * 图片加载完成后会自动触发重新合成。
 */
function compositeFinalTexture(force = false) {
  // 去重守卫：如果合成正在进行中，标记待重试并返回
  if (compositeInProgress) {
    compositePending = true
    return
  }
  // 帧同步守卫：如果同一帧内多次请求合成，仅执行最后一次
  // force=true 时跳过此守卫（贴附回调等关键路径需要立即合成）
  if (!force && compositeFrameGuard) {
    compositePending = true
    return
  }
  compositeInProgress = true
  compositePending = false
  compositeFrameGuard = true
  requestAnimationFrame(() => { compositeFrameGuard = false })
  const W = 2048
  let hasPendingImages = false

  // ── 使用缓存的基础样式纹理（避免每次重新生成）──
  let baseTex
  if (cachedStyleName === ceramicStore.currentStyle && cachedStyleTex) {
    baseTex = cachedStyleTex  // 复用缓存
  } else {
    switch (ceramicStore.currentStyle) {
      case 'qinghua': baseTex = generateQinghuaTexture(); break
      case 'fencai': baseTex = generateFencaiTexture(); break
      case 'jun': baseTex = generateJunTexture(); break
      case 'bai': baseTex = generateBaiTexture(); break
      case 'ruci': baseTex = generateRuciTexture(); break
      case 'geci': baseTex = generateGeciTexture(); break
      default: baseTex = generateQinghuaTexture(); break
    }
    // 更新缓存（释放旧缓存）
    if (cachedStyleTex) cachedStyleTex.image?.close?.()
    cachedStyleTex = baseTex
    cachedStyleName = ceramicStore.currentStyle
  }
  const baseCanvas = baseTex.image

  function renderPatternsToCanvas(patterns) {
    const { canvas, ctx } = createCanvasCtx(W, W)
    ctx.drawImage(baseCanvas, 0, 0)

    patterns.forEach(pat => {
      const img = patternImageCache.get(pat.id)
      if (img === undefined) {
        hasPendingImages = true
        return
      }
      if (!img) return

      const uvCenter = pat.uv || { u: 0.5, v: 0.5 }
      const px = uvCenter.u * W
      const py = (1 - uvCenter.v) * W
      const size = (pat.scale || 0.3) * W
      const halfSize = size / 2

      // 20260602 边界包裹优化：只在图案实际跨越纹理边界时添加包裹副本
      // 避免全9宫格检查，大幅减少canvas draw调用
      const needsUWrap = px - halfSize < 0 || px + halfSize > W
      const needsVWrap = py - halfSize < 0 || py + halfSize > W
      const uOffsets = needsUWrap ? [-1, 0, 1] : [0]
      const vOffsets = needsVWrap ? [-1, 0, 1] : [0]

      for (const uOff of uOffsets) {
        for (const vOff of vOffsets) {
          if (uOff === 0 && vOff === 0 && !needsUWrap && !needsVWrap) {
            // 图案完全在画布内 — 只渲染一次
          }
          const wpx = px + uOff * W
          const wpy = py + vOff * W
          if (wpx + halfSize < 0 || wpx - halfSize > W ||
              wpy + halfSize < 0 || wpy - halfSize > W) continue

          ctx.save()
          ctx.globalAlpha = pat.opacity || 1.0
          ctx.translate(wpx, wpy)
          ctx.rotate(pat.rotation || 0)
          ctx.beginPath()
          ctx.arc(0, 0, halfSize, 0, Math.PI * 2)
          ctx.clip()
          ctx.drawImage(img, -halfSize, -halfSize, size, size)
          ctx.restore()
        }
      }
    })

    makeTextureSeamless(canvas, ctx)
    const tex = new THREE.CanvasTexture(canvas)
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = maxAnisotropy
    tex.flipY = false  // Canvas纹理无需翻转，UV与画布一致
    tex.needsUpdate = true
    return tex
  }

  // ════════════════════════════════════════════════════════════
  // 20260601 内外表面完全独立隔离修复
  // 外表面(outer)图案 → 仅渲染到外表面纹理，内部完全不可见
  // 内表面(inner)图案 → 仅渲染到内表面纹理，外部完全不可见
  // 两套纹理零共享、零耦合、零交叉渲染
  // ════════════════════════════════════════════════════════════
  const outerPatterns = ceramicStore.attachedPatterns.filter(p => p.surfaceType === 'outer')
  const innerPatterns = ceramicStore.attachedPatterns.filter(p => p.surfaceType === 'inner')

  // ── 2. 合成外表面纹理（仅外表面图案，零内表面图案混入）──
  if (compositeTexture) {
    compositeTexture.dispose()
    compositeTexture = null
  }
  compositeTexture = renderPatternsToCanvas(outerPatterns)

  // 应用到陶瓷外表面材质（FrontSide）
  if (ceramicMesh.value && ceramicMesh.value.material) {
    const mat = ceramicMesh.value.material
    mat.map = compositeTexture
    mat.needsUpdate = true
  }
  // 内表面陶瓷底层 — 仅底色，无任何图案（图案由 innerPatternMesh 独立承载）
  if (innerCeramicMesh.value && innerCeramicMesh.value.material) {
    const { canvas, ctx } = createCanvasCtx(2048, 2048)
    ctx.drawImage(baseCanvas, 0, 0)
    makeTextureSeamless(canvas, ctx)
    const innerBaseTex = new THREE.CanvasTexture(canvas)
    innerBaseTex.wrapS = THREE.RepeatWrapping
    innerBaseTex.wrapT = THREE.RepeatWrapping
    innerBaseTex.colorSpace = THREE.SRGBColorSpace
    innerBaseTex.anisotropy = maxAnisotropy
    innerBaseTex.needsUpdate = true
    if (innerCeramicMesh.value.material.map && innerCeramicMesh.value.material.map !== innerBaseTex) {
      innerCeramicMesh.value.material.map.dispose()
    }
    innerCeramicMesh.value.material.map = innerBaseTex
    innerCeramicMesh.value.material.needsUpdate = true
  }

  // ── 3. 合成内表面纹理（仅内表面图案，零外表面图案混入）──
  if (innerPatternMesh.value && innerPatternMesh.value.material) {
    const innerTex = renderPatternsToCanvas(innerPatterns)
    const innerMat = innerPatternMesh.value.material
    if (innerCompositeTexture) innerCompositeTexture.dispose()
    if (innerMat.map) innerMat.map.dispose()
    innerMat.map = innerTex
    innerCompositeTexture = innerTex
    innerMat.opacity = 1
    innerMat.needsUpdate = true
    innerPatternMesh.value.visible = true
  }

  // ── 4. 同步更新选择环 + 上浮光晕 ──
  if (selectedPatternId) {
    const pat = ceramicStore.attachedPatterns.find(p => p.id === selectedPatternId)
    if (pat) {
      const pos = getPattern3DPosition(selectedPatternId)
      const curScale = (pat.scale || 0.3) * 1.25
      const floatOffset = pos ? pos.clone().normalize().multiplyScalar(0.04) : null

      const updateRing = (mesh, innerR, outerR) => {
        if (!mesh || !pos) return
        mesh.position.copy(pos).add(floatOffset)
        mesh.lookAt(0, 0, 0)
        if (mesh.geometry.type === 'RingGeometry') {
          const o = mesh.geometry.parameters.outerRadius
          if (o && Math.abs(o - outerR) > 0.001) {
            mesh.geometry.dispose()
            mesh.geometry = new THREE.RingGeometry(innerR, outerR, 40)
          }
        } else if (mesh.geometry.type === 'CircleGeometry') {
          const r = mesh.geometry.parameters.radius
          if (r && Math.abs(r - outerR) > 0.001) {
            mesh.geometry.dispose()
            mesh.geometry = new THREE.CircleGeometry(outerR, 32)
          }
        }
      }
      updateRing(selectionFillMesh, 0, curScale * 0.92)
      updateRing(selectionGlowMesh, curScale * 0.70, curScale * 1.15)
      updateRing(selectionRingMesh, curScale * 0.80, curScale * 1.00)
    }
  }

  // ── 5. 重试标记 ──
  if (hasPendingImages && !pendingRetryComposite) {
    pendingRetryComposite = true
    setTimeout(() => {
      pendingRetryComposite = false
      compositeFinalTexture()
    }, 500)
  }

  // 清理过期缓存
  compositeInProgress = false
  if (compositePending) {
    // 如果有延迟的合成请求，立即重新执行
    compositePending = false
    compositeFinalTexture()
    return
  }
  cleanPatternImageCache()
}

/**
 * 根据UV坐标查找附近图案（用于点击选中、悬停检测）
 * 支持缩放感知阈值、表面类型过滤、返回全部重叠图案
 * @param {{u:number, v:number}} uv - 点击位置的UV
 * @param {object} options - { threshold, surfaceType, getAll }
 * @returns {object|object[]|null} 匹配的图案对象 或 图案数组(getAll=true时)
 */
function findPatternAtUV(uv, options = {}) {
  const { threshold, surfaceType, getAll = false } = options
  let results = []
  ceramicStore.attachedPatterns.forEach(pat => {
    if (!pat.uv) return
    // Filter by surface type if specified
    if (surfaceType && pat.surfaceType !== surfaceType) return

    const du = pat.uv.u - uv.u
    const dv = pat.uv.v - uv.v
    // 处理U方向环绕（u从0到1，0和1相邻）
    const duWrapped = Math.min(Math.abs(du), Math.abs(du - 1), Math.abs(du + 1))
    const dist = Math.sqrt(duWrapped * duWrapped + dv * dv)

    // Scale-based threshold: 2x pattern radius in UV space, minimum 0.02
    let patThreshold = threshold || Math.max((pat.scale || 0.3) * 2, 0.02)
    // 内表面图案拾取范围上浮30%，最小阈值也放大
    if (pat.surfaceType === 'inner') {
      patThreshold *= 1.3
    }
    // Also check against a minimum pixel-equivalent threshold (UV 0.016 ≈ 32px on 2048 texture)
    const minThreshold = Math.max(patThreshold, 0.016)

    if (dist < minThreshold) {
      results.push({ pattern: pat, distance: dist })
    }
  })

  // Sort by distance (closest first)
  results.sort((a, b) => a.distance - b.distance)

  if (getAll) return results.map(r => r.pattern)

  if (results.length > 0) {
    return results[0].pattern
  }
  return null
}

/**
 * 查找UV坐标处所有重叠图案
 * @param {{u:number, v:number}} uv - 查询位置的UV坐标
 * @returns {object[]} 图案对象数组
 */
function findOverlappingPatternsAtUV(uv) {
  return findPatternAtUV(uv, { getAll: true })
}

/**
 * 判断相机是否位于陶瓷内部
 * 通过检查相机在陶瓷局部空间的位置来判断
 * @returns {boolean}
 */
function isCameraInsideCeramic() {
  if (!camera.value || !ceramicMesh.value) return false
  const worldPos = camera.value.position.clone()
  ceramicMesh.value.worldToLocal(worldPos)
  const radialDist = Math.sqrt(worldPos.x * worldPos.x + worldPos.z * worldPos.z)
  const height = worldPos.y
  
  // 获取当前器型的最大半径（通过几何体边界框估算）
  const geom = ceramicMesh.value.geometry
  geom.computeBoundingBox()
  const bb = geom.boundingBox
  if (!bb) return false
  
  // 对于不同器型，使用不同的内部判定阈值
  const shape = ceramicStore.currentShape
  const maxRad = Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x), Math.abs(bb.min.z), Math.abs(bb.max.z))
  const heightRange = bb.max.y - bb.min.y
  
  // 针对不同器型的内部判定策略
  let radialThreshold, heightMin, heightMax
  if (shape === 'panzi') {
    // 盘子：极浅极宽，需要非常宽松的径向阈值
    radialThreshold = maxRad * 0.85
    heightMin = bb.min.y + heightRange * 0.02
    heightMax = bb.max.y - heightRange * 0.02
  } else if (shape === 'wanzhan' || shape === 'chabei') {
    radialThreshold = maxRad * 0.7
    heightMin = bb.min.y + heightRange * 0.05
    heightMax = bb.max.y - heightRange * 0.05
  } else {
    // 花瓶类：开口相对较小
    radialThreshold = maxRad * 0.5
    heightMin = bb.min.y + heightRange * 0.1
    heightMax = bb.max.y - heightRange * 0.1
  }
  
  const isWithinHeight = height > heightMin && height < heightMax
  const isCloseToAxis = radialDist < radialThreshold
  return isWithinHeight && isCloseToAxis && height < bb.max.y
}

/**
 * 判断相机是否正从上方俯视器皿内部（碗口/瓶口/盘面）
 * 用于内壁图案优先拾取判定
 */
function isCameraLookingIntoVessel() {
  if (!camera.value || !ceramicMesh.value) return false
  const worldPos = camera.value.position.clone()
  ceramicMesh.value.worldToLocal(worldPos)

  const geom = ceramicMesh.value.geometry
  geom.computeBoundingBox()
  const bb = geom.boundingBox
  if (!bb) return false

  const shape = ceramicStore.currentShape
  // 获取器型开口半径（轮廓最后一个点的X坐标，即口部半径）
  const openingRadius = bb.max.x * 0.85 // 近似口部半径
  const rimLevel = bb.max.y * 0.82      // 近似口沿高度

  // 相机在口部高度以上
  const aboveRim = worldPos.y > rimLevel
  // 相机水平位置在开口半径范围内
  const overOpening = Math.sqrt(worldPos.x * worldPos.x + worldPos.z * worldPos.z) < openingRadius * 1.4
  // 相机向下看（俯视角 > 15度）
  const camDir = camera.value.getWorldDirection(new THREE.Vector3()).clone()
  const lookingDown = camDir.y < -0.25

  // 对于宽口器型（碗/盘/杯），俯视检测更宽松
  if (shape === 'panzi' || shape === 'wanzhan' || shape === 'chabei') {
    return aboveRim && overOpening
  }
  return aboveRim && overOpening && lookingDown
}

/**
 * 从存储的3D位置获取近似3D点（用于selection ring定位）
 * @param {string} id - 图案ID
 * @returns {THREE.Vector3|null}
 */
function getPattern3DPosition(id) {
  const pat = ceramicStore.attachedPatterns.find(p => p.id === id)
  if (!pat || !pat.position) return null
  return new THREE.Vector3(pat.position.x, pat.position.y, pat.position.z)
}

// ─── Style/Shape Switching ────────────────────────────────────────────────

function changeStyle(style) {
  ceramicStore.currentStyle = style
  if (ceramicStore.currentShapeIsImported) {
    buildImportedCeramic()
  } else if (ceramicStore.currentShape === '__builtin__') {
    buildBuiltinCeramic()
  } else {
    buildCeramic()
  }
}

function changeShape(shape) {
  if (shape === '__imported__') {
    ceramicStore.currentShapeIsImported = true
    ceramicStore.currentShape = '__imported__'
    buildImportedCeramic()
    if (camera.value) {
      targetCamPos = new THREE.Vector3(0, 0.1, 2.5)
      targetLookAt = new THREE.Vector3(0, 0.05, 0)
      isLerping = true
    }
    return
  }
  if (shape === '__builtin__') {
    ceramicStore.currentShapeIsImported = false
    ceramicStore.currentShape = '__builtin__'
    buildBuiltinCeramic()
    if (camera.value) {
      targetCamPos = new THREE.Vector3(0, 0.05, 2.8)
      targetLookAt = new THREE.Vector3(0, 0.05, 0)
      isLerping = true
    }
    return
  }
  // 内置器型
  ceramicStore.currentShapeIsImported = false
  ceramicStore.currentShape = shape
  buildCeramic()
  // 预加载相邻器型几何体，确保切换流畅无卡顿
  preloadAdjacentShapes(shape)
  const cfg = getShapeCameraConfig(shape)
  if (camera.value) {
    if (shape === 'chabei') {
      targetCamPos = new THREE.Vector3(0, 0.15, cfg.distance)
      targetLookAt = new THREE.Vector3(0, 0.18, 0)
    } else if (shape === 'panzi') {
      targetCamPos = new THREE.Vector3(0, -0.02, cfg.distance)
      targetLookAt = new THREE.Vector3(0, -0.05, 0)
    } else {
      targetCamPos = new THREE.Vector3(0, cfg.targetY, cfg.distance)
      targetLookAt = new THREE.Vector3(0, cfg.targetY, 0)
    }
    isLerping = true
  }
}

// ─── Lighting Toggle ──────────────────────────────────────────────────────

function toggleLights(enabled) {
  if (ambientLight.value) ambientLight.value.intensity = enabled ? 0.5 : 0.05
  if (keyLight.value) keyLight.value.intensity = enabled ? 1.2 : 0.2
  if (fillLight.value) fillLight.value.intensity = enabled ? 1.2 : 0.1
  if (rimLight.value) rimLight.value.intensity = enabled ? 0.5 : 0.05
  if (innerAmbientLight.value) innerAmbientLight.value.intensity = enabled ? 0.3 : 0.05
}

// ─── Kiln Effect ──────────────────────────────────────────────────────────

function fireCeramic() {
  return new Promise((resolve) => {
    if (kilnRunning) {
      resolve()
      return
    }

    kilnRunning = true
    kilnTimer = 0
    kilnResolve = resolve
    crackleTexture = generateCrackleTexture()

    const mesh = ceramicMesh.value
    if (mesh && mesh.material) {
      originalMaterial = mesh.material
      originalColor.copy(mesh.material.color)
      mesh.material.emissive = new THREE.Color(0x000000)
      mesh.material.emissiveIntensity = 0
      mesh.material.emissiveMap = crackleTexture
      mesh.material.needsUpdate = true
    }
  })
}

function updateKilnEffect(delta) {
  if (!kilnRunning) return

  kilnTimer += delta
  const t = Math.min(kilnTimer / kilnDuration, 1.0)
  const mesh = ceramicMesh.value
  if (!mesh || !mesh.material) return

  // Color transition: warm orange → red → purple → blue → back to original
  const orange = new THREE.Color('#FF6B35')
  const red = new THREE.Color('#C0392B')
  const purple = new THREE.Color('#6B3A7B')
  const blue = new THREE.Color('#3A5A8B')

  if (t < 0.15) {
    mesh.material.color.copy(originalColor).lerp(orange, t / 0.15)
  } else if (t < 0.35) {
    mesh.material.color.copy(orange).lerp(red, (t - 0.15) / 0.2)
  } else if (t < 0.55) {
    mesh.material.color.copy(red).lerp(purple, (t - 0.35) / 0.2)
  } else if (t < 0.75) {
    mesh.material.color.copy(purple).lerp(blue, (t - 0.55) / 0.2)
  } else {
    mesh.material.color.copy(blue).lerp(originalColor, (t - 0.75) / 0.25)
  }

  // Crackle emissive fades in then out
  if (t < 0.4) {
    mesh.material.emissiveIntensity = t / 0.4
  } else {
    mesh.material.emissiveIntensity = Math.max(0, (1 - (t - 0.4) / 0.6))
  }

  // Light flicker
  if (keyLight.value) {
    keyLight.value.intensity = (ceramicStore.lightingEnabled ? 0.25 : 0.05) * (0.7 + 0.3 * Math.sin(kilnTimer * 30))
  }

  mesh.material.needsUpdate = true

  // Completion
  if (t >= 1.0) {
    // Reset material
    mesh.material.color.copy(originalColor)
    mesh.material.emissive = new THREE.Color(0x000000)
    mesh.material.emissiveIntensity = 0
    mesh.material.emissiveMap = null
    mesh.material.needsUpdate = true

    // Restore lights
    if (keyLight.value) keyLight.value.intensity = ceramicStore.lightingEnabled ? 0.25 : 0.05

    // Clean up crackle
    if (crackleTexture) {
      crackleTexture.dispose()
      crackleTexture = null
    }

    kilnRunning = false
    emit('firing-complete')

    if (kilnResolve) {
      kilnResolve()
      kilnResolve = null
    }
  }
}

// ─── View Presets ─────────────────────────────────────────────────────────

function setViewPreset(view) {
  const presets = getShapeViewPresets(ceramicStore.currentShape || 'meiping')
  const preset = presets[view]
  if (!preset) return

  targetCamPos = preset.pos
  targetLookAt = preset.target
  isLerping = true
}

function resetView() {
  const shape = ceramicStore.currentShape || 'meiping'
  const cfg = getShapeCameraConfig(shape)
  if (shape === 'chabei') {
    targetCamPos = new THREE.Vector3(0, 0.15, cfg.distance)
    targetLookAt = new THREE.Vector3(0, 0.18, 0)
  } else if (shape === 'panzi') {
    targetCamPos = new THREE.Vector3(0, -0.02, cfg.distance)
    targetLookAt = new THREE.Vector3(0, -0.05, 0)
  } else {
    targetCamPos = new THREE.Vector3(0, cfg.targetY, cfg.distance)
    targetLookAt = new THREE.Vector3(0, cfg.targetY, 0)
  }
  isLerping = true
}

// ─── Screenshot ──────────────────────────────────────────────────────────-

function takeScreenshot() {
  const rend = renderer.value
  if (!rend) return ''

  // Render one frame
  rend.render(scene.value, camera.value)

  const dataUrl = rend.domElement.toDataURL('image/png')

  // Auto download
  const now = new Date()
  const dateStr = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0')
  const timeStr = String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0')
  const filename = `陶瓷作品_${dateStr}_${timeStr}.png`

  const link = document.createElement('a')
  link.download = filename
  link.href = dataUrl
  link.click()

  emit('screenshot-taken', dataUrl)
  return dataUrl
}

/** 无声截图：仅生成 dataUrl，不下载、不发射事件（用于自动保存） */
function takeScreenshotSilent() {
  const rend = renderer.value
  if (!rend) return ''
  rend.render(scene.value, camera.value)
  return rend.domElement.toDataURL('image/png')
}

// ─── Fullscreen ──────────────────────────────────────────────────────────

function enterFullscreen() {
  const el = canvasContainer.value
  if (!el) return

  if (el.requestFullscreen) {
    el.requestFullscreen()
  } else if (el.webkitRequestFullscreen) {
    el.webkitRequestFullscreen()
  } else if (el.msRequestFullscreen) {
    el.msRequestFullscreen()
  }
}

// ─── Restore From Snapshot ────────────────────────────────────────────────

/**
 * 完整有序复原作品（图案源感知版）：
 *   1. 清空当前图案缓存与纹理层
 *   2. 逐条解析图案来源 —— 内置花纹从 builtinPatterns 匹配，用户上传从 patternDB 查询，直接模式用嵌入 dataUrl
 *   3. 预加载所有图案图片（失败图案跳过并提示）
 *   4. 设置 store 状态（形状、样式、材质参数、图案列表）
 *   5. buildCeramic() 一次构建器型
 *   6. compositeFinalTexture() 合成最终纹理
 *   7. 更新材质参数、重置相机视角
 *
 * isRestoring 标志阻止 watcher 在此期间重复触发。
 */
async function restoreFromSnapshot(snapshot) {
  if (!snapshot) return
  console.log('[Ceramic3D] restoreFromSnapshot 开始, snapshot:', { shape: snapshot.shape, style: snapshot.style, glaze: snapshot.outerGlazeColor, builtinModelId: snapshot.builtinModelId, patternCount: (snapshot.attachedPatterns||[]).length })

  isRestoring = true
  ceramicStore.restoreLoading = true

  // ============================================================
  // 1. 清空当前图案缓存与运行时状态
  // ============================================================
  patternImageCache.clear()
  ceramicStore.clearAttachedPatterns()
  // 注意：不清空 pendingDragPatternId 等交互状态，因为 restore 是完整场景重建

  // ============================================================
  // 2. 逐条解析图案来源，加载图片
  // ============================================================
  const rawPatterns = snapshot.attachedPatterns || []
  const resolvedPatterns = []
  const failedIds = []

  for (const pat of rawPatterns) {
    let dataUrl = null

    try {
      if (pat.source === 'builtin') {
        // 内置花纹：从 builtinPatterns 列表中按 id 匹配
        const match = builtinPatterns.find(p => p.id === pat.sourceId)
        if (match) {
          dataUrl = getPatternDataUrl(match)
        } else {
          // 匹配失败时降级使用嵌入的 textureDataUrl（兼容旧数据）
          dataUrl = pat.textureDataUrl || null
          console.warn(`[restore] 内置花纹 "${pat.sourceId}" 未匹配，降级使用嵌入数据`)
        }
      } else if (pat.source === 'upload') {
        // 上传图案：从 patternDB 按 sourceId 查找
        const record = await patternDB.getById(pat.sourceId)
        if (record && record.base64) {
          dataUrl = record.base64
        } else {
          // patternDB 中不存在（用户可能已删除），降级使用嵌入数据
          dataUrl = pat.textureDataUrl || null
          console.warn(`[restore] 上传图案 id="${pat.sourceId}" 在 patternDB 中不存在，降级使用嵌入数据`)
        }
      } else {
        // 直接嵌入模式或无 source 字段（旧版兼容）
        dataUrl = pat.textureDataUrl || null
      }
    } catch (e) {
      console.error(`[restore] 图案 ${pat.id} 来源查询失败`, e)
      dataUrl = pat.textureDataUrl || null
    }

    if (!dataUrl) {
      console.warn(`[restore] 图案 ${pat.id} 无可用纹理数据，跳过`)
      failedIds.push(pat.id)
      continue
    }

    // 将解析后的 dataUrl 预加载到缓存
    try {
      await preloadPatternImage(pat.id, dataUrl)
      // 保留原有变换参数，更新 textureDataUrl，强制表面锁定
      resolvedPatterns.push({ ...pat, textureDataUrl: dataUrl, _surfaceLocked: true, surfaceType: pat.surfaceType || 'outer' })
    } catch (e) {
      console.error(`[restore] 图案图片加载失败 ${pat.id}`, e)
      failedIds.push(pat.id)
    }
  }

  // ============================================================
  // 2.5 UV迁移：旧版快照的UV坐标偏移+0.75适配新几何体UV布局
  // v8几何体将UV接缝从默认角度0移至正后方（+0.75偏移），需同步调整图案UV
  // ============================================================
  const currentUvVersion = ceramicStore.SNAPSHOT_UV_VERSION || 1
  const snapshotUvVersion = snapshot.uvVersion || 0
  const needsUvMigration = snapshotUvVersion < currentUvVersion
  if (needsUvMigration) {
    const UV_SEAM_OFFSET = 0.25
    for (const pat of resolvedPatterns) {
      if (pat.uv) {
        pat.uv = {
          u: ((pat.uv.u + UV_SEAM_OFFSET) % 1 + 1) % 1,
          v: pat.uv.v,
        }
      }
    }
    console.log(`[restore] UV已迁移 (v${snapshotUvVersion}→v${currentUvVersion}), ${resolvedPatterns.length}个图案`)
  }

  // ============================================================
  // 3. 失败提示
  // ============================================================
  if (failedIds.length > 0) {
    ElMessage.warning(`已跳过 ${failedIds.length} 个无法加载的图案`)
  }

  // ============================================================
  // 4. 设置 store 状态（含釉色、材质、图案等全部字段）
  // ============================================================
  await ceramicStore.restoreFromSnapshot(snapshot)

  // ============================================================
  // 5. 设置已解析的图案列表（watcher 因 isRestoring 跳过）
  // ============================================================
  ceramicStore.attachedPatterns = resolvedPatterns

  // ============================================================
  // 6. 构建器型（仅一次）— 通过 changeShape 路由到正确的构建器
  // ============================================================
  changeShape(ceramicStore.currentShape)

  // ============================================================
  // 7. 合成最终纹理（图案图片已全部就绪）
  // ============================================================
  console.log('[restore] 合成纹理前, attachedPatterns:', ceramicStore.attachedPatterns.length, 'cache keys:', [...(typeof patternImageCache==='object'?patternImageCache.keys():[])].slice(0,10))
  compositeFinalTexture(true)

  // ============================================================
  // 8. 更新材质参数
  // ============================================================
  updateMaterialParams()

  // ============================================================
  // 9. 重置相机视角适配器型
  // ============================================================
  resetView()

  // ============================================================
  // 10. 恢复完成 — 强制写入釉色到材质（绕过所有守卫）
  // ============================================================
  isRestoring = false
  ceramicStore.restoreLoading = false

  // 直接设置外表面陶瓷材质颜色
  const oc = ceramicStore.outerGlazeColor
  if (ceramicMesh.value?.material?.color) {
    ceramicMesh.value.material.color.set(oc || getStyleColor(ceramicStore.currentStyle))
    ceramicMesh.value.material.needsUpdate = true
  }
  // 直接设置内表面陶瓷材质颜色
  const ic = ceramicStore.innerGlazeColor
  if (innerCeramicMesh.value?.material?.color) {
    innerCeramicMesh.value.material.color.set(ic || getStyleColor(ceramicStore.currentStyle))
    innerCeramicMesh.value.material.needsUpdate = true
  }
  // 外表面图案层：始终保持白色
  if (patternMesh.value?.material?.color) {
    patternMesh.value.material.color.set('#FFFFFF')
    patternMesh.value.material.needsUpdate = true
  }
  // 内表面图案层：应用内釉色
  if (innerPatternMesh.value?.material?.color) {
    innerPatternMesh.value.material.color.set(ic || '#FFFFFF')
    innerPatternMesh.value.material.needsUpdate = true
  }
}

// ─── Animation Loop ───────────────────────────────────────────────────────

function startAnimationLoop() {
  clock = new THREE.Clock()

  function animate() {
    animFrameId = requestAnimationFrame(animate)

    const delta = Math.min(clock.getDelta(), 0.1)

    // Update controls
    if (controls.value) {
      controls.value.update()
    }

    // Camera lerp toward target
    if (isLerping && camera.value && targetCamPos) {
      const lerpFactor = 5 * delta
      camera.value.position.lerp(targetCamPos, lerpFactor)
      if (controls.value && targetLookAt) {
        controls.value.target.lerp(targetLookAt, lerpFactor)
      }
      if (camera.value.position.distanceTo(targetCamPos) < 0.005) {
        isLerping = false
      }
    }

    // Auto-rotate ceramic group (respects rotationDirection from store)
    if (autoRotateEnabled && ceramicGroup.value) {
      ceramicGroup.value.rotation.y += autoRotateSpeed * ceramicStore.rotationDirection * delta * 4
    }

    // Update kiln effect
    if (kilnRunning) {
      updateKilnEffect(delta)
    }

    // ── 逐帧纹理更新（dirtyFlag机制：拖拽/旋转中由animate循环负责合成，不阻塞事件）──
    if (textureDirty && !compositeInProgress) {
      textureDirty = false
      compositeFinalTexture()
    }

    if (composer.value && scene.value && camera.value) {
      composer.value.render()
    } else if (renderer.value && scene.value && camera.value) {
      renderer.value.render(scene.value, camera.value)
    }
  }

  animate()
}

function stopAnimationLoop() {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId)
    animFrameId = null
  }
}

// ─── Resize Handler ───────────────────────────────────────────────────────

function onResize() {
  const container = canvasContainer.value
  if (!container || !renderer.value || !camera.value) return

  const width = container.clientWidth
  const height = container.clientHeight
  if (width === 0 || height === 0) return

  renderer.value.setSize(width, height)
  // 更新FXAA后期处理分辨率
  if (composer.value) {
    composer.value.setSize(width, height)
  }
  if (fxaaPass.value) {
    const pixelRatio = renderer.value.getPixelRatio()
    fxaaPass.value.uniforms['resolution'].value.set(
      1 / (width * pixelRatio),
      1 / (height * pixelRatio)
    )
  }
  camera.value.aspect = width / height
  camera.value.updateProjectionMatrix()
}

// ─── Create Decorative Pattern Texture ────────────────────────────────────

function createDefaultPattern() {
  const { canvas, ctx } = createCanvasCtx(512, 1024)

  // 中国传统纹样 - 如意纹 + 回纹
  ctx.font = 'bold 72px "KaiTi", "楷体", "STKaiti", "SimSun", "宋体", serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = 'rgba(43, 87, 151, 0.3)'

  ctx.fillText('福', 256, 200)
  ctx.fillText('禄', 256, 400)
  ctx.fillText('寿', 256, 600)
  ctx.fillText('喜', 256, 800)

  const tex = new THREE.CanvasTexture(canvas)
  tex.anisotropy = maxAnisotropy
  return tex
}

// ─── Lifecycle ─────────────────────────────────────────────────────────────

onMounted(async () => {
  await nextTick()

  if (!canvasContainer.value) {
    console.warn('[Ceramic3D] canvasContainer ref not found')
    return
  }

  initScene()

  const rend = renderer.value
  if (rend && canvasContainer.value) {
    canvasContainer.value.appendChild(rend.domElement)
    onResize()
  }

  // Build initial ceramic (route through changeShape to handle all shape types)
  changeShape(ceramicStore.currentShape)

  // Start animation loop
  startAnimationLoop()

  // Resize listener
  window.addEventListener('resize', onResize)

  // ── Watchers (set up AFTER scene is initialized) ──
  watch(() => ceramicStore.currentStyle, (val) => { if (!isRestoring) changeStyle(val) })
  watch(() => ceramicStore.currentShape, (val) => { if (!isRestoring) changeShape(val) })
  // ── 导入模型监听（20260602 + builder export 20260603）──
  watch(() => ceramicStore.importedModel, (val) => {
    if (val && (val.glbUrl || val.glbData)) {
      buildImportedCeramic()
    }
  })
  // ── 内置精品模型监听（20260602终极版）──
  watch(() => ceramicStore.builtinModelProfile, (val) => {
    if (val && val.length > 0) {
      buildBuiltinCeramic()
    }
  })
  // ── 自动铺贴配套纹样（20260602）──
  watch(() => ceramicStore.autoPatternQueue.length, async (len) => {
    if (len > 0) {
      const patterns = ceramicStore.consumeAutoPatterns()
      if (patterns.length > 0) {
        await processAutoPatterns(patterns)
      }
    }
  })
  watch(() => ceramicStore.metalness, () => { updateMaterialParams() })
  watch(() => ceramicStore.roughness, () => { updateMaterialParams() })
  watch(() => ceramicStore.opacity, () => { updateMaterialParams() })
  watch(() => ceramicStore.brightness, () => { updateMaterialParams() })
  watch(() => ceramicStore.lightingEnabled, (val) => { toggleLights(val) })
  watch(() => ceramicStore.gridVisible, (val) => {
    if (gridHelper.value) gridHelper.value.visible = val
  })
  watch(() => ceramicStore.autoRotate, (val) => {
    autoRotateEnabled = val
  })
  watch(() => ceramicStore.autoRotateSpeed, (val) => {
    autoRotateSpeed = val
  })
  watch(() => ceramicStore.patternText, () => { if (!isRestoring) updatePatternOverlay() })
  watch(() => ceramicStore.patternOpacity, () => { if (!isRestoring) updatePatternOverlay() })
  // ── 釉色实时监听（20260602）──
  watch(() => ceramicStore.outerGlazeColor, () => { if (!isRestoring) applyGlazeToMaterials() })
  watch(() => ceramicStore.innerGlazeColor, () => { if (!isRestoring) applyGlazeToMaterials() })
  watch(
    () => ceramicStore.attachedPatterns,
    (newPats, oldPats) => {
      if (isRestoring) return
      // 检查是否有新图案需要加载图片
      newPats.forEach(pat => {
        if (!patternImageCache.has(pat.id)) {
          preloadPatternImage(pat.id, pat.textureDataUrl).catch(err => {
            console.warn('[Ceramic3D] watcher后加载图案失败', pat.id, err)
          })
        }
      })
      // 合成最终纹理（样式纹理缓存 + 帧同步守卫 确保不卡顿）
      if (!isDraggingPattern) {
        compositeFinalTexture()
      }
    },
    { deep: true }
  )

  // Initialize with current store values
  autoRotateEnabled = ceramicStore.autoRotate
  autoRotateSpeed = ceramicStore.autoRotateSpeed
  if (gridHelper.value) gridHelper.value.visible = ceramicStore.gridVisible
  toggleLights(ceramicStore.lightingEnabled)
})

onUnmounted(() => {
  stopAnimationLoop()

  window.removeEventListener('resize', onResize)

  // 清理指针交互与拖拽事件监听器
  if (renderer.value && renderer.value.domElement) {
    renderer.value.domElement.removeEventListener('pointerdown', onPointerDown)
    renderer.value.domElement.removeEventListener('pointermove', onPointerMove)
    renderer.value.domElement.removeEventListener('pointerup', onPointerUp)
    renderer.value.domElement.removeEventListener('dragenter', onDragEnter)
    renderer.value.domElement.removeEventListener('dragover', onDragOver)
    renderer.value.domElement.removeEventListener('dragleave', onDragLeave)
    renderer.value.domElement.removeEventListener('drop', onDrop)
  }

  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)

  // 清理选择环网格
  ;[selectionRingMesh, selectionGlowMesh, selectionFillMesh].forEach(m => {
    if (m) {
      if (ceramicGroup.value) ceramicGroup.value.remove(m)
      if (m.geometry) m.geometry.dispose()
      if (m.material) m.material.dispose()
    }
  })
  selectionRingMesh = null
  selectionGlowMesh = null
  selectionFillMesh = null

  // 清理悬停高亮环
  if (hoverRingMesh) {
    if (ceramicGroup.value) ceramicGroup.value.remove(hoverRingMesh)
    if (hoverRingMesh.geometry) hoverRingMesh.geometry.dispose()
    if (hoverRingMesh.material) hoverRingMesh.material.dispose()
    hoverRingMesh = null
  }

  // 清理拖拽预览网格
  if (dragPreviewMesh) {
    if (ceramicGroup.value) ceramicGroup.value.remove(dragPreviewMesh)
    if (dragPreviewMesh.geometry) dragPreviewMesh.geometry.dispose()
    if (dragPreviewMesh.material) {
      if (dragPreviewMesh.material.map) dragPreviewMesh.material.map.dispose()
      dragPreviewMesh.material.dispose()
    }
    dragPreviewMesh = null
  }

  // 清理合成纹理
  if (compositeTexture) {
    compositeTexture.dispose()
    compositeTexture = null
  }
  patternImageCache.clear()
  if (cachedStyleTex) {
    cachedStyleTex = null
  }

  // 清理几何体缓存
  for (const [, geo] of geometryCache) {
    if (geo && geo.dispose) geo.dispose()
  }
  geometryCache.clear()

  // 重置交互状态变量
  selectedPatternId = null
  ceramicStore.clearAllSelections()
  isDraggingPattern = false
  pointerDownPos = null
  wasPointerDownOnPattern = false
  hasMovedSinceDown = false
  pendingDragPatternId = null

  // Dispose Three.js resources
  if (renderer.value) {
    renderer.value.dispose()
    if (renderer.value.domElement && renderer.value.domElement.parentNode) {
      renderer.value.domElement.parentNode.removeChild(renderer.value.domElement)
    }
    renderer.value = null
  }

  if (controls.value) {
    controls.value.dispose()
    controls.value = null
  }

  // Dispose ceramic meshes
  if (ceramicMesh.value) {
    disposeObject3D(ceramicMesh.value)
    ceramicMesh.value = null
  }
  if (patternMesh.value) {
    disposeObject3D(patternMesh.value)
    patternMesh.value = null
  }
  if (innerPatternMesh.value) {
    disposeObject3D(innerPatternMesh.value)
    innerPatternMesh.value = null
  }
  if (innerCeramicMesh.value) {
    disposeObject3D(innerCeramicMesh.value)
    innerCeramicMesh.value = null
  }
  if (importedModelGroup.value) {
    disposeObject3D(importedModelGroup.value)
    if (ceramicGroup.value) ceramicGroup.value.remove(importedModelGroup.value)
    importedModelGroup.value = null
  }

  // Dispose crackle texture
  if (crackleTexture) {
    crackleTexture.dispose()
    crackleTexture = null
  }

  // Dispose patternTextTexture
  if (patternTextTexture) {
    patternTextTexture.dispose()
    patternTextTexture = null
  }

  if (pedestalMesh) {
    disposeObject3D(pedestalMesh)
    pedestalMesh = null
  }

  // Clear scene
  if (scene.value) {
    scene.value.clear()
    scene.value = null
  }

  ceramicGroup.value = null
  gridHelper.value = null
  camera.value = null
  keyLight.value = null
  ambientLight.value = null
  rimLight.value = null
  rimLightBottom.value = null
  rimBackLight.value = null
  pedestal.value = null
})

// ─── Expose ────────────────────────────────────────────────────────────────

defineExpose({
  changeStyle,
  changeShape,
  setViewPreset,
  fireCeramic,
  resetView,
  enterFullscreen,
  takeScreenshot,
  takeScreenshotSilent,
  restoreFromSnapshot,
  compositeFinalTexture,
})
</script>

<style scoped>
.canvas-area-inner {
  overflow: hidden;
  background: #000000;
  cursor: grab;
}

.canvas-area-inner:active {
  cursor: grabbing;
}

.canvas-area-inner canvas {
  display: block;
}
</style>
