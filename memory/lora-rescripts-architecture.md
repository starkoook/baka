---
name: lora-rescripts-architecture
description: lora-rescripts 架构分析 — 前端/后端/端口/安装
metadata:
  type: reference
---

# lora-rescripts 架构

## 路径
- 主目录: `D:\comfyUI\lora-rescripts-main`
- 前端: `frontend/dist/` (VuePress SPA)
- 入口: `gui.py` (Python, 启动 Web 服务器)

## 前端页面 (VuePress)
| 页面 | 文件 | 功能 |
|------|------|------|
| 主训练 | `index.html` | LoRA/Dreambooth 训练配置 |
| 打标器 | `tagger.html` | WD1.4 图像标注 |
| 标签编辑器 | `tageditor.html` | 数据集标签管理 |
| 任务列表 | `task.html` | 训练任务队列 |
| TensorBoard | `tensorboard.html` | 训练监控面板 |

## 启动方式
- 正确启动: `python/python.exe gui.py --port 28000` (项目自带 Python)
- 系统 Python: `MIKAZUKI_ALLOW_SYSTEM_PYTHON=1 python gui.py --port 28000`
- 默认端口: `28000`
- 依赖: accelerate==1.6.0, torch, huggingface-hub

## Baka TOOLS 已集成
- 训练页: iframe 嵌入 WebUI (需先启动 gui.py)
- 图像标注: Tagger.vue (独立实现, 不依赖 lora-rescripts)
- 数据集管理: Dataset.vue (独立实现)

## 可迁移功能
1. **Tag Editor** → 已有的 Dataset.vue 可增强
2. **TensorBoard 监控** → 嵌入 tensorboard 页面
3. **Task 队列** → 可加入 PipelineBoard
4. **训练参数预设** → Settings 中扩展
