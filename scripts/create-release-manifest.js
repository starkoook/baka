#!/usr/bin/env node
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const release = path.join(root, 'release')
const installer = path.join(release, 'Baka-TOOLS-Setup.exe')
if (!fs.existsSync(installer)) throw new Error(`安装包不存在：${installer}`)

const sha256 = crypto.createHash('sha256').update(fs.readFileSync(installer)).digest('hex')
const baka = require(path.join(root, 'package.json')).version
const componentManifestPath = path.join(root, '.cache', 'component-source', 'manifest.json')
const componentManifest = fs.existsSync(componentManifestPath)
  ? JSON.parse(fs.readFileSync(componentManifestPath, 'utf8'))
  : { components: {} }
const trainer = componentManifest.components?.trainer?.version || 'online'
const runtime = componentManifest.components?.['runtime-standard']?.version || 'online-managed-v1'
const builtAt = new Date().toISOString()
const versions = { baka, trainer, schema: trainer, runtime }
const versionManifest = { formatVersion: 1, builtAt, versions, artifacts: { installer: { file: 'Baka-TOOLS-Setup.exe', sha256 } } }
const updateManifest = {
  formatVersion: 1,
  builtAt,
  versions,
  compatibility: { minimumBaka: baka },
  artifact: { file: '../Baka-TOOLS-Setup.exe', sha256 },
}

fs.mkdirSync(path.join(release, 'local-update'), { recursive: true })
fs.writeFileSync(path.join(release, 'version-manifest.json'), JSON.stringify(versionManifest, null, 2))
fs.writeFileSync(path.join(release, 'local-update', 'manifest.json'), JSON.stringify(updateManifest, null, 2))
fs.writeFileSync(path.join(release, 'Baka-TOOLS-Setup.exe.sha256'), `${sha256}  Baka-TOOLS-Setup.exe\n`)
console.log(`[release] SHA-256 ${sha256}`)
