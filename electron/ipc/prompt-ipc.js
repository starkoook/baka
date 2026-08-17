const { ipcMain } = require('electron')
const fs = require('fs')
const path = require('path')
const { WildcardEngine } = require('./wildcard')
const { convertWeightedCaption } = require('./tag-weight')
const { getDataRoot } = require('./paths')

function wildcardRoot() {
  return path.join(getDataRoot(), 'wildcards')
}

function seedSampleWildcards(root) {
  fs.mkdirSync(root, { recursive: true })
  const hasTxt = fs.readdirSync(root).some((file) => file.toLowerCase().endsWith('.txt'))
  if (hasTxt) return

  const samples = {
    'hair.txt': '# 发型通配符\nlong hair\nshort hair\ntwintails\nponytail\n',
    'eyes.txt': '# 眼睛通配符\nblue eyes\nred eyes\ngreen eyes\n',
    'outfit.txt': '# 服装通配符\nschool uniform\nmaid\nsuit\n',
  }
  for (const [file, content] of Object.entries(samples)) {
    const target = path.join(root, file)
    if (!fs.existsSync(target)) fs.writeFileSync(target, content, 'utf-8')
  }
}

async function listWildcards() {
  const root = wildcardRoot()
  seedSampleWildcards(root)
  const engine = await WildcardEngine.load(root)
  return engine.entries
}

function registerPromptHandlers() {
  ipcMain.handle('prompt:listWildcards', async () => {
    try {
      return { success: true, data: { entries: await listWildcards() } }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('prompt:expandWildcards', async (_event, params) => {
    try {
      const root = wildcardRoot()
      seedSampleWildcards(root)
      const engine = await WildcardEngine.load(root)
      const result = engine.expand(params?.text || '', {
        seed: params?.seed ?? 0,
        weightFormat: params?.weightFormat || 'naiNumeric',
      })
      return { success: true, data: result }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('prompt:convertWeights', async (_event, params) => {
    try {
      const text = convertWeightedCaption(
        params?.text || '',
        params?.from || 'sd',
        params?.to || 'naiNumeric',
      )
      return { success: true, data: { text } }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })
}

module.exports = { registerPromptHandlers, wildcardRoot }
