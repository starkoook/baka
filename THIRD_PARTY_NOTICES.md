# Baka TOOLS 第三方组件说明

Baka TOOLS 主安装包不包含训练器核心、Python、PyTorch 或显卡运行环境。用户首次使用 LoRA 训练功能时，应用会按需下载并校验独立组件。

## LoRA ReScripts / SD-ReScripts

- 源代码：https://github.com/WhitecrowAurora/lora-rescripts
- 许可证：GNU Affero General Public License v3.0（AGPL-3.0）
- 许可证全文：安装目录 `resources/licenses/AGPL-3.0.txt`

训练器核心始终与 Baka 主程序分开安装、分开更新和分开回退。Baka 不修改或隐藏上游项目的许可信息。

## 训练运行环境

按需安装的 Python、PyTorch、CUDA、ROCm、Intel XPU 及其依赖分别受各自许可证约束。组件包应保留上游随附的许可证和声明文件。

## 角色标签审计 / 提示词金字塔规则（lora-tagging-skills）

- 来源：<https://github.com/storyAura/lora-tagging-skills>，MIT（全文见 `electron/skills/LICENSE-lora-tagging-skills.txt`）
- `electron/skills/character-tag-auditor.md` 与 `electron/skills/prompt-pyramid.md` 原样打包，作为 LLM 系统提示的一部分
- 审计流程（文本初筛 → 视觉复核 → 严格校验）与队列级"全部标签"面板的做法参考了同作者的 [BooruDatasetTagManager+](https://github.com/storyAura/BooruDatasetTagManagerPlus)（MIT），未复制其代码

## 点击音效语音

界面点击反馈中的日语短句由 VOICEVOX 合成，使用了以下角色音源，按各角色利用规约标注出处：

- VOICEVOX:雨晴はう
- VOICEVOX:四国めたん
- VOICEVOX:猫使ビィ

VOICEVOX：https://voicevox.hiroshiba.jp/ 。各角色的利用规约以官方页面为准。

