# Compact Gallery and Annotation Workspaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将图库和标注改为 A「紧凑工作台」布局，让内容占据主要空间，并确保吉祥物只出现在仪表盘。

**Architecture:** 保留现有 gallery/tagger store 与图库到标注的交接协议，只调整页面编排和展示组件。用静态 UI 契约测试锁定布局规则，用 store 单元测试锁定保存、推理与返回上下文的异常行为，最后在 Electron 实际窗口验证交互和视觉结果。

**Tech Stack:** Vue 3、TypeScript、Pinia、Vitest、Electron IPC、CSS scoped styles

---

## File map

- Modify: `src/views/Gallery.vue` — 合并页面标题与图库工具栏，编排紧凑图库。
- Modify: `src/components/tagger/GalleryToolbar.vue` — 承载来源名、数量、搜索、筛选、视图和页面级动作。
- Modify: `src/components/tagger/GalleryGrid.vue` — 移除吉祥物空状态，保持图片选择与双击。
- Modify: `src/views/Tagger.vue` — 合并页面标题与标注工具栏，编排三栏工作区。
- Modify: `src/components/tagger/TagQueue.vue` — 增加折叠状态和紧凑队列头。
- Modify: `src/components/tagger/TagEditor.vue` — 收紧编辑区标题与主要保存动作。
- Modify: `src/components/tagger/TagRunProgress.vue` — 改成底部纤细运行状态条。
- Modify: `src/stores/tagger.ts` — 保存与推理异常必须恢复稳定状态。
- Modify: `src/stores/gallery.ts` — 恢复 all/root/dataset 返回上下文。
- Modify: `electron/ipc/__tests__/gallery-workspace-ui.spec.ts` — 图库紧凑布局契约。
- Modify: `electron/ipc/__tests__/annotation-workspace-ui.spec.ts` — 标注紧凑布局契约。
- Modify: `src/stores/__tests__/tagger.spec.ts` — 保存和推理拒绝测试。
- Modify: `src/features/gallery/__tests__/gallery-workflow.spec.ts` or `src/stores/__tests__/gallery.spec.ts` — 返回上下文测试。

### Task 1: Lock the compact workspace contract

**Files:**
- Modify: `electron/ipc/__tests__/gallery-workspace-ui.spec.ts`
- Modify: `electron/ipc/__tests__/annotation-workspace-ui.spec.ts`
- Test: `electron/ipc/__tests__/gallery-workspace-ui.spec.ts`
- Test: `electron/ipc/__tests__/annotation-workspace-ui.spec.ts`

- [ ] **Step 1: Write the failing gallery UI contract**

Add assertions that the page no longer owns a large title header, the compact toolbar owns page actions, and neither the page nor grid imports or renders `Mascot`:

```ts
it('uses one compact toolbar and keeps the mascot out of gallery', () => {
  const page = read('src/views/Gallery.vue')
  const toolbar = read('src/components/tagger/GalleryToolbar.vue')
  const grid = read('src/components/tagger/GalleryGrid.vue')

  expect(page).not.toContain('class="gallery-header"')
  expect(page).not.toContain("import Mascot")
  expect(grid).not.toContain("import Mascot")
  expect(grid).not.toContain('<Mascot')
  expect(toolbar).toContain("defineEmits")
  expect(toolbar).toContain('addRoot')
  expect(toolbar).toContain('scan')
})
```

- [ ] **Step 2: Write the failing annotation UI contract**

```ts
it('uses a compact toolbar and keeps the mascot out of annotation', () => {
  const page = read('src/views/Tagger.vue')

  expect(page).not.toContain('class="tagger-header"')
  expect(page).not.toContain("import Mascot")
  expect(page).not.toContain('<Mascot')
  expect(page).toContain('class="tagger-toolbar"')
})
```

Also require queue collapse and the compact progress marker:

```ts
expect(read('src/components/tagger/TagQueue.vue')).toContain('collapsed')
expect(read('src/components/tagger/TagRunProgress.vue')).toContain('tag-run-progress--compact')
```

- [ ] **Step 3: Run the focused tests and confirm the intended failure**

Run:

```powershell
npm.cmd test -- electron/ipc/__tests__/gallery-workspace-ui.spec.ts electron/ipc/__tests__/annotation-workspace-ui.spec.ts
```

Expected: FAIL on the old `gallery-header`, `tagger-header`, `Mascot`, collapse, and compact-progress assertions.

- [ ] **Step 4: Commit the red tests**

```powershell
git add -- electron/ipc/__tests__/gallery-workspace-ui.spec.ts electron/ipc/__tests__/annotation-workspace-ui.spec.ts
git commit -m "test: define compact media workspaces"
```

### Task 2: Build the compact gallery

**Files:**
- Modify: `src/views/Gallery.vue`
- Modify: `src/components/tagger/GalleryToolbar.vue`
- Modify: `src/components/tagger/GalleryGrid.vue`
- Test: `electron/ipc/__tests__/gallery-workspace-ui.spec.ts`

- [ ] **Step 1: Extend the toolbar interface**

Add props and events for source identity and page actions without moving business logic into the component:

```ts
defineProps<{
  title: string
  imageCount: number
  scanning: boolean
  search: string
  tagState: string
  sort: string
  viewMode: 'small' | 'large' | 'list'
}>()

defineEmits<{
  'update:search': [value: string]
  'update:tagState': [value: string]
  'update:sort': [value: string]
  'update:viewMode': [value: 'small' | 'large' | 'list']
  scan: []
  addRoot: []
}>()
```

Render one `gallery-toolbar` row containing title/count on the left, search and filters in the center, and scan/add-folder actions on the right. Keep it at `height: 44px` and `flex-wrap: nowrap`.

- [ ] **Step 2: Remove the page title header and wire the toolbar**

Replace the old `gallery-header` with:

```vue
<GalleryToolbar
  v-if="!galleryStore.activeDatasetId"
  :title="activeRoot?.label || '全部图片'"
  :image-count="visibleImages.length"
  :scanning="galleryStore.isScanning"
  :search="galleryStore.searchQuery"
  :tag-state="galleryStore.tagStateFilter"
  :sort="galleryStore.sortMode"
  :view-mode="viewMode"
  @scan="scanCurrentRoot"
  @add-root="addRoot"
  @update:search="galleryStore.searchQuery = $event"
  @update:tag-state="galleryStore.tagStateFilter = $event"
  @update:sort="galleryStore.sortMode = $event"
  @update:view-mode="viewMode = $event"
/>
```

Move the toolbar inside `gallery-shell` above the stage so there is no separate title band. Preserve the dataset-specific actions as a toolbar of the same height.

- [ ] **Step 3: Remove the gallery mascot states**

Delete the `Mascot` import, `<Mascot />`, `.state-mascot`, and related animation styles from `GalleryGrid.vue`. Replace the empty state with concise copy and its existing add-folder path; loading remains a spinner or skeleton inside the grid.

- [ ] **Step 4: Tune gallery geometry**

Use these layout constraints:

```css
.gallery-page { height: calc(100vh - 72px); padding: 10px 14px 14px; }
.gallery-shell { flex: 1; min-height: 0; }
.gallery-content { min-width: 0; }
.gallery-toolbar, .dataset-toolbar { height: 44px; flex: 0 0 44px; }
```

Keep the inspector conditional on exactly one selected image and the batch bar conditional on more than one selection.

- [ ] **Step 5: Run gallery tests and type checking**

Run:

```powershell
npm.cmd test -- electron/ipc/__tests__/gallery-workspace-ui.spec.ts electron/ipc/__tests__/metadata-viewer-ui.spec.ts
npm.cmd run typecheck
```

Expected: both test files pass and Vue type checking exits with code 0.

- [ ] **Step 6: Commit the compact gallery**

```powershell
git add -- src/views/Gallery.vue src/components/tagger/GalleryToolbar.vue src/components/tagger/GalleryGrid.vue electron/ipc/__tests__/gallery-workspace-ui.spec.ts
git commit -m "feat: compact the gallery workspace"
```

### Task 3: Build the compact annotation workspace

**Files:**
- Modify: `src/views/Tagger.vue`
- Modify: `src/components/tagger/TagQueue.vue`
- Modify: `src/components/tagger/TagEditor.vue`
- Modify: `src/components/tagger/TagRunProgress.vue`
- Test: `electron/ipc/__tests__/annotation-workspace-ui.spec.ts`

- [ ] **Step 1: Add queue collapse as presentation state**

Use a controlled prop/event so `Tagger.vue` owns the temporary state:

```ts
defineProps<{ queue: TagQueueItem[]; currentIndex: number; collapsed: boolean }>()
defineEmits<{
  select: [index: number]
  addFiles: []
  addFolder: []
  retry: []
  toggleCollapsed: []
}>()
```

When collapsed, render a 48-pixel rail with the queue count and expand button. Do not discard or filter queue items.

- [ ] **Step 2: Replace the large annotation title with one toolbar**

In `Tagger.vue`, remove `Mascot`, `tagger-header`, `tagger-title`, and `phase-badge`. Add `const queueCollapsed = ref(false)` and render:

```vue
<header class="tagger-toolbar">
  <div class="tagger-toolbar__status">
    <strong>标注</strong>
    <span>{{ phaseLabel }} · {{ taggerStore.completedCount }} / {{ taggerStore.queue.length }}</span>
  </div>
  <span class="tagger-toolbar__model">{{ selectedModelLabel }}</span>
  <div class="tagger-toolbar__actions">
    <button v-if="taggerStore.returnContext" @click="returnToGallery">返回图库</button>
    <button v-if="taggerStore.phase === 'running' || taggerStore.phase === 'stopping'" @click="taggerStore.stopRun">停止</button>
    <button v-else class="primary" :disabled="!canStart" @click="taggerStore.startRun">开始自动标注</button>
  </div>
</header>
```

Keep settings in the existing settings panel trigger instead of adding another page header.

- [ ] **Step 3: Make the image preview dominant**

Set the toolbar to 44 pixels, queue to 190 pixels expanded/48 pixels collapsed, editor to 300 pixels, and allow the center preview to consume all remaining width and height. Replace the empty preview mascot with concise text and existing add-image actions.

- [ ] **Step 4: Compress the run progress**

Render `TagRunProgress` as a single 34-pixel bar with status, current filename, count, progress track, and stop button. Add the class marker:

```vue
<div class="tag-run-progress tag-run-progress--compact">
```

Keep `phase === 'stopping'` truthful and preserve reduced-motion behavior.

- [ ] **Step 5: Tighten the tag editor without removing features**

Reduce the editor header to 44 pixels and keep grouped chips, manual addition, error message, multi-apply, save, and save-next. The primary action remains “保存并下一张”.

- [ ] **Step 6: Run annotation tests and type checking**

Run:

```powershell
npm.cmd test -- electron/ipc/__tests__/annotation-workspace-ui.spec.ts electron/ipc/__tests__/tagger-models.spec.ts
npm.cmd run typecheck
```

Expected: focused tests pass and type checking exits with code 0.

- [ ] **Step 7: Commit the compact annotation workspace**

```powershell
git add -- src/views/Tagger.vue src/components/tagger/TagQueue.vue src/components/tagger/TagEditor.vue src/components/tagger/TagRunProgress.vue electron/ipc/__tests__/annotation-workspace-ui.spec.ts
git commit -m "feat: compact the annotation workspace"
```

### Task 4: Make save, inference, and return context resilient

**Files:**
- Modify: `src/stores/tagger.ts`
- Modify: `src/stores/gallery.ts`
- Modify: `src/stores/__tests__/tagger.spec.ts`
- Modify or Create: `src/stores/__tests__/gallery.spec.ts`

- [ ] **Step 1: Add rejected-save and rejected-inference tests**

Mock rejected IPC promises and assert the store leaves busy phases:

```ts
vi.mocked(window.galleryAPI.saveAnnotation).mockRejectedValueOnce(new Error('disk unavailable'))
await store.saveCurrent()
expect(store.saving).toBe(false)
expect(store.currentItem?.status).toBe('failed')
expect(store.lastError).toContain('disk unavailable')
```

```ts
vi.mocked(window.taggerAPI.inferBatch).mockRejectedValueOnce(new Error('worker exited'))
await store.startRun()
expect(store.phase).toBe('review')
expect(store.lastError).toContain('worker exited')
```

- [ ] **Step 2: Run the store tests and confirm they fail**

Run:

```powershell
npm.cmd test -- src/stores/__tests__/tagger.spec.ts
```

Expected: FAIL because rejected promises currently escape the action or leave a busy state.

- [ ] **Step 3: Catch exceptions and restore stable state**

Wrap inference and save calls in `try/catch/finally`. Normalize unknown errors with:

```ts
function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}
```

For save rejection set the current item to `failed`, store the message, and clear `saving` in `finally`. For inference rejection move `phase` to `review`, mark the current running item failed, and preserve remaining pending items for retry.

- [ ] **Step 4: Add return-context tests**

Cover all three source kinds:

```ts
it.each([
  [{ kind: 'all' }, null, null],
  [{ kind: 'root', rootId: 7 }, 7, null],
  [{ kind: 'dataset', datasetId: 'D:/sets/a' }, null, 'D:/sets/a'],
])('restores source context', async (source, rootId, datasetId) => {
  store.restoreReturnContext({ ...source, search: 'blue', tagState: 'untagged', sort: 'name-asc', scrollTop: 120 })
  expect(store.activeRootId).toBe(rootId)
  expect(store.activeDatasetId).toBe(datasetId)
})
```

- [ ] **Step 5: Restore the correct source on gallery mount**

When `activeDatasetId` is present, call `loadDatasetImages(activeDatasetId)` instead of immediately replacing the view with all gallery images. For `kind: 'all'`, explicitly clear both active IDs. Preserve search, tag-state, sort, and pending scroll values.

- [ ] **Step 6: Run store and workflow tests**

Run:

```powershell
npm.cmd test -- src/stores/__tests__/tagger.spec.ts src/stores/__tests__/gallery.spec.ts src/features/gallery/__tests__/gallery-workflow.spec.ts
```

Expected: all tests pass with rejected IPC promises handled and each return source restored.

- [ ] **Step 7: Commit reliability fixes**

```powershell
git add -- src/stores/tagger.ts src/stores/gallery.ts src/stores/__tests__/tagger.spec.ts src/stores/__tests__/gallery.spec.ts
git commit -m "fix: recover media workflows from ipc failures"
```

### Task 5: Verify the complete flow and visual result

**Files:**
- Verify: `src/views/Gallery.vue`
- Verify: `src/views/Tagger.vue`
- Verify: `src/components/tagger/MetadataViewer.vue`
- Verify: `electron/ipc/tagger-models.js`

- [ ] **Step 1: Prove mascot placement**

Run:

```powershell
rg -n "import Mascot|<Mascot" src/views src/components
```

Expected: matches belong only to dashboard-related files such as `Dashboard.vue` or dashboard components; no match in gallery or tagger files.

- [ ] **Step 2: Run all automated checks**

Run:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run check:ipc
npm.cmd run build
git diff --check
```

Expected: all tests pass, type checking and IPC checking exit 0, production build succeeds, and diff check reports no whitespace errors.

- [ ] **Step 3: Start the app for visual QA**

Run:

```powershell
npm.cmd run dev
```

At 1366×768, verify the gallery toolbar stays on one line, no large page title remains, the grid is taller than before, and no mascot appears.

- [ ] **Step 4: Exercise the gallery path**

In the Electron window: select one image, multi-select images, double-click metadata, move previous/next, close the viewer, and send selected images to annotation. Verify the inspector and batch bar remain conditional.

- [ ] **Step 5: Exercise the annotation path**

Verify the queue collapses and expands, the preview remains dominant, model loading does not recurse, save-and-next changes the current item, and returning to gallery restores the source and scroll context.

- [ ] **Step 6: Inspect the final change set**

Run:

```powershell
git status --short
git diff --stat
```

Expected: only intended gallery/annotation/reliability files from this plan are added or modified by this implementation; unrelated pre-existing work remains untouched.
