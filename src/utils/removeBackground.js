/**
 * 智能背景去除工具 v6 — 点击取色 + 洪泛填充
 * 用户点击背景区域 → 从点击点洪泛填充 → 去除连通相似色块
 * 同时保留自动色域检测作为辅助
 */

export async function readExifOrientation(file) {
  if (!file || !file.type.startsWith('image/jpeg')) return 1
  try {
    const buffer = await file.arrayBuffer(), view = new DataView(buffer)
    if (view.getUint16(0) !== 0xFFD8) return 1
    let offset = 2
    while (offset + 8 <= view.byteLength) {
      if (view.getUint8(offset) !== 0xFF) break
      const marker = view.getUint8(offset + 1)
      if (marker === 0xD9) break
      const segLen = view.getUint16(offset + 2)
      if (segLen < 2) { offset += 2; continue }
      if (marker === 0xE1 && segLen >= 14) {
        let head = ''
        for (let i = 0; i < 6; i++) head += String.fromCharCode(view.getUint8(offset + 4 + i))
        if (head !== 'Exif\0\0') { offset += 2 + segLen; continue }
        const tiffOff = offset + 10, endian = view.getUint16(tiffOff), le = endian === 0x4949
        const g16 = (o) => view.getUint16(tiffOff + o, le), g32 = (o) => view.getUint32(tiffOff + o, le)
        if (endian !== 0x4949 && endian !== 0x4D4D) break
        const ifd0 = g32(4)
        if (!ifd0) break
        const entries = g16(ifd0)
        for (let i = 0; i < entries; i++) {
          if (g16(ifd0 + 2 + i * 12) === 0x0112) {
            const orient = g16(ifd0 + 2 + i * 12 + 8)
            return orient >= 1 && orient <= 8 ? orient : 1
          }
        }
        break
      }
      offset += 2 + segLen
    }
  } catch (e) { /* */ }
  return 1
}

function applyOrientation(ctx, img, o, w, h) {
  ctx.save(); let dw=w, dh=h
  switch(o){case 2:ctx.transform(-1,0,0,1,w,0);break;case 3:ctx.transform(-1,0,0,-1,w,h);break;case 4:ctx.transform(1,0,0,-1,0,h);break;case 5:ctx.transform(0,1,1,0,0,0);dw=h;dh=w;break;case 6:ctx.transform(0,1,-1,0,h,0);dw=h;dh=w;break;case 7:ctx.transform(0,-1,-1,0,h,w);dw=h;dh=w;break;case 8:ctx.transform(0,-1,1,0,0,w);dw=h;dh=w;break}
  ctx.drawImage(img,0,0,dw,dh);ctx.restore()
}

function hasAlphaTransparency(data) {
  const step = Math.max(4, Math.floor(data.length / 4000))
  for (let i = 3; i < data.length; i += step * 4) if (data[i] < 254) return true
  return false
}

/* ══════════════════════════════════════════════════
   引擎1：自动色域检测
   从四边+四角+边缘网格采样，建立背景RGB范围
   ══════════════════════════════════════════════════ */

function buildBackgroundRange(data, w, h) {
  const samples = []
  const stride = Math.max(4, Math.floor(Math.min(w, h) / 60))

  // 采样区域：四边窄带 + 四角方块 + 网格点
  const addSample = (x, y) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return
    const i = (y * w + x) * 4
    samples.push([data[i], data[i + 1], data[i + 2]])
  }

  // 四边采样
  for (let x = 0; x < w; x += stride) { addSample(x, 0); addSample(x, 1); addSample(x, h - 1); addSample(x, h - 2) }
  for (let y = 0; y < h; y += stride) { addSample(0, y); addSample(1, y); addSample(w - 1, y); addSample(w - 2, y) }

  if (samples.length < 20) return null

  // 计算均值和标准差
  let sumR = 0, sumG = 0, sumB = 0
  for (const [r, g, b] of samples) { sumR += r; sumG += g; sumB += b }
  const meanR = sumR / samples.length, meanG = sumG / samples.length, meanB = sumB / samples.length

  let varR = 0, varG = 0, varB = 0
  for (const [r, g, b] of samples) {
    varR += (r - meanR) ** 2; varG += (g - meanG) ** 2; varB += (b - meanB) ** 2
  }
  const stdR = Math.sqrt(varR / samples.length)
  const stdG = Math.sqrt(varG / samples.length)
  const stdB = Math.sqrt(varB / samples.length)

  return { meanR, meanG, meanB, stdR, stdG, stdB, count: samples.length }
}

/** 像素是否在背景色域范围内 */
function inBgRange(r, g, b, range, tolerance) {
  if (!range) return false
  const t = tolerance / 100 * 5.0 // 容差系数
  const dr = Math.abs(r - range.meanR) / Math.max(range.stdR * t, 8)
  const dg = Math.abs(g - range.meanG) / Math.max(range.stdG * t, 8)
  const db = Math.abs(b - range.meanB) / Math.max(range.stdB * t, 8)
  return (dr + dg + db) / 3 < 1.0
}

/* ══════════════════════════════════════════════════
   引擎2：边缘连通性验证
   只去除「在色域范围内」且「连通到边缘」的像素
   ══════════════════════════════════════════════════ */

function edgeConnectedFlood(alpha, w, h, range, tolerance) {
  const visited = new Uint8Array(w * h)
  const queue = new Int32Array(w * h * 2)
  let qh = 0, qt = 0

  const enq = (x, y) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return
    const i = y * w + x
    if (visited[i] || alpha[i] === 0) return
    visited[i] = 1
    queue[qt++] = x; queue[qt++] = y
  }

  // 四边中「在背景色域内」的像素入队
  for (let x = 0; x < w; x++) {
    const iTop = x * 4, iBot = ((h - 1) * w + x) * 4
    if (inBgRange(dataRef[iTop], dataRef[iTop + 1], dataRef[iTop + 2], range, tolerance)) enq(x, 0)
    if (inBgRange(dataRef[iBot], dataRef[iBot + 1], dataRef[iBot + 2], range, tolerance)) enq(x, h - 1)
  }
  for (let y = 1; y < h - 1; y++) {
    const iL = y * w * 4, iR = (y * w + w - 1) * 4
    if (inBgRange(dataRef[iL], dataRef[iL + 1], dataRef[iL + 2], range, tolerance)) enq(0, y)
    if (inBgRange(dataRef[iR], dataRef[iR + 1], dataRef[iR + 2], range, tolerance)) enq(w - 1, y)
  }

  const batchSize = 40000
  let batchCount = 0

  while (qh < qt) {
    const x = queue[qh++], y = queue[qh++]
    const ci = y * w + x
    alpha[ci] = 0

    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
      const ni = ny * w + nx
      if (visited[ni] || alpha[ni] === 0) continue
      const pi = ni * 4
      if (inBgRange(dataRef[pi], dataRef[pi + 1], dataRef[pi + 2], range, tolerance)) {
        visited[ni] = 1
        queue[qt++] = nx; queue[qt++] = ny
      }
    }

    if (++batchCount >= batchSize) {
      batchCount = 0
      // yield to browser — handled naturally by the sync while loop
    }
  }
}

// 全局引用（用于edgeConnectedFlood中访问像素数据）
let dataRef = null

/* ══════════════════════════════════════════════════
   后处理
   ══════════════════════════════════════════════════ */

function blurAlpha(alpha, w, h) {
  const src = new Float32Array(alpha)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const ci = y * w + x
      alpha[ci] = Math.round(
        (src[ci - w - 1] + src[ci - w] * 2 + src[ci - w + 1]
          + src[ci - 1] * 2 + src[ci] * 4 + src[ci + 1] * 2
          + src[ci + w - 1] + src[ci + w] * 2 + src[ci + w + 1]) / 16)
    }
  }
}

function closeHoles(alpha, w, h) {
  const tmp = new Uint8Array(alpha)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const ci = y * w + x; let m = 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
        if (tmp[(y + dy) * w + (x + dx)] > m) m = tmp[(y + dy) * w + (x + dx)]
      alpha[ci] = m
    }
  }
  tmp.set(alpha)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const ci = y * w + x; let m = 255
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
        if (tmp[(y + dy) * w + (x + dx)] < m) m = tmp[(y + dy) * w + (x + dx)]
      alpha[ci] = m
    }
  }
}

function qualityCheck(data) {
  let transparent = 0
  const total = data.length / 4, step = Math.max(4, Math.floor(total / 5000))
  for (let i = 3; i < data.length; i += step * 4) if (data[i] < 128) transparent++
  const ratio = transparent / Math.ceil(total / step)
  if (ratio > 0.95) return { valid: false, ratio, msg: '透明区域超过95%，请降低去除强度' }
  if (ratio < 0.02) return { valid: false, ratio, msg: '透明区域低于2%，请提高去除强度' }
  return { valid: true, ratio, msg: '' }
}

/* ══════════════════════════════════════════════════
   公开API
   ══════════════════════════════════════════════════ */

export async function removeBackground(dataUrl, threshold = 25, options = {}) {
  const { orientation = 1, onProgress = null, skipQualityCheck = false } = options

  const img = await loadImage(dataUrl)
  let iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height
  if (!iw || !ih) throw new Error('无法读取图片尺寸')

  const swap = orientation >= 5 && orientation <= 8
  const cw = swap ? ih : iw, ch = swap ? iw : ih

  let scale = 1
  if (Math.max(cw, ch) > 2048) scale = 2048 / Math.max(cw, ch)
  const w = Math.round(cw * scale), h = Math.round(ch * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, w, h)
  if (orientation > 1) applyOrientation(ctx, img, orientation, w, h)
  else ctx.drawImage(img, 0, 0, w, h)

  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data
  dataRef = data // 全局引用供洪泛使用

  if (hasAlphaTransparency(data)) {
    return { dataUrl: canvas.toDataURL('image/png'), alreadyTransparent: true,
      backgroundColor: { r: 255, g: 255, b: 255 }, quality: null }
  }

  if (onProgress) onProgress(0.05)

  // Step 1: 色域检测
  const range = buildBackgroundRange(data, w, h)
  if (onProgress) onProgress(0.15)

  if (!range) {
    // 采样不足 → 全部保留
    dataRef = null
    return { dataUrl, alreadyTransparent: false,
      backgroundColor: { r: 255, g: 255, b: 255 }, quality: null }
  }

  // Step 2: 色域初步标记（alpha=0=背景候选, 255=前景）
  const alpha = new Uint8Array(w * h).fill(255)
  for (let i = 0; i < w * h; i++) {
    const pi = i * 4
    if (inBgRange(data[pi], data[pi + 1], data[pi + 2], range, threshold)) {
      alpha[i] = 128 // 待定
    }
  }
  if (onProgress) onProgress(0.25)

  // Step 3: 边缘连通性验证 → 只去除连通到边缘的待定像素
  edgeConnectedFlood(alpha, w, h, range, threshold)
  if (onProgress) onProgress(0.55)

  // Step 4: 未连通的待定像素恢复为前景（255）
  for (let i = 0; i < w * h; i++) {
    if (alpha[i] === 128) alpha[i] = 255
    data[i * 4 + 3] = alpha[i]
  }
  if (onProgress) onProgress(0.70)

  // Step 5: 后处理
  closeHoles(alpha, w, h)
  for (let i = 0; i < w * h; i++) data[i * 4 + 3] = alpha[i]
  blurAlpha(alpha, w, h)
  for (let i = 0; i < w * h; i++) data[i * 4 + 3] = alpha[i]
  if (onProgress) onProgress(0.90)

  ctx.putImageData(imageData, 0, 0)
  const resultUrl = canvas.toDataURL('image/png')
  dataRef = null

  let quality = null
  if (!skipQualityCheck) quality = qualityCheck(data)

  return { dataUrl: resultUrl, alreadyTransparent: false,
    backgroundColor: { r: Math.round(range.meanR), g: Math.round(range.meanG), b: Math.round(range.meanB) },
    quality }
}

export function reprocessBackground(originalDataUrl, threshold, options = {}) {
  return removeBackground(originalDataUrl, threshold, options)
}

/** 点击取色洪泛填充：从(x,y)出发，扩散填充所有色差<tolerance的连通区域 */
export function floodFillFromPoint(dataUrl, clickX, clickY, tolerance = 20) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const w = img.naturalWidth || img.width
      const h = img.naturalHeight || img.height
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)

      const imageData = ctx.getImageData(0, 0, w, h)
      const data = imageData.data

      // 确保点击坐标在范围内
      const cx = Math.round(clickX * w)
      const cy = Math.round(clickY * h)
      if (cx < 0 || cx >= w || cy < 0 || cy >= h) {
        resolve(canvas.toDataURL('image/png'))
        return
      }

      // 取点击点颜色
      const seedIdx = (cy * w + cx) * 4
      const sR = data[seedIdx], sG = data[seedIdx + 1], sB = data[seedIdx + 2]
      const t = tolerance / 100 * 0.70 // 映射容差

      // BFS洪泛
      const visited = new Uint8Array(w * h)
      const queue = [[cx, cy]]
      visited[cy * w + cx] = 1

      while (queue.length) {
        const [x, y] = queue.shift()
        const idx = (y * w + x) * 4
        data[idx + 3] = 0 // 透明

        for (const [nx, ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]) {
          if (nx<0||nx>=w||ny<0||ny>=h) continue
          const ni = ny * w + nx
          if (visited[ni]) continue
          const pi = ni * 4
          const dr = data[pi]-sR, dg = data[pi+1]-sG, db = data[pi+2]-sB
          const dist = Math.sqrt(dr*dr+dg*dg+db*db) / 441.67
          if (dist <= t) {
            visited[ni] = 1
            queue.push([nx, ny])
          }
        }

        // 防止队列过大
        if (queue.length > 500000) break
      }

      ctx.putImageData(imageData, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = dataUrl
  })
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = src
  })
}
