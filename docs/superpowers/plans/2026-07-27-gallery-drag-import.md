# Gallery Drag Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore drag-to-read in Gallery, support exact multi-file import and folder scanning, and preserve the compact workspace.

**Architecture:** The renderer converts dropped `File` objects to native paths and sends those paths to the main process for safe filesystem classification. The main process owns path inspection and explicit image indexing; `Gallery.vue` owns the drag overlay, routes a single image into the existing metadata viewer, and refreshes the gallery after batch work.

**Tech Stack:** Vue 3, TypeScript, Electron IPC, Node.js filesystem APIs, sql.js, Sharp, Vitest.

---

### Task 1: Define and test dropped-path classification

**Files:**
- Modify: `electron/ipc/__tests__/gallery-scan.spec.ts`
- Modify: `electron/ipc/gallery.js`
- Modify: `electron/ipc/channels.js`

- [ ] **Step 1: Write the failing tests**

Add assertions that require an exported path classifier and registered inspect/import handlers:

```ts
it('classifies dropped paths without scanning unrelated parent folders', () => {
  expect(gallerySource).toContain('function classifyDroppedPaths(paths)')
  expect(gallerySource).toContain("fs.statSync(filePath)")
  expect(gallerySource).toContain('imagePaths')
  expect(gallerySource).toContain('folderPaths')
  expect(gallerySource).toContain('unsupportedCount')
})

it('registers explicit dropped-file import handlers', () => {
  expect(gallerySource).toContain("ipcMain.handle('gallery:inspectDroppedPaths'")
  expect(gallerySource).toContain("ipcMain.handle('gallery:importFiles'")
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm.cmd test -- electron/ipc/__tests__/gallery-scan.spec.ts`

Expected: FAIL because the classifier and handlers do not exist.

- [ ] **Step 3: Add the minimal path classifier and channel contract**

In `electron/ipc/gallery.js`, add:

```js
function classifyDroppedPaths(paths) {
  const imagePaths = []
  const folderPaths = []
  let unsupportedCount = 0
  for (const filePath of [...new Set(Array.isArray(paths) ? paths : [])]) {
    try {
      const stat = fs.statSync(filePath)
      if (stat.isDirectory()) folderPaths.push(filePath)
      else if (stat.isFile() && IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) imagePaths.push(filePath)
      else unsupportedCount++
    } catch (_) {
      unsupportedCount++
    }
  }
  return { imagePaths, folderPaths, unsupportedCount }
}
```

Register `gallery:inspectDroppedPaths` to return this result. Add `GALLERY_INSPECT_DROPPED_PATHS` and `GALLERY_IMPORT_FILES` to `electron/ipc/channels.js` so the contract checker recognizes both calls.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm.cmd test -- electron/ipc/__tests__/gallery-scan.spec.ts`

Expected: PASS.

### Task 2: Index only explicitly dropped image files

**Files:**
- Modify: `electron/ipc/__tests__/gallery-scan.spec.ts`
- Modify: `electron/ipc/gallery.js`

- [ ] **Step 1: Write the failing import behavior test**

Add a source-level regression test requiring deduplication, transaction use, metadata extraction, and no parent-folder scan:

```ts
it('imports only explicit image paths in one transaction', () => {
  const block = gallerySource.match(/async function importImageFiles[\s\S]*?function registerGalleryHandlers/)?.[0] ?? ''
  expect(block).toContain("SELECT id, file_modified_at FROM images WHERE path = ?")
  expect(block).toContain('generateThumbnail(filePath)')
  expect(block).toContain("db.run('BEGIN TRANSACTION')")
  expect(block).toContain("db.run('COMMIT')")
  expect(block).not.toContain('scanFolder(')
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm.cmd test -- electron/ipc/__tests__/gallery-scan.spec.ts`

Expected: FAIL because `importImageFiles` is absent.

- [ ] **Step 3: Implement explicit indexing**

Add `importImageFiles(filePaths)` beside `scanFolder`. It must filter and deduplicate paths, stat each file, reuse `generateThumbnail`, Sharp metadata, and `parseMetadata`, then insert or update by exact path inside one transaction. Return:

```js
{ importedCount, skipCount, errorCount }
```

Register `gallery:importFiles` to call the helper after `ensureDb()`. This handler must never call `scanFolder` or derive parent directories.

- [ ] **Step 4: Run focused test and verify GREEN**

Run: `npm.cmd test -- electron/ipc/__tests__/gallery-scan.spec.ts`

Expected: PASS.

### Task 3: Expose IPC and restore the Gallery drag experience

**Files:**
- Modify: `electron/ipc/__tests__/gallery-workspace-ui.spec.ts`
- Modify: `electron/preload.js`
- Modify: `src/env.d.ts`
- Modify: `src/views/Gallery.vue`

- [ ] **Step 1: Write the failing UI regression test**

Add:

```ts
it('supports drag-to-read and batch import without changing the compact shell', () => {
  const gallery = read('src/views/Gallery.vue')
  const preload = read('electron/preload.js')
  expect(gallery).toContain('@dragenter.prevent="onDragEnter"')
  expect(gallery).toContain('@drop.prevent="onDrop"')
  expect(gallery).toContain('class="gallery-drag-overlay"')
  expect(gallery).toContain('window.galleryAPI.inspectDroppedPaths(paths)')
  expect(gallery).toContain('window.galleryAPI.importFiles(classified.imagePaths)')
  expect(preload).toContain("ipcRenderer.invoke('gallery:inspectDroppedPaths', paths)")
  expect(preload).toContain("ipcRenderer.invoke('gallery:importFiles', paths)")
})
```

- [ ] **Step 2: Run the focused UI test and verify RED**

Run: `npm.cmd test -- electron/ipc/__tests__/gallery-workspace-ui.spec.ts`

Expected: FAIL because the drag handlers and overlay are absent.

- [ ] **Step 3: Expose typed APIs**

Add to `galleryAPI` in `electron/preload.js`:

```js
inspectDroppedPaths: (paths) => ipcRenderer.invoke('gallery:inspectDroppedPaths', paths),
importFiles: (paths) => ipcRenderer.invoke('gallery:importFiles', paths),
```

Add matching declarations in `src/env.d.ts`, including the exact result shapes.

- [ ] **Step 4: Restore drag handling in Gallery**

Add drag-depth tracking so child-element transitions do not flicker:

```ts
const isDragOver = ref(false)
let dragDepth = 0

function onDragEnter() { dragDepth++; isDragOver.value = true }
function onDragLeave() { dragDepth = Math.max(0, dragDepth - 1); isDragOver.value = dragDepth > 0 }
function resetDragState() { dragDepth = 0; isDragOver.value = false }
```

`onDrop` converts every dropped `File` through `getFilePath`, calls `inspectDroppedPaths`, then follows these rules:

```ts
if (classified.imagePaths.length === 1 && classified.folderPaths.length === 0) {
  await openDroppedImage(classified.imagePaths[0])
  return
}
if (classified.imagePaths.length) await window.galleryAPI.importFiles(classified.imagePaths)
for (const folderPath of classified.folderPaths) {
  const existing = galleryStore.roots.find((root) => root.path.toLowerCase() === folderPath.toLowerCase())
  if (existing) await galleryStore.scanRoot(folderPath)
  else await galleryStore.addRoot(folderPath)
}
await galleryStore.loadImages(true)
await refreshVisibleTags()
```

For a single image, create a temporary `GalleryImage` with id `-1`, call `readFileMeta`, load the image through `fsAPI.readImageBase64`, and feed those values into the existing metadata viewer without inserting a database row. Guard save/send actions while this temporary image is open.

Attach drag handlers to `.gallery-page`, and render a pointer-events-none `.gallery-drag-overlay` inside `.gallery-shell`. The overlay text is “松开以读取图片或文件夹”.

- [ ] **Step 5: Run focused UI test and verify GREEN**

Run: `npm.cmd test -- electron/ipc/__tests__/gallery-workspace-ui.spec.ts`

Expected: PASS.

### Task 4: Verify the restored workflow

**Files:**
- Modify only if verification exposes a defect in the files above.

- [ ] **Step 1: Run all automated checks**

Run:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run check:ipc
npm.cmd run build
```

Expected: 20 or more test files pass, typecheck exits 0, IPC contract reports no missing channels, and Vite build succeeds.

- [ ] **Step 2: Perform live Electron verification**

Open the development app and verify:

1. Dragging over Gallery shows a stable overlay.
2. Dropping one image opens the metadata viewer without adding a library root.
3. Dropping several selected image files imports only those files.
4. Dropping a folder adds or resynchronizes that folder.
5. Unsupported files show a status message and do not alter Gallery.

- [ ] **Step 3: Review the final diff**

Run: `git diff --check` and `git diff --stat`.

Expected: no whitespace errors and changes limited to the drag/import contract, Gallery UI, tests, and this plan.

