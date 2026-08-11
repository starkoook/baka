# LibTV 式素材节点升级 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给工作台图片/文本节点内嵌 AI 生成器（文生图/图生图模式切换）、自动派生新节点、本地+AI 工具集。

**Architecture:** 后端在 `electron/ipc/llm.js` 加通用生图接口 `llm:image`（OpenAI 兼容 `/images/generations` + `/images/edits`、Gemini `generateContent`），经 preload 暴露为 `llmAPI.image`。前端在 `src/views/Workbench.vue` 给 image/text 节点加生成器 UI 与工具条，生成/工具结果通过 `deriveImageNode` 派生新节点并自动连线；本地工具用 canvas 处理，AI 工具走 `llm:image`。

**Tech Stack:** Electron IPC、Vue 3 `<script setup>`、Canvas 2D、Vite/Vitest（现有 235 项测试）。

---

## File Structure

- `electron/ipc/llm.js` — 新增 `imageGeneration()` 与 `llm:image` handler；导出 `imageGeneration` 供测试
- `electron/ipc/__tests__/llm-image.spec.ts` — 新增后端生图单元测试（mock fetch）
- `electron/preload.js` — `llmAPI.image` 暴露
- `src/env.d.ts` — `LLMAPI.image` 类型
- `src/views/Workbench.vue` — 节点字段、派生函数、生成器 UI、工具条、裁剪交互、本地/AI 工具
- `docs/superpowers/specs/2026-08-11-libtv-style-nodes-design.md` — 已批准设计（本计划依据）

现有可复用代码（Workbench.vue 内）：`snapshot()`、`setSelection()`、`nextId`、`apiConfigById(id)`、`loadNodeModels(node)`、`nodeModelOptions(node)`、`appStore.setStatus()`、`nodes`/`edges` refs、`WbNode` 接口、`TITLE_HEIGHT`/`NODE_WIDTH` 常量。

---

## Task 1: 后端通用生图接口 `llm:image`

**Files:**
- Modify: `electron/ipc/llm.js`（在 `chatCompletion` 后新增 `imageGeneration`；在 `llm:chat` handler 后新增 `llm:image`；底部导出增加 `imageGeneration`）
- Test: `electron/ipc/__tests__/llm-image.spec.ts`（新建）
- Modify: `electron/preload.js`、`src/env.d.ts`

### Task 1 Step 1: 写失败测试

- [ ] 创建 `electron/ipc/__tests__/llm-image.spec.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('llm imageGeneration', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('调用 OpenAI 兼容 /images/generations 并返回 b64 图片', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ b64_json: 'QUJD' }] }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { imageGeneration } = await import('../llm.js')
    const result = await imageGeneration({
      provider: 'openai',
      baseUrl: 'https://example.com/v1',
      apiKey: 'k',
      model: 'gpt-image-1',
      prompt: '一只猫',
      size: '1024x1024',
    })

    expect(result.success).toBe(true)
    expect(result.images?.[0]).toBe('data:image/png;base64,QUJD')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/v1/images/generations',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('图生图走 /images/edits 并返回图片', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ b64_json: 'QUJD' }] }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { imageGeneration } = await import('../llm.js')
    const result = await imageGeneration({
      provider: 'openai',
      baseUrl: 'https://example.com/v1',
      apiKey: 'k',
      model: 'gpt-image-1',
      prompt: '改成红色',
      imageBase64: 'QUJD',
      mimeType: 'image/png',
    })

    expect(result.success).toBe(true)
    expect(fetchMock.mock.calls[0][0]).toBe('https://example.com/v1/images/edits')
  })

  it('接口失败时返回 error', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: false,
      status: 400,
      text: async () => 'bad request',
    }))

    const { imageGeneration } = await import('../llm.js')
    const result = await imageGeneration({
      provider: 'openai',
      baseUrl: 'https://example.com/v1',
      apiKey: 'k',
      model: 'gpt-image-1',
      prompt: '一只猫',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('400')
  })
})
```

### Task 1 Step 2: 运行测试确认失败

- [ ] 运行：`npm test -- --run electron/ipc/__tests__/llm-image.spec.ts`
- [ ] 预期：FAIL，`imageGeneration` 未导出

### Task 1 Step 3: 实现 `imageGeneration` 与 handler

- [ ] 在 `electron/ipc/llm.js` 的 `chatCompletion` 函数之后追加：

```js
// ── Generic image generation (workbench image nodes) ──
async function imageGeneration(params) {
  const config = loadConfig()
  const provider = params.provider || config.provider
  const baseUrl = params.baseUrl || config.baseUrl
  const apiKey = params.apiKey || config.apiKey
  const model = params.model || config.model
  if (!apiKey) throw new Error('API Key 未配置，请在设置或 API 配置中填写')
  const prompt = params.prompt || ''
  const size = params.size || '1024x1024'
  const imageBase64 = params.imageBase64
  const mimeType = params.mimeType || 'image/png'

  if (provider === 'gemini') {
    const url = baseUrl.replace(/\/$/, '') + '/v1beta/models/' + model + ':generateContent?key=' + apiKey
    const parts = []
    if (imageBase64) parts.push({ inlineData: { mimeType, data: imageBase64 } })
    parts.push({ text: prompt })
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseModalities: ['IMAGE'] },
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error('API ' + res.status + ': ' + err.slice(0, 200))
    }
    const data = await res.json()
    const images = []
    for (const cand of data.candidates || []) {
      for (const part of (cand.content && cand.content.parts) || []) {
        if (part.inlineData && part.inlineData.data) {
          images.push('data:' + (part.inlineData.mimeType || mimeType) + ';base64,' + part.inlineData.data)
        }
      }
    }
    if (!images.length) throw new Error('模型没有返回图片（可能不支持生图）')
    return { success: true, images }
  }

  if (imageBase64) {
    const url = baseUrl.replace(/\/$/, '') + '/images/edits'
    const buffer = Buffer.from(imageBase64, 'base64')
    const form = new FormData()
    form.append('image', new Blob([buffer], { type: mimeType }), 'reference.png')
    form.append('prompt', prompt)
    form.append('model', model)
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey },
      body: form,
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error('图生图不受支持：API ' + res.status + ' ' + err.slice(0, 120))
    }
    const data = await res.json()
    const images = (data.data || []).map((d) =>
      d.b64_json ? 'data:image/png;base64,' + d.b64_json : d.url,
    )
    return { success: true, images }
  }

  const url = baseUrl.replace(/\/$/, '') + '/images/generations'
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
    body: JSON.stringify({ model, prompt, n: 1, size, response_format: 'b64_json' }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error('API ' + res.status + ': ' + err.slice(0, 200))
  }
  const data = await res.json()
  const images = (data.data || []).map((d) =>
    d.b64_json ? 'data:image/png;base64,' + d.b64_json : d.url,
  )
  if (!images.length) throw new Error('接口没有返回图片')
  return { success: true, images }
}
```

- [ ] 在 `llm:chat` handler 之后追加：

```js
  ipcMain.handle('llm:image', async (_event, params) => {
    try {
      return await imageGeneration(params)
    } catch (e) {
      return { success: false, error: e.message }
    }
  })
```

- [ ] 文件底部导出改为：

```js
module.exports = { registerLLMHandlers, imageGeneration }
```

### Task 1 Step 4: preload 与类型

- [ ] `electron/preload.js` 的 `llmAPI` 中追加：

```js
  image: (params) => ipcRenderer.invoke('llm:image', params),
```

- [ ] `src/env.d.ts` 的 `LLMAPI` 中追加：

```ts
    image: (params: {
      provider?: string
      baseUrl?: string
      apiKey?: string
      model?: string
      prompt: string
      imageBase64?: string
      mimeType?: string
      size?: string
    }) => Promise<{ success: boolean; images?: string[]; error?: string }>
```

### Task 1 Step 5: 运行测试确认通过

- [ ] 运行：`npm test -- --run electron/ipc/__tests__/llm-image.spec.ts`
- [ ] 预期：PASS（3 个用例）

### Task 1 Step 6: 提交

- [ ] `git add electron/ipc/llm.js electron/ipc/__tests__/llm-image.spec.ts electron/preload.js src/env.d.ts`
- [ ] `git commit -m "feat(workbench): 通用生图接口 llm:image"`

---

## Task 2: 前端基础设施（节点字段 + 派生函数）

**Files:**
- Modify: `src/views/Workbench.vue`

### Task 2 Step 1: 扩展 WbNode 接口

- [ ] 在 `interface WbNode` 中追加：

```ts
  genMode?: 'text' | 'image'
  genPrompt?: string
  genSize?: string
```

### Task 2 Step 2: 给图片/文本节点创建时补默认字段

- [ ] `addImageNodes` 推入节点对象时追加：

```ts
      genMode: 'text',
      genPrompt: '',
      genSize: '1024x1024',
```

- [ ] `addTextNode` 推入节点对象时追加（文本节点复用已有 `prompt`/`apiConfigId`/`model`/`temperature` 字段，无需新增）：

```ts
    model: '',
    temperature: 0.5,
```

### Task 2 Step 3: 实现派生函数

- [ ] 在 `executeNode` 之后追加：

```ts
function deriveImageNode(source: WbNode, newSrc: string, label?: string, snap = true) {
  if (snap) snapshot()
  const node: WbNode = {
    id: nextId++,
    x: source.x + source.width + 60,
    y: source.y,
    width: source.width,
    height: source.height,
    kind: 'image',
    label: label || `${source.label || '图片'}·新`,
    src: newSrc,
    contentH: source.contentH,
    rotation: 0,
    inputCount: 1,
    outputCount: 1,
    inTypes: ['image'],
    outTypes: ['image'],
    genMode: 'text',
    genPrompt: '',
    genSize: source.genSize || '1024x1024',
  }
  nodes.value.push(node)
  edges.value.push({ id: nextId++, from: source.id, to: node.id })
  setSelection([node.id])
  return node
}
```

### Task 2 Step 4: 验证

- [ ] 运行：`npm run typecheck`，预期 PASS
- [ ] 运行：`npm test -- --run`，预期 235 项全过

### Task 2 Step 5: 提交

- [ ] `git add src/views/Workbench.vue`
- [ ] `git commit -m "feat(workbench): 节点字段与派生函数"`

---

## Task 3: 图片节点内嵌生成器（含模式切换）

**Files:**
- Modify: `src/views/Workbench.vue`

### Task 3 Step 1: 生成逻辑

- [ ] 在 `runNode` 之前追加：

```ts
async function runImageGen(node: WbNode) {
  const cfg = apiConfigById(node.apiConfigId)
  if (!cfg) {
    node.execState = 'error'
    appStore.setStatus('未选择 API 配置，请在节点里选择')
    return
  }
  node.execState = 'running'
  try {
    const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,/.exec(node.src || '')
    const imageBase64 =
      node.genMode === 'image' && node.src
        ? node.src.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '')
        : ''
    const res = await window.llmAPI?.image({
      provider: cfg.provider,
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      model: node.model || cfg.model,
      prompt: node.genPrompt?.trim() || '一张精美的插画',
      imageBase64: imageBase64 || undefined,
      mimeType: m ? m[1] : 'image/png',
      size: node.genSize || '1024x1024',
    })
    if (!res?.success) throw new Error(res?.error || '生图失败')
    const out = res.images?.[0]
    if (!out) throw new Error('接口没有返回图片')
    deriveImageNode(node, out)
    node.execState = 'done'
    appStore.setStatus('生成完成 ✓ 已派生新节点')
  } catch (e) {
    node.execState = 'error'
    appStore.setStatus(`生图失败：${(e as Error).message}`)
  }
}
```

### Task 3 Step 2: 图片节点模板替换

- [ ] 将内容区 `<img v-if="node.kind === 'image'" ... />` 替换为：

```html
<div v-if="node.kind === 'image'" class="wb-node__media-gen">
  <div class="wb-node__media-preview">
    <img v-if="node.src" :src="node.src" alt="" draggable="false" />
    <span v-else class="wb-node__media-empty">加载图片后可生成</span>
  </div>
  <div class="wb-node__gen">
    <div class="wb-node__gen-modes">
      <button type="button" :class="{ on: node.genMode !== 'image' }" @pointerdown.stop @click.stop="node.genMode = 'text'">文生图</button>
      <button type="button" :class="{ on: node.genMode === 'image' }" @pointerdown.stop @click.stop="node.genMode = 'image'">图生图</button>
    </div>
    <label class="wb-node__ai-field">
      <span>配置</span>
      <select v-model="node.apiConfigId" @change="loadNodeModels(node)">
        <option value="">（未选择）</option>
        <option v-for="cfg in apiConfigs" :key="cfg.id" :value="cfg.id">{{ cfg.name }}</option>
      </select>
    </label>
    <label class="wb-node__ai-field">
      <span>模型</span>
      <select v-model="node.model">
        <option value="">（用配置默认）</option>
        <option v-for="m in nodeModelOptions(node)" :key="m" :value="m">{{ m }}</option>
      </select>
    </label>
    <textarea
      v-model="node.genPrompt"
      class="wb-node__gen-prompt"
      :placeholder="node.genMode === 'image' ? '描述想改什么（参考当前图）' : '描述要生成的画面'"
      @pointerdown.stop
      @wheel.stop
    ></textarea>
    <div class="wb-node__gen-row">
      <select v-model="node.genSize">
        <option value="1024x1024">1:1</option>
        <option value="1536x1024">16:9</option>
        <option value="1024x1536">9:16</option>
      </select>
      <button
        type="button"
        class="wb-node__gen-btn"
        :disabled="node.execState === 'running'"
        @pointerdown.stop
        @click.stop="runImageGen(node)"
      >
        {{ node.execState === 'running' ? '生成中…' : '生成' }}
      </button>
    </div>
  </div>
</div>
```

### Task 3 Step 3: 生成器 CSS

- [ ] 在 `.wb-node__ai` 相关规则附近追加：

```css
.wb-node__media-gen {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: auto;
  background: var(--surface-primary);
}
.wb-node__media-preview {
  position: relative;
  flex: none;
  height: 120px;
  display: grid;
  place-items: center;
  background: var(--surface-secondary);
  overflow: hidden;
}
.wb-node__media-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  pointer-events: none;
}
.wb-node__media-empty { color: var(--text-tertiary); font-size: 11px; }
.wb-node__gen {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
}
.wb-node__gen-modes {
  display: flex;
  gap: 4px;
  padding: 3px;
  border-radius: 8px;
  background: var(--surface-secondary);
}
.wb-node__gen-modes button {
  flex: 1;
  height: 24px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-tertiary);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.wb-node__gen-modes button.on {
  background: var(--surface-primary);
  color: var(--brand-primary);
  font-weight: 700;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
}
.wb-node__gen-prompt {
  min-height: 52px;
  resize: none;
  padding: 6px 8px;
  border: 1px solid var(--line-subtle);
  border-radius: 8px;
  outline: none;
  background: var(--surface-secondary);
  color: var(--text-primary);
  font: inherit;
  font-size: 11px;
  line-height: 1.5;
}
.wb-node__gen-row { display: flex; gap: 6px; align-items: center; }
.wb-node__gen-row select {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 6px;
  border: 1px solid var(--line-subtle);
  border-radius: 6px;
  background: var(--surface-secondary);
  color: var(--text-primary);
  font: inherit;
  font-size: 11px;
}
.wb-node__gen-btn {
  flex: none;
  height: 28px;
  padding: 0 16px;
  border: 0;
  border-radius: 8px;
  background: #2e9e5b;
  color: #fff;
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.wb-node__gen-btn:disabled { opacity: 0.6; cursor: wait; }
```

### Task 3 Step 4: 验证

- [ ] 运行：`npm run typecheck`，预期 PASS
- [ ] 手动（开发窗口已开则 HMR 生效）：图片节点应出现生成器；点生成需先选配置，否则标红提示

### Task 3 Step 5: 提交

- [ ] `git add src/views/Workbench.vue`
- [ ] `git commit -m "feat(workbench): 图片节点内嵌生成器与自动派生"`

---

## Task 4: 文本节点内嵌生成器

**Files:**
- Modify: `src/views/Workbench.vue`

### Task 4 Step 1: 生成逻辑

- [ ] 在 `runImageGen` 之后追加：

```ts
async function runTextGen(node: WbNode) {
  const cfg = apiConfigById(node.apiConfigId)
  if (!cfg) {
    node.execState = 'error'
    appStore.setStatus('未选择 API 配置，请在节点里选择')
    return
  }
  node.execState = 'running'
  try {
    const prompt = node.prompt?.trim() || '请根据以下内容处理：\n{{input}}'
    const srcText = node.text ?? ''
    const filled = prompt.includes('{{input}}')
      ? prompt.split('{{input}}').join(srcText)
      : `${prompt}\n\n${srcText}`
    const res = await window.llmAPI?.chat({
      provider: cfg.provider,
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      model: node.model || cfg.model,
      prompt: filled,
      temperature: node.temperature ?? 0.5,
    })
    if (!res?.success) throw new Error(res?.error || '生成失败')
    snapshot()
    node.text = (res.text ?? '').trim()
    node.execState = 'done'
    appStore.setStatus('生成完成 ✓')
  } catch (e) {
    node.execState = 'error'
    appStore.setStatus(`生成失败：${(e as Error).message}`)
  }
}
```

### Task 4 Step 2: 文本节点模板替换

- [ ] 将 `<textarea v-else-if="node.kind === 'text'" ...>` 块替换为：

```html
<div v-else-if="node.kind === 'text'" class="wb-node__media-gen">
  <textarea
    v-model="node.text"
    class="wb-node__text wb-node__text--gen"
    placeholder="输入文本…"
    @pointerdown.stop
    @wheel.stop
  ></textarea>
  <div class="wb-node__gen">
    <label class="wb-node__ai-field">
      <span>配置</span>
      <select v-model="node.apiConfigId" @change="loadNodeModels(node)">
        <option value="">（未选择）</option>
        <option v-for="cfg in apiConfigs" :key="cfg.id" :value="cfg.id">{{ cfg.name }}</option>
      </select>
    </label>
    <label class="wb-node__ai-field">
      <span>模型</span>
      <select v-model="node.model">
        <option value="">（用配置默认）</option>
        <option v-for="m in nodeModelOptions(node)" :key="m" :value="m">{{ m }}</option>
      </select>
    </label>
    <textarea
      v-model="node.prompt"
      class="wb-node__gen-prompt"
      placeholder="提示词模板，用 {{input}} 引用正文"
      @pointerdown.stop
      @wheel.stop
    ></textarea>
    <div class="wb-node__gen-row">
      <button
        type="button"
        class="wb-node__gen-btn"
        :disabled="node.execState === 'running'"
        @pointerdown.stop
        @click.stop="runTextGen(node)"
      >
        {{ node.execState === 'running' ? '生成中…' : '生成' }}
      </button>
    </div>
  </div>
</div>
```

- [ ] 追加 CSS：

```css
.wb-node__text--gen {
  flex: 1;
  min-height: 90px;
}
```

### Task 4 Step 3: 验证

- [ ] 运行：`npm run typecheck`，预期 PASS
- [ ] 手动：文本节点出现生成器；模板含 `{{input}}` 时正确引用正文

### Task 4 Step 4: 提交

- [ ] `git add src/views/Workbench.vue`
- [ ] `git commit -m "feat(workbench): 文本节点内嵌生成器"`

---

## Task 5: 本地工具（缩放 / 旋转 / 宫格切分 / 裁剪）

**Files:**
- Modify: `src/views/Workbench.vue`

### Task 5 Step 1: 画布辅助与工具状态

- [ ] 在 `deriveImageNode` 附近追加：

```ts
const gridPopup = ref<number | null>(null)
const resizePopup = ref<number | null>(null)
const cropState = ref<{
  nodeId: number
  x1: number
  y1: number
  x2: number
  y2: number
} | null>(null)

function canvasToDataUrl(img: HTMLImageElement, w: number, h: number, sx = 0, sy = 0, sw?: number, sh?: number) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  const ctx = c.getContext('2d')
  if (!ctx) return ''
  ctx.drawImage(img, sx, sy, sw ?? img.naturalWidth, sh ?? img.naturalHeight, 0, 0, c.width, c.height)
  return c.toDataURL('image/png')
}

async function applyCanvasTool(node: WbNode, fn: (img: HTMLImageElement) => string) {
  if (!node.src || !node.src.startsWith('data:image/')) {
    appStore.setStatus('节点没有可处理的图片')
    return
  }
  node.execState = 'running'
  try {
    const img = new Image()
    img.src = node.src
    await img.decode()
    snapshot()
    node.src = fn(img)
    node.execState = 'done'
    appStore.setStatus('处理完成 ✓')
  } catch (e) {
    node.execState = 'error'
    appStore.setStatus(`处理失败：${(e as Error).message}`)
  }
}
```

### Task 5 Step 2: 工具动作

- [ ] 继续追加：

```ts
function toolRotate(node: WbNode) {
  void applyCanvasTool(node, (img) => {
    const c = document.createElement('canvas')
    c.width = img.naturalHeight
    c.height = img.naturalWidth
    const ctx = c.getContext('2d')
    if (!ctx) return node.src
    ctx.translate(c.width / 2, c.height / 2)
    ctx.rotate(Math.PI / 2)
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)
    return c.toDataURL('image/png')
  })
}

function toolResizeApply(node: WbNode) {
  const width = Number(node.size || 512)
  void applyCanvasTool(node, (img) => {
    const scale = width / img.naturalWidth
    return canvasToDataUrl(img, width, img.naturalHeight * scale)
  })
  resizePopup.value = null
}

function toolGridApply(node: WbNode, n: number) {
  if (!node.src) return
  void (async () => {
    const img = new Image()
    img.src = node.src
    await img.decode()
    const tw = Math.floor(img.naturalWidth / n)
    const th = Math.floor(img.naturalHeight / n)
    if (tw < 1 || th < 1) {
      appStore.setStatus('图片太小，无法切分')
      return
    }
    snapshot()
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        deriveImageNode(node, canvasToDataUrl(img, tw, th, c * tw, r * th, tw, th), `分块 ${r + 1}-${c + 1}`, false)
      }
    }
    appStore.setStatus(`已切分为 ${n * n} 块并派生新节点`)
  })()
  gridPopup.value = null
}

function cropStart(node: WbNode) {
  cropState.value = { nodeId: node.id, x1: 0, y1: 0, x2: 0, y2: 0 }
}

function cropConfirm(node: WbNode) {
  const cs = cropState.value
  if (!cs) return
  const x = Math.min(cs.x1, cs.x2)
  const y = Math.min(cs.y1, cs.y2)
  const w = Math.abs(cs.x2 - cs.x1)
  const h = Math.abs(cs.y2 - cs.y1)
  cropState.value = null
  if (w < 4 || h < 4) {
    appStore.setStatus('选框太小，已取消')
    return
  }
  void applyCanvasTool(node, (img) => {
    const sx = (x / 100) * img.naturalWidth
    const sy = (y / 100) * img.naturalHeight
    const sw = (w / 100) * img.naturalWidth
    const sh = (h / 100) * img.naturalHeight
    return canvasToDataUrl(img, sw, sh, sx, sy, sw, sh)
  })
}
```

### Task 5 Step 3: 图片节点模板追加工具条与弹层

- [ ] 在 Task 3 图片节点模板的 `.wb-node__gen` 末尾（`</div>` 前）追加：

```html
<div class="wb-node__tools">
  <button type="button" @pointerdown.stop @click.stop="cropStart(node)">裁剪</button>
  <button type="button" @pointerdown.stop @click.stop="gridPopup = node.id">宫格</button>
  <button type="button" @pointerdown.stop @click.stop="resizePopup = node.id">缩放</button>
  <button type="button" @pointerdown.stop @click.stop="toolRotate(node)">旋转</button>
</div>
<div v-if="gridPopup === node.id" class="wb-node__tool-pop">
  <label>切分
    <select v-model.number="node.size">
      <option :value="2">2×2</option>
      <option :value="3">3×3</option>
      <option :value="5">5×5</option>
    </select>
  </label>
  <button type="button" @pointerdown.stop @click.stop="toolGridApply(node, node.size || 2)">切分</button>
</div>
<div v-if="resizePopup === node.id" class="wb-node__tool-pop">
  <label>宽度
    <select v-model.number="node.size">
      <option :value="256">256</option>
      <option :value="512">512</option>
      <option :value="1024">1024</option>
      <option :value="1920">1920</option>
    </select>
  </label>
  <button type="button" @pointerdown.stop @click.stop="toolResizeApply(node)">缩放</button>
</div>
```

- [ ] 在 `.wb-node__gen-btn:disabled` 后追加：

```css
.wb-node__tools { display: flex; flex-wrap: wrap; gap: 4px; }
.wb-node__tools button {
  padding: 3px 8px;
  border: 1px solid color-mix(in srgb, var(--brand-primary) 45%, transparent);
  border-radius: 999px;
  background: transparent;
  color: var(--brand-primary);
  font: inherit;
  font-size: 10px;
  cursor: pointer;
}
.wb-node__tools button:hover { background: var(--brand-soft); }
.wb-node__tool-pop {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid var(--line-subtle);
  border-radius: 8px;
  background: var(--surface-secondary);
  font-size: 10px;
  color: var(--text-secondary);
}
.wb-node__tool-pop select {
  height: 24px;
  border: 1px solid var(--line-subtle);
  border-radius: 6px;
  background: var(--surface-primary);
  color: var(--text-primary);
  font: inherit;
  font-size: 10px;
}
.wb-node__tool-pop button {
  height: 24px;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  background: var(--brand-primary);
  color: #fff;
  font: inherit;
  font-size: 10px;
  cursor: pointer;
}
```

### Task 5 Step 4: 裁剪交互

- [ ] 在图片预览 div 上增加裁剪层（替换 `.wb-node__media-preview` 为）：

```html
<div class="wb-node__media-preview" :class="{ cropping: cropState?.nodeId === node.id }">
  <img v-if="node.src" :src="node.src" alt="" draggable="false" />
  <span v-else class="wb-node__media-empty">加载图片后可生成</span>
  <div
    v-if="cropState?.nodeId === node.id"
    class="wb-node__crop"
    @pointerdown.stop="onCropDown($event, node)"
    @pointermove.stop="onCropMove($event)"
    @pointerup.stop="onCropUp"
  >
    <div
      v-if="cropState && Math.abs(cropState.x2 - cropState.x1) > 0"
      class="wb-node__crop-box"
      :style="cropBoxStyle"
    ></div>
  </div>
  <button
    v-if="cropState?.nodeId === node.id"
    type="button"
    class="wb-node__crop-confirm"
    @pointerdown.stop
    @click.stop="cropConfirm(node)"
  >
    裁剪
  </button>
</div>
```

- [ ] 在 `cropConfirm` 后追加事件处理与样式：

```ts
function onCropDown(event: PointerEvent, node: WbNode) {
  const el = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const x = ((event.clientX - el.left) / el.width) * 100
  const y = ((event.clientY - el.top) / el.height) * 100
  cropState.value = { nodeId: node.id, x1: x, y1: y, x2: x, y2: y }
}

function onCropMove(event: PointerEvent) {
  const cs = cropState.value
  if (!cs) return
  const el = (event.currentTarget as HTMLElement).getBoundingClientRect()
  cs.x2 = ((event.clientX - el.left) / el.width) * 100
  cs.y2 = ((event.clientY - el.top) / el.height) * 100
}

function onCropUp() {
  /* 保持选框，等待点击“裁剪” */
}

const cropBoxStyle = computed(() => {
  const cs = cropState.value
  if (!cs) return {}
  return {
    left: `${Math.min(cs.x1, cs.x2)}%`,
    top: `${Math.min(cs.y1, cs.y2)}%`,
    width: `${Math.abs(cs.x2 - cs.x1)}%`,
    height: `${Math.abs(cs.y2 - cs.y1)}%`,
  }
})
```

```css
.wb-node__media-preview.cropping { cursor: crosshair; }
.wb-node__crop {
  position: absolute;
  inset: 0;
  z-index: 3;
}
.wb-node__crop-box {
  position: absolute;
  border: 1px dashed var(--brand-primary);
  background: color-mix(in srgb, var(--brand-primary) 14%, transparent);
  pointer-events: none;
}
.wb-node__crop-confirm {
  position: absolute;
  right: 8px;
  bottom: 8px;
  z-index: 4;
  height: 26px;
  padding: 0 12px;
  border: 0;
  border-radius: 7px;
  background: var(--brand-primary);
  color: #fff;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
```

### Task 5 Step 5: 验证

- [ ] 运行：`npm run typecheck`，预期 PASS
- [ ] 手动：缩放/旋转/宫格/裁剪分别作用于图片节点；宫格派生多个节点并连线

### Task 5 Step 6: 提交

- [ ] `git add src/views/Workbench.vue`
- [ ] `git commit -m "feat(workbench): 图片节点本地工具集"`

---

## Task 6: AI 工具（高清 / 扩图 / 重绘）

**Files:**
- Modify: `src/views/Workbench.vue`

### Task 6 Step 1: 动作实现

- [ ] 在 `toolGridApply` 之后追加：

```ts
async function runImageTool(node: WbNode, tool: 'hd' | 'outpaint' | 'inpaint') {
  const cfg = apiConfigById(node.apiConfigId)
  if (!cfg) {
    node.execState = 'error'
    appStore.setStatus('未选择 API 配置，AI 工具需要配置')
    return
  }
  if (!node.src) {
    node.execState = 'error'
    appStore.setStatus('节点没有图片')
    return
  }
  node.execState = 'running'
  try {
    const prompt =
      tool === 'hd'
        ? 'Upscale this image, keep content identical, 2x resolution, sharp and detailed.'
        : tool === 'outpaint'
          ? 'Extend this image outward naturally, fill the surrounding area seamlessly, keep the original center unchanged.'
          : 'Re-edit this image according to the prompt, keep overall composition.'
    const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,/.exec(node.src)
    const res = await window.llmAPI?.image({
      provider: cfg.provider,
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      model: node.model || cfg.model,
      prompt: tool === 'inpaint' ? `${prompt} ${node.genPrompt || ''}` : prompt,
      imageBase64: node.src.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, ''),
      mimeType: m ? m[1] : 'image/png',
      size: node.genSize || '1024x1024',
    })
    if (!res?.success) throw new Error(res?.error || '工具执行失败')
    const out = res.images?.[0]
    if (!out) throw new Error('接口没有返回图片')
    deriveImageNode(node, out, tool === 'hd' ? '高清放大' : tool === 'outpaint' ? '扩图' : '重绘')
    node.execState = 'done'
    appStore.setStatus('工具完成 ✓ 已派生新节点')
  } catch (e) {
    node.execState = 'error'
    appStore.setStatus(`${tool === 'hd' ? '高清' : tool === 'outpaint' ? '扩图' : '重绘'}失败：${(e as Error).message}`)
  }
}
```

### Task 6 Step 2: 工具条按钮

- [ ] 在 Task 5 的工具条 `</div>` 后追加：

```html
<div class="wb-node__tools wb-node__tools--ai">
  <button type="button" @pointerdown.stop @click.stop="runImageTool(node, 'hd')">高清</button>
  <button type="button" @pointerdown.stop @click.stop="runImageTool(node, 'outpaint')">扩图</button>
  <button type="button" @pointerdown.stop @click.stop="runImageTool(node, 'inpaint')">重绘</button>
</div>
```

- [ ] 追加 CSS：

```css
.wb-node__tools--ai button {
  border-color: var(--line-subtle);
  color: var(--text-tertiary);
}
```

### Task 6 Step 3: 验证

- [ ] 运行：`npm run typecheck`，预期 PASS
- [ ] 手动：未选配置时提示；接口不支持时报"图生图不受支持"类错误并标红

### Task 6 Step 4: 提交

- [ ] `git add src/views/Workbench.vue`
- [ ] `git commit -m "feat(workbench): 图片节点 AI 工具（高清/扩图/重绘）"`

---

## Task 7: 状态/撤销完善 + 全量验证

**Files:**
- Modify: `src/views/Workbench.vue`

### Task 7 Step 1: 生成器按钮与 run 状态联动

- [ ] 在 `runNode`/`runWorkflow` 的 `isExecutable` 中**不**加入 image/text 生成器（生成器只由节点内按钮触发，避免整组运行重复调 API）。保持：

```ts
function isExecutable(node: WbNode) {
  return node.kind === 'resize' || node.kind === 'save' || node.kind === 'ai-tag' || node.kind === 'ai-text'
}
```

- [ ] 确认图片/文本节点生成完成后的 `execState` 会触发节点徽章（`wb-node--done`），失败标红；在 `clearCanvas`/`removeSelected` 中由现有快照机制覆盖，无需额外改动

### Task 7 Step 2: 全量验证

- [ ] 运行：`npm run typecheck`，预期 PASS
- [ ] 运行：`npm test -- --run`，预期 235 项全过（含 Task 1 新增 3 项）
- [ ] 运行：`npm run build`，预期成功

### Task 7 Step 3: 手动验收清单

- [ ] 文生图：图片节点选配置 → 文生图 → 生成 → 派生新节点并连线
- [ ] 图生图：切到图生图模式 → 生成（服务支持）或明确报错（不支持）
- [ ] 文本节点：模板 `{{input}}` 生成 → 正文被替换 → Ctrl+Z 可撤销
- [ ] 本地工具：缩放/旋转/宫格/裁剪
- [ ] AI 工具：未选配置/接口不支持时标红并提示原因
- [ ] 圆角：新增内容区无方角露出

### Task 7 Step 4: 提交

- [ ] `git add src/views/Workbench.vue`
- [ ] `git commit -m "chore(workbench): LibTV 式节点功能完善"`

---

## Self-Review 记录

- **Spec 覆盖**：文生图/图生图（Task 3）、文本内嵌生成器（Task 4）、派生连线（Task 2/3）、本地工具（Task 5）、AI 工具（Task 6）、状态/错误（Task 3-7）、通用生图接口（Task 1）、测试与构建（Task 1/7）全部有对应任务。
- **无占位符**：所有代码步骤含完整代码；无 TBD/TODO。
- **类型一致性**：`deriveImageNode(source, newSrc, label?, snap?)` 各任务调用一致；`runImageGen`/`runTextGen`/`runImageTool`/`applyCanvasTool` 命名全篇一致；新增 WbNode 字段 `genMode`/`genPrompt`/`genSize` 在 Task 2 定义并在 Task 3 使用。
