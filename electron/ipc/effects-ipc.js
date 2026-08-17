const { ipcMain } = require('electron')
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const { applyEffectChain } = require('./effects-core')
const { getDataRoot } = require('./paths')

function presetsDir() {
  const dir = path.join(getDataRoot(), 'fxpresets')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

async function renderEffects(inputPath, effects) {
  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const width = info.width
  const height = info.height
  const rgba = Buffer.isBuffer(data) ? new Uint8Array(data) : data
  const processed = applyEffectChain(rgba, width, height, effects || [])
  return sharp(Buffer.from(processed), { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer()
}

function sanitizePresetName(name) {
  return String(name || '').trim().replace(/[\\/:*?"<>|]/g, '_')
}

function registerEffectsHandlers() {
  ipcMain.handle('effects:render', async (_event, params) => {
    try {
      if (!params?.inputPath) throw new Error('inputPath is required')
      const buffer = await renderEffects(params.inputPath, params.effects || [])
      if (params.outputPath) {
        fs.mkdirSync(path.dirname(params.outputPath), { recursive: true })
        fs.writeFileSync(params.outputPath, buffer)
      }
      return { success: true, data: { base64: buffer.toString('base64'), outputPath: params.outputPath || '' } }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('effects:listPresets', async () => {
    try {
      const dir = presetsDir()
      const presets = fs.readdirSync(dir)
        .filter((file) => file.toLowerCase().endsWith('.json'))
        .map((file) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8')))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)))
      return { success: true, data: { presets } }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('effects:savePreset', async (_event, preset) => {
    try {
      const name = sanitizePresetName(preset?.name)
      if (!name) throw new Error('Preset name is required')
      const payload = {
        name,
        savedAt: new Date().toISOString(),
        effects: Array.isArray(preset.effects) ? preset.effects : [],
      }
      const dir = presetsDir()
      fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(payload, null, 2), 'utf-8')
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('effects:deletePreset', async (_event, name) => {
    try {
      const safeName = sanitizePresetName(name)
      const filePath = path.join(presetsDir(), `${safeName}.json`)
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })
}

module.exports = { registerEffectsHandlers }
