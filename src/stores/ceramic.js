import { defineStore } from 'pinia'
import { builtinModels } from '@/assets/models'
import * as THREE from 'three'

/** Convert ArrayBuffer to base64 string using chunked approach (handles large data) */
function arrayBufferToBase64(buffer) {
  if (!buffer) return null
  try {
    const bytes = new Uint8Array(buffer)
    const chunks = []
    const chunkSize = 8192
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize)
      let binary = ''
      for (let j = 0; j < chunk.length; j++) {
        binary += String.fromCharCode(chunk[j])
      }
      chunks.push(binary)
    }
    return btoa(chunks.join(''))
  } catch (e) {
    console.warn('[ceramic] base64 encode failed, trying alternative', e)
    // Fallback: use hex encoding for very large buffers
    const bytes = new Uint8Array(buffer)
    const hex = []
    for (let i = 0; i < Math.min(bytes.length, 100000); i++) {
      hex.push(bytes[i].toString(16).padStart(2, '0'))
    }
    return 'hex:' + hex.join('')
  }
}

/** Convert base64 string back to ArrayBuffer */
function base64ToArrayBuffer(base64) {
  if (!base64) return null
  try {
    if (typeof base64 === 'string' && base64.startsWith('hex:')) {
      // Fallback hex decode
      const hex = base64.slice(4)
      const bytes = new Uint8Array(hex.length / 2)
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
      }
      return bytes.buffer
    }
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i) & 0xFF
    }
    return bytes.buffer
  } catch (e) {
    console.warn('[ceramic] base64 decode failed', e)
    return null
  }
}

export const useCeramicStore = defineStore('ceramic', {
  state: () => ({
    currentStyle: 'qinghua',     // qinghua | fencai | jun | bai
    currentShape: 'meiping',     // meiping | yuhuchun | shangping | wanzhan
    metalness: 0.1,
    roughness: 0.22,
    opacity: 0.95,
    brightness: 0.5,
    lightingEnabled: true,
    gridVisible: false,
    autoRotate: false,
    autoRotateSpeed: 0.003,
    patternText: '',
    patternOpacity: 0,
    rotationDirection: 1,         // 1 = 顺时针, -1 = 逆时针
    attachedPatterns: [],         // { id, textureDataUrl, scale, rotation, opacity, position, uv, surfaceType, source?, sourceId?, width?, height? }
    pendingPatternTexture: null,  // 等待点击陶瓷表面放置的图案纹理 dataUrl
    pendingPatternSource: 'direct', // 待放置图案的来源类型: 'builtin' | 'upload' | 'direct'
    pendingPatternSourceId: null,   // 待放置图案在来源系统中的 ID（如内置花纹的 'lian'，或 upload 的 patternDB id）
    patternScale: 0.3,
    patternRotation: 0,
    patternAttachOpacity: 1,
    restoreLoading: false,        // 正在执行作品复原（UI可据此显示加载状态）
    selectedPatternId: null,       // 当前在3D视图中选中的图案ID
    // ── 内外表面完全独立隔离（20260601）──
    activePlacementSurface: 'outer', // 当前贴附模式：'outer' | 'inner'（新图案贴附到哪个表面）
    selectedOuterPatternId: null,    // 外表面选中图案ID
    selectedInnerPatternId: null,    // 内表面选中图案ID
    // ── 一键上釉色（20260602）──
    glazeMode: 'both',              // 'both' | 'outer-only' | 'inner-only'
    outerGlazeColor: null,          // 外表面釉色 hex（null=无釉色/使用样式默认）
    innerGlazeColor: null,          // 内表面釉色 hex
    // ── 在线模型库下载模型（20260602）──
    importedModel: null,            // { id, name, author, source, sourceId, glbUrl, glbData, license }
    downloadedModels: [],           // 已下载的模型信息列表
    currentShapeIsImported: false,  // 当前器型是否为导入模型
    // ── 我构建的模型（20260607）──
    builtModels: [],                // { id, name, glbData, thumbnail, createdAt }
    currentShapeIsBuilt: false,     // 当前器型是否为构建模型
    // ── 内置精品模型（20260602终极版）──
    builtinModel: null,             // { id, name, category, style, glaze, shape, profile }
    builtinModelProfile: null,      // LatheGeometry profile points for current builtin model
    _pendingBuiltin: false,         // Flag set when builtin model needs loading on next mount
    _fired: false,                  // 窑变烧制标记（20260602）
  }),

  getters: {
    shapeLabel: (state) => {
      const labels = { meiping: '梅瓶', yuhuchun: '玉壶春瓶', shangping: '赏瓶', wanzhan: '碗盏', chabei: '茶杯', hulu: '葫芦瓶', danping: '胆瓶', congshi: '琮式瓶', jiangjun: '将军罐', bitong: '笔筒', panzi: '盘子', '__imported__': '导入模型' }
      return labels[state.currentShape] || state.currentShape
    },
    styleLabel: (state) => {
      const labels = { qinghua: '青花瓷', fencai: '粉彩瓷', jun: '钧瓷', bai: '素面白瓷', ruci: '汝瓷', geci: '哥瓷' }
      return labels[state.currentStyle] || state.currentStyle
    },
    // ── 内外表面独立图案列表（零共享、零耦合）──
    outerPatterns: (state) => state.attachedPatterns.filter(p => p.surfaceType === 'outer'),
    innerPatterns: (state) => state.attachedPatterns.filter(p => p.surfaceType === 'inner'),
    // 当前有效选中（取决于活跃表面或最后选中的图案）
    effectiveSelectedPatternId: (state) => {
      return state.selectedOuterPatternId || state.selectedInnerPatternId || state.selectedPatternId
    },
  },

  actions: {
    setStyle(style) {
      if (this.currentStyle === style) return
      this.currentStyle = style
    },
    setShape(shape) {
      if (this.currentShape === shape) return
      this.currentShape = shape
    },
    setMetalness(val) { this.metalness = val },
    setRoughness(val) { this.roughness = val },
    setOpacity(val) { this.opacity = val },
    setBrightness(val) { this.brightness = val },
    setLightingEnabled(val) { this.lightingEnabled = val },
    setGridVisible(val) { this.gridVisible = val },
    setAutoRotate(val) { this.autoRotate = val },
    setAutoRotateSpeed(val) { this.autoRotateSpeed = val },
    setPatternText(text) { this.patternText = text },
    setPatternOpacity(val) { this.patternOpacity = val },
    setRotationDirection(dir) { this.rotationDirection = dir },

    // Pattern management
    setRestoreLoading(val) { this.restoreLoading = val },

    setPatternScale(val) { this.patternScale = val },
    setPatternRotation(val) { this.patternRotation = val },
    setPatternAttachOpacity(val) { this.patternAttachOpacity = val },

    // 设置待放置图案纹理及来源信息
    setPendingPattern(textureDataUrl, source, sourceId) {
      this.pendingPatternTexture = textureDataUrl
      this.pendingPatternSource = source || 'direct'
      this.pendingPatternSourceId = sourceId !== undefined ? sourceId : null
    },
    clearPendingPattern() {
      this.pendingPatternTexture = null
      this.pendingPatternSource = 'direct'
      this.pendingPatternSourceId = null
    },

    /**
     * 校验图案数据完整性
     * 缺失任何必需字段的图案将被过滤并输出警告
     * @param {object} entry - 待校验的图案条目
     * @returns {boolean}
     */
    validatePatternEntry(entry) {
      const required = ['id', 'textureDataUrl', 'scale', 'rotation', 'opacity', 'surfaceType']
      for (const key of required) {
        if (entry[key] === undefined || entry[key] === null) {
          console.warn(`[ceramic] 图案 ${entry.id} 缺少必需字段: ${key}`)
          return false
        }
      }
      return true
    },

    /**
     * 贴附一个图案到陶瓷表面
     * 调用前必须先确保 textureDataUrl 对应的图片已加载完成并缓存
     * @param {string} textureDataUrl - 图案纹理的 dataUrl（可直接用于 Image）
     * @param {object} position - 世界坐标 {x,y,z}
     * @param {object} uv - UV 坐标 {u,v}
     * @param {string} source - 来源类型: 'builtin' | 'upload' | 'direct'
     * @param {string|number} sourceId - 在来源系统中的 ID
     * @param {string} surfaceType - 'outer' | 'inner'
     * @returns {string|null} 图案ID（失败返回null）
     */
    /**
     * 贴附一个图案到陶瓷表面（20260601 强制表面锁定版）
     * surfaceType 一旦绑定即永久锁定，不可变更
     * 若未指定 surfaceType，使用当前 activePlacementSurface
     */
    attachPattern(textureDataUrl, position, uv, source, sourceId, surfaceType) {
      // 限制每个表面最多10个图案，总计20个（避免GPU过载）
      const outerCount = this.attachedPatterns.filter(p => p.surfaceType === 'outer').length
      const innerCount = this.attachedPatterns.filter(p => p.surfaceType === 'inner').length
      const finalSurface = surfaceType || this.activePlacementSurface || 'outer'
      if (finalSurface === 'outer' && outerCount >= 10) {
        console.warn('[ceramic] 外表面图案数量已达上限(10)')
        return null
      }
      if (finalSurface === 'inner' && innerCount >= 10) {
        console.warn('[ceramic] 内表面图案数量已达上限(10)')
        return null
      }
      const id = 'pat_' + Date.now()
      const entry = {
        id,
        textureDataUrl: textureDataUrl || '',
        scale: this.patternScale,
        rotation: this.patternRotation,
        opacity: this.patternAttachOpacity,
        position: position || { x: 0, y: 0, z: 0 },
        uv: uv || null,
        surfaceType: finalSurface,       // 永久锁定，不可变更
        _surfaceLocked: true,            // 表面锁定标记
      }
      // 保存来源信息，用于复原时分类查找纹理
      if (source && source !== 'direct') {
        entry.source = source
        entry.sourceId = sourceId !== undefined ? sourceId : null
      }
      // 校验完整性，缺失字段则自动补全默认值
      if (!this.validatePatternEntry(entry)) {
        if (!entry.scale) entry.scale = 0.3
        if (!entry.rotation) entry.rotation = 0
        if (!entry.opacity && entry.opacity !== 0) entry.opacity = 1.0
        if (!entry.surfaceType) entry.surfaceType = 'outer'
        entry._surfaceLocked = true
      }
      this.attachedPatterns.push(entry)
      return id
    },

    // ── 内外表面完全独立隔离（20260601）──
    // 图案surfaceType一旦绑定即永久锁定，禁止切换
    // 此方法已废弃 — 调用无效，图案表面不可变更
    togglePatternSurface(id) {
      console.warn('[ceramic] togglePatternSurface 已禁用：图案表面类型一旦绑定永久锁定，不可变更')
      return
    },

    /** 设置当前贴附模式（新图案将贴附到指定表面） */
    setActivePlacementSurface(surface) {
      if (surface === 'outer' || surface === 'inner') {
        this.activePlacementSurface = surface
      }
    },

    /** 选中外表面图案（同时取消内表面选中） */
    selectOuterPattern(id) {
      this.selectedOuterPatternId = id
      this.selectedInnerPatternId = null
      this.selectedPatternId = id
    },

    /** 选中内表面图案（同时取消外表面选中） */
    selectInnerPattern(id) {
      this.selectedInnerPatternId = id
      this.selectedOuterPatternId = null
      this.selectedPatternId = id
    },

    /** 清除所有选中 */
    clearAllSelections() {
      this.selectedPatternId = null
      this.selectedOuterPatternId = null
      this.selectedInnerPatternId = null
    },

    // ── 一键上釉色（20260602）──
    /** 设置上釉模式 */
    setGlazeMode(mode) {
      if (['both', 'outer-only', 'inner-only'].includes(mode)) {
        this.glazeMode = mode
      }
    },
    /** 应用釉色：根据模式自动设置外/内釉色 */
    applyGlazeColor(hexColor) {
      switch (this.glazeMode) {
        case 'both':
          this.outerGlazeColor = hexColor
          this.innerGlazeColor = hexColor
          break
        case 'outer-only':
          this.outerGlazeColor = hexColor
          break
        case 'inner-only':
          this.innerGlazeColor = hexColor
          break
      }
    },
    /** 清除所有釉色（恢复样式默认） */
    clearGlaze() {
      this.outerGlazeColor = null
      this.innerGlazeColor = null
    },

    // ── 在线模型库导入模型（20260602）──
    /** 设置从在线模型库导入的模型 */
    setImportedModel(modelInfo) {
      this.importedModel = modelInfo
      this.currentShapeIsImported = true
      this.builtinModel = null
      this.builtinModelProfile = null
      this.currentShape = '__imported__'
      const exists = this.downloadedModels.find(m => m.id === modelInfo.id)
      if (!exists) {
        this.downloadedModels.push({
          id: modelInfo.id, name: modelInfo.name, author: modelInfo.author,
          source: modelInfo.source, sourceId: modelInfo.sourceId,
          glbUrl: modelInfo.glbUrl, license: modelInfo.license,
          downloadedAt: new Date().toISOString(),
        })
        this._saveDownloadedModels()
      }
    },

    /** 设置内置精品模型（0.1秒即时加载） */
    setBuiltinModel(modelInfo) {
      this.builtinModel = modelInfo
      this.builtinModelProfile = modelInfo.profile || null
      this.importedModel = null
      this.currentShapeIsImported = false
      this._pendingBuiltin = true

      if (modelInfo.style) this.currentStyle = modelInfo.style
      if (modelInfo.glaze) {
        this.outerGlazeColor = modelInfo.glaze
        this.innerGlazeColor = modelInfo.glaze
      }

      this.currentShape = '__builtin__'

      // Also save to downloadedModels so it appears in "我的下载"
      const exists = this.downloadedModels.find(m => m.id === modelInfo.id)
      if (!exists) {
        this.downloadedModels.push({
          id: modelInfo.id, name: modelInfo.name, author: '内置精品',
          source: 'builtin', sourceId: modelInfo.id,
          style: modelInfo.style, glaze: modelInfo.glaze,
          profile: modelInfo.profile,
          downloadedAt: new Date().toISOString(),
        })
        this._saveDownloadedModels()
      }
    },

    /** Check and consume pending built-in model flag */
    consumePendingBuiltin() {
      if (this._pendingBuiltin) {
        this._pendingBuiltin = false
        return true
      }
      return false
    },

    /** Queue companion patterns for auto-placement (processed by Ceramic3D) */
    autoPatternQueue: [],
    queueAutoPatterns(patterns) {
      this.autoPatternQueue = [...patterns]
    },
    consumeAutoPatterns() {
      const q = [...this.autoPatternQueue]
      this.autoPatternQueue = []
      return q
    },

    /** 删除下载的模型 */
    removeDownloadedModel(modelId) {
      this.downloadedModels = this.downloadedModels.filter(m => m.id !== modelId)
      if (this.importedModel && this.importedModel.id === modelId) {
        this.importedModel = null
        this.currentShapeIsImported = false
        this.currentShape = 'meiping' // fallback
      }
      if (this.builtinModel && this.builtinModel.id === modelId) {
        this.builtinModel = null
        this.builtinModelProfile = null
        this.currentShape = 'meiping'
      }
      this._saveDownloadedModels()
    },

    /** 从下载列表中选择模型 */
    async selectDownloadedModel(modelId) {
      const model = this.downloadedModels.find(m => m.id === modelId)
      if (!model) return

      if (model.source === 'builtin' || (!model.glbUrl && model.id)) {
        // 内置模型：从模型库查找 profile
        try {
          // builtinModels already imported statically
          const match = builtinModels.find(m => m.id === model.id)
          if (match && match.profile) {
            this.setBuiltinModel({
              id: match.id, name: match.name,
              style: match.style, glaze: match.glaze,
              profile: match.profile,
            })
            return
          }
        } catch (e) { console.warn('[store] 查找内置模型失败', e) }
        // 回退
        this.currentShape = 'meiping'
        return
      }

      // GLB导入模型
      if (model.glbUrl) {
        this.importedModel = model
        this.currentShapeIsImported = true
        this.currentShape = '__imported__'
      }
    },

    /** 恢复使用内置器型 */
    useBuiltinShape(shape) {
      this.currentShapeIsImported = false
      this.importedModel = null
      this.builtinModel = null
      this.builtinModelProfile = null
      this.currentShape = shape
    },

    /** 持久化下载模型列表 */
    _saveDownloadedModels() {
      try {
        const data = this.downloadedModels.map(m => ({
          id: m.id, name: m.name, author: m.author,
          source: m.source, sourceId: m.sourceId,
          glbUrl: m.glbUrl || null, license: m.license,
          style: m.style || null, glaze: m.glaze || null,
          downloadedAt: m.downloadedAt,
          // Note: profile (THREE.Vector2[]) not JSON-serializable, looked up at runtime
        }))
        localStorage.setItem('ceramic_downloaded_models', JSON.stringify(data))
      } catch (e) { /* 静默 */ }
    },

    /** 从 localStorage 加载下载模型列表 */
    loadDownloadedModels() {
      try {
        const raw = localStorage.getItem('ceramic_downloaded_models')
        if (raw) {
          this.downloadedModels = JSON.parse(raw)
        }
      } catch (e) {
        this.downloadedModels = []
      }
      // Also load built models
      this.loadBuiltModels()
    },

    // ── 我构建的模型（20260607）──
    /** Add a model built in the ModelBuilder — profile-based, no GLB storage needed */
    addBuiltModel(modelInfo) {
      const serializedProfile = modelInfo.profile
        ? modelInfo.profile.map(p => ({ x: p.x ?? p[0] ?? 0, y: p.y ?? p[1] ?? 0 }))
        : null

      if (!serializedProfile || serializedProfile.length === 0) {
        console.warn('[ceramic] Cannot save built model without profile')
        return false
      }

      const existingIdx = this.builtModels.findIndex(m => m.id === modelInfo.id)
      const entry = {
        id: modelInfo.id,
        name: modelInfo.name || '自定义构建模型',
        profile: serializedProfile,
        thumbnail: modelInfo.thumbnail || null,
        author: modelInfo.author || '陶瓷快速塑形',
        createdAt: modelInfo.createdAt || new Date().toISOString(),
      }

      if (existingIdx >= 0) {
        this.builtModels[existingIdx] = entry
      } else {
        if (this.builtModels.length >= 50) this.builtModels.shift()
        this.builtModels.push(entry)
      }
      this._saveBuiltModels()
      return true
    },

    /** Remove a built model */
    removeBuiltModel(modelId) {
      this.builtModels = this.builtModels.filter(m => m.id !== modelId)
      if (this.importedModel && this.importedModel.id === modelId) {
        this.importedModel = null
        this.currentShapeIsImported = false
        this.currentShapeIsBuilt = false
        if (this.currentShape === '__imported__') {
          this.currentShape = 'meiping'
        }
      }
      this._saveBuiltModels()
    },

    /** Select a built model for viewing in the main editor */
    selectBuiltModel(modelId) {
      const model = this.builtModels.find(m => m.id === modelId)
      if (!model) return false

      // Use profile-based path if available (supports patterns, glazes, materials)
      if (model.profile && model.profile.length > 0) {
        const profilePoints = model.profile.map(p => new THREE.Vector2(p.x, p.y))
        // IMPORTANT: Do NOT set importedModel — that would trigger buildImportedCeramic()
        // which replaces the proper ceramic. Use only the profile/builtin path.
        this.importedModel = null
        this.builtinModel = { id: model.id, name: model.name }
        this.builtinModelProfile = profilePoints
        this.currentShapeIsImported = false
        this.currentShapeIsBuilt = true
        this.currentShape = '__builtin__'
        return true
      }

      // Fallback: use GLB import path (no profile available)
      if (!model.glbData) return false
      this.importedModel = {
        id: model.id, name: model.name,
        author: model.author || '陶瓷快速塑形',
        source: 'built', sourceId: model.id,
        glbData: model.glbData, license: 'CC0',
      }
      this.builtinModel = null
      this.builtinModelProfile = null
      this.currentShapeIsImported = true
      this.currentShapeIsBuilt = true
      this.currentShape = '__imported__'
      return true
    },

    /** Persist built models to localStorage (glbData stored as ArrayBuffer → base64) */
    _saveBuiltModels() {
      try {
        const data = this.builtModels.map(m => ({
          id: m.id, name: m.name, author: m.author,
          profile: m.profile || null,
          thumbnail: m.thumbnail, createdAt: m.createdAt,
        }))
        localStorage.setItem('ceramic_built_models', JSON.stringify(data))
      } catch (e) { console.warn('[ceramic] Failed to save built models', e) }
    },

    /** Load built models from localStorage */
    loadBuiltModels() {
      try {
        const raw = localStorage.getItem('ceramic_built_models')
        if (raw) {
          const data = JSON.parse(raw)
          this.builtModels = data.map(m => ({
            ...m,
            profile: m.profile || null,
          }))
        }
      } catch (e) {
        this.builtModels = []
      }
    },

    updateAttachedPattern(id, updates) {
      const idx = this.attachedPatterns.findIndex(p => p.id === id)
      if (idx === -1) return
      // ── 表面锁定守卫：禁止修改已绑定图案的 surfaceType ──
      if (updates.surfaceType && this.attachedPatterns[idx]._surfaceLocked) {
        if (updates.surfaceType !== this.attachedPatterns[idx].surfaceType) {
          console.warn(`[ceramic] 图案 ${id} 表面类型已锁定为 ${this.attachedPatterns[idx].surfaceType}，禁止切换为 ${updates.surfaceType}`)
          delete updates.surfaceType  // 移除禁止的字段
        }
      }
      Object.assign(this.attachedPatterns[idx], updates)
    },

    removeAttachedPattern(id) {
      this.attachedPatterns = this.attachedPatterns.filter(p => p.id !== id)
      // 清除相关选中状态
      if (this.selectedPatternId === id) this.selectedPatternId = null
      if (this.selectedOuterPatternId === id) this.selectedOuterPatternId = null
      if (this.selectedInnerPatternId === id) this.selectedInnerPatternId = null
    },

    clearAttachedPatterns() {
      this.attachedPatterns = []
      this.clearAllSelections()
    },

    /** Snapshot UV version — bumped when UV layout changes */
    SNAPSHOT_UV_VERSION: 1,

    /** Return a plain object snapshot for saving to history */
    getSnapshot() {
      return {
        uvVersion: this.SNAPSHOT_UV_VERSION,
        shape: this.currentShape,
        style: this.currentStyle,
        // ── 釉色数据（20260602修复：存档时完整记录内外釉色）──
        outerGlazeColor: this.outerGlazeColor,
        innerGlazeColor: this.innerGlazeColor,
        glazeMode: this.glazeMode,
        params: {
          metalness: this.metalness,
          roughness: this.roughness,
          opacity: this.opacity,
          brightness: this.brightness,
          patternOpacity: this.patternOpacity,
          patternText: this.patternText,
        },
        // ── 窑变/开片效果标记（20260602）──
        fired: this._fired || false,
        attachedPatterns: [...this.attachedPatterns],
        // ── 内置模型数据（复原内置模型用）──
        builtinModelId: this.builtinModel?.id || null,
        builtinModelProfile: this.builtinModelProfile ? true : null, // 仅标记，不序列化THREE对象
      }
    },

    /** Restore state from a snapshot (e.g. a saved work) */
    async restoreFromSnapshot(snapshot) {
      const mugShapes = ['mug_cafe','mug_wide','mug_vintage','mug_stout','mug_slim','mug_thick']
      let shape = snapshot.shape || 'meiping'

      console.log('[restore] 开始恢复, 原始shape:', shape, 'builtinModelId:', snapshot.builtinModelId)

      if (shape === '__builtin__' || shape === '__imported__') {
        if (snapshot.builtinModelId) {
          shape = '__builtin__'
          const match = builtinModels.find(m => m.id === snapshot.builtinModelId)
          console.log('[restore] 查找模型:', snapshot.builtinModelId, '结果:', !!match)
          if (match && match.profile) {
            this.builtinModelProfile = match.profile
            this.builtinModel = match
            console.log('[restore] 已恢复内置模型 profile:', match.name)
          } else {
            console.warn('[restore] 未找到模型, 回退meiping')
            shape = 'meiping'
          }
        } else {
          console.warn('[restore] __builtin__形状但无builtinModelId, 回退meiping')
          shape = 'meiping'
        }
      }
      if (mugShapes.includes(shape)) { shape = 'chabei' }
      this.currentShape = shape
      this.currentStyle = snapshot.style || 'qinghua'

      // ── 釉色数据优先还原 ──
      this.outerGlazeColor = snapshot.outerGlazeColor ?? null
      this.innerGlazeColor = snapshot.innerGlazeColor ?? null
      this.glazeMode = snapshot.glazeMode || 'both'
      this._fired = snapshot.fired || false

      this.metalness = snapshot.params?.metalness ?? 0.1
      this.roughness = snapshot.params?.roughness ?? 0.22
      this.opacity = snapshot.params?.opacity ?? 0.95
      this.brightness = snapshot.params?.brightness ?? 0.5
      this.patternOpacity = snapshot.params?.patternOpacity ?? 0
      this.patternText = snapshot.params?.patternText || ''
      this.attachedPatterns = snapshot.attachedPatterns || []

      // 只清除与当前形状无关的模型引用
      if (this.currentShape !== '__builtin__') {
        this.builtinModel = null
        this.builtinModelProfile = null
      }
      if (this.currentShape !== '__imported__') {
        this.importedModel = null
        this.currentShapeIsImported = false
      }

      console.log('[restore] 作品数据已还原:', {
        shape: this.currentShape, style: this.currentStyle,
        outerGlaze: this.outerGlazeColor, innerGlaze: this.innerGlazeColor,
        patterns: this.attachedPatterns.length,
        metalness: this.metalness, roughness: this.roughness,
      })
    },
  },
})
