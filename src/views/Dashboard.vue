<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import BrandHero from '@/components/dashboard/BrandHero.vue'
import DashboardRecentWork from '@/components/dashboard/DashboardRecentWork.vue'
import SystemMonitor from '@/components/monitor/SystemMonitor.vue'
import { getContinueAction, getDashboardSnapshot } from '@/features/dashboard/dashboard-summary'
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

function continueWork() {
  void router.push(continueAction.value.route)
}

function navigate(route: string) {
  void router.push(route)
}

onMounted(() => {
  galleryStore.loadRoots()
  galleryStore.loadDatasets()
  taggerStore.restoreSession()
})
</script>

<template>
  <main class="dashboard-page">
    <BrandHero
      :action-label="continueAction.label"
      :show-artwork="appStore.showMascot"
      @action="continueWork"
    />

    <div class="dashboard-sheet">
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
  </main>
</template>

<style scoped>
.dashboard-page {
  width: min(100%, 1400px);
  margin: 0 auto;
  padding-bottom: 28px;
}

.dashboard-sheet {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(300px, 0.65fr);
  align-items: start;
  gap: 14px;
  margin-top: -24px;
  margin-inline: clamp(16px, 2.5vw, 36px);
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

.dashboard-system :deep(.mon-set) {
  gap: 10px;
}

.dashboard-system :deep(.mon-card) {
  padding: 12px 0;
  border-width: 0 0 1px;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  transform: none;
}

.dashboard-system :deep(.mon-card:hover) {
  border-color: var(--line-strong);
  background: transparent;
  box-shadow: none;
  transform: none;
}

.dashboard-system :deep(.mon-ic) {
  display: none;
}

@media (hover: hover) and (pointer: fine) {
  .dashboard-sheet:has(.recent-work:hover) .system-summary,
  .dashboard-sheet:has(.system-summary:hover) .recent-work {
    opacity: 0.72;
    filter: saturate(0.72);
    transform: scale(0.985);
  }

  .system-summary:hover {
    z-index: 4;
    transform: translateY(-4px) scale(1.018);
  }
}

.dashboard-sheet:has(.recent-work:focus-within) .recent-work {
  opacity: 1;
  filter: none;
  z-index: 4;
  transform: translateY(-4px) scale(1.012);
}

.dashboard-sheet:has(.recent-work:focus-within) .system-summary {
  z-index: 1;
  opacity: 0.72;
  filter: saturate(0.72);
  transform: scale(0.985);
}

@media (max-width: 1160px) {
  .dashboard-sheet {
    grid-template-columns: 1fr;
    gap: 14px;
  }

  .system-summary {
    transform-origin: center;
  }
}

@media (max-width: 760px) {
  .dashboard-sheet {
    margin-inline: 10px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .system-summary,
  .dashboard-sheet .recent-work {
    transition: none;
  }

  .dashboard-sheet:has(.recent-work:focus-within) .recent-work,
  .dashboard-sheet:has(.recent-work:focus-within) .system-summary,
  .dashboard-sheet:has(.recent-work:hover) .system-summary,
  .dashboard-sheet:has(.system-summary:hover) .recent-work,
  .system-summary:hover {
    opacity: 1;
    filter: none;
    transform: none;
  }
}
</style>
