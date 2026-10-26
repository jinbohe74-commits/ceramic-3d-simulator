/**
 * 内置传统花纹库 v2.0 (20260601 最终版)
 * 50款经典中式陶瓷花纹，6大分类
 * 每款花纹为 512x512 PNG（透明背景），以 base64 数据 URL 形式提供
 */

const SIZE = 512
const COLORS = {
  blue: '#2B5797', lightBlue: '#4A7AB5', darkBlue: '#1A3A6A',
  red: '#C43A4A', lightRed: '#D4878A', darkRed: '#8B2A35',
  gold: '#C49A3A', lightGold: '#D4B06A', darkGold: '#8B6A2A',
  green: '#3A7B5A', lightGreen: '#5A9B7A', darkGreen: '#2A5B3A',
  purple: '#6B3A7B', lightPurple: '#8B5A9B',
  dark: '#3D2C1A', gray: '#8B8B8B',
  teal: '#4A8B8B', orange: '#D4783A',
}

function createCanvas() { const c = document.createElement('canvas'); c.width = SIZE; c.height = SIZE; return c }
function toPng(c) { return c.toDataURL('image/png') }

// ═══════════════════════════════════════════════════════════════
// Shared drawing helpers
// ═══════════════════════════════════════════════════════════════

function drawPetal(ctx, cx, cy, angle, len, wid, color) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.ellipse(cx + Math.cos(angle) * len * 0.4, cy + Math.sin(angle) * len * 0.4, wid, len * 0.35, angle, 0, Math.PI * 2)
  ctx.fill()
}

function drawFlower(ctx, cx, cy, radius, petals, color, centerColor) {
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2 - Math.PI / 2
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.ellipse(cx + Math.cos(a) * radius * 0.35, cy + Math.sin(a) * radius * 0.35, radius * 0.45, radius * 0.16, a, 0, Math.PI * 2)
    ctx.fill()
  }
  if (centerColor) {
    ctx.fillStyle = centerColor
    ctx.beginPath(); ctx.arc(cx, cy, radius * 0.18, 0, Math.PI * 2); ctx.fill()
  }
}

function drawCloudMotif(ctx, cx, cy, scale, color) {
  ctx.strokeStyle = color; ctx.lineWidth = 2.5
  const r = 30 * scale
  ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, Math.PI * 1.6); ctx.stroke()
  ctx.beginPath(); ctx.arc(cx + r * 0.7, cy - r * 0.3, r * 0.55, Math.PI * 0.9, Math.PI * 2.1); ctx.stroke()
  ctx.beginPath(); ctx.arc(cx + r * 0.5, cy + r * 0.4, r * 0.4, Math.PI * 1.6, Math.PI * 2.6); ctx.stroke()
}

function drawWavePattern(ctx, y, width, amp, freq, color) {
  ctx.strokeStyle = color; ctx.lineWidth = 2
  ctx.beginPath()
  for (let x = 0; x <= width; x += 3) {
    const wy = y + Math.sin(x * freq) * amp
    x === 0 ? ctx.moveTo(x, wy) : ctx.lineTo(x, wy)
  }
  ctx.stroke()
}

function drawVineCircle(ctx, cx, cy, r, color) {
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.5
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const vx = cx + Math.cos(a) * r; const vy = cy + Math.sin(a) * r
    ctx.beginPath(); ctx.arc(vx, vy, r * 0.15, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath()
    ctx.arc(cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5, r * 0.12, 0, Math.PI * 2)
    ctx.stroke()
  }
}

// ═══════════════════════════════════════════════════════════════
// Category 1: 经典釉纹 (5 patterns)
// ═══════════════════════════════════════════════════════════════

function genLian() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  ctx.strokeStyle = COLORS.blue; ctx.fillStyle = COLORS.blue; ctx.lineWidth = 2.5
  const cx = SIZE / 2, cy = SIZE / 2, r = 80
  drawFlower(ctx, cx, cy, r, 8, COLORS.blue, COLORS.blue)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    ctx.beginPath(); ctx.arc(cx + Math.cos(a) * 140, cy + Math.sin(a) * 140, 20, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.arc(cx + Math.cos(a) * 150, cy + Math.sin(a) * 145, 10, 0, Math.PI * 2); ctx.fill()
  }
  return toPng(c)
}

function genPeony() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  const cx = SIZE / 2, cy = SIZE / 2
  ctx.fillStyle = '#E8A0A0'; ctx.beginPath(); ctx.arc(cx, cy, 25, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#E8A0A0'; ctx.strokeStyle = COLORS.red; ctx.lineWidth = 1.5
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2
    ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * 45, cy + Math.sin(a) * 45, 40, 18, a, 0, Math.PI * 2)
    ctx.fill(); ctx.stroke()
  }
  ctx.fillStyle = COLORS.green
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3
    ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * 90, cy + Math.sin(a) * 90, 35, 12, a, 0, Math.PI * 2); ctx.fill()
  }
  return toPng(c)
}

function genJun() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  const centers = [[SIZE*.3,SIZE*.3],[SIZE*.7,SIZE*.3],[SIZE*.5,SIZE*.6],[SIZE*.2,SIZE*.7],[SIZE*.8,SIZE*.8]]
  const ccols = [['rgba(139,58,58,0)','#8B3A3A'],['rgba(107,58,123,0)','#6B3A7B'],['rgba(58,90,139,0)','#3A5A8B'],['rgba(139,80,60,0)','#8B503C'],['rgba(100,60,100,0)','#643C64']]
  centers.forEach((pos,i) => {
    const g = ctx.createRadialGradient(pos[0],pos[1],10,pos[0],pos[1],200)
    g.addColorStop(0,ccols[i][1]); g.addColorStop(1,ccols[i][0])
    ctx.fillStyle=g; ctx.fillRect(0,0,SIZE,SIZE)
  })
  return toPng(c)
}

// 汝瓷冰裂纹
function genRuCrackle() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  ctx.fillStyle = 'rgba(139,184,184,0.15)'; ctx.fillRect(0, 0, SIZE, SIZE)
  ctx.strokeStyle = 'rgba(80,130,130,0.6)'; ctx.lineWidth = 1
  for (let i = 0; i < 80; i++) {
    const sx = Math.random() * SIZE, sy = Math.random() * SIZE
    ctx.beginPath(); ctx.moveTo(sx, sy)
    let cx = sx, cy = sy
    for (let j = 0; j < 4; j++) { cx += (Math.random()-0.5)*80; cy += (Math.random()-0.5)*80; ctx.lineTo(cx, cy) }
    ctx.stroke()
  }
  return toPng(c)
}

// 哥瓷金丝铁线
function genGeWire() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  ctx.fillStyle = 'rgba(230,215,184,0.12)'; ctx.fillRect(0, 0, SIZE, SIZE)
  // 金丝 (golden thin lines)
  ctx.strokeStyle = 'rgba(196,154,58,0.5)'; ctx.lineWidth = 0.8
  for (let i = 0; i < 60; i++) {
    ctx.beginPath(); ctx.moveTo(Math.random()*SIZE, Math.random()*SIZE)
    let cx = Math.random()*SIZE, cy = Math.random()*SIZE
    for (let j = 0; j < 3; j++) { cx += (Math.random()-0.5)*100; cy += (Math.random()-0.5)*100; ctx.lineTo(cx, cy) }
    ctx.stroke()
  }
  // 铁线 (dark thick lines)
  ctx.strokeStyle = 'rgba(61,44,26,0.5)'; ctx.lineWidth = 2
  for (let i = 0; i < 25; i++) {
    ctx.beginPath(); ctx.moveTo(Math.random()*SIZE, Math.random()*SIZE)
    let cx = Math.random()*SIZE, cy = Math.random()*SIZE
    for (let j = 0; j < 4; j++) { cx += (Math.random()-0.5)*120; cy += (Math.random()-0.5)*120; ctx.lineTo(cx, cy) }
    ctx.stroke()
  }
  return toPng(c)
}

// ═══════════════════════════════════════════════════════════════
// Category 2: 瑞兽祥禽 (10 patterns)
// ═══════════════════════════════════════════════════════════════

function genDragon() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  ctx.strokeStyle = COLORS.dark; ctx.fillStyle = COLORS.dark; ctx.lineWidth = 3
  const cx = SIZE / 2, cy = SIZE / 2
  ctx.lineWidth = 10; ctx.beginPath()
  for (let t = 0; t < Math.PI * 2; t += 0.05) {
    const x = cx + Math.sin(t * 2) * 100, y = cy + Math.cos(t * 1.5) * 80
    t === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.fillStyle = COLORS.gold; ctx.beginPath(); ctx.arc(280, 240, 30, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = COLORS.dark; ctx.lineWidth = 2; ctx.stroke()
  ctx.fillStyle = COLORS.red; ctx.beginPath(); ctx.arc(290, 230, 5, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = COLORS.dark; ctx.lineWidth = 2
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    for (let j = 0; j < 3; j++) { ctx.beginPath(); ctx.moveTo(cx + Math.sin(a * 2) * 120, cy + Math.cos(a * 1.5) * 100); ctx.lineTo(cx + Math.sin(a * 2) * 120 + Math.cos(a + j) * 20, cy + Math.cos(a * 1.5) * 100 + Math.sin(a + j) * 20); ctx.stroke() }
  }
  return toPng(c)
}

function genPhoenix() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  const cx = SIZE / 2, cy = SIZE / 2
  const ts = [COLORS.red, COLORS.gold, COLORS.green, COLORS.blue, COLORS.purple]
  ts.forEach((cl, i) => { ctx.strokeStyle = cl; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(cx - 20, cy + 30, 120 + i * 15, 40 + i * 8, 0.3 + i * 0.15, 0, Math.PI * 1.2); ctx.stroke() })
  ctx.fillStyle = COLORS.gold; ctx.beginPath(); ctx.arc(cx, cy, 25, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = COLORS.red; ctx.beginPath(); ctx.arc(cx + 5, cy - 30, 12, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = COLORS.gold; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(cx + 5, cy - 42); ctx.quadraticCurveTo(cx + 15, cy - 60, cx + 5, cy - 50); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(cx + 5, cy - 42); ctx.quadraticCurveTo(cx - 5, cy - 58, cx, cy - 48); ctx.stroke()
  return toPng(c)
}

function genQilin() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  const cx = SIZE / 2, cy = SIZE / 2
  ctx.fillStyle = COLORS.gold; ctx.strokeStyle = COLORS.dark; ctx.lineWidth = 2
  // Body
  ctx.beginPath(); ctx.ellipse(cx, cy + 20, 80, 45, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  // Head
  ctx.fillStyle = COLORS.lightGold; ctx.beginPath(); ctx.arc(cx + 80, cy - 10, 25, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  // Horn
  ctx.strokeStyle = COLORS.gold; ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(cx + 85, cy - 35); ctx.quadraticCurveTo(cx + 95, cy - 60, cx + 80, cy - 55); ctx.stroke()
  // Legs
  ctx.strokeStyle = COLORS.dark; ctx.lineWidth = 2
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(cx + (i - 1.5) * 25, cy + 55); ctx.lineTo(cx + (i - 1.5) * 25, cy + 85); ctx.stroke() }
  // Scales
  ctx.fillStyle = COLORS.red
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * 30, cy + 20 + Math.sin(a) * 15, 4, 0, Math.PI * 2); ctx.fill() }
  return toPng(c)
}

function genLion() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  const cx = SIZE / 2, cy = SIZE / 2
  ctx.fillStyle = COLORS.gold; ctx.strokeStyle = COLORS.dark; ctx.lineWidth = 2
  ctx.beginPath(); ctx.arc(cx, cy, 55, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  // Mane
  ctx.strokeStyle = COLORS.orange
  for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 55, cy + Math.sin(a) * 55); ctx.lineTo(cx + Math.cos(a) * 75, cy + Math.sin(a) * 75); ctx.stroke() }
  // Face
  ctx.fillStyle = COLORS.lightGold; ctx.beginPath(); ctx.arc(cx, cy, 30, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = COLORS.dark; ctx.stroke()
  ctx.fillStyle = COLORS.dark; ctx.beginPath(); ctx.arc(cx - 10, cy - 5, 5, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(cx + 10, cy - 5, 5, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = COLORS.red; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy + 8, 10, 0, Math.PI); ctx.stroke()
  return toPng(c)
}

function genCrane() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  const cx = SIZE / 2, cy = SIZE / 2
  ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = COLORS.dark; ctx.lineWidth = 2
  ctx.beginPath(); ctx.ellipse(cx, cy, 40, 55, 0.1, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  // Head and neck
  ctx.strokeStyle = COLORS.dark; ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(cx + 10, cy - 55); ctx.quadraticCurveTo(cx + 5, cy - 80, cx - 5, cy - 100); ctx.stroke()
  ctx.fillStyle = COLORS.red; ctx.beginPath(); ctx.arc(cx - 5, cy - 100, 8, 0, Math.PI * 2); ctx.fill()
  // Wings
  ctx.fillStyle = '#E8E0D0'; ctx.beginPath(); ctx.ellipse(cx - 20, cy - 10, 60, 18, -0.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  // Legs
  ctx.strokeStyle = COLORS.dark; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(cx - 5, cy + 50); ctx.lineTo(cx - 15, cy + 90); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(cx + 5, cy + 50); ctx.lineTo(cx + 15, cy + 90); ctx.stroke()
  return toPng(c)
}

function genMandarinDuck() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  const cx = SIZE / 2, cy = SIZE / 2
  ctx.fillStyle = '#C47E5A'; ctx.strokeStyle = COLORS.dark; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.ellipse(cx, cy, 45, 35, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  // Head
  ctx.fillStyle = COLORS.green; ctx.beginPath(); ctx.arc(cx + 35, cy - 20, 18, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  ctx.fillStyle = COLORS.red; ctx.beginPath(); ctx.arc(cx + 40, cy - 16, 4, 0, Math.PI * 2); ctx.fill()
  // Wing detail
  ctx.strokeStyle = COLORS.gold; ctx.lineWidth = 2
  ctx.beginPath(); ctx.ellipse(cx - 5, cy, 25, 18, 0.3, 0, Math.PI); ctx.stroke()
  return toPng(c)
}

function genButterfly() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  const cx = SIZE / 2, cy = SIZE / 2
  // Wings
  const wc = [COLORS.blue, COLORS.purple, COLORS.red, COLORS.gold]
  for (let i = 0; i < 4; i++) {
    const a = (i / 2) * Math.PI + 0.4, side = i < 2 ? 1 : -1
    ctx.fillStyle = wc[i]
    ctx.beginPath(); ctx.ellipse(cx + side * 30, cy - 10 + (i % 2) * 30, 50, 30, side * 0.3, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = COLORS.dark; ctx.lineWidth = 1; ctx.stroke()
  }
  // Body
  ctx.fillStyle = COLORS.dark; ctx.beginPath(); ctx.ellipse(cx, cy, 6, 60, 0, Math.PI, Math.PI * 2); ctx.fill()
  // Antennae
  ctx.strokeStyle = COLORS.dark; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(cx - 3, cy - 55); ctx.quadraticCurveTo(cx - 20, cy - 80, cx - 30, cy - 70); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(cx + 3, cy - 55); ctx.quadraticCurveTo(cx + 20, cy - 80, cx + 30, cy - 70); ctx.stroke()
  return toPng(c)
}

function genBat() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  const cx = SIZE / 2, cy = SIZE / 2
  ctx.fillStyle = COLORS.red; ctx.strokeStyle = COLORS.dark; ctx.lineWidth = 2
  // Body
  ctx.beginPath(); ctx.arc(cx, cy, 20, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  // Wings spread
  ctx.fillStyle = 'rgba(196,58,74,0.6)'
  ctx.beginPath(); ctx.moveTo(cx - 15, cy); ctx.quadraticCurveTo(cx - 60, cy - 70, cx - 20, cy - 50); ctx.quadraticCurveTo(cx - 5, cy - 10, cx - 5, cy + 10); ctx.fill()
  ctx.beginPath(); ctx.moveTo(cx + 15, cy); ctx.quadraticCurveTo(cx + 60, cy - 70, cx + 20, cy - 50); ctx.quadraticCurveTo(cx + 5, cy - 10, cx + 5, cy + 10); ctx.fill()
  // Head
  ctx.fillStyle = COLORS.dark; ctx.beginPath(); ctx.arc(cx, cy - 22, 8, 0, Math.PI * 2); ctx.fill()
  return toPng(c)
}

function genDeer() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  const cx = SIZE / 2, cy = SIZE / 2
  ctx.fillStyle = '#C49A6A'; ctx.strokeStyle = COLORS.dark; ctx.lineWidth = 2
  // Body
  ctx.beginPath(); ctx.ellipse(cx, cy + 10, 60, 35, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  // Head
  ctx.beginPath(); ctx.arc(cx + 55, cy - 15, 18, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  // Antlers
  ctx.strokeStyle = COLORS.dark; ctx.lineWidth = 2.5
  ctx.beginPath(); ctx.moveTo(cx + 55, cy - 33); ctx.lineTo(cx + 45, cy - 60); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(cx + 50, cy - 48); ctx.lineTo(cx + 60, cy - 65); ctx.stroke()
  // Legs
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(cx + (i - 1.5) * 20, cy + 40); ctx.lineTo(cx + (i - 1.5) * 20, cy + 70); ctx.stroke() }
  // Spots
  ctx.fillStyle = '#FFFFFF'
  for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.arc(cx + (Math.random() - 0.5) * 70, cy + 10 + (Math.random() - 0.5) * 30, 3, 0, Math.PI * 2); ctx.fill() }
  return toPng(c)
}

function genFish() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  const cx = SIZE / 2, cy = SIZE / 2
  ctx.fillStyle = COLORS.gold; ctx.strokeStyle = COLORS.dark; ctx.lineWidth = 2
  ctx.beginPath(); ctx.ellipse(cx, cy, 70, 30, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  // Tail
  ctx.fillStyle = COLORS.red
  ctx.beginPath(); ctx.moveTo(cx - 70, cy); ctx.quadraticCurveTo(cx - 100, cy - 35, cx - 90, cy); ctx.quadraticCurveTo(cx - 100, cy + 35, cx - 70, cy); ctx.fill(); ctx.stroke()
  // Eye
  ctx.fillStyle = COLORS.dark; ctx.beginPath(); ctx.arc(cx + 45, cy - 5, 6, 0, Math.PI * 2); ctx.fill()
  // Scales
  ctx.strokeStyle = COLORS.dark; ctx.lineWidth = 0.8
  for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(cx + 10, cy - 5 + i * 8, 15, 0, Math.PI); ctx.stroke() }
  // Fin
  ctx.fillStyle = COLORS.red; ctx.beginPath(); ctx.moveTo(cx - 10, cy - 20); ctx.quadraticCurveTo(cx + 10, cy - 40, cx + 20, cy - 25); ctx.lineTo(cx - 10, cy - 20); ctx.fill()
  return toPng(c)
}

// ═══════════════════════════════════════════════════════════════
// Category 3: 山水风景 (8 patterns)
// ═══════════════════════════════════════════════════════════════

function genLandscape() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  ctx.fillStyle = 'rgba(42,87,151,0.6)'; ctx.beginPath()
  ctx.moveTo(0, SIZE); ctx.lineTo(60, 200); ctx.lineTo(140, 280); ctx.lineTo(200, 150)
  ctx.lineTo(280, 250); ctx.lineTo(340, 180); ctx.lineTo(420, 300); ctx.lineTo(SIZE, 220)
  ctx.lineTo(SIZE, SIZE); ctx.closePath(); ctx.fill()
  ctx.fillStyle = 'rgba(42,87,151,0.3)'; ctx.beginPath()
  ctx.moveTo(0, SIZE); ctx.lineTo(80, 300); ctx.lineTo(180, 380); ctx.lineTo(300, 280)
  ctx.lineTo(SIZE, 350); ctx.lineTo(SIZE, SIZE); ctx.closePath(); ctx.fill()
  ctx.strokeStyle = 'rgba(42,87,151,0.5)'; ctx.lineWidth = 1.5
  for (let i = 0; i < 3; i++) {
    const yy = 100 + i * 60; ctx.beginPath()
    for (let x = 50; x < SIZE - 50; x += 2) { const wy = yy + Math.sin(x * 0.02) * 10 + Math.sin(x * 0.015) * 8; x === 50 ? ctx.moveTo(x, wy) : ctx.lineTo(x, wy) }
    ctx.stroke()
  }
  return toPng(c)
}

function genCloudMist() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  const positions = [[SIZE*.25,SIZE*.25,1.5],[SIZE*.65,SIZE*.2,1.2],[SIZE*.5,SIZE*.45,1.8],[SIZE*.3,SIZE*.65,1.1],[SIZE*.7,SIZE*.6,1.4],[SIZE*.45,SIZE*.8,1.0],[SIZE*.15,SIZE*.45,0.9],[SIZE*.8,SIZE*.85,1.1]]
  positions.forEach(([cx, cy, s]) => drawCloudMotif(ctx, cx, cy, s, COLORS.gray))
  return toPng(c)
}

function genWaterfall() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  // Cliffs
  ctx.fillStyle = 'rgba(61,44,26,0.5)'; ctx.beginPath()
  ctx.moveTo(0, SIZE); ctx.lineTo(150, 300); ctx.lineTo(200, 280); ctx.lineTo(180, SIZE); ctx.fill()
  ctx.beginPath(); ctx.moveTo(SIZE, SIZE); ctx.lineTo(350, 280); ctx.lineTo(320, 260)
  ctx.lineTo(300, SIZE); ctx.fill()
  // Waterfall
  ctx.strokeStyle = 'rgba(74,122,181,0.6)'; ctx.lineWidth = 3
  for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.moveTo(220 + i * 5, 270); ctx.lineTo(218 + i * 5 + Math.sin(i) * 3, SIZE); ctx.stroke() }
  // Splash
  ctx.fillStyle = 'rgba(180,210,240,0.4)'; ctx.beginPath(); ctx.ellipse(240, SIZE - 30, 60, 15, 0, 0, Math.PI * 2); ctx.fill()
  return toPng(c)
}

function genPineBambooPlum() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  // Pine
  ctx.strokeStyle = '#5C4A3A'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(120, SIZE); ctx.lineTo(120, 150); ctx.stroke()
  ctx.fillStyle = COLORS.darkGreen
  for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(120, 150 + i * 50, 30, Math.PI * 0.3, Math.PI * 1.7); ctx.fill() }
  // Bamboo
  ctx.strokeStyle = COLORS.green; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(260, SIZE); ctx.lineTo(260, 100); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(300, SIZE); ctx.lineTo(300, 80); ctx.stroke()
  ctx.fillStyle = COLORS.green; ctx.beginPath(); ctx.ellipse(260, 200, 8, 35, 0.3, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(300, 250, 8, 35, -0.2, 0, Math.PI * 2); ctx.fill()
  // Plum blossoms
  ctx.strokeStyle = COLORS.dark; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(400, SIZE); ctx.quadraticCurveTo(420, 300, 380, 180); ctx.stroke()
  ctx.fillStyle = COLORS.red
  for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.arc(380 + Math.cos(i) * 20, 180 + i * 40 + Math.sin(i) * 10, 6, 0, Math.PI * 2); ctx.fill() }
  return toPng(c)
}

function genOrchid() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  const cx = SIZE / 2, cy = SIZE / 2 + 30
  // Leaves
  ctx.strokeStyle = COLORS.green; ctx.lineWidth = 2
  for (let i = 0; i < 5; i++) {
    ctx.beginPath(); ctx.moveTo(cx, cy + 20)
    ctx.quadraticCurveTo(cx + (i - 2) * 30, cy - 60, cx + (i - 2) * 50, cy - 150); ctx.stroke()
  }
  // Flowers
  ctx.fillStyle = '#E8E0D8'; ctx.strokeStyle = COLORS.purple; ctx.lineWidth = 1
  for (let i = 0; i < 3; i++) {
    const fx = cx + (i - 1) * 40, fy = cy - 20 - i * 30
    for (let j = 0; j < 5; j++) {
      const a = (j / 5) * Math.PI * 2 - Math.PI / 2
      ctx.beginPath(); ctx.ellipse(fx + Math.cos(a) * 8, fy + Math.sin(a) * 8, 12, 5, a, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    }
    ctx.fillStyle = COLORS.gold; ctx.beginPath(); ctx.arc(fx, fy, 3, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#E8E0D8'
  }
  return toPng(c)
}

function genChrysanthemum() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  const cx = SIZE / 2, cy = SIZE / 2
  // Petals (many thin ones)
  ctx.fillStyle = COLORS.gold; ctx.strokeStyle = COLORS.darkGold; ctx.lineWidth = 1
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2
    ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * 25, cy + Math.sin(a) * 25, 70, 8, a, 0, Math.PI * 2)
    ctx.fill(); ctx.stroke()
  }
  ctx.fillStyle = COLORS.darkGold; ctx.beginPath(); ctx.arc(cx, cy, 15, 0, Math.PI * 2); ctx.fill()
  // Leaves
  ctx.fillStyle = COLORS.green
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * 60, cy + Math.sin(a) * 60, 35, 12, a, 0, Math.PI * 2); ctx.fill() }
  return toPng(c)
}

function genLotus() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  const cx = SIZE / 2, cy = SIZE / 2
  // Petals
  ctx.fillStyle = '#F0C0C0'; ctx.strokeStyle = '#D4878A'; ctx.lineWidth = 2
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2
    ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * 20, cy + Math.sin(a) * 20, 18, 60, a, 0, Math.PI * 2)
    ctx.fill(); ctx.stroke()
  }
  // Center
  ctx.fillStyle = COLORS.gold; ctx.beginPath(); ctx.arc(cx, cy, 15, 0, Math.PI * 2); ctx.fill()
  // Pad
  ctx.fillStyle = COLORS.green; ctx.beginPath(); ctx.ellipse(cx + 50, cy + 50, 60, 40, 0.2, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = COLORS.darkGreen; ctx.lineWidth = 1; ctx.stroke()
  return toPng(c)
}

function genPeachBlossom() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  // Branch
  ctx.strokeStyle = '#5C4A3A'; ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(60, SIZE - 60); ctx.quadraticCurveTo(SIZE / 2, SIZE / 2, SIZE - 50, 80); ctx.stroke()
  // Blossoms
  for (let i = 0; i < 15; i++) {
    const t = 0.1 + i * 0.06; const bx = 60 + (SIZE - 110) * t; const by = (SIZE - 60) + (80 - (SIZE - 60)) * t - Math.sin(t * Math.PI) * 80
    ctx.fillStyle = '#F5C0C0'; ctx.strokeStyle = '#D4878A'; ctx.lineWidth = 1
    for (let j = 0; j < 5; j++) {
      const a = (j / 5) * Math.PI * 2
      ctx.beginPath(); ctx.ellipse(bx + Math.cos(a) * 5, by + Math.sin(a) * 5, 10, 4, a, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    }
    ctx.fillStyle = COLORS.gold; ctx.beginPath(); ctx.arc(bx, by, 2, 0, Math.PI * 2); ctx.fill()
  }
  return toPng(c)
}

// ═══════════════════════════════════════════════════════════════
// Category 4: 几何纹样 (10 patterns)
// ═══════════════════════════════════════════════════════════════

function genMeander() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  ctx.strokeStyle = COLORS.blue; ctx.lineWidth = 3
  const segW = 30
  for (let row = 0; row < 8; row++) { for (let col = 0; col < 8; col++) {
    const xx = 40 + col * 56, yy = 60 + row * 56
    ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx + segW * 0.5, yy); ctx.lineTo(xx + segW * 0.5, yy - 14)
    ctx.lineTo(xx + segW, yy - 14); ctx.lineTo(xx + segW, yy); ctx.stroke()
  }}
  ctx.lineWidth = 2; ctx.strokeRect(15, 15, SIZE - 30, SIZE - 30); ctx.strokeRect(25, 25, SIZE - 50, SIZE - 50)
  return toPng(c)
}

function genRuyi() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  ctx.strokeStyle = COLORS.blue; ctx.lineWidth = 2.5
  const cx = SIZE / 2, cy = SIZE / 2
  ctx.beginPath(); ctx.arc(cx - 50, cy - 30, 40, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke()
  ctx.beginPath(); ctx.arc(cx + 50, cy - 30, 40, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke()
  ctx.beginPath(); ctx.arc(cx, cy + 20, 45, 0, Math.PI); ctx.stroke()
  ctx.fillStyle = COLORS.blue; ctx.beginPath(); ctx.arc(cx, cy - 10, 15, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = 'rgba(42,87,151,0.1)'
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 - Math.PI / 2; ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * 25, cy - 10 + Math.sin(a) * 25, 18, 8, a, 0, Math.PI * 2); ctx.fill(); ctx.stroke() }
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; ctx.fillStyle = COLORS.blue; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * 70, cy + Math.sin(a) * 70, 3, 0, Math.PI * 2); ctx.fill() }
  return toPng(c)
}

function genCloud() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  ctx.strokeStyle = COLORS.blue; ctx.lineWidth = 2.5; ctx.fillStyle = COLORS.blue
  const ps = [[SIZE*.25,SIZE*.25,60],[SIZE*.75,SIZE*.3,50],[SIZE*.5,SIZE*.6,70],[SIZE*.2,SIZE*.75,45],[SIZE*.8,SIZE*.75,55]]
  ps.forEach(([cx,cy,r]) => {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 1.5); ctx.stroke()
    ctx.beginPath(); ctx.arc(cx + r * 0.7, cy - r * 0.3, r * 0.5, Math.PI, Math.PI * 2.2); ctx.stroke()
    ctx.beginPath(); ctx.arc(cx + r * 1.0, cy - r * 0.1, r * 0.35, Math.PI * 0.8, Math.PI * 2.0); ctx.stroke()
    ctx.fillStyle = 'rgba(42,87,151,0.12)'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(cx + r * 0.7, cy - r * 0.3, r * 0.5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = COLORS.blue
  })
  return toPng(c)
}

function genWaterWave() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  for (let i = 0; i < 8; i++) drawWavePattern(ctx, 60 + i * 55, SIZE, 12, 0.02 + i * 0.003, COLORS.blue)
  ctx.fillStyle = 'rgba(42,87,151,0.08)'
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(100 + i * 120, 230, 30, 0, Math.PI * 2); ctx.fill() }
  return toPng(c)
}

function genScrollVine() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  ctx.strokeStyle = COLORS.green; ctx.lineWidth = 2
  ctx.beginPath()
  for (let x = 20; x < SIZE - 20; x += 2) { const y = SIZE / 2 + Math.sin(x * 0.03) * 60 + Math.sin(x * 0.015) * 30; x === 20 ? ctx.moveTo(x, y) : ctx.lineTo(x, y) }
  ctx.stroke()
  // Small flowers along vine
  ctx.fillStyle = COLORS.red
  for (let t = 0.1; t < 0.9; t += 0.12) { const x = 40 + (SIZE - 80) * t; const y = SIZE / 2 + Math.sin(x * 0.03) * 60 + Math.sin(x * 0.015) * 30; ctx.beginPath(); ctx.arc(x, y - 10, 6, 0, Math.PI * 2); ctx.fill() }
  // Leaves
  ctx.fillStyle = COLORS.green
  for (let t = 0.15; t < 0.85; t += 0.12) { const x = 40 + (SIZE - 80) * t; const y = SIZE / 2 + Math.sin(x * 0.03) * 60 + Math.sin(x * 0.015) * 30; ctx.beginPath(); ctx.ellipse(x + 10, y + 5, 15, 7, t, 0, Math.PI * 2); ctx.fill() }
  return toPng(c)
}

function genSwastika() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  ctx.strokeStyle = COLORS.gold; ctx.lineWidth = 4
  const u = 40, s = 18
  for (let r = 0; r < 6; r++) { for (let col = 0; col < 6; col++) {
    const ox = 60 + col * 70, oy = 60 + r * 70
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + s * 2, oy); ctx.lineTo(ox + s * 2, oy + s); ctx.lineTo(ox + s * 3, oy + s)
    ctx.lineTo(ox + s * 3, oy + s * 2); ctx.lineTo(ox + s * 2, oy + s * 2); ctx.lineTo(ox + s * 2, oy + s * 3)
    ctx.lineTo(ox, oy + s * 3); ctx.lineTo(ox, oy + s * 2); ctx.lineTo(ox + s, oy + s * 2)
    ctx.lineTo(ox + s, oy + s); ctx.lineTo(ox, oy + s); ctx.lineTo(ox, oy); ctx.stroke()
  }}
  return toPng(c)
}

function genBagua() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  const cx = SIZE / 2, cy = SIZE / 2
  // Outer circle
  ctx.strokeStyle = COLORS.dark; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, 140, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.arc(cx, cy, 130, 0, Math.PI * 2); ctx.stroke()
  // Yin-Yang
  ctx.fillStyle = COLORS.dark; ctx.beginPath(); ctx.arc(cx, cy, 80, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(cx, cy - 40, 40, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = COLORS.dark; ctx.beginPath(); ctx.arc(cx, cy + 40, 40, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(cx, cy + 40, 12, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = COLORS.dark; ctx.beginPath(); ctx.arc(cx, cy - 40, 12, 0, Math.PI * 2); ctx.fill()
  // Trigrams around
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 - Math.PI / 2; const tx = cx + Math.cos(a) * 115; const ty = cy + Math.sin(a) * 115; ctx.fillStyle = i % 2 ? COLORS.dark : COLORS.gold; ctx.beginPath(); ctx.arc(tx, ty, 10, 0, Math.PI * 2); ctx.fill() }
  return toPng(c)
}

function genIceCrack() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  ctx.fillStyle = 'rgba(139,184,184,0.08)'; ctx.fillRect(0, 0, SIZE, SIZE)
  ctx.strokeStyle = 'rgba(100,150,150,0.5)'; ctx.lineWidth = 1.5
  for (let i = 0; i < 100; i++) {
    const sx = Math.random() * SIZE, sy = Math.random() * SIZE
    ctx.beginPath(); ctx.moveTo(sx, sy)
    let cx = sx, cy = sy
    for (let j = 0; j < 3; j++) { cx += (Math.random() - 0.5) * 70; cy += (Math.random() - 0.5) * 70; ctx.lineTo(cx, cy) }
    ctx.stroke()
  }
  return toPng(c)
}

function genDiamond() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  ctx.strokeStyle = COLORS.purple; ctx.lineWidth = 2
  const step = 44
  for (let r = 0; r < 10; r++) { for (let col = 0; col < 10; col++) {
    const cx = 30 + col * step, cy = 30 + r * step
    ctx.beginPath(); ctx.moveTo(cx, cy - 15); ctx.lineTo(cx + 15, cy); ctx.lineTo(cx, cy + 15); ctx.lineTo(cx - 15, cy); ctx.closePath(); ctx.stroke()
    ctx.fillStyle = 'rgba(107,58,123,0.08)'; ctx.fill()
  }}
  return toPng(c)
}

function genGrid() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  ctx.strokeStyle = COLORS.dark; ctx.lineWidth = 2
  for (let x = 40; x < SIZE; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, SIZE); ctx.stroke() }
  for (let y = 40; y < SIZE; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(SIZE, y); ctx.stroke() }
  // Decorative dots at intersections
  ctx.fillStyle = COLORS.gold
  for (let x = 40; x < SIZE; x += 48) { for (let y = 40; y < SIZE; y += 48) { ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill() } }
  return toPng(c)
}

// ═══════════════════════════════════════════════════════════════
// Category 5: 人物故事 (7 patterns)
// ═══════════════════════════════════════════════════════════════

function genEightImmortals() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  // 8 stylized figures in a circle
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2
    const fx = SIZE / 2 + Math.cos(a) * 140, fy = SIZE / 2 + Math.sin(a) * 140
    ctx.fillStyle = [COLORS.blue, COLORS.red, COLORS.gold, COLORS.green, COLORS.purple, COLORS.teal, COLORS.orange, COLORS.dark][i]
    ctx.strokeStyle = COLORS.dark; ctx.lineWidth = 1
    // Head
    ctx.beginPath(); ctx.arc(fx, fy - 15, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    // Body
    ctx.beginPath(); ctx.moveTo(fx - 12, fy + 15); ctx.lineTo(fx + 12, fy + 15); ctx.lineTo(fx + 8, fy - 5); ctx.lineTo(fx - 8, fy - 5); ctx.closePath(); ctx.fill(); ctx.stroke()
  }
  // Central symbol
  ctx.fillStyle = COLORS.gold; ctx.beginPath(); ctx.arc(SIZE / 2, SIZE / 2, 25, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = COLORS.dark; ctx.lineWidth = 2; ctx.stroke()
  return toPng(c)
}

function genLady() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  const cx = SIZE / 2, cy = SIZE / 2 - 20
  // Robe
  ctx.fillStyle = '#D4878A'; ctx.strokeStyle = COLORS.dark; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(cx - 50, cy + 80); ctx.quadraticCurveTo(cx - 30, cy - 10, cx, cy - 30)
  ctx.quadraticCurveTo(cx + 30, cy - 10, cx + 50, cy + 80); ctx.closePath(); ctx.fill(); ctx.stroke()
  // Head
  ctx.fillStyle = '#FFE4C4'; ctx.beginPath(); ctx.arc(cx, cy - 45, 18, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  // Hair
  ctx.fillStyle = COLORS.dark; ctx.beginPath(); ctx.arc(cx, cy - 48, 20, Math.PI, Math.PI * 2); ctx.fill()
  // Sleeves
  ctx.fillStyle = '#D4878A'; ctx.beginPath(); ctx.ellipse(cx - 35, cy + 30, 45, 12, -0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  ctx.beginPath(); ctx.ellipse(cx + 35, cy + 30, 45, 12, 0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  return toPng(c)
}

function genChildren() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  for (let i = 0; i < 4; i++) {
    const fx = 120 + i * 100, fy = SIZE / 2
    ctx.fillStyle = ['#FFE4C4', '#FFDAB9', '#FFE4C4', '#FFDAB9'][i]
    ctx.strokeStyle = COLORS.dark; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.arc(fx, fy - 20, 15, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = [COLORS.red, COLORS.blue, COLORS.green, COLORS.gold][i]
    ctx.beginPath(); ctx.moveTo(fx - 18, fy + 25); ctx.lineTo(fx + 18, fy + 25); ctx.lineTo(fx + 12, fy - 5); ctx.lineTo(fx - 12, fy - 5); ctx.closePath(); ctx.fill(); ctx.stroke()
    // Hair topknot
    ctx.fillStyle = COLORS.dark; ctx.beginPath(); ctx.arc(fx, fy - 35, 6, 0, Math.PI * 2); ctx.fill()
  }
  // Toys/balls
  ctx.fillStyle = COLORS.gold; ctx.beginPath(); ctx.arc(220, SIZE / 2 + 35, 12, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(320, SIZE / 2 + 35, 10, 0, Math.PI * 2); ctx.fill()
  return toPng(c)
}

function genLongevity() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  const cx = SIZE / 2, cy = SIZE / 2 - 10
  // Robe
  ctx.fillStyle = COLORS.gold; ctx.strokeStyle = COLORS.dark; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(cx - 55, cy + 70); ctx.quadraticCurveTo(cx - 25, cy - 20, cx, cy - 40)
  ctx.quadraticCurveTo(cx + 25, cy - 20, cx + 55, cy + 70); ctx.closePath(); ctx.fill(); ctx.stroke()
  // Head
  ctx.fillStyle = '#FFE4C4'; ctx.beginPath(); ctx.arc(cx, cy - 55, 22, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  // Forehead (prominent = longevity)
  ctx.beginPath(); ctx.arc(cx, cy - 60, 18, Math.PI, 0); ctx.fill()
  // Long beard
  ctx.strokeStyle = '#E8E8E8'; ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(cx - 8, cy - 40); ctx.quadraticCurveTo(cx, cy + 20, cx + 5, cy + 50); ctx.stroke()
  // Peach (symbol of longevity)
  ctx.fillStyle = '#F5C0C0'; ctx.beginPath(); ctx.arc(cx + 40, cy + 15, 18, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = COLORS.dark; ctx.lineWidth = 1; ctx.stroke()
  return toPng(c)
}

function genWealth() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  const cx = SIZE / 2, cy = SIZE / 2
  // Robe
  ctx.fillStyle = COLORS.red; ctx.strokeStyle = COLORS.dark; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(cx - 55, cy + 70); ctx.lineTo(cx + 55, cy + 70)
  ctx.quadraticCurveTo(cx + 25, cy - 20, cx, cy - 40); ctx.quadraticCurveTo(cx - 25, cy - 20, cx - 55, cy + 70); ctx.fill(); ctx.stroke()
  // Head
  ctx.fillStyle = '#FFE4C4'; ctx.beginPath(); ctx.arc(cx, cy - 55, 20, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  // Official hat
  ctx.fillStyle = COLORS.dark; ctx.strokeStyle = COLORS.gold; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(cx - 15, cy - 75); ctx.lineTo(cx + 15, cy - 75); ctx.lineTo(cx + 10, cy - 60); ctx.lineTo(cx - 10, cy - 60); ctx.closePath(); ctx.fill(); ctx.stroke()
  // Gold ingots
  ctx.fillStyle = COLORS.gold; ctx.beginPath(); ctx.ellipse(cx - 35, cy + 50, 30, 15, 0.2, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = COLORS.dark; ctx.lineWidth = 1.5; ctx.stroke()
  ctx.beginPath(); ctx.ellipse(cx + 35, cy + 50, 25, 12, -0.1, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  return toPng(c)
}

function genGuanyin() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  const cx = SIZE / 2, cy = SIZE / 2 - 20
  // White robe
  ctx.fillStyle = '#F8F5F0'; ctx.strokeStyle = COLORS.gray; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(cx - 60, cy + 80); ctx.quadraticCurveTo(cx - 30, cy - 10, cx, cy - 30)
  ctx.quadraticCurveTo(cx + 30, cy - 10, cx + 60, cy + 80); ctx.closePath(); ctx.fill(); ctx.stroke()
  // Head
  ctx.fillStyle = '#FFE4C4'; ctx.beginPath(); ctx.arc(cx, cy - 48, 20, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = COLORS.gray; ctx.stroke()
  // Halo
  ctx.strokeStyle = COLORS.gold; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy - 30, 40, 0, Math.PI * 2); ctx.stroke()
  ctx.strokeStyle = 'rgba(196,154,58,0.3)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy - 30, 45, 0, Math.PI * 2); ctx.stroke()
  // Lotus throne
  ctx.fillStyle = COLORS.purple
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI - Math.PI; const px = cx + Math.cos(a) * 30, py = cy + 80 + Math.sin(a) * 5; ctx.beginPath(); ctx.ellipse(px, py, 25, 8, a, 0, Math.PI * 2); ctx.fill() }
  return toPng(c)
}

function genArhat() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  const cx = SIZE / 2, cy = SIZE / 2
  // Robe (monk's kasaya)
  ctx.fillStyle = COLORS.orange; ctx.strokeStyle = COLORS.dark; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(cx - 50, cy + 70); ctx.lineTo(cx + 50, cy + 70)
  ctx.quadraticCurveTo(cx + 30, cy, cx, cy - 20); ctx.quadraticCurveTo(cx - 30, cy, cx - 50, cy + 70); ctx.fill(); ctx.stroke()
  // Patchwork lines on kasaya
  ctx.strokeStyle = COLORS.dark; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(cx - 15, cy + 70); ctx.lineTo(cx - 15, cy + 5); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(cx + 15, cy + 70); ctx.lineTo(cx + 15, cy + 5); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(cx - 50, cy + 35); ctx.lineTo(cx + 50, cy + 35); ctx.stroke()
  // Head (shaved)
  ctx.fillStyle = '#FFE4C4'; ctx.beginPath(); ctx.arc(cx, cy - 40, 22, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = COLORS.dark; ctx.lineWidth = 2; ctx.stroke()
  // Staff
  ctx.strokeStyle = '#5C4A3A'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx - 45, cy + 75); ctx.lineTo(cx - 45, cy - 60); ctx.stroke()
  return toPng(c)
}

// ═══════════════════════════════════════════════════════════════
// Category 6: 吉祥图案 (10 patterns)
// ═══════════════════════════════════════════════════════════════

function genFuChar() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  ctx.fillStyle = COLORS.red; ctx.font = 'bold 280px "KaiTi","楷体","STKaiti","SimSun",serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('福', SIZE / 2, SIZE / 2)
  // Decorative border
  ctx.strokeStyle = COLORS.gold; ctx.lineWidth = 3; ctx.strokeRect(30, 30, SIZE - 60, SIZE - 60)
  drawVineCircle(ctx, SIZE / 2, SIZE / 2, 80, COLORS.gold)
  return toPng(c)
}

function genShouChar() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  ctx.fillStyle = COLORS.gold; ctx.font = 'bold 280px "KaiTi","楷体","STKaiti","SimSun",serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('寿', SIZE / 2, SIZE / 2)
  ctx.strokeStyle = COLORS.red; ctx.lineWidth = 3; ctx.strokeRect(30, 30, SIZE - 60, SIZE - 60)
  // Peach decoration
  ctx.fillStyle = '#F5C0C0'; ctx.beginPath(); ctx.arc(SIZE / 2 + 80, SIZE / 2 - 60, 25, 0, Math.PI * 2); ctx.fill()
  return toPng(c)
}

function genXiChar() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  // Double 喜 (囍)
  ctx.fillStyle = COLORS.red; ctx.font = 'bold 200px "KaiTi","楷体","STKaiti","SimSun",serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('囍', SIZE / 2, SIZE / 2 + 10)
  ctx.strokeStyle = COLORS.gold; ctx.lineWidth = 2
  // Small decorative hearts
  ctx.fillStyle = COLORS.red; ctx.beginPath(); ctx.arc(SIZE / 2 - 100, SIZE / 2 - 80, 15, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(SIZE / 2 + 100, SIZE / 2 - 80, 15, 0, Math.PI * 2); ctx.fill()
  return toPng(c)
}

function genEightTreasures() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  // 8 treasures in a circle
  const items = ['◆', '●', '▲', '■', '★', '♦', '⬟', '♥']
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2
    const ix = SIZE / 2 + Math.cos(a) * 130, iy = SIZE / 2 + Math.sin(a) * 130
    ctx.fillStyle = [COLORS.gold, COLORS.red, COLORS.blue, COLORS.green, COLORS.purple, COLORS.orange, COLORS.teal, COLORS.dark][i]
    ctx.beginPath(); ctx.arc(ix, iy, 18, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(items[i], ix, iy)
  }
  ctx.strokeStyle = COLORS.gold; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(SIZE / 2, SIZE / 2, 50, 0, Math.PI * 2); ctx.stroke()
  ctx.fillStyle = COLORS.red; ctx.beginPath(); ctx.arc(SIZE / 2, SIZE / 2, 20, 0, Math.PI * 2); ctx.fill()
  return toPng(c)
}

function genEightAuspicious() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  // Buddhist 8 auspicious symbols arranged around lotus
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2
    const sx = SIZE / 2 + Math.cos(a) * 130, sy = SIZE / 2 + Math.sin(a) * 130
    // Symbol base
    ctx.fillStyle = [COLORS.gold, COLORS.blue, COLORS.red, COLORS.green, COLORS.purple, COLORS.orange, COLORS.teal, COLORS.lightGold][i]
    ctx.strokeStyle = COLORS.dark; ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(sx, sy, 20, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    // Inner symbol mark
    ctx.fillStyle = COLORS.dark
    if (i % 2 === 0) { ctx.beginPath(); ctx.arc(sx, sy, 8, 0, Math.PI * 2); ctx.fill() }
    else { ctx.beginPath(); ctx.moveTo(sx - 8, sy - 8); ctx.lineTo(sx + 8, sy + 8); ctx.moveTo(sx + 8, sy - 8); ctx.lineTo(sx - 8, sy + 8); ctx.stroke() }
  }
  // Central lotus
  drawFlower(ctx, SIZE / 2, SIZE / 2, 35, 8, COLORS.gold, COLORS.red)
  return toPng(c)
}

function genMiscTreasures() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  // Random treasure items scattered
  for (let i = 0; i < 20; i++) {
    const tx = 40 + Math.random() * (SIZE - 80), ty = 40 + Math.random() * (SIZE - 80)
    ctx.fillStyle = [COLORS.gold, COLORS.red, COLORS.blue, COLORS.green, COLORS.purple, COLORS.orange][Math.floor(Math.random() * 6)]
    const r = 5 + Math.random() * 15
    ctx.beginPath()
    if (Math.random() > 0.5) { ctx.arc(tx, ty, r, 0, Math.PI * 2) }
    else { ctx.moveTo(tx, ty - r); ctx.lineTo(tx + r, ty + r); ctx.lineTo(tx - r, ty + r); ctx.closePath() }
    ctx.fill()
  }
  ctx.strokeStyle = COLORS.gold; ctx.lineWidth = 2; ctx.strokeRect(20, 20, SIZE - 40, SIZE - 40)
  return toPng(c)
}

function genEntwinedBranches() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  ctx.strokeStyle = COLORS.green; ctx.lineWidth = 2.5
  // Intertwined vine pattern
  ctx.beginPath()
  for (let x = 0; x < SIZE; x += 2) { const y = SIZE / 2 + Math.sin(x * 0.02) * 80 + Math.cos(x * 0.013) * 40; x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y) }
  ctx.stroke()
  ctx.beginPath()
  for (let x = 0; x < SIZE; x += 2) { const y = SIZE / 2 - 30 + Math.cos(x * 0.02) * 80 + Math.sin(x * 0.013) * 40; x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y) }
  ctx.stroke()
  // Flowers at intersections
  ctx.fillStyle = COLORS.red
  for (let t = 0.05; t < 0.95; t += 0.09) {
    const x = SIZE * t; const y = SIZE / 2 + Math.sin(x * 0.02) * 80 + Math.cos(x * 0.013) * 40
    ctx.beginPath(); ctx.arc(x, y - 5, 8, 0, Math.PI * 2); ctx.fill()
  }
  return toPng(c)
}

function genBaoxiangFlower() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  const cx = SIZE / 2, cy = SIZE / 2
  // Multi-layered flower
  const layers = [
    { r: 80, petals: 8, color: COLORS.blue, alpha: 0.5 },
    { r: 60, petals: 6, color: COLORS.lightBlue, alpha: 0.6 },
    { r: 40, petals: 5, color: COLORS.gold, alpha: 0.7 },
  ]
  layers.forEach(l => {
    ctx.fillStyle = l.color; ctx.globalAlpha = l.alpha
    for (let i = 0; i < l.petals; i++) {
      const a = (i / l.petals) * Math.PI * 2 - Math.PI / 2
      ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * l.r * 0.3, cy + Math.sin(a) * l.r * 0.3, l.r * 0.5, l.r * 0.2, a, 0, Math.PI * 2); ctx.fill()
    }
  })
  ctx.globalAlpha = 1
  ctx.fillStyle = COLORS.dark; ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.fill()
  return toPng(c)
}

function genPeonyMotif() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  const cx = SIZE / 2, cy = SIZE / 2
  // Large ornate peony as standalone motif
  ctx.fillStyle = COLORS.lightRed; ctx.strokeStyle = COLORS.red; ctx.lineWidth = 1.5
  for (let l = 0; l < 4; l++) {
    const petals = 5 + l * 2; const r = 20 + l * 20
    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * Math.PI * 2 + l * 0.3
      ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * r * 0.35, cy + Math.sin(a) * r * 0.35, r * 0.55, r * 0.2, a, 0, Math.PI * 2)
      ctx.fill(); ctx.stroke()
    }
  }
  ctx.fillStyle = COLORS.gold; ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.fill()
  // Leaves
  ctx.fillStyle = COLORS.green
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * 65, cy + Math.sin(a) * 65, 30, 10, a, 0, Math.PI * 2); ctx.fill() }
  return toPng(c)
}

function genLotusMotif() {
  const c = createCanvas(); const ctx = c.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE)
  const cx = SIZE / 2, cy = SIZE / 2
  // Lotus petals in full bloom
  ctx.fillStyle = '#F0D8D8'; ctx.strokeStyle = '#C47E7A'; ctx.lineWidth = 2
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2
    ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * 15, cy + Math.sin(a) * 15, 15, 55, a, 0, Math.PI * 2)
    ctx.fill(); ctx.stroke()
  }
  // Inner petals
  ctx.fillStyle = '#F5E8E8'
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2
    ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8, 10, 35, a, 0, Math.PI * 2)
    ctx.fill(); ctx.stroke()
  }
  ctx.fillStyle = COLORS.gold; ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.fill()
  return toPng(c)
}

// ═══════════════════════════════════════════════════════════════
// Pattern registry & categories
// ═══════════════════════════════════════════════════════════════

export const patternCategories = [
  { id: 'glaze', name: '经典釉纹', icon: '🏺' },
  { id: 'beast', name: '瑞兽祥禽', icon: '🐉' },
  { id: 'landscape', name: '山水风景', icon: '🏔️' },
  { id: 'geometry', name: '几何纹样', icon: '🔷' },
  { id: 'figure', name: '人物故事', icon: '👤' },
  { id: 'auspicious', name: '吉祥图案', icon: '🎊' },
]

// ── 全局花纹 dataUrl 缓存（延迟生成 + 缓存复用）──
const _dataUrlCache = new Map()

/**
 * 获取花纹的 dataUrl（延迟生成 + 缓存复用）
 * 统一入口：所有花纹 dataUrl 访问都通过此函数
 */
export function getPatternDataUrl(pattern) {
  if (!pattern) return null
  // 已有 dataUrl 字符串的直接返回
  if (typeof pattern.dataUrl === 'string' && pattern.dataUrl.length > 0) return pattern.dataUrl
  // 通过 _gen 延迟生成（带缓存）
  if (pattern._gen) {
    if (_dataUrlCache.has(pattern.id)) return _dataUrlCache.get(pattern.id)
    try {
      const dataUrl = pattern._gen()
      if (dataUrl && dataUrl.length > 0) {
        _dataUrlCache.set(pattern.id, dataUrl)
        return dataUrl
      }
    } catch (e) {
      console.error(`[patterns] 生成花纹 "${pattern.name}" 失败:`, e)
    }
    return null
  }
  // 用户上传图案兼容
  if (pattern.base64) return pattern.base64
  return null
}

/**
 * 后台预加载所有内置花纹（非阻塞，逐个生成）
 */
export function preloadAllPatterns(onProgress) {
  let i = 0
  function next() {
    if (i >= builtinPatterns.length) return
    const p = builtinPatterns[i]
    if (!_dataUrlCache.has(p.id) && p._gen) {
      try {
        const dataUrl = p._gen()
        if (dataUrl) _dataUrlCache.set(p.id, dataUrl)
      } catch (e) { /* 静默跳过 */ }
    }
    i++
    if (onProgress) onProgress(i, builtinPatterns.length)
    setTimeout(next, 10)
  }
  setTimeout(next, 100)
}

/**
 * 内置花纹数据 v2.0 — 50款经典中式陶瓷花纹
 * 使用 _gen 延迟生成 dataUrl，通过 getPatternDataUrl() 获取
 */
export const builtinPatterns = [
  // ── 经典釉纹 (5) ──
  { id: 'lian', name: '青花瓷缠枝莲', category: 'glaze', _gen: genLian },
  { id: 'peony', name: '粉彩牡丹', category: 'glaze', _gen: genPeony },
  { id: 'jun', name: '钧瓷窑变纹', category: 'glaze', _gen: genJun },
  { id: 'ru-crackle', name: '汝瓷冰裂纹', category: 'glaze', _gen: genRuCrackle },
  { id: 'ge-wire', name: '哥瓷金丝铁线', category: 'glaze', _gen: genGeWire },

  // ── 瑞兽祥禽 (10) ──
  { id: 'dragon', name: '龙纹', category: 'beast', _gen: genDragon },
  { id: 'phoenix', name: '凤纹', category: 'beast', _gen: genPhoenix },
  { id: 'qilin', name: '麒麟纹', category: 'beast', _gen: genQilin },
  { id: 'lion', name: '狮子纹', category: 'beast', _gen: genLion },
  { id: 'crane', name: '仙鹤纹', category: 'beast', _gen: genCrane },
  { id: 'mandarin', name: '鸳鸯纹', category: 'beast', _gen: genMandarinDuck },
  { id: 'butterfly', name: '蝴蝶纹', category: 'beast', _gen: genButterfly },
  { id: 'bat', name: '蝙蝠纹', category: 'beast', _gen: genBat },
  { id: 'deer', name: '鹿纹', category: 'beast', _gen: genDeer },
  { id: 'fish', name: '鱼纹', category: 'beast', _gen: genFish },

  // ── 山水风景 (8) ──
  { id: 'landscape', name: '山水纹', category: 'landscape', _gen: genLandscape },
  { id: 'cloud-mist', name: '云雾纹', category: 'landscape', _gen: genCloudMist },
  { id: 'waterfall', name: '瀑布纹', category: 'landscape', _gen: genWaterfall },
  { id: 'pine-bamboo', name: '松竹梅纹', category: 'landscape', _gen: genPineBambooPlum },
  { id: 'orchid', name: '兰花纹', category: 'landscape', _gen: genOrchid },
  { id: 'chrysanthemum', name: '菊花纹', category: 'landscape', _gen: genChrysanthemum },
  { id: 'lotus', name: '荷花纹', category: 'landscape', _gen: genLotus },
  { id: 'peach-blossom', name: '桃花纹', category: 'landscape', _gen: genPeachBlossom },

  // ── 几何纹样 (10) ──
  { id: 'meander', name: '几何回纹', category: 'geometry', _gen: genMeander },
  { id: 'ruyi', name: '如意纹', category: 'geometry', _gen: genRuyi },
  { id: 'cloud', name: '云纹', category: 'geometry', _gen: genCloud },
  { id: 'water-wave', name: '水波纹', category: 'geometry', _gen: genWaterWave },
  { id: 'scroll-vine', name: '卷草纹', category: 'geometry', _gen: genScrollVine },
  { id: 'swastika', name: '万字纹', category: 'geometry', _gen: genSwastika },
  { id: 'bagua', name: '八卦纹', category: 'geometry', _gen: genBagua },
  { id: 'ice-crack', name: '冰裂纹', category: 'geometry', _gen: genIceCrack },
  { id: 'diamond', name: '菱形纹', category: 'geometry', _gen: genDiamond },
  { id: 'grid', name: '方格纹', category: 'geometry', _gen: genGrid },

  // ── 人物故事 (7) ──
  { id: 'eight-immortals', name: '八仙纹', category: 'figure', _gen: genEightImmortals },
  { id: 'lady', name: '仕女纹', category: 'figure', _gen: genLady },
  { id: 'children', name: '婴戏纹', category: 'figure', _gen: genChildren },
  { id: 'longevity', name: '寿星纹', category: 'figure', _gen: genLongevity },
  { id: 'wealth', name: '财神纹', category: 'figure', _gen: genWealth },
  { id: 'guanyin', name: '观音纹', category: 'figure', _gen: genGuanyin },
  { id: 'arhat', name: '罗汉纹', category: 'figure', _gen: genArhat },

  // ── 吉祥图案 (10) ──
  { id: 'fu', name: '福字纹', category: 'auspicious', _gen: genFuChar },
  { id: 'shou', name: '寿字纹', category: 'auspicious', _gen: genShouChar },
  { id: 'xi', name: '喜字纹', category: 'auspicious', _gen: genXiChar },
  { id: 'eight-treasures', name: '八宝纹', category: 'auspicious', _gen: genEightTreasures },
  { id: 'eight-auspicious', name: '八吉祥纹', category: 'auspicious', _gen: genEightAuspicious },
  { id: 'misc-treasures', name: '杂宝纹', category: 'auspicious', _gen: genMiscTreasures },
  { id: 'entwined', name: '缠枝纹', category: 'auspicious', _gen: genEntwinedBranches },
  { id: 'baoxiang', name: '宝相花纹', category: 'auspicious', _gen: genBaoxiangFlower },
  { id: 'peony-motif', name: '牡丹纹', category: 'auspicious', _gen: genPeonyMotif },
  { id: 'lotus-motif', name: '莲花纹', category: 'auspicious', _gen: genLotusMotif },
]

export default builtinPatterns
