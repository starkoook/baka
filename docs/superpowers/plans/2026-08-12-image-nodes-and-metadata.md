# Image Nodes and Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split image loading from AI image editing, support direct image drops, and carry supported generation metadata into the edit node without overwriting user input.

**Architecture:** Extend the existing Electron metadata parser and expose one workbench-specific image inspection IPC. Keep deterministic node creation/defaulting in a small renderer helper, move the two image node bodies into focused Vue components, and leave orchestration in `Workbench.vue`.

**Tech Stack:** Electron 42 CommonJS IPC, Vue 3 Composition API, TypeScript 6, Sharp, Vitest/jsdom.

---

## File map

- Create `electron/ipc/workbench-images.js` — validate and inspect dropped images.
- Create `electron/ipc/__tests__/metadata-workflow.spec.ts` — PNG metadata and workflow-node extraction fixtures.
- Create `electron/ipc/__tests__/workbench-images.spec.ts` — image inspection behavior.
- Modify `electron/ipc/metadata.js` — preserve workflow data, node types, and source hints.
- Modify `electron/main.js`, `electron/preload.js`, `electron/ipc/channels.js`, `src/env.d.ts` — expose image inspection safely.
- Create `src/features/workbench/image-nodes.ts` and `src/features/workbench/__tests__/image-nodes.spec.ts` — pure drop/defaulting helpers.
- Create `src/components/workbench/ImageLoadNode.vue` — loading/preview/metadata-only UI.
- Create `src/components/workbench/AiImageEditNode.vue` — independent edit UI and result preview.
- Modify `src/views/Workbench.vue` — register nodes, coordinate drops, connections, and execution.
- Modify `electron/ipc/__tests__/workbench-ui.spec.ts` — structural UI acceptance.

### Task 1: Preserve ComfyUI workflow metadata

**Files:**
- Create: `electron/ipc/__tests__/metadata-workflow.spec.ts`
- Modify: `electron/ipc/metadata.js`

- [ ] **Step 1: Write failing PNG workflow tests**

Create a minimal PNG fixture builder; the current parser does not validate CRC, so zero CRC bytes are sufficient for tests:

```ts
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseMetadata } from '../metadata.js'

function chunk(type: string, text: string) {
  const data = Buffer.concat([Buffer.from(type === 'tEXt' ? 'workflow\0' : ''), Buffer.from(text)])
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 4, 'ascii')
  return Buffer.concat([head, data, Buffer.alloc(4)])
}

function pngWithWorkflow(workflow: object) {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('tEXt', JSON.stringify(workflow)),
  ])
}

describe('ComfyUI workflow metadata', () => {
  it('preserves node types and embedded source hints', () => {
    const dir = mkdtempSync(join(tmpdir(), 'baka-meta-'))
    const file = join(dir, 'workflow.png')
    writeFileSync(file, pngWithWorkflow({ nodes: [
      { type: 'LoadImage' },
      { type: 'ImpactWildcardProcessor', properties: { cnr_id: 'comfyui-impact-pack', repo_url: 'https://github.com/ltdrdata/ComfyUI-Impact-Pack' } },
    ] }))

    expect(parseMetadata(file)).toMatchObject({
      hasMetadata: true,
      generator: 'ComfyUI',
      nodeTypes: ['LoadImage', 'ImpactWildcardProcessor'],
      sourceHints: [{ nodeType: 'ImpactWildcardProcessor', registryId: 'comfyui-impact-pack', repository: 'https://github.com/ltdrdata/ComfyUI-Impact-Pack' }],
    })
  })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm.cmd test -- electron/ipc/__tests__/metadata-workflow.spec.ts`

Expected: FAIL because `parseMetadata()` does not read the `workflow` chunk or return `nodeTypes`/`sourceHints`.

- [ ] **Step 3: Add workflow normalization**

Add and export focused helpers in `electron/ipc/metadata.js`:

```js
function sourceHint(node) {
  const properties = node?.properties || {}
  const repository = properties.repo_url || properties.repository || properties.project_url
  const registryId = properties.cnr_id || properties.aux_id
  if (!repository && !registryId) return null
  return { nodeType: node.type, registryId: registryId || undefined, repository: repository || undefined }
}

function parseComfyUIWorkflow(raw) {
  try {
    const workflow = typeof raw === 'string' ? JSON.parse(raw) : raw
    const nodes = Array.isArray(workflow?.nodes) ? workflow.nodes : []
    return {
      workflow,
      nodeTypes: [...new Set(nodes.map(node => node?.type).filter(Boolean))],
      sourceHints: nodes.map(sourceHint).filter(Boolean),
    }
  } catch {
    return { workflow: undefined, nodeTypes: [], sourceHints: [] }
  }
}
```

When PNG chunks contain `workflow`, merge this data into the existing parsed result and set `generator: 'ComfyUI'`/`hasMetadata: true`. Also derive `nodeTypes` from API-prompt objects by collecting each `class_type`.

- [ ] **Step 4: Verify GREEN and run existing metadata/gallery tests**

Run: `npm.cmd test -- electron/ipc/__tests__/metadata-workflow.spec.ts electron/ipc/__tests__/gallery-scan.spec.ts electron/ipc/__tests__/metadata-viewer-ui.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/metadata.js electron/ipc/__tests__/metadata-workflow.spec.ts
git commit -m "feat(metadata): preserve comfy workflow node data"
```

### Task 2: Add safe workbench image inspection IPC

**Files:**
- Create: `electron/ipc/workbench-images.js`
- Create: `electron/ipc/__tests__/workbench-images.spec.ts`
- Modify: `electron/main.js`
- Modify: `electron/preload.js`
- Modify: `electron/ipc/channels.js`
- Modify: `src/env.d.ts`

- [ ] **Step 1: Write failing service tests**

```ts
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { inspectWorkbenchImage } from '../workbench-images.js'

describe('inspectWorkbenchImage', () => {
  it('returns a data URL, dimensions, and normalized metadata', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'baka-image-')), 'plain.png')
    await sharp({ create: { width: 8, height: 6, channels: 4, background: '#ff66aa' } }).png().toFile(file)
    const result = await inspectWorkbenchImage(file)
    expect(result.success).toBe(true)
    expect(result.image).toMatchObject({ filePath: file, mimeType: 'image/png', width: 8, height: 6 })
    expect(result.image.dataUrl).toMatch(/^data:image\/png;base64,/)
  })

  it('rejects unsupported files', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'baka-image-')), 'note.txt')
    writeFileSync(file, 'nope')
    expect(await inspectWorkbenchImage(file)).toMatchObject({ success: false, error: '不支持的图片格式' })
  })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm.cmd test -- electron/ipc/__tests__/workbench-images.spec.ts`

Expected: FAIL because `workbench-images.js` does not exist.

- [ ] **Step 3: Implement the inspection service and IPC**

`electron/ipc/workbench-images.js` must export the testable function and the handler registration:

```js
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const { ipcMain } = require('electron')
const { parseMetadata } = require('./metadata')

const MIME = new Map([
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'], ['.gif', 'image/gif'], ['.bmp', 'image/bmp'],
])

async function inspectWorkbenchImage(filePath) {
  const resolved = path.resolve(String(filePath || ''))
  const mimeType = MIME.get(path.extname(resolved).toLowerCase())
  if (!mimeType) return { success: false, error: '不支持的图片格式' }
  try {
    const [buffer, dimensions] = await Promise.all([fs.promises.readFile(resolved), sharp(resolved).metadata()])
    return { success: true, image: {
      filePath: resolved,
      fileName: path.basename(resolved),
      mimeType,
      width: dimensions.width || 0,
      height: dimensions.height || 0,
      dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}`,
      metadata: parseMetadata(resolved),
    } }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

function registerWorkbenchImageHandlers() {
  ipcMain.handle('workbenchImage:inspect', (_event, filePath) => inspectWorkbenchImage(filePath))
}

module.exports = { inspectWorkbenchImage, registerWorkbenchImageHandlers }
```

Register it from `electron/main.js`. Expose `fsAPI.getFilePath(file)` through `webUtils.getPathForFile(file)` and `workbenchImageAPI.inspect(filePath)` in `electron/preload.js`. Add matching `WorkbenchImage`, `GenerationMetadata`, and `WorkbenchImageAPI` declarations to `src/env.d.ts`. Add `WORKBENCH_IMAGE_INSPECT` to `electron/ipc/channels.js` and use that constant in the handler/preload if the file's existing style requires it.

- [ ] **Step 4: Verify tests and IPC wiring**

Run: `npm.cmd test -- electron/ipc/__tests__/workbench-images.spec.ts electron/ipc/__tests__/workbench-reliability.spec.ts`

Run: `npm.cmd run check:ipc`

Expected: PASS for both commands.

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/workbench-images.js electron/ipc/__tests__/workbench-images.spec.ts electron/main.js electron/preload.js electron/ipc/channels.js src/env.d.ts
git commit -m "feat(workbench): inspect dropped images with metadata"
```

### Task 3: Add deterministic image-node helpers

**Files:**
- Create: `src/features/workbench/image-nodes.ts`
- Create: `src/features/workbench/__tests__/image-nodes.spec.ts`

- [ ] **Step 1: Write failing helper tests**

```ts
import { describe, expect, it } from 'vitest'
import { applyMetadataDefaults, arrangeDroppedImages } from '../image-nodes'

describe('image node metadata defaults', () => {
  it('fills only untouched fields', () => {
    const result = applyMetadataDefaults(
      { editPrompt: '', model: '', outputSize: '', touched: {} },
      { prompt: '1girl, pink hair', model: 'anime.safetensors', width: 768, height: 1024 },
      ['anime.safetensors'],
    )
    expect(result).toMatchObject({ editPrompt: '1girl, pink hair', model: 'anime.safetensors', outputSize: '768x1024' })
  })

  it('never overwrites user-edited values', () => {
    const result = applyMetadataDefaults(
      { editPrompt: '换成夜景', model: 'mine.safetensors', outputSize: '1024x1024', touched: { editPrompt: true, model: true, outputSize: true } },
      { prompt: 'original', model: 'other.safetensors', width: 768, height: 1024 },
      ['other.safetensors'],
    )
    expect(result).toMatchObject({ editPrompt: '换成夜景', model: 'mine.safetensors', outputSize: '1024x1024' })
  })

  it('arranges multiple dropped images without overlap', () => {
    expect(arrangeDroppedImages({ x: 100, y: 200 }, 3, 300)).toEqual([
      { x: 100, y: 200 }, { x: 424, y: 200 }, { x: 748, y: 200 },
    ])
  })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm.cmd test -- src/features/workbench/__tests__/image-nodes.spec.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure helpers**

```ts
export interface EditDefaults {
  editPrompt: string
  model: string
  outputSize: string
  touched: Partial<Record<'editPrompt' | 'model' | 'outputSize', boolean>>
}

export function applyMetadataDefaults(current: EditDefaults, metadata: GenerationMetadata, models: string[]) {
  return {
    ...current,
    editPrompt: current.touched.editPrompt ? current.editPrompt : (current.editPrompt || metadata.prompt || ''),
    model: current.touched.model ? current.model : (current.model || (metadata.model && models.includes(metadata.model) ? metadata.model : '')),
    outputSize: current.touched.outputSize ? current.outputSize : (current.outputSize || (metadata.width && metadata.height ? `${metadata.width}x${metadata.height}` : '')),
  }
}

export function arrangeDroppedImages(origin: { x: number; y: number }, count: number, width: number) {
  return Array.from({ length: count }, (_, index) => ({ x: origin.x + index * (width + 24), y: origin.y }))
}
```

Import `GenerationMetadata` from a new exported type in `src/env.d.ts` or move the shared renderer type to this module and reference it from `env.d.ts`; do not duplicate incompatible shapes.

- [ ] **Step 4: Verify GREEN**

Run: `npm.cmd test -- src/features/workbench/__tests__/image-nodes.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/workbench/image-nodes.ts src/features/workbench/__tests__/image-nodes.spec.ts src/env.d.ts
git commit -m "feat(workbench): add image node metadata defaults"
```

### Task 4: Split the two image node components

**Files:**
- Create: `src/components/workbench/ImageLoadNode.vue`
- Create: `src/components/workbench/AiImageEditNode.vue`
- Modify: `src/views/Workbench.vue`
- Modify: `electron/ipc/__tests__/workbench-ui.spec.ts`

- [ ] **Step 1: Add failing structural acceptance tests**

Extend `electron/ipc/__tests__/workbench-ui.spec.ts`:

```ts
it('keeps image loading separate from AI image editing', () => {
  const loadNode = read('src/components/workbench/ImageLoadNode.vue')
  const editNode = read('src/components/workbench/AiImageEditNode.vue')
  expect(workbench).toContain("{ kind: 'image', label: '加载图片'")
  expect(workbench).toContain("{ kind: 'ai-image-edit', label: 'AI 图片编辑'")
  expect(loadNode).not.toContain('API 配置')
  expect(loadNode).not.toContain('开始编辑')
  expect(editNode).toContain('开始编辑')
  expect(editNode).toContain('结果预览')
  expect(workbench).not.toContain('deriveImageNode(')
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm.cmd test -- electron/ipc/__tests__/workbench-ui.spec.ts`

Expected: FAIL because the components and `ai-image-edit` node do not exist.

- [ ] **Step 3: Implement `ImageLoadNode.vue`**

Use props/emits only; the component must not call IPC directly:

```vue
<script setup lang="ts">
defineProps<{ src: string; fileName?: string; width?: number; height?: number; metadata?: GenerationMetadata }>()
defineEmits<{ choose: []; replace: []; save: [] }>()
</script>

<template>
  <section class="image-load-node">
    <img v-if="src" :src="src" alt="" />
    <button v-else type="button" @click="$emit('choose')">选择图片</button>
    <div v-if="src" class="image-load-node__facts">
      <span>{{ width }} × {{ height }}</span>
      <span v-if="metadata?.hasMetadata">含生成元数据</span>
    </div>
    <details v-if="metadata?.hasMetadata"><summary>查看元数据</summary><p>{{ metadata.prompt }}</p></details>
    <footer><button @click="$emit('replace')">替换</button><button @click="$emit('save')">保存</button></footer>
  </section>
</template>
```

- [ ] **Step 4: Implement `AiImageEditNode.vue`**

Expose model values and a run event. Mark user-edited fields through one `touch` event so `Workbench.vue` can preserve them:

```vue
<script setup lang="ts">
defineProps<{ sourceReady: boolean; apiConfigId: string; model: string; editPrompt: string; outputSize: string; result: string; running: boolean; models: string[] }>()
defineEmits<{ 'update:apiConfigId': [value: string]; 'update:model': [value: string]; 'update:editPrompt': [value: string]; 'update:outputSize': [value: string]; touch: [field: 'model' | 'editPrompt' | 'outputSize']; run: [] }>()
</script>

<template>
  <section class="ai-image-edit-node">
    <p v-if="!sourceReady">请连接一个加载图片节点</p>
    <textarea :value="editPrompt" @input="$emit('touch', 'editPrompt'); $emit('update:editPrompt', ($event.target as HTMLTextAreaElement).value)" />
    <button :disabled="!sourceReady || running" @click="$emit('run')">{{ running ? '编辑中…' : '开始编辑' }}</button>
    <div class="ai-image-edit-node__result"><span>结果预览</span><img v-if="result" :src="result" alt="" /></div>
  </section>
</template>
```

- [ ] **Step 5: Wire both components into `Workbench.vue`**

Add `metadata`, `filePath`, `mimeType`, `imageWidth`, `imageHeight`, `editTouched`, and `outputSize` to `WbNode`. Register `{ kind: 'image', label: '加载图片' }` and `{ kind: 'ai-image-edit', label: 'AI 图片编辑' }`. Replace the current image generator block with `ImageLoadNode`, render `AiImageEditNode` separately, and replace `runImageGen()` with `runAiImageEdit()` that always obtains the input image from `resolveInputSource(node.id)` and writes the result back to the same node.

Remove only image-node functions made obsolete by this change: `deriveImageNode`, image generator mode switching, and embedded image tools. Keep unrelated resize/save/AI tag behavior unchanged.

- [ ] **Step 6: Verify GREEN**

Run: `npm.cmd test -- electron/ipc/__tests__/workbench-ui.spec.ts electron/ipc/__tests__/llm-image.spec.ts`

Run: `npm.cmd run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/workbench/ImageLoadNode.vue src/components/workbench/AiImageEditNode.vue src/views/Workbench.vue electron/ipc/__tests__/workbench-ui.spec.ts
git commit -m "feat(workbench): split image load and AI edit nodes"
```

### Task 5: Support direct multi-image drops

**Files:**
- Modify: `src/views/Workbench.vue`
- Modify: `src/features/workbench/image-nodes.ts`
- Modify: `src/features/workbench/__tests__/image-nodes.spec.ts`
- Modify: `electron/ipc/__tests__/workbench-ui.spec.ts`

- [ ] **Step 1: Add failing drop acceptance assertions**

```ts
it('creates image nodes from operating-system file drops', () => {
  expect(workbench).toContain('event.dataTransfer?.files')
  expect(workbench).toContain('window.fsAPI.getFilePath')
  expect(workbench).toContain('window.workbenchImageAPI.inspect')
  expect(workbench).toContain('arrangeDroppedImages')
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm.cmd test -- electron/ipc/__tests__/workbench-ui.spec.ts`

Expected: FAIL because `onCanvasDrop()` currently handles only `application/x-baka-asset`.

- [ ] **Step 3: Extend `onCanvasDrop()`**

Keep the existing asset branch first. For an internal image asset, inspect `asset.file` with `window.workbenchImageAPI.inspect` before creating the node so asset drag-back receives the same metadata as an operating-system drop. If there is no internal asset id, read `dataTransfer.files`, resolve each path with `window.fsAPI.getFilePath(file)`, inspect with `window.workbenchImageAPI.inspect`, and create one image node per successful result at positions returned by `arrangeDroppedImages()`.

Take one `snapshot()` before adding the successful batch, update selection to the created ids, call `scheduleAutosave()`, and show one summary such as `已添加 3 张图片，忽略 1 个不支持的文件`. Do not roll back successful images if another file fails.

Route `ImageLoadNode`'s choose/replace events through `fsAPI.selectImage()` followed by the same `workbenchImageAPI.inspect()` function. Replacing a file updates image data and metadata atomically inside one undo snapshot; a failed replacement leaves the old image untouched.

- [ ] **Step 4: Apply metadata when an edit connection is created**

In the existing edge-creation path, when the destination is `ai-image-edit`, call `applyMetadataDefaults()` with the source image metadata and current model list. Persist `editTouched` in workflow payloads so autosave/open preserves the no-overwrite rule.

- [ ] **Step 5: Verify drop, workflow, and reliability tests**

Run: `npm.cmd test -- src/features/workbench/__tests__/image-nodes.spec.ts electron/ipc/__tests__/workbench-ui.spec.ts electron/ipc/__tests__/workbench-reliability.spec.ts electron/ipc/__tests__/workflow-store.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/views/Workbench.vue src/features/workbench/image-nodes.ts src/features/workbench/__tests__/image-nodes.spec.ts electron/ipc/__tests__/workbench-ui.spec.ts
git commit -m "feat(workbench): create image nodes from file drops"
```

### Task 6: Complete image-node verification

**Files:**
- Modify only files required by failures found in this task.

- [ ] **Step 1: Run the focused suite**

Run: `npm.cmd test -- electron/ipc/__tests__/metadata-workflow.spec.ts electron/ipc/__tests__/workbench-images.spec.ts src/features/workbench/__tests__/image-nodes.spec.ts electron/ipc/__tests__/workbench-ui.spec.ts electron/ipc/__tests__/llm-image.spec.ts electron/ipc/__tests__/workbench-reliability.spec.ts`

Expected: PASS with no unhandled rejection output.

- [ ] **Step 2: Run all static and regression checks**

Run: `npm.cmd run typecheck`

Run: `npm.cmd run check:ipc`

Run: `npm.cmd test`

Run: `npm.cmd run build`

Expected: all commands exit 0.

- [ ] **Step 3: Perform Electron smoke checks**

Run: `npm.cmd run dev`

Verify: ordinary PNG/JPEG drag creates loading nodes; ComfyUI PNG shows metadata; multiple images do not overlap; connecting an AI edit node fills untouched defaults; manual edits remain unchanged after reconnect; result stays inside the edit node and flows downstream.

- [ ] **Step 4: Commit any verification-only corrections**

Stage only the image-node files changed to correct the failed check, chosen from the Task 1–5 file lists, then commit:

```bash
git commit -m "fix(workbench): finish image node integration"
```
