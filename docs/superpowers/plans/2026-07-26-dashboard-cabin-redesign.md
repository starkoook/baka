# Dashboard Cabin Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic workflow-style dashboard with the approved compact HUD cabin layout and restore the interactive mascot as a first-screen focal point.

**Architecture:** Keep dashboard behavior inside `Dashboard.vue` and reuse the existing Pinia stores plus `Mascot` and `SystemMonitor` components. No new persistence or IPC is introduced; routing decisions continue to derive from the current task, dataset count, and gallery state.

**Tech Stack:** Vue 3, TypeScript, Pinia, Vue Router, Vitest, scoped CSS.

---

### Task 1: Lock the approved dashboard structure with a regression test

**Files:**
- Modify: `electron/ipc/__tests__/workbench-ui.spec.ts`
- Test: `electron/ipc/__tests__/workbench-ui.spec.ts`

- [ ] **Step 1: Replace the workflow assertion with the approved cabin assertions**

```ts
it('uses the mascot cabin dashboard instead of a tutorial workflow', () => {
  expect(dashboard).toContain("import Mascot from '@/components/monitor/Mascot.vue'")
  expect(dashboard).toContain("import SystemMonitor from '@/components/monitor/SystemMonitor.vue'")
  expect(dashboard).toContain('图库与标注')
  expect(dashboard).toContain('提示词反推')
  expect(dashboard).toContain('训练中心')
  expect(dashboard).toContain('继续工作')
  expect(dashboard).not.toContain('workflow-grid')
})
```

- [ ] **Step 2: Run the focused test and verify the new expectation fails**

Run: `npm.cmd test -- electron/ipc/__tests__/workbench-ui.spec.ts`

Expected: FAIL because the current dashboard does not import `Mascot` or `SystemMonitor` and still contains `workflow-grid`.

### Task 2: Build the approved dashboard cabin

**Files:**
- Modify: `src/views/Dashboard.vue`
- Reuse: `src/components/monitor/Mascot.vue`
- Reuse: `src/components/monitor/SystemMonitor.vue`

- [ ] **Step 1: Replace the dashboard model with three real modules and one continue target**

```ts
import { useAppStore } from '@/stores/app'
import Mascot from '@/components/monitor/Mascot.vue'
import SystemMonitor from '@/components/monitor/SystemMonitor.vue'

const appStore = useAppStore()

const modules = computed(() => [
  { title: '图库与标注', description: '整理素材、批量识别标签', status: `${imageCount.value} 张`, route: '/gallery' },
  { title: '提示词反推', description: '本地标签、自然描述、绘图提示词', status: '可使用', route: '/reverse' },
  { title: '训练中心', description: '环境安装、参数设置、训练进度', status: `${datasetCount.value} 个数据集`, route: '/training' },
])
```

Keep the current `continueTarget` logic: an active task routes to `/training/run`, prepared datasets route to `/training`, and an empty workspace routes to `/gallery`.

- [ ] **Step 2: Replace the hero and workflow markup with the compact title, module cabin, mascot cabin, task cabin, and system cabin**

```vue
<header class="cabin-heading">
  <div>
    <span class="cabin-code">SYS-LN // PERSONAL WORKSPACE</span>
    <h1>✨ Baka TOOLS</h1>
  </div>
  <span class="online-state">工作舱已就绪</span>
</header>

<section class="main-grid">
  <article class="cabin module-cabin">
    <button v-for="module in modules" :key="module.route" @click="router.push(module.route)">
      <strong>{{ module.title }}</strong>
      <small>{{ module.description }}</small>
      <span>{{ module.status }}</span>
    </button>
  </article>
  <article v-if="appStore.showMascot" class="cabin mascot-cabin">
    <Mascot />
    <button @click="router.push(continueTarget)">继续工作</button>
  </article>
</section>
```

When `showMascot` is false, apply a `mascot-hidden` class to the main grid so the module cabin expands to the available width.

- [ ] **Step 3: Add scoped HUD cabin styles and responsive behavior**

Use a two-column `main-grid` above 980px and one column below it. Keep the title compact, reuse existing theme variables, size the mascot around 200–230px tall, preserve the hologram floor, and avoid fixed viewport heights or horizontal scrolling. Under `prefers-reduced-motion`, disable dashboard entrance transitions; the reused mascot component already handles its own reduced-motion state.

- [ ] **Step 4: Run the focused test and type check**

Run: `npm.cmd test -- electron/ipc/__tests__/workbench-ui.spec.ts`

Expected: 3 tests pass.

Run: `npm.cmd run typecheck`

Expected: exit code 0.

### Task 3: Verify appearance and prevent regressions

**Files:**
- Verify: `src/views/Dashboard.vue`
- Test: `electron/ipc/__tests__/workbench-ui.spec.ts`

- [ ] **Step 1: Start the local renderer and inspect the dashboard at 1280×720**

Run: `npm.cmd exec vite -- --host 127.0.0.1`

Expected: the dashboard shows a compact header, three module rows, a visible mascot cabin, current-task state, and system health without the tutorial workflow or horizontal overflow.

- [ ] **Step 2: Verify the full project**

Run: `npm.cmd test`

Expected: all tests pass.

Run: `npm.cmd run typecheck`

Expected: exit code 0.

Run: `npm.cmd run check:ipc`

Expected: all 102 IPC channels match the contract.

Run: `npm.cmd run build`

Expected: Vite production build exits with code 0.

- [ ] **Step 3: Review the final diff**

Run: `git diff --check -- src/views/Dashboard.vue electron/ipc/__tests__/workbench-ui.spec.ts`

Expected: no whitespace errors and no unrelated files changed by this redesign.
