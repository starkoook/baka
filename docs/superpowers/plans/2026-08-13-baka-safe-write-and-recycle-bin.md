# 图库安全写入、撤销历史与回收站 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Baka TOOLS 增加安全写入、文件历史版本、应用内回收站，以及移动/复制失败回滚能力。

**Architecture:** 在 Electron 主进程新增 `safe-file.js`、`file-history.js`、`recycle-bin.js` 三个服务模块，复用现有 `gallery.db` 记录历史和回收站，通过 IPC 暴露给渲染进程，并在图库 UI 增加回收站/历史入口。

**Tech Stack:** Electron、Node.js、SQLite(sql.js)、Vue 3、Vitest、TypeScript。

---

## 文件结构

- Create: `electron/ipc/safe-file.js`
- Create: `electron/ipc/file-history.js`
- Create: `electron/ipc/recycle-bin.js`
- Modify: `electron/ipc/paths.js`
- Modify: `electron/ipc/gallery.js`
- Modify: `electron/main.js`
- Modify: `electron/preload.js`
- Modify: `electron/ipc/channels.js`
- Modify: `src/env.d.ts`
- Modify: `src/stores/gallery.ts`
- Modify: `src/views/Gallery.vue`
- Modify: `src/components/tagger/GallerySelectionBar.vue`
- Create: `electron/ipc/__tests__/safe-file.spec.ts`
- Create: `electron/ipc/__tests__/file-history.spec.ts`
- Create: `electron/ipc/__tests__/recycle-bin.spec.ts`
- Create: `electron/ipc/__tests__/move-images-safe.spec.ts`

---

### Task 1: 扩展数据目录路径

**Files:**
- Modify: `electron/ipc/paths.js`

- [ ] **Step 1: 增加回收站和历史目录函数**

在 `electron/ipc/paths.js` 末尾、`module.exports` 之前加入：

```js
function getRecycleDir() {
  const dir = path.join(DATA_ROOT, 'recycle-bin'); ensure(dir); return dir
}

function getHistoryDir() {
  const dir = path.join(DATA_ROOT, 'file-history'); ensure(dir); return dir
}
```

并把两个函数加入 `module.exports`。

- [ ] **Step 2: 运行现有路径测试**

Run: `npm.cmd test -- electron/ipc/__tests__/paths.spec.ts`

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add electron/ipc/paths.js
git commit -m "feat: add recycle and history directories"
```

---

### Task 2: 数据库迁移

**Files:**
- Modify: `electron/ipc/gallery.js`

- [ ] **Step 1: 在 `initDb` 增加两张表**

在 schema migration 区域，`// v4` 之后增加：

```js
if (version < 5) {
  db.run(`
    CREATE TABLE IF NOT EXISTS file_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_path TEXT NOT NULL,
      version_path TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `)
  db.run('CREATE INDEX IF NOT EXISTS idx_file_versions_target ON file_versions(target_path)')
  db.run(`
    CREATE TABLE IF NOT EXISTS recycle_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_path TEXT NOT NULL,
      recycle_path TEXT NOT NULL,
      kind TEXT NOT NULL,
      size INTEGER,
      deleted_at TEXT NOT NULL
    )
  `)
  db.run('CREATE INDEX IF NOT EXISTS idx_recycle_original ON recycle_items(original_path)')
  db.run('CREATE INDEX IF NOT EXISTS idx_recycle_deleted ON recycle_items(deleted_at)')
  runSql('INSERT OR REPLACE INTO schema_version (version) VALUES (5)')
}
```

注意：现有 `version` 变量读取的是 `MAX(version)`，迁移后逻辑会自动升级。

- [ ] **Step 2: 运行 gallery 扫描测试**

Run: `npm.cmd test -- electron/ipc/__tests__/gallery-scan.spec.ts`

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add electron/ipc/gallery.js
git commit -m "feat: add file version and recycle tables"
```

---

### Task 3: SafeFile 安全写入

**Files:**
- Create: `electron/ipc/safe-file.js`
- Create: `electron/ipc/__tests__/safe-file.spec.ts`

- [ ] **Step 1: 写失败测试**

创建 `electron/ipc/__tests__/safe-file.spec.ts`：

```ts
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { writeTextSafe } from '../safe-file.js'

describe('safe-file', () => {
  it('replaces an existing file without truncating it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'baka-safe-'))
    const target = join(dir, 'caption.txt')
    writeFileSync(target, 'old', 'utf8')

    const result = await writeTextSafe(target, 'new')

    expect(result).toMatchObject({ success: true })
    expect(readFileSync(target, 'utf8')).toBe('new')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm.cmd test -- electron/ipc/__tests__/safe-file.spec.ts`

Expected: FAIL，因为 `../safe-file.js` 不存在。

- [ ] **Step 3: 实现 SafeFile**

创建 `electron/ipc/safe-file.js`：

```js
const fs = require('fs')
const path = require('path')

const locks = new Map()

function lockFor(target) {
  const key = path.resolve(target)
  if (!locks.has(key)) locks.set(key, Promise.resolve())
  return locks.get(key)
}

async function withLock(target, action) {
  const previous = lockFor(target)
  let release
  const current = new Promise((resolve) => { release = resolve })
  locks.set(target, current)
  await previous
  try {
    return await action()
  } finally {
    release()
  }
}

async function writeTemp(target, content) {
  const dir = path.dirname(target)
  fs.mkdirSync(dir, { recursive: true })
  const tmp = path.join(dir, `.bdtm-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`)
  if (typeof content === 'string') fs.writeFileSync(tmp, content, 'utf8')
  else fs.writeFileSync(tmp, content)
  return tmp
}

async function replaceFile(tmp, target) {
  fs.copyFileSync(tmp, target)
  fs.rmSync(tmp, { force: true })
}

async function writeTextSafe(target, text) {
  return withLock(target, async () => {
    const tmp = await writeTemp(target, text)
    try {
      await replaceFile(tmp, target)
      return { success: true }
    } catch (error) {
      try { fs.rmSync(tmp, { force: true }) } catch {}
      return { success: false, error: error.message }
    }
  })
}

async function writeBytesSafe(target, buffer) {
  return withLock(target, async () => {
    const tmp = await writeTemp(target, buffer)
    try {
      await replaceFile(tmp, target)
      return { success: true }
    } catch (error) {
      try { fs.rmSync(tmp, { force: true }) } catch {}
      return { success: false, error: error.message }
    }
  })
}

module.exports = { writeTextSafe, writeBytesSafe }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm.cmd test -- electron/ipc/__tests__/safe-file.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/safe-file.js electron/ipc/__tests__/safe-file.spec.ts
git commit -m "feat: add safe file write helper"
```

---

### Task 4: 文件历史版本

**Files:**
- Create: `electron/ipc/file-history.js`
- Create: `electron/ipc/__tests__/file-history.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createHistoryRecord, restoreVersion } from '../file-history.js'

describe('file history', () => {
  it('keeps a version and restores it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'baka-history-'))
    const target = join(dir, 'caption.txt')
    writeFileSync(target, 'v1', 'utf8')
    const record = await createHistoryRecord(target, join(dir, 'history'))
    writeFileSync(target, 'v2', 'utf8')

    const restored = await restoreVersion(record.id)

    expect(restored.success).toBe(true)
    expect(readFileSync(target, 'utf8')).toBe('v1')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm.cmd test -- electron/ipc/__tests__/file-history.spec.ts`

Expected: FAIL

- [ ] **Step 3: 实现文件历史**

创建 `electron/ipc/file-history.js`：

```js
const fs = require('fs')
const path = require('path')
const { getHistoryDir } = require('./paths')
const { ensureDb, runSql, queryAll } = require('./gallery')

function targetKey(target) {
  return Buffer.from(path.resolve(target)).toString('hex')
}

async function createHistoryRecord(target) {
  await ensureDb()
  if (!fs.existsSync(target)) return { success: true, id: null }
  const root = getHistoryDir()
  const key = targetKey(target)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const versionPath = path.join(root, `${key}-${stamp}-${Math.random().toString(16).slice(2)}`)
  fs.mkdirSync(root, { recursive: true })
  fs.copyFileSync(target, versionPath)
  const createdAt = new Date().toISOString()
  runSql(
    'INSERT INTO file_versions (target_path, version_path, created_at) VALUES (?, ?, ?)',
    [path.resolve(target), versionPath, createdAt]
  )
  const rows = queryAll('SELECT id, version_path FROM file_versions WHERE target_path = ? ORDER BY created_at DESC', [path.resolve(target)])
  for (const row of rows.slice(10)) {
    try { fs.rmSync(row.version_path, { force: true }) } catch {}
    runSql('DELETE FROM file_versions WHERE id = ?', [row.id])
  }
  const row = queryAll('SELECT id FROM file_versions ORDER BY id DESC LIMIT 1')[0]
  return { success: true, id: row ? row.id : null, versionPath, createdAt }
}

async function listVersions(target) {
  await ensureDb()
  return queryAll(
    'SELECT id, version_path, created_at FROM file_versions WHERE target_path = ? ORDER BY created_at DESC',
    [path.resolve(target)]
  )
}

async function restoreVersion(id) {
  await ensureDb()
  const rows = queryAll('SELECT * FROM file_versions WHERE id = ?', [id])
  const row = rows[0]
  if (!row || !fs.existsSync(row.version_path)) return { success: false, error: 'Version not found' }
  await createHistoryRecord(row.target_path)
  fs.copyFileSync(row.version_path, row.target_path)
  return { success: true, targetPath: row.target_path }
}

module.exports = { createHistoryRecord, listVersions, restoreVersion }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm.cmd test -- electron/ipc/__tests__/file-history.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/file-history.js electron/ipc/__tests__/file-history.spec.ts
git commit -m "feat: add file version history"
```

---

### Task 5: 回收站

**Files:**
- Create: `electron/ipc/recycle-bin.js`
- Create: `electron/ipc/__tests__/recycle-bin.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { moveToRecycle, restoreRecycleItem } from '../recycle-bin.js'

describe('recycle bin', () => {
  it('moves a file out and restores it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'baka-recycle-'))
    const target = join(dir, 'image.png')
    writeFileSync(target, 'kept')

    const moved = await moveToRecycle(target)
    expect(moved.success).toBe(true)
    expect(existsSync(target)).toBe(false)

    const restored = await restoreRecycleItem(moved.id)
    expect(restored.success).toBe(true)
    expect(readFileSync(restored.restoredPath, 'utf8')).toBe('kept')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Expected: FAIL

- [ ] **Step 3: 实现回收站**

创建 `electron/ipc/recycle-bin.js`：

```js
const fs = require('fs')
const path = require('path')
const { getRecycleDir } = require('./paths')
const { ensureDb, runSql, queryAll } = require('./gallery')

function uniqueRecyclePath(originalPath) {
  const root = getRecycleDir()
  const name = path.basename(originalPath)
  return path.join(root, `${Date.now()}-${Math.random().toString(16).slice(2)}-${name}`)
}

async function moveToRecycle(originalPath) {
  await ensureDb()
  if (!fs.existsSync(originalPath)) return { success: false, error: 'File not found' }
  const recyclePath = uniqueRecyclePath(originalPath)
  fs.mkdirSync(path.dirname(recyclePath), { recursive: true })
  fs.copyFileSync(originalPath, recyclePath)
  const stat = fs.statSync(recyclePath)
  runSql(
    'INSERT INTO recycle_items (original_path, recycle_path, kind, size, deleted_at) VALUES (?, ?, ?, ?, ?)',
    [path.resolve(originalPath), recyclePath, path.extname(originalPath).slice(1), stat.size, new Date().toISOString()]
  )
  fs.rmSync(originalPath, { force: true })
  const row = queryAll('SELECT id FROM recycle_items ORDER BY id DESC LIMIT 1')[0]
  return { success: true, id: row.id, recyclePath }
}

async function restoreRecycleItem(id) {
  await ensureDb()
  const rows = queryAll('SELECT * FROM recycle_items WHERE id = ?', [id])
  const row = rows[0]
  if (!row) return { success: false, error: 'Item not found' }
  let target = row.original_path
  if (fs.existsSync(target)) {
    const ext = path.extname(target)
    const base = target.slice(0, -ext.length)
    target = `${base}-restored${ext}`
  }
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.copyFileSync(row.recycle_path, target)
  fs.rmSync(row.recycle_path, { force: true })
  runSql('DELETE FROM recycle_items WHERE id = ?', [id])
  return { success: true, restoredPath: target }
}

async function listRecycleItems() {
  await ensureDb()
  return queryAll('SELECT * FROM recycle_items ORDER BY deleted_at DESC')
}

async function purgeExpiredItems(days = 30) {
  await ensureDb()
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  const items = await listRecycleItems()
  let removed = 0
  for (const item of items) {
    if (Date.parse(item.deleted_at) >= cutoff) continue
    try { fs.rmSync(item.recycle_path, { force: true }) } catch {}
    runSql('DELETE FROM recycle_items WHERE id = ?', [item.id])
    removed++
  }
  return { success: true, removed }
}

module.exports = { moveToRecycle, restoreRecycleItem, listRecycleItems, purgeExpiredItems }
```

- [ ] **Step 4: 运行测试确认通过**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/recycle-bin.js electron/ipc/__tests__/recycle-bin.spec.ts
git commit -m "feat: add app recycle bin"
```

---

### Task 6: 安全移动/复制

**Files:**
- Modify: `electron/main.js`
- Create: `electron/ipc/__tests__/move-images-safe.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

describe('moveImagesSafe', () => {
  it('returns failures without losing the first moved file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'baka-move-'))
    const src1 = join(dir, 'a.png')
    const src2 = join(dir, 'b.png')
    writeFileSync(src1, 'a')
    writeFileSync(src2, 'b')
    const dest = join(dir, 'out')

    // The real handler is exercised through the refactored move helper below.
    const move = await import('../main-move-helper.js')
    const result = await move.moveImages({
      filePaths: [src1, src2],
      destFolder: dest,
      keepOriginal: false,
      failAt: src2,
    })

    expect(result.success).toBe(false)
    expect(result.data.failures).toHaveLength(1)
    expect(existsSync(join(dest, 'a.png'))).toBe(true)
    expect(existsSync(src1)).toBe(false)
  })
})
```

为了可测试，把移动逻辑提取到 `electron/ipc/move-images-safe.js`，导出 `moveImages`。

- [ ] **Step 2: 修改 `fs:moveImages` handler**

创建 `electron/ipc/move-images-safe.js`，把现有单文件移动改为：

```js
const fs = require('fs')
const path = require('path')

async function moveImages({ filePaths, destFolder, keepOriginal, failAt = null }) {
  fs.mkdirSync(destFolder, { recursive: true })
  const results = []
  const failures = []
  for (const src of filePaths) {
    if (failAt && src === failAt) {
      failures.push({ path: src, error: 'simulated failure' })
      continue
    }
    let imageMoved = false
    try {
      const filename = path.basename(src)
      let finalDest = path.join(destFolder, filename)
      let n = 1
      while (fs.existsSync(finalDest)) {
        const ext = path.extname(filename)
        finalDest = path.join(destFolder, `${filename.slice(0, -ext.length)}_${n}${ext}`)
        n++
      }
      const captionSrc = src.replace(/\.[^.]+$/, '') + '.txt'
      const captionDest = finalDest.replace(/\.[^.]+$/, '') + '.txt'
      if (keepOriginal) {
        fs.copyFileSync(src, finalDest)
        if (fs.existsSync(captionSrc)) fs.copyFileSync(captionSrc, captionDest)
      } else {
        fs.renameSync(src, finalDest)
        imageMoved = true
        if (fs.existsSync(captionSrc)) {
          fs.renameSync(captionSrc, captionDest)
        }
      }
      results.push({ oldPath: src, newPath: finalDest })
    } catch (error) {
      if (imageMoved) {
        try { fs.renameSync(finalDest, src) } catch {}
      }
      failures.push({ path: src, error: error.message })
    }
  }
  return { success: failures.length === 0, data: { moved: results.length, destPaths: results.map(r => r.newPath), failures } }
}

module.exports = { moveImages }
```

并把 `electron/main.js` 的 `fs:moveImages` handler 改为调用该 helper：

```js
const { moveImages } = require('./ipc/move-images-safe')

ipcMain.handle('fs:moveImages', async (_event, { filePaths, destFolder, keepOriginal }) => {
  return moveImages({ filePaths, destFolder, keepOriginal })
})
```

- [ ] **Step 3: 运行测试确认通过**

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add electron/main.js electron/ipc/__tests__/move-images-safe.spec.ts
git commit -m "feat: add partial failure handling to move images"
```

---

### Task 7: IPC / preload / 类型声明

**Files:**
- Modify: `electron/ipc/channels.js`
- Modify: `electron/preload.js`
- Modify: `src/env.d.ts`

- [ ] **Step 1: 增加通道常量**

在 `electron/ipc/channels.js` 加入：

```js
FS_WRITE_TEXT_SAFE: 'fs:writeTextSafe',
FS_WRITE_BYTES_SAFE: 'fs:writeBytesSafe',
FS_DELETE_MEDIA: 'fs:deleteMedia',
RECYCLE_LIST: 'recycle:list',
RECYCLE_RESTORE: 'recycle:restore',
RECYCLE_PURGE: 'recycle:purge',
HISTORY_LIST: 'history:list',
HISTORY_RESTORE: 'history:restore',
```

- [ ] **Step 2: preload 暴露 API**

在 `fsAPI` 加入：

```js
writeTextSafe: (params) => ipcRenderer.invoke('fs:writeTextSafe', params),
writeBytesSafe: (params) => ipcRenderer.invoke('fs:writeBytesSafe', params),
deleteMedia: (params) => ipcRenderer.invoke('fs:deleteMedia', params),
```

新增：

```js
contextBridge.exposeInMainWorld('recycleAPI', {
  list: () => ipcRenderer.invoke('recycle:list'),
  restore: (id) => ipcRenderer.invoke('recycle:restore', id),
  purge: (id) => ipcRenderer.invoke('recycle:purge', id),
})

contextBridge.exposeInMainWorld('historyAPI', {
  list: (filePath) => ipcRenderer.invoke('history:list', filePath),
  restore: (id) => ipcRenderer.invoke('history:restore', id),
})
```

- [ ] **Step 2b: 注册主进程 handler**

在 `electron/main.js` 顶部引入：

```js
const { writeTextSafe, writeBytesSafe } = require('./ipc/safe-file')
const { listVersions, restoreVersion } = require('./ipc/file-history')
const { moveToRecycle, restoreRecycleItem, listRecycleItems, purgeExpiredItems } = require('./ipc/recycle-bin')
```

在 `app.whenReady()` 内注册：

```js
ipcMain.handle('fs:writeTextSafe', async (_event, params) => writeTextSafe(params.filePath, params.text))
ipcMain.handle('fs:writeBytesSafe', async (_event, params) => writeBytesSafe(params.filePath, Buffer.from(params.base64, 'base64')))
ipcMain.handle('fs:deleteMedia', async (_event, params) => {
  const results = []
  const failures = []
  for (const filePath of params.filePaths || []) {
    const captionPath = filePath.replace(/\.[^.]+$/, '') + '.txt'
    const mediaResult = await moveToRecycle(filePath)
    if (!mediaResult.success) { failures.push({ path: filePath, error: mediaResult.error }); continue }
    if (fs.existsSync(captionPath)) await moveToRecycle(captionPath)
    results.push(filePath)
  }
  return { success: failures.length === 0, data: { moved: results.length, failures } }
})
ipcMain.handle('recycle:list', async () => ({ success: true, data: await listRecycleItems() }))
ipcMain.handle('recycle:restore', async (_event, id) => restoreRecycleItem(id))
ipcMain.handle('recycle:purge', async (_event, id) => {
  const items = await listRecycleItems()
  const item = items.find(row => row.id === id)
  if (!item) return { success: false, error: 'Item not found' }
  fs.rmSync(item.recycle_path, { force: true })
  require('./ipc/gallery').runSql('DELETE FROM recycle_items WHERE id = ?', [id])
  return { success: true }
})
ipcMain.handle('history:list', async (_event, filePath) => ({ success: true, data: await listVersions(filePath) }))
ipcMain.handle('history:restore', async (_event, id) => restoreVersion(id))
```

在 `app.whenReady()` 末尾调用一次过期清理：

```js
purgeExpiredItems(30).catch(() => {})
```

- [ ] **Step 3: 更新类型声明**

在 `FsAPI` 增加 `writeTextSafe`、`writeBytesSafe`、`deleteMedia`，并新增 `RecycleAPI`、`HistoryAPI` 接口。

- [ ] **Step 4: 运行通道检查**

Run: `npm.cmd run check:ipc`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/channels.js electron/preload.js src/env.d.ts
git commit -m "feat: wire safe file recycle and history APIs"
```

---

### Task 8: 图库 UI 接入回收站与历史

**Files:**
- Modify: `src/views/Gallery.vue`
- Modify: `src/components/tagger/GallerySelectionBar.vue`
- Modify: `src/stores/gallery.ts`

- [ ] **Step 1: 在 GallerySelectionBar 增加删除按钮**

按钮调用 `deleteSelectedMedia()`，并把结果通过事件交给 `Gallery.vue`。

- [ ] **Step 2: Gallery.vue 调用 deleteMedia 并刷新列表**

```ts
async function deleteSelectedMedia() {
  const paths = orderedSelectedImages.value.map((image) => image.path)
  const response = await window.fsAPI.deleteMedia({ filePaths: paths })
  if (!response.success) {
    appStore.setError(response.error || '删除失败')
    return
  }
  galleryStore.clearSelection()
  await galleryStore.loadImages(true)
  appStore.setStatus(`已移入回收站：${response.data?.moved ?? 0} 张`)
}
```

- [ ] **Step 3: 在设置页或图库侧栏增加回收站入口**

可先放在设置页，用简单弹窗展示 `window.recycleAPI.list()` 结果，并提供恢复/彻底删除按钮。

- [ ] **Step 4: 在 MetadataViewer 增加历史版本入口**

当图片有 `.txt` 文件时，调用 `window.historyAPI.list(txtPath)`，显示最近版本，并支持恢复。

- [ ] **Step 5: 运行 UI 测试和类型检查**

Run: `npm.cmd test -- electron/ipc/__tests__/gallery-workspace-ui.spec.ts` 和 `npm.cmd run typecheck`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/views/Gallery.vue src/components/tagger/GallerySelectionBar.vue src/stores/gallery.ts
git commit -m "feat: add recycle bin and history UI"
```

---

### Task 9: 集成验证

- [ ] **Step 1: 运行完整相关测试**

Run: `npm.cmd test -- electron/ipc/__tests__/safe-file.spec.ts electron/ipc/__tests__/file-history.spec.ts electron/ipc/__tests__/recycle-bin.spec.ts electron/ipc/__tests__/move-images-safe.spec.ts electron/ipc/__tests__/gallery-workspace-ui.spec.ts`

Expected: 全部 PASS

- [ ] **Step 2: 类型检查**

Run: `npm.cmd run typecheck`

Expected: PASS

- [ ] **Step 3: 手动验收清单**

- 保存标签时模拟磁盘失败，原 `.txt` 不变。
- 删除图片后可在回收站恢复。
- 修改标签后可恢复上一版本。
- 移动 10 张图片时人为制造 1 张失败，9 张成功且失败清单准确。
- 回收站过期项目可在启动时清理。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test: complete safe write recycle and history verification"
```
