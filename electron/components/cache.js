const fs = require('fs')
const path = require('path')
const { parseManifest } = require('./manifest')
const { sha256File } = require('./download')

async function verifyPackages(manifest, root, componentIds) {
  const verified = []
  for (const componentId of componentIds) {
    const component = manifest.components[componentId]
    if (!component) throw new Error(`组件清单中不存在 ${componentId}`)
    const packagePath = path.join(root, component.file)
    if (!fs.existsSync(packagePath)) throw new Error(`组件包不存在：${component.file}`)
    const actual = await sha256File(packagePath)
    if (actual.toLowerCase() !== component.sha256.toLowerCase()) {
      throw new Error(`组件 ${componentId} 校验失败`)
    }
    verified.push({ componentId, component, packagePath })
  }
  return verified
}

async function exportComponentCache({ manifest: rawManifest, componentIds, packageRoot, destination }) {
  const manifest = parseManifest(rawManifest)
  const verified = await verifyPackages(manifest, packageRoot, componentIds)
  fs.mkdirSync(destination, { recursive: true })

  const components = {}
  for (const { componentId, component, packagePath } of verified) {
    const destinationPath = path.join(destination, component.file)
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true })
    fs.copyFileSync(packagePath, destinationPath)
    components[componentId] = component
  }
  fs.writeFileSync(
    path.join(destination, 'manifest.json'),
    JSON.stringify({ formatVersion: 1, channel: 'portable-cache', components }, null, 2),
    'utf8',
  )
  return { success: true, count: verified.length }
}

async function inspectComponentCache({ source }) {
  const manifestPath = path.join(source, 'manifest.json')
  if (!fs.existsSync(manifestPath)) throw new Error('缓存目录中没有 manifest.json')
  const manifest = parseManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf8')))
  const componentIds = Object.keys(manifest.components)
  const verified = await verifyPackages(manifest, source, componentIds)
  return { success: true, count: verified.length, manifest }
}

async function importComponentCache({ source, packageRoot }) {
  const inspected = await inspectComponentCache({ source })
  const { manifest } = inspected
  const componentIds = Object.keys(manifest.components)
  const verified = componentIds.map(componentId => ({
    componentId,
    component: manifest.components[componentId],
    packagePath: path.join(source, manifest.components[componentId].file),
  }))

  fs.mkdirSync(packageRoot, { recursive: true })
  for (const { component, packagePath } of verified) {
    const destinationPath = path.join(packageRoot, component.file)
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true })
    fs.copyFileSync(packagePath, destinationPath)
  }
  fs.writeFileSync(
    path.join(packageRoot, 'manifest.json'),
    JSON.stringify({ ...manifest, channel: 'imported-cache' }, null, 2),
    'utf8',
  )
  return { success: true, count: verified.length, manifest }
}

function clearComponentCache(cacheRoot) {
  fs.rmSync(cacheRoot, { recursive: true, force: true })
  fs.mkdirSync(cacheRoot, { recursive: true })
  return { success: true }
}

module.exports = { clearComponentCache, exportComponentCache, importComponentCache, inspectComponentCache }
