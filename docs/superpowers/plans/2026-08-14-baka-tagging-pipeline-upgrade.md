# 图库标注流水线升级 C1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把现有本地 WD14 打标升级为统一打标流水线，支持本地、LLM、组合三种来源，标签/自然语言/标签+自然语言三种输出模式，以及完整的预览和后处理。

**Architecture:** 新增 `tagging-pipeline.js` 和 `tagging-postprocess.js` 统一编排与清洗；升级 `llm.js` 支持多配置和多 Key；扩展 ONNX 模型目录；渲染进程增加统一设置面板和结果预览。

**Tech Stack:** Electron、Node.js、Vue 3、Vitest、TypeScript。

---

## 文件结构

- Create: `electron/ipc/tagging-postprocess.js`
- Create: `electron/ipc/tagging-pipeline.js`
- Create: `electron/ipc/llm-tagger.js`
- Create: `electron/ipc/onnx-tagger.js`
- Modify: `electron/ipc/llm.js`
- Modify: `electron/ipc/tagger-v2.js`
- Modify: `electron/ipc/tagger-worker.js`
- Modify: `electron/preload.js`
- Modify: `electron/ipc/channels.js`
- Modify: `src/env.d.ts`
- Modify: `src/stores/tagger.ts`
- Modify: `src/components/tagger/TagSettingsPanel.vue`
- Modify: `src/views/Tagger.vue`
- Create: `src/components/tagger/TaggingPreviewDialog.vue`
- Create: `electron/ipc/__tests__/tagging-postprocess.spec.ts`
- Create: `electron/ipc/__tests__/tagging-pipeline.spec.ts`

---

### Task 1: 标签后处理模块

**Files:**
- Create: `electron/ipc/tagging-postprocess.js`
- Create: `electron/ipc/__tests__/tagging-postprocess.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest'
import { postprocessTags, parseStructuredOutput } from '../tagging-postprocess.js'

describe('tagging postprocess', () => {
  it('parses structured tags and natural language', () => {
    const raw = '<TAGS>\n1girl, long hair, blue eyes\n</TAGS>\n<NL>\n一个蓝色长发的女孩\n</NL>'
    const result = parseStructuredOutput(raw)
    expect(result.tags).toEqual(['1girl', 'long hair', 'blue eyes'])
    expect(result.natural).toBe('一个蓝色长发的女孩')
  })

  it('deduplicates and applies prefix/suffix', () => {
    const result = postprocessTags(['1girl', 'long hair', 'long hair', 'blue_eyes'], {
      prefix: 'anime',
      suffix: 'style',
      replaceUnderscores: true,
    })
    expect(result).toEqual(['anime 1girl style', 'anime long hair style', 'anime blue eyes style'])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm.cmd test -- electron/ipc/__tests__/tagging-postprocess.spec.ts`

Expected: FAIL

- [ ] **Step 3: 实现后处理**

```js
function parseStructuredOutput(raw) {
  const tagsMatch = String(raw || '').match(/<TAGS>([\s\S]*?)<\/TAGS>/i)
  const nlMatch = String(raw || '').match(/<NL>([\s\S]*?)<\/NL>/i)
  return {
    tags: parseTagText(tagsMatch?.[1] || ''),
    natural: (nlMatch?.[1] || '').trim(),
  }
}

function parseTagText(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[`\\]/g, '')
    .split(/[\n\r;，,]+/)
    .map(tag => tag.replace(/^[\s\-*.)]+/, '').replace(/["']/g, '').trim())
    .filter(Boolean)
}

function postprocessTags(tags, options = {}) {
  const seen = new Set()
  const result = []
  for (const tag of tags || []) {
    let value = String(tag).trim()
    if (!value || seen.has(value.toLowerCase())) continue
    seen.add(value.toLowerCase())
    if (options.replaceUnderscores) value = value.replace(/_/g, ' ')
    if (options.prefix) value = `${options.prefix} ${value}`
    if (options.suffix) value = `${value} ${options.suffix}`
    result.push(value)
  }
  if (options.sort === 'alphabetical') result.sort((a, b) => a.localeCompare(b))
  return result
}

module.exports = { parseStructuredOutput, postprocessTags }
```

- [ ] **Step 4: 运行测试确认通过**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/tagging-postprocess.js electron/ipc/__tests__/tagging-postprocess.spec.ts
git commit -m "feat: add tagging postprocess"
```

---

### Task 2: 提示词模板库

**Files:**
- Create: `electron/ipc/tagging-pipeline.js`

- [ ] **Step 1: 定义模板**

在 `tagging-pipeline.js` 中实现：

```js
const PROMPT_TEMPLATES = [
  {
    id: 'danbooru-tags',
    name: 'Danbooru Tags',
    build: ({ extra }) => `You are a tagger. Output only comma-separated Danbooru tags. ${extra || ''}`,
  },
  {
    id: 'natural',
    name: 'Natural Language',
    build: ({ extra }) => `Describe this image in natural language. ${extra || ''}`,
  },
  {
    id: 'tags-and-natural',
    name: 'Tags + Natural',
    build: ({ extra }) => `Output <TAGS>...</TAGS> and <NL>...</NL>. ${extra || ''}`,
  },
]
```

- [ ] **Step 2: 增加测试**

测试选择模板后生成的提示词包含对应关键字。

- [ ] **Step 3: Commit**

```bash
git add electron/ipc/tagging-pipeline.js
git commit -m "feat: add prompt template catalog"
```

---

### Task 3: LLM Tagger 服务

**Files:**
- Create: `electron/ipc/llm-tagger.js`
- Modify: `electron/ipc/llm.js`

- [ ] **Step 1: 提取多配置逻辑**

`llm-tagger.js` 负责：

```js
class LlmTagger {
  constructor(configs) { this.configs = configs; this.index = 0 }
  nextConfig() { return this.configs[this.index++ % this.configs.length] }
}
```

- [ ] **Step 2: 支持并发和取消**

使用任务队列，限制并发，返回进度。

- [ ] **Step 3: 测试多 Key 轮换**

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add electron/ipc/llm-tagger.js electron/ipc/llm.js
git commit -m "feat: add llm tagger service"
```

---

### Task 4: ONNX 模型目录

**Files:**
- Create: `electron/ipc/onnx-tagger.js`
- Modify: `electron/ipc/tagger-models.js`

- [ ] **Step 1: 定义模型目录**

WD14、PixAI、CL Tagger 条目，包含：

- id
- 名称
- 仓库
- 输入尺寸
- 默认阈值
- 下载地址

- [ ] **Step 2: 下载和缓存**

使用 HuggingFace 下载接口，支持镜像和受限 Token。

- [ ] **Step 3: 测试模型选择**

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add electron/ipc/onnx-tagger.js electron/ipc/tagger-models.js
git commit -m "feat: add onnx model catalog"
```

---

### Task 5: 统一流水线编排

**Files:**
- Modify: `electron/ipc/tagging-pipeline.js`

- [ ] **Step 1: 实现 `generateTags`**

```js
async function generateTags(params) {
  if (params.source === 'local') return runLocal(params)
  if (params.source === 'llm') return runLlm(params)
  if (params.source === 'combined') {
    const local = await runLocal(params)
    return runLlm({ ...params, localTags: local.tags })
  }
  return { tags: [], natural: '' }
}
```

- [ ] **Step 2: 组合模式测试**

测试确认先调用本地，再调用 LLM。

- [ ] **Step 3: Commit**

```bash
git add electron/ipc/tagging-pipeline.js
git commit -m "feat: orchestrate tagging pipeline"
```

---

### Task 6: IPC / preload / 类型声明

**Files:**
- Modify: `electron/ipc/channels.js`
- Modify: `electron/preload.js`
- Modify: `src/env.d.ts`

- [ ] **Step 1: 增加通道**

```js
TAGGING_GENERATE: 'tagging:generate',
TAGGING_PREVIEW: 'tagging:preview',
TAGGING_APPLY: 'tagging:apply',
```

- [ ] **Step 2: 暴露 API**

```js
contextBridge.exposeInMainWorld('taggingAPI', {
  generate: (params) => ipcRenderer.invoke('tagging:generate', params),
  preview: (params) => ipcRenderer.invoke('tagging:preview', params),
  apply: (params) => ipcRenderer.invoke('tagging:apply', params),
})
```

- [ ] **Step 3: 更新类型**

新增 `TaggingAPI` 和 `TaggingOptions`。

- [ ] **Step 4: 运行通道检查**

Run: `npm.cmd run check:ipc`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/channels.js electron/preload.js src/env.d.ts
git commit -m "feat: wire tagging pipeline API"
```

---

### Task 7: 前端设置面板与预览

**Files:**
- Modify: `src/components/tagger/TagSettingsPanel.vue`
- Modify: `src/views/Tagger.vue`
- Create: `src/components/tagger/TaggingPreviewDialog.vue`

- [ ] **Step 1: 重构设置面板**

加入来源、输出模式、LLM 配置、提示词模板、并发、写入模式。

- [ ] **Step 2: Tagger.vue 接入 generate**

点击“开始生成”调用 `window.taggingAPI.preview`，确认后 `apply`。

- [ ] **Step 3: 预览弹窗**

显示标签/自然语言预览、添加/删除标签、确认按钮。

- [ ] **Step 4: 运行 UI 测试和类型检查**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/tagger/TagSettingsPanel.vue src/views/Tagger.vue src/components/tagger/TaggingPreviewDialog.vue
git commit -m "feat: add tagging pipeline ui"
```

---

### Task 8: 视频抽帧支持

**Files:**
- Modify: `electron/ipc/llm-tagger.js`

- [ ] **Step 1: 视频抽帧**

使用 FFmpeg 抽 1–N 帧，交给 LLM。

- [ ] **Step 2: 测试视频帧生成**

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add electron/ipc/llm-tagger.js
git commit -m "feat: add video frame tagging"
```

---

### Task 9: 集成验证

- [ ] **Step 1: 运行相关测试**

Run: `npm.cmd test -- electron/ipc/__tests__/tagging-postprocess.spec.ts electron/ipc/__tests__/tagging-pipeline.spec.ts electron/ipc/__tests__/annotation-workspace-ui.spec.ts`

Expected: 全部 PASS

- [ ] **Step 2: 类型检查**

Run: `npm.cmd run typecheck`

Expected: PASS

- [ ] **Step 3: 手动验收**

- 标签、自然语言、标签 + 自然语言三种输出可选。
- 本地、LLM、组合三种来源可选。
- 提示词模板可切换。
- 写入前预览。
- 批量进度和取消可用。
- 失败不破坏原文件。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test: complete tagging pipeline verification"
```
