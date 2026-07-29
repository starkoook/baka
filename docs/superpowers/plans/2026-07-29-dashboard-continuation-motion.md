# Dashboard Continuation and Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the dashboard continue the user's most relevant work and add the approved layered panel and borderless sliding-rail sidebar interactions without changing the hero or workspace business logic.

**Architecture:** Add a small local workspace-history helper and keep continuation priority in the existing pure dashboard summary module. Dashboard components consume real Pinia state and use CSS-only hover/focus motion, while the sidebar derives its active rail from the shared navigation model and actual route state.

**Tech Stack:** Vue 3, TypeScript, Pinia, Vue Router, CSS transforms and media queries, Vitest, Electron/Vite.

---

## Scope and file map

### Create

- `src/features/navigation/workspace-history.ts` — whitelist, normalize, load, and save the last meaningful workspace.
- `src/features/navigation/__tests__/workspace-history.spec.ts` — persistence and invalid-route coverage.
- `electron/ipc/__tests__/dashboard-interaction-ui.spec.ts` — source-level contract for layered motion, borderless navigation, focus, and reduced motion.

### Modify

- `src/router/index.ts` — remember successful workspace navigation.
- `src/features/dashboard/dashboard-summary.ts` — continuation priority and real status items.
- `src/features/dashboard/__tests__/dashboard-summary.spec.ts` — priority and status tests.
- `src/views/Dashboard.vue` — combine workspace history, annotation state, the layered work surface, and monitor dock.
- `src/components/dashboard/DashboardRecentWork.vue` — current-work layer, real status strip, active-task state, and local interaction feedback.
- `src/components/monitor/SystemMonitor.vue` — animate value changes once and remove the old indefinite warning pulse.
- `src/components/sidebar/AppSidebar.vue` — borderless surface, sliding active rail, hover/press feedback, and submenu transition.
- `electron/ipc/__tests__/visual-acceptance-ui.spec.ts` — extend the existing accepted visual contract.

### Delete after final acceptance

- `C:\Users\Feng\.codex\visualizations\2026\07\25\019f99f1-4742-74a0-a3ef-891047b821e0\dashboard-motion-directions.html`
- `C:\Users\Feng\.codex\visualizations\2026\07\25\019f99f1-4742-74a0-a3ef-891047b821e0\dashboard-panel-directions.html`
- `C:\Users\Feng\.codex\visualizations\2026\07\25\019f99f1-4742-74a0-a3ef-891047b821e0\sidebar-motion-directions.html`

Do not modify the hero artwork, gallery behavior, annotation behavior, training backend, updater, runtime installer, or packaging logic.

## Task 1: Remember the last meaningful workspace

**Files:**
- Create: `src/features/navigation/workspace-history.ts`
- Create: `src/features/navigation/__tests__/workspace-history.spec.ts`
- Modify: `src/router/index.ts`

- [ ] **Step 1: Write the failing workspace-history tests**

Create `src/features/navigation/__tests__/workspace-history.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  getRememberedWorkspace,
  loadLastWorkspace,
  normalizeWorkspaceRoute,
  saveLastWorkspace,
} from '../workspace-history'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  }
}

describe('workspace history', () => {
  it('remembers only approved workspaces', () => {
    expect(normalizeWorkspaceRoute('/gallery')).toBe('/gallery')
    expect(normalizeWorkspaceRoute('/training/runtime')).toBe('/training/runtime')
    expect(normalizeWorkspaceRoute('/settings')).toBeNull()
    expect(normalizeWorkspaceRoute('/unknown')).toBeNull()
  })

  it('normalizes a stale training run to training configuration', () => {
    expect(normalizeWorkspaceRoute('/training/run')).toBe('/training')
  })

  it('keeps the previous workspace when dashboard or settings opens', () => {
    const storage = memoryStorage()
    saveLastWorkspace('/gallery', storage)
    saveLastWorkspace('/', storage)
    saveLastWorkspace('/settings', storage)
    expect(loadLastWorkspace(storage)).toBe('/gallery')
  })

  it('returns exact labels only for valid saved routes', () => {
    expect(getRememberedWorkspace('/reverse')).toEqual({
      label: '继续提示词反推',
      route: '/reverse',
    })
    expect(getRememberedWorkspace('/obsolete')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```powershell
npx vitest run src/features/navigation/__tests__/workspace-history.spec.ts
```

Expected: FAIL because `workspace-history.ts` does not exist.

- [ ] **Step 3: Implement the whitelist and storage helper**

Create `src/features/navigation/workspace-history.ts`:

```ts
const STORAGE_KEY = 'baka-last-workspace-v1'

export interface StorageReaderWriter {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface RememberedWorkspace {
  label: string
  route: string
}

const WORKSPACE_LABELS = {
  '/gallery': '继续整理图库',
  '/tagger': '返回标注工作区',
  '/training': '继续配置训练',
  '/training/runtime': '继续配置训练环境',
  '/reverse': '继续提示词反推',
  '/upscale': '继续超分放大',
  '/generate': '继续 AI 生成',
  '/console': '返回控制台',
} as const

export function normalizeWorkspaceRoute(routePath: string | null): keyof typeof WORKSPACE_LABELS | null {
  if (!routePath) return null
  const normalized = routePath === '/training/run' ? '/training' : routePath
  return normalized in WORKSPACE_LABELS
    ? normalized as keyof typeof WORKSPACE_LABELS
    : null
}

export function getRememberedWorkspace(routePath: string | null): RememberedWorkspace | null {
  if (!routePath) return null
  const route = normalizeWorkspaceRoute(routePath)
  return route ? { label: WORKSPACE_LABELS[route], route } : null
}

export function loadLastWorkspace(storage: StorageReaderWriter = window.localStorage): string | null {
  return normalizeWorkspaceRoute(storage.getItem(STORAGE_KEY))
}

export function saveLastWorkspace(
  routePath: string,
  storage: StorageReaderWriter = window.localStorage,
): void {
  const route = normalizeWorkspaceRoute(routePath)
  if (route) storage.setItem(STORAGE_KEY, route)
}
```

- [ ] **Step 4: Register route tracking**

Modify `src/router/index.ts`:

```ts
import { createRouter, createWebHashHistory } from 'vue-router'
import { saveLastWorkspace } from '@/features/navigation/workspace-history'
```

After router creation and before export:

```ts
router.afterEach((to) => {
  saveLastWorkspace(to.path)
})

export default router
```

- [ ] **Step 5: Run focused verification**

Run:

```powershell
npx vitest run src/features/navigation/__tests__/workspace-history.spec.ts src/features/navigation/__tests__/app-navigation.spec.ts
npm run typecheck
```

Expected: all focused tests PASS and typecheck exits 0.

- [ ] **Step 6: Commit workspace history**

```powershell
git add src/features/navigation/workspace-history.ts src/features/navigation/__tests__/workspace-history.spec.ts src/router/index.ts
git commit -m "feat: remember the last workspace"
```

## Task 2: Resolve the most relevant continuation action

**Files:**
- Modify: `src/features/dashboard/dashboard-summary.ts`
- Modify: `src/features/dashboard/__tests__/dashboard-summary.spec.ts`

- [ ] **Step 1: Replace the helper tests with the complete priority contract**

Update `src/features/dashboard/__tests__/dashboard-summary.spec.ts` so it includes:

```ts
import { describe, expect, it } from 'vitest'
import { getContinueAction, getDashboardSnapshot } from '../dashboard-summary'

const base = {
  imageCount: 243,
  datasetCount: 1,
  unfinishedAnnotationCount: 0,
  activeTaskName: null,
  rememberedWorkspace: null,
}

describe('dashboard continuation', () => {
  it('continues a running task before every other signal', () => {
    expect(getContinueAction({
      ...base,
      activeTaskName: '  训练 pink_style  ',
      unfinishedAnnotationCount: 8,
      rememberedWorkspace: { label: '继续整理图库', route: '/gallery' },
    })).toEqual({ label: '继续 训练 pink_style', route: '/training/run' })
  })

  it('continues unfinished annotation before history', () => {
    expect(getContinueAction({
      ...base,
      unfinishedAnnotationCount: 8,
      rememberedWorkspace: { label: '继续整理图库', route: '/gallery' },
    })).toEqual({ label: '继续标注 8 张素材', route: '/tagger' })
  })

  it('returns to the remembered workspace before dataset fallback', () => {
    expect(getContinueAction({
      ...base,
      rememberedWorkspace: { label: '继续提示词反推', route: '/reverse' },
    })).toEqual({ label: '继续提示词反推', route: '/reverse' })
  })

  it('uses training and import fallbacks when there is no unfinished or remembered work', () => {
    expect(getContinueAction(base)).toEqual({ label: '继续准备训练', route: '/training' })
    expect(getContinueAction({ ...base, datasetCount: 0 })).toEqual({
      label: '导入第一批素材',
      route: '/gallery',
    })
  })

  it('builds status items only from real counts', () => {
    expect(getDashboardSnapshot({ ...base, unfinishedAnnotationCount: 25 })).toEqual([
      { label: '图库', value: '243 张', route: '/gallery' },
      { label: '数据集', value: '1 个', route: '/gallery' },
      { label: '标注', value: '25 张待处理', route: '/tagger' },
    ])
  })
})
```

- [ ] **Step 2: Run the helper tests and verify RED**

Run:

```powershell
npx vitest run src/features/dashboard/__tests__/dashboard-summary.spec.ts
```

Expected: FAIL because the input type and priority do not include annotation or remembered workspace.

- [ ] **Step 3: Implement the priority and real status snapshot**

Replace `src/features/dashboard/dashboard-summary.ts` with:

```ts
export interface DashboardAction {
  label: string
  route: string
}

export interface DashboardSummaryInput {
  imageCount: number
  datasetCount: number
  unfinishedAnnotationCount: number
  activeTaskName: string | null
  rememberedWorkspace: DashboardAction | null
}

function activeTaskName(name: string | null): string | null {
  return name?.trim() || null
}

export function getContinueAction(input: DashboardSummaryInput): DashboardAction {
  const taskName = activeTaskName(input.activeTaskName)
  if (taskName) return { label: `继续 ${taskName}`, route: '/training/run' }
  if (input.unfinishedAnnotationCount > 0) {
    return { label: `继续标注 ${input.unfinishedAnnotationCount} 张素材`, route: '/tagger' }
  }
  if (input.rememberedWorkspace) return input.rememberedWorkspace
  if (input.datasetCount > 0) return { label: '继续准备训练', route: '/training' }
  return { label: '导入第一批素材', route: '/gallery' }
}

export function getDashboardSnapshot(
  input: DashboardSummaryInput,
): Array<DashboardAction & { value: string }> {
  return [
    { label: '图库', value: `${input.imageCount} 张`, route: '/gallery' },
    { label: '数据集', value: `${input.datasetCount} 个`, route: '/gallery' },
    {
      label: '标注',
      value: input.unfinishedAnnotationCount > 0
        ? `${input.unfinishedAnnotationCount} 张待处理`
        : '没有待处理',
      route: '/tagger',
    },
  ]
}
```

- [ ] **Step 4: Run the helper tests**

Run:

```powershell
npx vitest run src/features/dashboard/__tests__/dashboard-summary.spec.ts
```

Expected: all continuation tests PASS.

- [ ] **Step 5: Commit continuation priority**

```powershell
git add src/features/dashboard/dashboard-summary.ts src/features/dashboard/__tests__/dashboard-summary.spec.ts
git commit -m "feat: continue the most relevant work"
```

## Task 3: Build the layered dashboard work surface

**Files:**
- Modify: `src/views/Dashboard.vue`
- Modify: `src/components/dashboard/DashboardRecentWork.vue`
- Modify: `src/components/monitor/SystemMonitor.vue`
- Create: `electron/ipc/__tests__/dashboard-interaction-ui.spec.ts`
- Modify: `electron/ipc/__tests__/visual-acceptance-ui.spec.ts`

- [ ] **Step 1: Add the failing interaction contract**

Create `electron/ipc/__tests__/dashboard-interaction-ui.spec.ts`:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('dashboard interaction system', () => {
  it('uses real continuation and annotation state', () => {
    const dashboard = read('src/views/Dashboard.vue')
    expect(dashboard).toContain('useTaggerStore')
    expect(dashboard).toContain('loadLastWorkspace')
    expect(dashboard).toContain('getRememberedWorkspace')
    expect(dashboard).toContain('unfinishedAnnotationCount')
    expect(dashboard).toContain(':action="continueAction"')
  })

  it('implements local layered motion without layout reflow', () => {
    const dashboard = read('src/views/Dashboard.vue')
    const recent = read('src/components/dashboard/DashboardRecentWork.vue')
    expect(dashboard).toContain('@media (hover: hover) and (pointer: fine)')
    expect(dashboard).toContain('scale(1.018)')
    expect(dashboard).toContain('opacity: 0.72')
    expect(recent).toContain('scale(1.012)')
    expect(recent).toContain('scale(1.02)')
    expect(recent).toContain(':focus-within')
  })

  it('preserves reduced motion', () => {
    expect(read('src/views/Dashboard.vue')).toContain('prefers-reduced-motion: reduce')
    expect(read('src/components/dashboard/DashboardRecentWork.vue'))
      .toContain('prefers-reduced-motion: reduce')
  })

  it('uses one-shot value feedback instead of an indefinite monitor loop', () => {
    const monitor = read('src/components/monitor/SystemMonitor.vue')
    expect(monitor).toContain('value-update 260ms')
    expect(monitor).toContain(':key="`cpu-${stats.cpu.usage}`"')
    expect(monitor).not.toContain(':class="{ pulse:')
    expect(monitor).not.toContain('mon-pulse 1.1s ease-in-out infinite')
  })
})
```

Extend `electron/ipc/__tests__/visual-acceptance-ui.spec.ts` with:

```ts
it('keeps dashboard metrics real and finite', () => {
  const dashboard = read('src/views/Dashboard.vue')
  const recent = read('src/components/dashboard/DashboardRecentWork.vue')
  expect(dashboard).toContain('galleryStore.roots.reduce')
  expect(dashboard).toContain("item.status !== 'reviewed'")
  expect(recent).not.toContain('218')
  expect(recent).not.toContain('25 张待处理')
})
```

- [ ] **Step 2: Run the contracts and verify RED**

Run:

```powershell
npx vitest run electron/ipc/__tests__/dashboard-interaction-ui.spec.ts electron/ipc/__tests__/visual-acceptance-ui.spec.ts
```

Expected: FAIL because Dashboard does not yet consume workspace history or tagger state and the layered transforms do not exist.

- [ ] **Step 3: Connect real state in Dashboard**

In `src/views/Dashboard.vue`, replace the Vue import and add the feature/store imports:

```ts
import { computed, onMounted, ref } from 'vue'
import { getRememberedWorkspace, loadLastWorkspace } from '@/features/navigation/workspace-history'
import { useTaggerStore } from '@/stores/tagger'

const taggerStore = useTaggerStore()
const rememberedWorkspace = ref(getRememberedWorkspace(loadLastWorkspace()))

const unfinishedAnnotationCount = computed(() =>
  taggerStore.queue.filter((item) => item.status !== 'reviewed').length,
)
```

Replace `summaryInput` with:

```ts
const summaryInput = computed(() => ({
  imageCount: galleryStore.roots.reduce((sum, root) => sum + (root.image_count ?? 0), 0),
  datasetCount: galleryStore.datasets.length,
  unfinishedAnnotationCount: unfinishedAnnotationCount.value,
  activeTaskName: pipelineStore.currentTask?.name ?? null,
  rememberedWorkspace: rememberedWorkspace.value,
}))
```

In `onMounted`, restore the annotation session before computing the visible queue:

```ts
onMounted(() => {
  galleryStore.loadRoots()
  galleryStore.loadDatasets()
  taggerStore.restoreSession()
})
```

Pass the continuation action into the recent-work component:

```vue
<DashboardRecentWork
  :action="continueAction"
  :items="snapshot"
  :task="displayTask"
  @navigate="navigate"
/>
```

- [ ] **Step 4: Recompose DashboardRecentWork as the main interactive layer**

Replace the props declaration with:

```ts
const props = defineProps<{
  action: DashboardAction
  items: Array<DashboardAction & { value: string }>
  task: {
    name: string
    progress: number
    speed: string
    eta: string
  } | null
}>()
```

Use this template structure in `DashboardRecentWork.vue`:

```vue
<section class="recent-work" aria-labelledby="recent-work-title">
  <header class="current-work">
    <span><small>当前工作</small><h2 id="recent-work-title">{{ action.label }}</h2></span>
    <button class="btn btn-primary" type="button" @click="emit('navigate', action.route)">继续</button>
  </header>

  <div class="status-strip" aria-label="工作区状态">
    <button
      v-for="item in items"
      :key="item.label"
      class="status-segment"
      type="button"
      @click="emit('navigate', item.route)"
    >
      <span>{{ item.label }}</span><strong>{{ item.value }}</strong>
    </button>
  </div>

  <div v-if="task" class="active-task">
    <div class="active-task__summary">
      <span><small>正在运行</small><strong>{{ task.name }}</strong></span>
      <b>{{ displayProgress }}%</b>
    </div>
    <div
      class="task-track"
      role="progressbar"
      :aria-label="task.name"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="displayProgress"
    >
      <i :style="{ width: `${displayProgress}%` }"></i>
    </div>
    <p>{{ task.speed }} · 预计 {{ task.eta }}</p>
  </div>
</section>
```

Keep this exact finite progress guard above the template:

```ts
const displayProgress = computed(() => {
  const taskProgress = props.task?.progress ?? 0
  return Number.isFinite(taskProgress) ? Math.min(100, Math.max(0, taskProgress)) : 0
})
```

Add these interaction rules to the scoped style:

```css
.recent-work {
  min-width: 0;
  padding: clamp(22px, 3vw, 36px);
  border-radius: var(--radius-panel);
  background: var(--surface-primary);
  box-shadow: var(--surface-shadow);
  transform-origin: left center;
  transition: transform 180ms ease-out, opacity 180ms ease-out,
    filter 180ms ease-out, box-shadow 180ms ease-out;
}

.current-work { display: flex; align-items: center; justify-content: space-between; gap: 18px; }
.current-work small, .current-work h2 { display: block; }
.current-work h2 { margin: 4px 0 0; font-size: 21px; }

.status-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  margin-top: 20px;
  overflow: hidden;
  border-radius: var(--radius-control);
  background: var(--line-subtle);
}

.status-segment {
  min-width: 0;
  min-height: 68px;
  padding: 12px 14px;
  border: 0;
  color: var(--ink-primary);
  background: var(--surface-secondary);
  text-align: left;
  cursor: pointer;
  transition: transform 160ms ease-out, opacity 160ms ease-out,
    filter 160ms ease-out, background 160ms ease-out;
}

.status-segment span, .status-segment strong { display: block; }
.status-segment span { color: var(--ink-tertiary); font-size: 11px; }
.status-segment strong { margin-top: 5px; overflow-wrap: anywhere; }

@media (hover: hover) and (pointer: fine) {
  .recent-work:hover {
    transform: translateY(-4px) scale(1.012);
    box-shadow: 0 18px 44px color-mix(in srgb, var(--ink-primary) 18%, transparent);
  }

  .status-segment:hover {
    position: relative;
    z-index: 2;
    transform: translateY(-3px) scale(1.02);
    background: var(--surface-selected);
  }

  .status-strip:has(.status-segment:hover) .status-segment:not(:hover) {
    opacity: 0.72;
    filter: saturate(0.72);
  }

  .status-segment:active { transform: scale(0.985); }
}

.recent-work:focus-within {
  transform: translateY(-4px) scale(1.012);
  box-shadow: 0 18px 44px color-mix(in srgb, var(--ink-primary) 18%, transparent);
}

.status-segment:focus-visible {
  position: relative;
  z-index: 2;
  transform: translateY(-3px) scale(1.02);
  background: var(--surface-selected);
}

.status-strip:has(.status-segment:focus-visible) .status-segment:not(:focus-visible) {
  opacity: 0.72;
  filter: saturate(0.72);
}

@media (max-width: 720px) {
  .current-work { align-items: flex-start; flex-direction: column; }
  .status-strip { grid-template-columns: 1fr; }
}

@media (prefers-reduced-motion: reduce) {
  .recent-work, .status-segment {
    opacity: 1 !important;
    filter: none !important;
    transition: none;
    transform: none !important;
  }
}
```

- [ ] **Step 5: Turn the monitor into a separate dock and add sibling depth**

In `src/views/Dashboard.vue`, change `.dashboard-sheet` and `.system-summary` to independent surfaces:

```css
.dashboard-sheet {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(300px, 0.65fr);
  gap: 14px;
  margin-top: -24px;
  margin-inline: clamp(16px, 2.5vw, 36px);
}

.system-summary {
  min-width: 0;
  padding: clamp(22px, 3vw, 36px);
  border-radius: var(--radius-panel);
  background: color-mix(in srgb, var(--surface-primary) 92%, var(--brand-soft));
  box-shadow: var(--surface-shadow);
  transform-origin: right center;
  transition: transform 180ms ease-out, opacity 180ms ease-out,
    filter 180ms ease-out, box-shadow 180ms ease-out;
}

@media (hover: hover) and (pointer: fine) {
  .system-summary:hover {
    z-index: 4;
    transform: translateY(-4px) scale(1.018);
    box-shadow: -14px 18px 42px color-mix(in srgb, var(--ink-primary) 16%, transparent);
  }

  .dashboard-sheet:has(.recent-work:hover) .system-summary {
    opacity: 0.72;
    filter: saturate(0.72);
    transform: scale(0.985);
  }

  .dashboard-sheet:has(.system-summary:hover) .recent-work {
    opacity: 0.72;
    filter: saturate(0.72);
    transform: scale(0.985);
  }
}

.system-summary:focus-within {
  z-index: 4;
  transform: translateY(-4px) scale(1.018);
  box-shadow: -14px 18px 42px color-mix(in srgb, var(--ink-primary) 16%, transparent);
}

.dashboard-sheet:has(.recent-work:focus-within) .system-summary {
  opacity: 0.72;
  filter: saturate(0.72);
  transform: scale(0.985);
}

.dashboard-sheet:has(.system-summary:focus-within) .recent-work {
  opacity: 0.72;
  filter: saturate(0.72);
  transform: scale(0.985);
}

@media (max-width: 1160px) {
  .dashboard-sheet { grid-template-columns: 1fr; }
  .system-summary { transform-origin: center top; }
}

@media (prefers-reduced-motion: reduce) {
  .system-summary, .recent-work {
    opacity: 1 !important;
    filter: none !important;
    transition: none;
    transform: none !important;
  }
}
```

Remove the old shared border, shared background, shared padding, and vertical divider rules from `.dashboard-sheet` and `.system-summary`.

- [ ] **Step 6: Make monitor updates animate once**

In `src/components/monitor/SystemMonitor.vue`, key each visible percentage value so Vue recreates only that value when it changes:

```vue
<span :key="`cpu-${stats.cpu.usage}`" class="mon-val">{{ stats.cpu.usage }}<i>%</i></span>
<span :key="`gpu-${stats.gpu.vramTotal > 0 ? stats.gpu.vramPercent : (stats.gpu.usage || 0)}`" class="mon-val">
  {{ stats.gpu.vramTotal > 0 ? stats.gpu.vramPercent : (stats.gpu.usage || 0) }}<i>%</i>
</span>
<span :key="`memory-${stats.memory.percent}`" class="mon-val">{{ stats.memory.percent }}<i>%</i></span>
```

Remove all three `:class="{ pulse: ... }"` bindings from `.mon-fill`, remove `.mon-fill.pulse` and `@keyframes mon-pulse`, then add:

```css
.mon-val { animation: value-update 260ms ease-out; }

@keyframes value-update {
  from { color: var(--brand-primary); transform: translateY(-1px) scale(1.035); }
  to { color: var(--text-primary); transform: translateY(0) scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  .mon-val { animation: none; }
}
```

This replaces the old infinite high-load pulse with one short response whenever a real value changes.

- [ ] **Step 7: Run focused tests, typecheck, and renderer build**

Run:

```powershell
npx vitest run src/features/dashboard/__tests__/dashboard-summary.spec.ts electron/ipc/__tests__/dashboard-interaction-ui.spec.ts electron/ipc/__tests__/visual-foundation-ui.spec.ts electron/ipc/__tests__/visual-acceptance-ui.spec.ts
npm run typecheck
npm run build:renderer
```

Expected: all focused tests PASS, typecheck exits 0, and Vite build succeeds.

- [ ] **Step 8: Commit the layered work surface**

```powershell
git add src/views/Dashboard.vue src/components/dashboard/DashboardRecentWork.vue src/components/monitor/SystemMonitor.vue electron/ipc/__tests__/dashboard-interaction-ui.spec.ts electron/ipc/__tests__/visual-acceptance-ui.spec.ts
git commit -m "feat: add layered dashboard interactions"
```

## Task 4: Add the borderless sliding-rail sidebar

**Files:**
- Modify: `src/components/sidebar/AppSidebar.vue`
- Modify: `electron/ipc/__tests__/dashboard-interaction-ui.spec.ts`
- Modify: `electron/ipc/__tests__/visual-acceptance-ui.spec.ts`

- [ ] **Step 1: Extend the failing sidebar contract**

Add to `dashboard-interaction-ui.spec.ts`:

```ts
it('uses a borderless sliding navigation rail', () => {
  const sidebar = read('src/components/sidebar/AppSidebar.vue')
  expect(sidebar).toContain('sidebar-active-rail')
  expect(sidebar).toContain('activeNavigationIndex')
  expect(sidebar).toContain('--active-navigation-index')
  expect(sidebar).toContain('240ms')
  expect(sidebar).toContain('scale(1.018)')
  expect(sidebar).toContain('scale(0.97)')
  expect(sidebar).toContain('local-status-breathe 3.6s')
  expect(sidebar).toContain('@media (hover: hover) and (pointer: fine)')
  expect(sidebar).not.toContain('border-right: 1px')
  expect(sidebar).not.toContain('border-top: 1px')
})
```

Add to `visual-acceptance-ui.spec.ts`:

```ts
it('keeps the tool submenu borderless and route synchronized', () => {
  const sidebar = read('src/components/sidebar/AppSidebar.vue')
  expect(sidebar).toContain('watch(')
  expect(sidebar).toContain('isToolsRoute(path)')
  expect(sidebar).toContain('box-shadow: var(--surface-shadow)')
  expect(sidebar).not.toContain('border: 1px solid var(--border-subtle)')
})
```

- [ ] **Step 2: Run the contracts and verify RED**

Run:

```powershell
npx vitest run electron/ipc/__tests__/dashboard-interaction-ui.spec.ts electron/ipc/__tests__/visual-acceptance-ui.spec.ts
```

Expected: FAIL because the sidebar has no active rail and still uses separators.

- [ ] **Step 3: Derive the active navigation index**

Update the Vue import:

```ts
import { computed, ref, watch } from 'vue'
```

Add:

```ts
const activeNavigationIndex = computed(() => {
  const index = APP_NAVIGATION.findIndex((item) => isNavigationItemActive(item, route.path))
  return Math.max(0, index)
})

const activeRailStyle = computed(() => ({
  '--active-navigation-index': String(activeNavigationIndex.value),
}))
```

Inside `.sidebar-nav` and before the `v-for`, add:

```vue
<span class="sidebar-active-rail" :style="activeRailStyle" aria-hidden="true"></span>
```

- [ ] **Step 4: Replace sidebar separators with motion and spacing**

Apply these rules in the scoped style and remove the old border rules:

```css
.app-sidebar {
  position: relative;
  z-index: 3;
  display: flex;
  min-height: 0;
  flex-direction: column;
  border: 0;
  background: color-mix(in srgb, var(--app-bg) 96%, var(--brand-soft));
}

.sidebar-nav {
  position: relative;
  display: grid;
  gap: 4px;
  padding: 12px 10px;
  border: 0;
}

.sidebar-active-rail {
  position: absolute;
  z-index: 2;
  top: 12px;
  left: 5px;
  width: 3px;
  height: 40px;
  border-radius: 999px;
  background: var(--brand-primary);
  box-shadow: 0 0 12px rgba(var(--accent-primary-rgb), 0.36);
  transform: translateY(calc(var(--active-navigation-index) * 44px));
  transition: transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1);
  pointer-events: none;
}

.nav-item {
  transition: color 160ms ease-out, background 160ms ease-out,
    transform 160ms ease-out;
}

.nav-item :deep(svg), .nav-label {
  transition: transform 160ms ease-out;
}

@media (hover: hover) and (pointer: fine) {
  .nav-item:hover {
    color: var(--text-primary);
    background: var(--surface-secondary);
    transform: translateX(2px) scale(1.018);
  }

  .nav-item:hover :deep(svg) {
    transform: translateY(-1px) rotate(-3deg) scale(1.07);
  }

  .nav-item:hover .nav-label {
    transform: translateX(3px);
  }

  .nav-item:active { transform: translateX(2px) scale(0.97); }
}

.nav-item:focus-visible {
  color: var(--text-primary);
  background: var(--surface-secondary);
  transform: translateX(2px) scale(1.018);
}

.nav-item:focus-visible :deep(svg) {
  transform: translateY(-1px) rotate(-3deg) scale(1.07);
}

.nav-item:focus-visible .nav-label { transform: translateX(3px); }

.tool-subnav {
  border: 0;
  animation: submenu-enter 180ms ease-out both;
}

.sidebar-footer { border: 0; }

.local-status-dot {
  animation: local-status-breathe 3.6s ease-in-out infinite;
}

@keyframes submenu-enter {
  from { opacity: 0; transform: translateY(-4px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes local-status-breathe {
  0%, 100% { opacity: 0.72; box-shadow: 0 0 0 rgba(var(--accent-success-rgb), 0); }
  50% { opacity: 1; box-shadow: 0 0 10px rgba(var(--accent-success-rgb), 0.42); }
}

@media (max-width: 1200px) {
  .tool-subnav {
    border: 0;
    background: var(--bg-surface);
    box-shadow: var(--surface-shadow);
  }
}

@media (prefers-reduced-motion: reduce) {
  .sidebar-active-rail { transition: none; }
  .nav-item, .nav-item :deep(svg), .nav-label, .tool-subnav {
    animation: none;
    transition: none;
    transform: none;
  }
  .local-status-dot { animation: none; }
}
```

Retain this exact route synchronization block:

```ts
watch(
  () => route.path,
  (path) => {
    isToolsExpanded.value = isToolsRoute(path)
  },
)
```

- [ ] **Step 5: Run sidebar and navigation verification**

Run:

```powershell
npx vitest run src/features/navigation/__tests__/app-navigation.spec.ts src/features/navigation/__tests__/workspace-history.spec.ts electron/ipc/__tests__/dashboard-interaction-ui.spec.ts electron/ipc/__tests__/visual-acceptance-ui.spec.ts electron/ipc/__tests__/visual-foundation-ui.spec.ts
npm run typecheck
npm run build:renderer
```

Expected: all focused tests PASS, typecheck exits 0, and Vite build succeeds.

- [ ] **Step 6: Commit the sidebar interaction**

```powershell
git add src/components/sidebar/AppSidebar.vue electron/ipc/__tests__/dashboard-interaction-ui.spec.ts electron/ipc/__tests__/visual-acceptance-ui.spec.ts
git commit -m "feat: animate the borderless sidebar"
```

## Task 5: Visual acceptance, full verification, and temporary cleanup

**Files:**
- Modify only Task 3 or Task 4 files if an observed defect requires a fix.
- Delete the three exact temporary visualization files listed in the file map.

- [ ] **Step 1: Start the application and verify real state**

Run:

```powershell
npm run dev
```

Expected: Electron opens the dashboard with real gallery, dataset, annotation, task, and system values and no renderer errors.

- [ ] **Step 2: Verify continuation priority**

Check these states in order:

1. Active training task → `/training/run`.
2. No training task plus unfinished annotation → `/tagger`.
3. No unfinished work plus remembered `/reverse` → `/reverse`.
4. No remembered route plus prepared dataset → `/training`.
5. Empty workspace → `/gallery`.

Expected: hero and lower current-work action show the same exact label and destination.

- [ ] **Step 3: Verify dashboard interaction at 1440×900 and 1100×720**

Confirm:

- Main work layer lifts and scales without reflow.
- Monitor dock lifts independently and adjacent layer dims to `0.72` opacity.
- Status segments scale locally without clipping.
- Pointer leaving restores every transform.
- 1100px layout stacks without horizontal scroll.
- Character hero remains unchanged.

- [ ] **Step 4: Verify sidebar interaction and accessibility**

Confirm:

- No sidebar or submenu borders remain.
- Active rail follows Home, Gallery, Annotation, Training, Tools, and Settings.
- Entering a tool route opens the submenu and leaving closes it.
- Hover, focus, press, and browser-history route changes update correctly.
- Keyboard focus is visible.
- Reduced-motion stops transforms, rail travel, submenu entrance, and the runtime-dot breathing loop.

- [ ] **Step 5: Run the fresh full quality gate**

Run each command separately:

```powershell
npm test -- --run
npm run typecheck
npm run check:ipc
npm run build:renderer
npm run branding:build
```

Expected: all commands exit 0; test output contains zero failed tests; IPC output reports every renderer/main channel within the contract.

- [ ] **Step 6: Verify and remove temporary preview files**

First verify every target is an exact file under the thread visualization directory:

```powershell
Get-Item -LiteralPath "C:\Users\Feng\.codex\visualizations\2026\07\25\019f99f1-4742-74a0-a3ef-891047b821e0\dashboard-motion-directions.html"
Get-Item -LiteralPath "C:\Users\Feng\.codex\visualizations\2026\07\25\019f99f1-4742-74a0-a3ef-891047b821e0\dashboard-panel-directions.html"
Get-Item -LiteralPath "C:\Users\Feng\.codex\visualizations\2026\07\25\019f99f1-4742-74a0-a3ef-891047b821e0\sidebar-motion-directions.html"
```

Then remove only those three exact files, without recursion or wildcards:

```powershell
Remove-Item -LiteralPath "C:\Users\Feng\.codex\visualizations\2026\07\25\019f99f1-4742-74a0-a3ef-891047b821e0\dashboard-motion-directions.html"
Remove-Item -LiteralPath "C:\Users\Feng\.codex\visualizations\2026\07\25\019f99f1-4742-74a0-a3ef-891047b821e0\dashboard-panel-directions.html"
Remove-Item -LiteralPath "C:\Users\Feng\.codex\visualizations\2026\07\25\019f99f1-4742-74a0-a3ef-891047b821e0\sidebar-motion-directions.html"
```

Expected: the three comparison files no longer exist. Do not remove the visualization directory or any unrelated file.

- [ ] **Step 7: Review branch scope**

Run:

```powershell
git diff --stat b5618da..HEAD
git status --short
```

Expected: committed changes are limited to the files listed in this plan. Existing unrelated user changes remain untouched.

- [ ] **Step 8: Commit observed acceptance fixes, or record that none were required**

If visual QA required changes:

```powershell
git add src/views/Dashboard.vue src/components/dashboard/DashboardRecentWork.vue src/components/monitor/SystemMonitor.vue src/components/sidebar/AppSidebar.vue electron/ipc/__tests__/dashboard-interaction-ui.spec.ts electron/ipc/__tests__/visual-acceptance-ui.spec.ts
git commit -m "fix: complete dashboard interaction acceptance"
```

If no acceptance fix was required, do not create an empty commit.

## Completion criteria

- The hero remains visually unchanged.
- Continuation priority is active task, unfinished annotation, remembered workspace, prepared dataset, then import.
- Dashboard counts come only from real stores.
- The lower dashboard uses the approved dynamic layered interaction without layout shift.
- The sidebar is borderless and uses the approved sliding active rail.
- Tool submenu state remains synchronized with routes.
- Pointer, keyboard, touch, and reduced-motion states are safe.
- Monitor values respond once per change; the local-runtime dot is the only new looping animation.
- Full tests, typecheck, IPC check, renderer build, and branding build pass.
- All three temporary comparison files are deleted after acceptance.
