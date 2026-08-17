const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFile } = require('child_process')

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.avi', '.webm', '.mov', '.flv'])

function isVideoFile(filePath) {
  return VIDEO_EXTENSIONS.has(path.extname(filePath || '').toLowerCase())
}

async function extractVideoFrames(videoPath, count = 1) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'baka-video-'))
  const outputPattern = path.join(dir, 'frame-%03d.jpg')
  await new Promise((resolve, reject) => {
    execFile(
      'ffmpeg',
      ['-i', videoPath, '-vf', 'fps=1', '-frames:v', String(Math.max(1, count)), '-q:v', '2', outputPattern],
      { timeout: 120000, windowsHide: true },
      (error) => {
        if (error) reject(error)
        else resolve()
      }
    )
  })
  const frames = fs.readdirSync(dir)
    .filter(name => name.endsWith('.jpg'))
    .sort()
    .slice(0, count)
    .map(name => path.join(dir, name))
  if (frames.length === 0) throw new Error('No video frames extracted')
  return frames
}

module.exports = { isVideoFile, extractVideoFrames }
