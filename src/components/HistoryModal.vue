<script setup>
import { ref, watch } from 'vue'
import { useUserStore } from '@/stores/user'
import { useCeramicStore } from '@/stores/ceramic'
import { ElMessage, ElMessageBox } from 'element-plus'

const props = defineProps({
  visible: Boolean,
})
const emit = defineEmits(['close', 'restore'])

const userStore = useUserStore()
const ceramicStore = useCeramicStore()

const shapeNames = { meiping: '梅瓶', yuhuchun: '玉壶春瓶', shangping: '赏瓶', wanzhan: '碗盏', chabei: '茶杯', hulu: '葫芦瓶', danping: '胆瓶', congshi: '琮式瓶', jiangjun: '将军罐', bitong: '笔筒', panzi: '盘子', '__imported__': '导入模型', '__builtin__': '内置模型' }
const styleNames = { qinghua: '青花瓷', fencai: '粉彩瓷', jun: '钧瓷', bai: '素面白瓷', ruci: '汝瓷', geci: '哥瓷' }

const restoring = ref(false)
const refreshing = ref(false)
const detailVisible = ref(false)
const detailWork = ref(null)

/* ========== Actions ========== */

/** 手动刷新作品列表 */
async function handleRefresh() {
  refreshing.value = true
  await userStore.refreshWorks()
  refreshing.value = false
  ElMessage.success('已刷新')
}

/** 查看详情 */
function viewDetail(work) {
  detailWork.value = work
  detailVisible.value = true
}

/** 删除作品（支持普通作品 + 损坏记录） */
async function deleteWork(work) {
  try {
    await ElMessageBox.confirm('确定要删除这件作品吗？', '确认删除', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await userStore.deleteWork(work.id)
    ElMessage.success('作品已删除')
  } catch {
    // 取消确认不处理
  }
}

/** 重命名 */
async function renameWork(work) {
  try {
    const { value } = await ElMessageBox.prompt('请输入新名称', '重命名作品', {
      inputValue: work.name || '陶瓷作品',
      confirmButtonText: '确定',
      cancelButtonText: '取消',
    })
    if (value && value.trim()) {
      await userStore.renameWork(work.id, value.trim())
      ElMessage.success('已重命名')
    }
  } catch {
    // 取消不处理
  }
}

/** 复原作品（含釉色完整数据） */
function restoreWork(work) {
  const params = work.materialParams || work.params || {}
  restoring.value = true
  detailVisible.value = false
  emit('restore', {
    shape: work.shape,
    style: work.style,
    params,
    attachedPatterns: work.attachedPatterns || [],
    name: work.name || ((shapeNames[work.shape] || '陶瓷') + ' · ' + (styleNames[work.style] || '作品')),
    outerGlazeColor: work.outerGlazeColor || null,
    innerGlazeColor: work.innerGlazeColor || null,
    glazeMode: work.glazeMode || 'both',
    fired: work.fired || false,
    builtinModelId: work.builtinModelId || null,
  })
}

/** 复原完成后关闭弹窗 */
watch(() => ceramicStore.restoreLoading, (loading) => {
  if (!loading && restoring.value) {
    restoring.value = false
    emit('close')
    ElMessage.success('作品已复原到当前场景！')
  }
})

/* ========== Helpers ========== */

function patternCount(work) {
  return work.attachedPatterns?.length || 0
}

/** 安全地获取显示名称（容错处理） */
function displayName(work) {
  if (work.name) return work.name
  const shape = shapeNames[work.shape] || work.shape || '陶瓷'
  const style = styleNames[work.style] || work.style || '作品'
  return shape + ' · ' + style
}

/** 安全格式化时间 */
function formatTime(work) {
  try {
    const t = work.createTime || work.timestamp
    if (!t) return '时间未知'
    return new Date(t).toLocaleString('zh-CN')
  } catch {
    return '时间未知'
  }
}

/** 安全获取材质参数 */
function getParams(work) {
  const p = work.materialParams || work.params
  return p || {}
}

function handleClose() {
  detailVisible.value = false
  emit('close')
}
</script>

<template>
  <!-- ======== 作品列表弹窗 ======== -->
  <el-dialog
    :model-value="props.visible"
    @close="handleClose"
    title="我的作品历史"
    width="560px"
    :close-on-click-modal="true"
    top="5vh"
  >
    <!-- 全部为空 -->
    <div
      v-if="userStore.works.length === 0 && userStore.corruptedWorks.length === 0"
      style="text-align:center;padding:30px 0;color:var(--text-secondary);font-size:0.9rem;"
    >
      暂无创作作品，快去制作吧
    </div>

    <div style="margin-bottom:8px;text-align:right;">
      <el-button size="small" :loading="refreshing" @click="handleRefresh" style="font-size:0.78rem;">
        {{ refreshing ? '刷新中...' : '⟳ 刷新' }}
      </el-button>
    </div>

    <div style="display:flex;flex-direction:column;gap:10px;max-height:55vh;overflow-y:auto;">

      <!-- 正常作品列表 -->
      <div
        v-for="work in userStore.works"
        :key="work.id"
        style="display:flex;gap:12px;padding:10px;border:1px solid var(--border-color);border-radius:8px;background:rgba(255,255,255,0.6);align-items:center;"
      >
        <img
          :src="work.screenshot"
          alt="作品缩略图"
          style="width:80px;height:80px;object-fit:cover;border-radius:6px;border:1px solid var(--border-color);flex-shrink:0;"
          @error="$event.target.style.display='none'"
        />
        <div style="flex:1;min-width:0;">
          <div style="font-size:0.85rem;font-weight:600;color:var(--text-primary);line-height:1.4;">
            {{ displayName(work) }}
          </div>
          <div style="font-size:0.72rem;color:var(--text-secondary);margin-top:2px;display:flex;gap:8px;align-items:center;">
            <span>{{ formatTime(work) }}</span>
            <span v-if="patternCount(work) > 0" style="background:var(--accent-jade);color:#fff;font-size:0.62rem;padding:1px 6px;border-radius:10px;">
              图案:{{ patternCount(work) }}个
            </span>
          </div>
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0;">
          <el-button size="small" @click="renameWork(work)">重命名</el-button>
          <el-button size="small" @click="viewDetail(work)">查看详情</el-button>
          <el-button size="small" type="danger" plain @click="deleteWork(work)">删除</el-button>
        </div>
      </div>

      <!-- 损坏作品列表 -->
      <template v-if="userStore.corruptedWorks.length > 0">
        <div style="margin:6px 0 2px;font-size:0.75rem;color:var(--el-color-warning);border-top:1px dashed var(--border-color);padding-top:10px;">
          ⚠️ 以下 {{ userStore.corruptedWorks.length }} 条作品数据格式损坏
        </div>
        <div
          v-for="work in userStore.corruptedWorks"
          :key="'corrupted-' + work.id"
          style="display:flex;gap:12px;padding:10px;border:1px solid var(--el-color-warning-light-5);border-radius:8px;background:rgba(255,255,255,0.4);align-items:center;opacity:0.75;"
        >
          <div style="width:80px;height:80px;border-radius:6px;background:#f5f5f5;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:0.7rem;flex-shrink:0;">
            损坏
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:0.82rem;color:var(--text-secondary);">
              数据损坏 - {{ formatTime(work) }}
            </div>
          </div>
          <div style="display:flex;gap:4px;flex-shrink:0;">
            <el-button size="small" type="danger" plain @click="deleteWork(work)">删除</el-button>
          </div>
        </div>
      </template>
    </div>
  </el-dialog>

  <!-- ======== 作品详情弹窗 ======== -->
  <el-dialog
    :model-value="detailVisible"
    @close="detailVisible = false"
    title="作品详情"
    width="460px"
    :close-on-click-modal="true"
  >
    <template v-if="detailWork">
      <div style="text-align:center;margin-bottom:12px;">
        <img
          :src="detailWork.screenshot"
          alt="作品大图"
          style="max-width:100%;max-height:240px;object-fit:contain;border-radius:8px;border:1px solid var(--border-color);"
          @error="$event.target.style.display='none'"
        />
      </div>
      <div style="font-size:0.9rem;font-weight:600;color:var(--text-primary);text-align:center;margin-bottom:10px;">
        {{ displayName(detailWork) }}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;font-size:0.82rem;">
        <div><span style="color:var(--text-secondary);">器型：</span>{{ shapeNames[detailWork.shape] || detailWork.shape || '未知' }}</div>
        <div><span style="color:var(--text-secondary);">样式：</span>{{ styleNames[detailWork.style] || detailWork.style || '未知' }}</div>
        <template v-if="getParams(detailWork).metalness != null">
          <div><span style="color:var(--text-secondary);">金属感：</span>{{ Number(getParams(detailWork).metalness).toFixed(2) }}</div>
          <div><span style="color:var(--text-secondary);">粗糙度：</span>{{ Number(getParams(detailWork).roughness).toFixed(2) }}</div>
          <div><span style="color:var(--text-secondary);">通透度：</span>{{ Number(getParams(detailWork).opacity).toFixed(2) }}</div>
          <div><span style="color:var(--text-secondary);">釉面亮度：</span>{{ Number(getParams(detailWork).brightness).toFixed(2) }}</div>
          <div><span style="color:var(--text-secondary);">纹样透明度：</span>{{ Number(getParams(detailWork).patternOpacity).toFixed(2) }}</div>
          <div style="grid-column:1/-1;"><span style="color:var(--text-secondary);">纹样文字：</span>{{ getParams(detailWork).patternText || '无' }}</div>
        </template>
        <div v-if="patternCount(detailWork) > 0" style="grid-column:1/-1;">
          <span style="color:var(--text-secondary);">贴附图案：</span>
          <span style="color:var(--accent-jade);font-weight:600;">{{ patternCount(detailWork) }} 个</span>
        </div>
      </div>
      <div style="margin-top:16px;text-align:center;display:flex;gap:8px;justify-content:center;">
        <el-button type="primary" @click="restoreWork(detailWork)">复原作品</el-button>
        <el-button @click="renameWork(detailWork)">重命名</el-button>
      </div>
    </template>
  </el-dialog>
</template>
