# Baka Tools

Baka Tools 是一个面向二次元图片素材的桌面工具箱，把「收集、整理、标注、训练、放大、工作流」放在同一个本地应用里。

## 主要功能

- **图库**：集中管理本地图片素材，支持导入、筛选、回收站与安全移动。
- **在线画廊**：浏览 Danbooru、Gelbooru、Safebooru、Moebooru、e621 等图站，支持搜索、标签建议、相关标签、排行榜、收藏、单图/批量下载，并内置常见接口错误的解释。
- **标注**：自动打标、批量编辑、中文标签、权重与标签合并。
- **训练**：LoRA 训练任务管理、运行状态与本地训练后端。
- **放大**：本地超分辨率处理。
- **工作台**：可自由整理节点与流程的画布。
- **视频工具**：视频抽帧、转换、标签处理。
- **图像工具**：背景处理、编辑与图库体检。

## 技术栈

- Electron + Vue 3 + Vite + TypeScript
- Pinia / Vue Router
- ONNX Runtime、Sharp、sql.js

## 本地开发

环境要求：Node.js 20+、npm。

```bash
npm install
npm run dev
```

常用命令：

```bash
npm run build:renderer   # 构建渲染进程
npm run typecheck        # 类型检查
npm run test             # 运行测试
npm run check:ipc        # 检查 IPC 通道
```

## 打包

```bash
npm run package
```

Windows 用户也可以双击项目根目录的 `启动.bat`（普通启动）或 `启动开发模式.bat`（开发模式）。

## 目录结构

```text
electron/    Electron 主进程、IPC、本地引擎与运行时
src/         渲染进程界面与业务逻辑
public/      图标、品牌图与工具封面
resources/   组件源、标签数据等资源
scripts/     开发、构建、打包与校验脚本
docs/        设计文档与路线图
```

## 说明

- 在线画廊访问的是第三方图站，请遵守各站点的服务条款、年龄限制与版权规定。
- 部分站点需要自行配置 API Key 或登录凭据，凭据只保存在本机。
- 本项目不提供任何图片内容，也不托管第三方素材。

## License

[MIT](./LICENSE)
