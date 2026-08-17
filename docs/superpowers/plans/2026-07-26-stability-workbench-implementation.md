# Baka TOOLS Stability Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复阻断图库、标注、反推、运行环境和训练主流程的问题，并把核心页面统一成稳定工作台。

**Architecture:** 保留 Vue、Pinia、Electron IPC 和训练仓库 Python 后端。渲染层只管理交互状态，Electron 负责受控的本地能力，训练仓库 `launcher/core` 作为运行环境的唯一规则来源；所有长任务使用唯一任务编号和可恢复状态。

**Tech Stack:** Vue 3、Pinia、TypeScript、Electron、Node.js、Vitest、sql.js、Python launcher core。

---

## 文件职责

- `electron/main.js`：应用路径、正式版页面加载、窗口生命周期和 IPC 注册。
- `electron/ipc/tagger-v2.js`：标注 worker 的单任务状态机。
- `electron/ipc/gallery.js`：图库扫描、事务写入和标签关系保护。
- `electron/ipc/runtime-manager.js`：运行时桥接进程和安装任务生命周期。
- `electron/preload.js`、`electron/ipc/channels.js`：渲染层可用接口与事件契约。
- `src/stores/gallery.ts`、`src/stores/taggerV2.ts`：跨页面可恢复状态。
- `src/views/Reverse.vue`：本地、云端和双引擎反推。
- `src/views/TrainingTask.vue`、`src/views/TrainingRun.vue`：任务提交和监控。
- `src/views/Dashboard.vue`、`src/views/TaggerV2.vue`、`src/views/Training.vue`：工作台式核心页面。
- `src/styles/variables.css`、`src/styles/components.css`、`src/styles/global.css`：统一视觉与状态样式。

### Task 1: 建立稳定性回归测试

**Files:**
- Create: `electron/ipc/__tests__/main-behavior.spec.ts`
- Create: `electron/ipc/__tests__/tagger-v2.spec.ts`
- Create: `src/stores/__tests__/training-route.spec.ts`
- Modify: `vitest.config.ts`

- [ ] **Step 1: 写正式版加载和持久化失败测试**

测试读取主进程源码并断言正式版不会探测 `localhost:5173`，关闭窗口不会调用全量 `localStorage.clear()`。

- [ ] **Step 2: 运行测试确认因现有行为失败**

Run: `npm.cmd test -- electron/ipc/__tests__/main-behavior.spec.ts`

Expected: FAIL，指出正式版仍探测开发端口或执行全量清理。

- [ ] **Step 3: 写标注任务失败测试**

测试注入伪 worker，断言收到 `ready` 后会发送 `tag` 命令，单张结果只结算一次，取消只影响当前任务。

- [ ] **Step 4: 运行测试确认因现有状态机失败**

Run: `npm.cmd test -- electron/ipc/__tests__/tagger-v2.spec.ts`

Expected: FAIL，指出 `ready` 后没有发送推理命令或任务重复结算。

### Task 2: 修复主进程、存储和标注阻断

**Files:**
- Modify: `electron/main.js`
- Modify: `electron/ipc/tagger-v2.js`
- Modify: `electron/preload.js`
- Modify: `electron/ipc/channels.js`
- Test: `electron/ipc/__tests__/main-behavior.spec.ts`
- Test: `electron/ipc/__tests__/tagger-v2.spec.ts`

- [ ] **Step 1: 让正式版直接加载本地构建文件**

仅在显式开发模式下加载 `http://localhost:5173`，其余情况直接加载 `dist/renderer/index.html`。

- [ ] **Step 2: 删除关闭应用时的全量 localStorage 清理**

业务数据和用户设置保留；缓存清理由设置页显式触发。

- [ ] **Step 3: 把标注 worker 收口为单一消息处理器**

`ready` 发送当前图片的 `tag` 消息，`result` 或 `error` 只结算当前图片一次，任务结束后移除监听并释放 worker。

- [ ] **Step 4: 统一取消事件契约**

只发送已在 `channels.js` 声明且 preload 有解除监听函数的事件。

- [ ] **Step 5: 运行回归测试**

Run: `npm.cmd test -- electron/ipc/__tests__/main-behavior.spec.ts electron/ipc/__tests__/tagger-v2.spec.ts`

Expected: PASS。

### Task 3: 保护图库标签和批量写入

**Files:**
- Create: `electron/ipc/__tests__/gallery-scan.spec.ts`
- Modify: `electron/ipc/gallery.js`
- Modify: `src/stores/gallery.ts`

- [ ] **Step 1: 写重扫不丢标签的失败测试**

创建临时图库，首次扫描后写入标签，再修改图片时间并重扫，断言 `image_id` 与标签关系保持不变。

- [ ] **Step 2: 运行测试确认现有 DELETE+INSERT 会失败**

Run: `npm.cmd test -- electron/ipc/__tests__/gallery-scan.spec.ts`

Expected: FAIL，标签关系丢失或图片编号变化。

- [ ] **Step 3: 改为原位更新和事务保存**

路径已存在时执行 UPDATE；新增文件才 INSERT；整批扫描与整批标签写入各保存一次数据库。

- [ ] **Step 4: 运行图库与 store 测试**

Run: `npm.cmd test -- electron/ipc/__tests__/gallery-scan.spec.ts src/stores/__tests__/gallery.spec.ts`

Expected: PASS。

### Task 4: 训练任务编号和运行环境桥接

**Files:**
- Create: `electron/runtime/launcher_bridge.py`
- Create: `electron/ipc/__tests__/runtime-manager.spec.ts`
- Modify: `electron/ipc/runtime-manager.js`
- Modify: `electron/preload.js`
- Modify: `electron/ipc/channels.js`
- Modify: `src/env.d.ts`
- Modify: `src/views/TrainingTask.vue`
- Modify: `src/views/TrainingRun.vue`
- Modify: `src/views/Training.vue`

- [ ] **Step 1: 写训练路由与运行时状态失败测试**

断言提交成功后生成 `/training/run?taskId=<id>`；运行时安装必须在安装后复检通过才成功；取消请求不能提前发出已取消事件。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm.cmd test -- electron/ipc/__tests__/runtime-manager.spec.ts src/stores/__tests__/training-route.spec.ts`

Expected: FAIL。

- [ ] **Step 3: 实现 JSON 行桥接**

Python 桥接调用所选训练仓库的运行时目录、检测、推荐、预检、安装计划和任务状态能力；Electron 将请求与事件映射到现有 `runtimeAPI`。

- [ ] **Step 4: 实现真实取消和中断恢复**

保存当前安装子进程，取消时先进入 `cancelling`，阻止后续脚本；进程真正退出后才进入 `cancelled`，应用重启后把未结束任务标为 `interrupted`。

- [ ] **Step 5: 修复训练任务路由**

提交成功后携带真实任务编号跳转；监控页统一使用地址中的编号获取状态、日志和停止任务。

- [ ] **Step 6: 运行运行时与训练测试**

Run: `npm.cmd test -- electron/ipc/__tests__/runtime-manager.spec.ts src/stores/__tests__/training-route.spec.ts`

Expected: PASS。

### Task 5: 完成双引擎反推

**Files:**
- Create: `src/stores/__tests__/reverse.spec.ts`
- Create: `src/stores/reverse.ts`
- Modify: `src/views/Reverse.vue`
- Modify: `electron/preload.js`
- Modify: `src/env.d.ts`

- [ ] **Step 1: 写结果分离失败测试**

断言本地标签为数组，云端自然描述和绘图提示词保持原始段落，双引擎合并时三类结果互不覆盖。

- [ ] **Step 2: 运行测试确认现有解析失败**

Run: `npm.cmd test -- src/stores/__tests__/reverse.spec.ts`

Expected: FAIL。

- [ ] **Step 3: 实现可恢复反推 store**

保存图片绝对路径、模式、标签、自然描述、绘图提示词、运行状态和最近结果。

- [ ] **Step 4: 重组反推页面**

左侧图片、来源和引擎；右侧三个可编辑结果区，分别支持复制、保存同名文本和图库标签回写。

- [ ] **Step 5: 运行反推测试**

Run: `npm.cmd test -- src/stores/__tests__/reverse.spec.ts`

Expected: PASS。

### Task 6: 核心页面工作台 UI

**Files:**
- Modify: `src/views/Dashboard.vue`
- Modify: `src/views/TaggerV2.vue`
- Modify: `src/views/Training.vue`
- Modify: `src/components/sidebar/TopMenuBar.vue`
- Modify: `src/styles/variables.css`
- Modify: `src/styles/components.css`
- Modify: `src/styles/global.css`

- [ ] **Step 1: 首页改为继续工作工作台**

显示当前数据集、三步主流程、最近任务和各后端简明状态。

- [ ] **Step 2: 图库改为三栏工作区**

左栏数据集、中栏图片、右栏标签；窄窗口下左右栏可折叠，进度不遮挡内容。

- [ ] **Step 3: 训练改为四步流程**

数据集、设置、启动预检、运行监控顺序一致；致命错误时禁用启动并提供修复入口。

- [ ] **Step 4: 收口视觉样式**

保留顶部导航、粉橙品牌色和吉祥物，减少持续动画，统一按钮、输入、空状态、错误和进度组件。

- [ ] **Step 5: 执行完整验证**

Run: `npm.cmd run typecheck`

Expected: exit 0。

Run: `npm.cmd test`

Expected: 所有测试通过。

Run: `npm.cmd run check:ipc`

Expected: 所有 IPC 通道均有声明与消费。

Run: `npm.cmd run build`

Expected: exit 0，并生成正式版渲染文件。

