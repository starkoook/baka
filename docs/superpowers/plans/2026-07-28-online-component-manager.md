# Online Training Component Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Baka TOOLS 改成轻量安装程序，并在用户第一次需要训练时，按显卡类型从本地测试源或未来的 HTTPS 源下载、校验、安装和管理训练器组件。

**Architecture:** 新增独立的组件管理层，负责清单、下载、缓存、安全解压、版本切换和回退；运行时管理器只消费“当前可用的 trainer/runtime”，不再负责克隆仓库或依赖 Setup 内置核心。渲染端通过统一 IPC 展示安装引导和组件管理，图库、标注、反推保持完全独立。

**Tech Stack:** Electron 42、Node.js、Vue 3、TypeScript、Vitest、`adm-zip`、FastAPI 训练器桥接、electron-builder/NSIS。

---

## File map

- Create `electron/components/manifest.js`: 严格解析组件清单、版本兼容和组件选择。
- Create `electron/components/download.js`: 本地文件/HTTP Range 下载、`.part` 状态、暂停取消与 SHA-256。
- Create `electron/components/archive.js`: ZIP 路径校验、安全解压、临时目录和原子切换。
- Create `electron/components/cache.js`: 已校验组件包的缓存导入、导出和清理。
- Create `electron/components/manager.js`: 组件安装状态机、版本记录、修复、回退、缓存导入导出。
- Create `electron/ipc/component-manager.js`: 主进程 IPC 与进度事件。
- Create `src/components/training/TrainingEnvironmentSetup.vue`: 首次训练安装引导。
- Create `src/components/training/TrainingComponentsSettings.vue`: 版本、修复、回退、缓存管理。
- Create `scripts/build-local-component-source.js`: 生成与未来 GitHub Releases 同格式的本地测试源。
- Modify `electron/ipc/runtime-manager.js`: 只使用组件管理器返回的活动训练器和 runtime。
- Modify `electron/preload.js`, `electron/ipc/channels.js`, `src/env.d.ts`: 暴露组件管理契约。
- Modify `src/views/Training.vue`, `src/views/TrainingTask.vue`, `src/views/Settings.vue`: 接入安装引导和设置入口。
- Modify `electron-builder.yml`, `scripts/package.js`: 移除内置 trainer-core，生成轻量 Setup。
- Modify `package.json`, `package-lock.json`: 增加 `adm-zip` 直接依赖和本地组件源脚本。

### Task 1: Manifest contract and local source

**Files:**
- Create: `electron/components/manifest.js`
- Create: `electron/components/__tests__/manifest.spec.ts`

- [ ] **Step 1: Write failing manifest tests**

```ts
import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'

const { parseManifest, selectInstallSet } = require(resolve('electron/components/manifest.js'))

describe('component manifest', () => {
  const manifest = {
    formatVersion: 1,
    channel: 'local-test',
    components: {
      trainer: { version: 'v1.6.2', file: 'trainer.zip', size: 10, sha256: 'a'.repeat(64), minimumBaka: '0.2.0' },
      'runtime-standard': { version: 'torch2.10-cu128-v1', file: 'standard.zip', size: 20, sha256: 'b'.repeat(64), trainerRange: '>=v1.6.2 <v2.0.0' },
    },
  }

  it('accepts a valid versioned manifest', () => {
    expect(parseManifest(manifest).channel).toBe('local-test')
  })

  it('rejects traversal and invalid hashes', () => {
    expect(() => parseManifest({ ...manifest, components: { trainer: { ...manifest.components.trainer, file: '../trainer.zip' } } })).toThrow()
  })

  it('selects trainer and the recommended runtime', () => {
    expect(selectInstallSet(parseManifest(manifest), 'standard', '0.2.0').map((item: any) => item.id)).toEqual(['trainer', 'runtime-standard'])
  })
})
```

- [ ] **Step 2: Run the tests and verify the missing module failure**

Run: `npm.cmd test -- electron/components/__tests__/manifest.spec.ts`

Expected: FAIL because `electron/components/manifest.js` does not exist.

- [ ] **Step 3: Implement strict parsing and selection**

```js
const path = require('path')

function assertComponent(id, value) {
  if (!value || typeof value !== 'object') throw new Error(`组件 ${id} 格式错误`)
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(id)) throw new Error(`组件 ID 不合法：${id}`)
  if (!value.version || !value.file || !Number.isFinite(value.size)) throw new Error(`组件 ${id} 缺少版本、文件或大小`)
  if (!/^[a-f0-9]{64}$/i.test(value.sha256 || '')) throw new Error(`组件 ${id} 的 SHA-256 不合法`)
  const normalized = path.posix.normalize(String(value.file).replaceAll('\\', '/'))
  if (normalized.startsWith('../') || path.posix.isAbsolute(normalized)) throw new Error(`组件 ${id} 文件路径越界`)
  return Object.freeze({ id, ...value, file: normalized })
}

function parseManifest(input) {
  if (input?.formatVersion !== 1 || !input.channel || !input.components) throw new Error('组件清单格式不受支持')
  const components = Object.fromEntries(Object.entries(input.components).map(([id, value]) => [id, assertComponent(id, value)]))
  return Object.freeze({ formatVersion: 1, channel: input.channel, components })
}

function versionParts(value) {
  return String(value || '0').replace(/^[^0-9]*/, '').split(/[.+-]/).map(part => Number.parseInt(part, 10) || 0)
}

function compareVersions(left, right) {
  const a = versionParts(left); const b = versionParts(right)
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (a[index] || 0) - (b[index] || 0)
    if (difference) return difference
  }
  return 0
}

function satisfiesRange(version, range = '') {
  return range.split(/\s+/).filter(Boolean).every(rule => {
    const match = rule.match(/^(>=|<=|>|<|=)?(.+)$/); if (!match) return false
    const difference = compareVersions(version, match[2]); const operator = match[1] || '='
    return operator === '>=' ? difference >= 0 : operator === '<=' ? difference <= 0 : operator === '>' ? difference > 0 : operator === '<' ? difference < 0 : difference === 0
  })
}

function selectInstallSet(manifest, runtimeId, bakaVersion) {
  const trainer = manifest.components.trainer
  const runtime = manifest.components[`runtime-${runtimeId}`]
  if (!trainer || !runtime) throw new Error(`清单不包含 ${runtimeId} 训练环境`)
  if (trainer.minimumBaka && compareVersions(bakaVersion, trainer.minimumBaka) < 0) throw new Error(`需要 Baka ${trainer.minimumBaka} 或更高版本`)
  if (runtime.trainerRange && !satisfiesRange(trainer.version, runtime.trainerRange)) throw new Error(`${runtimeId} 与训练器 ${trainer.version} 不兼容`)
  return [trainer, runtime]
}

module.exports = { compareVersions, parseManifest, satisfiesRange, selectInstallSet }
```

- [ ] **Step 4: Run tests**

Run: `npm.cmd test -- electron/components/__tests__/manifest.spec.ts`

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add electron/components/manifest.js electron/components/__tests__/manifest.spec.ts
git commit -m "feat: define training component manifest"
```

### Task 2: Resumable local and HTTP downloads

**Files:**
- Create: `electron/components/download.js`
- Create: `electron/components/__tests__/download.spec.ts`

- [ ] **Step 1: Write failing tests for local resume, checksum and cancellation**

```ts
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'

const { ComponentDownload } = require(resolve('electron/components/download.js'))

it('resumes a local component from an existing part file', async () => {
  const root = mkdtempSync(join(tmpdir(), 'baka-download-'))
  const source = join(root, 'source.zip')
  const target = join(root, 'target.zip')
  writeFileSync(source, Buffer.alloc(1024 * 1024, 7))
  writeFileSync(`${target}.part`, Buffer.alloc(256 * 1024, 7))
  const sha256 = createHash('sha256').update(readFileSync(source)).digest('hex')
  const task = new ComponentDownload({ source, target, size: 1024 * 1024, sha256 })
  const result = await task.start()
  expect(result.resumedFrom).toBe(256 * 1024)
  expect(readFileSync(target)).toEqual(readFileSync(source))
})

it('keeps the part file after cancellation', async () => {
  const root = mkdtempSync(join(tmpdir(), 'baka-cancel-'))
  const target = join(root, 'target.zip')
  let task: any
  const openSource = async () => ({
    resumedFrom: 0,
    total: 4096,
    stream: Readable.from((async function* () {
      for (let index = 0; index < 4; index++) {
        await new Promise(resolve => setTimeout(resolve, 10))
        yield Buffer.alloc(1024, index)
      }
    })()),
  })
  task = new ComponentDownload({
    source: 'fixture://slow', target, size: 4096, sha256: '0'.repeat(64), openSource,
    onProgress: (progress: any) => { if (progress.downloaded >= 1024) task.cancel() },
  })
  expect(await task.start()).toMatchObject({ ok: false, cancelled: true })
  expect(require('node:fs').existsSync(target)).toBe(false)
  expect(require('node:fs').existsSync(`${target}.part`)).toBe(true)
})
```

- [ ] **Step 2: Run and verify failure**

Run: `npm.cmd test -- electron/components/__tests__/download.spec.ts`

Expected: FAIL because `ComponentDownload` is missing.

- [ ] **Step 3: Implement the download state machine**

Implement `ComponentDownload` with these public methods and result shapes:

```js
const crypto = require('crypto')
const fs = require('fs')
const { Readable } = require('stream')

async function sha256File(filePath) {
  const hash = crypto.createHash('sha256')
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk)
  return hash.digest('hex')
}

class ComponentDownload {
  constructor({ source, target, size, sha256, onProgress = () => {}, fetchImpl = fetch, openSource = null }) {
    Object.assign(this, { source, target, size, sha256, onProgress, fetchImpl, openSource })
    this.abortController = null; this.cancelled = false; this.paused = false
  }
  async defaultOpen(existingBytes) {
    if (/^https?:\/\//i.test(this.source)) {
      this.abortController = new AbortController()
      const response = await this.fetchImpl(this.source, { headers: existingBytes ? { Range: `bytes=${existingBytes}-` } : {}, signal: this.abortController.signal })
      if (!response.ok && response.status !== 206) throw new Error(`下载失败：HTTP ${response.status}`)
      const resumedFrom = response.status === 206 ? existingBytes : 0
      return { stream: Readable.fromWeb(response.body), resumedFrom, total: this.size }
    }
    return { stream: fs.createReadStream(this.source, { start: existingBytes }), resumedFrom: existingBytes, total: this.size }
  }
  async start() {
    this.cancelled = false; this.paused = false
    const partPath = `${this.target}.part`
    fs.mkdirSync(require('path').dirname(this.target), { recursive: true })
    const existingBytes = fs.existsSync(partPath) ? fs.statSync(partPath).size : 0
    const opened = this.openSource ? await this.openSource(existingBytes) : await this.defaultOpen(existingBytes)
    if (opened.resumedFrom === 0 && existingBytes) fs.truncateSync(partPath, 0)
    const output = fs.createWriteStream(partPath, { flags: opened.resumedFrom ? 'a' : 'w' })
    const startedAt = Date.now(); let downloaded = opened.resumedFrom
    try {
      for await (const chunk of opened.stream) {
        if (this.cancelled || this.paused) throw new Error('DOWNLOAD_STOPPED')
        if (!output.write(chunk)) await new Promise(resolve => output.once('drain', resolve))
        downloaded += chunk.length
        const seconds = Math.max(0.001, (Date.now() - startedAt) / 1000)
        this.onProgress({ downloaded, total: opened.total, percent: Math.min(100, downloaded / opened.total * 100), bytesPerSecond: (downloaded - opened.resumedFrom) / seconds })
      }
      await new Promise((resolve, reject) => { output.end(resolve); output.on('error', reject) })
    } catch (error) {
      output.destroy()
      if (this.cancelled || this.paused || error.name === 'AbortError' || error.message === 'DOWNLOAD_STOPPED') return { ok: false, cancelled: this.cancelled, paused: this.paused }
      throw error
    }
    const actual = await sha256File(partPath)
    if (actual.toLowerCase() !== this.sha256.toLowerCase()) throw new Error('组件 SHA-256 校验失败')
    fs.renameSync(partPath, this.target)
    return { ok: true, target: this.target, resumedFrom: opened.resumedFrom, sha256: actual }
  }
  pause() { this.paused = true; this.abortController?.abort() }
  cancel() { this.cancelled = true; this.abortController?.abort() }
}

module.exports = { ComponentDownload, sha256File }
```

- [ ] **Step 4: Run tests**

Run: `npm.cmd test -- electron/components/__tests__/download.spec.ts`

Expected: local resume, checksum failure and cancellation tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add electron/components/download.js electron/components/__tests__/download.spec.ts
git commit -m "feat: add resumable component downloads"
```

### Task 3: Safe archive installation and rollback

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `electron/components/archive.js`
- Create: `electron/components/__tests__/archive.spec.ts`

- [ ] **Step 1: Add the direct ZIP dependency**

Run: `npm.cmd install adm-zip@0.5.16 --save`

Expected: `adm-zip` appears under `dependencies`, not only as a transitive dependency.

- [ ] **Step 2: Write failing path traversal and atomic-switch tests**

```ts
import AdmZip from 'adm-zip'
import { mkdtempSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'

const { inspectArchiveEntries, installArchive } = require(resolve('electron/components/archive.js'))

it('rejects a zip entry outside the component root', () => {
  expect(() => inspectArchiveEntries([{ entryName: '../escape.txt', isDirectory: false }])).toThrow('越界')
})

it('keeps the old active version when health check fails', async () => {
  const root = mkdtempSync(join(tmpdir(), 'baka-archive-'))
  const zip = new AdmZip(); zip.addFile('gui.py', Buffer.from('ok')); zip.writeZip(join(root, 'trainer.zip'))
  writeFileSync(join(root, 'active.json'), JSON.stringify({ activeVersion: 'old' }))
  await expect(installArchive({ archivePath: join(root, 'trainer.zip'), versionsRoot: join(root, 'versions'), version: 'new', activePath: join(root, 'active.json'), healthCheck: async () => false })).rejects.toThrow()
  expect(JSON.parse(require('fs').readFileSync(join(root, 'active.json'))).activeVersion).toBe('old')
})
```

- [ ] **Step 3: Implement safe extraction**

```js
function inspectArchiveEntries(entries) {
  for (const entry of entries) {
    const normalized = path.posix.normalize(entry.entryName.replaceAll('\\', '/'))
    if (normalized.startsWith('../') || path.posix.isAbsolute(normalized) || /^[a-z]:/i.test(normalized)) {
      throw new Error(`压缩包包含越界路径：${entry.entryName}`)
    }
  }
}
```

`installArchive` must extract to `<version>.installing`, run `healthCheck(tempRoot)`, rename the temporary directory to the version directory, and atomically replace `active.json`. On any failure it removes only the exact `.installing` directory and leaves the previous active version unchanged.

- [ ] **Step 4: Run tests**

Run: `npm.cmd test -- electron/components/__tests__/archive.spec.ts`

Expected: traversal and failed-health rollback tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add package.json package-lock.json electron/components/archive.js electron/components/__tests__/archive.spec.ts
git commit -m "feat: install component archives safely"
```

### Task 4: Component manager orchestration and migration

**Files:**
- Create: `electron/components/manager.js`
- Create: `electron/components/cache.js`
- Create: `electron/components/__tests__/manager.spec.ts`
- Create: `electron/components/__tests__/cache.spec.ts`
- Modify: `electron/runtime/trainer-distribution.js`

- [ ] **Step 1: Write failing orchestration tests**

```ts
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'

const { TrainingComponentManager } = require(resolve('electron/components/manager.js'))
const fixtureManifest = {
  formatVersion: 1,
  channel: 'test',
  components: {
    trainer: { id: 'trainer', version: 'v1.6.2', file: 'trainer.zip', size: 10, sha256: 'a'.repeat(64) },
    'runtime-standard': { id: 'runtime-standard', version: 'torch2.10-cu128-v1', file: 'runtime.zip', size: 20, sha256: 'b'.repeat(64) },
  },
}

function createFixture(overrides: Record<string, any> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'baka-manager-'))
  const calls: string[] = []
  const manager = new TrainingComponentManager({
    dataRoot: root,
    readManifest: async () => fixtureManifest,
    recommendation: async () => ({ preferred_runtime_id: 'standard' }),
    downloadFactory: (component: any) => ({ start: async () => { calls.push(`download:${component.id}`); return { ok: true, target: `${component.id}.zip` } } }),
    installArchive: async ({ componentId }: any) => { calls.push(`install:${componentId}`); return { path: join(root, componentId) } },
    runtimeHealthCheck: async () => ({ ok: true }),
    diskSpace: async () => ({ free: 1000 }),
    isTrainingActive: () => false,
    bakaVersion: '0.2.0',
    cacheTransfer: { clear: async () => ({ success: true }), export: async () => ({ success: true }), import: async () => ({ success: true }) },
    ...overrides,
  })
  return { root, calls, manager }
}

it('installs trainer before runtime and persists four versions', async () => {
  const { root, calls, manager } = createFixture()
  await manager.install('standard')
  expect(calls).toEqual(['download:trainer', 'install:trainer', 'download:runtime-standard', 'install:runtime-standard'])
  expect(JSON.parse(readFileSync(join(root, 'component-state.json'), 'utf8')).versions).toEqual({ baka: '0.2.0', trainer: 'v1.6.2', schema: 'v1.6.2', runtime: 'torch2.10-cu128-v1' })
})

it('does not redownload an installed matching component', async () => {
  const { calls, manager } = createFixture({ installedVersions: { trainer: 'v1.6.2', 'runtime-standard': 'torch2.10-cu128-v1' } })
  await manager.install('standard')
  expect(calls).toEqual([])
})

it('blocks before download when disk space is insufficient', async () => {
  const { calls, manager } = createFixture({ diskSpace: async () => ({ free: 15 }) })
  await expect(manager.install('standard')).rejects.toThrow('磁盘空间不足')
  expect(calls).toEqual([])
})

it('migrates an existing managed trainer without deleting it', async () => {
  const { root, manager } = createFixture()
  const legacy = join(root, 'trainer', 'versions', 'v1.6.2')
  mkdirSync(legacy, { recursive: true }); writeFileSync(join(legacy, 'gui.py'), '')
  writeFileSync(join(root, 'trainer', 'active.json'), JSON.stringify({ activeVersion: 'v1.6.2' }))
  await manager.migrateExisting()
  expect(existsSync(join(legacy, 'gui.py'))).toBe(true)
  expect((await manager.inspect()).installed.trainer.version).toBe('v1.6.2')
})

it('blocks mutations while training is active', async () => {
  const { manager } = createFixture({ isTrainingActive: () => true })
  await expect(manager.install('standard')).rejects.toThrow('训练正在运行')
  await expect(manager.repair('trainer')).rejects.toThrow('训练正在运行')
  await expect(manager.rollback('trainer')).rejects.toThrow('训练正在运行')
  await expect(manager.clearCache()).rejects.toThrow('训练正在运行')
})

it('rolls back trainer and runtime independently', async () => {
  const { manager } = createFixture()
  manager.state.installed = { trainer: { version: 'v1.6.2' }, 'runtime-standard': { version: 'runtime-v2' } }
  manager.state.previous = { trainer: { version: 'v1.6.1' }, 'runtime-standard': { version: 'runtime-v1' } }
  manager.writeState()
  await manager.rollback('trainer')
  expect((await manager.inspect()).installed.trainer.version).toBe('v1.6.1')
  expect((await manager.inspect()).installed['runtime-standard'].version).toBe('runtime-v2')
  await manager.rollback('runtime-standard')
  expect((await manager.inspect()).installed['runtime-standard'].version).toBe('runtime-v1')
})
```

Add `electron/components/__tests__/cache.spec.ts`:

```ts
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'

const { exportComponentCache, importComponentCache } = require(resolve('electron/components/cache.js'))

it('exports and imports only verified selected component packages', async () => {
  const root = mkdtempSync(join(tmpdir(), 'baka-cache-')); const packages = join(root, 'packages'); const portable = join(root, 'portable'); const imported = join(root, 'imported')
  require('node:fs').mkdirSync(packages); const bytes = Buffer.from('trainer archive'); writeFileSync(join(packages, 'trainer.zip'), bytes)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const manifest = { formatVersion: 1, channel: 'test', components: { trainer: { id: 'trainer', version: 'v1', file: 'trainer.zip', size: bytes.length, sha256 } } }
  expect(await exportComponentCache({ manifest, componentIds: ['trainer'], packageRoot: packages, destination: portable })).toMatchObject({ success: true, count: 1 })
  expect(await importComponentCache({ source: portable, packageRoot: imported })).toMatchObject({ success: true, count: 1 })
  expect(readFileSync(join(imported, 'trainer.zip'))).toEqual(bytes)
})

it('rejects a modified portable cache', async () => {
  const root = mkdtempSync(join(tmpdir(), 'baka-cache-bad-')); writeFileSync(join(root, 'trainer.zip'), 'changed')
  writeFileSync(join(root, 'manifest.json'), JSON.stringify({ formatVersion: 1, channel: 'portable-cache', components: { trainer: { version: 'v1', file: 'trainer.zip', size: 7, sha256: 'a'.repeat(64) } } }))
  await expect(importComponentCache({ source: root, packageRoot: join(root, 'imported') })).rejects.toThrow('校验失败')
})
```

Use injected `downloadFactory`, `installArchive`, `runtimeHealthCheck`, and `isTrainingActive` dependencies so tests do not access the network or GPU.

- [ ] **Step 2: Run and verify failure**

Run: `npm.cmd test -- electron/components/__tests__/manager.spec.ts`

Expected: FAIL because `TrainingComponentManager` is missing.

- [ ] **Step 3: Implement the manager API**

```js
const fs = require('fs')
const path = require('path')
const { selectInstallSet } = require('./manifest')
const { getInstalledTrainer } = require('../runtime/trainer-distribution')

class TrainingComponentManager {
  constructor(options) {
    Object.assign(this, options)
    this.statePath = path.join(options.dataRoot, 'component-state.json')
    this.state = this.readState()
    this.state.versions.baka = options.bakaVersion
    for (const [id, version] of Object.entries(options.installedVersions || {})) this.state.installed[id] = { version }
    this.operation = 'idle'
    this.currentDownload = null
  }
  readState() {
    try { return JSON.parse(fs.readFileSync(this.statePath, 'utf8')) }
    catch { return { active: {}, previous: {}, versions: {}, installed: {} } }
  }
  writeState() {
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true })
    const temporary = `${this.statePath}.tmp`
    fs.writeFileSync(temporary, JSON.stringify(this.state, null, 2))
    fs.renameSync(temporary, this.statePath)
  }
  guardMutation() {
    if (this.isTrainingActive()) throw new Error('训练正在运行，暂时不能修改训练组件')
  }
  async inspect() {
    const manifest = await this.readManifest()
    return { manifest, installed: this.state.installed, versions: this.state.versions, operation: this.operation, recommendation: await this.recommendation() }
  }
  async migrateExisting() {
    const existing = getInstalledTrainer(this.dataRoot)
    if (existing && !this.state.installed.trainer) {
      this.state.installed.trainer = { version: existing.version, path: existing.path }
      this.state.versions.trainer = existing.version; this.state.versions.schema = existing.version
      this.writeState()
    }
    return this.inspect()
  }
  async install(runtimeId) {
    this.guardMutation(); this.lastRuntimeId = runtimeId
    const manifest = await this.readManifest()
    const components = selectInstallSet(manifest, runtimeId, this.bakaVersion)
    const requiredBytes = components.filter(component => this.state.installed[component.id]?.version !== component.version).reduce((sum, component) => sum + component.size, 0)
    const disk = await this.diskSpace(this.dataRoot)
    if (disk.free < requiredBytes * 1.15) throw new Error(`磁盘空间不足：至少还需要 ${Math.ceil(requiredBytes * 1.15 - disk.free)} 字节`)
    for (const component of components) {
      if (this.state.installed[component.id]?.version === component.version) continue
      this.operation = 'downloading'
      this.currentDownload = this.downloadFactory(component)
      const download = await this.currentDownload.start()
      if (!download.ok) return download
      this.operation = 'installing'
      const installed = await this.installArchive({ componentId: component.id, version: component.version, archivePath: download.target })
      this.state.previous[component.id] = this.state.installed[component.id] || null
      this.state.installed[component.id] = { version: component.version, path: installed.path }
      this.state.versions[component.id === 'trainer' ? 'trainer' : 'runtime'] = component.version
      if (component.id === 'trainer') this.state.versions.schema = component.version
      this.writeState()
    }
    const health = await this.runtimeHealthCheck(runtimeId)
    if (!health.ok) throw new Error(health.error || '训练环境健康检查失败')
    this.operation = 'ready'; return { success: true, runtimeId }
  }
  pause() { this.currentDownload?.pause(); this.operation = 'paused'; return { success: true } }
  resume() { if (!this.currentDownload) return { success: false, error: '没有可继续的下载' }; return this.currentDownload.start() }
  cancel() { this.currentDownload?.cancel(); this.operation = 'idle'; return { success: true } }
  async repair(componentId) {
    this.guardMutation(); delete this.state.installed[componentId]; this.writeState()
    return this.install(this.lastRuntimeId || componentId.replace(/^runtime-/, ''))
  }
  async rollback(componentId) {
    this.guardMutation()
    const previous = this.state.previous[componentId]
    if (!previous) throw new Error('没有可回退的组件版本')
    const current = this.state.installed[componentId]
    this.state.installed[componentId] = previous; this.state.previous[componentId] = current
    this.writeState(); return { success: true, componentId, version: previous.version }
  }
  async clearCache() {
    this.guardMutation(); return this.cacheTransfer.clear(path.join(this.dataRoot, 'cache', 'packages'))
  }
  async exportCache(destination) { this.guardMutation(); return this.cacheTransfer.export(destination, this.state.installed) }
  async importCache(source) { this.guardMutation(); return this.cacheTransfer.import(source) }
  getState() { return { operation: this.operation, installed: this.state.installed } }
}

module.exports = { TrainingComponentManager }
```

Implement `electron/components/cache.js` with streaming verification. The exported cache contains only the selected manifest and already downloaded component archives:

```js
const fs = require('fs')
const path = require('path')
const { parseManifest } = require('./manifest')
const { sha256File } = require('./download')

async function exportComponentCache({ manifest, componentIds, packageRoot, destination }) {
  fs.mkdirSync(destination, { recursive: true })
  const components = {}
  for (const id of componentIds) {
    const component = manifest.components[id]; if (!component) throw new Error(`组件不存在：${id}`)
    const source = path.join(packageRoot, component.file); const actual = await sha256File(source)
    if (actual !== component.sha256) throw new Error(`缓存组件校验失败：${id}`)
    fs.copyFileSync(source, path.join(destination, path.basename(component.file))); components[id] = { ...component, file: path.basename(component.file) }
  }
  fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify({ formatVersion: 1, channel: 'portable-cache', components }, null, 2))
  return { success: true, count: componentIds.length }
}

async function importComponentCache({ source, packageRoot }) {
  const manifest = parseManifest(JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8')))
  fs.mkdirSync(packageRoot, { recursive: true })
  for (const component of Object.values(manifest.components)) {
    const input = path.join(source, component.file); const actual = await sha256File(input)
    if (actual !== component.sha256) throw new Error(`导入缓存校验失败：${component.id}`)
    fs.copyFileSync(input, path.join(packageRoot, component.file))
  }
  return { success: true, count: Object.keys(manifest.components).length, manifest }
}

module.exports = { exportComponentCache, importComponentCache }
```

Persist state to `component-state.json` with `active`, `previous`, `downloads`, and four-part `versions`. Keep existing `trainer/versions` compatible with `trainer-distribution.js`; add runtime versions under `runtimes/<runtimeId>/<version>`.

- [ ] **Step 4: Run manager and existing trainer distribution tests**

Run: `npm.cmd test -- electron/components/__tests__/manager.spec.ts electron/components/__tests__/cache.spec.ts electron/ipc/__tests__/trainer-distribution.spec.ts`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add electron/components/manager.js electron/components/cache.js electron/components/__tests__/manager.spec.ts electron/components/__tests__/cache.spec.ts electron/runtime/trainer-distribution.js
git commit -m "feat: orchestrate training components"
```

### Task 5: IPC contract and progress events

**Files:**
- Create: `electron/ipc/component-manager.js`
- Modify: `electron/main.js`
- Modify: `electron/preload.js`
- Modify: `electron/ipc/channels.js`
- Modify: `src/env.d.ts`
- Create: `electron/ipc/__tests__/component-manager-ipc.spec.ts`

- [ ] **Step 1: Write the contract test**

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

it('exposes every training component operation through IPC', () => {
  const combined = [
    'electron/preload.js', 'electron/ipc/channels.js', 'electron/ipc/component-manager.js',
  ].map(file => readFileSync(resolve(file), 'utf8')).join('\n')
  for (const channel of [
    'components:inspect', 'components:setSource', 'components:install', 'components:pause',
    'components:resume', 'components:cancel', 'components:repair', 'components:rollback',
    'components:clearCache', 'components:exportCache', 'components:importCache',
    'components:progress', 'components:stateChange',
  ]) expect(combined).toContain(channel)
  expect(readFileSync(resolve('electron/preload.js'), 'utf8')).toContain("exposeInMainWorld('trainingComponentsAPI'")
})
```

- [ ] **Step 2: Run the IPC contract and verify failure**

Run: `npm.cmd test -- electron/ipc/__tests__/component-manager-ipc.spec.ts`

Expected: missing component channels.

- [ ] **Step 3: Register handlers and typed preload API**

Expose this renderer contract:

```ts
interface TrainingComponentsAPI {
  inspect(): Promise<ComponentInspection>
  setSource(source: { type: 'local' | 'https'; location: string }): Promise<{ success: boolean; error?: string }>
  install(runtimeId: string): Promise<ComponentOperationResult>
  pause(): Promise<ComponentOperationResult>
  resume(): Promise<ComponentOperationResult>
  cancel(): Promise<ComponentOperationResult>
  repair(componentId: string): Promise<ComponentOperationResult>
  rollback(componentId: string): Promise<ComponentOperationResult>
  clearCache(): Promise<ComponentOperationResult>
  exportCache(destination: string): Promise<ComponentOperationResult>
  importCache(source: string): Promise<ComponentOperationResult>
  onProgress(callback: (progress: ComponentProgress) => void): () => void
  onStateChange(callback: (state: ComponentState) => void): () => void
}
```

- [ ] **Step 4: Run IPC and type checks**

Run: `npm.cmd test -- electron/ipc/__tests__/component-manager-ipc.spec.ts`

Run: `npm.cmd run check:ipc`

Run: `npm.cmd run typecheck`

Expected: tests PASS and contract/actual IPC counts match.

- [ ] **Step 5: Commit**

```powershell
git add electron/ipc/component-manager.js electron/main.js electron/preload.js electron/ipc/channels.js src/env.d.ts electron/ipc/__tests__/component-manager-ipc.spec.ts
git commit -m "feat: expose training component IPC"
```

### Task 6: First-use installation UI

**Files:**
- Create: `src/components/training/TrainingEnvironmentSetup.vue`
- Modify: `src/views/Training.vue`
- Modify: `src/views/TrainingTask.vue`
- Create: `electron/ipc/__tests__/component-setup-ui.spec.ts`

- [ ] **Step 1: Write UI source-contract tests**

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

it('shows a complete first-use component installer before backend launch', () => {
  const setup = readFileSync(resolve('src/components/training/TrainingEnvironmentSetup.vue'), 'utf8')
  for (const token of ['recommendedRuntime', 'downloadBytes', 'requiredDiskBytes', 'sourceLabel', 'trainingComponentsAPI.install', 'trainingComponentsAPI.pause', 'trainingComponentsAPI.resume', 'trainingComponentsAPI.cancel', 'bytesPerSecond', 'etaSeconds', 'repair']) expect(setup).toContain(token)
  for (const view of ['src/views/Training.vue', 'src/views/TrainingTask.vue']) {
    const source = readFileSync(resolve(view), 'utf8')
    expect(source).toContain('TrainingEnvironmentSetup')
    expect(source).toContain('inspection.ready')
  }
})
```

Assert `Training.vue` and `TrainingTask.vue` render the setup component when `inspection.ready === false`, and do not launch the backend first.

- [ ] **Step 2: Run and verify failure**

Run: `npm.cmd test -- electron/ipc/__tests__/component-setup-ui.spec.ts`

Expected: setup component is missing.

- [ ] **Step 3: Implement the setup component**

UI states:

```text
checking: “正在检查训练组件…”
offer: recommendation + download size + disk use + install location + source
downloading: component label + total percent + bytes + speed + ETA + pause/cancel
paused: continue/cancel
verifying/installing: non-destructive progress and cancel only where safe
failed: readable reason + continue/retry/repair
ready: emit('ready') and return to existing training UI
```

Do not show stack traces. Convert bytes, speed and ETA through small pure helpers in the component or `src/features/training/component-progress.ts` with unit tests.

- [ ] **Step 4: Run UI and type tests**

Run: `npm.cmd test -- electron/ipc/__tests__/component-setup-ui.spec.ts`

Run: `npm.cmd run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/components/training/TrainingEnvironmentSetup.vue src/features/training/component-progress.ts src/features/training/__tests__/component-progress.spec.ts src/views/Training.vue src/views/TrainingTask.vue electron/ipc/__tests__/component-setup-ui.spec.ts
git commit -m "feat: guide first training component install"
```

### Task 7: Component settings, cache import and export

**Files:**
- Create: `src/components/training/TrainingComponentsSettings.vue`
- Modify: `src/views/Settings.vue`
- Create: `electron/ipc/__tests__/component-settings-ui.spec.ts`

- [ ] **Step 1: Write UI contract tests**

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

it('manages versions, repairs and portable caches from settings', () => {
  const source = readFileSync(resolve('src/components/training/TrainingComponentsSettings.vue'), 'utf8')
  for (const token of ['versions.baka', 'versions.trainer', 'versions.schema', 'versions.runtime', 'source.type', 'repair', 'rollback', 'cacheSize', 'clearCache', 'exportCache', 'importCache', 'confirm(']) expect(source).toContain(token)
  expect(source).toContain("operation !== 'idle'")
  expect(readFileSync(resolve('src/views/Settings.vue'), 'utf8')).toContain('TrainingComponentsSettings')
})
```

- [ ] **Step 2: Run and verify failure**

Run: `npm.cmd test -- electron/ipc/__tests__/component-settings-ui.spec.ts`

Expected: component settings UI is missing.

- [ ] **Step 3: Implement the settings panel**

Use `window.trainingComponentsAPI.inspect()` as the single data source. Folder selection uses existing `window.fsAPI.selectFolder()`. Export/import buttons must display the selected destination/source, result count and compatibility error; they must never delete models or gallery data.

- [ ] **Step 4: Run tests**

Run: `npm.cmd test -- electron/ipc/__tests__/component-settings-ui.spec.ts`

Run: `npm.cmd run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/components/training/TrainingComponentsSettings.vue src/views/Settings.vue electron/ipc/__tests__/component-settings-ui.spec.ts
git commit -m "feat: manage training components in settings"
```

### Task 8: Runtime manager consumes installed components only

**Files:**
- Modify: `electron/ipc/runtime-manager.js`
- Modify: `electron/ipc/__tests__/runtime-manager.spec.ts`
- Modify: `electron/runtime/repo-selector.js`

- [ ] **Step 1: Replace the packaged-core expectation test**

Use these exact assertions for packaged code:

```ts
expect(source).not.toContain("path.join(process.resourcesPath, 'trainer-core')")
expect(source).not.toContain("git', ['clone'")
expect(source).toContain('getActiveTrainerPath')
expect(source).toContain('getActiveRuntime')
```

Keep a separate assertion that `LOCAL_REFERENCE_REPO` is allowed only under `!app.isPackaged`.

- [ ] **Step 2: Run and verify failure**

Run: `npm.cmd test -- electron/ipc/__tests__/runtime-manager.spec.ts`

Expected: FAIL because packaged-core and clone fallbacks still exist.

- [ ] **Step 3: Remove production fallbacks**

`getRepoRoot()` must return, in order: developer configured path only when not packaged; active managed trainer; local development reference only when not packaged. If no component is active, return an empty path and let the setup UI handle installation.

`launchGUI()` must use the runtime component's `pythonPath` and environment variables. Remove `runtime:autoClone`; keep a compatibility handler returning a readable “请使用训练组件安装” response until renderer references are removed.

- [ ] **Step 4: Run runtime and training route tests**

Run: `npm.cmd test -- electron/ipc/__tests__/runtime-manager.spec.ts electron/ipc/__tests__/training-route.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add electron/ipc/runtime-manager.js electron/ipc/__tests__/runtime-manager.spec.ts electron/runtime/repo-selector.js
git commit -m "refactor: launch only managed training components"
```

### Task 9: Build the local test component source

**Files:**
- Create: `scripts/build-local-component-source.js`
- Create: `electron/ipc/__tests__/local-component-source.spec.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the packaging test**

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

it('builds deterministic trainer and optional runtime component archives', () => {
  const source = readFileSync(resolve('scripts/build-local-component-source.js'), 'utf8')
  for (const token of ['BAKA_TRAINER_SOURCE', 'BAKA_RUNTIME_SOURCE', "'trainer-'", "'runtime-standard-'", 'sha256', 'size', '--include-runtime']) expect(source).toContain(token)
  for (const excluded of ['models', 'dataset', 'output', 'cache', 'logs', 'python.broken']) expect(source).toContain(`'${excluded}'`)
})
```

- [ ] **Step 2: Run and verify failure**

Run: `npm.cmd test -- electron/ipc/__tests__/local-component-source.spec.ts`

Expected: local source builder is missing.

- [ ] **Step 3: Implement deterministic local source generation**

Add scripts:

```json
{
  "components:build-local": "node scripts/build-local-component-source.js",
  "components:build-local:runtime": "node scripts/build-local-component-source.js --include-runtime standard"
}
```

Output to `release/component-source/`. Use `adm-zip` with normalized forward-slash entry names and sorted inputs. Generate the manifest only after each ZIP checksum and size have been computed.

- [ ] **Step 4: Build a trainer-only local source and test it**

Run: `npm.cmd run components:build-local`

Expected: `release/component-source/manifest.json` and a trainer ZIP exist; no runtime ZIP exists.

Run: `npm.cmd test -- electron/ipc/__tests__/local-component-source.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add scripts/build-local-component-source.js package.json electron/ipc/__tests__/local-component-source.spec.ts
git commit -m "build: create local training component source"
```

### Task 10: Produce the lightweight Setup

**Files:**
- Modify: `electron-builder.yml`
- Modify: `scripts/package.js`
- Modify: `scripts/create-release-manifest.js`
- Modify: `scripts/package-offline.js`
- Modify: `electron/ipc/__tests__/packaging.spec.ts`

- [ ] **Step 1: Change packaging tests first**

```ts
expect(config).not.toContain('.cache/trainer-core')
expect(config).not.toContain('to: trainer-core')
expect(packageScript).not.toContain('prepare-trainer-core.js')
expect(packageScript).toContain('components:build-local')
expect(offlineScript).toContain('deprecated')
```

- [ ] **Step 2: Run and verify failure**

Run: `npm.cmd test -- electron/ipc/__tests__/packaging.spec.ts`

Expected: FAIL while Setup still bundles trainer-core.

- [ ] **Step 3: Remove training payloads from Setup**

Delete the trainer-core `extraResources` entry. Keep `launcher_bridge.py` in `app.asar`, because it is a Baka-side bridge, not a training payload. `scripts/package.js` must run Vite and electron-builder without preparing trainer core. Build the trainer-only local test source as a separate artifact after Setup.

Change `package:offline` to print a deprecation message and point to cache export/import instead of generating a monolithic ZIP. Do not delete an existing release ZIP automatically; remove it manually only after confirming the new test-source flow.

- [ ] **Step 4: Build and inspect the lightweight installer**

Run: `npm.cmd run package`

Expected:

```text
release/Baka-TOOLS-Setup.exe exists
release/win-unpacked/resources/trainer-core does not exist
release/win-unpacked/resources/app.asar exists
```

Record the new size and assert it is at least 80 MB smaller than 228,350,992 bytes.

- [ ] **Step 5: Commit**

```powershell
git add electron-builder.yml scripts/package.js scripts/create-release-manifest.js scripts/package-offline.js electron/ipc/__tests__/packaging.spec.ts
git commit -m "build: ship lightweight Baka installer"
```

### Task 11: End-to-end local-source acceptance

**Files:**
- Create: `docs/acceptance/online-components-local-test.md`
- Modify tests only if acceptance reveals a reproducible defect.

- [ ] **Step 1: Run all automated checks**

Run:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run check:ipc
npm.cmd run build
```

Expected: all tests, type checking, IPC contract and Vite build PASS.

- [ ] **Step 2: Verify no eager training payload or request**

Install the new Setup into a temporary directory. Start Baka with a temporary `--user-data-dir`, open Dashboard/Gallery/Tagger/Reverse, and verify no trainer/runtime directory exists and no component download starts before entering Training.

- [ ] **Step 3: Exercise local test source failures**

Using copies of `release/component-source`:

```text
normal source: install and launch succeeds
interrupted source: cancel at 20%, restart, resumes above 20%
bad hash source: fails verification, old active version remains
truncated ZIP: fails extraction, temporary directory removed
insufficient-space injection: blocks before download
incompatible manifest: blocks with minimum Baka/trainer reason
```

- [ ] **Step 4: Exercise upgrade, rollback and cache transfer**

Create a second local manifest version. Verify trainer/runtime update independently, block switching during a running task, roll back both components, export the selected cache, and import it into a clean temporary user-data directory without network access.

- [ ] **Step 5: Write the acceptance record**

Record exact installer size/SHA-256, manifest version, component ZIP hashes, test counts, IPC counts, installation paths and each injected-failure result in `docs/acceptance/online-components-local-test.md`. Explicitly state that no public upload occurred.

- [ ] **Step 6: Final commit**

```powershell
git add docs/acceptance/online-components-local-test.md
git commit -m "test: record local component acceptance"
```

## Final verification

Run:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run check:ipc
git diff --check
```

The work is complete only when the lightweight Setup contains no trainer/runtime payload, local-source installation and recovery scenarios pass, and Gallery/Tagger/Reverse remain usable with no training components installed.
