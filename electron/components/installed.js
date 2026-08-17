const fs = require('fs')
const path = require('path')

function readComponentState(dataRoot) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dataRoot, 'component-state.json'), 'utf8'))
  } catch {
    return { installed: {}, previous: {}, versions: {} }
  }
}

function findRuntimePython(runtimePath) {
  const candidates = [
    path.join(runtimePath, 'python.exe'),
    path.join(runtimePath, 'python', 'python.exe'),
    path.join(runtimePath, 'env', 'python', 'python.exe'),
  ]
  return candidates.find(fs.existsSync) || ''
}

function getManagedRuntime(dataRoot, runtimeId = '') {
  const state = readComponentState(dataRoot)
  const id = runtimeId ? `runtime-${runtimeId}` : Object.keys(state.installed || {}).find(key => key.startsWith('runtime-'))
  const installed = id ? state.installed[id] : null
  if (!id || !installed?.path || !fs.existsSync(installed.path)) return null
  const pythonPath = findRuntimePython(installed.path)
  if (!pythonPath) return null
  return { id: id.replace(/^runtime-/, ''), componentId: id, version: installed.version, path: installed.path, pythonPath }
}

module.exports = { findRuntimePython, getManagedRuntime, readComponentState }
