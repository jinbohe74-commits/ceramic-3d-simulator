import { defineStore } from 'pinia'
import { userDB, workDB, patternDB } from '@/db'

/**
 * 递归安全处理任意值，移除 undefined / Symbol / Function / DOM 节点等不可克隆类型，
 * 防止 IndexedDB structured clone 报错 "could not be cloned"
 */
function sanitizeValue(val) {
  if (val === undefined || typeof val === 'symbol' || typeof val === 'function') return null
  if (val === null || typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return val
  if (val instanceof HTMLElement || val instanceof Event || val instanceof Promise) return null
  if (Array.isArray(val)) return val.map(sanitizeValue)
  if (typeof val === 'object') {
    // 拒绝非普通对象（如 Three.js 对象、Date 等）
    if (val.constructor !== Object) {
      try { return String(val) } catch { return null }
    }
    const result = {}
    for (const key of Object.keys(val)) {
      result[key] = sanitizeValue(val[key])
    }
    return result
  }
  return null
}

/** 对即将写入 IndexedDB 的作品数据进行深度安全处理，确保所有字段可克隆 */
function sanitizeWorkForDB(work) {
  return {
    userId: work.userId,
    screenshot: typeof work.screenshot === 'string' ? work.screenshot : '',
    shape: typeof work.shape === 'string' ? work.shape : '',
    style: typeof work.style === 'string' ? work.style : '',
    materialParams: sanitizeValue(work.materialParams) || {},
    attachedPatterns: sanitizeValue(work.attachedPatterns) || [],
    createTime: work.createTime || new Date().toISOString(),
    name: typeof work.name === 'string' ? work.name : '陶瓷作品',
    // 釉色数据（20260602修复：完整存档）
    outerGlazeColor: typeof work.outerGlazeColor === 'string' ? work.outerGlazeColor : null,
    innerGlazeColor: typeof work.innerGlazeColor === 'string' ? work.innerGlazeColor : null,
    glazeMode: typeof work.glazeMode === 'string' ? work.glazeMode : 'both',
    fired: !!work.fired,
    builtinModelId: typeof work.builtinModelId === 'string' ? work.builtinModelId : null,
  }
}

/** 作品数据完整性校验：至少包含 id、userId、一个核心字段 */
function isValidWork(work) {
  if (!work || typeof work !== 'object') return false
  if (!work.id || !work.userId) return false
  // 允许 shape/style 为 null（旧格式），只要有 createTime 就认为可用
  if (work.name != null || work.createTime != null) return true
  return !!(work.shape || work.style || work.materialParams)
}

export const useUserStore = defineStore('user', {
  state: () => ({
    isLoggedIn: false,
    username: '',
    userId: null,
    works: [],
    corruptedWorks: [],   // 格式损坏的作品，单独展示
  }),

  actions: {
    async loadFromLocalStorage() {
      try {
        const session = localStorage.getItem('ceramic_session')
        if (session) {
          const s = JSON.parse(session)
          if (s.isLoggedIn && s.userId && s.username) {
            // 验证用户仍在 IndexedDB 中存在
            const user = await userDB.findByUsername(s.username).catch(() => null)
            if (!user || user.id !== s.userId) {
              console.warn('[user] IndexedDB 用户记录不存在，清理过期 session')
              this.logout()
              return
            }
            this.isLoggedIn = true
            this.username = s.username
            this.userId = s.userId
            await this.loadWorks()
          }
        }
      } catch (e) {
        console.warn('[user] loadFromLocalStorage 解析失败:', e)
      }
    },

    _saveSession() {
      try {
        localStorage.setItem('ceramic_session', JSON.stringify({
          isLoggedIn: this.isLoggedIn,
          userId: this.userId,
          username: this.username,
        }))
      } catch (e) { /* */ }
    },

    async login(username, password) {
      const result = await userDB.login(username, password)
      if (result.success) {
        this.isLoggedIn = true
        this.username = result.user.username
        this.userId = result.user.id
        this._saveSession()
        await this.loadWorks()
      }
      return result
    },

    async register(username, password) {
      const result = await userDB.register(username, password)
      if (result.success) {
        this.isLoggedIn = true
        this.username = result.user.username
        this.userId = result.user.id
        this._saveSession()
        await this.loadWorks()
      }
      return result
    },

    logout() {
      this.isLoggedIn = false
      this.username = ''
      this.userId = null
      this.works = []
      this.corruptedWorks = []
      try {
        localStorage.removeItem('ceramic_session')
      } catch (e) { /* */ }
    },

    /** 从 IndexedDB 加载作品列表，自动校验并分离损坏记录 */
    async loadWorks() {
      if (!this.userId) {
        this.works = []
        this.corruptedWorks = []
        return
      }
      try {
        const all = await workDB.getByUserId(this.userId)
        console.log(`[user] loadWorks: 读取到 ${all.length} 条作品记录`)
        const valid = []
        const corrupted = []
        for (const w of all) {
          if (isValidWork(w)) {
            valid.push(w)
          } else {
            console.warn('[user] 格式损坏的作品:', { id: w.id, userId: w.userId })
            corrupted.push(w)
          }
        }
        if (corrupted.length > 0) console.warn(`[user] 过滤掉 ${corrupted.length} 条格式损坏的记录`)
        this.works = valid
        this.corruptedWorks = corrupted

        // 自动备份到 localStorage（端口切换等异常情况下的安全网）
        if (valid.length > 0) this._backupWorksToLocal(valid)
      } catch (e) {
        console.error('[user] loadWorks 失败，尝试从本地备份恢复:', e)
        this.works = this._loadWorksFromLocal()
        this.corruptedWorks = []
        if (this.works.length > 0) {
          console.log(`[user] 从本地备份恢复了 ${this.works.length} 条作品`)
          // 重新写入 IndexedDB
          for (const w of this.works) {
            try { await workDB.add(w) } catch { /* 可能重复 */ }
          }
        }
      }
    },

    /** 备份作品到 localStorage */
    _backupWorksToLocal(works) {
      try {
        const simple = works.map(w => ({
          id: w.id, userId: w.userId, name: w.name, screenshot: w.screenshot,
          shape: w.shape, style: w.style, materialParams: w.materialParams,
          attachedPatterns: w.attachedPatterns, createTime: w.createTime,
        }))
        localStorage.setItem('ceramic_works_backup', JSON.stringify(simple))
      } catch (e) { /* 静默 */ }
    },

    /** 从 localStorage 恢复作品 */
    _loadWorksFromLocal() {
      try {
        const raw = localStorage.getItem('ceramic_works_backup')
        if (raw) {
          const parsed = JSON.parse(raw)
          return Array.isArray(parsed) ? parsed.filter(isValidWork) : []
        }
      } catch (e) { /* */ }
      return []
    },

    /** 强制刷新作品列表（手动触发） */
    async refreshWorks() {
      console.log('[user] 手动刷新作品列表')
      await this.loadWorks()
    },

    /** 添加新作品（乐观更新：直接插入列表顶部） */
    async addWork(screenshot, snapshot, attachedPatterns, name) {
      if (!this.isLoggedIn || !this.userId) {
        console.warn('[user] addWork 跳过: 未登录')
        return null
      }
      // 检查作品数量上限（50）
      if (this.works.length >= 50) {
        console.warn('[user] addWork 失败: 作品数量已达上限')
        return { success: false, message: '作品数量已达上限，请删除部分旧作品' }
      }
      try {
        // 构造原始数据（含釉色等完整信息）
        const raw = {
          userId: this.userId,
          screenshot,
          shape: snapshot.shape,
          style: snapshot.style,
          materialParams: snapshot.params ? { ...snapshot.params } : {},
          attachedPatterns: attachedPatterns || snapshot.attachedPatterns || [],
          createTime: new Date().toISOString(),
          name: name || `${snapshot.shape ? '陶瓷作品' : '作品'} ${new Date().toLocaleString('zh-CN')}`,
          // 釉色数据
          outerGlazeColor: snapshot.outerGlazeColor || null,
          innerGlazeColor: snapshot.innerGlazeColor || null,
          glazeMode: snapshot.glazeMode || 'both',
          fired: snapshot.fired || false,
          builtinModelId: snapshot.builtinModelId || null,
        }
        const work = sanitizeWorkForDB(raw)
        const id = await workDB.add(work)
        console.log(`[user] addWork 成功: id=${id}`)
        // 预置到列表顶部
        work.id = id
        this.works.unshift(work)
        // 自动备份
        this._backupWorksToLocal(this.works)
        return { success: true, id }
      } catch (e) {
        console.error('[user] addWork 失败:', e)
        // 打印详细数据诊断
        console.error('[user] addWork 失败数据诊断:', {
          screenshotLen: screenshot?.length || 0,
          shape: snapshot?.shape,
          style: snapshot?.style,
          paramsKeys: snapshot?.params ? Object.keys(snapshot.params) : [],
          patternCount: (attachedPatterns || snapshot?.attachedPatterns || []).length,
          name,
        })
        return { success: false, message: e.message }
      }
    },

    /** 删除作品（乐观更新：立即从本地移除） */
    async deleteWork(id) {
      const work = this.works.find(w => w.id === id)
      // 从 works 中移除
      this.works = this.works.filter(w => w.id !== id)
      // 也从 corruptedWorks 中移除
      this.corruptedWorks = this.corruptedWorks.filter(w => w.id !== id)
      try {
        await workDB.delete(id)
        console.log(`[user] deleteWork 成功: id=${id}`)
      } catch (e) {
        console.error('[user] deleteWork 失败:', e)
        // 失败时回滚
        if (work) this.works.push(work)
        throw e
      }
    },

    /** 重命名作品（乐观更新） */
    async renameWork(id, newName) {
      const work = this.works.find(w => w.id === id)
      const oldName = work?.name
      if (work) work.name = newName
      try {
        await workDB.rename(id, newName)
      } catch (e) {
        console.error('[user] renameWork 失败:', e)
        if (work) work.name = oldName
        throw e
      }
    },

    // Pattern upload management
    async uploadPattern(name, base64) {
      if (!this.isLoggedIn || !this.userId) return null
      const count = await patternDB.countByUserId(this.userId)
      if (count >= 50) return { success: false, message: '图案库已满（最多50个）' }
      const id = await patternDB.add({
        userId: this.userId,
        name,
        base64,
        createTime: new Date().toISOString(),
      })
      return { success: true, id }
    },

    async getUserPatterns() {
      if (!this.userId) return []
      return patternDB.getByUserId(this.userId)
    },

    async deletePattern(id) {
      await patternDB.delete(id)
    },
  },
})
