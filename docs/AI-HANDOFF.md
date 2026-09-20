# Baka TOOLS Handoff

> 快速恢复入口，不是项目数据库。真实状态以 Git、测试、代码为准；与本文件冲突时先核对再修正本文件。
> 接手顺序：先看 Current State 与 Next Step → `git log --oneline -15` → 只读当前任务涉及的源码，不要全仓扫描。

## Current State

- 项目：Baka TOOLS，Electron + Vue 3 + Vite + TypeScript 的 Windows 桌面工具箱（图库 / 在线画廊 / 标注 / 训练 / 放大 / 控制台 / 视频工具）。代码在 `baka-tools-github/`，分支 `main`。
- 阶段：柔粉「灵动版」UI 改版 + 对标 BooruDatasetTagManager+ 的标注功能强化，均已完成，并已打包覆盖到免安装目录 `D:\baka\BakaTOOLS`（`Baka TOOLS.exe`）。
- 任务系统：没有 Backlog.md，未初始化；任务在本文件 Next Step 与对话中跟踪。
- Git 保存点：代码在 `eca9e9c`（可回滚）；其后只有 docs 提交加了本文件与 README 入口。工作区另有约 100 个未跟踪调试脚本与目录（`_*.js`、`_*.py`、`_asar_*`、`_app_tdr.asar`、`tools/`、`metadata.js`，约 1 GB）——那是历史热修补残留，不属于任何当前任务；不要提交，也不要未经 Owner 允许删除。
- 远端：`origin` = github.com/starkoook/baka，本地领先 27 个提交、不落后；本轮未 push（未获授权）。
- 状态：可继续，无 blocker。
- 关键位置：标注状态 `src/stores/tagger.ts`；标注页 `src/views/Tagger.vue` + `src/components/tagger/`；审计核心 `electron/ipc/character-tag-audit.js`（IPC 在 `character-tag-audit-ipc.js`）；LLM 规则 `electron/skills/*.md`；类目 / 修复 `electron/ipc/tag-categories.js`、`tag-fixes.js`；标签数据 `resources/tag-data/*.csv`（打包后在 `resources/tag-data`，用 `tag-data-path.js` 定位）；IPC 契约 `electron/ipc/channels.js`（`npm run check:ipc` 校验）；打包 `node scripts/package.js` → `release/Baka-TOOLS-Portable.zip`。

## Current Focus

None（本轮授权范围——BDTM+ 对标的标注改进：审计规则接入、全部标签面板、触发词、金字塔排序、类目着色、快速替换、错误标签修复——已全部落地并部署）。

## Last Meaningful Changes

- `eca9e9c` 类目着色与排序（7.7 万条 Danbooru 一二级类目 + 后缀规则兜底）、快速替换、错误标签修复对话框；修复 `resources/tag-data` 从未进包的问题（安装版里中文搜标签 / 角色父子表此前一直静默失效）。
- `806acf7` 角色标签审计重写：lora-tagging-skills 两份规则作系统提示，文本初筛 → 视觉复核 → 严格校验 + 一次自动修复；全部标签面板（整批计数 / 改名 / 移除 / 逐张校对 / 保存全部）；触发词保存时置顶；金字塔排序。
- `be2e891` 及更早：柔粉灵动版外壳与首页、图库瀑布流、`media://` 缩略图、剔除画布工具、拍立得点进图库定位、Voicevox 点击音、只出免安装 zip。细节看 `git log`。

## In Progress

None

## Open Decisions / Risks

- 待 Owner 决定：是否把 27 个本地提交 push 到 `origin`。
- 待 Owner 决定：根目录调试残留是否移出仓库归档（建议移到仓库外，不直接删）；同时清主进程可能残留的画布 IPC（workbench-images / local-engines）。
- 4 个预存失败测试，不是本轮引入：
  - `electron/ipc/__tests__/main-behavior.spec.ts`：`fs:moveImages`（`electron/main.js` ≈ L251）移动 / 复制图片时未带同名 caption，**真实回归**。
  - `electron/ipc/__tests__/runtime-manager.spec.ts`：读所选训练仓库的 runtime 定义失败，**真实回归**。
  - `electron/ipc/__tests__/training-schema-runtime.spec.ts` ×2：依赖本机不存在的 `lora-rescripts-main/mikazuki/schema`，属环境缺失。
- LLM 审计 / 金字塔排序 / LLM 打标都依赖用户在设置里配好 OpenAI 兼容端点；审计每个角色最多 3 次请求（文本 + 视觉 + 可能的修复），视觉阶段只带第一张标准图。
- 别再走的路：Coze CLI 生成语音（额度耗尽）、Edge TTS（Owner 认为不够可爱，已换 Voicevox）；离屏截图脚本不要把 URL 当命令行参数传给 Electron（会静默退出），用环境变量 `SHOT_URL`。
- 用户偏好：改完要直接打包覆盖安装并重启（流程见 Verification）；回复用简体中文；UI 保持柔粉灵动版，不要换成别的风格。

## Verification Status

- 已验证（`eca9e9c`）：`npm run typecheck` 通过；`npm run check:ipc` 通过；`npm test` 417 例通过 413，失败 4 例即上述预存项；`node scripts/package.js` 成功，`Expand-Archive` 覆盖到 `D:\baka\BakaTOOLS` 后启动正常；`npx asar list` 确认包内含 `electron/skills/*`，`resources/tag-data` 三份 CSV 随包。
- 已验证（Electron 离屏截图）：标注页全部标签面板、校对模式绿 / 红框、类目着色分组、修复对话框渲染正常；截图在 `%TEMP%\baka-shot\app\`，不入仓库。
- 尚未验证：审计与金字塔排序对真实模型的输出质量——只用构造的假响应测过解析、校验与降级路径。

## Next Step

1. 修两个真实回归（`fs:moveImages` caption 跟随；runtime-manager 读训练仓库），让 `npm test` 只剩环境缺失的 2 例。
2. 拿到 Owner 决定后：归档根目录调试残留、清残留画布 IPC，再 push。
3. 用真实 API 跑一次角色标签审计，检查决定与核心 prompt 质量；需要调 prompt 时改 `character-tag-audit.js` 的 `buildSystemPrompt / buildTextPrompt / buildVisualPrompt`，规则文件本身不改。

## Immediate First Action

运行 `npx vitest run electron/ipc/__tests__/main-behavior.spec.ts`，按失败断言（期望 `captionSrc = src.replace(/\.[^.]+$/, '') + '.txt'`，并 `copyFileSync` / `renameSync` 到目标目录）在 `electron/main.js` 的 `fs:moveImages` handler 里补上同名 caption 跟随。
