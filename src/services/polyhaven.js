/**
 * Poly Haven API Service v2.0 (20260602 精品版)
 * 100%免费CC0模型库 — 无需API密钥，完全公开
 * 文档: https://api.polyhaven.com/doc/
 */

const BASE_URL = 'https://api.polyhaven.com'

/**
 * 计算模型质量评分（0-100）
 * Poly Haven 模型均为CC0且高分辨率，基础分较高
 */
function computeQualityScore(model) {
  let score = 50 // CC0 基础分

  const downloads = model.downloadCount || 0
  const faces = model.faceCount || 0
  const year = model.publishedAt ? new Date(model.publishedAt).getFullYear() : 2020

  // Downloads: 0-20 points
  score += Math.min(20, (downloads / 500) * 20)
  // Face count (1K-30K sweet spot): 0-15 points
  if (faces >= 1000 && faces <= 30000) score += 15
  else if (faces > 0) score += 5
  // Published recently: 0-15 points
  if (year >= 2024) score += 15
  else if (year >= 2022) score += 10
  else if (year >= 2021) score += 5

  return Math.round(Math.min(100, score))
}

/**
 * 检测模型风格
 */
function detectStyle(raw) {
  const cats = [...(raw.categories || []), ...(raw.tags || [])].map(c => c.toLowerCase())
  const name = (raw.name || '').toLowerCase()
  const full = [...cats, name].join(' ')

  if (full.includes('chinese') || full.includes('traditional') || full.includes('oriental') || full.includes('asian') || full.includes('vintage') || full.includes('gothic') || full.includes('victorian')) return 'traditional'
  if (full.includes('modern') || full.includes('contemporary') || full.includes('minimalist') || full.includes('scifi') || full.includes('futuristic')) return 'modern'
  if (full.includes('european') || full.includes('classic') || full.includes('baroque') || full.includes('renaissance')) return 'european'
  if (full.includes('japanese') || full.includes('wabi') || full.includes('zen') || full.includes('nature') || full.includes('organic')) return 'japanese'
  if (full.includes('industrial') || full.includes('steel') || full.includes('metal') || full.includes('concrete') || full.includes('rusty')) return 'industrial'
  return 'other'
}

/**
 * 搜索Poly Haven模型
 * 无搜索词时返回全部模型并计算质量分，有搜索词时模糊匹配
 * @param {object} params
 * @param {string} [params.q] - 搜索关键词（支持中英文同义词扩展）
 * @returns {Promise<Array>}
 */
export async function searchModels({ q = '' } = {}) {
  const url = `${BASE_URL}/assets?type=models`

  let resp
  try {
    resp = await fetch(url)
  } catch (e) {
    console.error('[PolyHaven] Network error:', e)
    return []
  }

  if (!resp.ok) {
    console.error('[PolyHaven] Search failed:', resp.status)
    return []
  }

  const data = await resp.json()

  // 同义词扩展
  const synonymMap = {
    '花瓶': 'vase',
    '花器': 'vase',
    '瓷瓶': 'vase porcelain',
    '碗': 'bowl',
    '盘子': 'plate',
    '杯': 'cup',
    '茶具': 'teapot cup',
    '茶壶': 'teapot',
    '青花瓷': 'blue porcelain ceramic',
    '汝窑': 'celadon ceramic',
    '钧瓷': 'jun ceramic',
    '家具': 'furniture chair table',
    '摆件': 'sculpture ornament statue',
    '自然': 'plant tree flower nature',
    '载具': 'vehicle car aircraft boat',
  }

  let searchTerms = (q || '').toLowerCase().trim().split(/\s+/).filter(Boolean)
  if (searchTerms.length > 0) {
    // 展开同义词
    const expanded = []
    for (const term of searchTerms) {
      expanded.push(term)
      if (synonymMap[term]) {
        expanded.push(...synonymMap[term].split(' '))
      }
    }
    searchTerms = [...new Set(expanded)]
  }
  const hasSearch = searchTerms.length > 0

  let results = []

  for (const [id, asset] of Object.entries(data)) {
    const rawPublished = asset.date_published || 0
    const year = rawPublished > 0 ? new Date(rawPublished * 1000).getFullYear() : 2021

    // 质量筛选：只显示2021年后发布的模型
    if (year < 2021) continue

    const name = (asset.name || id).toLowerCase()
    const cats = (asset.categories || []).map(c => c.toLowerCase())
    const tags = (asset.tags || []).map(t => t.toLowerCase())
    const matchText = [name, ...cats, ...tags].join(' ')

    if (hasSearch) {
      const matches = searchTerms.some(t => matchText.includes(t))
      if (!matches) continue
    }

    const model = transformPolyHavenModel(id, asset)
    model.qualityScore = computeQualityScore(model)
    results.push(model)
  }

  // 按质量分降序排列
  results.sort((a, b) => b.qualityScore - a.qualityScore)

  console.log(`[PolyHaven] Found ${results.length} quality models (${hasSearch ? 'filtered' : 'all'}, sorted by score)`)
  return results
}

/**
 * 获取模型详情（含文件信息）
 */
export async function getModelDetail(id) {
  const resp = await fetch(`${BASE_URL}/info/${id}`)
  if (!resp.ok) return null
  const data = await resp.json()
  const model = transformPolyHavenModel(id, data)
  model.qualityScore = computeQualityScore(model)
  return model
}

/**
 * 获取GLB下载URL
 */
export async function getModelDownloadUrl(id) {
  try {
    const resp = await fetch(`${BASE_URL}/files/${id}`)
    if (!resp.ok) return null
    const data = await resp.json()

    if (data.glb) {
      const resolutions = Object.keys(data.glb)
      if (resolutions.length > 0) {
        // 优先选择 1k 分辨率（适合网页），其次 2k
        const res = resolutions.find(r => r === '1k')
          || resolutions.find(r => r === '2k')
          || resolutions[0]
        const file = data.glb[res]
        if (file && file.url) return file.url
      }
    }

    return null
  } catch (e) {
    console.error('[PolyHaven] Download URL failed:', e)
    return null
  }
}

/**
 * 预检查模型是否可下载
 */
export async function isModelDownloadable(sourceId) {
  const url = await getModelDownloadUrl(sourceId)
  return url !== null
}

/**
 * 模型数据转换为统一格式
 */
function transformPolyHavenModel(id, raw) {
  // 缩略图降级链: 高清 → 中清 → CDN默认
  let thumbnail = raw.thumbnail_url || ''
  let thumbnailMedium = ''
  let thumbnailSmall = ''

  if (raw.thumbnails?.images) {
    const imgs = raw.thumbnails.images
    thumbnail = imgs.find(i => i.size === 512)?.url
      || imgs.find(i => i.size === 256)?.url
      || imgs[0]?.url
      || thumbnail
    thumbnailMedium = imgs.find(i => i.size === 256)?.url
      || imgs[0]?.url
      || thumbnail
    thumbnailSmall = imgs[0]?.url || thumbnail
  }

  const faceCount = raw.polycount || 0
  const dims = raw.dimensions || []
  const dimensions = dims.length === 3
    ? `${Math.round(dims[0])}×${Math.round(dims[1])}×${Math.round(dims[2])}mm`
    : ''

  return {
    id: 'ph_' + id,
    sourceId: id,
    source: 'polyhaven',
    name: raw.name || id.replace(/_/g, ' '),
    author: 'Poly Haven',
    authorUrl: 'https://polyhaven.com',
    thumbnail,
    thumbnailMedium,
    thumbnailSmall,
    viewUrl: `https://polyhaven.com/a/${id}`,
    license: 'CC0',
    licenseType: 'CC0',
    downloadCount: raw.download_count || 0,
    likeCount: 0,
    viewCount: 0,
    publishedAt: raw.date_published ? new Date(raw.date_published * 1000).toISOString() : '',
    faceCount,
    hasTextures: true,
    dimensions,
    category: detectCategory(raw, id),
    style: detectStyle(raw),
    tags: [...(raw.categories || []), ...(raw.tags || [])],
    description: raw.description || '',
    qualityScore: 0,
    raw: raw,
  }
}

function detectCategory(raw, id) {
  const cats = [...(raw.categories || []), ...(raw.tags || [])].map(c => c.toLowerCase())
  const name = (raw.name || id).toLowerCase()
  const full = [...cats, name].join(' ')

  if (full.includes('vase') || full.includes('花瓶') || full.includes('花器')) return 'vase'
  if (full.includes('bowl') || full.includes('碗') || full.includes('plate') || full.includes('盘')) return 'bowl'
  if (full.includes('cup') || full.includes('杯') || full.includes('mug') || full.includes('teapot') || full.includes('茶壶')) return 'cup'
  if (full.includes('figure') || full.includes('statue') || full.includes('sculpture') || full.includes('摆件')) return 'ornament'
  if (full.includes('chair') || full.includes('table') || full.includes('sofa') || full.includes('furniture') || full.includes('seating') || full.includes('bed')) return 'furniture'
  if (full.includes('plant') || full.includes('tree') || full.includes('flower') || full.includes('nature')) return 'nature'
  if (full.includes('car') || full.includes('vehicle') || full.includes('aircraft') || full.includes('boat')) return 'vehicle'
  if (full.includes('gun') || full.includes('weapon') || full.includes('sword') || full.includes('knife')) return 'weapon'
  return 'other'
}
