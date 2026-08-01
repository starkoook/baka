<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import BrandHero from '@/components/dashboard/BrandHero.vue'
import DashboardRecentWork from '@/components/dashboard/DashboardRecentWork.vue'
import SystemMonitor from '@/components/monitor/SystemMonitor.vue'
import {
  getContinueAction,
  getDashboardSnapshot,
  resolveDashboardRoute,
} from '@/features/dashboard/dashboard-summary'
import { useDashboardScrollHandoff } from '@/features/dashboard/dashboard-scroll-handoff'
import { getRememberedWorkspace, loadLastWorkspace } from '@/features/navigation/workspace-history'
import { useAppStore } from '@/stores/app'
import { useGalleryStore } from '@/stores/gallery'
import { usePipelineStore } from '@/stores/pipeline'
import { useTaggerStore } from '@/stores/tagger'

const router = useRouter()
const appStore = useAppStore()
const galleryStore = useGalleryStore()
const pipelineStore = usePipelineStore()
const taggerStore = useTaggerStore()
const rememberedWorkspace = getRememberedWorkspace(loadLastWorkspace())
const dashboardPage = ref<HTMLElement | null>(null)
const handoffProgress = useDashboardScrollHandoff(dashboardPage)

const handoffStyle = computed(() => ({
  '--handoff-progress': handoffProgress.value,
  '--hero-shift': `${-32 * handoffProgress.value}px`,
  '--hero-scale': 1 - 0.05 * handoffProgress.value,
  '--hero-opacity': 1 - 0.14 * handoffProgress.value,
  '--hero-saturation': 1 - 0.12 * handoffProgress.value,
  '--ambient-opacity': 0.08 + 0.12 * handoffProgress.value,
  '--workspace-shift': `${48 - 68 * handoffProgress.value}px`,
  '--workspace-scale': 0.96 + 0.04 * handoffProgress.value,
}))

const summaryInput = computed(() => ({
  imageCount: galleryStore.roots.reduce((sum, root) => sum + (root.image_count ?? 0), 0),
  datasetCount: galleryStore.datasets.length,
  unfinishedAnnotationCount: taggerStore.queue.filter((item) => item.status !== 'reviewed').length,
  activeTaskName: pipelineStore.currentTask?.name ?? null,
  rememberedWorkspace,
}))

const continueAction = computed(() => getContinueAction(summaryInput.value))
const snapshot = computed(() => getDashboardSnapshot(summaryInput.value))
const displayTask = computed(() => {
  const name = pipelineStore.currentTask?.name.trim()
  if (!name || !pipelineStore.currentTask) return null
  return { ...pipelineStore.currentTask, name }
})

function getRegisteredRoute(route: string) {
  return resolveDashboardRoute(route, (candidate) => router.resolve(candidate).matched.length > 0)
}

function continueWork() {
  void router.push(getRegisteredRoute(continueAction.value.route))
}

function navigate(route: string) {
  void router.push(getRegisteredRoute(route))
}

onMounted(() => {
  galleryStore.loadRoots()
  galleryStore.loadDatasets()
  taggerStore.restoreSession()
})
</script>

<template>
  <main ref="dashboardPage" class="dashboard-page" :style="handoffStyle">
    <div class="dashboard-ambient" aria-hidden="true"></div>
    <div class="dashboard-hero-layer">
      <BrandHero
        :action-label="continueAction.label"
        :show-artwork="appStore.showMascot"
        @action="continueWork"
      />
    </div>

    <div class="dashboard-workspace-layer">
      <DashboardRecentWork
        :action="continueAction"
        :items="snapshot"
        :task="displayTask"
        @navigate="navigate"
      />

      <section class="system-summary" aria-labelledby="system-summary-title">
        <header>
          <span>设备状态</span>
          <h2 id="system-summary-title">系统监控</h2>
        </header>
        <SystemMonitor class="dashboard-system" />
      </section>
    </div>

    <div class="dashboard-scroll-tail" aria-hidden="true"></div>
  </main>
</template>

<style scoped>
.dashboard-page {
  --handoff-progress: 0;
  --hero-shift: 0px;
  --hero-scale: 1;
  --hero-opacity: 1;
  --hero-saturation: 1;
  --ambient-opacity: 0.08;
  --workspace-shift: 48px;
  --workspace-scale: 0.96;
  position: relative;
  width: min(100%, 1400px);
  min-height: calc(100vh + 240px);
  margin: 0 auto;
  padding-bottom: 28px;
  perspective: 1200px;
}

.dashboard-ambient {
  position: absolute;
  z-index: 0;
  inset: 44% 8% auto;
  height: 240px;
  border-radius: 50%;
  pointer-events: none;
  opacity: var(--ambient-opacity);
  background: var(--brand-primary);
  filter: blur(110px);
}

.dashboard-hero-layer {
  position: sticky;
  z-index: 1;
  top: 0;
  opacity: var(--hero-opacity);
  transform: translateY(var(--hero-shift)) scale(var(--hero-scale));
  transform-origin: center top;
  filter: saturate(var(--hero-saturation));
  transition: opacity 80ms linear, filter 80ms linear;
}

.dashboard-workspace-layer {
  position: relative;
  z-index: 3;
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(300px, 0.65fr);
  align-items: start;
  gap: 14px;
  margin: clamp(-112px, -10vh, -78px) clamp(16px, 2.5vw, 36px) 0;
  transform: translateY(var(--workspace-shift)) scale(var(--workspace-scale));
  transform-origin: center top;
}

.dashboard-scroll-tail {
  height: clamp(160px, 24vh, 240px);
}

.system-summary {
  position: relative;
  z-index: 1;
  min-width: 0;
  padding: clamp(22px, 3vw, 36px);
  border-radius: var(--radius-panel);
  background: color-mix(in srgb, var(--surface-primary) 88%, var(--brand-soft));
  box-shadow: var(--surface-shadow);
  transform-origin: right center;
  transition: transform 180ms ease, opacity 180ms ease, filter 180ms ease;
}

.system-summary header {
  min-height: 48px;
  margin-bottom: 10px;
}

.system-summary header span {
  display: block;
  margin-bottom: 5px;
  color: var(--ink-tertiary);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
}

.system-summary h2 {
  margin: 0;
  color: var(--ink-primary);
  font-size: 21px;
  line-height: 1.25;
}

.dashboard-system {
  gap: 14px;
}

.dashboard-system :deep(.mon-card) {
  padding: 12px 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  transform: none;
}

.dashboard-system :deep(.mon-card:hover) {
  border: 0;
  background: transparent;
  box-shadow: none;
  transform: none;
}

.dashboard-system :deep(.mon-ic) {
  display: none;
}

@media (hover: hover) and (pointer: fine) {
  .dashboard-workspace-layer:has(.recent-work:hover) .system-summary,
  .dashboard-workspace-layer:has(.system-summary:hover) .recent-work {
    opacity: 0.72;
    filter: saturate(0.72);
    transform: scale(0.985);
  }

  .system-summary:hover {
    z-index: 4;
    transform: translateY(-4px) scale(1.018);
  }
}

.dashboard-workspace-layer:has(.recent-work:focus-within) .recent-work {
  opacity: 1;
  filter: none;
  z-index: 4;
  transform: translateY(-4px) scale(1.012);
}

.dashboard-workspace-layer:has(.recent-work:focus-within) .system-summary {
  z-index: 1;
  opacity: 0.72;
  filter: saturate(0.72);
  transform: scale(0.985);
}

@media (max-width: 1160px) {
  .dashboard-workspace-layer {
    grid-template-columns: 1fr;
    gap: 14px;
  }

  .system-summary {
    transform-origin: center;
  }
}

@media (max-width: 760px) {
  .dashboard-workspace-layer {
    margin-inline: 10px;
  }
}

@media (max-height: 720px) {
  .dashboard-page {
    min-height: calc(100vh + 190px);
  }

  .dashboard-scroll-tail {
    height: 150px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dashboard-page {
    min-height: auto;
  }

  .dashboard-hero-layer,
  .dashboard-workspace-layer {
    position: relative;
    opacity: 1;
    filter: none;
    transform: none;
    transition: none;
  }

  .dashboard-scroll-tail {
    display: none;
  }

  .system-summary,
  .dashboard-workspace-layer .recent-work {
    transition: none;
  }

  .dashboard-workspace-layer:has(.recent-work:focus-within) .recent-work,
  .dashboard-workspace-layer:has(.recent-work:focus-within) .system-summary,
  .dashboard-workspace-layer:has(.recent-work:hover) .system-summary,
  .dashboard-workspace-layer:has(.system-summary:hover) .recent-work,
  .system-summary:hover {
    opacity: 1;
    filter: none;
    transform: none;
  }
}
</style>
