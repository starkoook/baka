const fs = require('fs')
const path = require('path')

function readTrainerVersion(repoRoot) {
  try {
    const payload = JSON.parse(fs.readFileSync(path.join(repoRoot, 'version.json'), 'utf8'))
    return String(payload.version || 'unversioned')
  } catch {
    return 'unversioned'
  }
}

function trainerStatePath(dataRoot) {
  return path.join(dataRoot, 'trainer', 'active.json')
}

function readState(dataRoot) {
  try {
    const state = JSON.parse(fs.readFileSync(trainerStatePath(dataRoot), 'utf8'))
    return {
      current: state.current || state.activeVersion || '',
      previous: state.previous || state.previousVersion || '',
    }
  } catch {
    return { current: '', previous: '' }
  }
}

function writeState(dataRoot, state) {
  const statePath = trainerStatePath(dataRoot)
  fs.mkdirSync(path.dirname(statePath), { recursive: true })
  const temporaryPath = `${statePath}.tmp`
  fs.writeFileSync(temporaryPath, JSON.stringify(state, null, 2), 'utf8')
  fs.renameSync(temporaryPath, statePath)
}

function versionDirectory(dataRoot, version) {
  const safeVersion = String(version).replace(/[^a-zA-Z0-9._-]/g, '_')
  return path.join(dataRoot, 'trainer', 'versions', safeVersion)
}

function isTrainerRepo(directory) {
  return !!directory && fs.existsSync(path.join(directory, 'gui.py'))
}

function getInstalledTrainer(dataRoot) {
  const state = readState(dataRoot)
  if (!state.current) return null
  const repoPath = versionDirectory(dataRoot, state.current)
  return isTrainerRepo(repoPath) ? { path: repoPath, version: state.current } : null
}

function ensureBundledTrainer({ bundledRoot, dataRoot }) {
  if (!isTrainerRepo(bundledRoot)) throw new Error('安装包内没有有效的训练器核心')
  const version = readTrainerVersion(bundledRoot)
  const destination = versionDirectory(dataRoot, version)
  const state = readState(dataRoot)
  let installed = false

  if (!isTrainerRepo(destination)) {
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.cpSync(bundledRoot, destination, { recursive: true, force: false })
    installed = true
  }

  if (state.current !== version) {
    writeState(dataRoot, {
      current: version,
      previous: state.current || state.previous || '',
    })
  }

  return { path: destination, version, installed }
}

function rollbackTrainer(dataRoot) {
  const state = readState(dataRoot)
  if (!state.previous) return null
  const previousPath = versionDirectory(dataRoot, state.previous)
  if (!isTrainerRepo(previousPath)) return null
  writeState(dataRoot, { current: state.previous, previous: state.current || '' })
  return { path: previousPath, version: state.previous }
}

module.exports = {
  ensureBundledTrainer,
  getInstalledTrainer,
  readTrainerVersion,
  rollbackTrainer,
}
