const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

function versionParts(value) {
  return String(value || '0').split(/[.+-]/).map(part => Number.parseInt(part, 10) || 0)
}

function compareVersions(left, right) {
  const a = versionParts(left)
  const b = versionParts(right)
  const size = Math.max(a.length, b.length)
  for (let index = 0; index < size; index++) {
    const difference = (a[index] || 0) - (b[index] || 0)
    if (difference) return difference
  }
  return 0
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('hex')
}

function inspectLocalUpdate(manifestPath, currentVersions = {}) {
  if (!manifestPath || !fs.existsSync(manifestPath)) {
    return { available: false, source: 'local', error: '尚未配置本地测试更新源' }
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  if (manifest.formatVersion !== 1 || !manifest.versions?.baka || !manifest.artifact?.file) {
    return { available: false, source: 'local', error: '本地更新清单格式不受支持' }
  }
  const artifactPath = path.resolve(path.dirname(manifestPath), manifest.artifact.file)
  const reasons = []
  const minimum = manifest.compatibility?.minimumBaka
  const maximum = manifest.compatibility?.maximumBaka
  if (minimum && compareVersions(currentVersions.baka, minimum) < 0) reasons.push(`当前 Baka 版本低于 ${minimum}`)
  if (maximum && compareVersions(currentVersions.baka, maximum) > 0) reasons.push(`当前 Baka 版本高于 ${maximum}`)

  return {
    available: compareVersions(manifest.versions.baka, currentVersions.baka) > 0,
    compatible: reasons.length === 0,
    reasons,
    source: 'local',
    manifestPath,
    versions: manifest.versions,
    artifact: { path: artifactPath, sha256: manifest.artifact.sha256 || '' },
  }
}

function verifyArtifact(artifact) {
  if (!artifact?.path || !fs.existsSync(artifact.path)) return { ok: false, error: '更新文件不存在' }
  const sha256 = sha256File(artifact.path)
  if (!artifact.sha256) return { ok: false, sha256, error: '更新清单缺少 SHA-256' }
  if (sha256.toLowerCase() !== artifact.sha256.toLowerCase()) return { ok: false, sha256, error: '更新文件校验失败' }
  return { ok: true, sha256 }
}

function recordVersions(dataRoot, versions) {
  fs.mkdirSync(dataRoot, { recursive: true })
  const registryPath = path.join(dataRoot, 'version-registry.json')
  let registry = { current: null, history: [] }
  try { registry = JSON.parse(fs.readFileSync(registryPath, 'utf8')) } catch {}
  if (registry.current && JSON.stringify(registry.current) !== JSON.stringify(versions)) {
    registry.history = [registry.current, ...(registry.history || [])].slice(0, 10)
  }
  registry.current = { ...versions, recordedAt: new Date().toISOString() }
  const temporary = `${registryPath}.tmp`
  fs.writeFileSync(temporary, JSON.stringify(registry, null, 2), 'utf8')
  fs.renameSync(temporary, registryPath)
  return registry
}

module.exports = { compareVersions, inspectLocalUpdate, recordVersions, sha256File, verifyArtifact }
