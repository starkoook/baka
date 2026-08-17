# Gallery and Annotation Workspaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Do not use subagents unless the user explicitly requests delegation.

**Goal:** Replace the mixed gallery/tagging screen with two linked workspaces: a spacious gallery with an immersive metadata viewer, and a resumable annotation workspace that reliably saves reviewed tags to both the gallery database and sibling `.txt` files.

**Architecture:** Keep gallery browsing and dataset state in the existing `gallery` Pinia store. Replace `taggerV2` with a focused `tagger` store that owns the handoff context, queue, run/review state, model settings, failures, and local session persistence. The renderer sends one coordinated save request to Electron; Electron records database and caption-file outcomes separately so the UI can distinguish saved, partially saved, and failed items.

**Tech Stack:** Vue 3, TypeScript, Pinia, Vue Router, Electron CommonJS IPC, sql.js, Vitest

---

### Task 1: Define the gallery-to-annotation contract and selection behavior

**Files:**
- Create: `src/features/gallery/gallery-workflow.ts`
- Create: `src/features/gallery/__tests__/gallery-workflow.spec.ts`
- Modify: `src/stores/gallery.ts`

- [ ] **Step 1: Write failing tests for selection and return context.**

```ts
import { describe, expect, it } from 'vitest'
import { applyGallerySelection, createGalleryHandoff } from '../gallery-workflow'

describe('gallery workflow', () => {
  it('supports single, toggle, and contiguous range selection', () => {
    const ids = [10, 20, 30, 40]
    expect(applyGallerySelection(new Set([10]), ids, 30, 'single', 10).selectedIds).toEqual(new Set([30]))
    expect(applyGallerySelection(new Set([10]), ids, 30, 'toggle', 10).selectedIds).toEqual(new Set([10, 30]))
    expect(applyGallerySelection(new Set([10]), ids, 30, 'range', 10).selectedIds).toEqual(new Set([10, 20, 30]))
  })

  it('preserves ordered images and gallery location in the handoff', () => {
    const handoff = createGalleryHandoff(
      [{ id: 2, path: 'B.png' }, { id: 1, path: 'A.png' }],
      { kind: 'root', id: 7, search: 'blue hair', tagState: 'untagged', sort: 'modified-desc', scrollTop: 640 },
    )
    expect(handoff.items.map((item) => item.id)).toEqual([2, 1])
    expect(handoff.returnContext.scrollTop).toBe(640)
  })
})
```

- [ ] **Step 2: Run the focused test and confirm the missing module fails.**

Run: `npm.cmd test -- src/features/gallery/__tests__/gallery-workflow.spec.ts`

Expected: FAIL because `gallery-workflow.ts` does not exist.

- [ ] **Step 3: Add narrow shared types and pure helpers.**

```ts
export type GallerySource = { kind: 'root' | 'dataset' | 'all'; id: number | string | null }
export type GalleryReturnContext = GallerySource & {
  search: string
  tagState: 'all' | 'tagged' | 'untagged'
  sort: string
  scrollTop: number
}
export type GalleryHandoffItem = { id: number; path: string }
export type GalleryHandoff = { items: GalleryHandoffItem[]; returnContext: GalleryReturnContext }

export function applyGallerySelection(
  current: Set<number>, orderedIds: number[], targetId: number,
  mode: 'single' | 'toggle' | 'range', anchorId: number | null,
) {
  if (mode === 'single') return { selectedIds: new Set([targetId]), anchorId: targetId }
  if (mode === 'toggle') {
    const next = new Set(current)
    next.has(targetId) ? next.delete(targetId) : next.add(targetId)
    return { selectedIds: next, anchorId: targetId }
  }
  const anchorIndex = Math.max(0, orderedIds.indexOf(anchorId ?? targetId))
  const targetIndex = orderedIds.indexOf(targetId)
  return {
    selectedIds: new Set(orderedIds.slice(Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex) + 1)),
    anchorId: anchorId ?? targetId,
  }
}
```

- [ ] **Step 4: Extend the gallery store without mixing annotation state into it.**

Add `selectionAnchorId`, `searchQuery`, `tagStateFilter`, `sortMode`, and `pendingReturnContext`. Replace `toggleSelect` internals with `applyGallerySelection`, add `selectRange`, `captureReturnContext(scrollTop)`, and `restoreReturnContext(context)`. Preserve current roots, scanning, thumbnail, tag, and dataset actions.

- [ ] **Step 5: Re-run the focused and existing gallery tests.**

Run: `npm.cmd test -- src/features/gallery/__tests__/gallery-workflow.spec.ts src/stores/__tests__/gallery.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit this isolated state-contract change.**

```powershell
git add src/features/gallery/gallery-workflow.ts src/features/gallery/__tests__/gallery-workflow.spec.ts src/stores/gallery.ts src/stores/__tests__/gallery.spec.ts
git commit -m "feat: define gallery annotation handoff"
```

---

### Task 2: Build a resumable annotation store

**Files:**
- Create: `src/stores/tagger.ts`
- Create: `src/stores/__tests__/tagger.spec.ts`
- Delete after migration: `src/stores/taggerV2.ts`

- [ ] **Step 1: Write failing store tests for queue creation, persistence, stop state, failure isolation, and path replacement.**

```ts
it('keeps gallery order and return context when a queue is created', () => {
  const store = useTaggerStore()
  store.createQueueFromGallery(handoff)
  expect(store.queue.map((item) => item.path)).toEqual(['B.png', 'A.png'])
  expect(store.returnContext?.search).toBe('blue hair')
})

it('restores unfinished work and never restores a task as actively running', () => {
  localStorage.setItem('baka-tagger-session-v1', JSON.stringify(persistedRunningSession))
  const store = useTaggerStore()
  store.restoreSession()
  expect(store.phase).toBe('review')
  expect(store.queue[1].status).toBe('failed')
})

it('uses stopping until the worker confirms cancellation', async () => {
  const store = useTaggerStore()
  store.phase = 'running'
  const pending = store.stopRun()
  expect(store.phase).toBe('stopping')
  resolveCancel({ success: true })
  await pending
  expect(store.phase).toBe('review')
})
```

- [ ] **Step 2: Run the focused test and confirm failure.**

Run: `npm.cmd test -- src/stores/__tests__/tagger.spec.ts`

Expected: FAIL because `src/stores/tagger.ts` does not exist.

- [ ] **Step 3: Implement the store state model.**

```ts
export type TaggerPhase = 'setup' | 'running' | 'stopping' | 'review'
export type QueueStatus = 'pending' | 'running' | 'ready' | 'reviewed' | 'failed' | 'partial'

export interface TagQueueItem {
  id: number | null
  path: string
  status: QueueStatus
  tags: TagResult[]
  error: string
  databaseSaved: boolean
  captionSaved: boolean
}
```

Implement `createQueueFromGallery`, `appendPaths`, `startRun`, `stopRun`, `applyProgressEvent`, `retryFailed`, `setCurrentIndex`, `saveCurrent`, `saveAndNext`, `replacePaths`, `persistSession`, `restoreSession`, `clearCompletedSession`, and `consumeReturnContext`. Persist only serializable queue/config/context data under `baka-tagger-session-v1`; convert a restored `running` or `stopping` item to `failed` with a clear interruption message.

- [ ] **Step 4: Move existing model discovery and inference setup into the new store.**

Keep `listModels`, WD14 batch inference, provider progress, and cancel calls unchanged at the IPC boundary. Do not rewrite the inference worker. Process per-image results so one result with `error` becomes `failed` without preventing other queue items from reaching `ready`.

- [ ] **Step 5: Re-run the store tests.**

Run: `npm.cmd test -- src/stores/__tests__/tagger.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit the store foundation.**

```powershell
git add src/stores/tagger.ts src/stores/__tests__/tagger.spec.ts
git commit -m "feat: add resumable annotation queue"
```

Do not delete `taggerV2.ts` until all imports move in Task 6.

---

### Task 3: Split routes and navigation into Gallery and Annotation

**Files:**
- Modify: `src/router/index.ts`
- Modify: `src/components/sidebar/TopMenuBar.vue`
- Create: `src/views/Gallery.vue`
- Create: `src/views/Tagger.vue`
- Create: `electron/ipc/__tests__/gallery-tagger-routes.spec.ts`

- [ ] **Step 1: Add failing source-contract tests.**

```ts
const router = readFileSync(resolve(process.cwd(), 'src/router/index.ts'), 'utf8')
const menu = readFileSync(resolve(process.cwd(), 'src/components/sidebar/TopMenuBar.vue'), 'utf8')

expect(router).toContain("path: '/gallery'")
expect(router).toContain("import('@/views/Gallery.vue')")
expect(router).toContain("path: '/tagger'")
expect(router).toContain("import('@/views/Tagger.vue')")
expect(menu).toContain("label: '图库', path: '/gallery'")
expect(menu).toContain("label: '标注', path: '/tagger'")
expect(menu).not.toContain('图库 & 标注')
```

- [ ] **Step 2: Run the route test and confirm failure.**

Run: `npm.cmd test -- electron/ipc/__tests__/gallery-tagger-routes.spec.ts`

Expected: FAIL while `/gallery` still points to `TaggerV2.vue` and `/tagger` is absent.

- [ ] **Step 3: Add the two routes and two top-level menu entries.**

Keep existing `/reverse`, `/training`, and other routes untouched. Ensure active-menu matching treats `/gallery` and `/tagger` independently.

- [ ] **Step 4: Create compilable page shells with explicit responsibilities.**

`Gallery.vue` initializes roots/images and owns gallery scroll restoration. `Tagger.vue` initializes the new store, restores a previous session, loads models, and registers the existing progress listener. Do not copy the old monolithic template into both pages.

- [ ] **Step 5: Re-run tests and type checking.**

Run: `npm.cmd test -- electron/ipc/__tests__/gallery-tagger-routes.spec.ts`

Run: `npm.cmd run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit the route split.**

```powershell
git add src/router/index.ts src/components/sidebar/TopMenuBar.vue src/views/Gallery.vue src/views/Tagger.vue electron/ipc/__tests__/gallery-tagger-routes.spec.ts
git commit -m "feat: split gallery and annotation routes"
```

---

### Task 4: Implement the gallery workspace and preserve datasets

**Files:**
- Modify: `src/views/Gallery.vue`
- Modify: `src/components/tagger/GalleryGrid.vue`
- Create: `src/components/tagger/GallerySidebar.vue`
- Create: `src/components/tagger/GalleryToolbar.vue`
- Create: `src/components/tagger/GalleryInspector.vue`
- Create: `src/components/tagger/GallerySelectionBar.vue`
- Create: `electron/ipc/__tests__/gallery-workspace-ui.spec.ts`

- [ ] **Step 1: Write failing UI contract tests.**

Verify that Gallery imports all five focused components, has separate `@select`, `@toggle`, `@range-select`, and `@open-metadata` events, renders the inspector only when exactly one image is selected, renders the bottom selection bar only when two or more are selected, and calls `taggerStore.createQueueFromGallery(...)` before routing to `/tagger`.

- [ ] **Step 2: Run the focused test and confirm failure.**

Run: `npm.cmd test -- electron/ipc/__tests__/gallery-workspace-ui.spec.ts`

Expected: FAIL because the workspace components do not exist.

- [ ] **Step 3: Build the gallery frame.**

Implement:

- Header: image count, add folder, sync.
- Toolbar: search, tagged/untagged filter, sort, grid/list density.
- Sidebar: roots, recent/untagged shortcuts, datasets and dataset counts.
- Center: maximum-width image grid with loading/empty/error states.
- Inspector: file facts and current tags for one selected image only.
- Bottom bar: send to annotation, add to dataset, copy/move, clear selection.

Use one dominant coral action per area. Keep ambient animation off the image grid and honor existing reduced-motion behavior.

- [ ] **Step 4: Implement precise grid interactions.**

Single click selects only. Ctrl/Cmd click and the checkbox toggle. Shift click selects a contiguous range. Double click emits only `open-metadata` and must not send to annotation. `Esc` clears selection when the viewer is closed.

- [ ] **Step 5: Migrate all existing dataset entry points from `TaggerV2.vue`.**

Retain create dataset, add selected images to existing/new dataset, import folder as dataset, browse dataset images, edit caption, remove from dataset, and export captions. Dataset selection must reuse the center grid rather than introduce another page tab. Do not delete existing `gallery` store dataset actions.

- [ ] **Step 6: Create the handoff before navigation.**

```ts
function sendToTagger() {
  const handoff = createGalleryHandoff(orderedSelectedImages.value, galleryStore.captureReturnContext(gridScrollTop.value))
  taggerStore.createQueueFromGallery(handoff)
  router.push('/tagger')
}
```

- [ ] **Step 7: Re-run focused tests, gallery tests, and type checking.**

Run: `npm.cmd test -- electron/ipc/__tests__/gallery-workspace-ui.spec.ts src/features/gallery/__tests__/gallery-workflow.spec.ts src/stores/__tests__/gallery.spec.ts`

Run: `npm.cmd run typecheck`

Expected: PASS.

- [ ] **Step 8: Commit the gallery workspace.**

```powershell
git add src/views/Gallery.vue src/components/tagger/GalleryGrid.vue src/components/tagger/GallerySidebar.vue src/components/tagger/GalleryToolbar.vue src/components/tagger/GalleryInspector.vue src/components/tagger/GallerySelectionBar.vue electron/ipc/__tests__/gallery-workspace-ui.spec.ts
git commit -m "feat: redesign gallery workspace"
```

---

### Task 5: Replace the metadata modal with an immersive viewer

**Files:**
- Create: `src/features/gallery/metadata-sections.ts`
- Create: `src/features/gallery/__tests__/metadata-sections.spec.ts`
- Create: `src/components/tagger/MetadataViewer.vue`
- Modify: `src/views/Gallery.vue`
- Delete after replacement: `src/components/tagger/TagImageModal.vue`

- [ ] **Step 1: Write failing metadata helper tests.**

```ts
it('omits empty generation sections', () => {
  expect(buildMetadataSections({ hasMetadata: false }, [])).toEqual({ overview: [], generation: [], tags: [] })
})

it('keeps zero-valued metadata such as seed and cfg', () => {
  const result = buildMetadataSections({ hasMetadata: true, seed: 0, cfg: 0 }, [])
  expect(result.overview.map((field) => field.label)).toEqual(['CFG', 'Seed'])
})
```

- [ ] **Step 2: Run the focused test and confirm failure.**

Run: `npm.cmd test -- src/features/gallery/__tests__/metadata-sections.spec.ts`

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement metadata normalization.**

Build visible fields from values that are not `undefined`, `null`, or empty strings. Keep numeric zero. Provide `formatAllMetadata`, `formatPrompt`, and `formatNegativePrompt` for copy actions without coupling clipboard calls into the helper.

- [ ] **Step 4: Build `MetadataViewer.vue`.**

The full-window overlay contains:

- Header: filename, dimensions, size, open location, send to annotation, close.
- Left two-thirds: large image, previous/next controls, fit/original toggle.
- Right third: `概览`, `生成信息`, `标签` tabs.
- Footer: full path and keyboard hints.

Default to `概览`; retain the active tab while changing images. Handle Left/Right, Escape, and double-click zoom only while the viewer is open. Hide generation groups when fields are absent. The tags tab can edit and save the current image but must not duplicate the annotation workspace.

- [ ] **Step 5: Integrate the viewer into Gallery and remove the old modal only after imports are gone.**

Use `galleryAPI.getMetadata`, `galleryAPI.getImageTags`, and `fsAPI.readImageBase64` already exposed by preload. Send a single viewed image through the same gallery handoff path used by the batch bar.

- [ ] **Step 6: Re-run focused tests and type checking.**

Run: `npm.cmd test -- src/features/gallery/__tests__/metadata-sections.spec.ts electron/ipc/__tests__/gallery-workspace-ui.spec.ts`

Run: `npm.cmd run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit the viewer replacement.**

```powershell
git add src/features/gallery/metadata-sections.ts src/features/gallery/__tests__/metadata-sections.spec.ts src/components/tagger/MetadataViewer.vue src/views/Gallery.vue src/components/tagger/TagImageModal.vue
git commit -m "feat: add immersive metadata viewer"
```

---

### Task 6: Implement the three-column annotation workspace

**Files:**
- Modify: `src/views/Tagger.vue`
- Modify: `src/components/tagger/TagSettingsPanel.vue`
- Create: `src/components/tagger/TagQueue.vue`
- Create: `src/components/tagger/TagEditor.vue`
- Create: `src/components/tagger/TagRunProgress.vue`
- Create: `electron/ipc/__tests__/annotation-workspace-ui.spec.ts`

- [ ] **Step 1: Write failing annotation UI contract tests.**

Verify that the page imports the queue, editor, settings, and progress components; progress is rendered inside the center preview column rather than as a fixed overlay; the primary review action is `保存并下一张`; stopping displays `正在停止`; and `返回图库原位置` consumes the saved return context.

- [ ] **Step 2: Run the focused test and confirm failure.**

Run: `npm.cmd test -- electron/ipc/__tests__/annotation-workspace-ui.spec.ts`

Expected: FAIL because the three-column workspace is not implemented.

- [ ] **Step 3: Implement the three phases in one stable layout.**

- Setup: queue source/count, local/cloud/combined mode, common settings, model settings, start action.
- Running: queue statuses, current large image, inline progress below it, completed/total/current file/provider, stop action.
- Review: first unreviewed item, grouped tag editing, retry failures, save and next.

Do not swap to unrelated full-page layouts between phases; keep queue, preview, and editor positions stable.

- [ ] **Step 4: Implement queue and editor component contracts.**

`TagQueue.vue` accepts queue/current index and emits `select`, `add-files`, `add-folder`, and `retry`. `TagEditor.vue` accepts editable tags/status and emits `update:tags`, `save`, `save-next`, and `apply-selected` with an explicit affected count. `TagRunProgress.vue` accepts phase/completed/total/current file/provider and emits `stop`.

- [ ] **Step 5: Restore or import work safely.**

If there is a persisted unfinished session, show it immediately. If there is no queue, provide add images/add folder actions. New gallery handoffs replace an old completed queue but must ask before replacing an unfinished queue. This is the one confirmation required because replacing would discard task state.

- [ ] **Step 6: Restore the gallery location on return.**

```ts
function returnToGallery() {
  const context = taggerStore.consumeReturnContext()
  if (context) galleryStore.pendingReturnContext = context
  router.push('/gallery')
}
```

On Gallery mount, apply source/filter/sort, load the relevant images, restore selected ids, then restore `scrollTop` after the grid renders.

- [ ] **Step 7: Re-run focused tests, store tests, and type checking.**

Run: `npm.cmd test -- electron/ipc/__tests__/annotation-workspace-ui.spec.ts src/stores/__tests__/tagger.spec.ts`

Run: `npm.cmd run typecheck`

Expected: PASS.

- [ ] **Step 8: Commit the annotation workspace.**

```powershell
git add src/views/Tagger.vue src/components/tagger/TagSettingsPanel.vue src/components/tagger/TagQueue.vue src/components/tagger/TagEditor.vue src/components/tagger/TagRunProgress.vue electron/ipc/__tests__/annotation-workspace-ui.spec.ts
git commit -m "feat: redesign annotation workspace"
```

---

### Task 7: Save reviewed tags to the database and `.txt` with truthful status

**Files:**
- Create: `electron/ipc/annotation-save.js`
- Create: `electron/ipc/__tests__/annotation-save.spec.ts`
- Modify: `electron/ipc/gallery.js`
- Modify: `electron/preload.js`
- Modify: `src/env.d.ts`
- Modify: `src/stores/tagger.ts`

- [ ] **Step 1: Write failing unit tests for coordinated save outcomes.**

```ts
it('reports a complete save only when database and caption both succeed', async () => {
  const result = await saveAnnotation(deps, request)
  expect(result).toEqual({ success: true, databaseSaved: true, captionSaved: true, captionPath: 'A.txt' })
})

it('reports partial save and retryable details when caption writing fails', async () => {
  const result = await saveAnnotation({ ...deps, writeCaption: () => { throw new Error('disk full') } }, request)
  expect(result).toMatchObject({ success: false, databaseSaved: true, captionSaved: false, partial: true })
  expect(result.error).toContain('disk full')
})
```

- [ ] **Step 2: Run the focused test and confirm failure.**

Run: `npm.cmd test -- electron/ipc/__tests__/annotation-save.spec.ts`

Expected: FAIL because `annotation-save.js` does not exist.

- [ ] **Step 3: Implement an injectable save coordinator.**

```js
async function saveAnnotation({ writeDatabase, writeCaption }, request) {
  let databaseSaved = false
  let captionSaved = false
  try { await writeDatabase(request); databaseSaved = true } catch (error) {
    return { success: false, partial: false, databaseSaved, captionSaved, error: error.message }
  }
  try { await writeCaption(request); captionSaved = true } catch (error) {
    return { success: false, partial: true, databaseSaved, captionSaved, error: error.message }
  }
  return { success: true, partial: false, databaseSaved, captionSaved }
}
```

The gallery handler must validate that `imageId` resolves to the same indexed path, replace its tags in one database transaction, save the database once, then write a sibling `.txt` containing comma-separated reviewed tags. Return `databaseSaved`, `captionSaved`, `partial`, `captionPath`, and `error`.

- [ ] **Step 4: Expose one renderer API and its exact types.**

Add:

```ts
saveAnnotation: (params: {
  imageId: number
  imagePath: string
  tags: { tag: string; category?: string; confidence?: number; source?: string }[]
}) => Promise<{
  success: boolean
  partial: boolean
  databaseSaved: boolean
  captionSaved: boolean
  captionPath?: string
  error?: string
}>
```

- [ ] **Step 5: Make the tagger store map the response to honest queue states.**

Both true -> `reviewed`; one true -> `partial` and keep retryable content; both false -> `failed`. Refresh the gallery tag cache only after database success. `saveAndNext` advances only after complete success unless the user explicitly skips the partial item.

- [ ] **Step 6: Re-run save, IPC channel, gallery, and store tests.**

Run: `npm.cmd test -- electron/ipc/__tests__/annotation-save.spec.ts electron/ipc/__tests__/gallery-scan.spec.ts src/stores/__tests__/tagger.spec.ts`

Run: `npm.cmd run check:ipc`

Expected: PASS.

- [ ] **Step 7: Commit the reliable save path.**

```powershell
git add electron/ipc/annotation-save.js electron/ipc/__tests__/annotation-save.spec.ts electron/ipc/gallery.js electron/preload.js src/env.d.ts src/stores/tagger.ts
git commit -m "feat: save reviewed annotations reliably"
```

---

### Task 8: Keep queue paths valid after file operations

**Files:**
- Modify: `src/stores/gallery.ts`
- Modify: `src/stores/tagger.ts`
- Modify: `src/stores/__tests__/tagger.spec.ts`
- Modify: `electron/ipc/__tests__/gallery-workspace-ui.spec.ts`

- [ ] **Step 1: Add failing tests for move-result path replacement.**

Given `{ oldPath: 'A.png', newPath: 'D:\\dataset\\A.png' }`, assert that the gallery image, dataset references, current tagger queue item, persisted session, and active return target no longer contain `A.png` after a successful move. Copy with `keepOriginal: true` must not replace the original queue path.

- [ ] **Step 2: Run the focused tests and confirm failure.**

Run: `npm.cmd test -- src/stores/__tests__/tagger.spec.ts electron/ipc/__tests__/gallery-workspace-ui.spec.ts`

Expected: FAIL because successful moves do not notify both stores.

- [ ] **Step 3: Apply explicit old-to-new mappings after `fsAPI.moveImages`.**

Build mappings by input order and returned `destPaths`, call `galleryStore.replaceImagePaths(mappings)` and `taggerStore.replacePaths(mappings)`, then persist both affected collections. Do not infer renamed destination paths independently because `moveImages` may deduplicate filenames.

- [ ] **Step 4: Re-run focused tests and type checking.**

Run: `npm.cmd test -- src/stores/__tests__/tagger.spec.ts electron/ipc/__tests__/gallery-workspace-ui.spec.ts`

Run: `npm.cmd run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the path consistency fix.**

```powershell
git add src/stores/gallery.ts src/stores/tagger.ts src/stores/__tests__/tagger.spec.ts electron/ipc/__tests__/gallery-workspace-ui.spec.ts
git commit -m "fix: keep gallery and annotation paths in sync"
```

---

### Task 9: Remove the old mixed page and verify the whole workflow

**Files:**
- Delete: `src/views/TaggerV2.vue`
- Delete: `src/stores/taggerV2.ts`
- Delete if no longer imported: `src/components/tagger/SelectionActions.vue`
- Delete if no longer imported: `src/components/tagger/TagProgressOverlay.vue`
- Delete if no longer imported: `src/components/tagger/TagToolbar.vue`
- Modify: `electron/ipc/__tests__/workbench-ui.spec.ts`
- Modify: `electron/ipc/__tests__/gallery-tagger-routes.spec.ts`

- [ ] **Step 1: Update the old workbench contract test before deletion.**

Read `Gallery.vue` instead of `TaggerV2.vue`. Assert separate pages, conditional inspector/selection bar, immersive metadata viewer, inline annotation progress, and no imports of the retired page/components.

- [ ] **Step 2: Run the focused contract tests and confirm they fail while old references remain.**

Run: `npm.cmd test -- electron/ipc/__tests__/workbench-ui.spec.ts electron/ipc/__tests__/gallery-tagger-routes.spec.ts`

- [ ] **Step 3: Remove only files made obsolete by this redesign.**

Before each deletion, run:

```powershell
rg -n "TaggerV2|useTaggerV2Store|SelectionActions|TagProgressOverlay|TagToolbar|TagImageModal" src electron
```

Delete a file only when no live route or component imports it. Keep `TagSettingsPanel.vue`, because the new annotation page reuses it.

- [ ] **Step 4: Run the complete automated verification suite.**

Run: `npm.cmd test`

Expected: all Vitest suites pass.

Run: `npm.cmd run typecheck`

Expected: no TypeScript errors.

Run: `npm.cmd run check:ipc`

Expected: every preload invoke has a registered main-process handler.

Run: `npm.cmd run build`

Expected: renderer build completes successfully.

- [ ] **Step 5: Perform desktop visual and interaction QA.**

Run: `npm.cmd run dev`

Verify at normal and narrow window widths:

1. Top navigation opens Gallery and Annotation independently.
2. Gallery single/Ctrl/Shift/checkbox selection works; double click opens only metadata.
3. Viewer tabs, previous/next, Escape, zoom, copy, save tags, and send-to-annotation work.
4. Missing SD metadata creates no empty parameter cards.
5. Dataset create/import/browse/edit/export operations remain available.
6. Gallery handoff preserves order and source.
7. Run progress stays below the preview; stopping waits for worker confirmation.
8. One failed image does not stop the batch and can be retried.
9. Review save creates/updates both database tags and sibling `.txt`; forced caption failure displays partial save.
10. Restarting the app restores unfinished work.
11. Returning to Gallery restores source, filters, selection, and scroll position.
12. The mascot appears only in empty/success/error guidance and never obscures images.

- [ ] **Step 6: Inspect the final diff for scope and encoding.**

```powershell
git status --short
git diff --check
git diff --stat
```

Confirm no unrelated training, dashboard, or user-owned edits were changed. Also confirm new Chinese UI text is UTF-8 and does not introduce mojibake.

- [ ] **Step 7: Commit the cleanup and verification updates.**

```powershell
git add src/views/TaggerV2.vue src/stores/taggerV2.ts src/components/tagger/SelectionActions.vue src/components/tagger/TagProgressOverlay.vue src/components/tagger/TagToolbar.vue electron/ipc/__tests__/workbench-ui.spec.ts electron/ipc/__tests__/gallery-tagger-routes.spec.ts
git commit -m "refactor: retire mixed gallery tagger page"
```

---

## Definition of Done

- `/gallery` and `/tagger` are separate, clearly named workspaces.
- Gallery remains the only place for roots, scanning, filtering, file organization, and dataset browsing.
- Annotation owns queue setup, inference progress, review, retries, and resume.
- Double click opens the immersive metadata viewer; empty metadata is omitted.
- Gallery-to-annotation handoff and return preserve order, source, filters, selection, and scroll.
- Reviewed tags are considered saved only when database and `.txt` outcomes are accurately reported.
- Interrupted jobs and per-image failures are recoverable.
- Existing dataset capabilities remain available.
- Full tests, type checking, IPC check, build, and desktop visual QA pass.
