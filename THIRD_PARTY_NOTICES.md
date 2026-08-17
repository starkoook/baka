# Baka TOOLS 第三方组件说明

Baka TOOLS 主安装包不包含训练器核心、Python、PyTorch 或显卡运行环境。用户首次使用 LoRA 训练功能时，应用会按需下载并校验独立组件。

## LoRA ReScripts / SD-ReScripts

- 源代码：https://github.com/WhitecrowAurora/lora-rescripts
- 许可证：GNU Affero General Public License v3.0（AGPL-3.0）
- 许可证全文：安装目录 `resources/licenses/AGPL-3.0.txt`

训练器核心始终与 Baka 主程序分开安装、分开更新和分开回退。Baka 不修改或隐藏上游项目的许可信息。

## 训练运行环境

按需安装的 Python、PyTorch、CUDA、ROCm、Intel XPU 及其依赖分别受各自许可证约束。组件包应保留上游随附的许可证和声明文件。

