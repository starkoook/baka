<script setup lang="ts">
import TitleBar from '@/components/titlebar/TitleBar.vue'
import TopMenuBar from '@/components/sidebar/TopMenuBar.vue'
import StatusBar from '@/components/statusbar/StatusBar.vue'
</script>

<template>
  <div class="main-layout bg-grid">
    <!-- Ambient glow pools -->
    <div class="ambient-glow" aria-hidden="true">
      <div class="ambient-spot" style="top:8%;left:15%;width:520px;height:520px;--c:rgba(244,114,182,0.07)"></div>
      <div class="ambient-spot" style="bottom:10%;right:8%;width:420px;height:420px;--c:rgba(251,146,60,0.05);animation-delay:-5s"></div>
      <div class="ambient-spot" style="top:50%;left:70%;width:360px;height:360px;--c:rgba(244,114,182,0.04);animation-delay:-10s"></div>
    </div>

    <!-- Subtle noise texture -->
    <div class="noise-layer" aria-hidden="true"></div>

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

/* ═══ Ambient glow ── */
.ambient-glow { position: fixed; inset: 0; pointer-events: none; z-index: 0; overflow: hidden; }
.ambient-spot {
  position: absolute;
  border-radius: 50%;
  background: radial-gradient(circle, var(--c) 0%, transparent 70%);
  animation: ambient-pulse 12s ease-in-out infinite alternate;
}
@keyframes ambient-pulse {
  0% { transform: scale(1) translate(0, 0); opacity: 0.6; }
  100% { transform: scale(1.25) translate(25px, -15px); opacity: 1; }
}

/* ═══ Noise texture overlay ── */
.noise-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  opacity: 0.025;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-repeat: repeat;
  background-size: 192px 192px;
}
[data-theme="light"] .noise-layer { opacity: 0.015; mix-blend-mode: multiply; }

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
