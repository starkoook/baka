<script setup lang="ts">
import { useRoute } from 'vue-router'

interface NavItem {
  path: string
  label: string
  icon: string
}

const navItems: NavItem[] = [
  { path: '/', label: '仪表盘', icon: 'grid' },
  { path: '/tagger', label: '图像标注', icon: 'tag' },
  { path: '/reverse', label: '提示词反推', icon: 'brain' },
  { path: '/upscale', label: '超分放大', icon: 'zoom' },
  { path: '/generate', label: 'AI 生成', icon: 'sparkle' },
  { path: '/console', label: '控制台', icon: 'terminal' },
  { path: '/settings', label: '设置', icon: 'gear' },
]

const route = useRoute()

function isActive(path: string): boolean {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}
</script>

<template>
  <nav class="sidebar">
    <div class="sidebar-nav">
      <router-link
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        class="nav-item hover-lift"
        :class="{ active: isActive(item.path) }"
        :title="item.label"
      >
        <!-- Grid icon -->
        <svg v-if="item.icon === 'grid'" class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
          <rect x="3" y="3" width="7" height="7" rx="1.2"/>
          <rect x="14" y="3" width="7" height="7" rx="1.2"/>
          <rect x="3" y="14" width="7" height="7" rx="1.2"/>
          <rect x="14" y="14" width="7" height="7" rx="1.2"/>
        </svg>
        <!-- Tag icon -->
        <svg v-else-if="item.icon === 'tag'" class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/>
          <circle cx="7" cy="7" r="1.5" fill="currentColor" stroke="none"/>
        </svg>
        <!-- Zoom icon -->
        <svg v-else-if="item.icon === 'zoom'" class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
          <circle cx="11" cy="11" r="7"/>
          <path d="M21 21l-4.35-4.35"/>
          <path d="M11 8v6M8 11h6"/>
        </svg>
        <!-- Sparkle icon -->
        <svg v-else-if="item.icon === 'sparkle'" class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
          <path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5z"/>
          <path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z"/>
        </svg>
        <!-- Gear icon -->
        <!-- Brain icon -->
        <svg v-else-if="item.icon === 'brain'" class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
          <path d="M12 3a3.5 3.5 0 00-3.5 3.5c0 1.3.7 2.4 1.7 3H9.5C6.5 9.5 4 11 2.5 13.5 1 16.5 2.5 19 4.5 19.5c1 .2 2-.2 2.5-1L10.5 14l3.5 4.5c.5.8 1.5 1.2 2.5 1 2-.5 3.5-2.8 2-4.8-1-1.3-2.5-2.2-4-2.5H13.8c1-.6 1.7-1.7 1.7-3A3.5 3.5 0 0012 3z"/>
          <circle cx="10.5" cy="6" r="0.8" fill="currentColor" stroke="none"/>
          <circle cx="13.5" cy="6" r="0.8" fill="currentColor" stroke="none"/>
          <line x1="12" y1="9.5" x2="12" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <svg v-else-if="item.icon === 'terminal'" class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
          <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
        </svg>
        <svg v-else-if="item.icon === 'gear'" class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
        </svg>
        <span class="nav-label">{{ item.label }}</span>
      </router-link>
    </div>

    <div class="sidebar-footer">
      <div class="version-badge">v0.1</div>
    </div>
  </nav>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: var(--sidebar-width);
  background-color: var(--bg-sidebar);
  border-right: 1px solid var(--border-subtle);
  flex-shrink: 0;
  padding: 10px 0;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 8px;
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  height: 56px;
  border-radius: var(--radius-sm);
  text-decoration: none;
  color: var(--text-tertiary);
  transition: all var(--transition-base);
  cursor: pointer;
  position: relative;
}

.nav-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 0;
  background: var(--accent-primary);
  border-radius: 0 3px 3px 0;
  transition: height var(--transition-base);
}

.nav-item:hover {
  background: var(--glass-bg);
  color: var(--text-secondary);
}

.nav-item.active {
  background: var(--accent-bg);
  color: var(--accent-primary);
}

.nav-item.active::before {
  height: 20px;
}

.nav-icon {
  width: 20px;
  height: 20px;
  transition: transform var(--transition-base);
}

.nav-item:hover .nav-icon {
  transform: scale(1.1);
}

.nav-label {
  font-size: 10px;
  white-space: nowrap;
  line-height: 1;
  font-weight: 500;
}

.sidebar-footer {
  display: flex;
  justify-content: center;
  padding: 8px;
}

.version-badge {
  font-size: 10px;
  font-weight: 500;
  color: var(--text-tertiary);
  background: var(--glass-bg);
  padding: 3px 10px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-subtle);
}
</style>
