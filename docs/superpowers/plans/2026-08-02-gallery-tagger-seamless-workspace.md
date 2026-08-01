# 图库与标注无框一体化工作台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除侧栏重复品牌区，并让图库和标注成为与应用窗口连续的无框工作区，同时保持全部现有业务行为。

**Architecture:** 不改 Pinia、路由、IPC 或图库—标注交接，只调整现有 Vue 模板的视觉容器和组件自身表面。侧栏、图库、标注分成三个可独立验证的提交；每部分先加入源码契约测试并确认失败，再进行最小模板与样式修改。

**Tech Stack:** Vue 3 SFC、TypeScript、Pinia、Vitest、CSS scoped styles、Electron/Vite

---

## 文件结构与职责

- `src/components/sidebar/AppSidebar.vue`：删除重复品牌入口，重新安排导航顶部留白和活动轨道。
- `src/components/sidebar/__tests__/AppSidebar.spec.ts`：验证侧栏只通过“主页”导航进入首页。
- `electron/ipc/__tests__/dashboard-interaction-ui.spec.ts`：锁定侧栏活动轨道和动态反馈。
- `src/views/Gallery.vue`：把图库外壳改为连续工作区，处理主布局、拖入层、数据集工具带和响应式间距。
- `src/components/tagger/GallerySidebar.vue`：图库来源区的低对比辅助表面。
- `src/components/tagger/GalleryToolbar.vue`：图库轻量工具带。
- `src/components/tagger/GalleryInspector.vue`：按需出现的右侧辅助表面及窄窗覆盖布局。
- `src/components/tagger/GalleryGrid.vue`：保持图片卡片交互，并补齐减少动态效果。
- `electron/ipc/__tests__/gallery-workspace-ui.spec.ts`：验证图库无外壳，同时保护拖入、元数据和联动能力。
- `src/views/Tagger.vue`：将标注三栏从完整边框外壳改为有间距的工作区。
- `src/components/tagger/TagQueue.vue`：队列辅助表面和简化空状态。
- `src/components/tagger/TagEditor.vue`：标签校对辅助表面及局部滚动。
- `electron/ipc/__tests__/annotation-workspace-ui.spec.ts`：验证三栏仍在、外壳消失、主要空状态集中在预览区。

### Task 1: 删除侧栏重复品牌区

**Files:**
- Modify: `src/components/sidebar/AppSidebar.vue:55-155`
- Modify: `src/components/sidebar/__tests__/AppSidebar.spec.ts:10-73`
- Modify: `electron/ipc/__tests__/dashboard-interaction-ui.spec.ts:103-122`

- [ ] **Step 1: 写入失败测试**

在 `AppSidebar.spec.ts` 的挂载后断言中加入：

```ts
expect(host.querySelector('.sidebar-brand')).toBeNull()
expect(host.querySelector('.brand-mark')).toBeNull()
expect(host.querySelector('.brand-name')).toBeNull()
expect(host.querySelectorAll('.nav-item')).toHaveLength(APP_NAVIGATION.length)
expect(host.querySelector<HTMLButtonElement>('.nav-item')?.getAttribute('aria-label')).toBe('主页')
```

将 `dashboard-interaction-ui.spec.ts` 的活动轨道契约改为顶部 16 像素，并加入品牌移除断言：

```ts
expect(sidebar).not.toContain('class="sidebar-brand"')
expect(sidebar).not.toContain('class="brand-mark"')
expect(sidebar).not.toContain('class="brand-name"')
expect(sidebar).toMatch(/\.sidebar-nav\s*\{[^}]*padding:\s*16px 10px 12px;/s)
expect(sidebar).toMatch(/\.sidebar-active-rail\s*\{[^}]*top:\s*16px;[^}]*left:\s*5px;/s)
```

- [ ] **Step 2: 运行测试并确认因旧品牌区而失败**

Run:

```powershell
npm.cmd test -- --run src/components/sidebar/__tests__/AppSidebar.spec.ts electron/ipc/__tests__/dashboard-interaction-ui.spec.ts
```

Expected: FAIL，失败信息包含 `.sidebar-brand` 仍存在或活动轨道 `top: 12px`。

- [ ] **Step 3: 做最小侧栏改造**

从 `AppSidebar.vue` 模板删除整个品牌按钮：

```vue
<button class="sidebar-brand" type="button" aria-label="Baka TOOLS 首页" title="Baka TOOLS 首页" @click="navigateTo('/')">
  <span class="brand-mark">B</span>
  <span class="brand-name">Baka TOOLS</span>
</button>
```

将相关样式收敛为：

```css
.app-sidebar { position: relative; z-index: 1; display: flex; flex-direction: column; min-height: 0; border: 0; background: color-mix(in srgb, var(--app-bg) 88%, var(--brand-soft)); }
.nav-item, .tool-subnav-item { font: inherit; border: 0; cursor: pointer; }
.sidebar-nav { position: relative; display: grid; gap: 4px; padding: 16px 10px 12px; border: 0; }
.sidebar-active-rail { position: absolute; z-index: 2; top: 16px; left: 5px; width: 3px; height: 40px; border-radius: 999px; background: var(--brand-primary); box-shadow: 0 0 10px color-mix(in srgb, var(--brand-primary) 72%, transparent); transform: translateY(calc(var(--active-navigation-index) * 44px)); transition: transform 240ms cubic-bezier(.2, .8, .2, 1); pointer-events: none; }
```

将紧凑侧栏媒体查询中的品牌选择器删除：

```css
@media (max-width: 1200px) {
  .nav-item { justify-content: center; padding-inline: 0; }
  .nav-label, .local-status-label, .sidebar-version { display: none; }
}
```

- [ ] **Step 4: 运行侧栏测试并确认通过**

Run:

```powershell
npm.cmd test -- --run src/components/sidebar/__tests__/AppSidebar.spec.ts src/components/sidebar/__tests__/sidebar-layout.spec.ts electron/ipc/__tests__/dashboard-interaction-ui.spec.ts electron/ipc/__tests__/visual-acceptance-ui.spec.ts
```

Expected: PASS，且现有工具子导航、焦点、减少动态效果测试保持通过。

- [ ] **Step 5: 提交侧栏改造**

```powershell
git add -- src/components/sidebar/AppSidebar.vue src/components/sidebar/__tests__/AppSidebar.spec.ts electron/ipc/__tests__/dashboard-interaction-ui.spec.ts
git commit -m "style: remove duplicate sidebar branding"
```

### Task 2: 将图库改造成连续无框工作区

**Files:**
- Modify: `src/views/Gallery.vue:473-641`
- Modify: `src/components/tagger/GallerySidebar.vue:56-75`
- Modify: `src/components/tagger/GalleryToolbar.vue:54-70`
- Modify: `src/components/tagger/GalleryInspector.vue:32-45`
- Modify: `src/components/tagger/GalleryGrid.vue:143-168`
- Modify: `electron/ipc/__tests__/gallery-workspace-ui.spec.ts:1-112`

- [ ] **Step 1: 写入图库无外壳失败测试**

在 `gallery-workspace-ui.spec.ts` 顶部加入规则读取帮助函数：

```ts
const rule = (source: string, selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 's'))?.[1] ?? ''
}
```

新增用例：

```ts
it('blends gallery sources, toolbar, stage, and inspector into one window canvas', () => {
  const gallery = read('src/views/Gallery.vue')
  const sidebar = read('src/components/tagger/GallerySidebar.vue')
  const toolbar = read('src/components/tagger/GalleryToolbar.vue')
  const inspector = read('src/components/tagger/GalleryInspector.vue')

  expect(gallery).toContain('class="gallery-workspace"')
  expect(gallery).not.toContain('class="gallery-shell"')
  expect(rule(gallery, '.gallery-workspace')).toMatch(/border:\s*0/)
  expect(rule(gallery, '.gallery-workspace')).toMatch(/background:\s*transparent/)
  expect(rule(gallery, '.gallery-workspace')).toMatch(/box-shadow:\s*none/)
  expect(rule(gallery, '.gallery-workspace')).toMatch(/gap:\s*14px/)
  expect(rule(sidebar, '.gallery-sidebar')).toMatch(/border:\s*0/)
  expect(rule(toolbar, '.gallery-toolbar')).toMatch(/border:\s*0/)
  expect(rule(inspector, '.gallery-inspector')).toMatch(/border:\s*0/)
  expect(rule(gallery, '.dataset-toolbar')).toMatch(/border:\s*0/)
})

it('keeps the gallery fluid and quiet when motion is reduced', () => {
  const gallery = read('src/views/Gallery.vue')
  const grid = read('src/components/tagger/GalleryGrid.vue')

  expect(gallery).toMatch(/@media \(max-width:\s*980px\)[\s\S]*gallery-inspector/)
  expect(gallery).toMatch(/@media \(max-width:\s*760px\)[\s\S]*overflow-x:\s*hidden/)
  expect(grid).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*\.image-card[^}]*transition:\s*none/)
})
```

- [ ] **Step 2: 运行图库测试并确认旧外壳导致失败**

Run:

```powershell
npm.cmd test -- --run electron/ipc/__tests__/gallery-workspace-ui.spec.ts
```

Expected: FAIL，失败信息包含 `gallery-workspace` 缺失、旧 `gallery-shell` 存在或辅助区仍使用完整边线。

- [ ] **Step 3: 替换图库根外壳和主布局样式**

将模板中的 `gallery-shell` 重命名为 `gallery-workspace`，业务事件与子组件保持原样。将主布局样式替换为：

```css
.gallery-page { height: calc(100vh - 72px); min-height: 560px; display: flex; flex-direction: column; padding: 10px 14px 14px; color: var(--text-primary); overflow: hidden; }
.gallery-workspace { position: relative; flex: 1; min-width: 0; min-height: 0; display: flex; gap: 14px; overflow: hidden; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
.gallery-content { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.gallery-stage { position: relative; flex: 1; min-width: 0; min-height: 0; display: flex; gap: 12px; overflow: hidden; }
.gallery-stage :deep(.gallery-grid-scroll) { flex: 1; min-width: 0; }
.gallery-drag-overlay { position: absolute; inset: 0; z-index: 80; display: grid; place-items: center; pointer-events: none; border: 0; border-radius: 14px; background: color-mix(in srgb, var(--app-bg) 82%, var(--brand-soft)); box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--brand-primary) 54%, transparent); backdrop-filter: blur(10px); }
.dataset-toolbar { height: 44px; flex: 0 0 44px; display: flex; align-items: center; gap: 8px; margin-bottom: 10px; padding: 0 10px; border: 0; border-radius: 10px; background: color-mix(in srgb, var(--surface-secondary) 68%, transparent); }
```

补充图库响应式规则：

```css
@media (max-width: 980px) {
  .gallery-stage :deep(.gallery-inspector) { position: absolute; z-index: 20; top: 10px; right: 10px; bottom: 10px; width: min(280px, calc(100% - 20px)); box-shadow: var(--surface-shadow); }
}
@media (max-width: 760px) {
  .gallery-page { padding: 8px; overflow-x: hidden; }
  .gallery-workspace { gap: 8px; }
}
```

- [ ] **Step 4: 让图库子区域使用色阶和留白**

将四个子组件的根样式调整为：

```css
/* GallerySidebar.vue */
.gallery-sidebar { width: 198px; flex: 0 0 198px; min-height: 0; display: flex; flex-direction: column; border: 0; border-radius: 12px; background: linear-gradient(180deg, color-mix(in srgb, var(--surface-secondary) 74%, transparent), transparent 88%); }
@media (max-width: 1200px) { .gallery-sidebar { width: 178px; flex-basis: 178px; } }

/* GalleryToolbar.vue */
.gallery-toolbar { height: 44px; flex: 0 0 44px; min-width: 0; display: flex; align-items: center; gap: 7px; margin-bottom: 10px; padding: 0 10px; border: 0; border-radius: 10px; background: color-mix(in srgb, var(--surface-secondary) 62%, transparent); white-space: nowrap; }

/* GalleryInspector.vue */
.gallery-inspector { width: 250px; flex: 0 0 250px; min-height: 0; overflow: auto; padding: 14px; border: 0; border-radius: 12px; background: linear-gradient(180deg, color-mix(in srgb, var(--surface-secondary) 78%, transparent), color-mix(in srgb, var(--surface-secondary) 48%, transparent)); }

/* GalleryGrid.vue */
@media (prefers-reduced-motion: reduce) {
  .image-card { transition: none; }
  .image-card:hover,
  .image-card:focus-visible { transform: none; }
}
```

图片卡片、选择条、弹窗和元数据查看器的边界保持不变，因为它们是交互对象或浮层，而不是页面外壳。

- [ ] **Step 5: 运行图库相关测试并确认全部通过**

Run:

```powershell
npm.cmd test -- --run electron/ipc/__tests__/gallery-workspace-ui.spec.ts electron/ipc/__tests__/gallery-tagger-routes.spec.ts electron/ipc/__tests__/metadata-viewer-ui.spec.ts electron/ipc/__tests__/gallery-scan.spec.ts
```

Expected: PASS；`gallery-workspace-ui.spec.ts` 内的拖入读取与批量导入契约继续通过。

- [ ] **Step 6: 提交图库改造**

```powershell
git add -- src/views/Gallery.vue src/components/tagger/GallerySidebar.vue src/components/tagger/GalleryToolbar.vue src/components/tagger/GalleryInspector.vue src/components/tagger/GalleryGrid.vue electron/ipc/__tests__/gallery-workspace-ui.spec.ts
git commit -m "style: blend gallery into the app canvas"
```

### Task 3: 将标注改造成分区无框工作台

**Files:**
- Modify: `src/views/Tagger.vue:106-205`
- Modify: `src/components/tagger/TagQueue.vue:1-34`
- Modify: `src/components/tagger/TagEditor.vue:1-48`
- Modify: `electron/ipc/__tests__/annotation-workspace-ui.spec.ts:1-55`

- [ ] **Step 1: 写入标注无外壳失败测试**

在 `annotation-workspace-ui.spec.ts` 顶部加入与 Task 2 相同的 `rule` 帮助函数，并新增：

```ts
it('uses spaced work zones instead of a framed embedded tool', () => {
  const page = read('src/views/Tagger.vue')
  const queue = read('src/components/tagger/TagQueue.vue')
  const editor = read('src/components/tagger/TagEditor.vue')

  expect(page).toContain('class="tagger-layout"')
  expect(page).not.toContain('class="tagger-shell"')
  expect(rule(page, '.tagger-layout')).toMatch(/gap:\s*14px/)
  expect(rule(page, '.tagger-layout')).toMatch(/border:\s*0/)
  expect(rule(page, '.tagger-layout')).toMatch(/background:\s*transparent/)
  expect(rule(page, '.tagger-layout')).toMatch(/box-shadow:\s*none/)
  expect(rule(queue, '.tag-queue')).toMatch(/border:\s*0/)
  expect(rule(editor, '.tag-editor')).toMatch(/border:\s*0/)
  expect(rule(page, '.tagger-preview__toolbar')).toMatch(/border:\s*0/)
  expect(rule(page, '.tagger-preview__progress')).toMatch(/border:\s*0/)
})

it('keeps one primary empty-state message in the preview', () => {
  const page = read('src/views/Tagger.vue')
  const queue = read('src/components/tagger/TagQueue.vue')
  const editor = read('src/components/tagger/TagEditor.vue')

  expect(page).toContain("'先准备一批图片吧'")
  expect(queue).not.toContain('<strong>队列是空的</strong>')
  expect(editor).not.toContain('<strong>选择一张图片开始</strong>')
})

it('keeps all three zones usable without page-level horizontal overflow', () => {
  const page = read('src/views/Tagger.vue')
  const editor = read('src/components/tagger/TagEditor.vue')
  expect(page).toMatch(/@media \(max-width:\s*1200px\)[\s\S]*\.tagger-layout/)
  expect(page).toMatch(/@media \(max-width:\s*760px\)[\s\S]*overflow-x:\s*hidden/)
  expect(editor).toMatch(/@media \(max-width:\s*980px\)[\s\S]*\.tag-editor\s*\{[^}]*position:\s*absolute/)
})
```

- [ ] **Step 2: 运行测试并确认旧三栏外壳导致失败**

Run:

```powershell
npm.cmd test -- --run electron/ipc/__tests__/annotation-workspace-ui.spec.ts
```

Expected: FAIL，失败信息包含 `tagger-layout` 缺失、旧 `tagger-shell` 存在或队列/编辑器仍有左右硬边线。

- [ ] **Step 3: 替换标注根外壳和中央画布样式**

把模板 `class="tagger-shell"` 改为 `class="tagger-layout"`，保留 `TagQueue`、`TagEditor` 和所有事件绑定。样式替换为：

```css
.tagger-page { height: calc(100vh - 72px); min-height: 560px; display: flex; flex-direction: column; padding: 10px 14px 14px; color: var(--text-primary); overflow: hidden; }
.tagger-layout { position: relative; flex: 1; min-width: 0; min-height: 0; display: flex; gap: 14px; overflow: hidden; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
.tagger-workspace { flex: 1; min-width: 320px; min-height: 0; display: flex; flex-direction: column; }
.tagger-preview__toolbar { height: 44px; flex: 0 0 44px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; padding: 0 10px; border: 0; border-radius: 10px; background: color-mix(in srgb, var(--surface-secondary) 58%, transparent); }
.tagger-preview { flex: 1; min-height: 0; position: relative; display: grid; place-items: center; overflow: hidden; border-radius: 14px; background: radial-gradient(circle at center, #201d24, #121116 72%); }
.tagger-preview__progress { flex: none; margin-top: 8px; padding: 6px 9px; border: 0; border-radius: 10px; background: color-mix(in srgb, var(--surface-secondary) 52%, transparent); }
```

补充响应式规则：

```css
@media (max-width: 1200px) {
  .tagger-layout { gap: 10px; }
  .tagger-workspace { min-width: 280px; }
}
@media (max-width: 760px) {
  .tagger-page { padding: 8px; overflow-x: hidden; }
  .tagger-layout { gap: 8px; }
  .tagger-toolbar__status small,
  .tagger-toolbar__model,
  .tagger-toolbar__actions .quiet { display: none; }
}
```

- [ ] **Step 4: 让任务队列和标签校对成为辅助色阶**

将 `TagQueue.vue` 的空状态模板从标题加说明改为一条安静提示：

```vue
<div v-if="queue.length === 0" class="queue-empty">
  <span>队列为空 · 可从图库发送或继续添加</span>
</div>
```

将根样式和内部硬横线改为：

```css
.tag-queue { width: 184px; flex: 0 0 184px; min-height: 0; display: flex; flex-direction: column; border: 0; border-radius: 12px; background: linear-gradient(180deg, color-mix(in srgb, var(--surface-secondary) 72%, transparent), color-mix(in srgb, var(--surface-secondary) 38%, transparent)); transition: width .16s ease, flex-basis .16s ease; }
.tag-queue header { height: 44px; flex: none; display: flex; align-items: center; gap: 7px; padding: 0 9px; border: 0; }
.tag-queue footer { flex: none; display: grid; grid-template-columns: 1fr 1fr; gap: 5px; padding: 7px; border: 0; }
.queue-empty { height: 100%; display: grid; place-items: center; padding: 14px; color: var(--text-tertiary); font-size: 8px; line-height: 1.6; text-align: center; }
@media (max-width: 1200px) { .tag-queue { width: 166px; flex-basis: 166px; } }
```

将 `TagEditor.vue` 的无选中状态改为：

```vue
<div v-if="!item" class="editor-empty">
  <span>选择图片后在这里校对标签</span>
</div>
```

将辅助表面样式改为：

```css
.tag-editor { width: 300px; flex: 0 0 300px; min-height: 0; display: flex; flex-direction: column; border: 0; border-radius: 12px; background: linear-gradient(180deg, color-mix(in srgb, var(--surface-secondary) 78%, transparent), color-mix(in srgb, var(--surface-secondary) 46%, transparent)); }
.tag-editor > header { height: 44px; flex: none; display: flex; align-items: center; justify-content: space-between; padding: 0 13px; border: 0; }
.tag-editor > footer { flex: none; display: grid; gap: 7px; padding: 11px; border: 0; }
.editor-empty { height: 100%; display: grid; place-items: center; padding: 14px; color: var(--text-tertiary); font-size: 8px; text-align: center; }
@media (max-width: 1200px) { .tag-editor { width: 258px; flex-basis: 258px; } }
@media (max-width: 980px) { .tag-editor { position: absolute; z-index: 12; top: 0; right: 0; bottom: 0; width: min(300px, calc(100% - 64px)); box-shadow: var(--surface-shadow); } }
```

错误提示、输入框、标签 chip 和保存按钮继续保留边界，因为它们需要表达可操作性或状态。

- [ ] **Step 5: 运行标注相关测试并确认全部通过**

Run:

```powershell
npm.cmd test -- --run electron/ipc/__tests__/annotation-workspace-ui.spec.ts electron/ipc/__tests__/tagger-v2.spec.ts electron/ipc/__tests__/tagger-models.spec.ts electron/ipc/__tests__/gallery-tagger-routes.spec.ts
```

Expected: PASS；队列、自动标注、停止、保存和返回图库契约保持不变。

- [ ] **Step 6: 提交标注改造**

```powershell
git add -- src/views/Tagger.vue src/components/tagger/TagQueue.vue src/components/tagger/TagEditor.vue electron/ipc/__tests__/annotation-workspace-ui.spec.ts
git commit -m "style: open annotation into a seamless workspace"
```

### Task 4: 全量自动验证与真实窗口验收

**Files:**
- Verify only: Tasks 1–3 中列出的文件

- [ ] **Step 1: 运行全部自动验证**

Run:

```powershell
npm.cmd test -- --run
npm.cmd run typecheck
npm.cmd run check:ipc
npm.cmd run build:renderer
npm.cmd run branding:build
git diff --check 6023ab3..HEAD
```

Expected:

- 现有测试与新增测试全部 PASS；
- 类型检查退出码 0；
- IPC 契约通道与实际使用数量一致；
- 渲染构建和品牌资源构建退出码 0；
- `git diff --check` 无输出。

- [ ] **Step 2: 在真实界面完成视觉验收**

启动开发版：

```powershell
npm.cmd run dev
```

在 1400×900 和 1100×720 两个视口分别检查：

1. 左侧不再出现重复 B 图标和 Baka TOOLS；第一项导航与活动轨道对齐。
2. 图库来源区、工具带、网格和检查器属于同一连续画布，没有完整外壳边框。
3. 标注队列、预览和标签校对之间有 10–14 像素留白，中央预览为视觉主体。
4. 两页均无页面级横向滚动，主要按钮与空状态不被裁切。
5. 图库拖入蒙层覆盖工作内容区，双击元数据仍打开查看器。
6. 从图库发送到标注后队列、返回上下文和保存操作仍正常。

- [ ] **Step 3: 提交仅由验收发现的最小微调**

```powershell
git add -- src/components/sidebar/AppSidebar.vue src/views/Gallery.vue src/views/Tagger.vue src/components/tagger/GallerySidebar.vue src/components/tagger/GalleryToolbar.vue src/components/tagger/GalleryInspector.vue src/components/tagger/GalleryGrid.vue src/components/tagger/TagQueue.vue src/components/tagger/TagEditor.vue
git commit -m "fix: refine seamless media workspaces"
```

如果视觉验收没有发现问题，则跳过本步骤，不创建空提交。不得暂存工作区其他既有改动。
