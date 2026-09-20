<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import HeroCard from '@/components/dashboard/HeroCard.vue'
import PolaroidFan, { type PolaroidItem } from '@/components/dashboard/PolaroidFan.vue'
import SystemRings from '@/components/dashboard/SystemRings.vue'
import WorkspaceList from '@/components/dashboard/WorkspaceList.vue'
import {
  getAnnotationProgress,
  getContinueAction,
  getGreeting,
  getHeroSubline,
  resolveDashboardRoute,
} from '@/features/dashboard/dashboard-summary'
import { getRememberedWorkspace, loadLastWorkspace, loadRecentWorkspaces } from '@/features/navigation/workspace-history'
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
const recentWorkspaces = ref(loadRecentWorkspaces())
const now = new Date()
const greeting = getGreeting(now.getHours())
const dateLabel = `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()]} · ${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`

const summaryInput = computed(() => ({
  imageCount: galleryStore.roots.reduce((sum, root) => sum + (root.image_count ?? 0), 0),
  datasetCount: galleryStore.datasets.length,
  unfinishedAnnotationCount: taggerStore.queue.filter((item) => item.status !== 'reviewed').length,
  activeTaskName: pipelineStore.currentTask?.name ?? null,
  rememberedWorkspace,
}))

const continueAction = computed(() => getContinueAction(summaryInput.value))
const subline = computed(() => getHeroSubline(summaryInput.value))
const question = computed(() => {
  if (pipelineStore.currentTask) return '训练还在跑，回去看看进度？'
  if (summaryInput.value.unfinishedAnnotationCount > 0) return '接着上次的标注继续？'
  if (summaryInput.value.imageCount === 0) return '先导入第一批素材吧。'
  return '今天想从哪里开始？'
})
const progress = computed(() => getAnnotationProgress(
  taggerStore.queue.length,
  taggerStore.queue.filter((item) => item.status === 'reviewed').length,
))
const ringTitle = computed(() => {
  if (progress.value.total === 0) return '还没有标注任务'
  if (progress.value.remaining === 0) return '这批全部标完啦'
  if (progress.value.percent >= 80) return '快标完啦'
  return '标注进行中'
})
const ringText = computed(() => {
  if (progress.value.total === 0) return '从图库选一批图送去标注，这里会显示进度。'
  return `${progress.value.done} 张已确认，还剩 ${progress.value.remaining} 张。`
})
const taskPercent = computed(() => {
  const value = pipelineStore.currentTask?.progress ?? 0
  return Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : 0
})

// ── 最近加入：取最新入库的 6 张，摆成拍立得 ──
const recentItems = ref<PolaroidItem[]>([])
async function loadRecentImages() {
  if (!window.galleryAPI?.getImages) return
  try {
    const res = await window.galleryAPI.getImages({ limit: 6 })
    if (!res.success || !res.data) return
    const newestDay = res.data[0]?.indexed_at?.slice(0, 10)
    recentItems.value = res.data.map((image, index) => ({
      id: image.id,
      src: '',
      caption: image.filename.replace(/\.[^.]+$/, ''),
      isNew: index === 0 && Boolean(newestDay) && newestDay === new Date().toISOString().slice(0, 10),
    })).reverse()
    await Promise.all(recentItems.value.map(async (item) => {
      const thumb = await window.galleryAPI.getThumbnailUrl(item.id)
      if (thumb.success && thumb.data) item.src = thumb.data.url
    }))
  } catch { /* 图库未初始化时保持空态 */ }
}

function getRegisteredRoute(route: string) {
  return resolveDashboardRoute(route, (candidate) => router.resolve(candidate).matched.length > 0)
}

function navigate(route: string) {
  void router.push(getRegisteredRoute(route))
}

/** 点拍立得：进图库并定位到这张图 */
function openImageInGallery(item: PolaroidItem) {
  void router.push({ path: '/gallery', query: { focus: String(item.id) } })
}

onMounted(() => {
  galleryStore.loadRoots()
  galleryStore.loadDatasets()
  taggerStore.restoreSession()
  void loadRecentImages()
})
</script>

<template>
  <div class="dashboard">
    <span class="dashboard__spark dashboard__spark--1" aria-hidden="true">✦</span>
    <span class="dashboard__spark dashboard__spark--2" aria-hidden="true">✦</span>
    <span class="dashboard__spark dashboard__spark--3" aria-hidden="true">✦</span>

    <div class="dashboard__hero">
      <HeroCard
        :greeting="greeting"
        :question="question"
        :action-label="continueAction.label"
        :show-mascot="appStore.showMascot"
        @action="navigate(continueAction.route)"
        @open-tools="appStore.openToolPicker()"
      >
        <template #eyebrow><p class="dashboard__eyebrow">{{ dateLabel }}</p></template>
      </HeroCard>

      <button v-if="summaryInput.unfinishedAnnotationCount > 0" class="sticker is-peach dashboard__sticker dashboard__sticker--1" type="button" @click="navigate('/tagger')">
        <b>{{ summaryInput.unfinishedAnnotationCount }}</b><i>张待标注</i>
      </button>
      <button class="sticker is-mint dashboard__sticker dashboard__sticker--2" type="button" @click="navigate(pipelineStore.currentTask ? '/training/run' : '/training')">
        <i>训练</i><b>{{ pipelineStore.currentTask ? `${taskPercent}%` : '空闲' }}</b>
      </button>
      <button v-if="rememberedWorkspace" class="sticker dashboard__sticker dashboard__sticker--3" type="button" @click="navigate(rememberedWorkspace.route)">
        <i>上次停在</i><b class="dashboard__sticker-text">{{ rememberedWorkspace.shortLabel }}</b><i>→</i>
      </button>
    </div>

    <aside class="dashboard__side">
      <section class="ring-card" aria-labelledby="ring-title">
        <div class="ring-card__donut" :style="{ '--p': progress.percent }">
          <b>{{ progress.percent }}%<small>标注进度</small></b>
        </div>
        <div class="ring-card__text">
          <h2 id="ring-title">{{ ringTitle }}</h2>
          <p>{{ ringText }}</p>
          <div class="ring-card__chips">
            <span v-if="progress.remaining > 0" class="chip chip-peach">{{ progress.remaining }} 待处理</span>
            <span v-if="progress.done > 0" class="chip chip-mint">已确认 {{ progress.done }}</span>
            <span v-if="pipelineStore.currentTask" class="chip chip-lavender">{{ pipelineStore.currentTask.name }} · {{ taskPercent }}%</span>
          </div>
        </div>
      </section>
      <div class="dashboard__tilts">
        <button class="tilt tilt--pink" type="button" @click="navigate('/gallery')">
          <small>图库</small>
          <b>{{ summaryInput.imageCount.toLocaleString() }}<em>张</em></b>
          <i>{{ galleryStore.roots.length }} 个来源</i>
        </button>
        <button class="tilt tilt--lav" type="button" @click="navigate('/gallery')">
          <small>数据集</small>
          <b>{{ summaryInput.datasetCount }}<em>个</em></b>
          <i>{{ galleryStore.datasets[0]?.name ? `最近 “${galleryStore.datasets[0].name}”` : '还没建数据集' }}</i>
        </button>
      </div>
    </aside>

    <section class="dashboard__recent" aria-labelledby="recent-title">
      <header>
        <h2 id="recent-title">最近加入</h2>
        <button class="dashboard__link" type="button" @click="navigate('/gallery')">查看全部 →</button>
      </header>
      <PolaroidFan :items="recentItems" @open="openImageInGallery" />
    </section>

    <div class="dashboard__system">
      <SystemRings />
      <section class="task-hint">
        <p v-if="pipelineStore.currentTask">
          <b>{{ pipelineStore.currentTask.name }} 正在训练。</b><br>
          {{ pipelineStore.currentTask.speed }} · 预计 {{ pipelineStore.currentTask.eta }}
        </p>
        <p v-else>
          <b>没有进行中的任务。</b><br>
          <template v-if="progress.total > 0 && progress.remaining === 0">这批素材已经标完，可以准备训练了。</template>
          <template v-else-if="progress.total > 0">标注还剩 {{ progress.remaining }} 张，标完就能开训练。</template>
          <template v-else>先导入素材、打好标签，再来这里开训练。</template>
        </p>
        <button class="btn btn-soft btn-sm" type="button" @click="navigate(pipelineStore.currentTask ? '/training/run' : '/training')">
          {{ pipelineStore.currentTask ? '查看进度 →' : '新建训练 →' }}
        </button>
      </section>
    </div>

    <WorkspaceList class="dashboard__workspaces" :items="recentWorkspaces" @navigate="navigate" />
  </div>
</template>

<style scoped>
.dashboard {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 430px);
  grid-template-areas:
    "hero side"
    "recent system"
    "recent workspaces";
  gap: 22px 24px;
  padding: 30px 6px 20px 12px;
  max-width: 1480px;
}
.dashboard__spark { position: absolute; color: var(--brand-primary); font-size: 16px; line-height: 1; pointer-events: none; opacity: 0.85; }
.dashboard__spark--1 { right: 16%; top: -6px; }
.dashboard__spark--2 { right: 12%; top: 34px; color: var(--accent-lavender); font-size: 12px; }
.dashboard__spark--3 { left: 45%; top: 340px; font-size: 12px; }
.dashboard__eyebrow { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.14em; color: var(--brand-primary); text-transform: uppercase; font-weight: 800; }

.dashboard__hero { grid-area: hero; position: relative; }
.dashboard__sticker { position: absolute; z-index: 3; cursor: pointer; transition: transform 0.25s var(--ease-bounce); }
.dashboard__sticker--1 { left: min(66%, calc(100% - 200px)); top: -8px; transform: rotate(-7deg); }
.dashboard__sticker--2 { right: 24px; bottom: -14px; transform: rotate(4deg); }
.dashboard__sticker--3 { left: 40px; bottom: -18px; transform: rotate(-3deg); }
.dashboard__sticker-text { font-family: inherit; font-size: 13px; }
.dashboard__sticker:hover { transform: rotate(0deg) scale(1.04); }

.dashboard__side { grid-area: side; display: grid; gap: 16px; align-content: start; }
.ring-card {
  display: grid; grid-template-columns: 136px 1fr; align-items: center; gap: 14px;
  padding: 22px 20px 22px 22px; border-radius: var(--radius-hero); background: var(--surface-primary); box-shadow: var(--surface-shadow);
}
.ring-card__donut {
  width: 136px; height: 136px; border-radius: 50%; display: grid; place-items: center; position: relative; transform: rotate(-8deg);
  background: conic-gradient(var(--brand-primary) 0 calc(var(--p, 0) * 1%), var(--brand-soft) calc(var(--p, 0) * 1%) 100%);
}
.ring-card__donut::before { content: ""; width: 100px; height: 100px; border-radius: 50%; background: var(--surface-primary); }
.ring-card__donut b { position: absolute; font-size: 26px; font-weight: 900; color: var(--brand-hover); letter-spacing: -0.02em; transform: rotate(8deg); text-align: center; }
.ring-card__donut b small { display: block; font-size: 10px; color: var(--ink-tertiary); font-weight: 700; letter-spacing: 0.08em; }
.ring-card h2 { font-size: 16px; font-weight: 900; }
.ring-card p { font-size: 12.5px; color: var(--ink-secondary); margin-top: 6px; line-height: 1.6; }
.ring-card__chips { display: flex; gap: 6px; margin-top: 12px; flex-wrap: wrap; }
.ring-card__chips .chip { cursor: default; }

.dashboard__tilts { display: grid; grid-template-columns: 1.15fr 1fr; gap: 14px; padding: 6px 4px 0; }
.tilt {
  border: 0; text-align: left; padding: 18px 20px; border-radius: 30px; background: var(--surface-primary); box-shadow: var(--surface-shadow);
  font: inherit; color: inherit; cursor: pointer; transition: transform 0.25s var(--ease-bounce), box-shadow 0.25s ease;
}
.tilt--pink { transform: rotate(-3deg); }
.tilt--lav { transform: rotate(3deg); background: var(--accent-lavender-soft); }
.tilt:hover { transform: rotate(0deg) translateY(-4px); box-shadow: var(--surface-shadow-lg); }
.tilt small { font-size: 11.5px; font-weight: 800; color: var(--ink-tertiary); }
.tilt--lav small, .tilt--lav i { color: var(--accent-lavender-strong); opacity: 0.8; }
.tilt b { display: block; margin-top: 8px; font-size: 28px; font-weight: 900; color: var(--brand-hover); letter-spacing: -0.02em; line-height: 1; }
.tilt--lav b { color: var(--accent-lavender-strong); }
.tilt b em { font-style: normal; font-size: 13px; color: var(--ink-tertiary); margin-left: 4px; font-weight: 700; }
.tilt i { display: block; font-style: normal; margin-top: 6px; font-size: 11.5px; color: var(--ink-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.dashboard__recent { grid-area: recent; min-width: 0; }
.dashboard__recent header, .dashboard__link { display: flex; align-items: center; }
.dashboard__recent header { justify-content: space-between; }
.dashboard__recent h2 { font-size: 15px; font-weight: 900; }
.dashboard__link { border: 0; background: none; color: var(--brand-hover); font: inherit; font-size: 12px; font-weight: 800; cursor: pointer; padding: 4px 8px; border-radius: 999px; }
.dashboard__link:hover { background: var(--brand-soft); }

.dashboard__system { grid-area: system; display: grid; gap: 14px; align-content: start; }
.task-hint {
  display: flex; align-items: center; gap: 14px; padding: 18px 20px 18px 24px; border-radius: 30px;
  background: var(--gradient-hero); box-shadow: var(--surface-shadow);
}
.task-hint p { flex: 1; font-size: 12.5px; color: var(--ink-secondary); line-height: 1.55; }
.task-hint p b { color: var(--ink-primary); font-weight: 900; }
.task-hint .btn { flex: none; }

.dashboard__workspaces { grid-area: workspaces; }

@media (max-width: 1240px) {
  .dashboard { grid-template-columns: minmax(0, 1fr); grid-template-areas: "hero" "side" "recent" "system" "workspaces"; }
  .dashboard__side { grid-template-columns: 1fr 1fr; }
  .dashboard__tilts { padding-top: 0; }
}
@media (max-width: 900px) {
  .dashboard__side { grid-template-columns: 1fr; }
  .dashboard__sticker--1 { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .dashboard__sticker, .tilt, .dashboard__sticker:hover, .tilt:hover { transition: none; }
}
</style>
