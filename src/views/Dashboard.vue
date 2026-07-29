<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import BrandHero from '@/components/dashboard/BrandHero.vue'
import DashboardRecentWork from '@/components/dashboard/DashboardRecentWork.vue'
import SystemMonitor from '@/components/monitor/SystemMonitor.vue'
import { getContinueAction, getDashboardSnapshot } from '@/features/dashboard/dashboard-summary'
import { useAppStore } from '@/stores/app'
import { useGalleryStore } from '@/stores/gallery'
import { usePipelineStore } from '@/stores/pipeline'

const router = useRouter()
const appStore = useAppStore()
const galleryStore = useGalleryStore()
const pipelineStore = usePipelineStore()

const summaryInput = computed(() => ({
  imageCount: galleryStore.roots.reduce((sum, root) => sum + (root.image_count ?? 0), 0),
  datasetCount: galleryStore.datasets.length,
  activeTaskName: pipelineStore.currentTask?.name ?? null,
}))

const continueAction = computed(() => getContinueAction(summaryInput.value))
const snapshot = computed(() => getDashboardSnapshot(summaryInput.value))

function continueWork() {
  void router.push(continueAction.value.route)
}

function navigate(route: string) {
  void router.push(route)
}

onMounted(() => {
  galleryStore.loadRoots()
  galleryStore.loadDatasets()
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
        :items="snapshot"
        :task="pipelineStore.currentTask"
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
  grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.75fr);
  gap: clamp(28px, 4vw, 60px);
  margin-top: -24px;
  margin-inline: clamp(16px, 2.5vw, 36px);
  padding: clamp(24px, 3vw, 42px);
  border: 1px solid var(--line-subtle);
  border-radius: var(--radius-panel);
  background: var(--surface-primary);
  box-shadow: var(--surface-shadow);
}

.system-summary {
  min-width: 0;
  padding-left: clamp(22px, 3vw, 42px);
  border-left: 1px solid var(--line-subtle);
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

@media (max-width: 1160px) {
  .dashboard-sheet {
    grid-template-columns: 1fr;
    gap: 30px;
  }

  .system-summary {
    padding-top: 28px;
    padding-left: 0;
    border-top: 1px solid var(--line-subtle);
    border-left: 0;
  }
}

@media (max-width: 760px) {
  .dashboard-sheet {
    margin-inline: 10px;
    padding: 22px 20px;
  }
}
</style>
