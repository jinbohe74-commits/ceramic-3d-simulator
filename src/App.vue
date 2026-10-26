<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useThemeStore } from '@/stores/theme'
import LoginModal from '@/components/LoginModal.vue'
import HistoryModal from '@/components/HistoryModal.vue'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

onMounted(async () => {
  await userStore.loadFromLocalStorage()
  useThemeStore().loadFromStorage()
})

const loginVisible = ref(false)
const historyVisible = ref(false)

function openLogin() { loginVisible.value = true }
function closeLogin() { loginVisible.value = false }

async function openHistory() {
  if (userStore.isLoggedIn) {
    await userStore.loadWorks()
  }
  historyVisible.value = true
}
function closeHistory() { historyVisible.value = false }

/** Navigate to model library page */
function goToModelLibrary() {
  router.push('/models')
}

/** Navigate to model builder page */
function goToModelBuilder() {
  router.push('/builder')
}

/** Check if we're on the builder page */
function isBuilderPage() {
  return route.path === '/builder'
}

/** HistoryModal emits 'restore' → delegate to the Home view */
function handleRestoreWork(snapshot) {
  closeHistory()
  // Emit via router or direct ref if on the same route
  window.dispatchEvent(new CustomEvent('restore-work', { detail: snapshot }))
}

/** Check if we're on the home/editor page */
function isHomePage() {
  return route.path === '/' || route.path === ''
}
</script>

<template>
  <div id="app-root">
    <header class="header-nav">
      <div class="nav-brand">
        <span class="main-title">陶瓷 3D 模拟工坊</span>
        <span class="sub-title">匠心造瓷 · 云端赏韵</span>
      </div>
      <div class="nav-actions">
        <!-- 非首页时显示返回创作按钮 -->
        <el-button
          v-if="!isHomePage()"
          size="small"
          @click="router.push('/')"
          style="margin-right:4px;background:#f5f0e8;border-radius:8px;font-size:14px;"
        >
          ← 返回创作
        </el-button>
        <!-- 构建模型按钮 -->
        <el-button
          v-if="isHomePage()"
          size="small"
          @click="goToModelBuilder"
          style="margin-right:4px;background:#f5f0e8;border-radius:8px;font-size:14px;"
        >
          🔧 构建模型
        </el-button>
        <!-- 在线模型库按钮 -->
        <el-button
          v-if="isHomePage()"
          size="small"
          @click="goToModelLibrary"
          style="margin-right:4px;background:#f5f0e8;border-radius:8px;font-size:14px;"
        >
          🌐 在线模型库
        </el-button>
        <template v-if="!userStore.isLoggedIn">
          <el-button size="small" @click="openLogin">登录</el-button>
        </template>
        <template v-else>
          <span style="font-size:0.85rem;color:var(--text-secondary);">欢迎，{{ userStore.username }}</span>
          <el-button v-if="isHomePage()" size="small" @click="openHistory">我的作品</el-button>
          <el-button size="small" @click="userStore.logout()">退出</el-button>
        </template>
      </div>
    </header>

    <!-- Router view for page switching (slot syntax for event forwarding) -->
    <router-view v-slot="{ Component }">
      <component
        :is="Component"
        @open-login="openLogin"
      />
    </router-view>

    <LoginModal :visible="loginVisible" @close="closeLogin" />
    <HistoryModal :visible="historyVisible" @close="closeHistory" @restore="handleRestoreWork" />
  </div>
</template>

<style>
/* 全局主题过渡动画 */
*, *::before, *::after {
  transition: background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease, box-shadow 0.3s ease !important;
}
</style>

<style scoped>
#app-root { height: 100%; display: flex; flex-direction: column; }
</style>
