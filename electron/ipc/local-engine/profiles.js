const fs = require('fs')
const path = require('path')

function profileFile(dataRoot) {
  return path.join(dataRoot, 'engines', 'profiles.json')
}

function loadProfiles(dataRoot) {
  const file = profileFile(dataRoot)
  if (!fs.existsSync(file)) return []
  const value = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!Array.isArray(value)) throw new Error('本地引擎档案格式无效')
  return value
}

function writeProfiles(dataRoot, profiles) {
  const file = profileFile(dataRoot)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temp = `${file}.tmp`
  fs.writeFileSync(temp, JSON.stringify(profiles, null, 2), 'utf8')
  fs.renameSync(temp, file)
}

function saveProfile(dataRoot, profile) {
  const profiles = loadProfiles(dataRoot).filter(item => item.id !== profile.id)
  writeProfiles(dataRoot, [...profiles, profile])
  return profile
}

function removeProfile(dataRoot, id) {
  writeProfiles(dataRoot, loadProfiles(dataRoot).filter(item => item.id !== id))
}

function firstExisting(candidates) {
  return candidates.find(candidate => fs.existsSync(candidate)) || ''
}

function contained(root, candidate) {
  const relative = path.relative(root, candidate)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function derivedPath(root, name) {
  const candidate = path.join(root, name)
  return contained(root, candidate) ? candidate : ''
}

function detectEngineRoot(root, type) {
  const resolved = path.resolve(String(root || ''))
  if (type === 'comfy') {
    const engineRoot = fs.existsSync(path.join(resolved, 'main.py'))
      ? resolved
      : fs.existsSync(path.join(resolved, 'ComfyUI', 'main.py')) ? path.join(resolved, 'ComfyUI') : ''
    if (!engineRoot) return { valid: false, error: '所选目录不是 ComfyUI 安装目录' }
    const pythonPath = firstExisting([
      path.join(resolved, 'python_embeded', 'python.exe'),
      path.join(resolved, 'python_embedded', 'python.exe'),
      path.join(engineRoot, 'venv', 'Scripts', 'python.exe'),
    ])
    if (!pythonPath) return { valid: false, error: '没有找到 ComfyUI 使用的 Python' }
    return {
      valid: true, type: 'comfy', root: resolved, engineRoot, pythonPath,
      mainPath: path.join(engineRoot, 'main.py'),
      customNodesDir: derivedPath(engineRoot, 'custom_nodes'),
      modelsDir: derivedPath(engineRoot, 'models'),
      outputDir: derivedPath(engineRoot, 'output'),
      baseUrl: 'http://127.0.0.1:8188',
    }
  }
  if (type !== 'webui') return { valid: false, error: '不支持的本地引擎类型' }
  const entryPath = firstExisting([
    path.join(resolved, 'webui-user.bat'), path.join(resolved, 'webui.bat'), path.join(resolved, 'launch.py'),
  ])
  if (!entryPath) return { valid: false, error: '所选目录不是 WebUI 或 Forge 安装目录' }
  return {
    valid: true, type: 'webui', root: resolved, engineRoot: resolved, entryPath,
    pythonPath: firstExisting([path.join(resolved, 'venv', 'Scripts', 'python.exe'), path.join(resolved, 'system', 'python', 'python.exe')]),
    extensionsDir: derivedPath(resolved, 'extensions'),
    modelsDir: derivedPath(resolved, 'models'),
    outputDir: derivedPath(resolved, 'outputs'),
    baseUrl: 'http://127.0.0.1:7860',
  }
}

function detectLocalEngines(savedProfiles = []) {
  const common = ['C:\\ComfyUI', 'D:\\ComfyUI', 'C:\\stable-diffusion-webui', 'D:\\stable-diffusion-webui', 'C:\\Forge', 'D:\\Forge']
  const candidates = [...savedProfiles.map(profile => profile.root), ...common].filter(Boolean)
  const seen = new Set()
  const results = []
  for (const root of candidates) {
    const resolved = path.resolve(root)
    if (seen.has(resolved) || !fs.existsSync(resolved)) continue
    seen.add(resolved)
    for (const type of ['comfy', 'webui']) {
      const result = detectEngineRoot(resolved, type)
      if (result.valid) results.push(result)
    }
  }
  return results
}

module.exports = { loadProfiles, saveProfile, removeProfile, detectEngineRoot, detectLocalEngines }
