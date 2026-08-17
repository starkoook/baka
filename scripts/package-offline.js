#!/usr/bin/env node
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { prepareTrainerCore } = require('./prepare-trainer-core')

const root = path.resolve(__dirname, '..')
const release = path.join(root, 'release')
const archive = path.join(release, 'Baka-TOOLS-NVIDIA-Standard-Offline.zip')

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

async function writeChecksum() {
  if (!fs.existsSync(archive)) throw new Error(`离线包不存在：${archive}`)
  const sha256 = await sha256File(archive)
  fs.writeFileSync(`${archive}.sha256`, `${sha256}  ${path.basename(archive)}\n`)
  const trainerVersionPath = path.join(root, '.cache', 'trainer-core', 'version.json')
  const trainer = fs.existsSync(trainerVersionPath)
    ? JSON.parse(fs.readFileSync(trainerVersionPath, 'utf8')).version
    : 'v1.6.2'
  const manifest = {
    formatVersion: 1,
    builtAt: new Date().toISOString(),
    versions: {
      baka: require(path.join(root, 'package.json')).version,
      trainer,
      schema: trainer,
      runtime: 'nvidia-standard-torch2.10.0-cu128',
    },
    runtime: { id: 'standard', python: '3.12', torch: '2.10.0+cu128', torchvision: '0.25.0+cu128', triton: '3.6.0' },
    artifact: { file: path.basename(archive), sha256, size: fs.statSync(archive).size },
  }
  fs.writeFileSync(path.join(release, 'offline-version-manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(`[offline] ${archive}`)
  console.log(`[offline] SHA-256 ${sha256}`)
  return { archive, sha256 }
}

async function packageOffline() {
  if (process.argv.includes('--checksum-only')) return writeChecksum()

  const source = path.resolve(process.env.BAKA_OFFLINE_RUNTIME_SOURCE || 'D:\\comfyUI\\lora-rescripts-study')
  const runtime = path.join(source, 'env', 'python')
  const marker = path.join(runtime, '.deps_installed')
  const stdlib = fs.existsSync(runtime) && fs.readdirSync(runtime).some(name => /^python\d+\.zip$/i.test(name))
  if (!fs.existsSync(marker) || !stdlib) {
    throw new Error('标准 NVIDIA 环境尚未完整安装，离线包已停止生成。请先在参考训练器中把 standard 环境修复并安装完成。')
  }

  prepareTrainerCore()
  const setup = path.join(release, 'Baka-TOOLS-Setup.exe')
  if (!fs.existsSync(setup)) throw new Error('请先运行 npm run package 生成 Baka-TOOLS-Setup.exe')
  const staging = path.join(root, '.cache', 'offline-nvidia-standard')
  fs.rmSync(staging, { recursive: true, force: true })
  fs.cpSync(path.join(root, '.cache', 'trainer-core'), path.join(staging, 'trainer-core'), { recursive: true })
  fs.mkdirSync(path.join(staging, 'trainer-core', 'env'), { recursive: true })
  fs.cpSync(runtime, path.join(staging, 'trainer-core', 'env', 'python'), { recursive: true })
  fs.copyFileSync(path.join(root, 'THIRD_PARTY_NOTICES.md'), path.join(staging, 'THIRD_PARTY_NOTICES.md'))
  fs.copyFileSync(setup, path.join(staging, 'Baka-TOOLS-Setup.exe'))
  fs.cpSync(path.join(root, 'scripts', 'offline'), path.join(staging, 'offline-installer'), { recursive: true })

  fs.mkdirSync(release, { recursive: true })
  if (fs.existsSync(archive)) fs.rmSync(archive)
  execFileSync('tar.exe', ['-a', '-c', '-f', archive, '-C', staging, '.'], { stdio: 'inherit' })
  return writeChecksum()
}

if (require.main === module) {
  packageOffline().catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}

module.exports = { packageOffline, sha256File, writeChecksum }
