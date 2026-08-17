# 视频抽帧与格式转换补全设计

## 目标

让 Baka TOOLS 的视频处理能力对齐 BDTM：

1. 支持视频格式转换。
2. 支持多种抽帧模式。
3. 抽帧前能预览和调整。
4. 抽帧结果自动导入图库或标注队列。
5. 使用 FFmpeg，处理进度可取消。

## 范围

### 视频格式转换

支持互转：

- mp4
- mkv
- avi
- webm
- mov
- flv

可选：

- 复制原视频流
- H.264
- H.265

可选替换原文件。

### 抽帧模式

- 全帧
- 按 FPS
- 原生 FPS
- 指定帧号
- 随机百分比
- 均匀分布随机
- 区域随机

### 视频信息

抽帧前读取：

- FPS
- 时长
- 总帧数
- 宽高

### 预览与确认

显示预计抽帧数量、预览图和参数，用户确认后才执行。

### 结果处理

抽帧图片自动加入当前标注队列或图库。

## 模块

### `electron/ipc/video-processing.js`

替换当前简化版 `video-frames.js`：

- `probeVideo(videoPath)`
- `convertVideo(videoPath, options)`
- `extractFrames(videoPath, options)`
- `cancelTask(taskId)`
- `reportProgress(taskId, progress)`

### 前端

- `Form_VideoTools.vue`
- `Form_VideoConvert.vue`

窗口包含：

- 源文件选择
- 模式选择
- 参数调整
- 预览
- 进度条
- 取消按钮

## FFmpeg 命令

### 信息读取

```bash
ffprobe -v quiet -print_format json -show_streams -show_format video.mp4
```

### 全帧

```bash
ffmpeg -i video.mp4 frame-%05d.jpg
```

### 按 FPS

```bash
ffmpeg -i video.mp4 -vf fps=2 frame-%05d.jpg
```

### 指定帧

```bash
ffmpeg -i video.mp4 -vf "select='eq(n,10)+eq(n,20)+eq(n,30)'" -vsync vfr frame-%05d.jpg
```

### 随机百分比

先读取总帧数，再按比例生成随机帧列表，使用 `select` 表达式。

### 区域随机

把视频均分成若干区间，每个区间随机取 1 帧。

## 错误处理

- FFmpeg 不存在时显示明确提示。
- 单文件失败不影响批量。
- 抽帧临时目录失败自动清理。
- 输出路径冲突时自动改名。

## 测试

- 抽帧参数计算。
- 随机帧列表生成。
- 区域随机帧列表生成。
- FFmpeg 命令拼接。
- 输出文件命名。

## 验收标准

1. 支持 6 种视频格式互转。
2. 支持全部抽帧模式。
3. 能读取视频信息。
4. 有预览和进度。
5. 结果可自动加入标注队列。
6. 相关测试通过。
