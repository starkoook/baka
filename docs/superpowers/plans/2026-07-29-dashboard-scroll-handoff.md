# Dashboard Scroll Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved “soft handoff” dashboard where the hero initially dominates, recedes gently during scroll, the functional panels rise into the foreground, and the window’s top/bottom separator lines disappear.

**Architecture:** Add one focused Vue composable that converts the real `.main-content` scroll position into a clamped 0–1 progress value with requestAnimationFrame batching and cleanup. `Dashboard.vue` owns the scroll stage and writes derived CSS variables; `BrandHero.vue` and the dashboard workspace consume those variables only for presentation. Title/status bars and dashboard surfaces lose hard separators while all task, navigation, and monitoring data stays untouched.

**Tech Stack:** Vue 3 Composition API, TypeScript, CSS custom properties, Vitest, Vue Test Utils, Electron renderer build.

---

## File map

- Create `src/features/dashboard/dashboard-scroll-handoff.ts`: scroll progress calculation and lifecycle-safe Vue composable.
- Create `src/features/dashboard/__tests__/dashboard-scroll-handoff.spec.ts`: calculation, batching, reduced-motion, and cleanup tests.
- Modify `src/views/Dashboard.vue`: scroll stage structure, CSS variables, hero/workspace depth transition, responsive and reduced-motion layout.
- Modify `src/components/dashboard/BrandHero.vue`: larger borderless hero and progress-driven visual retreat.
- Modify `src/components/dashboard/DashboardRecentWork.vue`: softer borderless statistic surfaces while retaining hover/focus behavior.
- Modify `src/components/titlebar/TitleBar.vue`: remove the top separator surface.
- Modify `src/components/statusbar/StatusBar.vue`: remove the bottom separator surface while preserving error emphasis.
- Modify `src/styles/global.css`: remove the app-wide inset/frame shadow.
- Create `electron/ipc/__tests__/dashboard-scroll-handoff-ui.spec.ts`: source-level visual contract for the handoff and border removal.
- Modify `electron/ipc/__tests__/brand-hero-ui.spec.ts`: replace the old compact-hero expectations with the new large-hero contract.
- Modify `electron/ipc/__tests__/dashboard-interaction-ui.spec.ts`: update the old fixed overlap expectation without weakening hover/focus assertions.
- Modify `electron/ipc/__tests__/dashboard-recent-work-ui.spec.ts`: assert the new scroll stage and route-safe navigation remain composed.
- Delete after acceptance `C:\Users\Feng\.codex\visualizations\2026\07\25\019f99f1-4742-74a0-a3ef-891047b821e0\dashboard-scroll-handoff.html`: remove the approved temporary preview.

### Task 1: Scroll progress engine

**Files:**
- Create: `src/features/dashboard/dashboard-scroll-handoff.ts`
- Create: `src/features/dashboard/__tests__/dashboard-scroll-handoff.spec.ts`

- [ ] **Step 1: Write the failing calculation tests**

Create `src/features/dashboard/__tests__/dashboard-scroll-handoff.spec.ts` with the calculation contract first:

```ts
import { describe, expect, it } from 'vitest'
import {
  calculateDashboardHandoffProgress,
  getDashboardHandoffDistance,
} from '../dashboard-scroll-handoff'

describe('dashboard scroll handoff', () => {
  it('clamps scroll progress between zero and one', () => {
    expect(calculateDashboardHandoffProgress(-30, 280)).toBe(0)
    expect(calculateDashboardHandoffProgress(140, 280)).toBe(0.5)
    expect(calculateDashboardHandoffProgress(560, 280)).toBe(1)
  })

  it('uses a shorter handoff in compact windows', () => {
    expect(getDashboardHandoffDistance(720)).toBe(220)
    expect(getDashboardHandoffDistance(900)).toBe(280)
  })

  it('avoids division by an invalid distance', () => {
    expect(calculateDashboardHandoffProgress(100, 0)).toBe(0)
    expect(calculateDashboardHandoffProgress(Number.NaN, 280)).toBe(0)
  })
})
```

- [ ] **Step 2: Run the calculation tests and verify the red state**

Run:

```powershell
npm.cmd test -- --run src/features/dashboard/__tests__/dashboard-scroll-handoff.spec.ts
```

Expected: FAIL because `dashboard-scroll-handoff.ts` does not exist.

- [ ] **Step 3: Implement the pure progress functions**

Create `src/features/dashboard/dashboard-scroll-handoff.ts`:

```ts
import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

export function getDashboardHandoffDistance(viewportHeight: number): number {
  return viewportHeight <= 720 ? 220 : 280
}

export function calculateDashboardHandoffProgress(scrollTop: number, distance: number): number {
  if (!Number.isFinite(scrollTop) || !Number.isFinite(distance) || distance <= 0) return 0
  return Math.min(1, Math.max(0, scrollTop / distance))
}

export function useDashboardScrollHandoff(pageElement: Ref<HTMLElement | null>) {
  const progress = ref(0)
  let scrollContainer: HTMLElement | null = null
  let animationFrame: number | null = null

  function prefersReducedMotion() {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  }

  function updateProgress() {
    animationFrame = null
    if (!scrollContainer || prefersReducedMotion()) {
      progress.value = 0
      return
    }

    progress.value = calculateDashboardHandoffProgress(
      scrollContainer.scrollTop,
      getDashboardHandoffDistance(scrollContainer.clientHeight),
    )
  }

  function scheduleUpdate() {
    if (animationFrame !== null) return
    animationFrame = window.requestAnimationFrame(updateProgress)
  }

  onMounted(() => {
    scrollContainer = pageElement.value?.closest<HTMLElement>('.main-content') ?? null
    if (!scrollContainer) return
    scrollContainer.scrollTop = 0
    scrollContainer.addEventListener('scroll', scheduleUpdate, { passive: true })
    updateProgress()
  })

  onBeforeUnmount(() => {
    scrollContainer?.removeEventListener('scroll', scheduleUpdate)
    if (animationFrame !== null) window.cancelAnimationFrame(animationFrame)
    animationFrame = null
    scrollContainer = null
  })

  return { progress }
}
```

- [ ] **Step 4: Add lifecycle, batching, and reduced-motion tests**

Extend the test file with a small mounted host component:

```ts
import { defineComponent, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, vi } from 'vitest'
import { useDashboardScrollHandoff } from '../dashboard-scroll-handoff'

let queuedFrame: FrameRequestCallback | null = null

beforeEach(() => {
  queuedFrame = null
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    queuedFrame = callback
    return 7
  }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
})

afterEach(() => vi.unstubAllGlobals())

const Host = defineComponent({
  setup() {
    const page = ref<HTMLElement | null>(null)
    const { progress } = useDashboardScrollHandoff(page)
    return { page, progress }
  },
  template: '<div class="main-content"><main ref="page">{{ progress }}</main></div>',
})

it('batches repeated scroll events into one animation frame and cleans up on unmount', async () => {
  const removeListener = vi.spyOn(HTMLElement.prototype, 'removeEventListener')
  const wrapper = mount(Host)
  const container = wrapper.get('.main-content').element as HTMLElement
  Object.defineProperty(container, 'clientHeight', { value: 900 })
  container.scrollTop = 140
  container.dispatchEvent(new Event('scroll'))
  container.dispatchEvent(new Event('scroll'))

  expect(requestAnimationFrame).toHaveBeenCalledTimes(1)
  queuedFrame?.(0)
  await nextTick()
  expect(wrapper.get('main').text()).toBe('0.5')

  wrapper.unmount()
  expect(removeListener).toHaveBeenCalledWith('scroll', expect.any(Function))
})

it('keeps progress static when reduced motion is enabled', async () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
  const wrapper = mount(Host)
  const container = wrapper.get('.main-content').element as HTMLElement
  container.scrollTop = 280
  container.dispatchEvent(new Event('scroll'))
  queuedFrame?.(0)
  await nextTick()
  expect(wrapper.get('main').text()).toBe('0')
  wrapper.unmount()
})
```

- [ ] **Step 5: Run the focused tests**

Run:

```powershell
npm.cmd test -- --run src/features/dashboard/__tests__/dashboard-scroll-handoff.spec.ts
```

Expected: all scroll handoff tests PASS.

- [ ] **Step 6: Commit the progress engine**

```powershell
git add -- src/features/dashboard/dashboard-scroll-handoff.ts src/features/dashboard/__tests__/dashboard-scroll-handoff.spec.ts
git commit -m "feat: track dashboard scroll handoff"
```

### Task 2: Hero-to-workspace spatial handoff

**Files:**
- Modify: `src/views/Dashboard.vue`
- Modify: `src/components/dashboard/BrandHero.vue`
- Create: `electron/ipc/__tests__/dashboard-scroll-handoff-ui.spec.ts`
- Modify: `electron/ipc/__tests__/brand-hero-ui.spec.ts`
- Modify: `electron/ipc/__tests__/dashboard-interaction-ui.spec.ts`
- Modify: `electron/ipc/__tests__/dashboard-recent-work-ui.spec.ts`

- [ ] **Step 1: Write the failing source-level UI contract**

Create `electron/ipc/__tests__/dashboard-scroll-handoff-ui.spec.ts`:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('dashboard scroll handoff UI', () => {
  it('connects the dashboard to the real scroll progress composable', () => {
    const dashboard = read('src/views/Dashboard.vue')
    expect(dashboard).toContain('useDashboardScrollHandoff')
    expect(dashboard).toContain('ref="dashboardPage"')
    expect(dashboard).toContain("'--handoff-progress': handoffProgress")
    expect(dashboard).toContain('class="dashboard-hero-layer"')
    expect(dashboard).toContain('class="dashboard-workspace-layer"')
    expect(dashboard).toContain('class="dashboard-scroll-tail"')
  })

  it('keeps the hero dominant first and promotes the workspace during scroll', () => {
    const dashboard = read('src/views/Dashboard.vue')
    const hero = read('src/components/dashboard/BrandHero.vue')
    expect(dashboard).toMatch(/\.dashboard-hero-layer\s*\{[^}]*position:\s*sticky;/s)
    expect(dashboard).toContain('var(--handoff-progress)')
    expect(dashboard).toContain('perspective: 1200px')
    expect(dashboard).toContain('@media (max-height: 720px)')
    expect(dashboard).toContain('prefers-reduced-motion: reduce')
    expect(hero).toContain('min-height: clamp(430px, 62vh, 620px)')
    expect(hero).toContain('border: 0')
  })
})
```

- [ ] **Step 2: Update existing tests to the approved large-hero contract**

In `electron/ipc/__tests__/brand-hero-ui.spec.ts`, replace the compact geometry assertions with:

```ts
expect(hero).toContain('min-height: clamp(430px, 62vh, 620px)')
expect(hero).toContain('max-height: none')
expect(hero).toContain('border: 0')
expect(hero).toContain('object-position: center 28%')
expect(hero).toContain('animation: hero-breathe 12s')
expect(hero).toContain('prefers-reduced-motion: reduce')
```

In `electron/ipc/__tests__/dashboard-interaction-ui.spec.ts`, replace the assertion that hard-codes `margin-top: -24px` with assertions for `.dashboard-workspace-layer`, its two-column grid, and the `max-width: 1160px` single-column breakpoint. Keep all existing hover, focus, active, and reduced-motion assertions.

In `electron/ipc/__tests__/dashboard-recent-work-ui.spec.ts`, add:

```ts
expect(dashboard).toContain('useDashboardScrollHandoff')
expect(dashboard).toContain('class="dashboard-hero-layer"')
expect(dashboard).toContain('class="dashboard-workspace-layer"')
```

- [ ] **Step 3: Run the UI tests and verify the red state**

Run:

```powershell
npm.cmd test -- --run electron/ipc/__tests__/dashboard-scroll-handoff-ui.spec.ts electron/ipc/__tests__/brand-hero-ui.spec.ts electron/ipc/__tests__/dashboard-interaction-ui.spec.ts electron/ipc/__tests__/dashboard-recent-work-ui.spec.ts
```

Expected: FAIL because the scroll-stage structure and large hero are not implemented.

- [ ] **Step 4: Connect scroll progress in `Dashboard.vue`**

Add the imports and state:

```ts
import { computed, onMounted, ref } from 'vue'
import { useDashboardScrollHandoff } from '@/features/dashboard/dashboard-scroll-handoff'

const dashboardPage = ref<HTMLElement | null>(null)
const { progress: handoffProgress } = useDashboardScrollHandoff(dashboardPage)
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
```

Replace the dashboard template shell with this structure while keeping the current hero props, recent-work props, and system monitor unchanged:

```vue
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
```

- [ ] **Step 5: Implement the scroll-stage CSS**

Replace the old `.dashboard-sheet` geometry with focused layer rules:

```css
.dashboard-page {
  --handoff-progress: 0;
  --hero-shift: 0px;
  --hero-scale: 1;
  --hero-opacity: 1;
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

@media (max-width: 1160px) {
  .dashboard-workspace-layer { grid-template-columns: 1fr; }
}

@media (max-height: 720px) {
  .dashboard-page { min-height: calc(100vh + 190px); }
  .dashboard-scroll-tail { height: 150px; }
}

@media (prefers-reduced-motion: reduce) {
  .dashboard-page { min-height: auto; }
  .dashboard-hero-layer,
  .dashboard-workspace-layer {
    position: relative;
    opacity: 1;
    filter: none;
    transform: none;
    transition: none;
  }
  .dashboard-scroll-tail { display: none; }
}
```

Rebase the existing panel hover/focus selectors from `.dashboard-sheet` to `.dashboard-workspace-layer`. Do not change their current transform values or pointer/focus behavior.

- [ ] **Step 6: Enlarge and soften `BrandHero.vue`**

Change only the hero surface geometry:

```css
.brand-hero {
  position: relative;
  isolation: isolate;
  display: flex;
  width: 100%;
  min-height: clamp(430px, 62vh, 620px);
  max-height: none;
  overflow: hidden;
  border: 0;
  border-radius: var(--radius-hero);
  background:
    radial-gradient(circle at 78% 24%, rgba(239, 126, 170, 0.3), transparent 28%),
    linear-gradient(120deg, #29233f 0%, #4f467d 56%, #8f82e4 100%);
  box-shadow: 0 26px 68px rgba(0, 0, 0, 0.24);
}
```

At `max-height: 720px`, set `min-height: 400px`. Preserve the approved artwork sources, copy, object position, action, and reduced-motion behavior.

- [ ] **Step 7: Run focused tests and commit the spatial handoff**

Run:

```powershell
npm.cmd test -- --run src/features/dashboard/__tests__/dashboard-scroll-handoff.spec.ts electron/ipc/__tests__/dashboard-scroll-handoff-ui.spec.ts electron/ipc/__tests__/brand-hero-ui.spec.ts electron/ipc/__tests__/dashboard-interaction-ui.spec.ts electron/ipc/__tests__/dashboard-recent-work-ui.spec.ts
npm.cmd run typecheck
```

Expected: all focused tests PASS and typecheck exits 0.

Commit:

```powershell
git add -- src/views/Dashboard.vue src/components/dashboard/BrandHero.vue electron/ipc/__tests__/dashboard-scroll-handoff-ui.spec.ts electron/ipc/__tests__/brand-hero-ui.spec.ts electron/ipc/__tests__/dashboard-interaction-ui.spec.ts electron/ipc/__tests__/dashboard-recent-work-ui.spec.ts
git commit -m "feat: hand off dashboard depth on scroll"
```

### Task 3: Remove hard separators and soften dashboard surfaces

**Files:**
- Modify: `src/components/titlebar/TitleBar.vue`
- Modify: `src/components/statusbar/StatusBar.vue`
- Modify: `src/components/dashboard/DashboardRecentWork.vue`
- Modify: `src/views/Dashboard.vue`
- Modify: `src/styles/global.css`
- Modify: `electron/ipc/__tests__/dashboard-scroll-handoff-ui.spec.ts`

- [ ] **Step 1: Add failing separator and surface tests**

Extend `electron/ipc/__tests__/dashboard-scroll-handoff-ui.spec.ts`:

```ts
it('removes the top and bottom shell separators without hiding their controls', () => {
  const titlebar = read('src/components/titlebar/TitleBar.vue')
  const statusbar = read('src/components/statusbar/StatusBar.vue')
  expect(titlebar).toMatch(/\.titlebar\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;/s)
  expect(statusbar).toMatch(/\.statusbar\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;/s)
  expect(statusbar).toMatch(/\.statusbar\.has-error\s*\{[^}]*background:\s*var\(--danger-bg\);[^}]*border:\s*0;/s)
  expect(titlebar).toContain('class="titlebar-controls"')
  expect(statusbar).toContain('status-left')
})

it('uses tonal dashboard statistics instead of hard outlines', () => {
  const recent = read('src/components/dashboard/DashboardRecentWork.vue')
  const dashboard = read('src/views/Dashboard.vue')
  const global = read('src/styles/global.css')
  expect(recent).toMatch(/\.status-segment\s*\{[^}]*border:\s*0;[^}]*background:\s*color-mix/s)
  expect(dashboard).toMatch(/\.dashboard-system\s+:deep\(\.mon-card\)\s*\{[^}]*border:\s*0;/s)
  expect(global).toMatch(/#app\s*\{[^}]*box-shadow:\s*none;/s)
})
```

- [ ] **Step 2: Run the test and verify the red state**

Run:

```powershell
npm.cmd test -- --run electron/ipc/__tests__/dashboard-scroll-handoff-ui.spec.ts
```

Expected: FAIL because separators and hard statistic outlines remain.

- [ ] **Step 3: Remove title and status separators**

Replace the titlebar surface declaration with a readable multiline rule:

```css
.titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--titlebar-height);
  flex-shrink: 0;
  border: 0;
  border-radius: 12px 12px 0 0;
  background: transparent;
  user-select: none;
}
```

Replace the statusbar surface and error state with:

```css
.statusbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--statusbar-height);
  padding: 0 14px;
  flex-shrink: 0;
  border: 0;
  border-radius: 0 0 12px 12px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 11px;
  user-select: none;
}

.statusbar.has-error {
  border: 0;
  background: var(--danger-bg);
}
```

Do not touch window drag, minimize, maximize, close, error dismissal, or version logic.

- [ ] **Step 4: Remove the remaining dashboard outline feel**

In `DashboardRecentWork.vue`, change the base statistic surface to:

```css
.status-segment {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
  min-height: 76px;
  padding: 14px;
  border: 0;
  border-radius: var(--radius-control);
  color: var(--ink-primary);
  background: color-mix(in srgb, var(--surface-secondary) 84%, var(--brand-soft));
  font: inherit;
  text-align: left;
  cursor: pointer;
  transform-origin: center;
  transition: transform 160ms ease, opacity 160ms ease, filter 160ms ease, background 160ms ease;
}

@media (hover: hover) and (pointer: fine) {
  .status-strip:not(:has(.status-segment:focus-visible)) .status-segment:hover {
    background: color-mix(in srgb, var(--surface-secondary) 72%, var(--brand-soft));
    transform: translateY(-3px) scale(1.02);
  }
}
```

Retain the existing `.status-segment:focus-visible`, active-state, peer-recede, and reduced-motion blocks without adding a border back.

In `Dashboard.vue`, use a wider gap and remove dashboard-only monitor row borders:

```css
.dashboard-system :deep(.mon-set) {
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
```

Do not alter the reusable `SystemMonitor.vue` contract.

In `src/styles/global.css`, change the app root shadow to:

```css
#app {
  height: 100%;
  overflow: hidden;
  border-radius: var(--radius-panel);
  box-shadow: none;
}
```

- [ ] **Step 5: Run focused UI and interaction tests**

Run:

```powershell
npm.cmd test -- --run electron/ipc/__tests__/dashboard-scroll-handoff-ui.spec.ts electron/ipc/__tests__/dashboard-interaction-ui.spec.ts electron/ipc/__tests__/editorial-tokens.spec.ts electron/ipc/__tests__/visual-foundation-ui.spec.ts
```

Expected: all focused tests PASS; titlebar double-click protection, error state, hover, focus, and reduced-motion contracts remain intact.

- [ ] **Step 6: Commit the borderless surfaces**

```powershell
git add -- src/components/titlebar/TitleBar.vue src/components/statusbar/StatusBar.vue src/components/dashboard/DashboardRecentWork.vue src/views/Dashboard.vue src/styles/global.css electron/ipc/__tests__/dashboard-scroll-handoff-ui.spec.ts
git commit -m "style: blend dashboard surfaces into the window"
```

### Task 4: Full verification, real-window acceptance, and preview cleanup

**Files:**
- Verify: all changed files from Tasks 1–3
- Delete: `C:\Users\Feng\.codex\visualizations\2026\07\25\019f99f1-4742-74a0-a3ef-891047b821e0\dashboard-scroll-handoff.html`

- [ ] **Step 1: Run the complete automated gate**

Run each command and require exit code 0:

```powershell
npm.cmd test -- --run
npm.cmd run typecheck
npm.cmd run check:ipc
npm.cmd run build:renderer
npm.cmd run branding:build
git diff --check 266e27f..HEAD
```

Expected:

- All Vitest files and tests pass.
- `vue-tsc --noEmit` exits 0.
- IPC output reports 127 contract channels and 127 actual channels with no mismatch.
- Renderer and brand builds complete.
- `git diff --check` produces no output.

- [ ] **Step 2: Start the current local Electron app**

Run:

```powershell
npm.cmd run dev
```

Use the visible `Baka TOOLS` window, not DevTools, for acceptance.

- [ ] **Step 3: Verify 1400×900 behavior**

At the default window size:

- Confirm the titlebar/content and content/statusbar seams have no full-width horizontal lines.
- Confirm the hero occupies the majority of the initial dashboard content and preserves the current character composition.
- Scroll down slowly: the hero must retreat without visible blur, the workspace must rise and become the clear foreground.
- Scroll back up: the transition must reverse without snapping.
- Hover and keyboard-focus each dashboard panel and one statistic item; existing lift/recede behavior must still work.
- Confirm the live image, dataset, annotation, CPU, GPU, and RAM values still render.

- [ ] **Step 4: Verify 1100×720 behavior without editing source files**

Resize the real Electron window using its window edge to approximately 1100×720, then verify:

- Sidebar collapses to its compact icon rail.
- Hero remains readable and does not crop the action.
- Workspace panels form one column.
- Scroll handoff completes with no horizontal overflow or clipped control.
- Titlebar and statusbar remain functional and visually continuous.

- [ ] **Step 5: Verify reduced motion**

In the already-open Electron DevTools, open the Command Menu, run `Show Rendering`, set **Emulate CSS media feature prefers-reduced-motion** to `reduce`, return to the `Baka TOOLS` window, then confirm:

- Hero and workspace appear in natural vertical document flow.
- No scroll-driven translate, scale, filter, or transition remains.
- All content stays reachable.

- [ ] **Step 6: Delete the temporary visual companion**

Delete exactly:

```text
C:\Users\Feng\.codex\visualizations\2026\07\25\019f99f1-4742-74a0-a3ef-891047b821e0\dashboard-scroll-handoff.html
```

Verify with:

```powershell
Test-Path -LiteralPath 'C:\Users\Feng\.codex\visualizations\2026\07\25\019f99f1-4742-74a0-a3ef-891047b821e0\dashboard-scroll-handoff.html'
```

Expected: `False`.

- [ ] **Step 7: Request final code review and preserve the local branch**

Review only commits after `266e27f`, excluding unrelated user-owned working-tree changes. Require no Blocker or Important finding. Keep `codex/visual-foundation-dashboard` local and do not merge, push, publish, package, or delete the branch.
