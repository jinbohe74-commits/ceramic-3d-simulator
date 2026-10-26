import { defineStore } from 'pinia'

/**
 * 国风主题色方案 — 完整覆盖所有 UI 元素
 * 仅作用于UI元素，3D展示区永久保持纯黑色（#000000）
 */
export const themes = {
  moqing: {
    label: '墨青',
    primary: '#4a7c59',
    secondary: '#3d664a',
    bg: '#f5f0e8',
    'bg-secondary': '#ede4d8',
    'text-primary': '#3D2C1A',
    'text-secondary': '#7A6B5D',
    border: '#d4c5b2',
    'accent-light': '#e8f0e4',
    'btn-active': '#fff',
    'accent-jade': '#7BA891',
    'accent-blue': '#4A6FA5',
    'accent-brown': '#8B6F47',
    'accent-copper': '#C47E5A',
    'card-bg': 'rgba(245, 240, 235, 0.95)',
    'shadow-color': 'rgba(61, 44, 26, 0.1)',
    'shadow-lg': 'rgba(61, 44, 26, 0.18)',
    'slider-val': '#4A6FA5',
    'input-placeholder': '#b0a090',
    'danger': '#C43A4A',
    'fire-start': '#C47E5A',
    'fire-end': '#A0522D',
    'fire-hover-start': '#d4956a',
    'fire-hover-end': '#b5633d',
    'fire-disabled': '#c4b09a',
  },
  zheshi: {
    label: '赭石',
    primary: '#b35c37',
    secondary: '#994d2e',
    bg: '#f8f4ed',
    'bg-secondary': '#f0e8dd',
    'text-primary': '#3D2C1A',
    'text-secondary': '#7A6B5D',
    border: '#d4bfaa',
    'accent-light': '#f5e8dd',
    'btn-active': '#fff',
    'accent-jade': '#b3825a',
    'accent-blue': '#7a6b7a',
    'accent-brown': '#8B6F47',
    'accent-copper': '#C47E5A',
    'card-bg': 'rgba(248, 244, 237, 0.95)',
    'shadow-color': 'rgba(61, 44, 26, 0.12)',
    'shadow-lg': 'rgba(61, 44, 26, 0.2)',
    'slider-val': '#b35c37',
    'input-placeholder': '#b8a898',
    'danger': '#C43A4A',
    'fire-start': '#C47E5A',
    'fire-end': '#A0522D',
    'fire-hover-start': '#d4956a',
    'fire-hover-end': '#b5633d',
    'fire-disabled': '#c4b09a',
  },
  dailan: {
    label: '黛蓝',
    primary: '#3b5b8a',
    secondary: '#2d476b',
    bg: '#f0f2f5',
    'bg-secondary': '#e4e8ef',
    'text-primary': '#2c3e50',
    'text-secondary': '#5d6d7e',
    border: '#b8c6d4',
    'accent-light': '#e4eaf5',
    'btn-active': '#fff',
    'accent-jade': '#5a7a9a',
    'accent-blue': '#3b5b8a',
    'accent-brown': '#7a6a5a',
    'accent-copper': '#b07a5a',
    'card-bg': 'rgba(240, 242, 245, 0.95)',
    'shadow-color': 'rgba(44, 62, 80, 0.1)',
    'shadow-lg': 'rgba(44, 62, 80, 0.18)',
    'slider-val': '#3b5b8a',
    'input-placeholder': '#9aa8b8',
    'danger': '#C43A4A',
    'fire-start': '#C47E5A',
    'fire-end': '#A0522D',
    'fire-hover-start': '#d4956a',
    'fire-hover-end': '#b5633d',
    'fire-disabled': '#c4b09a',
  },
  yabai: {
    label: '雅白',
    primary: '#666666',
    secondary: '#444444',
    bg: '#ffffff',
    'bg-secondary': '#f5f5f5',
    'text-primary': '#333333',
    'text-secondary': '#666666',
    border: '#d0d0d0',
    'accent-light': '#f0f0f0',
    'btn-active': '#fff',
    'accent-jade': '#888888',
    'accent-blue': '#666666',
    'accent-brown': '#7a7a7a',
    'accent-copper': '#999999',
    'card-bg': 'rgba(255, 255, 255, 0.95)',
    'shadow-color': 'rgba(0, 0, 0, 0.08)',
    'shadow-lg': 'rgba(0, 0, 0, 0.15)',
    'slider-val': '#666666',
    'input-placeholder': '#aaaaaa',
    'danger': '#C43A4A',
    'fire-start': '#C47E5A',
    'fire-end': '#A0522D',
    'fire-hover-start': '#d4956a',
    'fire-hover-end': '#b5633d',
    'fire-disabled': '#c4b09a',
  },
}

export const useThemeStore = defineStore('theme', {
  state: () => ({
    currentTheme: 'moqing',
  }),

  actions: {
    setTheme(name) {
      if (!themes[name]) return
      this.currentTheme = name
      try { localStorage.setItem('ceramic_theme', name) } catch (e) { /* ignore */ }
      applyThemeCSS(name)
    },

    loadFromStorage() {
      let saved = 'moqing'
      try { saved = localStorage.getItem('ceramic_theme') || 'moqing' } catch (e) { /* */ }
      if (!themes[saved]) saved = 'moqing'
      this.currentTheme = saved
      applyThemeCSS(saved)
    },
  },
})

/**
 * 将主题色应用到全局 CSS 自定义属性
 * @param {string} name - 主题名称
 */
function applyThemeCSS(name) {
  const t = themes[name]
  if (!t) return
  const root = document.documentElement

  // 自定义 CSS 变量
  root.style.setProperty('--theme-primary', t.primary)
  root.style.setProperty('--theme-secondary', t.secondary)
  root.style.setProperty('--theme-bg', t.bg)
  root.style.setProperty('--bg-primary', t.bg)
  root.style.setProperty('--bg-secondary', t['bg-secondary'])
  root.style.setProperty('--text-primary', t['text-primary'])
  root.style.setProperty('--text-secondary', t['text-secondary'])
  root.style.setProperty('--theme-border', t.border)
  root.style.setProperty('--theme-accent-light', t['accent-light'])
  root.style.setProperty('--accent-jade', t['accent-jade'])
  root.style.setProperty('--accent-blue', t['accent-blue'])
  root.style.setProperty('--accent-brown', t['accent-brown'])
  root.style.setProperty('--accent-copper', t['accent-copper'])
  root.style.setProperty('--card-bg', t['card-bg'])
  root.style.setProperty('--shadow-color', t['shadow-color'])
  root.style.setProperty('--shadow-lg', t['shadow-lg'])
  root.style.setProperty('--slider-val', t['slider-val'])
  root.style.setProperty('--input-placeholder', t['input-placeholder'])
  root.style.setProperty('--danger', t['danger'])
  root.style.setProperty('--border-color', t.border)
  root.style.setProperty('--fire-start', t['fire-start'])
  root.style.setProperty('--fire-end', t['fire-end'])
  root.style.setProperty('--fire-hover-start', t['fire-hover-start'])
  root.style.setProperty('--fire-hover-end', t['fire-hover-end'])
  root.style.setProperty('--fire-disabled', t['fire-disabled'])

  // 同步 Element Plus CSS 变量
  root.style.setProperty('--el-color-primary', t.primary)
  root.style.setProperty('--el-color-primary-light-3', t.primary + '66')
  root.style.setProperty('--el-color-primary-light-5', t.primary + '99')
  root.style.setProperty('--el-color-primary-light-7', t.primary + 'bb')
  root.style.setProperty('--el-color-primary-light-9', t.secondary + '33')
  root.style.setProperty('--el-bg-color', t.bg)
  root.style.setProperty('--el-text-color-primary', t['text-primary'])
  root.style.setProperty('--el-border-color', t.border)
}
