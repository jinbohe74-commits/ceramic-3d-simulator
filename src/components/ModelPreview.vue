<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const props = defineProps({
  visible: Boolean,
  model: Object,
  glbUrl: String,
})

const emit = defineEmits(['close', 'use'])

const containerRef = ref(null)
const loading = ref(false)
const loadError = ref('')
const loadProgress = ref(0)

let scene, camera, renderer, controls, animFrameId
let currentModel = null

/**
 * 无缝旋转成型几何体
 * LatheGeometry + UV偏移 + 中缝法线统一
 */
function createWeldedLatheGeometry(points, segments) {
  const geom = new THREE.LatheGeometry(points, segments)
  const rows = points.length
  const cols = segments + 1

  const uv = geom.attributes.uv
  for (let i = 0; i < uv.count; i++) {
    uv.setX(i, (uv.getX(i) + 0.25) % 1.0)
  }
  uv.needsUpdate = true

  geom.computeVertexNormals()

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

  return geom
}

function initScene() {
  if (!containerRef.value) return

  const w = containerRef.value.clientWidth
  const h = containerRef.value.clientHeight

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1a1a1a)

  camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 100)
  camera.position.set(0, 0.3, 2.5)
  camera.lookAt(0, 0, 0)

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(w, h)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = true
  containerRef.value.appendChild(renderer.domElement)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.target.set(0, 0.1, 0)
  controls.minDistance = 0.3
  controls.maxDistance = 8
  controls.update()

  // Lighting
  const amb = new THREE.AmbientLight(0xffffff, 0.5)
  scene.add(amb)

  const key = new THREE.DirectionalLight(0xFFF5E3, 1.5)
  key.position.set(2, 2.5, 2)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  scene.add(key)

  const fill = new THREE.DirectionalLight(0xD4E0FF, 0.6)
  fill.position.set(-2, 1.5, 1.5)
  scene.add(fill)

  const rim = new THREE.DirectionalLight(0x88bbff, 0.3)
  rim.position.set(-1, 0.5, -2.5)
  scene.add(rim)

  // Grid
  const grid = new THREE.GridHelper(4, 24, 0x444444, 0x333333)
  grid.position.y = -0.8
  scene.add(grid)

  // Ground shadow
  const groundGeo = new THREE.PlaneGeometry(6, 6)
  const groundMat = new THREE.ShadowMaterial({ opacity: 0.3 })
  const ground = new THREE.Mesh(groundGeo, groundMat)
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.8
  ground.receiveShadow = true
  scene.add(ground)

  animate()
}

function animate() {
  animFrameId = requestAnimationFrame(animate)
  if (controls) controls.update()
  if (renderer && scene && camera) renderer.render(scene, camera)
}

/**
 * Load a built-in procedural model using LatheGeometry from its profile
 */
function loadBuiltinModel(model) {
  if (!model || !model.profile || !model.profile.length) {
    loadError.value = '模型数据不完整（缺少剖面曲线）'
    loading.value = false
    return
  }

  loading.value = true
  loadError.value = ''

  // Remove previous
  if (currentModel) {
    scene.remove(currentModel)
    disposeModel(currentModel)
    currentModel = null
  }

  try {
    const geometry = createWeldedLatheGeometry(model.profile, 384)
    const glazeColor = model.glaze || '#E8E0D8'

    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(glazeColor),
      metalness: 0.1,
      roughness: 0.35,
      transparent: true,
      opacity: 0.95,
      side: THREE.FrontSide,
    })

    const mesh = new THREE.Mesh(geometry, material)
    mesh.castShadow = true
    mesh.receiveShadow = true

    // Inner surface (BackSide for see-through top-down viewing)
    const innerMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(glazeColor),
      metalness: 0.1,
      roughness: 0.35,
      transparent: true,
      opacity: 0.95,
      side: THREE.BackSide,
    })
    const innerMesh = new THREE.Mesh(geometry, innerMat)
    mesh.add(innerMesh)

    // Auto-scale to fit view
    const box = new THREE.Box3().setFromObject(mesh)
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const targetSize = 1.8
    const sc = maxDim > 0 ? targetSize / maxDim : 1
    mesh.scale.setScalar(sc)

    // Center vertically
    const center = box.getCenter(new THREE.Vector3())
    mesh.position.y = -center.y * sc + 0.1

    scene.add(mesh)
    currentModel = mesh
    loading.value = false
  } catch (err) {
    console.error('[ModelPreview] Builtin model error:', err)
    loadError.value = '模型渲染失败'
    loading.value = false
  }
}

/**
 * Load a GLB model from URL
 */
async function loadGLBModel(url) {
  if (!url) {
    // No GLB URL — try loading as builtin
    if (props.model && props.model.profile) {
      loadBuiltinModel(props.model)
    }
    return
  }

  loading.value = true
  loadError.value = ''
  loadProgress.value = 0

  if (currentModel) {
    scene.remove(currentModel)
    disposeModel(currentModel)
    currentModel = null
  }

  const loader = new GLTFLoader()
  try {
    const gltf = await new Promise((resolve, reject) => {
      loader.load(url, resolve, (p) => {
        if (p.total > 0) loadProgress.value = p.loaded / p.total
      }, reject)
    })

    currentModel = gltf.scene

    const box = new THREE.Box3().setFromObject(currentModel)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const sc = maxDim > 0 ? 1.8 / maxDim : 1

    currentModel.scale.setScalar(sc)
    currentModel.position.set(-center.x * sc, -center.y * sc + 0.1, -center.z * sc)

    currentModel.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true
        child.receiveShadow = true
        if (child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material]
          mats.forEach(m => {
            m.metalness = 0.1
            m.roughness = 0.35
            m.needsUpdate = true
          })
        }
      }
    })

    scene.add(currentModel)
    loading.value = false
  } catch (err) {
    console.error('[ModelPreview] GLB load failed:', err)
    // Fallback: try loading as builtin
    if (props.model && props.model.profile) {
      loadBuiltinModel(props.model)
    } else {
      loadError.value = '模型加载失败: ' + (err.message || '未知错误')
      loading.value = false
    }
  }
}

function disposeModel(obj) {
  if (!obj) return
  obj.traverse((child) => {
    if (child.geometry) child.geometry.dispose()
    if (child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material]
      mats.forEach(m => {
        for (const key of Object.keys(m)) {
          if (m[key] && m[key].isTexture) m[key].dispose()
        }
        m.dispose()
      })
    }
  })
}

function handleResetView() {
  if (camera && controls) {
    camera.position.set(0, 0.3, 2.5)
    controls.target.set(0, 0.1, 0)
    controls.update()
  }
}

function handleClose() { emit('close') }
function handleUse() { emit('use', props.model); emit('close') }

function onResize() {
  if (!containerRef.value || !renderer || !camera) return
  const w = containerRef.value.clientWidth
  const h = containerRef.value.clientHeight
  renderer.setSize(w, h)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}

watch(() => props.visible, (v) => {
  if (v) {
    setTimeout(() => {
      initScene()
      // Load model: prefer builtin procedural, fallback to GLB URL
      if (props.model && props.model.profile && props.model.profile.length) {
        loadBuiltinModel(props.model)
      } else if (props.glbUrl) {
        loadGLBModel(props.glbUrl)
      }
    }, 100)
  } else {
    cleanup()
  }
})

watch(() => props.glbUrl, (url) => {
  if (props.visible && url && scene) loadGLBModel(url)
})

function cleanup() {
  if (animFrameId) cancelAnimationFrame(animFrameId)
  if (currentModel) {
    scene?.remove(currentModel)
    disposeModel(currentModel)
    currentModel = null
  }
  if (renderer) {
    renderer.dispose()
    if (containerRef.value && renderer.domElement.parentNode === containerRef.value) {
      containerRef.value.removeChild(renderer.domElement)
    }
    renderer = null
  }
  scene = null; camera = null; controls = null
  loading.value = false; loadError.value = ''
}

onMounted(() => { window.addEventListener('resize', onResize) })
onUnmounted(() => { window.removeEventListener('resize', onResize); cleanup() })
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="preview-overlay" @click.self="handleClose">
      <div class="preview-container">
        <!-- Header -->
        <div class="preview-header">
          <div class="preview-title">
            <span class="preview-model-name">{{ model?.name || '模型预览' }}</span>
            <span v-if="model?.author" class="preview-author">by {{ model.author }}</span>
          </div>
          <div class="preview-actions">
            <button class="preview-btn-use" @click="handleUse">⚡ 直接使用</button>
            <button class="preview-btn-reset" @click="handleResetView">重置视角</button>
            <button class="preview-btn-close" @click="handleClose">✕</button>
          </div>
        </div>

        <!-- 3D Viewport -->
        <div ref="containerRef" class="preview-viewport">
          <div v-if="loading" class="preview-loading">
            <div class="loading-spinner"></div>
            <div class="loading-text">正在加载模型...</div>
          </div>
          <div v-if="loadError" class="preview-error">
            <span class="error-icon">⚠️</span>
            <span>{{ loadError }}</span>
          </div>
          <div v-if="!loading && !loadError" class="preview-hints">
            <span>🖱 左键拖拽旋转</span>
            <span>🔍 滚轮缩放</span>
            <span>✋ 右键平移</span>
          </div>
        </div>

        <!-- Footer -->
        <div class="preview-footer">
          <span class="footer-license">{{ model?.licenseType || 'CC0' }} · {{ model?.source === 'builtin' ? '内置精品' : model?.source || '未知来源' }}</span>
          <a v-if="model?.viewUrl" :href="model.viewUrl" target="_blank" class="footer-link">查看原页面 ↗</a>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.preview-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 10000; display: flex; align-items: center; justify-content: center; animation: fadeIn 0.2s ease; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
.preview-container { width: 90vw; height: 85vh; background: #1a1a1a; border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.5); }
.preview-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; background: rgba(255,255,255,0.05); border-bottom: 1px solid rgba(255,255,255,0.1); flex-shrink: 0; }
.preview-title { display: flex; flex-direction: column; gap: 2px; }
.preview-model-name { font-size: 16px; font-weight: 600; color: #fff; }
.preview-author { font-size: 12px; color: #999; }
.preview-actions { display: flex; gap: 8px; align-items: center; }
.preview-btn-use { padding: 6px 14px; border-radius: 6px; border: none; background: #c43a4a; color: #fff; font-size: 13px; cursor: pointer; font-family: inherit; transition: background 0.15s; }
.preview-btn-use:hover { background: #d44a5a; }
.preview-btn-reset { padding: 6px 14px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.1); color: #fff; font-size: 13px; cursor: pointer; font-family: inherit; }
.preview-btn-reset:hover { background: rgba(255,255,255,0.2); }
.preview-btn-close { width: 32px; height: 32px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.1); color: #fff; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.preview-btn-close:hover { background: rgba(255,80,80,0.4); }

.preview-viewport { flex: 1; position: relative; min-height: 0; }
.preview-loading { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; z-index: 10; }
.loading-spinner { width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.2); border-top-color: #fff; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.loading-text { color: #ccc; font-size: 14px; }
.preview-error { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: #ff6b6b; font-size: 14px; }
.error-icon { font-size: 32px; }
.preview-hints { position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%); display: flex; gap: 20px; color: rgba(255,255,255,0.4); font-size: 12px; z-index: 5; pointer-events: none; }
.preview-footer { display: flex; justify-content: space-between; align-items: center; padding: 8px 20px; background: rgba(255,255,255,0.05); border-top: 1px solid rgba(255,255,255,0.1); flex-shrink: 0; }
.footer-license { font-size: 12px; color: #888; }
.footer-link { font-size: 12px; color: #7BA891; text-decoration: none; }
.footer-link:hover { text-decoration: underline; }
</style>
