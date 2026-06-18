<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

interface MenuItem {
  label: string
  path?: string
  children?: { label: string; path: string; desc?: string }[]
}

const menuItems: MenuItem[] = [
  { label: '仪表盘', path: '/' },
  { label: '图库 & 标注', path: '/gallery' },
  {
    label: '工具',
    children: [
      { label: '超分放大', path: '/upscale', desc: 'waifu2x / Real-ESRGAN' },
      { label: '提示词反推', path: '/reverse', desc: 'WD14 / CLIP 反推' },
      { label: 'AI 生成', path: '/generate', desc: 'Gemini / NovelAI' },
      { label: 'LoRA 训练', path: '/training', desc: '本地 LoRA 微调' },
    ],
  },
  { label: '控制台', path: '/console' },
  { label: '设置', path: '/settings' },
]

const route = useRoute()
const router = useRouter()
const openMenu = ref<string | null>(null)
let closeTimer: ReturnType<typeof setTimeout> | null = null

function isActive(item: MenuItem): boolean {
  if (item.path) {
    if (item.path === '/') return route.path === '/'
    return route.path.startsWith(item.path)
  }
  if (item.children) {
    return item.children.some((c) => route.path.startsWith(c.path))
  }
  return false
}

function isChildActive(path: string): boolean {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}

function navigateTo(path: string) {
  router.push(path)
  openMenu.value = null
}

function onMenuEnter(label: string) {
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null }
  openMenu.value = label
}

function onMenuLeave() {
  closeTimer = setTimeout(() => { openMenu.value = null }, 200)
}
</script>

<template>
  <nav class="tmb-bar">
    <div
      v-for="item in menuItems"
      :key="item.label"
      class="tmb-item"
      :class="{ active: isActive(item), open: openMenu === item.label }"
      @mouseenter="item.children ? onMenuEnter(item.label) : undefined"
      @mouseleave="item.children ? onMenuLeave() : undefined"
    >
      <!-- Direct link -->
      <router-link
        v-if="item.path && !item.children"
        :to="item.path"
        class="tmb-link"
      >{{ item.label }}</router-link>

      <!-- Dropdown trigger -->
      <button
        v-else
        class="tmb-link tmb-trigger"
        @click="openMenu === item.label ? openMenu = null : onMenuEnter(item.label)"
      >{{ item.label }} ▾</button>

      <!-- Dropdown -->
      <div v-if="item.children && openMenu === item.label" class="tmb-drop" @mouseenter="onMenuEnter(item.label)" @mouseleave="onMenuLeave()">
        <button
          v-for="child in item.children"
          :key="child.path"
          class="tmb-drop-item"
          :class="{ active: isChildActive(child.path) }"
          @click="navigateTo(child.path)"
        >
          <span class="tmb-drop-label">{{ child.label }}</span>
          <span class="tmb-drop-desc" v-if="child.desc">{{ child.desc }}</span>
        </button>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.tmb-bar {
  display: flex; align-items: center; gap: 0;
  height: 36px; flex-shrink: 0;
  background: transparent;
  border-bottom: 1px solid rgba(255,255,255,0.12);
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  padding: 0 10px;
  -webkit-app-region: no-drag;
}
.tmb-item { position: relative; height: 100%; display: flex; align-items: center; }
.tmb-link {
  display: flex; align-items: center; height: 100%;
  padding: 0 16px; font-size: 12.5px; font-weight: 500;
  color: #8b8b90; text-decoration: none; cursor: pointer;
  border: none; background: none; font-family: inherit;
  border-radius: 8px; transition: all 0.15s;
  white-space: nowrap; letter-spacing: 0.02em;
}
.tmb-link:hover { color: #b0b0b5; }
.tmb-item.active .tmb-link { color: #ff69b4; font-weight: 600; }
.tmb-item.open .tmb-link { color: #b0b0b5; }

.tmb-trigger { gap: 4px; }

.tmb-drop {
  position: absolute; top: 100%; left: 0;
  min-width: 210px; background: #1e1e22;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px; padding: 6px;
  box-shadow: 0 16px 40px rgba(0,0,0,0.6);
  z-index: 200; display: flex; flex-direction: column;
}
.tmb-drop-item {
  display: flex; flex-direction: column; gap: 1px;
  padding: 10px 14px; border: none; background: none;
  color: #8b8b90; font-size: 12px; cursor: pointer; border-radius: 6px;
  text-align: left; width: 100%; font-family: inherit;
  transition: all 0.1s;
}
.tmb-drop-item:hover { background: rgba(255,255,255,0.04); color: #b0b0b5; }
.tmb-drop-item.active { color: #ff69b4; }
.tmb-drop-label { font-weight: 500; }
.tmb-drop-desc { font-size: 10px; color: #6b7280; }
</style>
