const path = require('path')
const { extractFrames } = require('./video-processing')
const { runLocalInference, localResultToTagStrings } = require('./tagging-batch')

function summarizeTags(frames, frameTags) {
  const counts = new Map()
  for (const frame of frames || []) {
    const tags = frameTags.get(frame) || []
    for (const tag of tags) counts.set(tag, (counts.get(tag) || 0) + 1)
  }
  const total = Math.max(1, (frames || []).length)
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count, frequency: count / total }))
    .sort((a, b) => b.count - a.count)
}

async function tagVideo({ videoPath, outputDir, extractOptions = {}, modelPath, csvPath, threshold = 0.35, providers = ['cpu'], onProgress }) {
  if (!modelPath) throw new Error('视频打标需要选择一个 ONNX 模型。')
  const frames = await extractFrames(videoPath, outputDir, extractOptions)
  if (!frames.length) throw new Error('没有抽到视频帧。')

  onProgress?.({ stage: 'tagging', completed: 0, total: frames.length })
  const results = await runLocalInference({
    modelPath,
    csvPath: csvPath || modelPath.replace(/\.onnx$/i, '.csv'),
    imagePaths: frames,
    threshold,
    providers,
    onProgress: (msg) => onProgress?.({
      stage: 'tagging',
      completed: msg.completed,
      total: msg.total,
      currentFile: msg.currentFile,
    }),
  })

  const frameTags = new Map()
  for (const frame of frames) frameTags.set(frame, localResultToTagStrings(results, frame))
  const tags = summarizeTags(frames, frameTags)
  return {
    frames,
    tags,
    frameTags: [...frameTags.entries()].map(([frame, items]) => ({ frame, tags: items })),
  }
}

function registerVideoTagHandlers() {
  const { ipcMain } = require('electron')
  ipcMain.handle('video:tag', async (event, params) => {
    const onProgress = (payload) => {
      if (event.sender && !event.sender.isDestroyed()) event.sender.send('video:tagProgress', payload)
    }
    try {
      const outputDir = params.outputDir || path.join(path.dirname(params.videoPath), `${path.basename(params.videoPath, path.extname(params.videoPath))}_frames_tagged`)
      const data = await tagVideo({ ...params, outputDir, onProgress })
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message || String(error) }
    }
  })
}

module.exports = { tagVideo, summarizeTags, registerVideoTagHandlers }
