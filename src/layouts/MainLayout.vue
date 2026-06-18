<script setup lang="ts">
import TitleBar from '@/components/titlebar/TitleBar.vue'
import TopMenuBar from '@/components/sidebar/TopMenuBar.vue'
import StatusBar from '@/components/statusbar/StatusBar.vue'
</script>

<template>
  <div class="main-layout bg-grid">
    <!-- Global sakura petals -->
    <div class="sakura-global" aria-hidden="true">
      <span
        v-for="i in 24"
        :key="i"
        class="petal"
        :style="{
          left: ((i * 4.37 + (i % 3) * 2.1) % 100) + '%',
          animationDelay: ((i * 0.6 + (i % 7) * 1.4) % 14) + 's',
          animationDuration: (6 + (i % 5) * 2.5) + 's',
          fontSize: (9 + (i % 6) * 5) + 'px',
          opacity: 0.2 + (i % 5) * 0.14,
        }">🌸</span>
    </div>

    <TitleBar />
    <TopMenuBar />
    <div class="main-body">
      <main class="main-content">
        <slot />
      </main>
    </div>
    <StatusBar />
  </div>
</template>

<style scoped>
.main-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background-color: var(--bg-primary);
  border-radius: 12px;
}

.main-body {
  display: flex;
  flex: 1;
  overflow: hidden;
  position: relative;
}

.main-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 24px 28px;
  position: relative;
  z-index: 1;
  border-radius: 0 0 10px 0;
}
</style>

<style>
/* Global sakura petals — non-scoped so keyframes work globally */
.sakura-global {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  overflow: hidden;
}

.petal {
  position: absolute;
  top: -30px;
  animation: sakura-fall linear infinite;
  filter: blur(0.6px);
  user-select: none;
}

@keyframes sakura-fall {
  0% {
    transform: translateY(-30px) translateX(0) rotate(0deg);
    opacity: 0;
  }
  6% {
    opacity: 0.65;
  }
  50% {
    transform: translateY(50vh) translateX(35px) rotate(200deg);
  }
  88% {
    opacity: 0.45;
  }
  100% {
    transform: translateY(105vh) translateX(-15px) rotate(380deg);
    opacity: 0;
  }
}
</style>
