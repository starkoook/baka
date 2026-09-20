#!/usr/bin/env node
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const release = path.join(root, 'release')
const portable = path.join(release, 'Baka-TOOLS-Portable.zip')
const installer = path.join(release, 'Baka-TOOLS-Setup.exe')
if (!fs.existsSync(portable)) throw new Error(`免安装包不存在：${portable}`)

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

const portableSha256 = hashFile(portable)
// 安装版已不再默认构建；如果目录里恰好有旧的安装包，也一并登记，方便对照
const installerSha256 = fs.existsSync(installer) ? hashFile(installer) : null
const baka = require(path.join(root, 'package.json')).version
const componentManifestPath = path.join(root, '.cache', 'component-source', 'manifest.json')
const componentManifest = fs.existsSync(componentManifestPath)
  ? JSON.parse(fs.readFileSync(componentManifestPath, 'utf8'))
  : { components: {} }
const trainer = componentManifest.components?.trainer?.version || 'online'
const runtime = componentManifest.components?.['runtime-standard']?.version || 'online-managed-v1'
const builtAt = new Date().toISOString()
const versions = { baka, trainer, schema: trainer, runtime }
const artifacts = { portable: { file: 'Baka-TOOLS-Portable.zip', sha256: portableSha256 } }
if (installerSha256) artifacts.installer = { file: 'Baka-TOOLS-Setup.exe', sha256: installerSha256 }
const versionManifest = { formatVersion: 1, builtAt, versions, artifacts }
const updateManifest = {
  formatVersion: 1,
  builtAt,
  versions,
  compatibility: { minimumBaka: baka },
  artifact: { file: '../Baka-TOOLS-Portable.zip', sha256: portableSha256, kind: 'portable-zip' },
}

fs.mkdirSync(path.join(release, 'local-update'), { recursive: true })
fs.writeFileSync(path.join(release, 'version-manifest.json'), JSON.stringify(versionManifest, null, 2))
fs.writeFileSync(path.join(release, 'local-update', 'manifest.json'), JSON.stringify(updateManifest, null, 2))
fs.writeFileSync(path.join(release, 'Baka-TOOLS-Portable.zip.sha256'), `${portableSha256}  Baka-TOOLS-Portable.zip\n`)
console.log(`[release] portable SHA-256 ${portableSha256}`)
if (installerSha256) console.log(`[release] installer SHA-256 ${installerSha256}`)
