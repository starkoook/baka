---
name: lora-rescripts-full-analysis
description: lora-rescripts 完整分析 — 所有模块、功能、可迁移项
metadata:
  type: reference
---

# lora-rescripts 完整分析

## 路径
`D:\comfyUI\lora-rescripts-main`

## 架构
```
lora-rescripts-main/
├── gui.py              # Python 入口, 启动 VuePress Web 服务器 (:28000)
├── frontend/dist/       # VuePress 构建产物 (SPA)
│   ├── index.html       # 主训练页
│   ├── tagger.html      # WD1.4 图像打标
│   ├── tageditor.html   # 数据集标签编辑器
│   ├── task.html        # 训练任务队列
│   └── tensorboard.html # TensorBoard 监控
├── backend/core/services/
│   └── tag_editor_service.py  # 标签编辑 API (强大！
├── config/
│   ├── default.toml     # 默认训练参数
│   ├── lora.toml        # LoRA 配置
│   └── presets/         # 训练预设模板
├── plugin/              # 社区 UI 插件系统
└── env/                 # 多运行时环境 (CUDA/Sage/ROCm)
```

## 核心功能模块

### 1. 训练引擎
- LoRA, Dreambooth, Fine-tune
- 支持多 GPU 运行时 (NVIDIA, AMD, Intel)
- SageAttention, FlashAttention2
- 参数: network_dim, lr, resolution, batch_size

### 2. 标签编辑器 (tag_editor_service.py)
功能完整的 Python API：
- 浏览/筛选数据集图片和标注
- 统计标签频率 (Counter)
- 单张/批量编辑标注
- 批量操作 (添加/删除/替换标签)
- WD14 本地打标、Gemini API 打标
- 移动/删除图片+标注对
→ 这些可以直接作为 Baka TOOLS Dataset.vue 的后端

### 3. 前端补丁系统 (FRONTEND.md)
三层架构：
- 页面壳 (HTML shell)
- boot 层 (路由/挂载)
- widget 层 (UI/逻辑)
→ Baka TOOLS 不需要这个, 自己有完整前端

### 4. 训练配置预设 (config/presets/)
TOML 格式的训练参数模板
→ 可加入 Settings 或 Training 页

### 5. 训练任务队列 (task.html)
训练任务管理, 进程监控
→ 可加入 PipelineBoard

## Baka TOOLS 可迁移清单

| 功能 | 来源 | 目标 |
|------|------|------|
| 标签编辑 API | tag_editor_service.py | Dataset IPC 后端 |
| 标签频率统计 | Counter-based | Dataset.vue 统计面板 (已有) |
| 批量标签操作 | batch ops | Dataset.vue 批量栏 (已有) |
| WD14 本地打标 | ONNX inference | Tagger IPC (已有) |
| Gemini 打标 | API call | LLM IPC (已有) |
| 训练预设 | presets/*.toml | Settings 新增 |
| TensorBoard | tensorboard.html | 嵌入 Dashboard |
| 任务队列 | task.html | PipelineBoard 强化 |
| 训练配置 | default.toml | Training 页参数面板 |
| 社区插件 | plugin/ | Settings 扩展 |

## 启动命令
```bash
# 项目自带 Python (推荐)
cd D:\comfyUI\lora-rescripts-main
.\python\python.exe gui.py --port 28000

# 系统 Python (开发用)
MIKAZUKI_ALLOW_SYSTEM_PYTHON=1 python gui.py --port 28000
```

## 依赖
- accelerate==1.6.0, torch, huggingface-hub, safetensors
- Python 3.10+ (内置 3.13)
- Git (submodule: kohya-ss/sd-scripts)
