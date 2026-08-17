const { ipcMain } = require('electron')
const fs = require('fs')
const path = require('path')
const https = require('https')
const os = require('os')
const { getDataRoot } = require('./paths')

function getNodesDir() {
  const dir = path.join(getDataRoot(), 'nodes')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function isNodeDefinition(data) {
  if (!data || typeof data !== 'object') return false
  const hasId = typeof data.id === 'string' && data.id.trim().length > 0
  const hasLabel = typeof data.label === 'string' && data.label.trim().length > 0
  const hasPorts =
    Array.isArray(data.inputs)
    || Array.isArray(data.outputs)
    || typeof data.inputCount === 'number'
    || typeof data.outputCount === 'number'
  return hasId && hasLabel && hasPorts
}

function listCustomNodes() {
  const dir = getNodesDir()
  const nodes = []
  let entries = []
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return nodes
  }
  for (const file of entries) {
    if (path.extname(file).toLowerCase() !== '.json') continue
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'))
      if (isNodeDefinition(data)) {
        nodes.push({ ...data, file, _enabled: data._enabled !== false })
      }
    } catch {}
  }
  return nodes
}

function readNodeFile(file) {
  const target = path.join(getNodesDir(), path.basename(String(file || '')))
  if (!target.startsWith(getNodesDir()) || !fs.existsSync(target)) return null
  return JSON.parse(fs.readFileSync(target, 'utf-8'))
}

function downloadRepoZip(repo) {
  const baseZip = `https://codeload.github.com/${repo.owner}/${repo.repo}/zip/refs/heads/`
  return downloadFile(baseZip + 'main').catch(() => downloadFile(baseZip + 'master'))
}

function scanZipForNodes(zipBuffer) {
  const AdmZip = require('adm-zip')
  const zip = new AdmZip(zipBuffer)
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baka-nodes-'))
  try {
    zip.extractAllTo(tmpDir, true)
    const found = []
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(full)
        } else if (entry.name.toLowerCase().endsWith('.json')) {
          try {
            const data = JSON.parse(fs.readFileSync(full, 'utf-8'))
            if (isNodeDefinition(data)) found.push(data)
          } catch {}
        }
      }
    }
    walk(tmpDir)
    return found
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {}
  }
}

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'baka-tools-node-importer' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        return downloadFile(res.headers.location).then(resolve, reject)
      }
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error('下载失败（HTTP ' + res.statusCode + '）'))
      }
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks)))
    }).on('error', (err) => reject(new Error('网络错误：' + err.message)))
  })
}

function parseRepoUrl(input) {
  const trimmed = String(input || '').trim().replace(/\/+$/, '')
  if (!trimmed) return null
  const match = trimmed.match(/github\.com\/([^/\s]+)\/([^/\s]+)/)
  if (match) return { owner: match[1], repo: match[2] }
  const parts = trimmed.split('/')
  if (parts.length === 2 && parts[0] && parts[1]) {
    return { owner: parts[0], repo: parts[1] }
  }
  return null
}

async function importFromGithub(rawUrl) {
  const repo = parseRepoUrl(rawUrl)
  if (!repo) {
    return {
      success: false,
      error: '无法识别 GitHub 仓库地址，请输入类似 https://github.com/用户名/仓库名 的链接',
    }
  }
  let zipBuffer
  try {
    zipBuffer = await downloadRepoZip(repo)
  } catch (err) {
    return { success: false, error: `下载仓库失败：${err.message}。请检查网络或代理是否可用。` }
  }

  let found
  try {
    found = scanZipForNodes(zipBuffer)
  } catch {
    return { success: false, error: '下载的文件不是有效的压缩包' }
  }

  if (found.length === 0) {
    return {
      success: false,
      error: '这个仓库里没有找到节点定义文件。请确认它是节点仓库（包含定义节点的 JSON 文件）。',
    }
  }

  const nodesDir = getNodesDir()
  const installed = []
  const now = new Date().toISOString()
  for (const data of found) {
    const safeId = data.id.replace(/[^a-zA-Z0-9_-]/g, '_')
    const dest = path.join(nodesDir, `${safeId}.json`)
    const record = { ...data, _source: rawUrl.trim(), _updatedAt: now }
    fs.writeFileSync(dest, JSON.stringify(record, null, 2), 'utf-8')
    installed.push({ ...record, file: path.basename(dest) })
  }
  return { success: true, nodes: installed }
}

async function updateNode(file) {
  const data = readNodeFile(file)
  if (!data) return { success: false, error: '节点文件不存在' }
  if (!data._source) {
    return { success: false, error: '这个节点是本地手动放入的，没有来源仓库，无法更新。' }
  }
  const repo = parseRepoUrl(data._source)
  if (!repo) return { success: false, error: '节点来源地址无效，无法更新。' }
  try {
    const zipBuffer = await downloadRepoZip(repo)
    const found = scanZipForNodes(zipBuffer)
    const match = found.find((candidate) => candidate.id === data.id)
    if (!match) {
      return { success: false, error: '仓库里找不到同 ID 的节点（可能已改名或移除）。' }
    }
    const dest = path.join(getNodesDir(), path.basename(String(file)))
    const record = { ...match, _enabled: data._enabled !== false, _source: data._source, _updatedAt: new Date().toISOString() }
    fs.writeFileSync(dest, JSON.stringify(record, null, 2), 'utf-8')
    return { success: true, node: { ...record, file: path.basename(dest) } }
  } catch (err) {
    return { success: false, error: `更新失败：${err.message}` }
  }
}

function removeNode(file) {
  const target = path.join(getNodesDir(), path.basename(String(file || '')))
  if (!target.startsWith(getNodesDir()) || !fs.existsSync(target)) {
    return { success: false, error: '节点不存在' }
  }
  try {
    fs.unlinkSync(target)
    return { success: true }
  } catch (err) {
    return { success: false, error: '删除失败：' + err.message }
  }
}

function setNodeEnabled(file, enabled) {
  const target = path.join(getNodesDir(), path.basename(String(file || '')))
  if (!target.startsWith(getNodesDir()) || !fs.existsSync(target)) {
    return { success: false, error: '节点不存在' }
  }
  try {
    const data = JSON.parse(fs.readFileSync(target, 'utf-8'))
    data._enabled = Boolean(enabled)
    fs.writeFileSync(target, JSON.stringify(data, null, 2), 'utf-8')
    return { success: true }
  } catch (err) {
    return { success: false, error: '操作失败：' + err.message }
  }
}

function registerNodeHandlers() {
  ipcMain.handle('nodes:list', () => listCustomNodes())
  ipcMain.handle('nodes:importFromGithub', (_event, url) => importFromGithub(String(url || '')))
  ipcMain.handle('nodes:update', (_event, file) => updateNode(String(file || '')))
  ipcMain.handle('nodes:remove', (_event, file) => removeNode(String(file || '')))
  ipcMain.handle('nodes:setEnabled', (_event, file, enabled) => setNodeEnabled(String(file || ''), enabled))
}

module.exports = { registerNodeHandlers, listCustomNodes, getNodesDir }
