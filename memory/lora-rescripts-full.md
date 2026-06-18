---
name: lora-rescripts-full
description: lora-rescripts 完整架构 — 启动流程、模块、所有页面
metadata:
  type: reference
---

# lora-rescripts 完整架构

## 启动流程
```
run_gui.ps1 → gui.py → uvicorn → mikazuki.app:app (FastAPI :28000)
                            ├── 前端: frontend/dist/ (VuePress SPA)
                            ├── TagEditor: 独立进程 :28001
                            └── TensorBoard: 独立进程 :6006
```

## 技术栈
- **后端**: Python FastAPI (uvicorn)
- **前端**: VuePress 2.0 (静态生成 + SPA)
- **训练引擎**: kohya-ss/sd-scripts (git submodule)
- **桌面启动器**: PyWebView + React + Tailwind (独立 EXE)

## 前端页面 (frontend/dist/)
| 页面 | URL | 功能 |
|------|-----|------|
| index.html | / | 主训练配置页 (LoRA/Dreambooth参数) |
| tagger.html | /tagger.html | WD1.4 图像打标器 |
| tageditor.html | /tageditor.html | 数据集标签编辑器 |
| task.html | /task.html | 训练任务队列管理 |
| tensorboard.html | /tensorboard.html | TensorBoard 监控嵌入 |
| 404.html | /404.html | 404 页面 |

## 后端模块 (mikazuki/)
- **tagger/**: WD14 本地打标
- **dataset-tag-editor/**: 标签编辑 API
- **aesthetic_labeling/**: 美学评分
- **scripts/**: 训练脚本启动器
- **app/**: FastAPI 应用主配置

## 桌面启动器 (launcher/)
- **main.py**: PyWebView 入口
- **api.py**: 暴露给 React 前端的 Python API (50+ 方法)
- **core/**: 运行时管理、GPU检测、依赖缓存、任务执行、更新检查
- **web/dist/**: React SPA (index.html + 1 JS + 1 CSS)

## Baka TOOLS 集成方式
1. 选择 lora-rescripts 目录
2. 启动 → spawn `python gui.py --port 28000` (带 MIKAZUKI_ALLOW_SYSTEM_PYTHON=1)
3. Electron `<webview>` 嵌入 `http://127.0.0.1:28000`
4. 用户在 Baka TOOLS 窗口内直接使用完整的训练 WebUI
