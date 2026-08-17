const { ipcMain } = require('electron')
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const { parseMetadata } = require('./metadata')
const MAX_IMAGE_BYTES = 100 * 1024 * 1024

const MIME = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.bmp', 'image/bmp'],
])

async function inspectWorkbenchImage(filePath) {
  const resolved = path.resolve(String(filePath || ''))
  const mimeType = MIME.get(path.extname(resolved).toLowerCase())
  if (!mimeType) return { success: false, error: '不支持的图片格式' }

  try {
    const stats = await fs.promises.stat(resolved)
    if (!stats.isFile() || stats.size > MAX_IMAGE_BYTES) {
      return { success: false, error: stats.size > MAX_IMAGE_BYTES ? '图片超过 100 MB，无法加载' : '所选路径不是文件' }
    }
    const [buffer, dimensions] = await Promise.all([
      fs.promises.readFile(resolved),
      sharp(resolved).metadata(),
    ])
    return {
      success: true,
      image: {
        filePath: resolved,
        fileName: path.basename(resolved),
        mimeType,
        width: dimensions.width || 0,
        height: dimensions.height || 0,
        dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}`,
        metadata: parseMetadata(resolved),
      },
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

function registerWorkbenchImageHandlers() {
  ipcMain.handle('workbenchImage:inspect', (_event, filePath) => inspectWorkbenchImage(filePath))
}

module.exports = { MAX_IMAGE_BYTES, inspectWorkbenchImage, registerWorkbenchImageHandlers }
