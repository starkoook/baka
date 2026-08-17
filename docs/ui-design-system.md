# Baka TOOLS · 整体 UI 设计规范（UI Design System）

> 设计语言定位：**可爱 × 赛博 HUD** —— 像动漫工具箱一样软萌，又带一点机甲舱体的科技感。
> 适用范围：全部 13 个功能页、标题栏、顶部菜单、状态栏、设置、控制台、监控。
> 本规范是「单一事实来源」，所有页面必须按此实现，禁止各页面私写副本。

---

## 1. 设计原则（Design Principles）

1. **一套语言**：基础件 + 组合件全部共享，页面只组不造。
2. **软萌但有骨架**：大圆角 + 回弹动效 + 毛玻璃；HUD 角标 + 等宽字体标签保留科技味。
3. **深/浅双皮肤跟手**：所有颜色走 token，不写死 hex；切换主题只换 `:root` 变量。
4. **对比度达标**：正文 ≥ 4.5:1（已调过三级灰字），大字号 ≥ 3:1，WCAG AA。
5. **尊重减弱动效**：`prefers-reduced-motion` 下关闭非必要动画 + 隐藏光晕/樱花/粒子。

---

## 2. 设计令牌（Design Tokens）

> 已落地于 `src/styles/variables.css`，此处为权威摘录。

### 色彩（主色：粉橙）
| 角色 | 深色 Token | 浅色 Token |
| --- | --- | --- |
| 主色 Primary | `--accent-primary: #f472b6` | `#ec4899` |
| 辅色 Secondary | `--accent-secondary: #fb923c` | `#f97316` |
| 成功 / 警告 / 危险 | `#34d399 / #fbbf24 / #f87171` | 同 |
| 主文字 | `--text-primary: #f4e6ef` | `#2a1326` |
| 次文字 | `--text-secondary: #c8aac0` | `#6b4a60` |
| 三级文字 | `--text-tertiary: #b190a8`（已提亮至 ~5:1） | `#7d5d75` |
| 背景深/基/升 | `#1a1118 / #1f1620 / #2d2130` | `#fdf2f8 / #fef6fb / #ffffff` |
| 标题栏/侧栏底 | `#140e16 / #17101a` | `#fce7f3 / #fdf0f7` |

渐变：`--gradient-accent`（粉→橙→黄）、`--gradient-hero`、`--accent-gradient`。

### 间距（4px 基准标尺）
`--space-1`4 · `--space-2`8 · `--space-3`12 · `--space-4`16 · `--space-5`20 · `--space-6`24 · `--space-8`32 · `--space-10`40 · `--space-12`48 · `--space-16`64

### 圆角（软萌枕形）
`--radius-xs`6 · `--radius-sm`10 · `--radius-md`16 · `--radius-lg`22 · `--radius-xl`32 · `--radius-full`999

### 字体
- 标题/UI 显示：`--font-sans` → `ZCOOL KuaiLe`（可爱）回退 `Inter / PingFang SC / 微软雅黑`
- 技术标签/数值：`--font-mono` → `JetBrains Mono / Fira Code / Consolas`

### 动效
- 缓动：`--transition-fast 0.18s` / `--transition-base 0.3s` / `--transition-slow 0.5s`，统一 `cubic-bezier(0.34,1.56,0.64,1)`（回弹）

### 层级阴影（已细化，柔和分层）
`--elev-1` / `--elev-2` / `--elev-3` / `--elev-glow`（主题色辉光）

### HUD 表面
`--hud-bg` / `--hud-border` / `--hud-border-accent` / `--hud-inset-shadow` / `--hud-text-dim`（角标描边色）

---

## 2.5 品牌语言与角色（Brand & Mascot）

> 让界面一眼就是「baka-tools」——不是通用模板，是有脾气的次元工具箱。

### 品牌标识 Logo Mark
- 形态：**爪印 mark**（1 掌 + 4 趾椭圆），呼应项目名「Baka（笨蛋）」的萌点。
- 绘制：统一 `viewBox="0 0 32 32"`，5 个 `<ellipse>` 用 `--gradient-accent` 渐变填充；可作为 `.logo-mark`（24×24 标题栏）/ 大号（48×48 关于页）。
- 使用：标题栏左侧、关于页、空态占位、启动屏。禁止把爪印和「Baka TOOLS」文字拆开错用。

### 品牌标语 Tagline
- 主标语：**「你的次元图像工作台」**
- 傲娇版（关于页/启动）：**「一群笨笨工具，但真的好用」**
- 状态栏趣味指标示例：`[BAKA_ONLINE · 笨蛋能量 98%]`

### 吉祥物 Baka（角色设定）
| 维度 | 设定 |
| --- | --- |
| 名字 | Baka（阿八） |
| 身份 | 工具箱互动助手 · 全息投影 |
| 性格 | 傲娇、爱摸鱼、关键时刻靠谱 |
| 喜好 | 草莓大福、被夸、摸头 |
| 讨厌 | 显存爆炸、bug、被叫「人工智障」 |
| 技能 | 标注监督、训练陪跑、生成监工 |
| 招牌台词 | 「嘴上说才不要帮你，手却没停过。」 |

- 展现位：Dashboard 角色卡 + 全息座（鼠标视差转头、点一下蹦爱心、闲聊气泡）。
- 真实工程：`src/components/monitor/Mascot.vue`（基于 `/mascot.png`）。

### 微文案语气（Voice & Tone）
统一「**软萌傲娇 + 赛博科技**」调性，避免干巴巴的通用文案。
| 场景 | 推荐文案 |
| --- | --- |
| 欢迎语 | 「欢迎回来，主人 🌸（才、才不是想你了呢）」 |
| 主按钮 | 「🚀 开工！」「💾 记下来了」 |
| 空态 | 「这里空空如也…要不要去摸鱼？」 |
| 报错 | 「显存又炸了 💢 Baka 已帮你重试」 |
| 成功 Toast | 「✅ 已保存，Baka 记下了」 |
| 加载 | 「Baka 正在盯着显存呢…」 |

### 图标规范（统一线性图标，禁 emoji 充图标）
- 尺寸：`24×24`，`stroke-width:1.8`，`stroke-linecap/linejoin:round`，`fill:none`。
- 颜色：`stroke: currentColor`，跟随主题文字/强调色，深浅皮肤自动跟手。
- 用法：模块卡图标用 `.mod .ic`（40×40 圆角胶囊背景 + 主题色描边）；导航/标签内联 15×15。
- 禁止：用 emoji（🖼🔍⚙）当功能性图标——emoji 仅作装饰点缀，不承载信息层级。

### 背景品牌纹理
- 爪印水印：低频平铺 `rgba(244,114,182,0.05)` 爪印 SVG，opacity ≈0.5，`pointer-events:none`，`减弱动效`下隐藏。强化品牌存在感而不抢内容。

---

## 3. 组件目录（Component Catalog）

> ⚠️ 基础件已共享（components.css），组合件**本次收口为共享类**，禁止页面私有副本。

### 3.1 基础件（已存在）
| 组件 | 类 | 规范要点 |
| --- | --- | --- |
| 主按钮 | `.btn .btn-primary` | 渐变填充 + 爪印辉光点；hover 放大 1.05 + 强辉光；disabled 0.4 透明 |
| 次按钮 | `.btn .btn-secondary` | 毛玻璃 + 描边；hover 描边转主题色 |
| 幽灵按钮 | `.btn .btn-ghost` | 透明；hover 浅底 |
| 小号 | `.btn-sm` | 紧凑 padding |
| 文本输入 | `.form-input` | 毛玻璃圆角；focus 主题描边 + 4px 外光 |
| 下拉 | `.form-select` | 自带箭头；其余同 input |
| 滑块 | `.form-range` | 主题色圆点 + 发光 |
| 文本域 | `.form-textarea` | 同 input，多行 |
| 标签 | `.form-label` | 12px 600，三级文字 |
| 舱体面板 | `.cabin-panel` | 内凹 HUD 面 + 四角标 + 渐变内洗；hover 主题边框 + 辉光 |
| 毛玻璃面板 | `.glass-panel` | 模糊 20px 面板 |

### 3.2 组合件（本次收口为共享，替代各页私写副本）
| 组件 | 共享类 | 替代的私有副本 |
| --- | --- | --- |
| 标签页 | `.tabs` / `.tab` / `.tab.active` | Settings 的 `.sk-tabs` / `.sk-tab` |
| 分段控件 | `.segmented` / `.segmented button.on` | Settings 的 `.sk-seg` |
| 胶囊标签 | `.chip` / `.chip.active` / `.chip-x` | Settings 的 `.sk-chip` |
| 开关 | `.toggle` / `.toggle-track` / `.toggle-knob` | Settings 的 `.sk-toggle` |
| 徽章 | `.badge` / `.badge-success` / `.badge-warn` / `.badge-danger` | （新增，待各页替换 inline） |
| 数据表 | `.data-table` | GalleryGrid / 缓存列表等 |
| 提示气泡 | `.toast` / `.tooltip` | （新增） |
| 骨架屏 | `.skeleton` | 列表/图片加载态 |
| 卡片头 | `.card-head` / `.card-title` / `.card-sub` / `.card-icon` | Settings 的 `.sk-card-header` 等 |

> **迁移要求**：新页面一律用上表共享类；旧页面（Settings/Tools）逐步替换私有副本，替换完即可删除局部 scoped 样式。

### 3.3 状态系统（统一语义色）
| 状态 | 颜色 | 用法 |
| --- | --- | --- |
| 默认 | 主题描边 | 常规 |
| 成功 | `--accent-success` | 完成/通过 |
| 警告 | `--accent-warning` | 注意/进行中 |
| 危险 | `--accent-danger` | 错误/删除 |
| 禁用 | 0.4 透明 + not-allowed | 不可点 |
| 加载 | 流光进度条 `.progress-flow` | 处理中 |

---

## 4. 布局与栅格

- 外壳：标题栏(42px) + 主区 + 状态栏(30px)，整体 `border-radius:12px` 圆角窗口。
- 主区：顶部菜单（TopMenuBar）+ 内容（max-width 720~1024 自适应）。
- 间距节奏：面板内 padding `--space-6`(24)，字段间距 `--space-4`(16)，栅格 gap `--space-4`。
- 模块卡：Dashboard 用 2~3 列网格铺功能入口；锁定态统一「即将推出」样式（进度条 + 灰字）。

---

## 5. 无障碍（WCAG AA）

- 文字对比：正文 `--text-secondary` ≥ 4.5:1；已提亮三级灰字。
- 触控目标：按钮/标签最小 44×44（移动端），桌面 ≥ 32。
- 键盘：所有可点元素可 Tab 聚焦，`:focus-visible` 显式焦点环。
- 动效：全局 `prefers-reduced-motion` 关闭呼吸/视差/樱花/粒子。
- 文案：状态栏报错可点消除；空态有引导文案，不空白。

---

## 6. 禁止事项（Do NOT）

- ❌ 页面内私写 `.sk-*` / 局部 tab/seg/chip/toggle 副本（改用第 3.2 节共享类）。
- ❌ 写死 hex 颜色（必须走 token，保证深浅皮肤跟手）。
- ❌ 用纯平涂硬边背景（保留体散光池 + 毛玻璃层次）。
- ❌ 不同页面同一组件长不一样。

---

**UI Designer** · 设计系统日期 2026-07-21 · 状态：规范已立，共享类已收口，预览见 `ui-design-system-preview.html`
