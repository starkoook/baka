#!/usr/bin/env node
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { prepareTrainerCore } = require('./prepare-trainer-core')

const root = path.resolve(__dirname, '..')
const output = path.join(root, '.cache', 'component-source')

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

function createZip(archive, sourceRoot, entry) {
  fs.rmSync(archive, { force: true })
  execFileSync('tar.exe', ['-a', '-c', '-f', archive, '-C', sourceRoot, entry], { stdio: 'inherit' })
}

function runtimeVersion(pythonPath) {
  try {
    const value = execFileSync(pythonPath, ['-c', 'import torch; print(torch.__version__)'], {
      encoding: 'utf8', timeout: 30000, windowsHide: true,
    }).trim().replace(/[^a-zA-Z0-9.+-]/g, '-')
    return `torch-${value}-standard-v1`
  } catch {
    return 'nvidia-standard-v1'
  }
}

function directorySize(directory) {
  let total = 0
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    total += entry.isDirectory() ? directorySize(entryPath) : fs.statSync(entryPath).size
  }
  return total
}

async function buildLocalComponentSource() {
  const includeRuntime = process.argv.includes('--include-runtime')

  prepareTrainerCore()
  const trainerRoot = path.join(root, '.cache', 'trainer-core')
  const trainerVersionPath = path.join(trainerRoot, 'version.json')
  const trainerVersion = JSON.parse(fs.readFileSync(trainerVersionPath, 'utf8')).version || 'v1.6.2'
  fs.mkdirSync(output, { recursive: true })

  const trainerFile = `trainer-${trainerVersion}.zip`
  const trainerArchive = path.join(output, trainerFile)

  console.log('[components] packaging trainer core...')
  createZip(trainerArchive, trainerRoot, '.')
  const trainerHash = await sha256File(trainerArchive)
  const manifest = {
    formatVersion: 1,
    channel: 'local-test',
    builtAt: new Date().toISOString(),
    components: {
      trainer: {
        version: trainerVersion,
        file: trainerFile,
        size: fs.statSync(trainerArchive).size,
        installedSize: directorySize(trainerRoot),
        sha256: trainerHash,
        minimumBaka: '0.1.0',
        schemaVersion: trainerVersion,
      },
    },
  }
  if (includeRuntime) {
    const reference = path.resolve(process.env.BAKA_RUNTIME_SOURCE || 'D:\\comfyUI\\lora-rescripts-study')
    const runtimeParent = path.join(reference, 'env')
    const pythonPath = path.join(runtimeParent, 'python', 'python.exe')
    if (!fs.existsSync(pythonPath)) throw new Error(`标准训练环境不存在：${pythonPath}`)
    const runtimeVersionValue = runtimeVersion(pythonPath)
    const runtimeFile = `runtime-${runtimeVersionValue}.zip`
    const runtimeArchive = path.join(output, runtimeFile)
    console.log('[components] packaging NVIDIA standard runtime...')
    createZip(runtimeArchive, runtimeParent, 'python')
    manifest.components['runtime-standard'] = {
      version: runtimeVersionValue,
      file: runtimeFile,
      size: fs.statSync(runtimeArchive).size,
      installedSize: directorySize(path.join(runtimeParent, 'python')),
      sha256: await sha256File(runtimeArchive),
      trainerRange: '>=1.6.0 <2.0.0',
      pythonPath: 'python/python.exe',
    }
  }
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
  console.log(`[components] source ready: ${output}`)
  return manifest
}

if (require.main === module) {
  buildLocalComponentSource().catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}

module.exports = { buildLocalComponentSource, runtimeVersion, sha256File }
