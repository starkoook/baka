const fs = require('fs')
const path = require('path')
const { getConfigPath } = require('./paths')
const { buildSelectFilter, distributedFrameIndexes, regionalFrameIndexes, randomPercentFrameIndexes } = require('./video-frame-plan')
const { execFile, spawn } = require('child_process')

function toolCandidates(name) {
  const base = String(name || '').replace(/\.exe$/i, '')
  return process.platform === 'win32' ? [`${base}.exe`, base] : [base, `${base}.exe`]
}

function binaryPath(name) {
  let customDir = process.env.BAKA_FFMPEG_DIR
  try {
    const config = JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'))
    if (config.ffmpegDir) customDir = config.ffmpegDir
  } catch {}
  if (customDir && fs.existsSync(path.join(customDir, name))) {
    return path.join(customDir, name)
  }
  const bundled = path.join(__dirname, '../../resources/ffmpeg', name)
  return fs.existsSync(bundled) ? bundled : name
}

function ensureBinary(name) {
  for (const candidate of toolCandidates(name)) {
    const resolved = binaryPath(candidate)
    if (path.isAbsolute(resolved) && fs.existsSync(resolved)) return resolved
  }
  return toolCandidates(name)[0]
}

function buildExtractCommand(videoPath, outputPattern, options = {}) {
  const mode = options.mode || 'all'
  const args = ['-i', videoPath]
  if (mode === 'fps') {
    args.push('-vf', `fps=${options.fps || 1}`)
  } else if (mode === 'specific') {
    args.push('-vf', `select='${buildSelectFilter(options.frameIndexes || [])}'`, '-vsync', 'vfr')
  } else if (mode === 'random') {
    args.push('-vf', `select='${buildSelectFilter(options.frameIndexes || [])}'`, '-vsync', 'vfr')
  }
  args.push(outputPattern)
  return args
}

function buildConvertCommand(videoPath, outputPath, options = {}) {
  const args = ['-i', videoPath]
  const codec = options.codec || 'copy'
  if (codec === 'copy') args.push('-c', 'copy')
  else if (codec === 'h264') args.push('-c:v', 'libx264')
  else if (codec === 'h265') args.push('-c:v', 'libx265')
  args.push(outputPath)
  return args
}

function runFfmpeg(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(ensureBinary('ffmpeg'), args, { windowsHide: true })
    let stderr = ''
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      stderr += text
      const frame = text.match(/frame=\s*(\d+)/)
      const time = text.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/)
      if (options.onProgress) {
        options.onProgress({
          frame: frame ? Number(frame[1]) : undefined,
          time: time ? time[0].replace('time=', '') : undefined,
        })
      }
    })
    if (options.signal) {
      options.signal.addEventListener('abort', () => child.kill())
    }
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve({ stderr })
      else reject(new Error(stderr || `ffmpeg exited with code ${code}`))
    })
    if (options.timeout) {
      setTimeout(() => child.kill(), options.timeout)
    }
  })
}

function runFfprobe(videoPath) {
  return new Promise((resolve, reject) => {
    execFile(
      ensureBinary('ffprobe'),
      ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', videoPath],
      { timeout: 30000, windowsHide: true },
      (error, stdout) => {
        if (error) reject(error)
        else resolve(JSON.parse(stdout))
      }
    )
  })
}

function parseProbe(data) {
  const video = (data?.streams || []).find(stream => stream.codec_type === 'video')
  if (!video) return null
  const [num, den] = String(video.avg_frame_rate || '0/1').split('/').map(Number)
  return {
    fps: den ? num / den : 0,
    width: video.width || 0,
    height: video.height || 0,
    duration: Number(data?.format?.duration || 0),
  }
}

async function extractFrames(videoPath, outputDir, options = {}) {
  fs.mkdirSync(outputDir, { recursive: true })
  const outputPattern = path.join(outputDir, 'frame-%05d.jpg')
  const probe = parseProbe(await runFfprobe(videoPath))
  if (!probe) throw new Error('Unable to read video stream')

  let commandOptions = { mode: 'all' }
  if (options.mode === 'fps') {
    commandOptions = { mode: 'fps', fps: options.fps || 1 }
  } else if (options.mode === 'specific') {
    commandOptions = { mode: 'specific', frameIndexes: options.frameIndexes || [] }
  } else if (options.mode === 'random') {
    const count = Math.max(1, Math.round((probe.duration || 1) * (options.framesPerSecond || 1)))
    commandOptions = { mode: 'random', frameIndexes: randomPercentFrameIndexes(count, options.percent || 10) }
  } else if (options.mode === 'distributed') {
    const count = Math.max(1, Math.round((probe.duration || 1) * (options.framesPerSecond || 1)))
    commandOptions = { mode: 'specific', frameIndexes: distributedFrameIndexes(count, options.count || 1) }
  } else if (options.mode === 'regional') {
    const count = Math.max(1, Math.round((probe.duration || 1) * (options.framesPerSecond || 1)))
    commandOptions = { mode: 'specific', frameIndexes: regionalFrameIndexes(count, options.count || 1) }
  }

  await runFfmpeg(buildExtractCommand(videoPath, outputPattern, commandOptions), options)
  return fs.readdirSync(outputDir).filter(name => name.endsWith('.jpg')).sort().map(name => path.join(outputDir, name))
}

async function convertVideo(videoPath, outputPath, options = {}) {
  if (path.resolve(videoPath) === path.resolve(outputPath)) {
    const tmp = outputPath + '.bdtm-convert' + path.extname(outputPath)
    await runFfmpeg(buildConvertCommand(videoPath, tmp, options), options)
    fs.copyFileSync(tmp, outputPath)
    fs.rmSync(tmp, { force: true })
    return outputPath
  }
  await runFfmpeg(buildConvertCommand(videoPath, outputPath, options), options)
  return outputPath
}

module.exports = { buildExtractCommand, buildConvertCommand, runFfmpeg, runFfprobe, parseProbe, extractFrames, convertVideo }
