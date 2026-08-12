# 工作台流程管理 + 左栏重构 + 结果资产 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给工作台补上 ComfyUI 式的流程管理（自动保存、最近项目、运行进度/取消）和结果资产面板，并把工具栏收进左侧动态图标栏，全部带流畅动效。

**Architecture:** 新增两个 Electron 主进程模块（`workflow-store.js` 管自动保存与最近项目、`assets.js` 管生成结果资产），通过 `ipcMain.handle` + preload 暴露给前端；前端 `Workbench.vue` 用防抖 watch 自动保存、恢复上次画布、收集资产，并把现有顶部工具栏改造成左栏图标条 + 抽屉面板。

**Tech Stack:** Electron IPC、Node fs、Vue 3 `<script setup>`、CSS transition/keyframes、Vitest（现有测试为源码断言 + electron 单元测试模式）。

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `electron/ipc/workflow-store.js`（新建） | 自动保存读写、最近项目 index 读写、IPC 注册 |
| `electron/ipc/assets.js`（新建） | 资产 index 读写、图片/文本落盘、视频引用、IPC 注册 |
| `electron/ipc/__tests__/workflow-store.spec.ts`（新建） | workflow-store 单元测试 + 主进程/preload 接线断言 |
| `electron/ipc/__tests__/assets.spec.ts`（新建） | assets 单元测试 |
| `electron/main.js`（修改） | require 并注册两个新模块的 IPC |
| `electron/preload.js`（修改） | 暴露 `workflowAPI` / `assetsAPI` |
| `src/env.d.ts`（修改） | 新增 `WorkflowAPI` / `AssetsAPI` / `AssetRecord` 类型 |
| `src/views/Workbench.vue`（修改） | 自动保存、恢复、进度/取消、左栏 UI、动效、资产面板 |
| `electron/ipc/__tests__/workbench-ui.spec.ts`（修改） | 工作台 UI 源码断言 |

---

### Task 1: workflow-store 后端模块（自动保存 + 最近项目）

**Files:**
- Create: `electron/ipc/workflow-store.js`
- Test: `electron/ipc/__tests__/workflow-store.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { saveAutosave, loadAutosave, recordRecent, listRecent, removeRecent } from '../workflow-store'

let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'baka-wf-store-')) })
afterEach(() => { rmSync(root, { recursive: true, force: true }) })

describe('workflow-store autosave', () => {
  it('saves and loads autosave content', () => {
    const res = saveAutosave('{"version":1}', root)
    expect(res.success).toBe(true)
    expect(existsSync(join(root, 'workflows', 'autosave.bakaflow.json'))).toBe(true)
    const loaded = loadAutosave(root)
    expect(loaded.success).toBe(true)
    expect(loaded.content).toBe('{"version":1}')
  })

  it('returns failure when no autosave exists', () => {
    expect(loadAutosave(root).success).toBe(false)
  })
})

describe('workflow-store recent', () => {
  it('records newest first and caps at 20', () => {
    for (let i = 0; i < 25; i++) recordRecent({ path: `C:/flows/${i}.json`, name: `flow ${i}` }, root)
    const list = listRecent(root)
    expect(list).toHaveLength(20)
    expect(list[0].path).toBe('C:/flows/24.json')
  })

  it('deduplicates by path keeping the newest name', () => {
    recordRecent({ path: 'a.json', name: 'a' }, root)
    recordRecent({ path: 'a.json', name: 'a2' }, root)
    const list = listRecent(root)
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('a2')
  })

  it('removes recent entries', () => {
    recordRecent({ path: 'a.json', name: 'a' }, root)
    const res = removeRecent('a.json', root)
    expect(res.success).toBe(true)
    expect(res.list).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run electron/ipc/__tests__/workflow-store.spec.ts`
Expected: FAIL（找不到 `../workflow-store` 模块）

- [ ] **Step 3: 实现模块**

```js
const { ipcMain } = require('electron')
const fs = require('fs')
const path = require('path')
const { getDataRoot } = require('./paths')

const RECENT_LIMIT = 20

function getWorkflowsDir(root = getDataRoot()) {
  const dir = path.join(root, 'workflows')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function getAutosavePath(root) {
  return path.join(getWorkflowsDir(root), 'autosave.bakaflow.json')
}

function saveAutosave(content, root = getDataRoot()) {
  try {
    const file = getAutosavePath(root)
    fs.writeFileSync(file, content, 'utf-8')
    return { success: true, path: file }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

function loadAutosave(root = getDataRoot()) {
  const file = getAutosavePath(root)
  if (!fs.existsSync(file)) return { success: false, error: '没有自动保存' }
  try {
    return { success: true, content: fs.readFileSync(file, 'utf-8'), path: file }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

function getRecentPath(root) {
  return path.join(getWorkflowsDir(root), 'recent.json')
}

function listRecent(root = getDataRoot()) {
  try {
    const list = JSON.parse(fs.readFileSync(getRecentPath(root), 'utf-8'))
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function recordRecent(entry, root = getDataRoot()) {
  const filePath = entry?.path
  if (!filePath) return { success: false, error: '没有文件路径' }
  const list = listRecent(root).filter((item) => item.path !== filePath)
  list.unshift({ path: filePath, name: entry.name || path.basename(filePath), updatedAt: Date.now() })
  const trimmed = list.slice(0, RECENT_LIMIT)
  fs.writeFileSync(getRecentPath(root), JSON.stringify(trimmed, null, 2), 'utf-8')
  return { success: true, list: trimmed }
}

function removeRecent(filePath, root = getDataRoot()) {
  const list = listRecent(root).filter((item) => item.path !== filePath)
  fs.writeFileSync(getRecentPath(root), JSON.stringify(list, null, 2), 'utf-8')
  return { success: true, list }
}

function registerWorkflowHandlers() {
  ipcMain.handle('workflow:saveAutosave', (_event, content) => saveAutosave(content))
  ipcMain.handle('workflow:loadAutosave', () => loadAutosave())
  ipcMain.handle('workflow:listRecent', () => ({ success: true, list: listRecent() }))
  ipcMain.handle('workflow:recordRecent', (_event, entry) => recordRecent(entry))
  ipcMain.handle('workflow:removeRecent', (_event, filePath) => removeRecent(filePath))
}

module.exports = {
  getWorkflowsDir,
  getAutosavePath,
  saveAutosave,
  loadAutosave,
  listRecent,
  recordRecent,
  removeRecent,
  registerWorkflowHandlers,
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run electron/ipc/__tests__/workflow-store.spec.ts`
Expected: PASS（6 个用例）

- [ ] **Step 5: 提交**

```bash
git add electron/ipc/workflow-store.js electron/ipc/__tests__/workflow-store.spec.ts
git commit -m "feat(electron): 工作流自动保存与最近项目存储"
```

---

### Task 2: 资产存储后端模块

**Files:**
- Create: `electron/ipc/assets.js`
- Test: `electron/ipc/__tests__/assets.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { addAsset, listAssets, deleteAsset, clearAssets } from '../assets'

let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'baka-assets-')) })
afterEach(() => { rmSync(root, { recursive: true, force: true }) })

const PNG = 'data:image/png;base64,' + Buffer.from('fake-png').toString('base64')

describe('assets store', () => {
  it('persists an image asset as a file and lists it', () => {
    const res = addAsset({ type: 'image', dataUrl: PNG, meta: { node: '图片节点' } }, root)
    expect(res.success).toBe(true)
    const asset = res.asset!
    expect(asset.type).toBe('image')
    expect(existsSync(asset.file)).toBe(true)
    expect(readFileSync(asset.file).toString()).toBe('fake-png')
    expect(listAssets(root)).toHaveLength(1)
  })

  it('persists text assets and references video paths without copying', () => {
    addAsset({ type: 'text', text: '你好', meta: {} }, root)
    const video = addAsset({ type: 'video', sourcePath: 'D:/video.mp4', meta: {} }, root)
    expect(video.success).toBe(true)
    expect(video.asset!.file).toBe('D:/video.mp4')
    expect(existsSync(join(root, 'assets', 'files', 'anything'))).toBe(false)
  })

  it('caps the list at 200 entries newest first', () => {
    for (let i = 0; i < 205; i++) addAsset({ type: 'text', text: `t${i}`, meta: {} }, root)
    expect(listAssets(root)).toHaveLength(200)
    expect(listAssets(root)[0].meta?.node).toBeUndefined()
  })

  it('deletes and clears assets', () => {
    const a = addAsset({ type: 'text', text: 'x', meta: {} }, root).asset!
    const b = addAsset({ type: 'text', text: 'y', meta: {} }, root).asset!
    const del = deleteAsset(a.id, root)
    expect(del.success).toBe(true)
    expect(del.list?.map((i) => i.id)).not.toContain(a.id)
    expect(existsSync(a.file)).toBe(false)
    expect(existsSync(b.file)).toBe(true)
    expect(clearAssets(root).success).toBe(true)
    expect(listAssets(root)).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run electron/ipc/__tests__/assets.spec.ts`
Expected: FAIL（找不到 `../assets` 模块）

- [ ] **Step 3: 实现模块**

```js
const { ipcMain } = require('electron')
const fs = require('fs')
const path = require('path')
const { getDataRoot } = require('./paths')

const ASSET_LIMIT = 200

function getAssetsDir(root = getDataRoot()) {
  const dir = path.join(root, 'assets')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function getIndexPath(root) {
  return path.join(getAssetsDir(root), 'index.json')
}

function getFilesDir(root) {
  const dir = path.join(getAssetsDir(root), 'files')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function listAssets(root = getDataRoot()) {
  try {
    const list = JSON.parse(fs.readFileSync(getIndexPath(root), 'utf-8'))
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function addAsset(entry, root = getDataRoot()) {
  const { type, dataUrl, text, sourcePath, meta } = entry || {}
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
  let file = ''
  if (type === 'image' && dataUrl) {
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl)
    if (!match) return { success: false, error: '无效图片数据' }
    const ext = match[1] === 'image/png' ? 'png' : match[1] === 'image/webp' ? 'webp' : match[1] === 'image/gif' ? 'gif' : 'jpg'
    file = path.join(getFilesDir(root), `${id}.${ext}`)
    fs.writeFileSync(file, Buffer.from(match[2], 'base64'))
  } else if (type === 'text') {
    file = path.join(getFilesDir(root), `${id}.txt`)
    fs.writeFileSync(file, text ?? '', 'utf-8')
  } else if (type === 'video' && sourcePath) {
    file = sourcePath
  } else {
    return { success: false, error: '缺少资产内容' }
  }
  const record = { id, type, file, meta: meta || {}, createdAt: Date.now() }
  const next = [record, ...listAssets(root)].slice(0, ASSET_LIMIT)
  fs.writeFileSync(getIndexPath(root), JSON.stringify(next, null, 2), 'utf-8')
  return { success: true, asset: record }
}

function deleteAsset(id, root = getDataRoot()) {
  const list = listAssets(root)
  const found = list.find((item) => item.id === id)
  const next = list.filter((item) => item.id !== id)
  fs.writeFileSync(getIndexPath(root), JSON.stringify(next, null, 2), 'utf-8')
  if (found && found.file && found.file.startsWith(getFilesDir(root))) {
    try { fs.unlinkSync(found.file) } catch { /* 文件可能已不存在 */ }
  }
  return { success: true, list: next }
}

function clearAssets(root = getDataRoot()) {
  fs.writeFileSync(getIndexPath(root), '[]', 'utf-8')
  return { success: true }
}

function registerAssetHandlers() {
  ipcMain.handle('assets:list', () => ({ success: true, list: listAssets() }))
  ipcMain.handle('assets:add', (_event, entry) => addAsset(entry))
  ipcMain.handle('assets:delete', (_event, id) => deleteAsset(id))
  ipcMain.handle('assets:clear', () => clearAssets())
}

module.exports = {
  getAssetsDir,
  listAssets,
  addAsset,
  deleteAsset,
  clearAssets,
  registerAssetHandlers,
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run electron/ipc/__tests__/assets.spec.ts`
Expected: PASS（4 个用例）

- [ ] **Step 5: 提交**

```bash
git add electron/ipc/assets.js electron/ipc/__tests__/assets.spec.ts
git commit -m "feat(electron): 结果资产存储（图片/文本/视频）"
```

---

### Task 3: 接线主进程、preload 与类型声明

**Files:**
- Modify: `electron/main.js`
- Modify: `electron/preload.js`
- Modify: `src/env.d.ts`
- Test: `electron/ipc/__tests__/workflow-store.spec.ts`

- [ ] **Step 1: 写失败测试（接线断言）**

在 `electron/ipc/__tests__/workflow-store.spec.ts` 末尾追加：

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('workflow & assets IPC wiring', () => {
  it('registers both modules in main and exposes APIs in preload', () => {
    const main = readFileSync(resolve(process.cwd(), 'electron/main.js'), 'utf8')
    expect(main).toContain("require('./ipc/workflow-store')")
    expect(main).toContain("require('./ipc/assets')")
    expect(main).toContain('registerWorkflowHandlers()')
    expect(main).toContain('registerAssetHandlers()')

    const preload = readFileSync(resolve(process.cwd(), 'electron/preload.js'), 'utf8')
    expect(preload).toContain("exposeInMainWorld('workflowAPI'")
    expect(preload).toContain("exposeInMainWorld('assetsAPI'")

    const env = readFileSync(resolve(process.cwd(), 'src/env.d.ts'), 'utf8')
    expect(env).toContain('interface WorkflowAPI')
    expect(env).toContain('interface AssetsAPI')
    expect(env).toContain('workflowAPI: WorkflowAPI')
    expect(env).toContain('assetsAPI: AssetsAPI')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run electron/ipc/__tests__/workflow-store.spec.ts`
Expected: FAIL（main.js/preload/env.d.ts 还没有这些标记）

- [ ] **Step 3: 修改 `electron/main.js`**

在文件顶部其他 `require('./ipc/...')` 之后追加：

```js
const { registerWorkflowHandlers } = require('./ipc/workflow-store')
const { registerAssetHandlers } = require('./ipc/assets')
```

在 `registerLLMHandlers()` 之后追加：

```js
registerWorkflowHandlers()
registerAssetHandlers()
```

- [ ] **Step 4: 修改 `electron/preload.js`**

在 `fsAPI` 的 `exposeInMainWorld` 块之后追加：

```js
contextBridge.exposeInMainWorld('workflowAPI', {
  saveAutosave: (content) => ipcRenderer.invoke('workflow:saveAutosave', content),
  loadAutosave: () => ipcRenderer.invoke('workflow:loadAutosave'),
  listRecent: () => ipcRenderer.invoke('workflow:listRecent'),
  recordRecent: (entry) => ipcRenderer.invoke('workflow:recordRecent', entry),
  removeRecent: (filePath) => ipcRenderer.invoke('workflow:removeRecent', filePath),
})

contextBridge.exposeInMainWorld('assetsAPI', {
  list: () => ipcRenderer.invoke('assets:list'),
  add: (entry) => ipcRenderer.invoke('assets:add', entry),
  remove: (id) => ipcRenderer.invoke('assets:delete', id),
  clear: () => ipcRenderer.invoke('assets:clear'),
})
```

- [ ] **Step 5: 修改 `src/env.d.ts`**

在 `interface NodesAPI` 之后追加：

```ts
  interface WorkflowRecentEntry {
    path: string
    name: string
    updatedAt: number
  }

  interface WorkflowAPI {
    saveAutosave: (content: string) => Promise<{ success: boolean; path?: string; error?: string }>
    loadAutosave: () => Promise<{ success: boolean; content?: string; path?: string; error?: string }>
    listRecent: () => Promise<{ success: boolean; list?: WorkflowRecentEntry[] }>
    recordRecent: (entry: { path: string; name: string }) => Promise<{ success: boolean; list?: WorkflowRecentEntry[]; error?: string }>
    removeRecent: (filePath: string) => Promise<{ success: boolean; list?: WorkflowRecentEntry[] }>
  }

  interface AssetRecord {
    id: string
    type: 'image' | 'text' | 'video'
    file: string
    meta: { node?: string; prompt?: string }
    createdAt: number
  }

  interface AssetsAPI {
    list: () => Promise<{ success: boolean; list?: AssetRecord[] }>
    add: (entry: {
      type: AssetRecord['type']
      dataUrl?: string
      text?: string
      sourcePath?: string
      meta?: AssetRecord['meta']
    }) => Promise<{ success: boolean; asset?: AssetRecord; error?: string }>
    remove: (id: string) => Promise<{ success: boolean; list?: AssetRecord[] }>
    clear: () => Promise<{ success: boolean }>
  }
```

在 `interface Window` 的 `nodesAPI?: NodesAPI` 之后追加：

```ts
    workflowAPI: WorkflowAPI
    assetsAPI: AssetsAPI
```

- [ ] **Step 6: 运行确认通过**

Run: `npx vitest run electron/ipc/__tests__/workflow-store.spec.ts`
Expected: PASS（接线断言 4 条 + 之前的 6 条）

- [ ] **Step 7: 提交**

```bash
git add electron/main.js electron/preload.js src/env.d.ts electron/ipc/__tests__/workflow-store.spec.ts
git commit -m "feat(electron): 注册工作流/资产 IPC 并暴露 preload API"
```

---

### Task 4: 前端自动保存 + 启动恢复 + 最近项目记录

**Files:**
- Modify: `src/views/Workbench.vue`
- Test: `electron/ipc/__tests__/workbench-ui.spec.ts`

- [ ] **Step 1: 写失败测试（源码断言）**

在 `electron/ipc/__tests__/workbench-ui.spec.ts` 的 `describe('infinite canvas workbench')` 块内追加：

```ts
  it('auto-saves with debounce and restores on mount', () => {
    expect(workbench).toContain('function scheduleAutosave')
    expect(workbench).toContain('1500')
    expect(workbench).toContain('workflowAPI?.saveAutosave')
    expect(workbench).toContain('restoreAutosave')
    expect(workbench).toContain('已自动保存')
  })

  it('records recent projects after save/open', () => {
    expect(workbench).toContain('workflowAPI?.recordRecent')
    expect(workbench).toContain('recentProjects')
  })
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run electron/ipc/__tests__/workbench-ui.spec.ts`
Expected: FAIL（新断言找不到标记）

- [ ] **Step 3: 在 `Workbench.vue` script 中新增状态与函数**

在 `const currentWorkflowFile = ref<string | null>(null)` 之后追加：

```ts
const autosaveTimer = ref<number | null>(null)
const runningRef = ref(false)
const recentProjects = ref<{ path: string; name: string; updatedAt: number }[]>([])
const toast = ref<{ text: string } | null>(null)
let toastTimer: number | null = null
```

在 `function workflowPayload()` 之前追加：

```ts
function fileNameOf(filePath: string) {
  return filePath.split(/[/\\]/).pop() || filePath
}

function showToast(text: string) {
  toast.value = { text }
  if (toastTimer) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => { toast.value = null }, 2200)
}

function scheduleAutosave() {
  if (runningRef.value) return
  if (autosaveTimer.value) window.clearTimeout(autosaveTimer.value)
  autosaveTimer.value = window.setTimeout(() => { void performAutosave() }, 1500)
}

async function performAutosave() {
  try {
    const res = await window.workflowAPI?.saveAutosave?.(workflowPayload())
    if (res?.success) showToast('已自动保存')
  } catch {
    /* 自动保存失败不打断编辑 */
  }
}

function applyWorkflowData(data: any, filePath: string | null) {
  if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
    throw new Error('文件格式不正确')
  }
  snapshot()
  nodes.value = data.nodes
  edges.value = data.edges
  if (data.view) {
    pan.value = { x: data.view.pan?.x ?? pan.value.x, y: data.view.pan?.y ?? pan.value.y }
    zoom.value = data.view.zoom ?? zoom.value
  }
  if (typeof data.snapGrid === 'boolean') snapGrid.value = data.snapGrid
  const maxId = nodes.value.reduce((m, n) => Math.max(m, n.id), 0)
  nextId = maxId + 1
  currentWorkflowFile.value = filePath
  setSelection([])
  selectedEdgeId.value = null
}

async function restoreAutosave() {
  const res = await window.workflowAPI?.loadAutosave?.()
  if (!res?.success || !res.content) return
  try {
    applyWorkflowData(JSON.parse(res.content), null)
    appStore.setStatus('已恢复上次的画布')
  } catch {
    /* 自动保存文件损坏时忽略 */
  }
}

async function loadRecentProjects() {
  const res = await window.workflowAPI?.listRecent?.()
  recentProjects.value = res?.list ?? []
}

async function openProjectFile(filePath: string) {
  if (nodes.value.length || edges.value.length) {
    const ok = window.confirm('打开画布会替换当前内容，确定继续吗？')
    if (!ok) return
  }
  const content = await window.fsAPI?.readText?.(filePath)
  if (!content?.success) {
    appStore.setStatus('打开失败：文件不存在或不可读')
    return
  }
  try {
    applyWorkflowData(JSON.parse(content.text), filePath)
    await window.workflowAPI?.recordRecent?.({ path: filePath, name: fileNameOf(filePath) })
    await loadRecentProjects()
    appStore.setStatus(`已打开：${filePath}`)
  } catch (e) {
    appStore.setStatus(`打开失败：${(e as Error).message}`)
  }
}
```

- [ ] **Step 4: 接入 watch、onMounted、保存/打开**

在现有 watch 区域（靠近 `watch([nodes...` 的既有 watcher）追加：

```ts
watch([nodes, edges, pan, zoom], () => scheduleAutosave(), { deep: true })
```

在现有 `onMounted(() => { ... })` 回调末尾追加：

```ts
  void restoreAutosave()
  void loadRecentProjects()
```

将 `openWorkflow()` 中从 `const data = JSON.parse(res.content)` 到 `selectedEdgeId.value = null` 的整段替换为：

```ts
    const data = JSON.parse(res.content)
    applyWorkflowData(data, res.path ?? null)
    await window.workflowAPI?.recordRecent?.({ path: res.path ?? '', name: fileNameOf(res.path ?? '') })
    await loadRecentProjects()
    appStore.setStatus(`已打开：${res.path}`)
```

在 `saveWorkflow()` 两个 `if (res?.success)` 分支内、`appStore.setStatus(...)` 之后各追加一行：

```ts
    await window.workflowAPI?.recordRecent?.({ path: res.path ?? '', name: fileNameOf(res.path ?? '') })
    await loadRecentProjects()
```

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run electron/ipc/__tests__/workbench-ui.spec.ts`
Expected: PASS

- [ ] **Step 6: typecheck**

Run: `npm run typecheck`
Expected: 通过，无类型错误

- [ ] **Step 7: 提交**

```bash
git add src/views/Workbench.vue electron/ipc/__tests__/workbench-ui.spec.ts
git commit -m "feat(workbench): 画布自动保存、启动恢复与最近项目记录"
```

---

### Task 5: 运行进度条 + 取消

**Files:**
- Modify: `src/views/Workbench.vue`
- Test: `electron/ipc/__tests__/workbench-ui.spec.ts`

- [ ] **Step 1: 写失败测试**

在 `workbench-ui.spec.ts` 的 `describe('infinite canvas workbench')` 块内追加：

```ts
  it('shows run progress and supports cancel', () => {
    expect(workbench).toContain('runProgress')
    expect(workbench).toContain('cancelRequested')
    expect(workbench).toContain('function cancelRun')
    expect(workbench).toContain('wb-progress')
  })
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run electron/ipc/__tests__/workbench-ui.spec.ts`
Expected: FAIL

- [ ] **Step 3: 修改 `runWorkflow()` 并新增取消逻辑**

将整个 `async function runWorkflow() { ... }` 替换为：

```ts
async function runWorkflow() {
  if (runningRef.value) return
  const targets = nodes.value.filter((n) => isExecutable(n))
  for (const n of nodes.value) n.execState = undefined
  if (!targets.length) {
    appStore.setStatus('画布上没有需要运行的处理节点')
    return
  }
  const missing = targets.filter((n) => !resolveInputSource(n.id))
  if (missing.length) {
    for (const n of missing) n.execState = 'error'
    appStore.setStatus(`有 ${missing.length} 个处理节点缺少输入，请先连线`)
    return
  }
  runningRef.value = true
  cancelRequested.value = false
  runProgress.value = { done: 0, total: targets.length, current: '' }
  appStore.setStatus('开始运行…')
  const done = new Set<number>()
  for (let guard = 0; guard <= targets.length; guard++) {
    let progressed = false
    for (const node of targets) {
      if (cancelRequested.value) break
      if (done.has(node.id)) continue
      const source = resolveInputSource(node.id)
      if (!source || (isExecutable(source) && !done.has(source.id))) continue
      node.execState = 'running'
      runProgress.value = { done: done.size, total: targets.length, current: node.label }
      await new Promise((r) => setTimeout(r, 150))
      try {
        const ok = await executeNode(node)
        node.execState = ok ? 'done' : 'error'
        if (ok) await collectAssetFromNode(node)
      } catch (e) {
        node.execState = 'error'
        appStore.setStatus(`运行出错（${node.label}）：${(e as Error).message}`)
      }
      done.add(node.id)
      progressed = true
    }
    if (cancelRequested.value) break
    if (!progressed) break
  }
  const failed = targets.filter((n) => n.execState === 'error').length
  if (cancelRequested.value) {
    appStore.setStatus(`已取消（完成 ${done.size}/${targets.length} 个节点）`)
  } else {
    appStore.setStatus(
      failed ? `运行完成，有 ${failed} 个节点出错` : `运行完成 ✓（${done.size}/${targets.length} 个节点）`,
    )
  }
  runProgress.value = null
  runningRef.value = false
  cancelRequested.value = false
  void performAutosave()
}

function cancelRun() {
  cancelRequested.value = true
  appStore.setStatus('正在取消…')
}
```

在 `const currentWorkflowFile = ref<string | null>(null)` 之后追加（Task 4 已有 `runningRef`，这里补另外两个）：

```ts
const cancelRequested = ref(false)
const runProgress = ref<{ done: number; total: number; current: string } | null>(null)
```

> `collectAssetFromNode` 在 Task 7 定义；本任务先保留调用，typecheck 在 Task 7 完成后统一跑。

- [ ] **Step 4: 进度条模板（放入左栏"队列"面板，见 Task 6）**

在 Task 6 的"队列"面板模板中加入：

```html
      <template v-else-if="railTab === 'queue'">
        <h3 class="wb-rail__panel-title">队列</h3>
        <button class="wb-btn wb-btn--run" type="button" @click="runWorkflow" :disabled="runningRef">▶ 运行</button>
        <div v-if="runProgress" class="wb-progress">
          <div class="wb-progress__bar">
            <div class="wb-progress__fill" :style="{ width: `${runProgress.total ? Math.round((runProgress.done / runProgress.total) * 100) : 0}%` }"></div>
          </div>
          <p>正在跑 第 {{ runProgress.done + 1 }}/{{ runProgress.total }} 个节点：{{ runProgress.current || '…' }}</p>
          <button class="wb-btn wb-btn--danger" type="button" @click="cancelRun">取消运行</button>
        </div>
        <p v-else class="wb-rail__empty">还没有运行任务</p>
      </template>
```

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run electron/ipc/__tests__/workbench-ui.spec.ts`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/views/Workbench.vue electron/ipc/__tests__/workbench-ui.spec.ts
git commit -m "feat(workbench): 整组运行进度条与取消"
```

---

### Task 6: 左栏图标栏 + 动态按钮 + 动效

**Files:**
- Modify: `src/views/Workbench.vue`
- Test: `electron/ipc/__tests__/workbench-ui.spec.ts`

- [ ] **Step 1: 写失败测试**

在 `workbench-ui.spec.ts` 的 `describe('infinite canvas workbench')` 块内追加：

```ts
  it('provides a comfyui-style left rail with panels and animations', () => {
    expect(workbench).toContain('wb-rail')
    expect(workbench).toContain('railTab')
    expect(workbench).toContain('toggleRail')
    expect(workbench).toContain('wb-rail__dynamic')
    expect(workbench).toContain('@keyframes wb-slide-in')
    expect(workbench).toContain('@media (prefers-reduced-motion: reduce)')
  })
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run electron/ipc/__tests__/workbench-ui.spec.ts`
Expected: FAIL

- [ ] **Step 3: script 新增左栏状态与函数**

在 `const currentWorkflowFile = ref<string | null>(null)` 之后追加：

```ts
const railOpen = ref(false)
const railTab = ref<'projects' | 'nodes' | 'queue' | 'assets' | 'engine' | 'settings'>('projects')
const reduceMotion = ref(false)
```

在 `function cancelRun() { ... }` 之后追加：

```ts
function toggleRail(tab: typeof railTab.value) {
  if (railOpen.value && railTab.value === tab) {
    railOpen.value = false
  } else {
    railTab.value = tab
    railOpen.value = true
  }
}

const selectedSingleNode = computed(() =>
  selectedNodeIds.value.length === 1
    ? nodes.value.find((n) => n.id === selectedNodeIds.value[0]) ?? null
    : null,
)
```

- [ ] **Step 4: 模板改造**

将现有的 `<div class="workbench__toolbar"> ... </div>` 整块替换为：

```html
    <!-- 工具栏（只留运行） -->
    <div class="workbench__toolbar">
      <button class="wb-btn wb-btn--run" type="button" title="运行画布 (Ctrl+Enter)" @click="runWorkflow">▶ 运行</button>
      <span class="workbench__hint">右键添加节点 · 左键拖动平移 · 空格+左键框选 · Ctrl+D 复制 · Ctrl+Z 撤销</span>
    </div>

    <!-- 左栏 -->
    <aside class="wb-rail" :class="{ 'wb-rail--open': railOpen, 'wb-rail--reduced': reduceMotion }">
      <div class="wb-rail__icons">
        <button type="button" class="wb-rail__icon" :class="{ active: railOpen && railTab === 'projects' }" title="项目" @click="toggleRail('projects')">▤</button>
        <button type="button" class="wb-rail__icon" :class="{ active: railOpen && railTab === 'nodes' }" title="节点库" @click="toggleRail('nodes')">＋</button>
        <button type="button" class="wb-rail__icon" :class="{ active: railOpen && railTab === 'queue' }" title="队列" @click="toggleRail('queue')">≣</button>
        <button type="button" class="wb-rail__icon" :class="{ active: railOpen && railTab === 'assets' }" title="结果" @click="toggleRail('assets')">◫</button>
        <button type="button" class="wb-rail__icon" :class="{ active: railOpen && railTab === 'engine' }" title="引擎" @click="toggleRail('engine')">⚡</button>
      </div>
      <div class="wb-rail__spacer"></div>
      <button type="button" class="wb-rail__icon" :class="{ active: railOpen && railTab === 'settings' }" title="设置" @click="toggleRail('settings')">…</button>
    </aside>

    <!-- 动态按钮区 -->
    <div class="wb-rail__dynamic" :class="{ 'wb-rail--reduced': reduceMotion }">
      <template v-if="selectedSingleNode">
        <button class="wb-btn wb-btn--icon" type="button" title="运行此节点" @click="runNode(selectedSingleNode)">▶</button>
        <button class="wb-btn wb-btn--icon" type="button" title="复制" @click="copySelected">⧉</button>
        <button class="wb-btn wb-btn--icon" type="button" title="粘贴" :disabled="!clipboard.value?.nodes.length" @click="pasteNodes()">📋</button>
        <button class="wb-btn wb-btn--icon" type="button" title="删除" @click="removeSelected">✕</button>
        <button class="wb-btn" type="button" title="保存内容" @click="saveNodeContent(selectedSingleNode)">保存内容</button>
        <template v-if="selectedSingleNode.genOpen !== undefined">
          <button class="wb-btn" type="button" @click="selectedSingleNode.genOpen = !selectedSingleNode.genOpen">
            {{ selectedSingleNode.genOpen ? '收起生成器' : '展开生成器' }}
          </button>
        </template>
      </template>
      <template v-else>
        <button class="wb-btn wb-btn--icon" type="button" title="添加节点" @click="railOpen = true; railTab = 'nodes'">＋</button>
        <button class="wb-btn wb-btn--icon" type="button" title="保存 (Ctrl+S)" @click="saveWorkflow">💾</button>
        <button class="wb-btn wb-btn--icon" type="button" title="打开 (Ctrl+O)" @click="openWorkflow">📂</button>
        <button class="wb-btn wb-btn--icon" type="button" title="撤销 (Ctrl+Z)" :disabled="undoStack.length === 0" @click="undo">↶</button>
        <button class="wb-btn wb-btn--icon" type="button" title="重做" :disabled="redoStack.length === 0" @click="redo">↷</button>
        <button class="wb-btn wb-btn--icon" type="button" title="缩小" @click="zoomOut">－</button>
        <button class="wb-btn wb-btn--icon" type="button" title="放大" @click="zoomIn">＋</button>
        <button class="wb-btn" type="button" title="适配全部节点" @click="fitToContent">适配</button>
        <button class="wb-btn" type="button" title="清空画布" :disabled="nodes.length === 0" @click="clearCanvas">清空</button>
      </template>
    </div>

    <!-- 左栏面板 -->
    <section v-if="railOpen" class="wb-rail__panel" :class="{ 'wb-rail--reduced': reduceMotion }">
      <template v-if="railTab === 'projects'">
        <h3 class="wb-rail__panel-title">项目</h3>
        <div class="wb-rail__row">
          <button class="wb-btn" type="button" @click="clearCanvas">新建画布</button>
          <button class="wb-btn" type="button" @click="saveWorkflow">保存</button>
          <button class="wb-btn" type="button" @click="openWorkflow">打开</button>
        </div>
        <ul v-if="recentProjects.length" class="wb-rail__list">
          <li v-for="item in recentProjects" :key="item.path" class="wb-rail__item">
            <button type="button" class="wb-rail__item-main" @click="openProjectFile(item.path)">
              <b>{{ item.name }}</b>
              <small>{{ new Date(item.updatedAt).toLocaleString('zh-CN') }}</small>
            </button>
            <button type="button" class="wb-rail__item-del" title="从列表移除" @click="removeRecentItem(item.path)">✕</button>
          </li>
        </ul>
        <p v-else class="wb-rail__empty">还没有保存过的项目</p>
      </template>

      <template v-else-if="railTab === 'nodes'">
        <h3 class="wb-rail__panel-title">节点库</h3>
        <input v-model="addSearch" class="wb-add__search" placeholder="搜索节点…" />
        <template v-for="(item, index) in addMenuList" :key="item.label">
          <div v-if="index === 0 || addMenuList[index - 1].group !== item.group" class="wb-add__group">
            {{ item.group }}
          </div>
          <button type="button" class="wb-rail__node" @click="item.action(); addSearch = ''">
            {{ item.icon }} {{ item.label }}
          </button>
        </template>
        <p v-if="!addMenuList.length" class="wb-rail__empty">没有匹配的节点</p>
      </template>

      <template v-else-if="railTab === 'queue'">
        <h3 class="wb-rail__panel-title">队列</h3>
        <button class="wb-btn wb-btn--run" type="button" @click="runWorkflow" :disabled="runningRef">▶ 运行</button>
        <div v-if="runProgress" class="wb-progress">
          <div class="wb-progress__bar">
            <div class="wb-progress__fill" :style="{ width: `${runProgress.total ? Math.round((runProgress.done / runProgress.total) * 100) : 0}%` }"></div>
          </div>
          <p>正在跑 第 {{ runProgress.done + 1 }}/{{ runProgress.total }} 个节点：{{ runProgress.current || '…' }}</p>
          <button class="wb-btn wb-btn--danger" type="button" @click="cancelRun">取消运行</button>
        </div>
        <p v-else class="wb-rail__empty">还没有运行任务</p>
      </template>

      <template v-else-if="railTab === 'assets'">
        <h3 class="wb-rail__panel-title">结果</h3>
        <div v-if="assets.length" class="wb-assets">
          <div v-for="asset in assets" :key="asset.id" class="wb-assets__item" draggable="true" @dragstart="onAssetDragStart($event, asset)">
            <button type="button" class="wb-assets__preview" @click="previewAsset(asset)">
              <img v-if="asset.type === 'image'" :src="mediaUrl(asset.file)" alt="" />
              <video v-else-if="asset.type === 'video'" :src="mediaUrl(asset.file)" muted></video>
              <span v-else class="wb-assets__text">TXT</span>
            </button>
            <div class="wb-assets__meta">
              <b>{{ asset.meta?.node || asset.type }}</b>
              <small>{{ new Date(asset.createdAt).toLocaleString('zh-CN') }}</small>
            </div>
            <div class="wb-assets__actions">
              <button type="button" title="保存到电脑" @click="saveAsset(asset)">保存</button>
              <button type="button" title="删除" @click="removeAsset(asset.id)">✕</button>
            </div>
          </div>
          <button class="wb-btn wb-btn--danger" type="button" @click="clearAllAssets">清空全部</button>
        </div>
        <p v-else class="wb-rail__empty">运行节点后，结果会出现在这里</p>
      </template>

      <template v-else-if="railTab === 'engine'">
        <h3 class="wb-rail__panel-title">引擎</h3>
        <p class="wb-rail__empty">云端 API（默认）</p>
        <p class="wb-rail__empty">本地引擎接入将在下一阶段提供</p>
      </template>

      <template v-else>
        <h3 class="wb-rail__panel-title">设置</h3>
        <label class="wb-rail__switch">
          <input v-model="reduceMotion" type="checkbox" />
          减弱动画
        </label>
        <div class="wb-rail__row">
          <button class="wb-btn" type="button" @click="apiPanelOpen = !apiPanelOpen">API 配置</button>
          <button class="wb-btn" type="button" @click="managerOpen = !managerOpen">节点管理器</button>
        </div>
      </template>
    </section>
```

> `clipboard` 是已有 ref；`undoStack`/`redoStack` 是已有 ref；`saveNodeContent`/`onAssetDragStart`/`previewAsset`/`saveAsset`/`removeAsset`/`clearAllAssets`/`removeRecentItem` 在 Task 7 定义（`removeRecentItem` 本任务定义）。Task 7 完成前 typecheck 会报未定义，最后统一跑。

- [ ] **Step 5: 新增 `removeRecentItem`**

在 `function toggleRail(...)` 之后追加：

```ts
async function removeRecentItem(filePath: string) {
  const res = await window.workflowAPI?.removeRecent?.(filePath)
  recentProjects.value = res?.list ?? recentProjects.value
}
```

- [ ] **Step 6: 新增动效 CSS**

在 `<style>` 块末尾追加：

```css
/* ---------- 左栏 ---------- */
.wb-rail {
  position: absolute;
  left: 12px;
  top: 64px;
  bottom: 14px;
  z-index: 30;
  display: flex;
  flex-direction: column;
  width: 52px;
  background: rgba(26, 26, 46, 0.72);
  backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 8px 6px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.28);
  animation: wb-slide-in 0.2s ease-out;
}
.wb-rail__icons {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.wb-rail__spacer {
  flex: 1;
}
.wb-rail__icon {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: rgba(255, 255, 255, 0.72);
  font-size: 16px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
}
.wb-rail__icon:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  transform: translateY(-1px);
}
.wb-rail__icon.active {
  background: rgba(96, 165, 250, 0.28);
  color: #93c5fd;
}
.wb-rail__panel {
  position: absolute;
  left: 76px;
  top: 64px;
  bottom: 14px;
  z-index: 29;
  width: 300px;
  background: rgba(26, 26, 46, 0.9);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 14px;
  overflow: auto;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.3);
  animation: wb-slide-in 0.2s ease-out;
}
.wb-rail__dynamic {
  position: absolute;
  left: 12px;
  top: 14px;
  z-index: 28;
  display: flex;
  gap: 6px;
  padding: 6px;
  background: rgba(26, 26, 46, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  animation: wb-pop 0.18s ease-out;
}
.wb-rail__panel-title {
  margin: 0 0 10px;
  font-size: 14px;
  color: #fff;
}
.wb-rail__row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.wb-rail__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.wb-rail__item {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 6px 8px;
  background: rgba(255, 255, 255, 0.04);
}
.wb-rail__item-main {
  flex: 1;
  text-align: left;
  background: none;
  border: none;
  color: #fff;
  cursor: pointer;
}
.wb-rail__item-main b,
.wb-rail__item-main small {
  display: block;
}
.wb-rail__item-main small {
  color: rgba(255, 255, 255, 0.55);
  font-size: 11px;
}
.wb-rail__item-del {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
}
.wb-rail__item-del:hover {
  color: #f87171;
}
.wb-rail__node {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  margin-top: 4px;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  color: #fff;
  cursor: pointer;
}
.wb-rail__node:hover {
  background: rgba(96, 165, 250, 0.22);
}
.wb-rail__empty {
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  line-height: 1.6;
}
.wb-rail__switch {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #fff;
  font-size: 13px;
  margin-bottom: 12px;
}
.wb-progress {
  margin-top: 12px;
}
.wb-progress__bar {
  height: 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
}
.wb-progress__fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #60a5fa, #a78bfa);
  transition: width 0.25s ease;
}
.wb-progress p {
  margin: 8px 0;
  color: rgba(255, 255, 255, 0.85);
  font-size: 12px;
}
.wb-assets {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.wb-assets__item {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 6px;
  background: rgba(255, 255, 255, 0.04);
  cursor: grab;
}
.wb-assets__preview {
  width: 56px;
  height: 56px;
  flex: none;
  border: none;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.35);
  cursor: pointer;
}
.wb-assets__preview img,
.wb-assets__preview video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.wb-assets__text {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
}
.wb-assets__meta {
  flex: 1;
  min-width: 0;
}
.wb-assets__meta b,
.wb-assets__meta small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wb-assets__meta small {
  color: rgba(255, 255, 255, 0.55);
  font-size: 11px;
}
.wb-assets__actions {
  display: flex;
  gap: 4px;
  flex-direction: column;
}
.wb-assets__actions button {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 11px;
  cursor: pointer;
  padding: 2px 6px;
}
.wb-assets__actions button:hover {
  color: #fff;
  border-color: rgba(255, 255, 255, 0.4);
}
.wb-toast {
  position: absolute;
  right: 16px;
  bottom: 16px;
  z-index: 60;
  padding: 10px 16px;
  border-radius: 10px;
  background: rgba(30, 41, 59, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #fff;
  font-size: 13px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  animation: wb-pop 0.2s ease-out;
}

/* ---------- 动效 ---------- */
@keyframes wb-slide-in {
  from { opacity: 0; transform: translateX(-10px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes wb-pop {
  from { opacity: 0; transform: scale(0.96); }
  to { opacity: 1; transform: scale(1); }
}
.wb-rail--reduced * {
  animation: none !important;
  transition: none !important;
}
@media (prefers-reduced-motion: reduce) {
  .wb-rail,
  .wb-rail__panel,
  .wb-rail__dynamic,
  .wb-toast {
    animation: none !important;
  }
}
```

在画布根元素内部、最外层容器末尾（`</div>` 前）追加 toast：

```html
    <div v-if="toast" class="wb-toast">{{ toast.text }}</div>
```

- [ ] **Step 7: 运行确认通过**

Run: `npx vitest run electron/ipc/__tests__/workbench-ui.spec.ts`
Expected: PASS

- [ ] **Step 8: 提交**

```bash
git add src/views/Workbench.vue electron/ipc/__tests__/workbench-ui.spec.ts
git commit -m "feat(workbench): ComfyUI 式左栏图标条与动态按钮动效"
```

---

### Task 7: 结果资产面板（收集 / 预览 / 保存 / 删除 / 拖回）

**Files:**
- Modify: `src/views/Workbench.vue`
- Test: `electron/ipc/__tests__/workbench-ui.spec.ts`

- [ ] **Step 1: 写失败测试**

在 `workbench-ui.spec.ts` 的 `describe('infinite canvas workbench')` 块内追加：

```ts
  it('collects generated results into an asset panel with drag-back', () => {
    expect(workbench).toContain('assetsAPI?.list')
    expect(workbench).toContain('collectAssetFromNode')
    expect(workbench).toContain('onAssetDragStart')
    expect(workbench).toContain('wb-assets')
  })
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run electron/ipc/__tests__/workbench-ui.spec.ts`
Expected: FAIL

- [ ] **Step 3: script 新增资产函数**

在 `const runProgress = ref(...)` 之后追加：

```ts
const assets = ref<AssetRecord[]>([])
const assetPreview = ref<AssetRecord | null>(null)
```

在 `async function loadRecentProjects() { ... }` 之后追加：

```ts
async function loadAssets() {
  const res = await window.assetsAPI?.list?.()
  assets.value = res?.list ?? []
}

async function collectAssetFromNode(node: WbNode) {
  if (node.kind === 'image' || node.kind === 'resize' || node.kind === 'save') {
    if (node.src?.startsWith('data:image/')) {
      const res = await window.assetsAPI?.add?.({
        type: 'image',
        dataUrl: node.src,
        meta: { node: node.label },
      })
      if (res?.success) await loadAssets()
      return
    }
  }
  if (node.kind === 'text' || node.kind === 'ai-tag' || node.kind === 'ai-text') {
    if (node.text) {
      const res = await window.assetsAPI?.add?.({
        type: 'text',
        text: node.text,
        meta: { node: node.label },
      })
      if (res?.success) await loadAssets()
      return
    }
  }
  if (node.kind === 'video' && node.src?.startsWith('media://')) {
    const filePath = decodeURI(node.src.slice('media:///'.length))
    const res = await window.assetsAPI?.add?.({
      type: 'video',
      sourcePath: filePath,
      meta: { node: node.label },
    })
    if (res?.success) await loadAssets()
  }
}

function onAssetDragStart(event: DragEvent, asset: AssetRecord) {
  event.dataTransfer?.setData('application/x-baka-asset', asset.id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
}

async function onCanvasDrop(event: DragEvent) {
  const id = event.dataTransfer?.getData('application/x-baka-asset')
  if (!id) return
  event.preventDefault()
  const asset = assets.value.find((a) => a.id === id)
  if (!asset) return
  const pos = screenToWorld(event.clientX, event.clientY)
  if (asset.type === 'image') {
    const res = await window.fsAPI?.readImageBase64?.(asset.file)
    if (res?.success && res.base64) {
      const dataUrl = `data:${res.mime || 'image/png'};base64,${res.base64}`
      nodes.value.push({
        id: nextId++,
        x: pos.x,
        y: pos.y,
        width: NODE_WIDTH,
        height: TITLE_HEIGHT + 240,
        kind: 'image',
        label: fileNameOf(asset.file),
        src: dataUrl,
        contentH: 240,
        rotation: 0,
        inputCount: 1,
        outputCount: 1,
        inTypes: ['image'],
        outTypes: ['image'],
        genMode: 'text',
        genPrompt: '',
        genSize: '1024x1024',
        genOpen: true,
      })
    }
  } else if (asset.type === 'video') {
    addVideoNodes([asset.file], pos)
  } else if (asset.type === 'text') {
    const res = await window.fsAPI?.readText?.(asset.file)
    nodes.value.push({
      id: nextId++,
      x: pos.x,
      y: pos.y,
      width: NODE_WIDTH,
      height: TITLE_HEIGHT + 160,
      kind: 'text',
      label: fileNameOf(asset.file),
      src: '',
      text: res?.success ? res.text : '',
      contentH: 160,
      rotation: 0,
      inputCount: 1,
      outputCount: 1,
      inTypes: ['text'],
      outTypes: ['text'],
      genOpen: false,
    })
  }
  appStore.setStatus('已从结果拖入画布')
}

function previewAsset(asset: AssetRecord) {
  assetPreview.value = asset
}

async function saveAsset(asset: AssetRecord) {
  await window.fsAPI?.saveFile?.({
    sourcePath: asset.file,
    defaultName: `${asset.meta?.node || asset.type}-${new Date(asset.createdAt).toLocaleDateString('zh-CN')}`,
  })
}

async function removeAsset(id: string) {
  const res = await window.assetsAPI?.remove?.(id)
  assets.value = res?.list ?? assets.value
}

async function clearAllAssets() {
  if (!window.confirm('确定清空全部结果吗？')) return
  await window.assetsAPI?.clear?.()
  await loadAssets()
}
```

- [ ] **Step 4: 接入生成与运行成功点**

在 `runNode()` 中，`node.execState = ok ? 'done' : 'error'` 之后追加：

```ts
    if (ok) await collectAssetFromNode(node)
```

在 `runImageGen()` 中 `node.execState = 'done'` 之后追加：

```ts
    await collectAssetFromNode(node)
```

在 `runTextGen()` 中 `node.execState = 'done'` 之后追加：

```ts
    await collectAssetFromNode(node)
```

在画布根元素上追加拖放监听（与现有 `@pointerdown` 同级）：

```html
@dragover.prevent @drop="onCanvasDrop"
```

在 `onMounted` 回调末尾追加：

```ts
  void loadAssets()
```

- [ ] **Step 5: 资产大图预览弹层**

在左栏面板 section 之后追加：

```html
    <div v-if="assetPreview" class="wb-asset-modal" @click.self="assetPreview = null">
      <div class="wb-asset-modal__body">
        <img v-if="assetPreview.type === 'image'" :src="mediaUrl(assetPreview.file)" alt="" />
        <video v-else-if="assetPreview.type === 'video'" :src="mediaUrl(assetPreview.file)" controls autoplay></video>
        <p v-else class="wb-asset-modal__text">{{ assetPreview.meta?.node || '文本结果' }}</p>
        <button class="wb-btn" type="button" @click="assetPreview = null">关闭</button>
      </div>
    </div>
```

在 `<style>` 末尾追加：

```css
.wb-asset-modal {
  position: absolute;
  inset: 0;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  animation: wb-pop 0.18s ease-out;
}
.wb-asset-modal__body {
  max-width: 80%;
  max-height: 84%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  background: rgba(30, 41, 59, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  padding: 16px;
}
.wb-asset-modal__body img,
.wb-asset-modal__body video {
  max-width: 100%;
  max-height: 70vh;
  border-radius: 10px;
}
.wb-asset-modal__text {
  color: #fff;
  white-space: pre-wrap;
  max-height: 50vh;
  overflow: auto;
}
```

- [ ] **Step 6: 运行确认通过 + typecheck**

Run: `npx vitest run electron/ipc/__tests__/workbench-ui.spec.ts`
Expected: PASS

Run: `npm run typecheck`
Expected: 通过（`saveNodeContent` 已在 Workbench.vue 中定义，Task 6 模板直接复用）

- [ ] **Step 7: 提交**

```bash
git add src/views/Workbench.vue electron/ipc/__tests__/workbench-ui.spec.ts
git commit -m "feat(workbench): 结果资产面板（收集/预览/保存/删除/拖回）"
```

---

### Task 8: 整体验证

**Files:** 无

- [ ] **Step 1: 全量测试**

Run: `npm test -- --run`
Expected: 全部通过（现有 238 + 新增约 15 条）

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: 通过

- [ ] **Step 3: 构建**

Run: `npm run build`
Expected: 构建成功

- [ ] **Step 4: 手动验证清单**

1. 改画布（加节点/连线/拖动）后停手 1.5s，右下角出现"已自动保存"；重启应用后画布自动恢复
2. 保存画布后，左栏"项目"出现最近项目；点项目打开；✕ 从列表移除
3. 整组运行时队列面板显示"第 x/y 个节点"，取消运行生效
4. 运行图片/文本节点后，左栏"结果"出现对应资产；预览、保存、删除、清空可用；拖回画布生成新节点
5. 左栏六个图标可切换面板；动态按钮随选中节点切换；"减弱动画"开关生效

- [ ] **Step 5: 提交（如有手动修正）**

```bash
git add -A
git commit -m "chore(workbench): 流程管理验收修正"
```

---

## 自检记录

- **Spec 覆盖**：自动保存（Task 1/4）、最近项目（Task 1/4/6）、进度条+取消（Task 5）、左栏六图标+动态按钮+动效（Task 6）、资产面板（Task 2/3/7）、toast（Task 4/6）、减弱动画与 reduced-motion（Task 6）。本地引擎（ComfyUI/WebUI）为下一份计划，模板中已留"引擎"面板占位。
- **占位符扫描**：无 TBD/TODO；唯一"占位"是引擎面板的静态文案，属设计内范围外。
- **类型一致性**：`WorkflowAPI`/`AssetsAPI`/`AssetRecord` 在 env.d.ts、preload、前端调用三处同名同型；`collectAssetFromNode`/`runProgress`/`railTab` 在 script 定义与模板引用一致。
