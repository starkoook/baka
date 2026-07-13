<script setup lang="ts">
import { useAppStore } from '@/stores/app'
import Card from '@/components/common/Card.vue'
import SystemMonitor from '@/components/monitor/SystemMonitor.vue'
import PipelineBoard from '@/components/monitor/PipelineBoard.vue'
import Mascot from '@/components/monitor/Mascot.vue'

const appStore = useAppStore()

const modules = [
  { title: '图库 & 标注', description: 'WD14 / LLM 智能标注动漫标签', icon: 'tag', to: '/gallery', available: true },
  { title: '超分放大', description: 'waifu2x / Real-ESRGAN 超分降噪', icon: 'zoom', to: '/upscale', available: false },
  { title: 'AI 生成', description: 'Gemini / NovelAI 云端图像生成', icon: 'sparkle', to: '/generate', available: false },
]
</script>

<template>
  <div class="dash-root">
    <!-- ═══ HERO CABIN ═══ -->
    <div class="cabin hero-cabin">
      <div class="cabin-corner tl"></div><div class="cabin-corner tr"></div>
      <div class="cabin-corner bl"></div><div class="cabin-corner br"></div>
      <span class="cabin-code">SYS-LN_2026</span>
      <h1 class="hero-title">
        <span class="text-gradient">✨ Baka TOOLS</span>
      </h1>
      <p class="hero-sub">喂！杂鱼，该给Baka大人擦皮鞋了</p>
      <span class="hero-status">[OP_STATUS: AWAITING_INPUT]</span>
    </div>

    <div class="dash-grid">
      <!-- ═══ LEFT COLUMN ═══ -->
      <div class="dash-left">
        <!-- MODULES CABIN -->
        <div class="cabin modules-cabin">
          <div class="cabin-corner tl"></div><div class="cabin-corner tr"></div>
          <span class="cabin-label">/// FUNCTION_MODULES</span>
          <div class="cards-list">
            <Card
              v-for="(m, i) in modules" :key="m.to"
              :title="m.title" :description="m.description"
              :icon="m.icon" :to="m.to" :disabled="!m.available" :index="i"
            />
          </div>
        </div>

        <!-- QUICK ACTIONS CABIN -->
        <div class="cabin quick-cabin">
          <span class="cabin-label">/// QUICK_ACTIONS</span>
          <div class="quick-acts">
            <button class="qa-btn card-entrance" v-for="(btn, i) in ['📦 批量处理','📋 浏览历史','⏰ 定时任务']" :key="btn"
              :style="{ animationDelay: (0.5 + i * 0.08) + 's' }" disabled>{{ btn }}</button>
          </div>
        </div>
      </div>

      <!-- ═══ RIGHT COLUMN ═══ -->
      <div class="dash-right">
        <!-- PIPELINE CABIN -->
        <div class="cabin pipe-cabin">
          <div class="cabin-corner tl"></div><div class="cabin-corner tr"></div>
          <span class="cabin-label">/// ACTIVE_PIPELINE</span>
          <PipelineBoard />
        </div>

        <!-- SYSTEM + MASCOT ROW -->
        <div class="sys-mascot-row">
          <div class="cabin sys-cabin">
            <span class="cabin-label">/// SYSTEM_HEALTH</span>
            <SystemMonitor />
          </div>
          <!-- HOLOGRAM POD -->
          <div class="holo-pod" v-if="appStore.showMascot">
            <div class="holo-floor"></div>
            <div class="holo-grid"></div>
            <div class="holo-ring"></div>
            <div class="holo-mascot">
              <Mascot />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dash-root { max-width: 1400px; margin: 0 auto; }

/* ═══ CABIN BASE ═══ */
.cabin {
  position: relative;
  background: var(--cabin-bg);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  padding: 20px;
  overflow: hidden;
  transition: border-color 0.4s;
}
.cabin:hover { border-color: var(--border-accent); }

/* Corner pixel decorations */
.cabin-corner { position: absolute; width: 10px; height: 10px; pointer-events: none; z-index: 2; }
.cabin-corner.tl { top: 0; left: 0; border-top: 2px solid rgba(var(--accent-primary-rgb),0.25); border-left: 2px solid rgba(var(--accent-primary-rgb),0.25); }
.cabin-corner.tr { top: 0; right: 0; border-top: 2px solid rgba(var(--accent-primary-rgb),0.25); border-right: 2px solid rgba(var(--accent-primary-rgb),0.25); }
.cabin-corner.bl { bottom: 0; left: 0; border-bottom: 2px solid rgba(var(--accent-primary-rgb),0.25); border-left: 2px solid rgba(var(--accent-primary-rgb),0.25); }
.cabin-corner.br { bottom: 0; right: 0; border-bottom: 2px solid rgba(var(--accent-primary-rgb),0.25); border-right: 2px solid rgba(var(--accent-primary-rgb),0.25); }
.cabin-label { position: absolute; top: 8px; right: 14px; font-family: var(--font-mono); font-size: 9px; color: rgba(var(--accent-primary-rgb),0.3); letter-spacing: 0.1em; pointer-events: none; z-index: 2; }
.cabin-code { position: absolute; top: 8px; left: 14px; font-family: var(--font-mono); font-size: 9px; color: rgba(var(--accent-primary-rgb),0.35); letter-spacing: 0.08em; pointer-events: none; z-index: 2; }

/* ═══ HERO ═══ */
.hero-cabin { margin-bottom: 16px; text-align: center; padding: 20px 20px 16px; }
.hero-title { font-size: 32px; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 4px; }
.hero-sub { font-size: 13px; color: var(--text-tertiary); margin-bottom: 6px; }
.hero-status { font-family: var(--font-mono); font-size: 9px; color: rgba(var(--accent-primary-rgb),0.2); letter-spacing: 0.06em; }

/* ═══ GRID ═══ */
.dash-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (min-width: 1400px) {
  .dash-grid { grid-template-columns: 1fr 1fr; gap: 20px; }
  .hero-title { font-size: 44px; }
}
.dash-left { display: flex; flex-direction: column; gap: 14px; }
.dash-right { display: flex; flex-direction: column; gap: 14px; }

/* ═══ MODULES ═══ */
.modules-cabin { padding-top: 28px; }
.cards-list { display: flex; flex-direction: column; gap: 8px; }

/* ═══ QUICK ACTIONS ═══ */
.quick-cabin { padding-top: 28px; }
.quick-acts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.qa-btn {
  display: flex; align-items: center; justify-content: center; gap: 4px;
  padding: 12px 10px;
  background: var(--hud-bg); border: 1px solid rgba(255,255,255,0.04);
  border-radius: var(--radius-sm);
  box-shadow: inset 0 4px 12px rgba(0,0,0,0.5);
  color: var(--text-tertiary); font-size: 12px; font-weight: 500;
  font-family: var(--font-sans); cursor: not-allowed; opacity: 0.6;
  transition: all 0.3s;
}
.qa-btn:hover { border-color: rgba(var(--accent-primary-rgb),0.15); box-shadow: inset 0 4px 12px rgba(0,0,0,0.5), 0 0 15px rgba(var(--accent-primary-rgb),0.1); opacity: 0.85; }

/* ═══ PIPELINE ═══ */
.pipe-cabin { padding-top: 28px; }

/* ═══ SYSTEM + MASCOT ═══ */
.sys-mascot-row { display: grid; grid-template-columns: 1fr auto; gap: 14px; align-items: stretch; }
.sys-cabin { padding-top: 28px; }

/* ═══ HOLOGRAM POD ═══ */
.holo-pod {
  position: relative;
  width: 160px; min-height: 220px;
  display: flex; flex-direction: column; align-items: center; justify-content: flex-end;
  overflow: hidden;
}
.holo-floor {
  position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
  width: 80px; height: 80px; border-radius: 50%;
  background: radial-gradient(ellipse, rgba(var(--accent-primary-rgb),0.15) 0%, transparent 70%);
}
.holo-grid {
  position: absolute; inset: 0;
  background-image:
    linear-gradient(rgba(var(--accent-primary-rgb),0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(var(--accent-primary-rgb),0.03) 1px, transparent 1px);
  background-size: 20px 20px;
  mask-image: linear-gradient(to top, rgba(0,0,0,0.3) 0%, transparent 60%);
  -webkit-mask-image: linear-gradient(to top, rgba(0,0,0,0.3) 0%, transparent 60%);
}
.holo-ring {
  position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%);
  width: 100px; height: 4px;
  background: radial-gradient(ellipse, rgba(var(--accent-primary-rgb),0.25), transparent);
  border-radius: 50%;
}
.holo-mascot { position: relative; z-index: 2; }

/* ═══ Entrance ═══ */
.card-entrance { animation: dash-in 0.5s cubic-bezier(0.34,1.56,0.64,1) both; }
@keyframes dash-in { 0%{opacity:0;transform:translateY(20px) scale(0.94)} 100%{opacity:1;transform:translateY(0) scale(1)} }

/* ═══ Light theme overrides ═══ */
[data-theme="light"] .cabin {
  background: rgba(255,255,255,0.55); backdrop-filter: blur(20px) saturate(140%);
  border-color: rgba(255,0,127,0.22);
  box-shadow: 0 4px 6px rgba(74,48,52,0.02), 0 10px 25px rgba(255,182,193,0.25), inset 0 1px 2px rgba(255,255,255,0.9);
}
[data-theme="light"] .cabin-label,
[data-theme="light"] .cabin-code { color: rgba(74,53,56,0.4); }
[data-theme="light"] .cabin-corner.tl,
[data-theme="light"] .cabin-corner.tr,
[data-theme="light"] .cabin-corner.bl,
[data-theme="light"] .cabin-corner.br { border-color: rgba(255,0,127,0.3); }

[data-theme="light"] .qa-btn { background: #FFF; border-color: rgba(255,0,127,0.18); box-shadow: 0 2px 6px rgba(255,182,193,0.15); color: #4A3034; }
[data-theme="light"] .qa-btn:hover { background: #FF007F; color: #FFF; border-color: transparent; box-shadow: 0 4px 12px rgba(255,0,127,0.35); opacity: 1; }

[data-theme="light"] .hero-status { color: rgba(74,53,56,0.3); }
[data-theme="light"] .sync-value { text-shadow: 0 0 8px rgba(255,0,127,0.2); }
[data-theme="light"] .sync-label { color: #4A3034; }

</style>
