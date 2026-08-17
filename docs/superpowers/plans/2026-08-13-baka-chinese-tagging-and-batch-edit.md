# 图库中文标签匹配、批量修标签与父子标签 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Baka TOOLS 实现中文标签反查、批量改标签、分类排序筛选，以及父子标签冲突检测与合并。

**Architecture:** 主进程新增 `tag-catalog.js` 加载本地标签数据，扩展 `tagger-vocab.js` 和 `tagger-v2.js` 提供搜索与批量修改 IPC；渲染进程新增批量改标签弹窗，并增强 TagEditor。

**Tech Stack:** Electron、Node.js、SQLite(sql.js)、Vue 3、Vitest、TypeScript。

---

## 文件结构

- Create: `electron/ipc/tag-catalog.js`
- Create: `resources/tag-data/danbooru-0-zh.csv`
- Create: `resources/tag-data/danbooru_character_tags.csv`
- Modify: `electron/ipc/tagger-vocab.js`
- Modify: `electron/ipc/tagger-v2.js`
- Modify: `electron/preload.js`
- Modify: `electron/ipc/channels.js`
- Modify: `src/env.d.ts`
- Modify: `src/components/tagger/TagEditor.vue`
- Modify: `src/components/tagger/GallerySelectionBar.vue`
- Create: `src/components/tagger/BatchTagDialog.vue`
- Modify: `src/views/Gallery.vue`
- Create: `electron/ipc/__tests__/tag-catalog.spec.ts`
- Create: `electron/ipc/__tests__/bulk-tag-edit.spec.ts`

---

### Task 1: 内置标签数据

**Files:**
- Create: `resources/tag-data/danbooru-0-zh.csv`
- Create: `resources/tag-data/danbooru_character_tags.csv`

- [ ] **Step 1: 放置两个 CSV 文件**

从兼容的公开标签数据源复制两份 CSV 到 `resources/tag-data/`。文件格式：

`danbooru-0-zh.csv`：

```csv
english_tag,chinese_name
blue_hair,蓝色头发
long_hair,长发
hatsune_miku,初音未来
```

`danbooru_character_tags.csv`：

```csv
child_tag,parent_tag,chinese_name
racing_miku,hatsune_miku,赛车初音
dark_miku,hatsune_miku,暗黑初音
```

- [ ] **Step 2: 确认文件可读取**

Run: `node -e "const fs=require('fs'); console.log(fs.readFileSync('resources/tag-data/danbooru-0-zh.csv','utf8').slice(0,100))"`

Expected: 输出 CSV 开头内容，无乱码。

- [ ] **Step 3: Commit**

```bash
git add resources/tag-data
git commit -m "data: add tag dictionary and character relations"
```

---

### Task 2: TagCatalog 加载与查询

**Files:**
- Create: `electron/ipc/tag-catalog.js`
- Create: `electron/ipc/__tests__/tag-catalog.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TagCatalog } from '../tag-catalog.js'

describe('tag catalog', () => {
  it('finds english tags by chinese name', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'baka-catalog-'))
    const zhPath = join(dir, 'zh.csv')
    const charPath = join(dir, 'chars.csv')
    writeFileSync(zhPath, 'english_tag,chinese_name\nblue_hair,蓝色头发\nlong_hair,长发\n', 'utf8')
    writeFileSync(charPath, 'child_tag,parent_tag,chinese_name\nracing_miku,hatsune_miku,赛车初音\n', 'utf8')

    const catalog = await TagCatalog.load({ zhPath, characterPath: charPath })
    expect(catalog.searchChinese('蓝色长发')).toContainEqual(expect.objectContaining({ tag: 'blue_hair' }))
    expect(catalog.getParent('racing_miku')).toBe('hatsune_miku')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm.cmd test -- electron/ipc/__tests__/tag-catalog.spec.ts`

Expected: FAIL

- [ ] **Step 3: 实现 TagCatalog**

```js
const fs = require('fs')
const path = require('path')

class TagCatalog {
  constructor(entries) {
    this.entries = entries
    this.byEnglish = new Map(entries.map(e => [e.tag.toLowerCase(), e]))
    this.byChinese = new Map()
    for (const entry of entries) {
      for (const name of entry.chineseNames || []) {
        this.byChinese.set(name.toLowerCase(), entry)
      }
    }
    this.parentByChild = new Map(entries.filter(e => e.parent).map(e => [e.tag.toLowerCase(), e.parent]))
  }

  searchChinese(query) {
    const q = query.toLowerCase()
    const results = []
    for (const [name, entry] of this.byChinese) {
      if (name.includes(q) || entry.tag.includes(q)) results.push(entry)
    }
    return results.slice(0, 50)
  }

  getParent(tag) {
    return this.parentByChild.get(tag.toLowerCase()) || null
  }

  static async load({ zhPath, characterPath }) {
    const entries = []
    const zhText = fs.readFileSync(zhPath, 'utf8')
    for (const line of zhText.split('\n').slice(1)) {
      const [tag, chinese] = line.split(',').map(s => s.trim())
      if (tag && chinese) entries.push({ tag, chineseNames: [chinese] })
    }
    const charText = fs.readFileSync(characterPath, 'utf8')
    for (const line of charText.split('\n').slice(1)) {
      const [child, parent, chinese] = line.split(',').map(s => s.trim())
      if (!child || !parent) continue
      const existing = entries.find(e => e.tag.toLowerCase() === child.toLowerCase())
      if (existing) {
        existing.parent = parent
        if (chinese && !existing.chineseNames.some(n => n.toLowerCase() === chinese.toLowerCase())) existing.chineseNames.push(chinese)
      } else {
        entries.push({ tag: child, parent, chineseNames: chinese ? [chinese] : [] })
      }
    }
    return new TagCatalog(entries)
  }
}

module.exports = { TagCatalog }
```

- [ ] **Step 4: 运行测试确认通过**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/tag-catalog.js electron/ipc/__tests__/tag-catalog.spec.ts
git commit -m "feat: add tag catalog"
```

---

### Task 3: 扩展标签搜索 IPC

**Files:**
- Modify: `electron/ipc/tagger-vocab.js`

- [ ] **Step 1: 加载 TagCatalog**

在 `tagger-vocab.js` 顶部增加：

```js
const { TagCatalog } = require('./tag-catalog')
let catalogPromise = null
function getCatalog() {
  if (!catalogPromise) {
    catalogPromise = TagCatalog.load({
      zhPath: path.join(__dirname, '../../resources/tag-data/danbooru-0-zh.csv'),
      characterPath: path.join(__dirname, '../../resources/tag-data/danbooru_character_tags.csv'),
    }).catch(() => new TagCatalog([]))
  }
  return catalogPromise
}
```

- [ ] **Step 2: 修改 search handler**

当 `query` 含中文时，先查 TagCatalog，再合并原有英文搜索结果。

- [ ] **Step 3: 运行现有 vocab 测试**

Run: `npm.cmd test -- electron/ipc/__tests__/tagger-v2.spec.ts`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add electron/ipc/tagger-vocab.js
git commit -m "feat: add chinese tag search"
```

---

### Task 4: 实现批量改标签后端

**Files:**
- Modify: `electron/ipc/tagger-v2.js`
- Create: `electron/ipc/__tests__/bulk-tag-edit.spec.ts`

- [ ] **Step 1: 写失败测试**

测试 `bulkApply` 添加标签后，数据库标签和 caption 文件一致。

- [ ] **Step 2: 实现 `bulkDryRun`**

使用 `gallery.js` 的 `getImageTags` 和 `setImageTags` 相关数据库查询，根据 `BulkOperation` 生成 `previews`。

- [ ] **Step 3: 实现 `bulkApply`**

确认后批量写入数据库，并使用 `safe-file.js` 更新同名 caption 文件。

- [ ] **Step 4: 运行测试确认通过**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/tagger-v2.js electron/ipc/__tests__/bulk-tag-edit.spec.ts
git commit -m "feat: implement bulk tag editing"
```

---

### Task 5: 增强 TagEditor

**Files:**
- Modify: `src/components/tagger/TagEditor.vue`

- [ ] **Step 1: 搜索框支持中文结果展示**

在结果项中显示中文名和类别。

- [ ] **Step 2: 增加分类筛选**

使用 `taggerV2API.getCategories()` 填充下拉框。

- [ ] **Step 3: 运行 UI 测试和类型检查**

Run: `npm.cmd test -- electron/ipc/__tests__/annotation-workspace-ui.spec.ts` 和 `npm.cmd run typecheck`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/tagger/TagEditor.vue
git commit -m "feat: enhance tag editor search and category filter"
```

---

### Task 6: 批量改标签 UI

**Files:**
- Create: `src/components/tagger/BatchTagDialog.vue`
- Modify: `src/components/tagger/GallerySelectionBar.vue`
- Modify: `src/views/Gallery.vue`

- [ ] **Step 1: 创建 BatchTagDialog**

包含操作类型、标签输入、预览列表、确认按钮。

- [ ] **Step 2: 选择栏增加“批量改标签”按钮**

在 `GallerySelectionBar.vue` 中增加 `editTags` 事件。

- [ ] **Step 3: Gallery.vue 接入弹窗**

打开弹窗，调用 `bulkDryRun`，确认后调用 `bulkApply`，完成后刷新标签。

- [ ] **Step 4: 运行 UI 测试和类型检查**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/tagger/BatchTagDialog.vue src/components/tagger/GallerySelectionBar.vue src/views/Gallery.vue
git commit -m "feat: add batch tag dialog"
```

---

### Task 7: 父子标签冲突与合并

**Files:**
- Modify: `electron/ipc/tagger-v2.js`
- Modify: `src/components/tagger/BatchTagDialog.vue`

- [ ] **Step 1: 增加 `cleanup` 操作**

扫描目标图片，识别父子标签冲突，生成建议。

- [ ] **Step 2: 批量应用合并**

子标签出现次数低于阈值时，建议替换为父标签；用户在预览中勾选后应用。

- [ ] **Step 3: 测试**

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add electron/ipc/tagger-v2.js src/components/tagger/BatchTagDialog.vue
git commit -m "feat: add parent-child tag merge"
```

---

### Task 8: 集成验证

- [ ] **Step 1: 运行相关测试**

Run: `npm.cmd test -- electron/ipc/__tests__/tag-catalog.spec.ts electron/ipc/__tests__/bulk-tag-edit.spec.ts electron/ipc/__tests__/annotation-workspace-ui.spec.ts`

Expected: 全部 PASS

- [ ] **Step 2: 类型检查**

Run: `npm.cmd run typecheck`

Expected: PASS

- [ ] **Step 3: 手动验收**

- 输入中文能搜到英文标签。
- 批量添加、删除、替换先预览后应用。
- caption 文件与数据库一致。
- 分类筛选可用。
- 父子标签冲突能预览和合并。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test: complete chinese tag and batch edit verification"
```
