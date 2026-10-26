<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { builtinModels, categoryTabs, styleFilters, hotKeywords, generateThumbnail, matchWareFilter } from '@/assets/models'
import { builtinPatterns, getPatternDataUrl } from '@/assets/patterns'
import { useCeramicStore } from '@/stores/ceramic'
import { getFavorites, toggleFavorite, isFavorite } from '@/services/modelCache'
import { ElMessage, ElMessageBox } from 'element-plus'
import ModelPreview from '@/components/ModelPreview.vue'

const router = useRouter()
const ceramicStore = useCeramicStore()

// ── State ──
const searchQuery = ref('')
const activeCategory = ref('all')
const activeStyle = ref('all')
const sortBy = ref('default')
const showFavoritesOnly = ref(false)
const page = ref(1)
const perPage = 25

// Preview
const previewVisible = ref(false)
const previewModel = ref(null)

// Recent usage
const recentModelIds = ref([])
onMounted(() => {
  try { recentModelIds.value = JSON.parse(localStorage.getItem('ceramic_recent_models') || '[]') } catch { recentModelIds.value = [] }
})

// ── Thumbnail cache ──
const thumbnailCache = {}
function getModelThumb(model) {
  if (!thumbnailCache[model.id]) {
    try {
      thumbnailCache[model.id] = generateThumbnail(model)
    } catch {
      thumbnailCache[model.id] = ''
    }
  }
  return thumbnailCache[model.id]
}

// ── Computed: all models with metadata ──
const allModels = computed(() => {
  return builtinModels.map(m => ({
    id: m.id,
    name: m.name,
    dynasty: m.dynasty || '',
    ware: m.ware || '',
    category: m.category,
    tags: m.tags || [],
    shape: m.shape,
    style: m.style,
    glaze: m.glaze,
    profile: m.profile,
    patterns: m.patterns || [],
    thumbnail: getModelThumb(m),
    author: '内置精品',
    source: 'builtin',
    licenseType: 'CC0',
    downloadCount: 0,
    likeCount: 0,
    faceCount: 8000,
    qualityScore: m.category === 'traditional' ? 95 : m.category === 'japanese' ? 90 : 88,
    description: m.name,
    viewUrl: '',
  }))
})

// ── Filtered ──
const filteredModels = computed(() => {
  let models = allModels.value

  if (activeCategory.value !== 'all') {
    models = models.filter(m => m.category === activeCategory.value)
  }
  if (activeStyle.value !== 'all') {
    models = models.filter(m => matchWareFilter(m, activeStyle.value))
  }
  if (showFavoritesOnly.value) {
    const favs = getFavorites()
    models = models.filter(m => favs.includes(m.id))
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase()
    models = models.filter(m =>
      m.name.toLowerCase().includes(q) ||
      (m.dynasty || '').toLowerCase().includes(q) ||
      (m.ware || '').toLowerCase().includes(q) ||
      (m.tags || []).some(t => t.toLowerCase().includes(q))
    )
  }

  if (sortBy.value === 'newest') {
    models = [...models].reverse()
  }

  return models
})

const paginatedModels = computed(() => filteredModels.value.slice(0, page.value * perPage))
const totalPages = computed(() => Math.max(1, Math.ceil(filteredModels.value.length / perPage)))
const hasModels = computed(() => allModels.value.length > 0)
const showEmpty = computed(() => !hasModels.value || filteredModels.value.length === 0)

// ── Recent models ──
const recentModels = computed(() => {
  return recentModelIds.value
    .map(id => allModels.value.find(m => m.id === id))
    .filter(Boolean)
    .slice(0, 10)
})
const showRecent = computed(() =>
  recentModels.value.length > 0 && !searchQuery.value &&
  activeCategory.value === 'all' && activeStyle.value === 'all' && !showFavoritesOnly.value
)

// ── Pattern companion state ──
const patternPopupModel = ref(null)  // which model's patterns are being shown

/** Get pattern data for display */
function getPatternById(patternId) {
  return builtinPatterns.find(p => p.id === patternId) || null
}
function getPatternThumb(patternId) {
  const p = getPatternById(patternId)
  return p ? getPatternDataUrl(p) : ''
}
function getPatternName(patternId) {
  const p = getPatternById(patternId)
  return p ? p.name : patternId
}
function showPatternPopup(model) { patternPopupModel.value = model }
function closePatternPopup() { patternPopupModel.value = null }

/** 一键全器自动铺贴：先加载模型，再自动贴满配套纹样 */
async function autoApplyAllPatterns(model) {
  if (!model || !model.patterns || !model.patterns.length) return

  // 1. Load model into editor
  handleUseModel(model)
  closePatternPopup()

  // 2. Collect pattern dataUrls
  const patternQueue = []
  for (const pid of model.patterns) {
    const p = getPatternById(pid)
    if (!p) continue
    const dataUrl = getPatternDataUrl(p)
    if (dataUrl) {
      patternQueue.push({ id: pid, dataUrl, source: 'builtin', sourceId: pid })
    }
  }

  if (!patternQueue.length) {
    ElMessage.warning('未找到可用配套纹样')
    return
  }

  // 3. Queue patterns for Ceramic3D to process after mount
  ceramicStore.queueAutoPatterns(patternQueue)
  ElMessage.success(`正在自动铺贴 ${patternQueue.length} 款配套纹样，请稍候...`)
}

/** Apply a companion pattern to the current model in editor */
function applyPatternToModel(patternId) {
  const p = getPatternById(patternId)
  if (!p) return
  const dataUrl = getPatternDataUrl(p)
  if (dataUrl) {
    ceramicStore.setPendingPattern(dataUrl, 'builtin', patternId)
    ElMessage.success('花纹 "' + getPatternName(patternId) + '" 已就绪，点击陶瓷表面贴附')
  }
}

/** Get companion patterns for a model */
function getModelPatterns(model) {
  return (model.patterns || []).map(id => getPatternById(id)).filter(Boolean)
}

// ── Favorite helpers ──
function isFav(id) { return isFavorite(id) }
function toggleFav(id) { toggleFavorite(id) }

// ── Actions ──
function searchHotKeyword(kw) { searchQuery.value = kw; page.value = 1 }
function goBack() { router.push('/') }
function goToPage(p) { page.value = Math.max(1, Math.min(p, totalPages.value)) }

function onScroll(event) {
  const el = event.target
  if (!el) return
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 300) {
    if (page.value * perPage < filteredModels.value.length) page.value++
  }
}

function handlePreview(model) {
  previewModel.value = model
  previewVisible.value = true
}

function handleUseModel(model) {
  if (!model) return

  // Record in recent
  recentModelIds.value = [model.id, ...recentModelIds.value.filter(id => id !== model.id)].slice(0, 10)
  try { localStorage.setItem('ceramic_recent_models', JSON.stringify(recentModelIds.value)) } catch {}

  // Set in store → 0.1s instant load
  ceramicStore.setBuiltinModel({
    id: model.id,
    name: model.name,
    category: model.category,
    style: model.style,
    glaze: model.glaze,
    shape: model.shape,
    profile: model.profile,
  })

  router.push('/')
  ElMessage.success('模型 "' + model.name + '" 已加载到创作界面')
}

function handleFavoriteToggled() { /* trigger re-render */ }

/** Local file import */
async function handleLocalImport(event) {
  const file = event.target.files[0]
  event.target.value = ''
  if (!file) return

  if (file.size > 50 * 1024 * 1024) { ElMessage.warning('文件不能超过50MB'); return }
  const ext = file.name.split('.').pop().toLowerCase()
  if (!['glb', 'gltf'].includes(ext)) { ElMessage.warning('仅支持 GLB / GLTF 格式'); return }

  ElMessage.info('正在导入本地模型...')
  try {
    const buffer = await file.arrayBuffer()
    const blob = new Blob([buffer], { type: 'model/gltf-binary' })
    const blobUrl = URL.createObjectURL(blob)
    ceramicStore.setImportedModel({
      id: 'local_' + Date.now(),
      name: file.name.replace(/\.(glb|gltf)$/i, ''),
      author: '本地导入',
      source: 'local',
      sourceId: file.name,
      glbUrl: blobUrl,
      glbData: buffer,
      license: 'CC0',
    })
    router.push('/')
    ElMessage.success('本地模型 "' + file.name + '" 已导入')
  } catch (err) {
    console.error('[ModelLibrary] Local import failed:', err)
    ElMessage.error('导入失败: ' + (err.message || '未知错误'))
  }
}
</script>

<template>
  <div class="library-page" @scroll="onScroll">
    <!-- Header -->
    <div class="library-header">
      <div class="header-left">
        <button class="back-btn" @click="goBack">← 返回创作</button>
        <h1 class="page-title">精品陶瓷模型库</h1>
        <span class="model-count">({{ filteredModels.length }} 款精品 · 即时加载)</span>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="library-toolbar">
      <div class="search-box">
        <input v-model="searchQuery" type="text" class="search-input" placeholder="搜索模型名称、风格、材质..." @input="page=1" />
        <span class="search-icon">🔍</span>
      </div>
      <div class="filter-group">
        <select v-model="sortBy" class="filter-select" @change="page=1">
          <option value="default">默认排序</option>
          <option value="newest">最新在前</option>
        </select>
        <button class="filter-btn" :class="{ active: showFavoritesOnly }" @click="showFavoritesOnly=!showFavoritesOnly; page=1">
          {{ showFavoritesOnly ? '❤️ 我的收藏' : '🤍 我的收藏' }}
        </button>
      </div>
    </div>

    <!-- Hot keywords -->
    <div class="hot-keywords">
      <span class="hot-label">🔥 热门搜索：</span>
      <button v-for="kw in hotKeywords" :key="kw" class="hot-kw-btn" @click="searchHotKeyword(kw)">{{ kw }}</button>
    </div>

    <!-- Category tabs -->
    <div class="category-tabs">
      <button v-for="cat in categoryTabs" :key="cat.id" class="cat-btn"
        :class="{ active: activeCategory === cat.id }"
        @click="activeCategory=cat.id; page=1">
        {{ cat.icon }} {{ cat.name }}
      </button>
    </div>

    <!-- Style filter -->
    <div class="style-tabs">
      <span class="style-label">风格：</span>
      <button v-for="s in styleFilters" :key="s.id" class="style-btn"
        :class="{ active: activeStyle === s.id }"
        @click="activeStyle=s.id; page=1">{{ s.name }}</button>
    </div>

    <!-- ============ CONTENT AREA ============ -->

    <!-- Loading state -->
    <div v-if="!hasModels" class="loading-state">
      <div class="loading-spinner"></div>
      <span>正在加载精品模型库...</span>
    </div>

    <!-- Empty state -->
    <div v-else-if="showEmpty" class="empty-state">
      <span class="empty-icon">🔍</span>
      <span class="empty-text">{{ showFavoritesOnly ? '暂无收藏的模型' : '未找到匹配的模型' }}</span>
      <span class="empty-hint">尝试更换搜索关键词或筛选条件</span>
    </div>

    <!-- Models -->
    <template v-else>
      <!-- Recent models -->
      <div v-if="showRecent" class="recent-section">
        <div class="section-title">🕐 最近使用</div>
        <div class="model-grid">
          <div v-for="model in recentModels" :key="'r-'+model.id" class="model-card">
            <div class="card-image" @click="handlePreview(model)">
              <img :src="model.thumbnail" :alt="model.name" class="model-thumb" />
              <div class="image-overlay"><span class="overlay-text">点击预览</span></div>
              <div class="quality-dot" :class="'q-' + model.category"></div>
            </div>
            <div class="card-info">
              <div class="model-name" :title="model.name">{{ model.name }}</div>
              <div class="model-cat">{{ model.dynasty }} · {{ model.ware }}</div>
              <div v-if="model.patterns && model.patterns.length" class="model-patterns">
                <span class="pattern-count">🎨 {{ model.patterns.length }}款配套纹样</span>
                <button class="pattern-popup-btn" @click.stop="showPatternPopup(model)">查看</button>
              </div>
            </div>
            <div class="card-actions">
              <button class="action-btn fav-btn" :class="{ active: isFav(model.id) }" @click="toggleFav(model.id); handleFavoriteToggled()">{{ isFav(model.id) ? '❤️' : '🤍' }}</button>
              <button class="action-btn preview-btn" @click="handlePreview(model)" title="360°预览">👁️</button>
              <button class="action-btn use-btn" @click="handleUseModel(model)" title="⚡0.1秒立即使用">⚡</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Main Grid -->
      <div class="model-grid">
        <div v-for="model in paginatedModels" :key="model.id" class="model-card">
          <div class="card-image" @click="handlePreview(model)">
            <img :src="model.thumbnail" :alt="model.name" class="model-thumb" loading="lazy" />
            <div class="image-overlay"><span class="overlay-text">点击预览</span></div>
            <div class="quality-dot" :class="'q-' + model.category"></div>
          </div>
          <div class="card-info">
            <div class="model-name" :title="model.name">{{ model.name }}</div>
            <div class="model-cat">{{ model.dynasty }} · {{ model.ware }}</div>
          </div>
          <div class="card-actions">
            <button class="action-btn fav-btn" :class="{ active: isFav(model.id) }" @click="toggleFav(model.id); handleFavoriteToggled()">{{ isFav(model.id) ? '❤️' : '🤍' }}</button>
            <button class="action-btn preview-btn" @click="handlePreview(model)" title="360°预览">👁️</button>
            <button class="action-btn use-btn" @click="handleUseModel(model)" title="⚡0.1秒立即使用">⚡</button>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div class="pagination" v-if="totalPages > 1">
        <button class="page-btn" :disabled="page<=1" @click="goToPage(1)">««</button>
        <button class="page-btn" :disabled="page<=1" @click="goToPage(page-1)">«</button>
        <template v-for="p in totalPages" :key="p">
          <button v-if="Math.abs(p-page)<=2||p===1||p===totalPages" class="page-btn"
            :class="{active:p===page}" @click="goToPage(p)">{{p}}</button>
          <span v-else-if="Math.abs(p-page)===3" class="page-ellipsis">…</span>
        </template>
        <button class="page-btn" :disabled="page>=totalPages" @click="goToPage(page+1)">»</button>
        <button class="page-btn" :disabled="page>=totalPages" @click="goToPage(totalPages)">»»</button>
        <span class="page-info">{{ page }} / {{ totalPages }}</span>
      </div>
    </template>

    <!-- Local import section -->
    <div class="import-section">
      <div class="section-title">📂 导入本地模型</div>
      <p class="import-hint">支持 GLB、GLTF 格式。导入后自动优化、自动识别内外表面、自动应用陶瓷材质，永久保存在"我的模型"分类中。</p>
      <label class="import-btn">
        📤 选择本地模型文件
        <input type="file" accept=".glb,.gltf" hidden @change="handleLocalImport" />
      </label>
      <div class="import-tips">
        <span>💡 推荐网站：<a href="https://3d.si.edu/" target="_blank">Smithsonian 3D</a> · <a href="https://www.aigei.com/" target="_blank">爱给网</a> · <a href="https://www.3d66.com/" target="_blank">3D溜溜网</a> · <a href="https://www.meshy.ai/" target="_blank">Meshy AI</a></span>
      </div>
    </div>

    <!-- Footer -->
    <footer class="library-footer">
      <p>全部81款陶瓷模型均为内置精品，程序化生成，无需联网，0.1秒即时加载</p>
      <p>所有模型均可自由使用、修改、商用，无需署名</p>
    </footer>

    <!-- Companion patterns popup -->
    <Teleport to="body">
      <div v-if="patternPopupModel" class="pattern-popup-overlay" @click.self="closePatternPopup">
        <div class="pattern-popup-panel">
          <div class="pattern-popup-header">
            <span class="pattern-popup-title">🎨 {{ patternPopupModel.name }} — 配套纹样</span>
            <div style="display:flex;gap:8px;align-items:center;">
              <button class="pattern-auto-btn" @click="autoApplyAllPatterns(patternPopupModel)">✨ 一键全器自动铺贴</button>
              <button class="pattern-popup-close" @click="closePatternPopup">✕</button>
            </div>
          </div>
          <div class="pattern-popup-grid">
            <div v-for="pid in patternPopupModel.patterns" :key="pid" class="pattern-popup-item" @click="applyPatternToModel(pid)">
              <img v-if="getPatternThumb(pid)" :src="getPatternThumb(pid)" class="pattern-popup-thumb" />
              <div v-else class="pattern-popup-placeholder">🎨</div>
              <span class="pattern-popup-name">{{ getPatternName(pid) }}</span>
              <span class="pattern-popup-hint">点击应用到模型</span>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 360° Preview -->
    <ModelPreview :visible="previewVisible" :model="previewModel" :glb-url="''" @close="previewVisible=false" />
  </div>
</template>

<style scoped>
.library-page { flex: 1; overflow-y: auto; overflow-x: hidden; background: var(--bg-primary, #f5f0e8); min-height: 0; }
.library-page::-webkit-scrollbar { width: 6px; }
.library-page::-webkit-scrollbar-track { background: transparent; }
.library-page::-webkit-scrollbar-thumb { background: var(--border-color, #d4c5b2); border-radius: 3px; }

.library-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; background: var(--card-bg, rgba(245,240,235,0.95)); border-bottom: 1px solid var(--border-color, #d4c5b2); position: sticky; top: 0; z-index: 10; backdrop-filter: blur(12px); }
.header-left { display: flex; align-items: center; gap: 16px; }
.back-btn { padding: 6px 16px; border-radius: 8px; border: 1px solid var(--border-color, #d4c5b2); background: var(--btn-active, #fff); color: var(--text-primary, #3D2C1A); font-size: 14px; cursor: pointer; transition: all 0.2s; font-family: inherit; white-space: nowrap; }
.back-btn:hover { background: var(--bg-secondary, #ede4d8); }
.page-title { font-family: 'Noto Serif SC', KaiTi, serif; font-size: 1.3rem; font-weight: 700; color: var(--text-primary, #3D2C1A); margin: 0; }
.model-count { font-size: 0.85rem; color: var(--text-secondary, #7A6B5D); }

.library-toolbar { display: flex; align-items: center; gap: 12px; padding: 12px 24px; background: rgba(255,255,255,0.5); border-bottom: 1px solid var(--border-color, #d4c5b2); flex-wrap: wrap; position: sticky; top: 64px; z-index: 9; backdrop-filter: blur(8px); }
.search-box { position: relative; flex: 1; min-width: 220px; max-width: 440px; }
.search-input { width: 100%; padding: 8px 12px 8px 36px; border-radius: 8px; border: 1px solid var(--border-color, #d4c5b2); background: var(--btn-active, #fff); color: var(--text-primary, #3D2C1A); font-size: 14px; outline: none; font-family: inherit; }
.search-input:focus { border-color: var(--accent-jade, #7BA891); }
.search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); font-size: 14px; pointer-events: none; }
.filter-group { display: flex; gap: 8px; align-items: center; }
.filter-select { padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color, #d4c5b2); background: var(--btn-active, #fff); color: var(--text-primary, #3D2C1A); font-size: 13px; cursor: pointer; outline: none; font-family: inherit; }
.filter-btn { padding: 8px 14px; border-radius: 8px; border: 1px solid var(--border-color, #d4c5b2); background: var(--btn-active, #fff); color: var(--text-primary, #3D2C1A); font-size: 13px; cursor: pointer; transition: all 0.15s; font-family: inherit; white-space: nowrap; }
.filter-btn:hover { background: var(--bg-secondary, #ede4d8); }
.filter-btn.active { background: #fff5f5; border-color: #e8a0a0; color: #c43a4a; }

.hot-keywords { display: flex; align-items: center; gap: 6px; padding: 8px 24px; flex-wrap: wrap; }
.hot-label { font-size: 12px; color: var(--text-secondary, #7A6B5D); white-space: nowrap; }
.hot-kw-btn { padding: 3px 10px; border-radius: 12px; border: 1px solid #e8d5b0; background: #fff8e8; color: #8B6F47; font-size: 12px; cursor: pointer; font-family: inherit; }
.hot-kw-btn:hover { background: #f0d8a0; }

.category-tabs { display: flex; gap: 8px; padding: 10px 24px; flex-wrap: wrap; }
.cat-btn { padding: 6px 18px; border-radius: 20px; border: 1px solid var(--border-color, #d4c5b2); background: var(--btn-active, #fff); color: var(--text-secondary, #7A6B5D); font-size: 13px; cursor: pointer; font-family: inherit; transition: all 0.15s; }
.cat-btn:hover { background: var(--bg-secondary, #ede4d8); }
.cat-btn.active { background: var(--accent-jade, #7BA891); color: #fff; border-color: var(--accent-jade, #7BA891); }

.style-tabs { display: flex; align-items: center; gap: 8px; padding: 4px 24px 10px; flex-wrap: wrap; }
.style-label { font-size: 12px; color: var(--text-secondary, #7A6B5D); }
.style-btn { padding: 4px 14px; border-radius: 14px; border: 1px solid #d0c0e0; background: #faf8ff; color: #6B5A8B; font-size: 12px; cursor: pointer; font-family: inherit; transition: all 0.15s; }
.style-btn:hover { background: #e8e0f5; }
.style-btn.active { background: #8B6FCF; color: #fff; border-color: #8B6FCF; }

.recent-section { padding: 8px 24px 0; }
.section-title { font-family: 'Noto Serif SC', KaiTi, serif; font-size: 0.95rem; font-weight: 700; color: var(--text-primary, #3D2C1A); margin-bottom: 8px; }

.model-grid { display: grid; grid-template-columns: repeat(5, 220px); gap: 20px; padding: 16px 24px; justify-content: center; }
@media (max-width: 1300px) { .model-grid { grid-template-columns: repeat(4, 220px); } }
@media (max-width: 1050px) { .model-grid { grid-template-columns: repeat(3, 220px); } }
@media (max-width: 780px) { .model-grid { grid-template-columns: repeat(2, 220px); } }

.model-card { width: 220px; min-height: 280px; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); overflow: hidden; display: flex; flex-direction: column; transition: transform 0.2s, box-shadow 0.2s; cursor: default; }
.model-card:hover { transform: translateY(-4px); box-shadow: 0 6px 20px rgba(0,0,0,0.15); }
.card-image { width: 220px; height: 180px; position: relative; background: #f5f5f5; cursor: pointer; overflow: hidden; }
.model-thumb { width: 100%; height: 100%; object-fit: cover; }
.image-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s; }
.card-image:hover .image-overlay { opacity: 1; }
.overlay-text { color: #fff; font-size: 14px; font-weight: 500; }
.quality-dot { position: absolute; top: 6px; right: 6px; width: 12px; height: 12px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
.q-traditional { background: #c43a4a; }
.q-modern { background: #4a7c59; }
.q-japanese { background: #8B6F47; }
.q-european { background: #3b5b8a; }

.card-info { padding: 10px 12px 4px; flex: 1; }
.model-name { font-size: 13px; font-weight: 700; color: #3D2C1A; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.model-cat { font-size: 11px; color: #999; margin-top: 3px; }
.card-actions { display: flex; border-top: 1px solid #f0f0f0; }
.action-btn { flex: 1; padding: 8px 0; border: none; background: transparent; cursor: pointer; font-size: 18px; display: flex; align-items: center; justify-content: center; transition: background 0.15s; }
.action-btn:hover { background: #f5f5f5; }
.fav-btn.active { background: #fff5f5; }
.use-btn { border-left: 1px solid #f0f0f0; color: #c43a4a; }
.preview-btn { border-left: 1px solid #f0f0f0; }

.loading-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; gap: 12px; color: var(--text-secondary, #7A6B5D); }
.loading-spinner { width: 36px; height: 36px; border: 3px solid var(--border-color, #d4c5b2); border-top-color: var(--accent-jade, #7BA891); border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; gap: 12px; color: var(--text-secondary, #7A6B5D); }
.empty-icon { font-size: 40px; }
.empty-hint { font-size: 13px; color: #aaa; }

.pagination { display: flex; align-items: center; justify-content: center; gap: 4px; padding: 20px; }
.page-btn { min-width: 32px; height: 32px; border-radius: 6px; border: 1px solid var(--border-color, #d4c5b2); background: var(--btn-active, #fff); color: var(--text-primary, #3D2C1A); font-size: 13px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-family: inherit; }
.page-btn:hover:not(:disabled) { background: var(--bg-secondary, #ede4d8); }
.page-btn.active { background: var(--accent-jade, #7BA891); color: #fff; border-color: var(--accent-jade, #7BA891); }
.page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.page-ellipsis { padding: 0 4px; color: var(--text-secondary, #7A6B5D); }
.page-info { margin-left: 8px; font-size: 12px; color: var(--text-secondary, #7A6B5D); }

.import-section { margin: 24px 24px; padding: 20px 24px; background: #fff; border: 2px dashed var(--border-color, #d4c5b2); border-radius: 12px; text-align: center; }
.import-hint { font-size: 13px; color: var(--text-secondary, #7A6B5D); margin: 8px 0 16px; line-height: 1.5; }
.import-btn { display: inline-block; padding: 10px 24px; border-radius: 8px; border: none; background: var(--accent-jade, #7BA891); color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; transition: all 0.2s; }
.import-btn:hover { background: #5a8a6a; transform: scale(1.02); }
.import-tips { margin-top: 12px; font-size: 12px; color: #aaa; }
.import-tips a { color: var(--accent-jade, #7BA891); text-decoration: none; }
.import-tips a:hover { text-decoration: underline; }

.library-footer { padding: 20px 24px; border-top: 1px solid var(--border-color, #d4c5b2); background: rgba(255,255,255,0.3); text-align: center; }
.library-footer p { margin: 4px 0; font-size: 12px; color: var(--text-secondary, #7A6B5D); }

/* Pattern companion on cards */
.model-patterns { display: flex; align-items: center; justify-content: space-between; margin-top: 4px; }
.pattern-count { font-size: 10px; color: #7BA891; font-weight: 500; }
.pattern-popup-btn { padding: 1px 8px; border-radius: 8px; border: 1px solid #7BA891; background: #f0f8f4; color: #7BA891; font-size: 10px; cursor: pointer; font-family: inherit; }
.pattern-popup-btn:hover { background: #e0f0e8; }

/* Pattern popup overlay */
.pattern-popup-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 10001; display: flex; align-items: center; justify-content: center; animation: fadeIn 0.2s ease; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
.pattern-popup-panel { width: 520px; max-height: 70vh; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 12px 40px rgba(0,0,0,0.3); display: flex; flex-direction: column; }
.pattern-popup-header { display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; border-bottom: 1px solid #eee; }
.pattern-popup-title { font-size: 15px; font-weight: 700; color: #3D2C1A; }
.pattern-popup-close { width: 28px; height: 28px; border-radius: 50%; border: 1px solid #ddd; background: #fff; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.pattern-popup-close:hover { background: #fee; border-color: #e88; color: #c44; }
.pattern-auto-btn { padding: 6px 14px; border-radius: 8px; border: none; background: linear-gradient(135deg, #c43a4a, #d95a76); color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; white-space: nowrap; transition: all 0.2s; }
.pattern-auto-btn:hover { transform: scale(1.04); box-shadow: 0 4px 12px rgba(196,58,74,0.35); }
.pattern-popup-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; padding: 16px 20px; overflow-y: auto; }
.pattern-popup-item { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 10px; border: 1px solid #eee; border-radius: 8px; cursor: pointer; transition: all 0.15s; }
.pattern-popup-item:hover { border-color: #7BA891; box-shadow: 0 2px 8px rgba(123,168,145,0.2); transform: scale(1.03); }
.pattern-popup-thumb { width: 100px; height: 100px; object-fit: contain; border-radius: 6px; }
.pattern-popup-placeholder { width: 100px; height: 100px; display: flex; align-items: center; justify-content: center; font-size: 32px; background: #f5f5f5; border-radius: 6px; }
.pattern-popup-name { font-size: 11px; font-weight: 600; color: #3D2C1A; text-align: center; }
.pattern-popup-hint { font-size: 10px; color: #aaa; }
</style>
