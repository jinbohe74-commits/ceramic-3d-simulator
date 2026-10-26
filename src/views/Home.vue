<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useCeramicStore } from '@/stores/ceramic'
import { useUserStore } from '@/stores/user'
import Ceramic3D from '@/components/Ceramic3D.vue'
import Toolbar from '@/components/Toolbar.vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const emit = defineEmits(['open-login'])

const ceramicStore = useCeramicStore()
const userStore = useUserStore()
const ceramicRef = ref(null)

function onRestoreWork(e) { restoreWork(e.detail) }

onMounted(async () => {
  window.addEventListener('restore-work', onRestoreWork)
  ceramicStore.loadDownloadedModels()

  // 处理从模型库"使用"后挂载的情况：延时确保 Ceramic3D 已初始化
  if (ceramicStore.consumePendingBuiltin() || ceramicStore.currentShape === '__builtin__') {
    await nextTick()
    setTimeout(() => {
      if (ceramicRef.value && ceramicStore.builtinModelProfile) {
        ceramicRef.value.changeShape('__builtin__')
      }
    }, 200)
  }
})

onUnmounted(() => {
  window.removeEventListener('restore-work', onRestoreWork)
})

/** 格式化时间戳为 YYYYMMDD_HHMMSS */
function formatTimestamp(now) {
  const d = String(now.getFullYear()) +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0')
  const t = String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0')
  return d + '_' + t
}

/* ═══════════ 窑变·烧制（含自动保存） ═══════════ */
async function handleFire() {
  const isLoggedIn = userStore.isLoggedIn

  // 1. 执行烧制动画（无论登录状态都播放）
  await ceramicRef.value?.fireCeramic()

  // 2. 等待 500ms 确保窑变效果完全稳定
  await new Promise(r => setTimeout(r, 500))

  // 3. 未登录 → 提示登录后可自动保存
  if (!isLoggedIn) {
    ElMessageBox.alert('登录后可自动保存作品到"我的作品"', '提示', {
      confirmButtonText: '立即登录',
      type: 'info',
      callback: () => emit('open-login'),
    })
    return
  }

  // 4. 检查作品数量上限（50）
  if (userStore.works.length >= 50) {
    ElMessage.warning('作品数量已达上限（50个），请删除部分旧作品')
    return
  }

  // 5. 无声截图（不触发下载弹窗）
  const dataUrl = ceramicRef.value?.takeScreenshotSilent()
  if (!dataUrl) {
    ElMessage.error('截图生成失败，请重试')
    return
  }

  // 6. 收集当前完整状态
  const snapshot = ceramicStore.getSnapshot()
  const now = new Date()
  const name = `陶瓷作品_${formatTimestamp(now)}`

  // 7. 自动保存
  const result = await userStore.addWork(dataUrl, snapshot, null, name)
  if (result?.success) {
    ElMessage.success('作品已自动保存到我的作品')
  } else if (result?.message) {
    ElMessage.warning(result.message)
  }
}

/* ═══════════ 手动截图保存 ═══════════ */
function handleScreenshot() {
  const dataUrl = ceramicRef.value?.takeScreenshot()
  if (dataUrl) {
    const snapshot = ceramicStore.getSnapshot()
    userStore.addWork(dataUrl, snapshot)
  }
}

/* ═══════════ 工具函数 ═══════════ */
function handleResetView() { ceramicRef.value?.resetView() }
function handleFullscreen() { ceramicRef.value?.enterFullscreen() }
function handleSetView(view) { ceramicRef.value?.setViewPreset(view) }

/** 由 App.vue 通过 HistoryModal 'restore' 事件调用 */
function restoreWork(snapshot) {
  ceramicRef.value?.restoreFromSnapshot(snapshot)
}

defineExpose({ restoreWork })
</script>

<template>
  <div style="flex:1;display:flex;overflow:hidden;">
    <!-- Left: 3D Canvas Area -->
    <div class="canvas-area">
      <Ceramic3D
        ref="ceramicRef"
      />
    </div>
    <!-- Right: Toolbar -->
    <Toolbar
      :on-fire="handleFire"
      :on-screenshot="handleScreenshot"
      :on-reset-view="handleResetView"
      :on-fullscreen="handleFullscreen"
      :on-set-view="handleSetView"
    />
  </div>
</template>

<style scoped>
.canvas-area {
  flex: 1;
  min-width: 0;
  position: relative;
  background: transparent;
}
</style>
