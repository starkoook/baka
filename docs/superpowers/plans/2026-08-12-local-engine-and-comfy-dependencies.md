# Local Engine and Comfy Dependencies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guide users through configuring a local ComfyUI or WebUI/Forge installation, run AI image edits through that engine, and manage missing ComfyUI workflow nodes safely.

**Architecture:** Store validated engine profiles in the Electron data root, isolate ComfyUI and WebUI HTTP adapters, and keep Git/dependency operations behind a path-constrained main-process service. Renderer components consume typed IPC only: a setup wizard creates profiles, a dependency notice opens a manager panel, and the AI image edit node chooses cloud or local execution.

**Tech Stack:** Electron 42 CommonJS, Node fetch/FormData/child_process, Vue 3, TypeScript 6, Pinia, Vitest.

---

## File map

- Create `electron/ipc/local-engine/profiles.js` — profile persistence and install-root validation.
- Create `electron/ipc/local-engine/comfy.js` — ComfyUI health, models, object info, upload, prompt, history, result retrieval.
- Create `electron/ipc/local-engine/webui.js` — WebUI/Forge health, models, and img2img.
- Create `electron/ipc/local-engine/dependencies.js` — missing-node resolution and official-map caching.
- Create `electron/ipc/local-engine/git-install.js` — path-safe clone, fast-forward update, and requirements install.
- Create `electron/ipc/local-engines.js` — IPC orchestration and progress events.
- Create tests under `electron/ipc/__tests__/local-engine-*.spec.ts`.
- Modify `electron/main.js`, `electron/preload.js`, `electron/ipc/channels.js`, `src/env.d.ts` — expose the typed API.
- Create `src/components/workbench/LocalEngineSetup.vue` — first-use wizard.
- Create `src/components/workbench/ComfyDependencyNotice.vue` — persistent top-right notice.
- Create `src/components/workbench/ComfyDependencyManager.vue` — dependency control panel.
- Modify `src/stores/workbench.ts`, `src/components/sidebar/AppSidebar.vue`, `src/views/Workbench.vue` — panel state and local execution.
- Modify `electron/ipc/__tests__/workbench-ui.spec.ts` — structural acceptance.

### Task 1: Persist and validate local engine profiles

**Files:**
- Create: `electron/ipc/local-engine/profiles.js`
- Create: `electron/ipc/__tests__/local-engine-profiles.spec.ts`

- [ ] **Step 1: Write failing profile tests**

```ts
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { detectEngineRoot, loadProfiles, saveProfile } from '../local-engine/profiles.js'

describe('local engine profiles', () => {
  it('detects a portable ComfyUI installation and derives managed paths', () => {
    const root = mkdtempSync(join(tmpdir(), 'baka-comfy-'))
    mkdirSync(join(root, 'ComfyUI', 'custom_nodes'), { recursive: true })
    mkdirSync(join(root, 'ComfyUI', 'models'), { recursive: true })
    mkdirSync(join(root, 'ComfyUI', 'output'), { recursive: true })
    mkdirSync(join(root, 'python_embeded'), { recursive: true })
    writeFileSync(join(root, 'ComfyUI', 'main.py'), '')
    writeFileSync(join(root, 'python_embeded', 'python.exe'), '')

    expect(detectEngineRoot(root, 'comfy')).toMatchObject({
      valid: true,
      root,
      customNodesDir: join(root, 'ComfyUI', 'custom_nodes'),
      pythonPath: join(root, 'python_embeded', 'python.exe'),
    })
  })

  it('round-trips profiles in an injected data root', () => {
    const dataRoot = mkdtempSync(join(tmpdir(), 'baka-profile-'))
    saveProfile(dataRoot, { id: 'local-comfy', type: 'comfy', name: '本机 ComfyUI', root: 'D:/ComfyUI', baseUrl: 'http://127.0.0.1:8188' })
    expect(loadProfiles(dataRoot)).toEqual([expect.objectContaining({ id: 'local-comfy', type: 'comfy' })])
  })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm.cmd test -- electron/ipc/__tests__/local-engine-profiles.spec.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement profile validation and atomic persistence**

`detectEngineRoot()` must recognize both a direct ComfyUI root (`main.py`) and a portable parent (`ComfyUI/main.py` plus `python_embeded/python.exe`). For WebUI/Forge, require one of `webui-user.bat`, `webui.bat`, or `launch.py`; derive `extensions`, `models`, and `outputs` only when they remain under the selected root.

Use this implementation shape (retain project-standard Chinese error strings):

```js
const fs = require('fs')
const path = require('path')

function profileFile(dataRoot) { return path.join(dataRoot, 'engines', 'profiles.json') }

function loadProfiles(dataRoot) {
  const file = profileFile(dataRoot)
  if (!fs.existsSync(file)) return []
  const value = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!Array.isArray(value)) throw new Error('本地引擎档案格式无效')
  return value
}

function writeProfiles(dataRoot, profiles) {
  const file = profileFile(dataRoot)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temp = `${file}.tmp`
  fs.writeFileSync(temp, JSON.stringify(profiles, null, 2), 'utf8')
  fs.renameSync(temp, file)
}

function saveProfile(dataRoot, profile) {
  const profiles = loadProfiles(dataRoot).filter(item => item.id !== profile.id)
  writeProfiles(dataRoot, [...profiles, profile])
  return profile
}

function removeProfile(dataRoot, id) {
  writeProfiles(dataRoot, loadProfiles(dataRoot).filter(item => item.id !== id))
}

function firstExisting(candidates) { return candidates.find(candidate => fs.existsSync(candidate)) || '' }

function detectEngineRoot(root, type) {
  const resolved = path.resolve(String(root || ''))
  if (type === 'comfy') {
    const engineRoot = fs.existsSync(path.join(resolved, 'main.py'))
      ? resolved
      : fs.existsSync(path.join(resolved, 'ComfyUI', 'main.py')) ? path.join(resolved, 'ComfyUI') : ''
    if (!engineRoot) return { valid: false, error: '所选目录不是 ComfyUI 安装目录' }
    const pythonPath = firstExisting([
      path.join(resolved, 'python_embeded', 'python.exe'),
      path.join(engineRoot, 'venv', 'Scripts', 'python.exe'),
    ])
    if (!pythonPath) return { valid: false, error: '没有找到 ComfyUI 使用的 Python' }
    return {
      valid: true, type, root: resolved, engineRoot, pythonPath,
      mainPath: path.join(engineRoot, 'main.py'),
      customNodesDir: path.join(engineRoot, 'custom_nodes'),
      modelsDir: path.join(engineRoot, 'models'),
      outputDir: path.join(engineRoot, 'output'),
      baseUrl: 'http://127.0.0.1:8188',
    }
  }
  const entryPath = firstExisting([
    path.join(resolved, 'webui-user.bat'), path.join(resolved, 'webui.bat'), path.join(resolved, 'launch.py'),
  ])
  if (!entryPath) return { valid: false, error: '所选目录不是 WebUI 或 Forge 安装目录' }
  return {
    valid: true, type, root: resolved, engineRoot: resolved, entryPath,
    pythonPath: firstExisting([path.join(resolved, 'venv', 'Scripts', 'python.exe'), path.join(resolved, 'system', 'python', 'python.exe')]),
    extensionsDir: path.join(resolved, 'extensions'),
    modelsDir: path.join(resolved, 'models'),
    outputDir: path.join(resolved, 'outputs'),
    baseUrl: 'http://127.0.0.1:7860',
  }
}

function detectLocalEngines(savedProfiles = []) {
  const common = ['C:\\ComfyUI', 'D:\\ComfyUI', 'C:\\stable-diffusion-webui', 'D:\\stable-diffusion-webui', 'C:\\Forge', 'D:\\Forge']
  const candidates = [...savedProfiles.map(profile => profile.root), ...common].filter(Boolean)
  const seen = new Set()
  const results = []
  for (const root of candidates) {
    const resolved = path.resolve(root)
    if (seen.has(resolved) || !fs.existsSync(resolved)) continue
    seen.add(resolved)
    for (const type of ['comfy', 'webui']) {
      const result = detectEngineRoot(resolved, type)
      if (result.valid) results.push(result)
    }
  }
  return results
}

module.exports = { loadProfiles, saveProfile, removeProfile, detectEngineRoot, detectLocalEngines }
```

The IPC orchestrator separately health-checks `http://127.0.0.1:8188` and `http://127.0.0.1:7860`, then combines live results with `detectLocalEngines()`. Do not recursively scan entire drives.

- [ ] **Step 4: Verify GREEN**

Run: `npm.cmd test -- electron/ipc/__tests__/local-engine-profiles.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/local-engine/profiles.js electron/ipc/__tests__/local-engine-profiles.spec.ts
git commit -m "feat(engine): persist validated local profiles"
```

### Task 2: Implement ComfyUI and WebUI HTTP adapters

**Files:**
- Create: `electron/ipc/local-engine/comfy.js`
- Create: `electron/ipc/local-engine/webui.js`
- Create: `electron/ipc/__tests__/local-engine-adapters.spec.ts`

- [ ] **Step 1: Write failing adapter tests**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getComfyObjectInfo, listComfyModels } from '../local-engine/comfy.js'
import { editWithWebUI, listWebUIModels } from '../local-engine/webui.js'

beforeEach(() => vi.restoreAllMocks())

describe('local engine adapters', () => {
  it('reads ComfyUI node types and checkpoint choices', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({
      CheckpointLoaderSimple: { input: { required: { ckpt_name: [['anime.safetensors']] } } },
      LoadImage: { input: { required: {} } },
    }) })))
    const info = await getComfyObjectInfo('http://127.0.0.1:8188')
    expect(Object.keys(info)).toContain('LoadImage')
    expect(await listComfyModels('http://127.0.0.1:8188')).toEqual(['anime.safetensors'])
  })

  it('uses WebUI img2img and returns a data URL', async () => {
    const fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/sd-models') ? [{ title: 'anime' }] : { images: ['QUJD'] } }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await listWebUIModels('http://127.0.0.1:7860')).toEqual(['anime'])
    expect(await editWithWebUI({ baseUrl: 'http://127.0.0.1:7860', imageBase64: 'QUJD', prompt: '夜景', width: 512, height: 512 })).toEqual('data:image/png;base64,QUJD')
  })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm.cmd test -- electron/ipc/__tests__/local-engine-adapters.spec.ts`

Expected: FAIL because adapter modules do not exist.

- [ ] **Step 3: Implement WebUI/Forge adapter**

Export `healthWebUI`, `listWebUIModels`, and `editWithWebUI`. Normalize trailing slashes and call:

```js
async function editWithWebUI({ baseUrl, imageBase64, prompt, negativePrompt = '', model, width, height }) {
  if (model) await request(baseUrl, '/sdapi/v1/options', { method: 'POST', body: JSON.stringify({ sd_model_checkpoint: model }) })
  const data = await request(baseUrl, '/sdapi/v1/img2img', { method: 'POST', body: JSON.stringify({
    init_images: [imageBase64], prompt, negative_prompt: negativePrompt,
    width: Number(width) || 1024, height: Number(height) || 1024, denoising_strength: 0.65,
  }) })
  if (!data.images?.[0]) throw new Error('WebUI 没有返回图片')
  return `data:image/png;base64,${data.images[0]}`
}
```

- [ ] **Step 4: Implement ComfyUI adapter**

Export `healthComfy`, `getComfyObjectInfo`, `listComfyModels`, and `editWithComfy`. `editWithComfy` must:

1. Upload the source to `/upload/image` with `FormData`.
2. Submit a minimal img2img prompt using only built-in node types (`CheckpointLoaderSimple`, `LoadImage`, `CLIPTextEncode`, `VAEEncode`, `KSampler`, `VAEDecode`, `SaveImage`).
3. Poll `/history/{prompt_id}` until output or timeout.
4. Fetch the first image through `/view` and return a data URL.

Keep prompt construction in exported `buildComfyImg2ImgPrompt(params)` so tests can assert node names and connections without running ComfyUI.

- [ ] **Step 5: Add prompt-shape assertions and verify GREEN**

Add:

```ts
const prompt = buildComfyImg2ImgPrompt({ imageName: 'baka-input.png', model: 'anime.safetensors', prompt: '夜景', negativePrompt: '', seed: 1, steps: 20, cfg: 7 })
expect(Object.values(prompt).map((node: any) => node.class_type)).toEqual(expect.arrayContaining(['LoadImage', 'KSampler', 'SaveImage']))
```

Run: `npm.cmd test -- electron/ipc/__tests__/local-engine-adapters.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add electron/ipc/local-engine/comfy.js electron/ipc/local-engine/webui.js electron/ipc/__tests__/local-engine-adapters.spec.ts
git commit -m "feat(engine): add comfy and webui image adapters"
```

### Task 3: Expose local-engine orchestration through IPC

**Files:**
- Create: `electron/ipc/local-engines.js`
- Create: `electron/ipc/__tests__/local-engine-ipc.spec.ts`
- Modify: `electron/main.js`
- Modify: `electron/preload.js`
- Modify: `electron/ipc/channels.js`
- Modify: `src/env.d.ts`

- [ ] **Step 1: Write failing IPC wiring tests**

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')

describe('local engine IPC', () => {
  it('registers profile, health, model, start, and edit channels', () => {
    const service = read('electron/ipc/local-engines.js')
    const preload = read('electron/preload.js')
    expect(service).toContain("ipcMain.handle('localEngine:listProfiles'")
    expect(service).toContain("ipcMain.handle('localEngine:validateRoot'")
    expect(service).toContain("ipcMain.handle('localEngine:start'")
    expect(service).toContain("ipcMain.handle('localEngine:editImage'")
    expect(preload).toContain("exposeInMainWorld('localEngineAPI'")
  })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm.cmd test -- electron/ipc/__tests__/local-engine-ipc.spec.ts`

Expected: FAIL because the service is absent.

- [ ] **Step 3: Implement orchestration and controlled startup**

Expose handlers for `detect`, `listProfiles`, `validateRoot`, `saveProfile`, `removeProfile`, `health`, `listModels`, `objectInfo`, `start`, and `editImage`. Choose the adapter by saved profile type. The `detect` handler combines `detectLocalEngines()` directory results with live default-port health checks from the adapters.

Use `spawn(profile.pythonPath, [profile.mainPath, '--listen', '127.0.0.1', '--port', port], { cwd: profile.engineRoot, windowsHide: true, detached: false })` for direct ComfyUI roots; use a validated batch entry via `spawn(entryPath, [], { cwd: profile.root, shell: true, windowsHide: true })` for WebUI/Forge. Never accept an arbitrary startup command from the renderer.

Poll health for up to 60 seconds and emit `localEngine:progress` stages (`starting`, `waiting`, `ready`, `error`).

- [ ] **Step 4: Add preload and types**

Define `LocalEngineProfile`, `LocalEngineHealth`, `LocalEngineAPI`, and progress payload types in `src/env.d.ts`. The renderer API must take profile ids for start/edit operations; it must not send writable plugin/Python paths back to the main process.

- [ ] **Step 5: Verify IPC and type checks**

Run: `npm.cmd test -- electron/ipc/__tests__/local-engine-ipc.spec.ts electron/ipc/__tests__/local-engine-profiles.spec.ts electron/ipc/__tests__/local-engine-adapters.spec.ts`

Run: `npm.cmd run check:ipc`

Run: `npm.cmd run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add electron/ipc/local-engines.js electron/ipc/__tests__/local-engine-ipc.spec.ts electron/main.js electron/preload.js electron/ipc/channels.js src/env.d.ts
git commit -m "feat(engine): expose local engine profiles and execution"
```

### Task 4: Build missing-node resolution and cache

**Files:**
- Create: `electron/ipc/local-engine/dependencies.js`
- Create: `electron/ipc/__tests__/comfy-dependencies.spec.ts`

- [ ] **Step 1: Write failing resolver tests**

```ts
import { describe, expect, it } from 'vitest'
import { buildNodeIndex, resolveMissingNodes } from '../local-engine/dependencies.js'

describe('Comfy dependency resolution', () => {
  const index = buildNodeIndex({
    'https://github.com/acme/pack-a': [['FancyNode'], { title_aux: 'Pack A' }],
    'https://github.com/acme/pack-b': [['FancyNode', 'OtherNode'], { title_aux: 'Pack B' }],
  }, [{ id: 'exact-pack', title: 'Exact Pack', reference: 'https://github.com/owner/exact' }])

  it('prefers an embedded repository hint', () => {
    expect(resolveMissingNodes(['FancyNode'], [], [{ nodeType: 'FancyNode', repository: 'https://github.com/owner/exact' }], index)[0]).toMatchObject({ status: 'missing', candidates: [{ repository: 'https://github.com/owner/exact', exact: true }] })
  })

  it('resolves a registry id before falling back to node-name candidates', () => {
    expect(resolveMissingNodes(['FancyNode'], [], [{ nodeType: 'FancyNode', registryId: 'exact-pack' }], index)[0]).toMatchObject({
      status: 'missing', candidates: [{ repository: 'https://github.com/owner/exact', exact: true }],
    })
  })

  it('keeps ambiguous and unknown matches explicit', () => {
    expect(resolveMissingNodes(['FancyNode', 'UnknownNode'], [], [], index)).toEqual([
      expect.objectContaining({ nodeType: 'FancyNode', status: 'ambiguous' }),
      expect.objectContaining({ nodeType: 'UnknownNode', status: 'unknown' }),
    ])
  })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm.cmd test -- electron/ipc/__tests__/comfy-dependencies.spec.ts`

Expected: FAIL because the resolver is absent.

- [ ] **Step 3: Implement resolver and official-map cache**

Use these official ComfyUI-Manager data sources:

```text
https://raw.githubusercontent.com/Comfy-Org/ComfyUI-Manager/main/extension-node-map.json
https://raw.githubusercontent.com/Comfy-Org/ComfyUI-Manager/main/custom-node-list.json
```

Cache both validated JSON documents under the engine data directory as `extension-node-map.json` and `custom-node-list.json`, with a shared refresh timestamp. Refresh after 24 hours when the manager opens; on network failure use the last valid cache. Build the node-name index from `extension-node-map.json` and the registry-id index from each `custom_nodes[].id` plus its `reference`/GitHub `files` entry.

`resolveMissingNodes(required, installed, hints, index)` must return one record per required node with `installed`, `missing`, `ambiguous`, or `unknown`. Core node types present in `/object_info` are `installed`; never label a node missing solely because it is absent from the remote index.

- [ ] **Step 4: Verify GREEN**

Run: `npm.cmd test -- electron/ipc/__tests__/comfy-dependencies.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/local-engine/dependencies.js electron/ipc/__tests__/comfy-dependencies.spec.ts
git commit -m "feat(comfy): resolve missing workflow nodes"
```

### Task 5: Add path-safe Git and requirements operations

**Files:**
- Create: `electron/ipc/local-engine/git-install.js`
- Create: `electron/ipc/__tests__/comfy-git-install.spec.ts`
- Modify: `electron/ipc/local-engines.js`
- Modify: `electron/main.js`
- Modify: `electron/preload.js`
- Modify: `electron/ipc/channels.js`
- Modify: `src/env.d.ts`

- [ ] **Step 1: Write failing security and command-plan tests**

```ts
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { assertPluginTarget, buildClonePlan, buildRequirementsPlan } from '../local-engine/git-install.js'

describe('Comfy Git install safety', () => {
  it('allows only a direct child of custom_nodes', () => {
    const root = 'D:/ComfyUI/custom_nodes'
    const target = join(root, 'ComfyUI-Test')
    expect(assertPluginTarget(root, target)).toBe(target)
    expect(() => assertPluginTarget(root, 'D:/ComfyUI/output')).toThrow('安装目录越界')
    expect(() => assertPluginTarget(root, join(root, '..', 'models'))).toThrow('安装目录越界')
  })

  it('builds argument arrays instead of shell strings', () => {
    const target = 'D:/ComfyUI/custom_nodes/ComfyUI-Test'
    expect(buildClonePlan('https://github.com/acme/ComfyUI-Test', target)).toEqual({ file: 'git', args: ['clone', '--', 'https://github.com/acme/ComfyUI-Test', target] })
    expect(buildRequirementsPlan('D:/python.exe', 'D:/ComfyUI/custom_nodes/ComfyUI-Test/requirements.txt').args).toEqual(['-m', 'pip', 'install', '-r', 'D:/ComfyUI/custom_nodes/ComfyUI-Test/requirements.txt'])
  })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm.cmd test -- electron/ipc/__tests__/comfy-git-install.spec.ts`

Expected: FAIL because the module is absent.

- [ ] **Step 3: Implement clone/update/requirements services**

Accept GitHub HTTPS repository URLs only. Derive the destination directory from the repository basename after removing `.git` and unsafe characters. Use `execFile`/`spawn` with argument arrays. For an existing destination:

- verify `.git` exists;
- verify `remote.origin.url` normalizes to the requested repository;
- reject a non-clean `git status --porcelain`;
- run `git pull --ff-only`.

After clone/update, return `{ requirementsPath, requiresRestart: true }`. Do not run `install.py`. `installRequirements(profileId, repository)` must look up the saved profile server-side and use only its verified `pythonPath`.

- [ ] **Step 4: Add IPC handlers and progress events**

Expose `resolveDependencies`, `refreshDependencyMap`, `installRepository`, `updateRepository`, and `installRequirements`. Emit structured progress with repository, stage, message, and success/error. Do not expose arbitrary command execution.

Add `shellAPI.openExternal(url)` through a main-process `shell:openExternal` handler for the manager's “打开项目” action. Validate with `new URL(url)` and allow only `https:` before calling Electron `shell.openExternal`; reject all other schemes.

- [ ] **Step 5: Verify GREEN and IPC checks**

Run: `npm.cmd test -- electron/ipc/__tests__/comfy-git-install.spec.ts electron/ipc/__tests__/comfy-dependencies.spec.ts electron/ipc/__tests__/local-engine-ipc.spec.ts`

Run: `npm.cmd run check:ipc`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add electron/ipc/local-engine/git-install.js electron/ipc/__tests__/comfy-git-install.spec.ts electron/ipc/local-engines.js electron/main.js electron/preload.js src/env.d.ts electron/ipc/channels.js
git commit -m "feat(comfy): install missing nodes safely"
```

### Task 6: Add the local-engine setup wizard

**Files:**
- Create: `src/components/workbench/LocalEngineSetup.vue`
- Modify: `src/stores/workbench.ts`
- Modify: `src/components/sidebar/AppSidebar.vue`
- Modify: `src/views/Workbench.vue`
- Modify: `electron/ipc/__tests__/workbench-ui.spec.ts`

- [ ] **Step 1: Add failing UI acceptance tests**

```ts
it('guides first-time local engine setup without blocking cloud users', () => {
  const wizard = read('src/components/workbench/LocalEngineSetup.vue')
  expect(wizard).toContain('选择本地引擎')
  expect(wizard).toContain('ComfyUI')
  expect(wizard).toContain('WebUI / Forge')
  expect(wizard).toContain('自动检测')
  expect(wizard).toContain('选择安装目录')
  expect(workbench).toContain('LocalEngineSetup')
  expect(workbench).not.toContain('本地引擎接入将在下一阶段提供')
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm.cmd test -- electron/ipc/__tests__/workbench-ui.spec.ts`

Expected: FAIL because the wizard is absent and the placeholder remains.

- [ ] **Step 3: Implement the wizard state machine**

The component owns only view state: `choose-type → detecting → confirm-detected` or `choose-folder → validating → saved`. Emit `saved(profile)` and `close`. Call `window.localEngineAPI` for validation/save; use `window.fsAPI.selectFolder()` for manual selection.

Show derived paths read-only before save. Surface exact validation errors. Do not allow manual editing of Python/plugin paths in the first-use wizard.

- [ ] **Step 4: Integrate engine panel state**

Add `'engine' | 'dependencies'` to `WorkbenchRailTab`. Add the engine entry to `AppSidebar.vue`. Replace the settings placeholder with saved profiles, health, start, configure, and remove actions. Open the wizard only when the user selects local execution without a saved profile or attempts dependency installation without a local ComfyUI profile.

- [ ] **Step 5: Verify UI and types**

Run: `npm.cmd test -- electron/ipc/__tests__/workbench-ui.spec.ts src/components/sidebar/__tests__/AppSidebar.spec.ts`

Run: `npm.cmd run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/workbench/LocalEngineSetup.vue src/stores/workbench.ts src/components/sidebar/AppSidebar.vue src/views/Workbench.vue electron/ipc/__tests__/workbench-ui.spec.ts src/components/sidebar/__tests__/AppSidebar.spec.ts
git commit -m "feat(workbench): guide local engine setup"
```

### Task 7: Add dependency notice and manager UI

**Files:**
- Create: `src/components/workbench/ComfyDependencyNotice.vue`
- Create: `src/components/workbench/ComfyDependencyManager.vue`
- Modify: `src/views/Workbench.vue`
- Modify: `electron/ipc/__tests__/workbench-ui.spec.ts`

- [ ] **Step 1: Add failing dependency UI tests**

```ts
it('links a top-right missing-node notice to the dependency manager', () => {
  const notice = read('src/components/workbench/ComfyDependencyNotice.vue')
  const manager = read('src/components/workbench/ComfyDependencyManager.vue')
  expect(notice).toContain('查看依赖')
  expect(manager).toContain('Git 拉取')
  expect(manager).toContain('安装依赖')
  expect(manager).toContain('来源未知')
  expect(manager).toContain('可能来源')
  expect(workbench).toContain('ComfyDependencyNotice')
  expect(workbench).toContain('ComfyDependencyManager')
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm.cmd test -- electron/ipc/__tests__/workbench-ui.spec.ts`

Expected: FAIL because both components are absent.

- [ ] **Step 3: Implement `ComfyDependencyNotice.vue`**

Render a persistent top-right card only for a selected/imported image with Comfy workflow node types. With no Comfy profile, label it `图片含 ComfyUI 工作流 · 配置本地引擎`; with missing nodes, label it `检测到 N 个缺失节点 · 查看依赖`. Emit one `open` event.

- [ ] **Step 4: Implement `ComfyDependencyManager.vue`**

Group records by installed, actionable missing, ambiguous, unknown, pending restart, and dependency required. Only unique GitHub candidates get a direct `Git 拉取` action. Ambiguous rows require selecting one repository first. Unknown rows provide `复制名称`; normal webpages provide `打开项目` only.

After Git completes, show `requirements.txt` as a separate confirmed action. Display progress per repository and keep failures retryable. Add a `重新检查` action that refreshes `/object_info` after ComfyUI restarts.

- [ ] **Step 5: Connect current-image metadata to the resolver**

In `Workbench.vue`, when the active image node changes or a new metadata image is dropped, call `resolveDependencies(profileId, metadata.nodeTypes, metadata.sourceHints)`. Store results by image node id so clicking the notice opens the exact record set. Clear only records for deleted nodes.

- [ ] **Step 6: Verify UI, types, and focused backend tests**

Run: `npm.cmd test -- electron/ipc/__tests__/workbench-ui.spec.ts electron/ipc/__tests__/comfy-dependencies.spec.ts electron/ipc/__tests__/comfy-git-install.spec.ts`

Run: `npm.cmd run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/workbench/ComfyDependencyNotice.vue src/components/workbench/ComfyDependencyManager.vue src/views/Workbench.vue electron/ipc/__tests__/workbench-ui.spec.ts
git commit -m "feat(workbench): manage missing ComfyUI nodes"
```

### Task 8: Route AI image editing through local engines

**Files:**
- Modify: `src/components/workbench/AiImageEditNode.vue`
- Modify: `src/views/Workbench.vue`
- Modify: `src/env.d.ts`
- Modify: `electron/ipc/__tests__/workbench-ui.spec.ts`

- [ ] **Step 1: Add failing engine-selection acceptance tests**

```ts
it('lets AI image editing choose cloud, ComfyUI, or WebUI/Forge', () => {
  const editNode = read('src/components/workbench/AiImageEditNode.vue')
  expect(editNode).toContain('云端 API')
  expect(editNode).toContain('ComfyUI')
  expect(editNode).toContain('WebUI / Forge')
  expect(workbench).toContain('localEngineAPI.editImage')
  expect(workbench).toContain('llmAPI?.image')
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm.cmd test -- electron/ipc/__tests__/workbench-ui.spec.ts`

Expected: FAIL because the edit node currently has only cloud configuration.

- [ ] **Step 3: Add engine selection and execution routing**

Persist `engineMode: 'cloud' | 'local'` and `engineProfileId` on AI image edit nodes. In `runAiImageEdit()`:

- cloud mode calls the existing `llmAPI.image` path;
- local mode calls `localEngineAPI.editImage({ profileId, imageBase64, mimeType, prompt, negativePrompt, model, width, height })`;
- missing/invalid local profiles open the setup wizard and leave the previous result untouched;
- failures set node error state but never clear its source or result.

- [ ] **Step 4: Verify route tests and all focused engine tests**

Run: `npm.cmd test -- electron/ipc/__tests__/workbench-ui.spec.ts electron/ipc/__tests__/llm-image.spec.ts electron/ipc/__tests__/local-engine-adapters.spec.ts electron/ipc/__tests__/local-engine-ipc.spec.ts`

Run: `npm.cmd run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/workbench/AiImageEditNode.vue src/views/Workbench.vue src/env.d.ts electron/ipc/__tests__/workbench-ui.spec.ts
git commit -m "feat(workbench): run AI edits on local engines"
```

### Task 9: Complete local-engine verification

**Files:**
- Modify only the exact files from Tasks 1–8 implicated by a failing check.

- [ ] **Step 1: Run focused tests**

Run: `npm.cmd test -- electron/ipc/__tests__/local-engine-profiles.spec.ts electron/ipc/__tests__/local-engine-adapters.spec.ts electron/ipc/__tests__/local-engine-ipc.spec.ts electron/ipc/__tests__/comfy-dependencies.spec.ts electron/ipc/__tests__/comfy-git-install.spec.ts electron/ipc/__tests__/workbench-ui.spec.ts`

Expected: PASS.

- [ ] **Step 2: Run project-wide verification**

Run: `npm.cmd run typecheck`

Run: `npm.cmd run check:ipc`

Run: `npm.cmd test`

Run: `npm.cmd run build`

Expected: every command exits 0.

- [ ] **Step 3: Perform local smoke tests**

Run: `npm.cmd run dev`

Verify with the user's local installations: configure ComfyUI from a folder; configure WebUI/Forge from a folder; start/connect; list models; complete one img2img edit on each; drop a Comfy metadata PNG; open the missing-node manager; confirm Git destination; confirm requirements are not installed until the separate button is clicked; restart ComfyUI and recheck nodes.

- [ ] **Step 4: Commit verification corrections in their owning task files**

```bash
git add electron/ipc/local-engine electron/ipc/local-engines.js electron/ipc/__tests__/local-engine-profiles.spec.ts electron/ipc/__tests__/local-engine-adapters.spec.ts electron/ipc/__tests__/local-engine-ipc.spec.ts electron/ipc/__tests__/comfy-dependencies.spec.ts electron/ipc/__tests__/comfy-git-install.spec.ts electron/main.js electron/preload.js electron/ipc/channels.js src/env.d.ts src/components/workbench src/stores/workbench.ts src/components/sidebar/AppSidebar.vue src/views/Workbench.vue electron/ipc/__tests__/workbench-ui.spec.ts
git commit -m "fix(engine): finish local engine integration"
```
