# Visual Foundation and Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the global cute-HUD shell and dashboard card wall with a quiet editorial application shell and a character-led dashboard hero while preserving existing routes, stores, training behavior, and dashboard-only mascot visibility.

**Architecture:** Introduce a data-only navigation model and dashboard summary helpers, then render them through a new left sidebar and focused dashboard components. The application shell owns navigation and neutral surfaces; the dashboard alone owns the character artwork and branded motion. Runtime hero variants are generated from one approved master image by a deterministic Sharp script.

**Tech Stack:** Vue 3, TypeScript, Pinia, Vue Router, CSS design tokens, Vitest, Sharp, Electron/Vite.

---

## Scope and follow-on plans

This is phase 1 of the approved visual-system specification. It intentionally stops after the visual foundation, application shell, and dashboard are working and verified.

Later phases receive separate plans:

1. Gallery and metadata viewer.
2. Annotation workspace.
3. Training workbench, settings, and final visual QA.

Do not redesign those pages in this phase. They should inherit the neutral shell and compatibility tokens without changing their internal structure.

## File map

### Create

- `src/features/navigation/app-navigation.ts` — single source of truth for sidebar items and active-route matching.
- `src/features/navigation/__tests__/app-navigation.spec.ts` — route matching tests.
- `src/features/dashboard/dashboard-summary.ts` — pure dashboard text and target selection.
- `src/features/dashboard/__tests__/dashboard-summary.spec.ts` — summary behavior tests.
- `src/components/common/AppIcon.vue` — the six monochrome navigation icons.
- `src/components/sidebar/AppSidebar.vue` — fixed left navigation.
- `src/components/dashboard/BrandHero.vue` — dashboard-only character hero.
- `src/components/dashboard/DashboardRecentWork.vue` — recent datasets, current task, and entry rows.
- `scripts/build-brand-assets.js` — validates the approved master image and emits runtime variants.
- `electron/ipc/__tests__/visual-foundation-ui.spec.ts` — source-level shell and dashboard contract.
- `public/branding/dashboard-hero-master.png` — approved 2400×900 master artwork.
- `public/branding/dashboard-hero-1920.webp` — wide runtime variant.
- `public/branding/dashboard-hero-1200.webp` — small-window runtime variant.

### Modify

- `src/layouts/MainLayout.vue` — remove global atmosphere effects and mount the sidebar.
- `src/views/Dashboard.vue` — compose the new hero and recent-work sections.
- `src/components/titlebar/TitleBar.vue` — quiet title bar and remove gradient/dots.
- `src/components/statusbar/StatusBar.vue` — quiet persistent status without ornamental glow.
- `src/styles/variables.css` — add editorial semantic tokens while keeping compatibility aliases.
- `src/styles/global.css` — remove grid/HUD/page-wipe motion and define neutral page geometry.
- `src/styles/components.css` — convert buttons and form fields from pill/glow styling to restrained controls.
- `src/stores/app.ts` — replace theme-wipe behavior with direct theme switching.
- `package.json` — add the brand asset build script.
- `electron/ipc/__tests__/workbench-ui.spec.ts` — update dashboard assertions from the retired cabin to the new hero.

### Delete after references are removed

- `src/components/sidebar/TopMenuBar.vue` — replaced by `AppSidebar.vue`.
- `src/components/monitor/Mascot.vue` — its random walking/bouncing behavior conflicts with the approved hero behavior.

Keep `src/components/monitor/Live2DLoader.vue` unchanged. Live2D is explicitly outside this phase.

## Task 1: Lock the dashboard behavior in pure tests

**Files:**
- Create: `src/features/dashboard/dashboard-summary.ts`
- Create: `src/features/dashboard/__tests__/dashboard-summary.spec.ts`

- [ ] **Step 1: Write the failing dashboard summary tests**

```ts
import { describe, expect, it } from 'vitest'
import { getContinueAction, getDashboardSnapshot } from '../dashboard-summary'

describe('dashboard summary', () => {
  it('continues the active task before choosing another workspace', () => {
    expect(getContinueAction({ datasetCount: 2, activeTaskName: '训练 my_lora' }))
      .toEqual({ label: '继续 训练 my_lora', route: '/training/run' })
  })

  it('sends prepared datasets to training', () => {
    expect(getContinueAction({ datasetCount: 2, activeTaskName: null }))
      .toEqual({ label: '继续准备训练', route: '/training' })
  })

  it('sends an empty workspace to the gallery', () => {
    expect(getContinueAction({ datasetCount: 0, activeTaskName: null }))
      .toEqual({ label: '导入第一批素材', route: '/gallery' })
  })

  it('builds a compact snapshot without inventing metrics', () => {
    expect(getDashboardSnapshot({ imageCount: 428, datasetCount: 3, activeTaskName: null }))
      .toEqual([
        { label: '图库', value: '428 张', route: '/gallery' },
        { label: '数据集', value: '3 个', route: '/gallery' },
        { label: '训练', value: '等待开始', route: '/training' },
      ])
  })
})
```

- [ ] **Step 2: Run the test and verify the module is missing**

Run: `npx vitest run src/features/dashboard/__tests__/dashboard-summary.spec.ts`

Expected: FAIL because `../dashboard-summary` does not exist.

- [ ] **Step 3: Implement the pure helpers**

```ts
export interface DashboardSummaryInput {
  imageCount: number
  datasetCount: number
  activeTaskName: string | null
}

export interface DashboardAction {
  label: string
  route: string
}

export function getContinueAction(
  input: Pick<DashboardSummaryInput, 'datasetCount' | 'activeTaskName'>,
): DashboardAction {
  if (input.activeTaskName) {
    return { label: `继续 ${input.activeTaskName}`, route: '/training/run' }
  }
  if (input.datasetCount > 0) {
    return { label: '继续准备训练', route: '/training' }
  }
  return { label: '导入第一批素材', route: '/gallery' }
}

export function getDashboardSnapshot(input: DashboardSummaryInput): Array<DashboardAction & { value: string }> {
  return [
    { label: '图库', value: `${input.imageCount} 张`, route: '/gallery' },
    { label: '数据集', value: `${input.datasetCount} 个`, route: '/gallery' },
    {
      label: '训练',
      value: input.activeTaskName ?? (input.datasetCount > 0 ? '可以开始' : '等待开始'),
      route: input.activeTaskName ? '/training/run' : '/training',
    },
  ]
}
```

- [ ] **Step 4: Run the helper tests**

Run: `npx vitest run src/features/dashboard/__tests__/dashboard-summary.spec.ts`

Expected: 4 tests PASS.

- [ ] **Step 5: Commit the dashboard behavior**

```powershell
git add src/features/dashboard/dashboard-summary.ts src/features/dashboard/__tests__/dashboard-summary.spec.ts
git commit -m "test: define dashboard summary behavior"
```

## Task 2: Create one navigation model

**Files:**
- Create: `src/features/navigation/app-navigation.ts`
- Create: `src/features/navigation/__tests__/app-navigation.spec.ts`

- [ ] **Step 1: Write route matching tests**

```ts
import { describe, expect, it } from 'vitest'
import { APP_NAVIGATION, isNavigationItemActive } from '../app-navigation'

describe('app navigation', () => {
  it('exposes the six approved top-level items', () => {
    expect(APP_NAVIGATION.map((item) => item.label))
      .toEqual(['主页', '图库', '标注', '训练', '工具', '设置'])
  })

  it('matches nested training routes to training', () => {
    const item = APP_NAVIGATION.find((candidate) => candidate.id === 'training')!
    expect(isNavigationItemActive(item, '/training/runtime')).toBe(true)
    expect(isNavigationItemActive(item, '/gallery')).toBe(false)
  })

  it('matches the dashboard only at the root route', () => {
    const item = APP_NAVIGATION.find((candidate) => candidate.id === 'home')!
    expect(isNavigationItemActive(item, '/')).toBe(true)
    expect(isNavigationItemActive(item, '/gallery')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test and verify the module is missing**

Run: `npx vitest run src/features/navigation/__tests__/app-navigation.spec.ts`

Expected: FAIL because `../app-navigation` does not exist.

- [ ] **Step 3: Implement the navigation model**

```ts
export type AppNavigationId = 'home' | 'gallery' | 'tagger' | 'training' | 'tools' | 'settings'

export interface AppNavigationItem {
  id: AppNavigationId
  label: string
  route: string
  matches: string[]
}

export const APP_NAVIGATION: AppNavigationItem[] = [
  { id: 'home', label: '主页', route: '/', matches: ['/'] },
  { id: 'gallery', label: '图库', route: '/gallery', matches: ['/gallery'] },
  { id: 'tagger', label: '标注', route: '/tagger', matches: ['/tagger'] },
  { id: 'training', label: '训练', route: '/training', matches: ['/training'] },
  { id: 'tools', label: '工具', route: '/reverse', matches: ['/reverse', '/upscale', '/generate', '/console'] },
  { id: 'settings', label: '设置', route: '/settings', matches: ['/settings'] },
]

export function isNavigationItemActive(item: AppNavigationItem, routePath: string): boolean {
  if (item.id === 'home') return routePath === '/'
  return item.matches.some((prefix) => routePath === prefix || routePath.startsWith(`${prefix}/`))
}
```

- [ ] **Step 4: Run navigation tests**

Run: `npx vitest run src/features/navigation/__tests__/app-navigation.spec.ts`

Expected: 3 tests PASS.

- [ ] **Step 5: Commit the navigation model**

```powershell
git add src/features/navigation/app-navigation.ts src/features/navigation/__tests__/app-navigation.spec.ts
git commit -m "feat: define application navigation"
```

## Task 3: Add a source-level visual contract

**Files:**
- Create: `electron/ipc/__tests__/visual-foundation-ui.spec.ts`
- Modify: `electron/ipc/__tests__/workbench-ui.spec.ts`

- [ ] **Step 1: Write the failing shell and dashboard contract**

```ts
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('character-led visual foundation', () => {
  it('uses a left application sidebar and no global HUD atmosphere', () => {
    const layout = read('src/layouts/MainLayout.vue')
    expect(layout).toContain("import AppSidebar from '@/components/sidebar/AppSidebar.vue'")
    expect(layout).not.toContain('TopMenuBar')
    expect(layout).not.toContain('scanlines')
    expect(layout).not.toContain('sakura-global')
    expect(layout).not.toContain('sparkles')
  })

  it('keeps character artwork on the dashboard only', () => {
    const dashboard = read('src/views/Dashboard.vue')
    expect(dashboard).toContain("import BrandHero from '@/components/dashboard/BrandHero.vue'")
    expect(read('src/views/Gallery.vue')).not.toContain('BrandHero')
    expect(read('src/views/Tagger.vue')).not.toContain('BrandHero')
    expect(read('src/views/TrainingTask.vue')).not.toContain('BrandHero')
  })

  it('retires the old horizontal menu and walking mascot', () => {
    expect(existsSync(resolve(process.cwd(), 'src/components/sidebar/TopMenuBar.vue'))).toBe(false)
    expect(existsSync(resolve(process.cwd(), 'src/components/monitor/Mascot.vue'))).toBe(false)
  })

  it('keeps reduced-motion support in the shell and hero', () => {
    expect(read('src/layouts/MainLayout.vue')).toContain('prefers-reduced-motion: reduce')
    expect(read('src/components/dashboard/BrandHero.vue')).toContain('prefers-reduced-motion: reduce')
  })
})
```

- [ ] **Step 2: Replace the obsolete dashboard assertion in `workbench-ui.spec.ts`**

Replace the first test with:

```ts
it('uses the approved character-led dashboard instead of a tutorial workflow', () => {
  expect(dashboard).toContain("import BrandHero from '@/components/dashboard/BrandHero.vue'")
  expect(dashboard).toContain("import DashboardRecentWork from '@/components/dashboard/DashboardRecentWork.vue'")
  expect(dashboard).not.toContain('workflow-grid')
  expect(dashboard).not.toContain('cabin-label')
})
```

- [ ] **Step 3: Run the contract and verify it fails**

Run: `npx vitest run electron/ipc/__tests__/visual-foundation-ui.spec.ts electron/ipc/__tests__/workbench-ui.spec.ts`

Expected: FAIL because the new sidebar and dashboard components do not exist and the retired files still exist.

- [ ] **Step 4: Commit the failing contract**

```powershell
git add electron/ipc/__tests__/visual-foundation-ui.spec.ts electron/ipc/__tests__/workbench-ui.spec.ts
git commit -m "test: lock character-led visual foundation"
```

## Task 4: Replace HUD tokens with editorial tokens

**Files:**
- Modify: `src/styles/variables.css`
- Modify: `src/styles/global.css`
- Modify: `src/styles/components.css`
- Modify: `src/stores/app.ts`

- [ ] **Step 1: Add semantic editorial tokens and compatibility aliases**

Define both themes with this contract; exact colors may be tuned only after a rendered screenshot review:

```css
:root {
  --app-bg: #f2eef2;
  --surface-primary: #fffafd;
  --surface-secondary: #f7f2f7;
  --surface-selected: #eee9fb;
  --ink-primary: #241d28;
  --ink-secondary: #6f6673;
  --ink-tertiary: #918895;
  --brand-primary: #7669d8;
  --brand-primary-hover: #6659c8;
  --brand-soft: #ebe7fb;
  --action-accent: #d95f8f;
  --line-subtle: rgba(43, 31, 49, 0.10);
  --line-strong: rgba(43, 31, 49, 0.18);
  --surface-shadow: 0 14px 40px rgba(49, 34, 54, 0.10);
  --radius-control: 8px;
  --radius-panel: 12px;
  --radius-hero: 22px;

  --bg-primary: var(--app-bg);
  --bg-secondary: var(--surface-secondary);
  --bg-elevated: var(--surface-primary);
  --text-primary: var(--ink-primary);
  --text-secondary: var(--ink-secondary);
  --text-tertiary: var(--ink-tertiary);
  --accent-primary: var(--brand-primary);
  --border-default: var(--line-subtle);
  --border-subtle: var(--line-subtle);
}

[data-theme='dark'] {
  --app-bg: #18151b;
  --surface-primary: #211d24;
  --surface-secondary: #29242d;
  --surface-selected: #332d49;
  --ink-primary: #f5eff6;
  --ink-secondary: #c3b8c6;
  --ink-tertiary: #918694;
  --brand-primary: #9588ec;
  --brand-primary-hover: #a79bf4;
  --brand-soft: #302a46;
  --action-accent: #ef7eaa;
  --line-subtle: rgba(255, 244, 255, 0.10);
  --line-strong: rgba(255, 244, 255, 0.18);
  --surface-shadow: 0 18px 48px rgba(0, 0, 0, 0.24);
}
```

- [ ] **Step 2: Replace ornamental global motion with neutral geometry**

`global.css` must keep only the application reset, typography, page scrolling, focus visibility, and this reduced-motion rule:

```css
:focus-visible {
  outline: 2px solid var(--brand-primary);
  outline-offset: 2px;
}

.page-enter-active,
.page-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}

.page-enter-from,
.page-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
}
```

Remove `.bg-grid`, `.theme-wiping`, sakura, scanline, sparkle, glow, bounce, and paw-print rules.

- [ ] **Step 3: Restrain shared buttons and fields**

Replace pill/glow styling with this geometry:

```css
.btn {
  min-height: 36px;
  padding: 8px 14px;
  border: 1px solid var(--line-subtle);
  border-radius: var(--radius-control);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
}

.btn-primary {
  color: #fff;
  background: var(--brand-primary);
  border-color: var(--brand-primary);
  box-shadow: none;
}

.btn-primary:hover {
  background: var(--brand-primary-hover);
  border-color: var(--brand-primary-hover);
  transform: none;
}

.form-input,
.form-select,
.form-textarea {
  border: 1px solid var(--line-subtle);
  border-radius: var(--radius-control);
  background: var(--surface-primary);
  color: var(--ink-primary);
  box-shadow: none;
}
```

- [ ] **Step 4: Remove the theme wipe from the app store**

```ts
function toggleTheme() {
  setTheme(theme.value === 'dark' ? 'light' : 'dark')
}
```

- [ ] **Step 5: Run existing tests and typecheck**

Run: `npm test -- --run`

Expected: existing functional tests PASS; visual-foundation tests may still FAIL because components are not built yet.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit the visual tokens**

```powershell
git add src/styles/variables.css src/styles/global.css src/styles/components.css src/stores/app.ts
git commit -m "style: establish editorial visual tokens"
```

## Task 5: Build the left sidebar and neutral shell

**Files:**
- Create: `src/components/common/AppIcon.vue`
- Create: `src/components/sidebar/AppSidebar.vue`
- Modify: `src/layouts/MainLayout.vue`
- Modify: `src/components/titlebar/TitleBar.vue`
- Modify: `src/components/statusbar/StatusBar.vue`
- Delete: `src/components/sidebar/TopMenuBar.vue`

- [ ] **Step 1: Implement the six navigation icons**

```vue
<script setup lang="ts">
import type { AppNavigationId } from '@/features/navigation/app-navigation'

defineProps<{ name: AppNavigationId }>()
</script>

<template>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <template v-if="name === 'home'">
      <path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" />
    </template>
    <template v-else-if="name === 'gallery'">
      <rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="9" r="2" /><path d="m5 17 4-4 3 3 2-2 5 5" />
    </template>
    <template v-else-if="name === 'tagger'">
      <path d="M20 13 13 20 4 11V4h7Z" /><circle cx="8.5" cy="8.5" r="1.5" />
    </template>
    <template v-else-if="name === 'training'">
      <path d="M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0-2 5.3A3.5 3.5 0 0 0 9 18" /><path d="M15 4a3 3 0 0 1 3 3v1a3 3 0 0 1 2 5.3A3.5 3.5 0 0 1 15 18" /><path d="M12 3v18M8 9h4M12 15h4" />
    </template>
    <template v-else-if="name === 'tools'">
      <path d="M14.7 6.3a4 4 0 0 0-5 5L3 18l3 3 6.7-6.7a4 4 0 0 0 5-5l-2.4 2.4-3-3Z" />
    </template>
    <template v-else>
      <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </template>
  </svg>
</template>
```

- [ ] **Step 2: Implement `AppSidebar.vue` from the navigation model**

The component must:

```vue
<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { APP_NAVIGATION, isNavigationItemActive } from '@/features/navigation/app-navigation'
import { useAppStore } from '@/stores/app'
import AppIcon from '@/components/common/AppIcon.vue'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
</script>

<template>
  <aside class="app-sidebar" aria-label="主导航">
    <button class="sidebar-brand" aria-label="返回主页" @click="router.push('/')">
      <span class="brand-mark" aria-hidden="true">B</span>
      <span><strong>Baka</strong><small>TOOLS</small></span>
    </button>

    <nav class="sidebar-nav">
      <button
        v-for="item in APP_NAVIGATION"
        :key="item.id"
        class="sidebar-item"
        :class="{ active: isNavigationItemActive(item, route.path) }"
        :aria-current="isNavigationItemActive(item, route.path) ? 'page' : undefined"
        @click="router.push(item.route)"
      >
        <AppIcon class="sidebar-icon" :name="item.id" />
        <span>{{ item.label }}</span>
      </button>
    </nav>

    <div class="sidebar-footer">
      <span class="runtime-state"><i></i> 本地模式</span>
      <small>v{{ appStore.version }}</small>
    </div>
  </aside>
</template>
```

- [ ] **Step 3: Replace `MainLayout.vue` with the neutral shell**

```vue
<script setup lang="ts">
import TitleBar from '@/components/titlebar/TitleBar.vue'
import AppSidebar from '@/components/sidebar/AppSidebar.vue'
import StatusBar from '@/components/statusbar/StatusBar.vue'
</script>

<template>
  <div class="main-layout">
    <TitleBar />
    <div class="app-workspace">
      <AppSidebar />
      <main class="main-content"><slot /></main>
    </div>
    <StatusBar />
  </div>
</template>

<style scoped>
.main-layout {
  display: grid;
  grid-template-rows: var(--titlebar-height) minmax(0, 1fr) var(--statusbar-height);
  height: 100vh;
  overflow: hidden;
  background: var(--app-bg);
}
.app-workspace { display: grid; grid-template-columns: 176px minmax(0, 1fr); min-height: 0; }
.main-content { min-width: 0; overflow: auto; padding: 24px 28px 36px; }
@media (max-width: 1200px) {
  .app-workspace { grid-template-columns: 72px minmax(0, 1fr); }
  .main-content { padding-inline: 20px; }
}
@media (prefers-reduced-motion: reduce) {
  .main-content { scroll-behavior: auto; }
}
</style>
```

- [ ] **Step 4: Quiet the title and status bars**

Remove title gradients, decorative dots, glow lines, pulsing idle state, and the ornamental bottom dot. Preserve window drag regions, minimize/maximize/close behavior, current status, errors, dismiss action, and version.

- [ ] **Step 5: Delete the retired horizontal menu**

Delete `src/components/sidebar/TopMenuBar.vue` only after `rg -n "TopMenuBar" src` returns no import.

- [ ] **Step 6: Run navigation and shell tests**

Run: `npx vitest run src/features/navigation/__tests__/app-navigation.spec.ts electron/ipc/__tests__/visual-foundation-ui.spec.ts`

Expected: navigation tests PASS; visual contract still FAIL only on missing dashboard components and existing `Mascot.vue`.

- [ ] **Step 7: Run typecheck and renderer build**

Run: `npm run typecheck`

Expected: PASS.

Run: `npm run build:renderer`

Expected: Vite build succeeds.

- [ ] **Step 8: Commit the shell**

```powershell
git add src/components/common/AppIcon.vue src/components/sidebar/AppSidebar.vue src/layouts/MainLayout.vue src/components/titlebar/TitleBar.vue src/components/statusbar/StatusBar.vue src/components/sidebar/TopMenuBar.vue
git commit -m "feat: replace top menu with editorial sidebar"
```

## Task 6: Produce deterministic hero assets

**Files:**
- Create: `public/branding/dashboard-hero-master.png`
- Create: `scripts/build-brand-assets.js`
- Create: `public/branding/dashboard-hero-1920.webp`
- Create: `public/branding/dashboard-hero-1200.webp`
- Modify: `package.json`

- [ ] **Step 1: Create and approve the master artwork**

Use `public/mascot.png` as the character identity reference. Outpaint rather than crop it:

- Canvas: 2400×900.
- Character face and upper body: right 55% of the canvas.
- Left 40%: low-detail lavender background safe for dark text.
- Preserve pink hair, eye color, black outfit, facial structure, earrings, and selfie perspective.
- Do not add text, logos, UI chrome, extra characters, or a second set of hands.
- Inspect at original resolution for malformed fingers, eyes, hair edges, and repeated jewelry before accepting.

Save the approved result as `public/branding/dashboard-hero-master.png`.

- [ ] **Step 2: Add the Sharp build script**

```js
const path = require('node:path')
const sharp = require('sharp')

const root = path.resolve(__dirname, '..')
const source = path.join(root, 'public', 'branding', 'dashboard-hero-master.png')

async function writeVariant(name, width, height) {
  await sharp(source)
    .resize(width, height, { fit: 'cover', position: 'center' })
    .webp({ quality: 88, smartSubsample: true })
    .toFile(path.join(root, 'public', 'branding', name))
}

async function main() {
  const metadata = await sharp(source).metadata()
  if (metadata.width !== 2400 || metadata.height !== 900) {
    throw new Error(`dashboard hero must be 2400x900, got ${metadata.width}x${metadata.height}`)
  }
  await writeVariant('dashboard-hero-1920.webp', 1920, 720)
  await writeVariant('dashboard-hero-1200.webp', 1200, 600)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
```

- [ ] **Step 3: Register and run the script**

Add to `package.json`:

```json
"branding:build": "node scripts/build-brand-assets.js"
```

Run: `npm run branding:build`

Expected: both WebP variants are created without errors.

- [ ] **Step 4: Verify dimensions and file sizes**

Run:

```powershell
node -e "const sharp=require('sharp'); Promise.all(['public/branding/dashboard-hero-1920.webp','public/branding/dashboard-hero-1200.webp'].map(async p=>console.log(p,await sharp(p).metadata()))).catch(e=>{console.error(e);process.exit(1)})"
```

Expected: dimensions are 1920×720 and 1200×600; each runtime file is below 1.5 MB.

- [ ] **Step 5: Commit the approved assets and pipeline**

```powershell
git add public/branding/dashboard-hero-master.png public/branding/dashboard-hero-1920.webp public/branding/dashboard-hero-1200.webp scripts/build-brand-assets.js package.json
git commit -m "feat: add dashboard hero artwork pipeline"
```

## Task 7: Build the dashboard hero

**Files:**
- Create: `src/components/dashboard/BrandHero.vue`

- [ ] **Step 1: Implement the dashboard-only hero**

```vue
<script setup lang="ts">
defineProps<{
  actionLabel: string
  showArtwork: boolean
}>()

const emit = defineEmits<{ action: [] }>()
</script>

<template>
  <section class="brand-hero" :class="{ 'artwork-hidden': !showArtwork }">
    <picture v-if="showArtwork" class="hero-artwork" aria-hidden="true">
      <source media="(max-width: 1200px)" srcset="/branding/dashboard-hero-1200.webp" />
      <img src="/branding/dashboard-hero-1920.webp" alt="" />
    </picture>
    <div class="hero-shade" aria-hidden="true"></div>
    <div class="hero-copy">
      <span class="hero-kicker">BAKA CREATIVE STUDIO</span>
      <h1>欢迎回来，继续完成你的作品。</h1>
      <p>素材整理、标注和 LoRA 训练都在同一个本地工作区。</p>
      <button class="btn btn-primary" @click="emit('action')">{{ actionLabel }}</button>
    </div>
  </section>
</template>
```

The scoped CSS must:

- Use `aspect-ratio: 8 / 3` on wide windows and a minimum height of 300px.
- Keep copy within the left 40% safe area.
- Use `object-fit: cover` and `object-position: center`.
- Apply only a subtle 12-second 1.00–1.03 image scale.
- Stop image motion under `prefers-reduced-motion: reduce`.
- Provide a quiet gradient fallback when `showArtwork` is false.
- Never display speech bubbles, hearts, walking, sleeping, or random messages.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 3: Commit the hero component**

```powershell
git add src/components/dashboard/BrandHero.vue
git commit -m "feat: add dashboard brand hero"
```

## Task 8: Recompose the dashboard around useful work

**Files:**
- Create: `src/components/dashboard/DashboardRecentWork.vue`
- Modify: `src/views/Dashboard.vue`
- Delete: `src/components/monitor/Mascot.vue`

- [ ] **Step 1: Implement the recent-work component**

Use rows rather than a metric-card wall:

```vue
<script setup lang="ts">
import type { DashboardAction } from '@/features/dashboard/dashboard-summary'

defineProps<{
  items: Array<DashboardAction & { value: string }>
  task: { name: string; progress: number; eta: string; speed: string } | null
}>()

const emit = defineEmits<{ navigate: [route: string] }>()
</script>

<template>
  <section class="recent-work" aria-labelledby="recent-work-title">
    <header><h2 id="recent-work-title">继续创作</h2><span>最近工作</span></header>
    <button v-for="item in items" :key="item.label" class="work-row" @click="emit('navigate', item.route)">
      <span><strong>{{ item.label }}</strong><small>{{ item.value }}</small></span>
      <span aria-hidden="true">→</span>
    </button>
    <div v-if="task" class="active-task">
      <span><strong>{{ task.name }}</strong><small>{{ task.speed }} · 预计 {{ task.eta }}</small></span>
      <b>{{ task.progress }}%</b>
      <div class="task-track"><i :style="{ width: `${task.progress}%` }"></i></div>
    </div>
  </section>
</template>
```

- [ ] **Step 2: Rewrite `Dashboard.vue` as composition only**

The script must compute data through the helper rather than duplicating decisions:

```ts
const summaryInput = computed(() => ({
  imageCount: galleryStore.roots.reduce((sum, root) => sum + (root.image_count ?? 0), 0),
  datasetCount: galleryStore.datasets.length,
  activeTaskName: pipelineStore.currentTask?.name ?? null,
}))

const continueAction = computed(() => getContinueAction(summaryInput.value))
const snapshot = computed(() => getDashboardSnapshot(summaryInput.value))

function continueWork() { router.push(continueAction.value.route) }
function navigate(route: string) { router.push(route) }
```

The template must compose:

```vue
<main class="dashboard-page">
  <BrandHero
    :action-label="continueAction.label"
    :show-artwork="appStore.showMascot"
    @action="continueWork"
  />
  <div class="dashboard-sheet">
    <DashboardRecentWork :items="snapshot" :task="pipelineStore.currentTask" @navigate="navigate" />
    <SystemMonitor class="dashboard-system" />
  </div>
</main>
```

`dashboard-sheet` overlaps the hero by 24px, uses one shared surface, and stacks at 1100–1200px. Do not restore module cards or emoji icons.

- [ ] **Step 3: Delete the retired mascot component**

Run: `rg -n "monitor/Mascot|<Mascot" src`

Expected: no results after the dashboard rewrite.

Delete `src/components/monitor/Mascot.vue`.

- [ ] **Step 4: Run dashboard and visual contract tests**

Run:

```powershell
npx vitest run src/features/dashboard/__tests__/dashboard-summary.spec.ts electron/ipc/__tests__/visual-foundation-ui.spec.ts electron/ipc/__tests__/workbench-ui.spec.ts
```

Expected: all listed tests PASS.

- [ ] **Step 5: Run full renderer verification**

Run: `npm run typecheck`

Expected: PASS.

Run: `npm run build:renderer`

Expected: Vite build succeeds.

- [ ] **Step 6: Commit the dashboard**

```powershell
git add src/components/dashboard/DashboardRecentWork.vue src/views/Dashboard.vue src/components/monitor/Mascot.vue
git commit -m "feat: rebuild dashboard around character hero"
```

## Task 9: Visual and interaction acceptance

**Files:**
- Modify only files from Tasks 4–8 when a verified defect is found.

- [ ] **Step 1: Start the application**

Run: `npm run dev`

Expected: Electron opens on the dashboard without renderer errors.

- [ ] **Step 2: Verify the 1440×900 baseline**

Confirm all of the following:

- Character face is fully visible and does not overlap text.
- The primary action appears without scrolling.
- The lower sheet overlaps the hero by 24px.
- Sidebar labels fit without clipping.
- No scanlines, sakura, sparkles, global glow pools, holographic grid, or card wall remain.
- Gallery, annotation, and training routes still open inside the new shell.

- [ ] **Step 3: Verify the 1100×720 minimum window**

Confirm:

- Sidebar collapses to icons.
- Hero uses the 1200px art variant.
- Copy and button remain visible.
- Lower dashboard content stacks without horizontal scrolling.

- [ ] **Step 4: Verify settings behavior**

Toggle “显示小人” off and on.

Expected: only dashboard hero artwork changes; layout keeps a quiet gradient fallback and no other page displays character artwork.

Toggle light and dark themes.

Expected: text, controls, sidebar, title bar, status bar, and dashboard sheet remain readable; the hero artwork is unchanged.

- [ ] **Step 5: Verify reduced motion**

Enable Windows “Animation effects” reduction or emulate `prefers-reduced-motion: reduce`.

Expected: the hero image stops scaling and page transitions become effectively instant.

- [ ] **Step 6: Run the full quality gate**

Run:

```powershell
npm test -- --run
npm run typecheck
npm run check:ipc
npm run build:renderer
```

Expected: every command exits with code 0.

- [ ] **Step 7: Review the final diff for scope**

Run: `git diff --stat HEAD~8..HEAD`

Expected: changes are limited to the files listed in this plan; no gallery, annotation, training backend, component manager, updater, or packaging logic changed.

- [ ] **Step 8: Commit acceptance-only fixes**

If visual QA required fixes:

```powershell
git add src/layouts/MainLayout.vue src/views/Dashboard.vue src/components/dashboard src/components/sidebar/AppSidebar.vue src/components/titlebar/TitleBar.vue src/components/statusbar/StatusBar.vue src/styles
git commit -m "fix: complete dashboard visual acceptance"
```

If no fixes were required, do not create an empty commit.

## Completion criteria

- The approved character-led dashboard is implemented with the existing character identity.
- The character appears only on the dashboard.
- The old global HUD atmosphere and horizontal menu are gone.
- All existing routes and workspaces remain functional.
- The dashboard chooses a useful continuation action from real store state.
- Light, dark, 1440×900, 1100×720, and reduced-motion states have been visually checked.
- Full tests, typecheck, IPC check, and renderer build pass.
- No Live2D runtime or model import is added in this phase.
