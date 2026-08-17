#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '..')
const target = path.join(projectRoot, '.cache', 'trainer-core')
const candidates = [
  process.env.BAKA_TRAINER_SOURCE,
  path.join(projectRoot, 'lora-rescripts-main'),
  'D:\\comfyUI\\lora-rescripts-study',
].filter(Boolean)

function isTrainerCore(folder) {
  return fs.existsSync(path.join(folder, 'gui.py'))
    && fs.existsSync(path.join(folder, 'version.json'))
    && fs.existsSync(path.join(folder, 'LICENSE'))
}

function shouldInclude(sourceRoot, sourcePath) {
  const relative = path.relative(sourceRoot, sourcePath)
  const top = relative.split(path.sep)[0]
  const excluded = new Set([
    '.git', '__pycache__', 'dataset', 'env', 'logs', 'models', 'output', 'outputs',
    'python', 'python_blackwell', 'python_rocm_amd', 'python_sageattention',
    'python_tageditor', 'python_xpu_intel', 'sd-models', 'wheel',
  ])
  return !excluded.has(top) && !top.startsWith('python-')
}

function prepareTrainerCore() {
  const source = candidates.find(isTrainerCore)
  if (!source) throw new Error('找不到可打包的训练器核心；请设置 BAKA_TRAINER_SOURCE')
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.rmSync(target, { recursive: true, force: true })
  fs.cpSync(source, target, {
    recursive: true,
    filter: sourcePath => shouldInclude(source, sourcePath),
  })
  if (!isTrainerCore(target)) throw new Error('训练器核心复制后校验失败')
  const version = JSON.parse(fs.readFileSync(path.join(target, 'version.json'), 'utf8')).version
  return { source, target, version }
}

if (require.main === module) {
  const result = prepareTrainerCore()
  console.log(`[trainer-core] ${result.version}: ${result.source} -> ${result.target}`)
}

module.exports = { prepareTrainerCore, shouldInclude }
