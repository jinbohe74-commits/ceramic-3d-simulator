<template>
  <Teleport to="body">
    <div v-if="visible" class="i3d-overlay" @click.self="handleClose">
      <div class="i3d-dialog">
        <div class="i3d-header">
          <h2>📷 自定义器型 — 点击描点生成3D</h2>
          <button class="i3d-close" @click="handleClose">✕</button>
        </div>
        <div v-if="!loaded" class="i3d-upload"
          @dragover.prevent="drag=true" @dragleave.prevent="drag=false"
          @drop.prevent="onDrop" :class="{hover:drag}">
          <span class="i3d-icon">🖼️</span>
          <span class="i3d-text">拖拽或选择图片</span>
          <span class="i3d-sub">自动检测边缘，点击吸附到物体轮廓</span>
          <input ref="finp" type="file" accept="image/jpeg,image/png,image/webp" hidden @change="onFile" />
          <button class="i3d-btn-up" @click="$refs.finp.click()">📁 选择图片</button>
        </div>
        <div v-else class="i3d-work">
          <div class="i3d-wrap">
            <canvas ref="cvs" @click="onClick" />
          </div>
          <div class="i3d-badge">{{ status }}</div>
          <div class="i3d-bar">
            <button @click="undo" :disabled="pts.length===0">↩ 撤销</button>
            <button @click="clear" :disabled="pts.length===0">🗑 清除</button>
            <button @click="reset">↩ 换图</button>
            <button class="i3d-go" @click="generate" :disabled="pts.length<4">🏺 生成3D</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import * as THREE from 'three'

const emit = defineEmits(['close', 'generate'])
const props = defineProps({ visible: Boolean })
const finp = ref(null), cvs = ref(null)
const loaded = ref(false), drag = ref(false)
const pts = ref([]) // {x, y, snapped}

let img = null, w = 0, h = 0, edgeMap = null
const SNAP_DIST = 35

const status = computed(() => {
  if (edgeMap && pts.value.length === 0) return '🔵蓝线=边缘 · 点击右侧轮廓 · 自动吸附'
  if (pts.value.length < 4) return `🟢已吸附=${pts.value.filter(p=>p.snapped).length} · ${pts.value.length}点 · 还需${4-pts.value.length}点`
  return `✅ ${pts.value.length}点就绪 · ${pts.value.filter(p=>p.snapped).length}点已吸附边缘`
})

function handleClose() { emit('close') }
function reset() { loaded.value = false; pts.value = []; edgeMap = null; img = null }
function onDrop(e) { drag.value = false; const f = e.dataTransfer?.files?.[0]; if (f) load(f) }
function onFile(e) { const f = e.target?.files?.[0]; if (f) load(f); if (finp.value) finp.value.value = '' }

function load(file) {
  if (!file.type.match(/image\/(jpeg|png|webp)/)) return
  const r = new FileReader()
  r.onload = e => {
    const im = new Image()
    im.onload = () => { img = im; loaded.value = true; pts.value = []; nextTick(() => initCanvas()) }
    im.src = e.target.result
  }
  r.readAsDataURL(file)
}

function initCanvas() {
  const c = cvs.value; if (!c || !img) return
  const maxW = 920, maxH = 650
  const s = Math.min(maxW / img.width, maxH / img.height, 1)
  w = Math.floor(img.width * s); h = Math.floor(img.height * s)
  c.width = w; c.height = h
  c.style.width = w + 'px'; c.style.height = h + 'px'; c.style.margin = '0 auto'
  detectEdges()
}

function detectEdges() {
  const c = cvs.value; if (!c) return
  const ctx = c.getContext('2d')
  ctx.drawImage(img, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h).data

  // Canny-ish edge detection
  const gray = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) gray[i] = 0.299*data[i*4] + 0.587*data[i*4+1] + 0.114*data[i*4+2]

  const sobel = new Float32Array(w * h)
  let smax = 0
  for (let y = 1; y < h-1; y++) {
    for (let x = 1; x < w-1; x++) {
      const i = y*w + x
      const gx = -gray[i-w-1]-2*gray[i-1]-gray[i+w-1]+gray[i-w+1]+2*gray[i+1]+gray[i+w+1]
      const gy = -gray[i-w-1]-2*gray[i-w]-gray[i-w+1]+gray[i+w-1]+2*gray[i+w]+gray[i+w+1]
      sobel[i] = Math.sqrt(gx*gx + gy*gy)
      if (sobel[i] > smax) smax = sobel[i]
    }
  }

  // Thin edges + threshold
  edgeMap = new Uint8Array(w * h)
  const thresh = smax * 0.06
  for (let y = 1; y < h-1; y++) {
    for (let x = 1; x < w-1; x++) {
      const i = y*w + x
      if (sobel[i] < thresh) continue
      // Non-max suppression
      const gx = -gray[i-w-1]-2*gray[i-1]-gray[i+w-1]+gray[i-w+1]+2*gray[i+1]+gray[i+w+1]
      const gy = -gray[i-w-1]-2*gray[i-w]-gray[i-w+1]+gray[i+w-1]+2*gray[i+w]+gray[i+w+1]
      const angle = Math.atan2(gy, gx)
      let a = 0, b = 0
      if (angle >= -Math.PI/8 && angle < Math.PI/8) { a = sobel[y*w+(x-1)]; b = sobel[y*w+(x+1)] }
      else if (angle >= Math.PI/8 && angle < 3*Math.PI/8) { a = sobel[(y-1)*w+(x+1)]; b = sobel[(y+1)*w+(x-1)] }
      else if (angle >= -3*Math.PI/8 && angle < -Math.PI/8) { a = sobel[(y-1)*w+(x-1)]; b = sobel[(y+1)*w+(x+1)] }
      else { a = sobel[(y-1)*w+x]; b = sobel[(y+1)*w+x] }
      if (sobel[i] >= a && sobel[i] >= b) edgeMap[i] = 1
    }
  }

  redraw()
}

function redraw() {
  const c = cvs.value; if (!c) return
  const ctx = c.getContext('2d')
  ctx.drawImage(img, 0, 0, w, h)

  // Draw edge overlay brightly so user can see detected edges
  if (edgeMap) {
    const overlay = ctx.getImageData(0, 0, w, h)
    for (let i = 0; i < w*h; i++) {
      if (edgeMap[i]) {
        overlay.data[i*4]   = Math.min(255, overlay.data[i*4] + 60)
        overlay.data[i*4+1] = Math.min(255, overlay.data[i*4+1] + 160)
        overlay.data[i*4+2] = Math.min(255, overlay.data[i*4+2] + 255)
      }
    }
    ctx.putImageData(overlay, 0, 0)
  }

  // Center guide
  const cx = w / 2
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 0.8
  ctx.setLineDash([6, 8])
  ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke()
  ctx.setLineDash([])

  // Sort bottom to top
  const sorted = [...pts.value].sort((a, b) => b.y - a.y)

  // Draw smooth curve
  if (sorted.length >= 3) {
    const cp = sorted.map(p => new THREE.Vector3(p.x, p.y, 0))
    const curve = new THREE.CatmullRomCurve3(cp, false, 'centripetal')
    ctx.strokeStyle = 'rgba(255,150,20,0.8)'; ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let i = 0; i <= 200; i++) { const pt = curve.getPointAt(i/200); i===0?ctx.moveTo(pt.x,pt.y):ctx.lineTo(pt.x,pt.y) }
    ctx.stroke()
    // Mirror
    ctx.strokeStyle = 'rgba(255,150,20,0.2)'; ctx.lineWidth = 1
    ctx.setLineDash([4, 5])
    ctx.beginPath()
    for (let i = 0; i <= 200; i++) { const pt = curve.getPointAt(i/200); const mx = cx-(pt.x-cx); i===0?ctx.moveTo(mx,pt.y):ctx.lineTo(mx,pt.y) }
    ctx.stroke(); ctx.setLineDash([])
  }

  // Draw points
  for (const p of pts.value) {
    ctx.fillStyle = p.snapped ? '#00EE55' : '#FF3333'
    ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI*2); ctx.fill()
  }
}

function onClick(e) {
  const c = cvs.value; if (!c) return
  const rect = c.getBoundingClientRect()
  let cx = (e.clientX - rect.left) * (w / rect.width)
  let cy = (e.clientY - rect.top) * (h / rect.height)
  if (cx < 0 || cx >= w || cy < 0 || cy >= h) return

  let snapped = false
  // Snap to nearest edge point
  if (edgeMap) {
    let bestD = SNAP_DIST, bx = cx, by = cy
    // Search in expanding radius
    for (let r = 1; r <= SNAP_DIST; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue
          const nx = Math.round(cx) + dx, ny = Math.round(cy) + dy
          if (nx >= 0 && nx < w && ny >= 0 && ny < h && edgeMap[ny * w + nx]) {
            const d = Math.sqrt(dx*dx + dy*dy)
            if (d < bestD) { bestD = d; bx = nx; by = ny }
          }
        }
      }
      if (bestD < SNAP_DIST) break // Found nearby edge
    }
    if (bestD < SNAP_DIST) { cx = bx; cy = by; snapped = true }
  }

  pts.value = [...pts.value, { x: cx, y: cy, snapped }]
  redraw()
}

function undo() { pts.value = pts.value.slice(0, -1); redraw() }
function clear() { pts.value = []; redraw() }

function generate() {
  if (pts.value.length < 4) return
  const sorted = [...pts.value].sort((a, b) => b.y - a.y)
  const ccx = w / 2

  // Normalize to profile
  const raw = sorted.map(p => ({
    r: Math.max(0.001, (p.x - ccx) / (h * 0.48)),
    y: 1.0 - (2.0 * p.y / h),
  }))

  // CatmullRom upsample to 256 points
  const pts3 = raw.map(p => new THREE.Vector3(p.r, p.y, 0))
  const curve = new THREE.CatmullRomCurve3(pts3, false, 'centripetal')
  const profile = []
  for (let i = 0; i < 256; i++) {
    const pt = curve.getPointAt(i / 255)
    profile.push(new THREE.Vector2(Math.max(0, pt.x), pt.y))
  }

  // Replace bottom ~10% of curve with a smooth flat-bottom transition.
  // This avoids the bulge caused by CatmullRom endpoint tangent mismatch.
  const cutIdx = Math.floor(profile.length * 0.10)  // ~25 points
  const rCut = profile[cutIdx].x
  const yCut = profile[cutIdx].y
  const yBottom = profile[0].y - 0.002  // extend slightly below curve for closure

  // Remove original bottom portion
  profile.splice(0, cutIdx + 1)

  // Generate smooth flat-bottom transition (15 points)
  const bottomPts = 15
  for (let i = bottomPts; i >= 0; i--) {
    const t = i / bottomPts  // 0 at center, 1 at cut point
    // r = rCut * t^1.8: near-flat at bottom (t→0), smooth join at body (t→1)
    const r = rCut * Math.pow(t, 1.8)
    const y = yBottom + (yCut - yBottom) * t
    profile.unshift(new THREE.Vector2(r, y))
  }

  emit('generate', { profile, name: '自定义器型 ' + new Date().toLocaleDateString('zh-CN') })
  handleClose()
}

watch(() => props.visible, v => { if (!v) reset() })
</script>

<style scoped>
.i3d-overlay { position:fixed; inset:0; background:rgba(0,0,0,.85); z-index:10001; display:flex; align-items:center; justify-content:center; animation:fadeIn .2s ease; }
@keyframes fadeIn { from{opacity:0} to{opacity:1} }
.i3d-dialog { background:#16161a; border-radius:10px; border:1px solid #2a2a2e; width:96vw; max-width:1050px; height:96vh; display:flex; flex-direction:column; overflow:hidden; }
.i3d-header { display:flex; align-items:center; justify-content:space-between; padding:6px 12px; border-bottom:1px solid #222; flex-shrink:0; }
.i3d-header h2 { margin:0; font-size:13px; color:#d4a76a; }
.i3d-close { width:24px; height:24px; border-radius:50%; border:1px solid #444; background:transparent; color:#aaa; font-size:12px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
.i3d-close:hover { background:#333; color:#ddd; }
.i3d-upload { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; border:2px dashed #333; margin:8px; border-radius:8px; cursor:pointer; transition:.2s; }
.i3d-upload.hover { border-color:#d4782a; background:rgba(212,120,42,.05); }
.i3d-icon { font-size:36px; margin-bottom:6px; }
.i3d-text { font-size:13px; color:#ccc; }
.i3d-sub { font-size:10px; color:#666; margin:4px 0 10px; }
.i3d-btn-up { padding:7px 20px; border-radius:6px; border:1px solid #d4a76a; background:rgba(212,167,106,.08); color:#d4a76a; font-size:12px; cursor:pointer; font-family:inherit; }
.i3d-btn-up:hover { background:rgba(212,167,106,.2); }
.i3d-work { flex:1; display:flex; flex-direction:column; padding:4px 8px; gap:4px; min-height:0; }
.i3d-wrap { flex:1; position:relative; background:#050508; border-radius:6px; overflow:auto; display:flex; align-items:center; justify-content:center; min-height:0; }
.i3d-wrap canvas { cursor:crosshair; display:block; }
.i3d-badge { text-align:center; background:rgba(5,5,8,.9); color:#aaa; padding:5px 14px; border-radius:6px; font-size:12px; pointer-events:none; flex-shrink:0; }
.i3d-bar { display:flex; gap:7px; justify-content:center; flex-shrink:0; }
.i3d-bar button { padding:6px 16px; border-radius:6px; font-size:12px; cursor:pointer; font-family:inherit; border:1px solid #555; background:#222; color:#ccc; }
.i3d-bar button:hover:not(:disabled) { background:#333; }
.i3d-bar button:disabled { opacity:.4; cursor:not-allowed; }
.i3d-go { border:none !important; background:linear-gradient(135deg,#d4782a,#b06020) !important; color:#fff !important; font-weight:600; }
.i3d-go:disabled { opacity:.5 !important; }
</style>
