/**
 * Sketchfab API Service v2.0 (20260602 精品版)
 * 全球最大免费3D模型平台
 * 文档: https://docs.sketchfab.com/data-api/v3/
 * 获取Token: https://sketchfab.com/settings/password
 */

const API_KEY = '3e7d9c4b8a2f1e5c7a9d3b8f0e1c6a4d'
const BASE_URL = 'https://api.sketchfab.com/v3'
const MAX_RETRIES = 3
const RETRY_DELAY = 800 // ms base delay

let authFailed = false

/**
 * 带重试的 fetch 封装（指数退避）
 */
async function fetchWithRetry(url, options = {}, retries = MAX_RETRIES) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const resp = await fetch(url, options)
      return resp
    } catch (e) {
      if (attempt === retries - 1) throw e
      console.warn(`[Sketchfab] Retry ${attempt + 1}/${retries} after error:`, e.message)
      await new Promise(r => setTimeout(r, RETRY_DELAY * Math.pow(2, attempt)))
    }
  }
}

/**
 * 检查Sketchfab API是否可用
 */
export async function isSketchfabAvailable() {
  if (authFailed) return false
  try {
    const resp = await fetchWithRetry(`${BASE_URL}/models?count=1`, {
      headers: { Authorization: `Token ${API_KEY}` },
    })
    return resp.ok
  } catch {
    return false
  }
}

/**
 * 计算模型质量评分（0-100）
 */
function computeQualityScore(model) {
  let score = 0
  const likes = model.likeCount || 0
  const downloads = model.downloadCount || 0
  const faces = model.faceCount || 0
  const views = model.viewCount || 0

  // Likes: 0-25 points (50 likes → 20pts, 200+ → 25)
  score += Math.min(25, (likes / 200) * 25)
  // Downloads: 0-25 points (200 downloads → 15pts, 1000+ → 25)
  score += Math.min(25, (downloads / 1000) * 25)
  // Face count sweet spot (1K-30K): 0-20 points
  if (faces >= 1000 && faces <= 30000) {
    score += 20
  } else if (faces > 0) {
    score += 10
  }
  // Views: 0-15 points
  score += Math.min(15, (views / 10000) * 15)
  // Published recently: 0-15 points
  if (model.publishedAt) {
    const year = new Date(model.publishedAt).getFullYear()
    if (year >= 2023) score += 15
    else if (year >= 2021) score += 10
    else if (year >= 2020) score += 5
  }

  return Math.round(Math.min(100, score))
}

/**
 * 搜索可下载的高质量GLB模型（强制精品筛选条件）
 * @param {object} params
 * @param {string} [params.q] - 搜索关键词
 * @param {string} [params.cursor] - 分页游标
 * @param {string} [params.sortBy] - 排序: '-publishedAt' | '-likeCount' | '-downloadCount'
 * @returns {Promise<{models: Array, nextCursor: string|null, total: number, authError: boolean}>}
 */
export async function searchModels({ q = '', cursor = null, sortBy = '-likeCount' } = {}) {
  if (authFailed) return { models: [], nextCursor: null, total: 0, authError: true }

  const params = new URLSearchParams({
    downloadable: 'true',
    file_format: 'glb',
    sort_by: sortBy,
    type: 'models',
    min_face_count: '1000',
    max_face_count: '30000',
    staffpicked: 'true',       // 仅显示精选模型
    sort_by: sortBy || '-likeCount',
  })

  if (q) {
    params.set('q', q)
  } else {
    // Default: search for ceramic-related high-quality models
    params.set('q', 'ceramic vase pottery porcelain bowl cup plate')
  }

  if (cursor) params.set('cursor', cursor)

  const url = `${BASE_URL}/search?${params.toString()}`

  let resp
  try {
    resp = await fetchWithRetry(url, {
      headers: { Authorization: `Token ${API_KEY}` },
    })
  } catch (e) {
    console.error('[Sketchfab] Network error after retries:', e)
    return { models: [], nextCursor: null, total: 0, authError: false }
  }

  if (resp.status === 401 || resp.status === 403) {
    console.warn('[Sketchfab] API key invalid — Sketchfab disabled')
    authFailed = true
    return { models: [], nextCursor: null, total: 0, authError: true }
  }

  if (!resp.ok) {
    console.error('[Sketchfab] Search failed:', resp.status)
    return { models: [], nextCursor: null, total: 0, authError: false }
  }

  const data = await resp.json()
  let models = (data.results || []).map(raw => {
    const model = transformSketchfabModel(raw)
    model.qualityScore = computeQualityScore(model)
    return model
  })

  // 客户端二次过滤：只保留质量分≥70的精品模型
  const before = models.length
  models = models.filter(m => m.qualityScore >= 70)
  console.log(`[Sketchfab] Quality filter: ${before} → ${models.length} models (score≥70)`)

  console.log(`[Sketchfab] Found ${models.length} quality models (total API: ${data.total || 0})`)
  return {
    models,
    nextCursor: data.cursors?.next || null,
    total: data.total || 0,
    authError: false,
  }
}

/**
 * 获取模型详情（含下载链接）
 */
export async function getModelDetail(uid) {
  try {
    const resp = await fetchWithRetry(`${BASE_URL}/models/${uid}`, {
      headers: { Authorization: `Token ${API_KEY}` },
    })
    if (!resp.ok) return null
    const data = await resp.json()
    const model = transformSketchfabModel(data)
    model.qualityScore = computeQualityScore(model)
    return model
  } catch {
    return null
  }
}

/**
 * 获取模型下载URL（GLB格式，实时获取有效链接）
 */
export async function getModelDownloadUrl(uid) {
  try {
    const resp = await fetchWithRetry(`${BASE_URL}/models/${uid}/download`, {
      headers: { Authorization: `Token ${API_KEY}` },
    })

    if (!resp.ok) {
      console.error('[Sketchfab] Download URL failed:', resp.status)
      return null
    }

    const data = await resp.json()
    // 优先 GLB，其次 glTF
    const glb = data.glb || data.gltf || null
    if (glb && glb.url) return glb.url

    // 回退查找
    for (const key of Object.keys(data)) {
      if (data[key] && data[key].url && data[key].url.endsWith('.glb')) {
        return data[key].url
      }
    }

    return null
  } catch (e) {
    console.error('[Sketchfab] Download URL error:', e)
    return null
  }
}

/**
 * 预检查模型是否可下载
 */
export async function isModelDownloadable(uid) {
  const url = await getModelDownloadUrl(uid)
  return url !== null
}

/**
 * 模型数据转换为统一格式
 */
function transformSketchfabModel(raw) {
  const thumbnails = raw.thumbnails?.images || []
  // 高清→中清降级链
  const bestThumb = thumbnails.length > 0
    ? (thumbnails.find(i => i.size >= 512) || thumbnails[thumbnails.length - 1] || thumbnails[0])?.url
    : raw.thumbnails?.url || ''

  return {
    id: 'skfb_' + raw.uid,
    sourceId: raw.uid,
    source: 'sketchfab',
    name: raw.name || '未命名模型',
    author: raw.user?.displayName || raw.user?.username || '未知作者',
    authorUrl: raw.user?.profileUrl || null,
    thumbnail: bestThumb,
    thumbnailMedium: thumbnails.length > 1
      ? (thumbnails.find(i => i.size >= 256) || thumbnails[0])?.url
      : bestThumb,
    thumbnailSmall: thumbnails.length > 0 ? thumbnails[0]?.url : bestThumb,
    viewUrl: raw.viewerUrl || `https://sketchfab.com/models/${raw.uid}`,
    license: raw.license?.label || 'CC-BY',
    licenseType: detectLicenseType(raw),
    downloadCount: raw.downloadCount || 0,
    likeCount: raw.likeCount || 0,
    viewCount: raw.viewCount || 0,
    publishedAt: raw.publishedAt || raw.createdAt || '',
    faceCount: raw.faceCount || raw.vertexCount || 0,
    hasTextures: !!(raw.textureCount || raw.images?.length),
    category: detectCategory(raw),
    style: detectStyle(raw),
    tags: raw.tags?.map(t => t.name || t).filter(Boolean) || [],
    description: raw.description || '',
    qualityScore: 0,
    raw: raw,
  }
}

function detectLicenseType(raw) {
  const slug = (raw.license?.slug || '').toLowerCase()
  if (slug.includes('cc0') || slug.includes('cc-0')) return 'CC0'
  if (slug.includes('cc-by-sa')) return 'CC-BY-SA'
  return 'CC-BY'
}

function detectCategory(raw) {
  const tags = (raw.tags || []).map(t => (t.name || t).toLowerCase())
  const name = (raw.name || '').toLowerCase()
  const cats = (raw.categories || []).map(c => (c.name || c).toLowerCase())
  const full = [...tags, ...cats, name].join(' ')

  if (full.includes('vase') || full.includes('花瓶') || full.includes('花器')) return 'vase'
  if (full.includes('bowl') || full.includes('碗') || full.includes('plate') || full.includes('盘')) return 'bowl'
  if (full.includes('cup') || full.includes('杯') || full.includes('mug') || full.includes('teapot') || full.includes('茶壶')) return 'cup'
  if (full.includes('figure') || full.includes('statue') || full.includes('sculpture') || full.includes('摆件')) return 'ornament'
  return 'other'
}

function detectStyle(raw) {
  const tags = (raw.tags || []).map(t => (t.name || t).toLowerCase())
  const name = (raw.name || '').toLowerCase()
  const full = [...tags, name].join(' ')

  if (full.includes('chinese') || full.includes('traditional') || full.includes('oriental') || full.includes('国风') || full.includes('asian') || full.includes('ming') || full.includes('qing')) return 'traditional'
  if (full.includes('modern') || full.includes('contemporary') || full.includes('minimalist') || full.includes('现代') || full.includes('简约')) return 'modern'
  if (full.includes('vintage') || full.includes('european') || full.includes('classic') || full.includes('欧式') || full.includes('复古')) return 'european'
  if (full.includes('japanese') || full.includes('wabi') || full.includes('zen') || full.includes('日式') || full.includes('侘寂')) return 'japanese'
  if (full.includes('industrial') || full.includes('steel') || full.includes('concrete') || full.includes('工业')) return 'industrial'
  return 'other'
}
