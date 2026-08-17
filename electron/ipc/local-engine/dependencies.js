const fs = require('fs')
const path = require('path')

const EXTENSION_NODE_MAP_URL = 'https://raw.githubusercontent.com/Comfy-Org/ComfyUI-Manager/main/extension-node-map.json'
const CUSTOM_NODE_LIST_URL = 'https://raw.githubusercontent.com/Comfy-Org/ComfyUI-Manager/main/custom-node-list.json'
const DAY = 24 * 60 * 60 * 1000

function candidate(repository, title, exact = false) {
  return { repository, title: title || repository, exact }
}

function githubReference(entry) {
  if (typeof entry?.reference === 'string' && entry.reference) return entry.reference
  const files = Array.isArray(entry?.files) ? entry.files : []
  return files.find(file => typeof file === 'string' && /^https:\/\/github\.com\//i.test(file)) || ''
}

function buildNodeIndex(extensionMap = {}, customNodeList = []) {
  const nodeNames = new Map()
  const registryIds = new Map()
  for (const [repository, value] of Object.entries(extensionMap || {})) {
    const nodes = Array.isArray(value) ? value[0] : value?.nodes
    const meta = Array.isArray(value) ? value[1] : value
    for (const nodeName of Array.isArray(nodes) ? nodes : []) {
      const values = nodeNames.get(nodeName) || []
      values.push(candidate(repository, meta?.title_aux || meta?.title))
      nodeNames.set(nodeName, values)
    }
  }
  const entries = Array.isArray(customNodeList) ? customNodeList : customNodeList?.custom_nodes || []
  for (const entry of entries) {
    const repository = githubReference(entry)
    if (!entry?.id || !repository) continue
    const values = registryIds.get(entry.id) || []
    values.push(candidate(repository, entry.title || entry.name))
    registryIds.set(entry.id, values)
  }
  return { nodeNames, registryIds }
}

function uniqueCandidates(values) {
  const seen = new Set()
  return values.filter(value => !seen.has(value.repository) && seen.add(value.repository))
}

function resolveMissingNodes(required = [], installed = [], hints = [], index = { nodeNames: new Map(), registryIds: new Map() }) {
  const installedSet = new Set(installed)
  return required.map(nodeType => {
    if (installedSet.has(nodeType)) return { nodeType, status: 'installed', candidates: [] }
    const hint = hints.find(item => item?.nodeType === nodeType) || {}
    let candidates = []
    if (hint.repository) candidates = [candidate(hint.repository, hint.title, true)]
    else if (hint.registryId && index.registryIds?.has(hint.registryId)) candidates = index.registryIds.get(hint.registryId).map(item => ({ ...item, exact: true }))
    else candidates = index.nodeNames?.get(nodeType) || []
    candidates = uniqueCandidates(candidates)
    const status = candidates.length === 0 ? 'unknown' : candidates.length === 1 ? 'missing' : 'ambiguous'
    return { nodeType, status, candidates }
  })
}

function cachePaths(dataRoot) {
  const directory = path.join(dataRoot, 'engines', 'dependency-map')
  return { directory, extension: path.join(directory, 'extension-node-map.json'), custom: path.join(directory, 'custom-node-list.json'), metadata: path.join(directory, 'metadata.json') }
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null }
}

function validExtensionMap(value) { return value && typeof value === 'object' && !Array.isArray(value) }
function validCustomList(value) { return Array.isArray(value) || Array.isArray(value?.custom_nodes) }

async function loadDependencyMap(dataRoot, { now = Date.now(), force = false, fetchImpl = fetch } = {}) {
  const files = cachePaths(dataRoot)
  const metadata = readJson(files.metadata) || {}
  let extensionMap = readJson(files.extension)
  let customNodeList = readJson(files.custom)
  const stale = force || !metadata.refreshedAt || now - metadata.refreshedAt >= DAY
  if (stale) {
    try {
      const [extensionResponse, customResponse] = await Promise.all([fetchImpl(EXTENSION_NODE_MAP_URL), fetchImpl(CUSTOM_NODE_LIST_URL)])
      if (!extensionResponse.ok || !customResponse.ok) throw new Error('官方节点映射请求失败')
      const [nextExtension, nextCustom] = await Promise.all([extensionResponse.json(), customResponse.json()])
      if (!validExtensionMap(nextExtension) || !validCustomList(nextCustom)) throw new Error('官方节点映射格式无效')
      extensionMap = nextExtension
      customNodeList = nextCustom
      fs.mkdirSync(files.directory, { recursive: true })
      fs.writeFileSync(files.extension, JSON.stringify(extensionMap), 'utf8')
      fs.writeFileSync(files.custom, JSON.stringify(customNodeList), 'utf8')
      fs.writeFileSync(files.metadata, JSON.stringify({ refreshedAt: now }), 'utf8')
    } catch (error) {
      if (!validExtensionMap(extensionMap) || !validCustomList(customNodeList)) throw error
    }
  }
  if (!validExtensionMap(extensionMap) || !validCustomList(customNodeList)) throw new Error('没有可用的 ComfyUI 节点映射缓存')
  return buildNodeIndex(extensionMap, customNodeList)
}

module.exports = { EXTENSION_NODE_MAP_URL, CUSTOM_NODE_LIST_URL, buildNodeIndex, resolveMissingNodes, loadDependencyMap }
