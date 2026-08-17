const path = require('path')

function versionParts(value) {
  return String(value || '0')
    .replace(/^[^0-9]*/, '')
    .split(/[.+-]/)
    .map(part => Number.parseInt(part, 10) || 0)
}

function compareVersions(left, right) {
  const a = versionParts(left)
  const b = versionParts(right)
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (a[index] || 0) - (b[index] || 0)
    if (difference) return difference
  }
  return 0
}

function satisfiesRange(version, range = '') {
  return String(range).split(/\s+/).filter(Boolean).every(rule => {
    const match = rule.match(/^(>=|<=|>|<|=)?(.+)$/)
    if (!match) return false
    const difference = compareVersions(version, match[2])
    const operator = match[1] || '='
    if (operator === '>=') return difference >= 0
    if (operator === '<=') return difference <= 0
    if (operator === '>') return difference > 0
    if (operator === '<') return difference < 0
    return difference === 0
  })
}

function parseComponent(id, value) {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(id)) throw new Error(`组件 ID 不合法：${id}`)
  if (!value || typeof value !== 'object') throw new Error(`组件 ${id} 格式错误`)
  if (!value.version || !value.file || !Number.isFinite(value.size) || value.size < 0) {
    throw new Error(`组件 ${id} 缺少有效的版本、文件或大小`)
  }
  if (!/^[a-z0-9][a-z0-9._+-]*$/i.test(String(value.version))) {
    throw new Error(`组件 ${id} 的版本号不合法`)
  }
  if (!/^[a-f0-9]{64}$/i.test(value.sha256 || '')) throw new Error(`组件 ${id} 的 SHA-256 不合法`)
  const normalizedFile = path.posix.normalize(String(value.file).replaceAll('\\', '/'))
  if (normalizedFile.startsWith('../') || path.posix.isAbsolute(normalizedFile) || /^[a-z]:/i.test(normalizedFile)) {
    throw new Error(`组件 ${id} 文件路径越界`)
  }
  return Object.freeze({ id, ...value, file: normalizedFile })
}

function parseManifest(input) {
  if (input?.formatVersion !== 1 || typeof input.channel !== 'string' || !input.channel || !input.components) {
    throw new Error('组件清单格式不受支持')
  }
  const components = Object.fromEntries(
    Object.entries(input.components).map(([id, value]) => [id, parseComponent(id, value)]),
  )
  return Object.freeze({ formatVersion: 1, channel: input.channel, components: Object.freeze(components) })
}

function selectInstallSet(manifest, runtimeId, bakaVersion) {
  const trainer = manifest.components.trainer
  const runtime = manifest.components[`runtime-${runtimeId}`]
  if (!trainer || !runtime) throw new Error(`组件清单不包含 ${runtimeId} 训练环境`)
  if (trainer.minimumBaka && compareVersions(bakaVersion, trainer.minimumBaka) < 0) {
    throw new Error(`需要 Baka ${trainer.minimumBaka} 或更高版本`)
  }
  if (runtime.trainerRange && !satisfiesRange(trainer.version, runtime.trainerRange)) {
    throw new Error(`${runtimeId} 环境与训练器 ${trainer.version} 不兼容`)
  }
  return [trainer, runtime]
}

module.exports = { compareVersions, parseManifest, satisfiesRange, selectInstallSet }
