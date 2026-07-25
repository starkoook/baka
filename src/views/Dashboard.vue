<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useGalleryStore } from '@/stores/gallery'
import { usePipelineStore } from '@/stores/pipeline'
import Mascot from '@/components/monitor/Mascot.vue'
import SystemMonitor from '@/components/monitor/SystemMonitor.vue'

const router = useRouter()
const appStore = useAppStore()
const galleryStore = useGalleryStore()
const pipelineStore = usePipelineStore()

const imageCount = computed(() =>
  galleryStore.roots.reduce((sum, root) => sum + (root.image_count ?? 0), 0),
)
const datasetCount = computed(() => galleryStore.datasets.length)

const modules = computed(() => [
  {
    icon: '📷',
    title: '图库与标注',
    description: '整理素材、批量识别标签',
    status: imageCount.value > 0 ? `${imageCount.value} 张` : '等待导入',
    route: '/gallery',
  },
  {
    icon: '✨',
    title: '提示词反推',
    description: '本地标签、自然描述、绘图提示词',
    status: '可使用',
    route: '/reverse',
  },
  {
    icon: '🧠',
    title: '训练中心',
    description: '环境安装、参数设置、训练进度',
    status: datasetCount.value > 0 ? `${datasetCount.value} 个数据集` : '等待数据集',
    route: '/training',
  },
])

const continueTarget = computed(() => datasetCount.value > 0 || pipelineStore.currentTask ? '/training' : '/gallery')
const continueText = computed(() => {
  if (pipelineStore.currentTask) return `继续 ${pipelineStore.currentTask.name}`
  if (datasetCount.value > 0) return '继续准备训练'
  return '继续整理素材'
})

onMounted(() => {
  galleryStore.loadRoots()
  galleryStore.loadDatasets()
})
</script>

<template>
  <main class="dashboard-cabin">
    <header class="cabin-heading">
      <div>
        <span class="cabin-code">SYS-LN // PERSONAL WORKSPACE</span>
        <h1><span>✨</span> Baka TOOLS</h1>
      </div>
      <div class="online-state"><i></i> 工作舱已就绪</div>
    </header>

    <section class="main-grid" :class="{ 'mascot-hidden': !appStore.showMascot }">
      <article class="cabin module-cabin">
        <span class="cabin-label">/// FUNCTION MODULES</span>
        <button
          v-for="module in modules"
          :key="module.route"
          class="module-row"
          @click="router.push(module.route)"
        >
          <span class="module-icon">{{ module.icon }}</span>
          <span class="module-copy">
            <strong>{{ module.title }}</strong>
            <small>{{ module.description }}</small>
          </span>
          <span class="module-status">{{ module.status }}</span>
          <span class="module-arrow">›</span>
        </button>
      </article>

      <article v-if="appStore.showMascot" class="cabin mascot-cabin">
        <span class="cabin-label">/// BAKA COMPANION</span>
        <span class="mascot-greeting">喂，今天也别偷懒呀～</span>
        <div class="mascot-stage">
          <div class="holo-grid"></div>
          <div class="holo-floor"></div>
          <Mascot class="dashboard-mascot" />
        </div>
        <div class="continue-box">
          <span>
            <small>上次停在</small>
            <strong>{{ continueText }}</strong>
          </span>
          <button class="continue-button" @click="router.push(continueTarget)">继续工作 <b>→</b></button>
        </div>
      </article>
    </section>

    <section class="bottom-grid">
      <article class="cabin task-cabin">
        <span class="cabin-label">/// ACTIVE TASK</span>
        <template v-if="pipelineStore.currentTask">
          <div class="task-header">
            <span>
              <small>正在运行</small>
              <strong>{{ pipelineStore.currentTask.name }}</strong>
            </span>
            <b>{{ pipelineStore.currentTask.progress }}%</b>
          </div>
          <div class="task-track"><i :style="{ width: `${pipelineStore.currentTask.progress}%` }"></i></div>
          <div class="task-meta">
            <span>{{ pipelineStore.currentTask.speed }}</span>
            <span>预计 {{ pipelineStore.currentTask.eta }}</span>
          </div>
        </template>
        <div v-else class="empty-task">
          <span class="signal-icon">⌁</span>
          <span>
            <strong>当前没有运行任务</strong>
            <small>启动标注、环境安装或训练后，这里会显示实时进度。</small>
          </span>
        </div>
      </article>

      <article class="cabin system-cabin">
        <span class="cabin-label">/// SYSTEM HEALTH</span>
        <SystemMonitor />
      </article>
    </section>
  </main>
</template>

<style scoped>
.dashboard-cabin {
  width: min(100%, 1400px);
  margin: 0 auto;
  padding: 4px 0 28px;
  color: var(--text-primary);
}

.cabin-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 14px;
  padding: 4px 2px 12px;
  border-bottom: 1px solid rgba(var(--accent-primary-rgb), 0.16);
}

.cabin-code,
.cabin-label {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.12em;
  color: rgba(var(--accent-primary-rgb), 0.42);
}

.cabin-heading h1 {
  margin: 5px 0 0;
  font-size: clamp(24px, 3vw, 34px);
  line-height: 1;
  letter-spacing: -0.03em;
  background: var(--gradient-accent);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.cabin-heading h1 span { -webkit-text-fill-color: initial; font-size: 0.8em; }

.online-state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 2px;
  color: var(--text-tertiary);
  font-size: 11px;
}

.online-state i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent-success);
  box-shadow: 0 0 10px var(--accent-success);
}

.main-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(300px, 0.75fr);
  gap: 14px;
}

.main-grid.mascot-hidden { grid-template-columns: 1fr; }

.bottom-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.75fr);
  gap: 14px;
  margin-top: 14px;
}

.cabin {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  background: var(--cabin-bg);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.025), var(--shadow-sm);
}

.cabin::before,
.cabin::after {
  content: '';
  position: absolute;
  width: 12px;
  height: 12px;
  pointer-events: none;
  z-index: 3;
}

.cabin::before {
  top: 0;
  left: 0;
  border-top: 2px solid rgba(var(--accent-primary-rgb), 0.42);
  border-left: 2px solid rgba(var(--accent-primary-rgb), 0.42);
}

.cabin::after {
  right: 0;
  bottom: 0;
  border-right: 2px solid rgba(var(--accent-primary-rgb), 0.3);
  border-bottom: 2px solid rgba(var(--accent-primary-rgb), 0.3);
}

.cabin-label {
  position: absolute;
  top: 10px;
  right: 14px;
  z-index: 4;
}

.module-cabin { padding: 30px 18px 10px; }

.module-row {
  width: 100%;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 13px;
  padding: 16px 4px;
  border: 0;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-primary);
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: padding var(--transition-base), background var(--transition-base);
}

.module-row:last-child { border-bottom: 0; }
.module-row:hover { padding-left: 10px; padding-right: 10px; background: rgba(var(--accent-primary-rgb), 0.05); }

.module-icon {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(var(--accent-primary-rgb), 0.2);
  border-radius: var(--radius-sm);
  background: linear-gradient(135deg, rgba(var(--accent-primary-rgb), 0.16), rgba(var(--accent-secondary-rgb), 0.06));
  font-size: 18px;
}

.module-copy { min-width: 0; }
.module-copy strong,
.module-copy small { display: block; }
.module-copy strong { font-size: 14px; }
.module-copy small { margin-top: 5px; color: var(--text-tertiary); font-size: 11px; }
.module-status { color: var(--accent-primary); font: 10px var(--font-mono); }
.module-arrow { color: var(--text-tertiary); font-size: 22px; transition: transform var(--transition-base); }
.module-row:hover .module-arrow { transform: translateX(3px); color: var(--accent-primary); }

.mascot-cabin {
  min-height: 330px;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  padding: 30px 16px 14px;
}

.mascot-greeting {
  position: absolute;
  top: 42px;
  left: 16px;
  z-index: 5;
  padding: 6px 11px;
  border: 1px solid rgba(var(--accent-primary-rgb), 0.2);
  border-radius: var(--radius-full);
  color: var(--text-secondary);
  background: var(--glass-bg);
  backdrop-filter: blur(10px);
  font-size: 11px;
}

.mascot-stage {
  min-height: 240px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  position: relative;
}

.holo-grid {
  position: absolute;
  inset: 26% 4% 0;
  opacity: 0.6;
  background-image:
    linear-gradient(rgba(var(--accent-primary-rgb), 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(var(--accent-primary-rgb), 0.05) 1px, transparent 1px);
  background-size: 20px 20px;
  mask-image: linear-gradient(to top, rgba(0, 0, 0, 0.8), transparent);
  -webkit-mask-image: linear-gradient(to top, rgba(0, 0, 0, 0.8), transparent);
}

.holo-floor {
  position: absolute;
  bottom: 7px;
  width: 150px;
  height: 26px;
  border: 2px solid rgba(var(--accent-primary-rgb), 0.3);
  border-radius: 50%;
  box-shadow: 0 0 24px rgba(var(--accent-primary-rgb), 0.18);
}

.dashboard-mascot { position: relative; z-index: 2; transform: scale(1.08); transform-origin: center bottom; }

.continue-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
  position: relative;
  z-index: 4;
}

.continue-box > span small,
.continue-box > span strong { display: block; }
.continue-box > span small { color: var(--text-tertiary); font-size: 9px; }
.continue-box > span strong { margin-top: 3px; font-size: 12px; }

.continue-button {
  padding: 8px 13px;
  border: 1px solid rgba(var(--accent-primary-rgb), 0.3);
  border-radius: var(--radius-sm);
  color: var(--accent-primary);
  background: rgba(var(--accent-primary-rgb), 0.1);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.continue-button:hover { background: var(--accent-primary); color: #fff; }
.continue-button b { margin-left: 8px; }

.task-cabin,
.system-cabin { min-height: 166px; padding: 34px 18px 16px; }

.empty-task {
  min-height: 104px;
  display: flex;
  align-items: center;
  gap: 14px;
}

.signal-icon {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border: 1px solid rgba(var(--accent-primary-rgb), 0.18);
  border-radius: 50%;
  color: var(--accent-primary);
  background: rgba(var(--accent-primary-rgb), 0.07);
  font-size: 22px;
}

.empty-task strong,
.empty-task small { display: block; }
.empty-task strong { font-size: 13px; }
.empty-task small { margin-top: 6px; color: var(--text-tertiary); font-size: 11px; }

.task-header,
.task-meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.task-header small,
.task-header strong { display: block; }
.task-header small { color: var(--text-tertiary); font-size: 9px; }
.task-header strong { margin-top: 4px; font-size: 13px; }
.task-header > b { color: var(--accent-primary); font: 700 18px var(--font-mono); }
.task-track { height: 7px; margin: 16px 0 10px; overflow: hidden; border-radius: 99px; background: var(--glass-bg); }
.task-track i { display: block; height: 100%; border-radius: inherit; background: var(--gradient-accent); }
.task-meta { color: var(--text-tertiary); font: 10px var(--font-mono); }

.system-cabin :deep(.mon-set) { gap: 8px; }
.system-cabin :deep(.mon-card) { padding: 8px 10px; }
.system-cabin :deep(.mon-ic) { width: 32px; height: 32px; font-size: 15px; }
.system-cabin :deep(.mon-val) { font-size: 15px; }
.system-cabin :deep(.mon-sub) { display: none; }

[data-theme="light"] .cabin {
  background: rgba(255, 255, 255, 0.62);
  border-color: rgba(236, 72, 153, 0.16);
  box-shadow: 0 8px 24px rgba(236, 72, 153, 0.09);
}

@media (max-width: 980px) {
  .main-grid,
  .bottom-grid { grid-template-columns: 1fr; }
  .mascot-cabin { min-height: 310px; }
}

@media (max-width: 620px) {
  .cabin-heading { align-items: flex-start; flex-direction: column; }
  .module-status { display: none; }
  .module-row { grid-template-columns: auto minmax(0, 1fr) auto; }
  .mascot-greeting { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .module-row,
  .module-arrow,
  .continue-button { transition: none; }
}
</style>
