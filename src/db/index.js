import Dexie from 'dexie'

/**
 * 陶瓷3D模拟网站 - 本地数据库
 * 使用 Dexie.js (IndexedDB) 替代 localStorage 实现数据持久化
 */
const db = new Dexie('CeramicSimulator')

db.version(1).stores({
  users: '++id, username, password, createTime',
  works: '++id, userId, screenshot, shape, style, materialParams, attachedPatterns, createTime, name',
  patterns: '++id, userId, name, base64, createTime',
})

export default db

/** 用户相关操作 */
export const userDB = {
  /** 查找用户 by username */
  async findByUsername(username) {
    return db.users.where('username').equals(username).first()
  },
  /** 创建新用户 */
  async create(username, password) {
    const id = await db.users.add({
      username,
      password,
      createTime: new Date().toISOString(),
    })
    return { id, username }
  },
  /** 验证登录 */
  async login(username, password) {
    const user = await db.users.where('username').equals(username).first()
    if (!user) return { success: false, message: '用户不存在' }
    if (user.password !== password) return { success: false, message: '密码错误' }
    return { success: true, user: { id: user.id, username: user.username } }
  },
  /** 注册 */
  async register(username, password) {
    if (!username || !username.trim()) return { success: false, message: '请输入用户名' }
    if (!password || !password.trim()) return { success: false, message: '请输入密码' }
    if (password.length < 2) return { success: false, message: '密码至少需要2个字符' }
    const existing = await db.users.where('username').equals(username.trim()).first()
    if (existing) return { success: false, message: '用户名已存在' }
    const user = await db.users.add({
      username: username.trim(),
      password,
      createTime: new Date().toISOString(),
    })
    return { success: true, user: { id: user, username: username.trim() } }
  },
}

/** 作品相关操作 */
export const workDB = {
  /** 获取所有作品（仅调试用） */
  async getAll() {
    return db.works.toArray()
  },
  /** 获取用户所有作品，按创建时间倒序（最新在前） */
  async getByUserId(userId) {
    const works = await db.works.where('userId').equals(userId).toArray()
    return works.sort((a, b) => {
      const ta = a.createTime ? new Date(a.createTime).getTime() : 0
      const tb = b.createTime ? new Date(b.createTime).getTime() : 0
      return tb - ta  // desc: newest first
    })
  },
  /** 添加作品 */
  async add(work) {
    return db.works.add(work)
  },
  /** 删除作品 */
  async delete(id) {
    return db.works.delete(id)
  },
  /** 更新作品名称 */
  async rename(id, newName) {
    return db.works.update(id, { name: newName })
  },
  /** 获取单个作品 */
  async getById(id) {
    return db.works.get(id)
  },
}

/** 图案相关操作 */
export const patternDB = {
  /** 获取用户所有上传图案 */
  async getByUserId(userId) {
    return db.patterns.where('userId').equals(userId).toArray()
  },
  /** 获取单个图案 */
  async getById(id) {
    return db.patterns.get(id)
  },
  /** 添加上传图案 */
  async add(pattern) {
    return db.patterns.add(pattern)
  },
  /** 删除图案 */
  async delete(id) {
    return db.patterns.delete(id)
  },
  /** 获取图案总数 */
  async countByUserId(userId) {
    return db.patterns.where('userId').equals(userId).count()
  },
}
