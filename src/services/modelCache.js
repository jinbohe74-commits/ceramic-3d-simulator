/**
 * 模型缓存服务
 * 使用 IndexedDB 缓存已下载的 GLB 模型文件
 * 支持自动清理老旧的缓存数据
 */

const DB_NAME = 'CeramicModelCache'
const DB_VERSION = 1
const STORE_NAME = 'models'
const MAX_CACHE_SIZE = 10 // 最多缓存10个模型

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/**
 * 缓存模型文件
 * @param {string} id - 模型唯一ID
 * @param {ArrayBuffer} glbData - GLB 二进制数据
 * @param {object} meta - 模型元信息
 */
export async function cacheModel(id, glbData, meta = {}) {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  const store = tx.objectStore(STORE_NAME)

  // 检查缓存数量，超出则删除最旧的
  const count = await new Promise(r => {
    const req = store.count()
    req.onsuccess = () => r(req.result)
  })

  if (count >= MAX_CACHE_SIZE) {
    const all = await new Promise(r => {
      const req = store.getAll()
      req.onsuccess = () => r(req.result)
    })
    // 删除第一个（最旧的）
    if (all.length > 0) {
      store.delete(all[0].id)
    }
  }

  return new Promise((resolve, reject) => {
    const req = store.put({
      id,
      data: glbData,
      meta,
      cachedAt: Date.now(),
    })
    req.onsuccess = () => resolve(true)
    req.onerror = () => reject(req.error)
  })
}

/**
 * 从缓存读取模型
 * @param {string} id - 模型唯一ID
 * @returns {Promise<{data: ArrayBuffer, meta: object}|null>}
 */
export async function getCachedModel(id) {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readonly')
  const store = tx.objectStore(STORE_NAME)

  return new Promise((resolve, reject) => {
    const req = store.get(id)
    req.onsuccess = () => {
      if (req.result) {
        resolve({ data: req.result.data, meta: req.result.meta })
      } else {
        resolve(null)
      }
    }
    req.onerror = () => reject(req.error)
  })
}

/**
 * 检查模型是否已缓存
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function isModelCached(id) {
  const cached = await getCachedModel(id)
  return cached !== null
}

/**
 * 删除缓存的模型
 * @param {string} id
 */
export async function removeCachedModel(id) {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  const store = tx.objectStore(STORE_NAME)
  return new Promise((resolve, reject) => {
    const req = store.delete(id)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

/**
 * 获取所有缓存模型的元信息
 * @returns {Promise<Array>}
 */
export async function getAllCachedModels() {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readonly')
  const store = tx.objectStore(STORE_NAME)
  return new Promise((resolve) => {
    const req = store.getAll()
    req.onsuccess = () => resolve(req.result.map(r => ({ id: r.id, meta: r.meta, cachedAt: r.cachedAt })))
    req.onerror = () => resolve([])
  })
}

/**
 * 获取收藏列表
 * @returns {string[]} 模型ID数组
 */
export function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem('ceramic_favorites') || '[]')
  } catch {
    return []
  }
}

/**
 * 添加收藏
 * @param {string} id
 */
export function addFavorite(id) {
  const favs = getFavorites()
  if (!favs.includes(id)) {
    favs.push(id)
    localStorage.setItem('ceramic_favorites', JSON.stringify(favs))
  }
}

/**
 * 移除收藏
 * @param {string} id
 */
export function removeFavorite(id) {
  const favs = getFavorites().filter(f => f !== id)
  localStorage.setItem('ceramic_favorites', JSON.stringify(favs))
}

/**
 * 切换收藏状态
 * @param {string} id
 * @returns {boolean} 新的收藏状态
 */
export function toggleFavorite(id) {
  const favs = getFavorites()
  if (favs.includes(id)) {
    removeFavorite(id)
    return false
  } else {
    addFavorite(id)
    return true
  }
}

/**
 * 检查是否已收藏
 * @param {string} id
 * @returns {boolean}
 */
export function isFavorite(id) {
  return getFavorites().includes(id)
}
