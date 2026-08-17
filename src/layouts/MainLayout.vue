<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import TitleBar from '@/components/titlebar/TitleBar.vue'
import AppSidebar from '@/components/sidebar/AppSidebar.vue'
import StatusBar from '@/components/statusbar/StatusBar.vue'
import ToolPicker from '@/components/sidebar/ToolPicker.vue'

const route = useRoute()
const lockPageScroll = computed(() => route.path === '/gallery' || route.path === '/tagger')
</script>

<template>
  <div class="main-layout">
    <TitleBar />
    <div class="app-workspace">
      <AppSidebar />
      <main class="main-content" :class="{ 'scroll-locked': lockPageScroll }">
        <slot />
      </main>
    </div>
    <StatusBar />
    <ToolPicker />
  </div>
</template>

<style scoped>
.main-layout {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--app-bg);
  border-radius: 12px;
}

.app-workspace {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.main-content {
  position: relative;
  min-width: 0;
  overflow: auto;
  padding: 24px 28px 36px;
}

.main-content.scroll-locked {
  overflow: hidden;
  padding: 6px 8px 8px;
}

@media (prefers-reduced-motion: reduce) {
  .main-content { scroll-behavior: auto; }
}

@media (max-width: 1200px) {
  .app-workspace { grid-template-columns: 72px minmax(0, 1fr); }
  .main-content { padding-inline: 20px; }
}
</style>
