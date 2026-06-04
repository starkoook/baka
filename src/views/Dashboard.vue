<script setup lang="ts">
import { useAppStore } from '@/stores/app'
import Card from '@/components/common/Card.vue'
import SystemMonitor from '@/components/monitor/SystemMonitor.vue'
import Mascot from '@/components/monitor/Mascot.vue'

const appStore = useAppStore()

const modules = [
  { title: '图像标注', description: 'WD14 / LLM 智能标注动漫标签', icon: 'tag', to: '/tagger', available: true },
  { title: '超分放大', description: 'waifu2x / Real-ESRGAN 超分降噪', icon: 'zoom', to: '/upscale', available: false },
  { title: 'AI 生成', description: 'Gemini / NovelAI 云端图像生成', icon: 'sparkle', to: '/generate', available: false },
]
</script>

<template>
  <div class="dashboard">
    <!-- Hero -->
    <div class="hero card-entrance" style="animation-delay: 0s">
      <h1 class="hero-title">
        <span class="text-gradient">✨ Baka TOOLS</span>
      </h1>
      <p class="hero-subtitle">喂！杂鱼，该给Baka大人擦皮鞋了</p>
    </div>

    <!-- Feature Cards — icon-focused grid -->
    <div class="section">
      <h2 class="section-title card-entrance" style="animation-delay: 0.15s">功能模块</h2>
      <div class="cards-grid">
        <Card
          v-for="(m, i) in modules"
          :key="m.to"
          :title="m.title"
          :description="m.description"
          :icon="m.icon"
          :to="m.to"
          :disabled="!m.available"
          :index="i"
        />
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="section">
      <h2 class="section-title card-entrance" style="animation-delay: 0.5s">快速操作</h2>
      <div class="quick-actions">
        <button
          v-for="(btn, i) in ['📦 批量处理', '📋 浏览历史', '⏰ 定时任务']"
          :key="btn"
          class="quick-btn card-entrance"
          :style="{ animationDelay: (0.55 + i * 0.08) + 's' }"
          disabled
        >{{ btn }}</button>
      </div>
    </div>

    <!-- System Health + Mascot -->
    <div class="section">
      <h2 class="section-title card-entrance" style="animation-delay: 0.7s">💓 系统健康</h2>
      <div class="monitor-layout">
        <div class="monitor-panel glass-panel card-entrance" style="animation-delay: 0.75s">
          <SystemMonitor />
        </div>
        <div class="mascot-panel card-entrance" style="animation-delay: 0.8s" v-if="appStore.showMascot">
          <Mascot />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard { max-width: 760px; margin: 0 auto; }

/* ── Entrance animation ── */
.card-entrance {
  animation: dash-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

@keyframes dash-in {
  0% { opacity: 0; transform: translateY(20px) scale(0.94); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}

/* Hero */
.hero { margin-bottom: 40px; padding: 12px 0; }
.hero-title { font-size: 36px; font-weight: 800; margin-bottom: 6px; letter-spacing: -0.02em; }
.hero-subtitle { font-size: 14px; color: var(--text-tertiary); letter-spacing: 0.02em; }

/* Sections */
.section { margin-bottom: 32px; }
.section-title {
  font-size: 11px; font-weight: 600; color: var(--text-tertiary);
  text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 14px;
}

/* Feature cards — icon-focused grid */
.cards-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

/* Quick Actions */
.quick-actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.quick-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px 16px;
  background: var(--glass-bg);
  backdrop-filter: blur(8px);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  color: var(--text-tertiary);
  font-size: 13px;
  font-family: var(--font-sans);
  font-weight: 500;
  cursor: not-allowed;
  opacity: 0.5;
  transition: all var(--transition-base);
}

/* Status Grid */
.status-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.status-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 14px;
  background: var(--glass-bg);
  backdrop-filter: blur(12px);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  text-align: center;
}

.status-circle {
  width: 44px; height: 44px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(var(--accent-primary-rgb), 0.15), rgba(var(--accent-secondary-rgb), 0.08));
  font-size: 20px;
}

.status-label { font-size: 12px; color: var(--text-secondary); font-weight: 500; }
.status-value { font-size: 13px; font-weight: 600; color: var(--accent-success); }
.status-value.off { color: var(--text-disabled); }

/* Monitor layout */
.monitor-layout {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 16px;
  align-items: start;
}

.monitor-panel {
  padding: 18px 20px;
}

.mascot-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
</style>
