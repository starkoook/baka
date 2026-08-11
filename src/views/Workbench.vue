<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import ContextMenu, { type ContextMenuItem } from '@/components/common/ContextMenu.vue'

const appStore = useAppStore()

const NODE_WIDTH = 220
const TITLE_HEIGHT = 38
const GRID = 40
const MINI_W = 200
const MINI_TITLE_H = 24
const MINI_H = 124
const MINI_NODE_ALPHA = 0.72
const MAX_HISTORY = 50

interface WbNode {
  id: number
  x: number
  y: number
  width: number
  height: number
  kind: string
  label: string
  src: string
  contentH: number
  rotation: number
  text?: string
  defId?: string
  inputCount: number
  outputCount: number
  nodeColor?: string
  inputMeta?: NodeInputDef[]
  inTypes?: string[]
  outTypes?: string[]
  size?: number
  execState?: 'running' | 'done' | 'error'
  prompt?: string
  apiConfigId?: string
  model?: string
  temperature?: number
  genMode?: 'text' | 'image'
  genPrompt?: string
  genSize?: string
}

interface WbEdge {
  id: number
  from: number
  to: number
}

interface Snapshot {
  nodes: WbNode[]
  edges: WbEdge[]
}

interface DragState {
  kind: 'pan' | 'node' | 'resize' | 'box' | 'mini'
  startX: number
  startY: number
  startPanX: number
  startPanY: number
  nodeId?: number
  startWidth?: number
  startHeight?: number
  startNodes?: { id: number; x: number; y: number }[]
  committed?: boolean
}

// 内置节点类型 + 用户自定义节点共同构成开放注册表：任何 JSON 节点定义都能添加
const BUILTIN_NODES: { kind: string; label: string; icon: string }[] = [
  { kind: 'image', label: '图片节点', icon: '⬡' },
  { kind: 'video', label: '视频节点', icon: '▶' },
  { kind: 'text', label: '文本节点', icon: '❝' },
  { kind: 'reroute', label: '绕线节点', icon: '◎' },
  { kind: 'resize', label: '图片缩放', icon: '⇲' },
  { kind: 'save', label: '保存图片', icon: '💾' },
  { kind: 'ai-tag', label: 'AI 打标', icon: '🏷' },
  { kind: 'ai-text', label: 'LLM 文本', icon: '✧' },
]

const nodes = ref<WbNode[]>([])
const edges = ref<WbEdge[]>([])
const selectedNodeIds = ref<number[]>([])
const selectedEdgeId = ref<number | null>(null)
const addMenuOpen = ref(false)
const miniCanvas = ref<HTMLCanvasElement | null>(null)
const savingId = ref<number | null>(null)
const apiConfigs = ref<WorkbenchApiConfig[]>([])
const apiPanelOpen = ref(false)
const apiTesting = ref<string | null>(null)
const apiFetchingModels = ref(false)
const apiModels = ref<string[]>([])
const nodeModelCache = ref<Record<string, string[]>>({})
const gridPopup = ref<number | null>(null)
const resizePopup = ref<number | null>(null)
const cropState = ref<{
  nodeId: number
  x1: number
  y1: number
  x2: number
  y2: number
} | null>(null)
const apiMessage = ref<{ ok: boolean; text: string } | null>(null)
const apiForm = ref<WorkbenchApiConfig>({ id: '', name: '', provider: 'openai', baseUrl: '', apiKey: '', model: '' })
const contextMenu = ref<{ x: number; y: number; items: ContextMenuItem[] } | null>(null)
const customNodes = ref<NodeDefinition[]>([])
const enabledCustomNodes = computed(() => customNodes.value.filter((def) => def._enabled !== false))
const managerOpen = ref(false)
const repoUrl = ref('')
const importing = ref(false)
const updatingFile = ref<string | null>(null)
const managerMessage = ref<{ ok: boolean; text: string } | null>(null)
const zoom = ref(1)
const pan = ref({ x: 80, y: 80 })
const snapGrid = ref(true)
const spaceDown = ref(false)
const canvasRef = ref<HTMLElement | null>(null)
const viewSize = ref({ w: 0, h: 0 })
const boxSelect = ref<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
const hintDismissed = ref(false)
const undoStack = ref<Snapshot[]>([])
const redoStack = ref<Snapshot[]>([])
const clipboard = ref<Snapshot | null>(null)
let pasteSeq = 0
let nextId = 1

const dragState = ref<DragState | null>(null)
const linking = ref<{ from: number; x: number; y: number; fromX: number; fromY: number } | null>(null)

const gridStyle = computed(() => ({
  backgroundSize: `${GRID * zoom.value}px ${GRID * zoom.value}px`,
  backgroundPosition: `${pan.value.x}px ${pan.value.y}px`,
}))

const worldStyle = computed(() => ({
  transform: `translate(${pan.value.x}px, ${pan.value.y}px) scale(${zoom.value})`,
  transformOrigin: '0 0',
}))

function screenToWorld(clientX: number, clientY: number) {
  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect) return null
  return {
    x: (clientX - rect.left - pan.value.x) / zoom.value,
    y: (clientY - rect.top - pan.value.y) / zoom.value,
  }
}

function nodeStyle(node: WbNode) {
  return {
    transform: `translate(${node.x}px, ${node.y}px) rotate(${node.rotation}deg)`,
    width: `${node.width}px`,
    height: `${node.height}px`,
  }
}

function portStyle(node: WbNode, index: number, total: number) {
  const t = total <= 1 ? 50 : ((index + 1) * 100) / (total + 1)
  return { top: `${t}%` }
}

function portPosition(nodeId: number, side: 'in' | 'out') {
  const node = nodes.value.find((item) => item.id === nodeId)
  if (!node) return { x: 0, y: 0 }
  const h = node.height * zoom.value
  const nx = pan.value.x + node.x * zoom.value
  const ny = pan.value.y + node.y * zoom.value
  return side === 'in'
    ? { x: nx, y: ny + h / 2 }
    : { x: nx + node.width * zoom.value, y: ny + h / 2 }
}

function edgePath(edge: WbEdge) {
  const from = portPosition(edge.from, 'out')
  const to = portPosition(edge.to, 'in')
  const dx = Math.max(40, (to.x - from.x) / 2)
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`
}

function linkingPath() {
  if (!linking.value) return ''
  const fx = linking.value.fromX
  const fy = linking.value.fromY
  const dx = Math.max(40, (linking.value.x - fx) / 2)
  return `M ${fx} ${fy} C ${fx + dx} ${fy}, ${linking.value.x - dx} ${linking.value.y}, ${linking.value.x} ${linking.value.y}`
}

function mediaUrl(filePath: string) {
  return 'media:///' + encodeURI(filePath.replace(/\\/g, '/'))
}

// ---------- 历史记录（撤销 / 重做） ----------
function currentSnapshot(): Snapshot {
  return {
    nodes: JSON.parse(JSON.stringify(nodes.value)),
    edges: JSON.parse(JSON.stringify(edges.value)),
  }
}

function snapshot() {
  undoStack.value.push(currentSnapshot())
  if (undoStack.value.length > MAX_HISTORY) undoStack.value.shift()
  redoStack.value = []
}

function restoreSnapshot(data: Snapshot) {
  nodes.value = data.nodes
  edges.value = data.edges
  const valid = new Set(nodes.value.map((n) => n.id))
  selectedNodeIds.value = selectedNodeIds.value.filter((id) => valid.has(id))
  if (selectedEdgeId.value !== null && !edges.value.some((e) => e.id === selectedEdgeId.value)) {
    selectedEdgeId.value = null
  }
}

function undo() {
  const prev = undoStack.value.pop()
  if (!prev) return
  redoStack.value.push(currentSnapshot())
  restoreSnapshot(prev)
}

function redo() {
  const next = redoStack.value.pop()
  if (!next) return
  undoStack.value.push(currentSnapshot())
  restoreSnapshot(next)
}

// ---------- 选择 ----------
function isSelected(id: number) {
  return selectedNodeIds.value.includes(id)
}

function setSelection(ids: number[]) {
  selectedNodeIds.value = ids
  if (ids.length === 0) selectedEdgeId.value = null
}

function toggleSelection(id: number) {
  const current = selectedNodeIds.value
  if (current.includes(id)) {
    setSelection(current.filter((x) => x !== id))
  } else {
    setSelection([...current, id])
  }
}

// ---------- 节点创建（开放注册：内置 + 自定义 JSON 节点） ----------
async function addImageNodes(files: string[], pos?: { x: number; y: number } | null) {
  let count = 0
  for (const filePath of files) {
    const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
    const name = filePath.split(/[/\\]/).pop() || filePath
    if (['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v'].includes(ext)) continue
    const result = await window.fsAPI?.readImageBase64(filePath)
    if (!result?.success || !result.base64) continue
    const image = document.createElement('img')
    const dataUrl = `data:${result.mime || 'image/png'};base64,${result.base64}`
    image.src = dataUrl
    const ratio = await new Promise<number>((resolve) => {
      image.onload = () => resolve(image.naturalHeight / image.naturalWidth || 1)
      image.onerror = () => resolve(1)
    })
    const contentH = Math.min(320, Math.max(100, Math.round(220 * ratio)))
    nodes.value.push({
      id: nextId++,
      x: (pos?.x ?? 60) + count * 40,
      y: (pos?.y ?? 60) + count * 40,
      width: NODE_WIDTH,
      height: TITLE_HEIGHT + contentH,
      kind: 'image',
      label: name,
      src: dataUrl,
      contentH,
      rotation: 0,
      inputCount: 1,
      outputCount: 1,
      inTypes: ['image'],
      outTypes: ['image'],
      genMode: 'text',
      genPrompt: '',
      genSize: '1024x1024',
    })
    count++
  }
  if (count > 0) appStore.setStatus(`已添加 ${count} 个图片节点`)
}

function addVideoNodes(files: string[], pos?: { x: number; y: number } | null) {
  let count = 0
  for (const filePath of files) {
    const name = filePath.split(/[/\\]/).pop() || filePath
    nodes.value.push({
      id: nextId++,
      x: (pos?.x ?? 60) + count * 40,
      y: (pos?.y ?? 60) + count * 40,
      width: NODE_WIDTH,
      height: TITLE_HEIGHT + 130,
      kind: 'video',
      label: name,
      src: mediaUrl(filePath),
      contentH: 130,
      rotation: 0,
      inputCount: 1,
      outputCount: 1,
      inTypes: ['video'],
      outTypes: ['video'],
    })
    count++
  }
  if (count > 0) appStore.setStatus(`已添加 ${count} 个视频节点`)
}

function addTextNode(pos?: { x: number; y: number } | null) {
  snapshot()
  nodes.value.push({
    id: nextId++,
    x: pos?.x ?? 60 + nodes.value.length * 30,
    y: pos?.y ?? 60 + nodes.value.length * 30,
    width: NODE_WIDTH,
    height: TITLE_HEIGHT + 130,
    kind: 'text',
    label: '文本',
    src: '',
    contentH: 130,
    rotation: 0,
    text: '',
    inputCount: 0,
    outputCount: 1,
    outTypes: ['text'],
    model: '',
    temperature: 0.5,
  })
  appStore.setStatus('已添加文本节点')
  addMenuOpen.value = false
}

function addRerouteNode(pos?: { x: number; y: number } | null) {
  snapshot()
  nodes.value.push({
    id: nextId++,
    x: pos?.x ?? 60 + nodes.value.length * 30,
    y: pos?.y ?? 60 + nodes.value.length * 30,
    width: 30,
    height: 30,
    kind: 'reroute',
    label: '绕线',
    src: '',
    contentH: 30,
    rotation: 0,
    inputCount: 1,
    outputCount: 1,
  })
  appStore.setStatus('已添加绕线节点')
  addMenuOpen.value = false
}

function addResizeNode(pos?: { x: number; y: number } | null) {
  snapshot()
  nodes.value.push({
    id: nextId++,
    x: pos?.x ?? 60 + nodes.value.length * 30,
    y: pos?.y ?? 60 + nodes.value.length * 30,
    width: NODE_WIDTH,
    height: TITLE_HEIGHT + 220,
    kind: 'resize',
    label: '图片缩放',
    src: '',
    contentH: 220,
    rotation: 0,
    inputCount: 1,
    outputCount: 1,
    inTypes: ['image'],
    outTypes: ['image'],
    size: 512,
  })
  appStore.setStatus('已添加图片缩放节点')
  addMenuOpen.value = false
}

function addSaveNode(pos?: { x: number; y: number } | null) {
  snapshot()
  nodes.value.push({
    id: nextId++,
    x: pos?.x ?? 60 + nodes.value.length * 30,
    y: pos?.y ?? 60 + nodes.value.length * 30,
    width: NODE_WIDTH,
    height: TITLE_HEIGHT + 220,
    kind: 'save',
    label: '保存图片',
    src: '',
    contentH: 220,
    rotation: 0,
    inputCount: 1,
    outputCount: 0,
    inTypes: ['image'],
  })
  appStore.setStatus('已添加保存图片节点')
  addMenuOpen.value = false
}

function addAITagNode(pos?: { x: number; y: number } | null) {
  snapshot()
  nodes.value.push({
    id: nextId++,
    x: pos?.x ?? 60 + nodes.value.length * 30,
    y: pos?.y ?? 60 + nodes.value.length * 30,
    width: NODE_WIDTH,
    height: TITLE_HEIGHT + 280,
    kind: 'ai-tag',
    label: 'AI 打标',
    src: '',
    text: '',
    prompt: '',
    contentH: 280,
    rotation: 0,
    inputCount: 1,
    outputCount: 1,
    inTypes: ['image'],
    outTypes: ['text'],
    model: '',
    temperature: 0.5,
  })
  appStore.setStatus('已添加 AI 打标节点，请在节点里选择 API 配置')
  addMenuOpen.value = false
}

function addAITextNode(pos?: { x: number; y: number } | null) {
  snapshot()
  nodes.value.push({
    id: nextId++,
    x: pos?.x ?? 60 + nodes.value.length * 30,
    y: pos?.y ?? 60 + nodes.value.length * 30,
    width: NODE_WIDTH,
    height: TITLE_HEIGHT + 280,
    kind: 'ai-text',
    label: 'LLM 文本',
    src: '',
    text: '',
    prompt: '请根据以下内容处理：\n{{input}}',
    contentH: 280,
    rotation: 0,
    inputCount: 1,
    outputCount: 1,
    inTypes: ['text'],
    outTypes: ['text'],
    model: '',
    temperature: 0.5,
  })
  appStore.setStatus('已添加 LLM 文本节点，请在节点里选择 API 配置')
  addMenuOpen.value = false
}

function addCustomNode(def: NodeDefinition, pos?: { x: number; y: number } | null) {
  snapshot()
  const inputMeta: NodeInputDef[] = (def.inputs ?? []).map((i) =>
    typeof i === 'string' ? { name: i } : { name: i.name, optional: i.optional, default: i.default },
  )
  const inputCount = inputMeta.length ? inputMeta.length : (def.inputCount ?? 1)
  const outputCount = def.outputs?.length ?? def.outputCount ?? 1
  const node: WbNode = {
    id: nextId++,
    x: pos?.x ?? 60 + nodes.value.length * 30,
    y: pos?.y ?? 60 + nodes.value.length * 30,
    width: NODE_WIDTH,
    height: TITLE_HEIGHT + (def.contentH ?? 110),
    kind: def.kind ?? 'generic',
    label: def.label,
    src: '',
    contentH: def.contentH ?? 110,
    rotation: 0,
    defId: def.id,
    inputCount,
    outputCount,
    nodeColor: def.color,
    inputMeta: inputMeta.length ? inputMeta : undefined,
  }
  nodes.value.push(node)
  if (node.kind === 'image' || node.kind === 'video') {
    void replaceNodeMedia(node)
  }
  appStore.setStatus(`已添加节点：${def.label}`)
  addMenuOpen.value = false
}

function addBuiltinNode(kind: string, pos?: { x: number; y: number } | null) {
  if (kind === 'image') void pickImages(pos)
  else if (kind === 'video') void pickVideos(pos)
  else if (kind === 'text') addTextNode(pos)
  else if (kind === 'reroute') addRerouteNode(pos)
  else if (kind === 'resize') addResizeNode(pos)
  else if (kind === 'save') addSaveNode(pos)
  else if (kind === 'ai-tag') addAITagNode(pos)
  else if (kind === 'ai-text') addAITextNode(pos)
}

function kindLabel(node: WbNode) {
  if (node.kind === 'image') return '图片'
  if (node.kind === 'video') return '视频'
  if (node.kind === 'reroute') return '绕线'
  if (node.kind === 'resize') return '缩放'
  if (node.kind === 'save') return '保存'
  if (node.kind === 'ai-tag') return 'AI 打标'
  if (node.kind === 'ai-text') return 'LLM 文本'
  if (node.kind === 'text') return '文本'
  return node.defId || node.kind || '节点'
}

function buildAddItems(pos?: { x: number; y: number } | null): ContextMenuItem[] {
  const items: ContextMenuItem[] = BUILTIN_NODES.map((b) => ({
    label: `${b.icon} ${b.label}`,
    action: () => addBuiltinNode(b.kind, pos),
  }))
  for (const def of enabledCustomNodes.value) {
    items.push({ label: `▣ ${def.label}`, action: () => addCustomNode(def, pos) })
  }
  return items
}

function addMenuItems() {
  return [
    ...BUILTIN_NODES.map((b) => ({ icon: b.icon, label: b.label, action: () => addBuiltinNode(b.kind) })),
    ...enabledCustomNodes.value.map((def) => ({
      icon: '▣',
      label: def.label,
      action: () => addCustomNode(def),
    })),
  ]
}

// ---------- 节点管理器 ----------
async function loadCustomNodes() {
  try {
    const list = await window.nodesAPI?.list()
    if (list) customNodes.value = list
  } catch {}
}

async function importGithubNode() {
  if (!repoUrl.value.trim() || importing.value) return
  importing.value = true
  managerMessage.value = null
  try {
    const result = await window.nodesAPI?.importFromGithub(repoUrl.value)
    if (result?.success && result.nodes?.length) {
      managerMessage.value = {
        ok: true,
        text: `成功导入 ${result.nodes.length} 个节点：${result.nodes.map((n) => n.label).join('、')}`,
      }
      await loadCustomNodes()
    } else {
      managerMessage.value = { ok: false, text: result?.error || '导入失败' }
    }
  } catch (err) {
    managerMessage.value = { ok: false, text: '导入出错：' + (err instanceof Error ? err.message : String(err)) }
  } finally {
    importing.value = false
  }
}

async function toggleNodeEnabled(def: NodeDefinition) {
  if (!def.file) return
  const result = await window.nodesAPI?.setEnabled(def.file, def._enabled === false)
  if (result?.success) {
    await loadCustomNodes()
  } else if (result?.error) {
    appStore.setStatus(result.error)
  }
}

async function removeCustomNode(def: NodeDefinition) {
  if (!def.file) return
  const result = await window.nodesAPI?.remove(def.file)
  if (result?.success) {
    await loadCustomNodes()
    appStore.setStatus(`已删除节点：${def.label}`)
  } else if (result?.error) {
    appStore.setStatus(result.error)
  }
}

async function updateCustomNode(def: NodeDefinition) {
  if (!def.file || updatingFile.value) return
  updatingFile.value = def.file
  managerMessage.value = null
  try {
    const result = await window.nodesAPI?.update(def.file)
    if (result?.success) {
      managerMessage.value = { ok: true, text: `「${result.node?.label || def.label}」已更新到最新版本` }
      await loadCustomNodes()
    } else {
      managerMessage.value = { ok: false, text: result?.error || '更新失败' }
    }
  } finally {
    updatingFile.value = null
  }
}

async function pickImages(pos?: { x: number; y: number } | null) {
  const paths = await window.fsAPI?.selectImages()
  if (paths?.length) {
    snapshot()
    await addImageNodes(paths, pos)
    addMenuOpen.value = false
  }
}

async function pickVideos(pos?: { x: number; y: number } | null) {
  const paths = await window.fsAPI?.selectVideos()
  if (paths?.length) {
    snapshot()
    addVideoNodes(paths, pos)
    addMenuOpen.value = false
  }
}

// ---------- 视图控制 ----------
function zoomIn() {
  zoom.value = Math.min(4, +(zoom.value * 1.2).toFixed(2))
}

function zoomOut() {
  zoom.value = Math.max(0.1, +(zoom.value / 1.2).toFixed(2))
}

function resetZoom() {
  zoom.value = 1
  pan.value = { x: 80, y: 80 }
}

function fitToContent() {
  if (!nodes.value.length) {
    resetZoom()
    return
  }
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const n of nodes.value) {
    x0 = Math.min(x0, n.x)
    y0 = Math.min(y0, n.y)
    x1 = Math.max(x1, n.x + n.width)
    y1 = Math.max(y1, n.y + n.height)
  }
  const pad = 60
  const bw = x1 - x0 + pad * 2
  const bh = y1 - y0 + pad * 2
  const cx = x0 - pad + bw / 2
  const cy = y0 - pad + bh / 2
  zoom.value = Math.min(1.5, Math.max(0.1, +Math.min(viewSize.value.w / bw, viewSize.value.h / bh).toFixed(2)))
  pan.value = {
    x: viewSize.value.w / 2 - cx * zoom.value,
    y: viewSize.value.h / 2 - cy * zoom.value,
  }
}

function onWheel(event: WheelEvent) {
  event.preventDefault()
  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect) return
  const mx = event.clientX - rect.left
  const my = event.clientY - rect.top
  const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12
  const next = Math.min(4, Math.max(0.1, zoom.value * factor))
  const ratio = next / zoom.value
  pan.value = {
    x: mx - (mx - pan.value.x) * ratio,
    y: my - (my - pan.value.y) * ratio,
  }
  zoom.value = next
}

// ---------- 框选 ----------
const boxStyle = computed(() => {
  const box = boxSelect.value
  if (!box) return {}
  const x = Math.min(box.x1, box.x2)
  const y = Math.min(box.y1, box.y2)
  return {
    left: `${x}px`,
    top: `${y}px`,
    width: `${Math.abs(box.x2 - box.x1)}px`,
    height: `${Math.abs(box.y2 - box.y1)}px`,
  }
})

const boxHitIds = computed(() => {
  const box = boxSelect.value
  if (!box) return []
  const a = screenToWorld(Math.min(box.x1, box.x2), Math.min(box.y1, box.y2))
  const b = screenToWorld(Math.max(box.x1, box.x2), Math.max(box.y1, box.y2))
  if (!a || !b) return []
  const x0 = Math.min(a.x, b.x)
  const y0 = Math.min(a.y, b.y)
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  return nodes.value
    .filter((n) => n.x < x1 && n.x + n.width > x0 && n.y < y1 && n.y + n.height > y0)
    .map((n) => n.id)
})

// ---------- 小地图 ----------
const minimap = computed(() => {
  if (!nodes.value.length) return null
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const n of nodes.value) {
    x0 = Math.min(x0, n.x)
    y0 = Math.min(y0, n.y)
    x1 = Math.max(x1, n.x + n.width)
    y1 = Math.max(y1, n.y + n.height)
  }
  const pad = 40
  x0 -= pad
  y0 -= pad
  x1 += pad
  y1 += pad
  const bw = x1 - x0
  const bh = y1 - y0
  const scale = Math.min(MINI_W / bw, MINI_H / bh)
  return { x0, y0, scale, ox: (MINI_W - bw * scale) / 2, oy: (MINI_H - bh * scale) / 2 }
})

function worldToMini(x: number, y: number) {
  const m = minimap.value
  if (!m) return { x: 0, y: 0 }
  return { x: m.ox + (x - m.x0) * m.scale, y: m.oy + (y - m.y0) * m.scale }
}

function miniToWorld(mx: number, my: number) {
  const m = minimap.value
  if (!m) return { x: 0, y: 0 }
  return { x: m.x0 + (mx - m.ox) / m.scale, y: m.y0 + (my - m.oy) / m.scale }
}

function themeColor(varName: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  return v || fallback
}

function drawMinimap() {
  const canvas = miniCanvas.value
  const m = minimap.value
  if (!canvas || !m) return
  const dpr = window.devicePixelRatio || 1
  const cssW = MINI_W
  const cssH = MINI_H
  const pxW = Math.round(cssW * dpr)
  const pxH = Math.round(cssH * dpr)
  if (canvas.width !== pxW || canvas.height !== pxH) {
    canvas.width = pxW
    canvas.height = pxH
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, cssW, cssH)

  const nodeById = new Map(nodes.value.map((n) => [n.id, n]))
  const linkColor = themeColor('--ink-tertiary', '#918895')

  // 连线（先画在节点下面，和 ComfyUI 一致）
  ctx.strokeStyle = linkColor
  ctx.lineWidth = 0.8
  for (const edge of edges.value) {
    const a = nodeById.get(edge.from)
    const b = nodeById.get(edge.to)
    if (!a || !b) continue
    const x1 = m.ox + (a.x + a.width - m.x0) * m.scale
    const y1 = m.oy + (a.y + a.height / 2 - m.y0) * m.scale
    const x2 = m.ox + (b.x - m.x0) * m.scale
    const y2 = m.oy + (b.y + b.height / 2 - m.y0) * m.scale
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }

  // 节点画成带颜色的小矩形（ComfyUI 小地图风格）
  const brand = themeColor('--brand-primary', '#6254bd')
  ctx.globalAlpha = MINI_NODE_ALPHA
  for (const node of nodes.value) {
    const x = m.ox + (node.x - m.x0) * m.scale
    const y = m.oy + (node.y - m.y0) * m.scale
    const w = Math.max(2, node.width * m.scale)
    const h = Math.max(2, node.height * m.scale)
    ctx.fillStyle = node.nodeColor || brand
    ctx.fillRect(x, y, w, h)
  }
  ctx.globalAlpha = 1
}

// ---------- 数据处理（中间节点真正干活） ----------
let computeSeq = 0

async function resizeImageDataUrl(dataUrl: string, targetWidth: number): Promise<string | null> {
  try {
    const img = new Image()
    img.src = dataUrl
    await img.decode()
    if (!img.naturalWidth) return null
    const scale = targetWidth / img.naturalWidth
    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

function resolveInputSource(nodeId: number, depth = 0): WbNode | null {
  if (depth > 20) return null
  const edge = edges.value.find((e) => e.to === nodeId)
  if (!edge) return null
  const src = nodes.value.find((n) => n.id === edge.from)
  if (!src) return null
  if (src.kind === 'reroute') return resolveInputSource(src.id, depth + 1)
  return src
}

async function recomputeFlow() {
  const seq = ++computeSeq
  const targets = nodes.value.filter((n) => n.kind === 'resize' || n.kind === 'save')
  if (!targets.length) return
  for (let pass = 0; pass < nodes.value.length + 1; pass++) {
    if (seq !== computeSeq) return
    let changed = false
    for (const node of targets) {
      if (seq !== computeSeq) return
      const source = resolveInputSource(node.id)
      if (node.kind === 'save') {
        const src = source && (source.kind === 'image' || source.kind === 'resize' || source.kind === 'save') ? source.src : ''
        if (node.src !== src) {
          node.src = src
          changed = true
        }
        continue
      }
      const src = source && (source.kind === 'image' || source.kind === 'resize') ? source.src : ''
      if (!src) {
        if (node.src !== '') {
          node.src = ''
          changed = true
        }
        continue
      }
      if (node.src === src) continue
      const out = await resizeImageDataUrl(src, node.size ?? 512)
      if (seq !== computeSeq) return
      if (out && out !== node.src) {
        node.src = out
        changed = true
      }
    }
    if (!changed) break
  }
}

async function runWorkflow() {
  const targets = nodes.value.filter((n) => isExecutable(n))
  for (const n of nodes.value) n.execState = undefined
  if (!targets.length) {
    appStore.setStatus('画布上没有需要运行的处理节点')
    return
  }
  const missing = targets.filter((n) => !resolveInputSource(n.id))
  if (missing.length) {
    for (const n of missing) n.execState = 'error'
    appStore.setStatus(`有 ${missing.length} 个处理节点缺少输入，请先连线`)
    return
  }
  appStore.setStatus('开始运行…')
  const done = new Set<number>()
  for (let guard = 0; guard <= targets.length; guard++) {
    let progressed = false
    for (const node of targets) {
      if (done.has(node.id)) continue
      const source = resolveInputSource(node.id)
      if (!source || (isExecutable(source) && !done.has(source.id))) continue
      node.execState = 'running'
      await new Promise((r) => setTimeout(r, 150))
      try {
        const ok = await executeNode(node)
        node.execState = ok ? 'done' : 'error'
      } catch (e) {
        node.execState = 'error'
        appStore.setStatus(`运行出错（${node.label}）：${(e as Error).message}`)
      }
      done.add(node.id)
      progressed = true
    }
    if (!progressed) break
  }
  const failed = targets.filter((n) => n.execState === 'error').length
  appStore.setStatus(
    failed ? `运行完成，有 ${failed} 个节点出错` : `运行完成 ✓（${done.size}/${targets.length} 个节点）`,
  )
}

async function runImageGen(node: WbNode) {
  const cfg = apiConfigById(node.apiConfigId)
  if (!cfg) {
    node.execState = 'error'
    appStore.setStatus('未选择 API 配置，请在节点里选择')
    return
  }
  node.execState = 'running'
  try {
    const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,/.exec(node.src || '')
    const imageBase64 =
      node.genMode === 'image' && node.src
        ? node.src.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '')
        : ''
    const res = await window.llmAPI?.image({
      provider: cfg.provider,
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      model: node.model || cfg.model,
      prompt: node.genPrompt?.trim() || '一张精美的插画',
      imageBase64: imageBase64 || undefined,
      mimeType: m ? m[1] : 'image/png',
      size: node.genSize || '1024x1024',
    })
    if (!res?.success) throw new Error(res?.error || '生图失败')
    const out = res.images?.[0]
    if (!out) throw new Error('接口没有返回图片')
    deriveImageNode(node, out)
    node.execState = 'done'
    appStore.setStatus('生成完成 ✓ 已派生新节点')
  } catch (e) {
    node.execState = 'error'
    appStore.setStatus(`生图失败：${(e as Error).message}`)
  }
}

async function runTextGen(node: WbNode) {
  const cfg = apiConfigById(node.apiConfigId)
  if (!cfg) {
    node.execState = 'error'
    appStore.setStatus('未选择 API 配置，请在节点里选择')
    return
  }
  node.execState = 'running'
  try {
    const prompt = node.prompt?.trim() || '请根据以下内容处理：\n{{input}}'
    const srcText = node.text ?? ''
    const filled = prompt.includes('{{input}}')
      ? prompt.split('{{input}}').join(srcText)
      : `${prompt}\n\n${srcText}`
    const res = await window.llmAPI?.chat({
      provider: cfg.provider,
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      model: node.model || cfg.model,
      prompt: filled,
      temperature: node.temperature ?? 0.5,
    })
    if (!res?.success) throw new Error(res?.error || '生成失败')
    snapshot()
    node.text = (res.text ?? '').trim()
    node.execState = 'done'
    appStore.setStatus('生成完成 ✓')
  } catch (e) {
    node.execState = 'error'
    appStore.setStatus(`生成失败：${(e as Error).message}`)
  }
}

async function runNode(node: WbNode, visited = new Set<number>()) {
  if (visited.has(node.id)) return
  visited.add(node.id)
  if (!isExecutable(node)) return
  const source = resolveInputSource(node.id)
  if (source && isExecutable(source) && source.execState !== 'done') {
    await runNode(source, visited)
  }
  if (!source) {
    node.execState = 'error'
    appStore.setStatus(`${node.label} 缺少输入，请先连线`)
    return
  }
  node.execState = 'running'
  await new Promise((r) => setTimeout(r, 150))
  try {
    const ok = await executeNode(node)
    node.execState = ok ? 'done' : 'error'
  } catch (e) {
    node.execState = 'error'
    appStore.setStatus(`运行出错（${node.label}）：${(e as Error).message}`)
  }
  if (node.execState === 'done') appStore.setStatus(`${node.label} 运行完成 ✓`)
}

function isExecutable(node: WbNode) {
  return node.kind === 'resize' || node.kind === 'save' || node.kind === 'ai-tag' || node.kind === 'ai-text'
}

function inputTextOf(source: WbNode) {
  return source.kind === 'text' || source.kind === 'ai-tag' || source.kind === 'ai-text' ? (source.text ?? '') : ''
}

function apiConfigById(id?: string) {
  return apiConfigs.value.find((c) => c.id === id)
}

async function loadNodeModels(node: WbNode) {
  const cfg = apiConfigById(node.apiConfigId)
  if (!cfg) return
  const res = await window.llmAPI?.listModels({
    provider: cfg.provider,
    baseUrl: cfg.baseUrl,
    apiKey: cfg.apiKey,
  })
  if (res?.success && res.models?.length) {
    nodeModelCache.value = { ...nodeModelCache.value, [cfg.id]: res.models }
  }
}

function nodeModelOptions(node: WbNode) {
  const cfg = apiConfigById(node.apiConfigId)
  const cached = nodeModelCache.value[node.apiConfigId ?? ''] ?? []
  const set = new Set<string>()
  if (cfg?.model) set.add(cfg.model)
  for (const m of cached) set.add(m)
  return Array.from(set)
}

async function executeNode(node: WbNode): Promise<boolean> {
  const source = resolveInputSource(node.id)
  if (!source) return false
  if (node.kind === 'resize') {
    const out = source.src ? await resizeImageDataUrl(source.src, node.size ?? 512) : null
    node.src = out ?? ''
    return !!out
  }
  if (node.kind === 'save') {
    node.src = source.src ?? ''
    return !!node.src
  }
  if (node.kind === 'ai-tag' || node.kind === 'ai-text') {
    const cfg = apiConfigById(node.apiConfigId)
    if (!cfg) throw new Error('未选择 API 配置，请在节点里选择')
    if (node.kind === 'ai-tag') {
      const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,/.exec(source.src || '')
      if (!m) throw new Error('上游没有可用的图片')
      const res = await window.llmAPI?.chat({
        provider: cfg.provider,
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        model: node.model || cfg.model,
        prompt: node.prompt?.trim() || '请为这张图片生成详细的标签，用逗号分隔。',
        imageBase64: source.src.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, ''),
        mimeType: m[1],
        temperature: node.temperature ?? 0.5,
      })
      if (!res?.success) throw new Error(res?.error || 'API 调用失败')
      node.text = (res.text ?? '').trim()
      return !!node.text
    }
    const srcText = inputTextOf(source)
    if (!srcText.trim()) throw new Error('上游没有文本输入')
    const prompt = node.prompt?.trim() || '请根据以下内容处理：\n{{input}}'
    const filled = prompt.includes('{{input}}') ? prompt.split('{{input}}').join(srcText) : `${prompt}\n\n${srcText}`
    const res = await window.llmAPI?.chat({
      provider: cfg.provider,
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      model: node.model || cfg.model,
      prompt: filled,
      temperature: node.temperature ?? 0.5,
    })
    if (!res?.success) throw new Error(res?.error || 'API 调用失败')
    node.text = (res.text ?? '').trim()
    return !!node.text
  }
  return false
}

function deriveImageNode(source: WbNode, newSrc: string, label?: string, snap = true) {
  if (snap) snapshot()
  const node: WbNode = {
    id: nextId++,
    x: source.x + source.width + 60,
    y: source.y,
    width: source.width,
    height: source.height,
    kind: 'image',
    label: label || `${source.label || '图片'}·新`,
    src: newSrc,
    contentH: source.contentH,
    rotation: 0,
    inputCount: 1,
    outputCount: 1,
    inTypes: ['image'],
    outTypes: ['image'],
    genMode: 'text',
    genPrompt: '',
    genSize: source.genSize || '1024x1024',
  }
  nodes.value.push(node)
  edges.value.push({ id: nextId++, from: source.id, to: node.id })
  setSelection([node.id])
  return node
}

function canvasToDataUrl(
  img: HTMLImageElement,
  w: number,
  h: number,
  sx = 0,
  sy = 0,
  sw?: number,
  sh?: number,
) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  const ctx = c.getContext('2d')
  if (!ctx) return ''
  ctx.drawImage(img, sx, sy, sw ?? img.naturalWidth, sh ?? img.naturalHeight, 0, 0, c.width, c.height)
  return c.toDataURL('image/png')
}

async function applyCanvasTool(node: WbNode, fn: (img: HTMLImageElement) => string) {
  if (!node.src || !node.src.startsWith('data:image/')) {
    appStore.setStatus('节点没有可处理的图片')
    return
  }
  node.execState = 'running'
  try {
    const img = new Image()
    img.src = node.src
    await img.decode()
    snapshot()
    node.src = fn(img)
    node.execState = 'done'
    appStore.setStatus('处理完成 ✓')
  } catch (e) {
    node.execState = 'error'
    appStore.setStatus(`处理失败：${(e as Error).message}`)
  }
}

function toolRotate(node: WbNode) {
  void applyCanvasTool(node, (img) => {
    const c = document.createElement('canvas')
    c.width = img.naturalHeight
    c.height = img.naturalWidth
    const ctx = c.getContext('2d')
    if (!ctx) return node.src
    ctx.translate(c.width / 2, c.height / 2)
    ctx.rotate(Math.PI / 2)
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)
    return c.toDataURL('image/png')
  })
}

function toolResizeApply(node: WbNode) {
  const width = Number(node.size || 512)
  void applyCanvasTool(node, (img) => {
    const scale = width / img.naturalWidth
    return canvasToDataUrl(img, width, img.naturalHeight * scale)
  })
  resizePopup.value = null
}

function toolGridApply(node: WbNode, n: number) {
  if (!node.src) return
  void (async () => {
    const img = new Image()
    img.src = node.src
    await img.decode()
    const tw = Math.floor(img.naturalWidth / n)
    const th = Math.floor(img.naturalHeight / n)
    if (tw < 1 || th < 1) {
      appStore.setStatus('图片太小，无法切分')
      return
    }
    snapshot()
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        deriveImageNode(node, canvasToDataUrl(img, tw, th, c * tw, r * th, tw, th), `分块 ${r + 1}-${c + 1}`, false)
      }
    }
    appStore.setStatus(`已切分为 ${n * n} 块并派生新节点`)
  })()
  gridPopup.value = null
}

async function runImageTool(node: WbNode, tool: 'hd' | 'outpaint' | 'inpaint') {
  const cfg = apiConfigById(node.apiConfigId)
  if (!cfg) {
    node.execState = 'error'
    appStore.setStatus('未选择 API 配置，AI 工具需要配置')
    return
  }
  if (!node.src) {
    node.execState = 'error'
    appStore.setStatus('节点没有图片')
    return
  }
  node.execState = 'running'
  try {
    const prompt =
      tool === 'hd'
        ? 'Upscale this image, keep content identical, 2x resolution, sharp and detailed.'
        : tool === 'outpaint'
          ? 'Extend this image outward naturally, fill the surrounding area seamlessly, keep the original center unchanged.'
          : 'Re-edit this image according to the prompt, keep overall composition.'
    const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,/.exec(node.src)
    const res = await window.llmAPI?.image({
      provider: cfg.provider,
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      model: node.model || cfg.model,
      prompt: tool === 'inpaint' ? `${prompt} ${node.genPrompt || ''}` : prompt,
      imageBase64: node.src.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, ''),
      mimeType: m ? m[1] : 'image/png',
      size: node.genSize || '1024x1024',
    })
    if (!res?.success) throw new Error(res?.error || '工具执行失败')
    const out = res.images?.[0]
    if (!out) throw new Error('接口没有返回图片')
    deriveImageNode(
      node,
      out,
      tool === 'hd' ? '高清放大' : tool === 'outpaint' ? '扩图' : '重绘',
    )
    node.execState = 'done'
    appStore.setStatus('工具完成 ✓ 已派生新节点')
  } catch (e) {
    node.execState = 'error'
    appStore.setStatus(
      `${tool === 'hd' ? '高清' : tool === 'outpaint' ? '扩图' : '重绘'}失败：${(e as Error).message}`,
    )
  }
}

function cropStart(node: WbNode) {
  cropState.value = { nodeId: node.id, x1: 0, y1: 0, x2: 0, y2: 0 }
}

function cropConfirm(node: WbNode) {
  const cs = cropState.value
  if (!cs) return
  const x = Math.min(cs.x1, cs.x2)
  const y = Math.min(cs.y1, cs.y2)
  const w = Math.abs(cs.x2 - cs.x1)
  const h = Math.abs(cs.y2 - cs.y1)
  cropState.value = null
  if (w < 4 || h < 4) {
    appStore.setStatus('选框太小，已取消')
    return
  }
  void applyCanvasTool(node, (img) => {
    const sx = (x / 100) * img.naturalWidth
    const sy = (y / 100) * img.naturalHeight
    const sw = (w / 100) * img.naturalWidth
    const sh = (h / 100) * img.naturalHeight
    return canvasToDataUrl(img, sw, sh, sx, sy, sw, sh)
  })
}

function onCropDown(event: PointerEvent, node: WbNode) {
  const el = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const x = ((event.clientX - el.left) / el.width) * 100
  const y = ((event.clientY - el.top) / el.height) * 100
  cropState.value = { nodeId: node.id, x1: x, y1: y, x2: x, y2: y }
}

function onCropMove(event: PointerEvent) {
  const cs = cropState.value
  if (!cs) return
  const el = (event.currentTarget as HTMLElement).getBoundingClientRect()
  cs.x2 = ((event.clientX - el.left) / el.width) * 100
  cs.y2 = ((event.clientY - el.top) / el.height) * 100
}

function onCropUp() {
  /* 保持选框，等待点击“裁剪” */
}

const cropBoxStyle = computed(() => {
  const cs = cropState.value
  if (!cs) return {}
  return {
    left: `${Math.min(cs.x1, cs.x2)}%`,
    top: `${Math.min(cs.y1, cs.y2)}%`,
    width: `${Math.abs(cs.x2 - cs.x1)}%`,
    height: `${Math.abs(cs.y2 - cs.y1)}%`,
  }
})

function canSaveNode(node: WbNode) {
  if (node.kind === 'text' || node.kind === 'ai-tag' || node.kind === 'ai-text') return true
  if (node.src && node.src.startsWith('data:image/')) return true
  if (node.kind === 'video' && node.src) return true
  return false
}

function nodeDefaultName(node: WbNode) {
  const base = (node.label || 'output').replace(/[\\/:*?"<>|]/g, '_')
  if (node.kind === 'text' || node.kind === 'ai-tag' || node.kind === 'ai-text') return `${base}.txt`
  if (node.kind === 'video' && node.src) {
    const path = decodeURIComponent(node.src.replace(/^media:\/\//, ''))
    const name = path.split(/[/\\]/).pop()
    return name || `${base}.mp4`
  }
  return `${base}.png`
}

async function saveNodeContent(node: WbNode) {
  savingId.value = node.id
  try {
    const defaultName = nodeDefaultName(node)
    let res
    if (node.kind === 'text' || node.kind === 'ai-tag' || node.kind === 'ai-text') {
      res = await window.fsAPI?.saveText?.({ text: node.text ?? '', defaultName })
    } else if (node.src?.startsWith('data:image/')) {
      res = await window.fsAPI?.saveImage?.({ dataUrl: node.src, defaultName })
    } else if (node.kind === 'video' && node.src) {
      res = await window.fsAPI?.saveFile?.({
        sourcePath: decodeURIComponent(node.src.replace(/^media:\/\//, '')),
        defaultName,
      })
    } else {
      appStore.setStatus('这个节点没有可保存的内容')
      return
    }
    if (res?.success) appStore.setStatus(`已保存：${res.path}`)
    else if (res && !res.canceled) appStore.setStatus(`保存失败：${res.error ?? '未知错误'}`)
  } finally {
    savingId.value = null
  }
}

// ---------- 画布 API 凭据库 ----------
async function loadApiConfigs() {
  const list = await window.llmAPI?.listApiConfigs()
  if (Array.isArray(list)) apiConfigs.value = list
}

function openApiForm(cfg?: WorkbenchApiConfig) {
  apiForm.value = cfg ? { ...cfg } : { id: '', name: '', provider: 'openai', baseUrl: '', apiKey: '', model: '' }
  apiModels.value = []
  apiMessage.value = null
}

async function fetchApiModels() {
  if (!apiForm.value.apiKey.trim()) {
    apiMessage.value = { ok: false, text: '请先填写 API 密钥再获取模型' }
    return
  }
  apiFetchingModels.value = true
  apiMessage.value = null
  const res = await window.llmAPI?.listModels({
    provider: apiForm.value.provider,
    baseUrl: apiForm.value.baseUrl,
    apiKey: apiForm.value.apiKey,
  })
  apiFetchingModels.value = false
  if (res?.success && res.models?.length) {
    apiModels.value = res.models
    apiMessage.value = { ok: true, text: `找到 ${res.models.length} 个模型，点下面的模型名称即可填入` }
  } else {
    apiModels.value = []
    apiMessage.value = { ok: false, text: res?.error || '没有获取到可用模型' }
  }
}

async function saveApiForm() {
  if (!apiForm.value.name.trim()) {
    apiMessage.value = { ok: false, text: '请填写配置名称' }
    return
  }
  const res = await window.llmAPI?.saveApiConfig({ ...apiForm.value })
  if (res?.success) {
    apiMessage.value = { ok: true, text: '已保存' }
    openApiForm()
    await loadApiConfigs()
  } else {
    apiMessage.value = { ok: false, text: res?.error || '保存失败' }
  }
}

async function removeApiConfig(id: string) {
  const res = await window.llmAPI?.deleteApiConfig(id)
  if (res?.success) {
    apiMessage.value = { ok: true, text: '已删除' }
    if (apiForm.value.id === id) openApiForm()
    await loadApiConfigs()
  } else {
    apiMessage.value = { ok: false, text: res?.error || '删除失败' }
  }
}

async function testApiConfig(cfg: WorkbenchApiConfig) {
  apiTesting.value = cfg.id
  apiMessage.value = null
  const res = await window.llmAPI?.test({
    provider: cfg.provider,
    apiKey: cfg.apiKey,
    baseUrl: cfg.baseUrl,
    model: cfg.model,
  })
  apiTesting.value = null
  apiMessage.value = res?.success
    ? { ok: true, text: `「${cfg.name}」连接成功` }
    : { ok: false, text: `「${cfg.name}」连接失败：${res?.error || '未知错误'}` }
}

const miniViewportStyle = computed(() => {
  const a = screenToWorld(0, 0)
  const b = screenToWorld(viewSize.value.w, viewSize.value.h)
  if (!a || !b) return {}
  const p1 = worldToMini(a.x, a.y)
  const p2 = worldToMini(b.x, b.y)
  return {
    left: `${p1.x}px`,
    top: `${p1.y + MINI_TITLE_H}px`,
    width: `${Math.max(6, p2.x - p1.x)}px`,
    height: `${Math.max(6, p2.y - p1.y)}px`,
  }
})

function onMiniDown(event: PointerEvent) {
  event.stopPropagation()
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const contentH = rect.height - MINI_TITLE_H
  const mx = ((event.clientX - rect.left) / rect.width) * MINI_W
  const my = ((event.clientY - rect.top - MINI_TITLE_H) / contentH) * MINI_H
  const world = miniToWorld(mx, my)
  pan.value = {
    x: viewSize.value.w / 2 - world.x * zoom.value,
    y: viewSize.value.h / 2 - world.y * zoom.value,
  }
  dragState.value = {
    kind: 'mini',
    startX: event.clientX,
    startY: event.clientY,
    startPanX: pan.value.x,
    startPanY: pan.value.y,
  }
}

// ---------- 指针交互 ----------
function onPointerDown(event: MouseEvent) {
  if (event.button === 2) return
  const target = event.target as HTMLElement
  if (target.closest('.workbench__toolbar, .workbench__manager, .wb-minimap, .wb-add__menu, .wb-port, textarea, input')) return
  hintDismissed.value = true
  if (addMenuOpen.value) addMenuOpen.value = false
  if (event.button === 1) event.preventDefault()

  const panRequested = event.button === 1
  const boxRequested = event.button === 0 && spaceDown.value
  const nodeEl = target.closest('.wb-node')
  if (nodeEl && !panRequested) {
    const id = Number((nodeEl as HTMLElement).dataset.id)
    const node = nodes.value.find((item) => item.id === id)
    if (!node) return
    const resizeHandle = target.closest('.wb-node__edge')
    const multi = event.ctrlKey || event.metaKey || event.shiftKey
    if (multi) toggleSelection(id)
    else if (!isSelected(id)) setSelection([id])
    selectedEdgeId.value = null
    const startNodes = selectedNodeIds.value
      .map((sid) => {
        const n = nodes.value.find((item) => item.id === sid)
        return n ? { id: n.id, x: n.x, y: n.y } : null
      })
      .filter((x): x is { id: number; x: number; y: number } => x !== null)
    dragState.value = {
      kind: resizeHandle ? 'resize' : 'node',
      startX: event.clientX,
      startY: event.clientY,
      startPanX: pan.value.x,
      startPanY: pan.value.y,
      nodeId: id,
      startWidth: node.width,
      startHeight: node.height,
      startNodes,
    }
    return
  }

  // 空白处：左键平移，空格+左键框选，中键平移
  selectedEdgeId.value = null
  if (boxRequested) {
    const rect = canvasRef.value?.getBoundingClientRect()
    if (!rect) return
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    boxSelect.value = { x1: x, y1: y, x2: x, y2: y }
    if (!event.ctrlKey && !event.metaKey && !event.shiftKey) setSelection([])
    dragState.value = { kind: 'box', startX: event.clientX, startY: event.clientY, startPanX: pan.value.x, startPanY: pan.value.y }
    return
  }
  dragState.value = { kind: 'pan', startX: event.clientX, startY: event.clientY, startPanX: pan.value.x, startPanY: pan.value.y }
}

function onPointerMove(event: MouseEvent) {
  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect) return
  if (linking.value) {
    linking.value = { ...linking.value, x: event.clientX - rect.left, y: event.clientY - rect.top }
  }
  const state = dragState.value
  if (!state) return
  const dx = event.clientX - state.startX
  const dy = event.clientY - state.startY
  if (state.kind === 'pan') {
    pan.value = { x: state.startPanX + dx, y: state.startPanY + dy }
  } else if (state.kind === 'box') {
    if (boxSelect.value) {
      boxSelect.value = { ...boxSelect.value, x2: event.clientX - rect.left, y2: event.clientY - rect.top }
    }
  } else if (state.kind === 'mini') {
    const m = minimap.value
    if (m) {
      pan.value = {
        x: state.startPanX - (dx * zoom.value) / m.scale,
        y: state.startPanY - (dy * zoom.value) / m.scale,
      }
    }
  } else if (state.kind === 'node' || state.kind === 'resize') {
    if (!state.committed) {
      state.committed = true
      snapshot()
    }
    const node = nodes.value.find((item) => item.id === state.nodeId)
    if (!node || !state.startNodes?.length) return
    if (state.kind === 'resize' && state.startWidth !== undefined && state.startHeight !== undefined) {
      node.width = Math.max(160, Math.round(state.startWidth + dx / zoom.value))
      node.height = Math.max(80, Math.round(state.startHeight + dy / zoom.value))
    } else {
      const dxw = dx / zoom.value
      const dyw = dy / zoom.value
      for (const s of state.startNodes) {
        const n = nodes.value.find((item) => item.id === s.id)
        if (!n) continue
        let nx = s.x + dxw
        let ny = s.y + dyw
        if (snapGrid.value) {
          nx = Math.round(nx / GRID) * GRID
          ny = Math.round(ny / GRID) * GRID
        }
        n.x = nx
        n.y = ny
      }
    }
  }
}

function onPointerUp(event: MouseEvent) {
  if (dragState.value?.kind === 'box' && boxSelect.value) {
    const ids = boxHitIds.value
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      selectedNodeIds.value = Array.from(new Set([...selectedNodeIds.value, ...ids]))
    } else {
      setSelection(ids)
    }
    boxSelect.value = null
  }
  if (linking.value) {
    const target = (event.target as HTMLElement).closest('.wb-port--in')
    if (target) {
      const toId = Number((target as HTMLElement).dataset.node)
      const fromId = linking.value.from
      const fromNode = nodes.value.find((n) => n.id === fromId)
      const toNode = nodes.value.find((n) => n.id === toId)
      const outT = fromNode?.outTypes?.[0] ?? 'any'
      const inT = toNode?.inTypes?.[0] ?? 'any'
      if (toId !== fromId && !edges.value.some((edge) => edge.from === fromId && edge.to === toId)) {
        if (outT !== 'any' && inT !== 'any' && outT !== inT) {
          appStore.setStatus(`类型不匹配：${outT} 不能连接到 ${inT} 输入`)
        } else {
          snapshot()
          edges.value.push({ id: nextId++, from: fromId, to: toId })
        }
      }
    }
    linking.value = null
  }
  dragState.value = null
}

function startLink(node: WbNode, event: MouseEvent, portEl: HTMLElement) {
  event.stopPropagation()
  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect) return
  const portRect = portEl.getBoundingClientRect()
  linking.value = {
    from: node.id,
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
    fromX: portRect.left + portRect.width / 2 - rect.left,
    fromY: portRect.top + portRect.height / 2 - rect.top,
  }
}

function onPortDown(node: WbNode, event: PointerEvent) {
  startLink(node, event, event.currentTarget as HTMLElement)
}

function onEdgePointerDown(event: MouseEvent, edge: WbEdge) {
  event.stopPropagation()
  selectedEdgeId.value = edge.id
  setSelection([])
}

// ---------- 右键菜单 ----------
function onContextMenu(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (target.closest('textarea, input, select, [contenteditable="true"]')) {
    return // 输入控件里右键用系统原生菜单（复制/粘贴文字）
  }
  event.preventDefault()
  const nodeEl = target.closest('.wb-node')
  if (nodeEl) {
    const id = Number((nodeEl as HTMLElement).dataset.id)
    const node = nodes.value.find((item) => item.id === id)
    if (!node) return
    if (!isSelected(id)) setSelection([id])
    const items: ContextMenuItem[] = [
      { label: '旋转 90°', action: () => rotateNode(node) },
      ...(node.kind === 'image' ? [{ label: '更换图片', action: () => void replaceNodeMedia(node) }] : []),
      ...(node.kind === 'video' ? [{ label: '更换视频', action: () => void replaceNodeMedia(node) }] : []),
      ...(canSaveNode(node)
        ? [
            {
              label: node.kind === 'text' ? '保存文本' : node.kind === 'video' ? '保存视频' : '保存图片',
              action: () => void saveNodeContent(node),
            },
          ]
        : []),
      { label: '复制', action: () => copySelected() },
      { label: '剪切', action: () => cutSelected() },
      ...(clipboard.value?.nodes.length ? [{ label: '粘贴', action: () => pasteNodes() }] : []),
      { label: '删除节点', danger: true, action: () => removeSelected() },
    ]
    const menuHeight = items.length * 33 + 10
    const x = Math.min(event.clientX, window.innerWidth - 190)
    const y = Math.min(event.clientY, window.innerHeight - menuHeight - 8)
    contextMenu.value = { x: Math.max(0, x), y: Math.max(0, y), items }
    return
  }
  const pos = screenToWorld(event.clientX, event.clientY)
  const pasteItems = clipboard.value?.nodes.length
    ? [{ label: '粘贴', action: () => pasteNodes(pos) }]
    : []
  const items = [...pasteItems, ...buildAddItems(pos)]
  const menuHeight = items.length * 33 + 10
  const x = Math.min(event.clientX, window.innerWidth - 190)
  const y = Math.min(event.clientY, window.innerHeight - menuHeight - 8)
  contextMenu.value = {
    x: Math.max(0, x),
    y: Math.max(0, y),
    items,
  }
}

function rotateNode(node: WbNode) {
  snapshot()
  node.rotation = (node.rotation + 90) % 360
}

async function replaceNodeMedia(node: WbNode) {
  if (node.kind === 'image') {
    const paths = await window.fsAPI?.selectImages()
    if (!paths?.length) return
    const result = await window.fsAPI?.readImageBase64(paths[0])
    if (result?.success && result.base64) {
      snapshot()
      node.src = `data:${result.mime || 'image/png'};base64,${result.base64}`
      node.label = paths[0].split(/[/\\]/).pop() || node.label
      appStore.setStatus('图片已更换')
    }
  } else if (node.kind === 'video') {
    const paths = await window.fsAPI?.selectVideos()
    if (!paths?.length) return
    snapshot()
    node.src = mediaUrl(paths[0])
    node.label = paths[0].split(/[/\\]/).pop() || node.label
    appStore.setStatus('视频已更换')
  }
}

// ---------- 删除 / 旋转 / 清空 ----------
function removeSelected() {
  if (selectedEdgeId.value !== null) {
    snapshot()
    edges.value = edges.value.filter((edge) => edge.id !== selectedEdgeId.value)
    selectedEdgeId.value = null
    return
  }
  const ids = selectedNodeIds.value
  if (!ids.length) return
  snapshot()
  edges.value = edges.value.filter((edge) => !ids.includes(edge.from) && !ids.includes(edge.to))
  nodes.value = nodes.value.filter((node) => !ids.includes(node.id))
  setSelection([])
}

function rotateSelectedNode() {
  if (!selectedNodeIds.value.length) return
  snapshot()
  for (const node of nodes.value) {
    if (selectedNodeIds.value.includes(node.id)) node.rotation = (node.rotation + 90) % 360
  }
}

function clearCanvas() {
  if (!nodes.value.length && !edges.value.length) return
  snapshot()
  nodes.value = []
  edges.value = []
  setSelection([])
}

// ---------- 复制 / 剪切 / 粘贴 / 复制 ----------
function copySelected() {
  const ids = new Set(selectedNodeIds.value)
  if (!ids.size) return
  clipboard.value = {
    nodes: JSON.parse(JSON.stringify(nodes.value.filter((n) => ids.has(n.id)))),
    edges: JSON.parse(JSON.stringify(edges.value.filter((e) => ids.has(e.from) && ids.has(e.to)))),
  }
  pasteSeq = 0
}

function cutSelected() {
  copySelected()
  removeSelected()
}

function pasteNodes(pos?: { x: number; y: number } | null) {
  if (!clipboard.value?.nodes.length) return
  snapshot()
  pasteSeq += 1
  let baseX = 24 * pasteSeq
  let baseY = 24 * pasteSeq
  if (pos) {
    const xs = clipboard.value.nodes.map((n) => n.x)
    const ys = clipboard.value.nodes.map((n) => n.y)
    baseX = pos.x - Math.min(...xs)
    baseY = pos.y - Math.min(...ys)
  }
  const idMap = new Map<number, number>()
  const newNodes = clipboard.value.nodes.map((n) => {
    const newId = nextId++
    idMap.set(n.id, newId)
    return { ...n, id: newId, x: n.x + baseX, y: n.y + baseY }
  })
  const newEdges = clipboard.value.edges
    .filter((e) => idMap.has(e.from) && idMap.has(e.to))
    .map((e) => ({ ...e, id: nextId++, from: idMap.get(e.from)!, to: idMap.get(e.to)! }))
  nodes.value.push(...newNodes)
  edges.value.push(...newEdges)
  setSelection(newNodes.map((n) => n.id))
}

function duplicateSelected() {
  if (!selectedNodeIds.value.length) return
  snapshot()
  const offset = 24
  const selSet = new Set(selectedNodeIds.value)
  const idMap = new Map<number, number>()
  const newNodes = nodes.value
    .filter((n) => selSet.has(n.id))
    .map((n) => {
      const newId = nextId++
      idMap.set(n.id, newId)
      return { ...n, id: newId, x: n.x + offset, y: n.y + offset }
    })
  const newEdges = edges.value
    .filter((e) => selSet.has(e.from) && selSet.has(e.to))
    .map((e) => ({ ...e, id: nextId++, from: idMap.get(e.from)!, to: idMap.get(e.to)! }))
  nodes.value.push(...newNodes)
  edges.value.push(...newEdges)
  setSelection(newNodes.map((n) => n.id))
}

// ---------- 键盘快捷键 ----------
function onKeyDown(event: KeyboardEvent) {
  const target = event.target as HTMLElement
  if (target.closest('textarea, input, [contenteditable="true"]')) return
  if (event.code === 'Space' && !target.closest('button')) {
    spaceDown.value = true
    event.preventDefault()
    return
  }
  const mod = event.ctrlKey || event.metaKey
  if (mod) {
    const key = event.key.toLowerCase()
    if (key === 'enter') {
      event.preventDefault()
      void runWorkflow()
    } else if (key === 'z') {
      event.preventDefault()
      if (event.shiftKey) redo()
      else undo()
    } else if (key === 'y') {
      event.preventDefault()
      redo()
    } else if (key === 'd') {
      event.preventDefault()
      duplicateSelected()
    } else if (key === 'c') {
      event.preventDefault()
      copySelected()
    } else if (key === 'x') {
      event.preventDefault()
      cutSelected()
    } else if (key === 'v') {
      event.preventDefault()
      pasteNodes()
    } else if (key === '0') {
      event.preventDefault()
      resetZoom()
    }
    return
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    removeSelected()
  }
  if (event.key === 'Escape') {
    contextMenu.value = null
    addMenuOpen.value = false
    managerOpen.value = false
    boxSelect.value = null
    setSelection([])
  }
}

function onKeyUp(event: KeyboardEvent) {
  if (event.code === 'Space') spaceDown.value = false
}

function onWindowBlur() {
  spaceDown.value = false
  dragState.value = null
  boxSelect.value = null
}

function resizeObserver() {
  const el = canvasRef.value
  if (!el) return
  viewSize.value = { w: el.clientWidth, h: el.clientHeight }
}

watch([nodes, edges], () => drawMinimap(), { deep: true, flush: 'post' })

watch(
  () => {
    const conns = edges.value.map((e) => `${e.from}>${e.to}`).join(',')
    const snap = nodes.value
      .map((n) => `${n.id}:${n.kind}:${n.kind === 'image' ? n.src : (n.src?.length ?? 0)}:${n.size ?? ''}`)
      .join('|')
    return conns + '||' + snap
  },
  () => void recomputeFlow(),
  { flush: 'post' },
)

onMounted(() => {
  void loadCustomNodes()
  void loadApiConfigs()
  resizeObserver()
  drawMinimap()
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onWindowBlur)
  if ('ResizeObserver' in window && canvasRef.value) {
    const observer = new ResizeObserver(resizeObserver)
    observer.observe(canvasRef.value)
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('blur', onWindowBlur)
})
</script>

<template>
  <main
    class="workbench"
    :class="{ 'workbench--space': spaceDown }"
    ref="canvasRef"
    :style="gridStyle"
    @wheel.prevent="onWheel"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointerleave="onPointerUp"
    @contextmenu="onContextMenu"
  >
    <!-- 连线层 -->
    <svg class="workbench__edges" :width="viewSize.w" :height="viewSize.h">
      <path
        v-for="edge in edges"
        :key="edge.id"
        class="wb-edge"
        :class="{ 'wb-edge--selected': selectedEdgeId === edge.id }"
        :d="edgePath(edge)"
        @pointerdown="onEdgePointerDown($event, edge)"
      />
      <path v-if="linking" class="wb-edge wb-edge--linking" :d="linkingPath()" />
    </svg>

    <!-- 节点层 -->
    <div class="workbench__world" :style="worldStyle">
      <div
        v-for="node in nodes"
        :key="node.id"
        class="wb-node"
        :class="{
          'wb-node--selected': isSelected(node.id),
          'wb-node--reroute': node.kind === 'reroute',
          'wb-node--running': node.execState === 'running',
          'wb-node--done': node.execState === 'done',
          'wb-node--error': node.execState === 'error',
        }"
        :data-id="node.id"
        :style="nodeStyle(node)"
      >
        <span v-if="node.execState === 'running'" class="wb-node__badge wb-node__badge--running">运行中…</span>
        <span v-else-if="node.execState === 'done'" class="wb-node__badge wb-node__badge--done">✓</span>
        <span v-else-if="node.execState === 'error'" class="wb-node__badge wb-node__badge--error">!</span>
        <header v-if="node.kind !== 'reroute'" class="wb-node__head">
          <span class="wb-node__kind">{{ kindLabel(node) }}</span>
          <strong>{{ node.label }}</strong>
          <span class="wb-node__head-actions">
            <button
              v-if="isExecutable(node)"
              class="wb-node__action"
              type="button"
              title="运行此节点"
              @pointerdown.stop
              @click.stop="runNode(node)"
            >
              ▶
            </button>
            <button
              v-if="canSaveNode(node)"
              class="wb-node__action"
              type="button"
              :title="node.kind === 'text' ? '保存文本' : node.kind === 'video' ? '保存视频' : '保存图片'"
              @pointerdown.stop
              @click.stop="saveNodeContent(node)"
            >
              ⬇
            </button>
          </span>
        </header>
        <div v-if="node.kind !== 'reroute'" class="wb-node__content">
          <div v-if="node.kind === 'image'" class="wb-node__media-gen">
            <div class="wb-node__media-preview" :class="{ cropping: cropState?.nodeId === node.id }">
              <img v-if="node.src" :src="node.src" alt="" draggable="false" />
              <span v-else class="wb-node__media-empty">加载图片后可生成</span>
              <div
                v-if="cropState?.nodeId === node.id"
                class="wb-node__crop"
                @pointerdown.stop="onCropDown($event, node)"
                @pointermove.stop="onCropMove($event)"
                @pointerup.stop="onCropUp"
              >
                <div
                  v-if="cropState && Math.abs(cropState.x2 - cropState.x1) > 0"
                  class="wb-node__crop-box"
                  :style="cropBoxStyle"
                ></div>
              </div>
              <button
                v-if="cropState?.nodeId === node.id"
                type="button"
                class="wb-node__crop-confirm"
                @pointerdown.stop
                @click.stop="cropConfirm(node)"
              >
                裁剪
              </button>
            </div>
            <div class="wb-node__gen">
              <div class="wb-node__gen-modes">
                <button
                  type="button"
                  :class="{ on: node.genMode !== 'image' }"
                  @pointerdown.stop
                  @click.stop="node.genMode = 'text'"
                >
                  文生图
                </button>
                <button
                  type="button"
                  :class="{ on: node.genMode === 'image' }"
                  @pointerdown.stop
                  @click.stop="node.genMode = 'image'"
                >
                  图生图
                </button>
              </div>
              <label class="wb-node__ai-field">
                <span>配置</span>
                <select v-model="node.apiConfigId" @change="loadNodeModels(node)">
                  <option value="">（未选择）</option>
                  <option v-for="cfg in apiConfigs" :key="cfg.id" :value="cfg.id">{{ cfg.name }}</option>
                </select>
              </label>
              <label class="wb-node__ai-field">
                <span>模型</span>
                <select v-model="node.model">
                  <option value="">（用配置默认）</option>
                  <option v-for="m in nodeModelOptions(node)" :key="m" :value="m">{{ m }}</option>
                </select>
              </label>
              <textarea
                v-model="node.genPrompt"
                class="wb-node__gen-prompt"
                :placeholder="node.genMode === 'image' ? '描述想改什么（参考当前图）' : '描述要生成的画面'"
                @pointerdown.stop
                @wheel.stop
              ></textarea>
              <div class="wb-node__gen-row">
                <select v-model="node.genSize">
                  <option value="1024x1024">1:1</option>
                  <option value="1536x1024">16:9</option>
                  <option value="1024x1536">9:16</option>
                </select>
                <button
                  type="button"
                  class="wb-node__gen-btn"
                  :disabled="node.execState === 'running'"
                  @pointerdown.stop
                  @click.stop="runImageGen(node)"
                >
                  {{ node.execState === 'running' ? '生成中…' : '生成' }}
                </button>
              </div>
              <div class="wb-node__tools">
                <button type="button" @pointerdown.stop @click.stop="cropStart(node)">裁剪</button>
                <button type="button" @pointerdown.stop @click.stop="gridPopup = node.id">宫格</button>
                <button type="button" @pointerdown.stop @click.stop="resizePopup = node.id">缩放</button>
                <button type="button" @pointerdown.stop @click.stop="toolRotate(node)">旋转</button>
              </div>
              <div v-if="gridPopup === node.id" class="wb-node__tool-pop">
                <label>
                  切分
                  <select v-model.number="node.size">
                    <option :value="2">2×2</option>
                    <option :value="3">3×3</option>
                    <option :value="5">5×5</option>
                  </select>
                </label>
                <button type="button" @pointerdown.stop @click.stop="toolGridApply(node, node.size || 2)">
                  切分
                </button>
              </div>
              <div v-if="resizePopup === node.id" class="wb-node__tool-pop">
                <label>
                  宽度
                  <select v-model.number="node.size">
                    <option :value="256">256</option>
                    <option :value="512">512</option>
                    <option :value="1024">1024</option>
                    <option :value="1920">1920</option>
                  </select>
                </label>
                <button type="button" @pointerdown.stop @click.stop="toolResizeApply(node)">缩放</button>
              </div>
              <div class="wb-node__tools wb-node__tools--ai">
                <button type="button" @pointerdown.stop @click.stop="runImageTool(node, 'hd')">高清</button>
                <button type="button" @pointerdown.stop @click.stop="runImageTool(node, 'outpaint')">扩图</button>
                <button type="button" @pointerdown.stop @click.stop="runImageTool(node, 'inpaint')">重绘</button>
              </div>
            </div>
          </div>
          <video v-else-if="node.kind === 'video'" :src="node.src" muted loop playsinline autoplay></video>
          <div v-else-if="node.kind === 'text'" class="wb-node__media-gen">
            <textarea
              v-model="node.text"
              class="wb-node__text wb-node__text--gen"
              placeholder="输入文本…"
              @pointerdown.stop
              @wheel.stop
            ></textarea>
            <div class="wb-node__gen">
              <label class="wb-node__ai-field">
                <span>配置</span>
                <select v-model="node.apiConfigId" @change="loadNodeModels(node)">
                  <option value="">（未选择）</option>
                  <option v-for="cfg in apiConfigs" :key="cfg.id" :value="cfg.id">{{ cfg.name }}</option>
                </select>
              </label>
              <label class="wb-node__ai-field">
                <span>模型</span>
                <select v-model="node.model">
                  <option value="">（用配置默认）</option>
                  <option v-for="m in nodeModelOptions(node)" :key="m" :value="m">{{ m }}</option>
                </select>
              </label>
              <textarea
                v-model="node.prompt"
                class="wb-node__gen-prompt"
                placeholder="提示词模板，用 {{input}} 引用正文"
                @pointerdown.stop
                @wheel.stop
              ></textarea>
              <div class="wb-node__gen-row">
                <button
                  type="button"
                  class="wb-node__gen-btn"
                  :disabled="node.execState === 'running'"
                  @pointerdown.stop
                  @click.stop="runTextGen(node)"
                >
                  {{ node.execState === 'running' ? '生成中…' : '生成' }}
                </button>
              </div>
            </div>
          </div>
          <div v-else-if="node.kind === 'resize'" class="wb-node__resize">
            <img v-if="node.src" :src="node.src" alt="" draggable="false" />
            <span v-else class="wb-node__resize-empty">← 连接图片节点</span>
            <label class="wb-node__resize-control">
              <span>输出宽度</span>
              <select v-model.number="node.size">
                <option :value="256">256</option>
                <option :value="512">512</option>
                <option :value="1024">1024</option>
              </select>
            </label>
          </div>
          <div v-else-if="node.kind === 'save'" class="wb-node__save">
            <img v-if="node.src" :src="node.src" alt="" draggable="false" />
            <span v-else class="wb-node__save-empty">← 连接图片节点</span>
            <button
              v-if="node.src"
              type="button"
              class="wb-node__save-btn"
              :disabled="savingId === node.id"
              @pointerdown.stop
              @click="saveNodeContent(node)"
            >
              {{ savingId === node.id ? '保存中…' : '保存到…' }}
            </button>
          </div>
          <div v-else-if="node.kind === 'ai-tag' || node.kind === 'ai-text'" class="wb-node__ai">
            <div v-if="node.kind === 'ai-tag' && node.src" class="wb-node__ai-thumb">
              <img :src="node.src" alt="" draggable="false" />
            </div>
            <label class="wb-node__ai-field">
              <span>API 配置</span>
              <select v-model="node.apiConfigId" @change="loadNodeModels(node)">
                <option value="">（未选择）</option>
                <option v-for="cfg in apiConfigs" :key="cfg.id" :value="cfg.id">{{ cfg.name }}</option>
              </select>
            </label>
            <label class="wb-node__ai-field">
              <span>模型</span>
              <select v-model="node.model">
                <option value="">（用配置默认）</option>
                <option v-for="m in nodeModelOptions(node)" :key="m" :value="m">{{ m }}</option>
              </select>
            </label>
            <label class="wb-node__ai-field">
              <span>温度</span>
              <input
                v-model.number="node.temperature"
                type="number"
                min="0"
                max="2"
                step="0.1"
                title="越高越有创造性，越低越稳定"
              />
            </label>
            <textarea
              v-model="node.prompt"
              class="wb-node__ai-prompt"
              :placeholder="node.kind === 'ai-tag' ? '自定义提示词（可选）' : '提示词模板，用 {{input}} 引用上游文本'"
              @pointerdown.stop
              @wheel.stop
            ></textarea>
            <textarea
              v-model="node.text"
              class="wb-node__ai-result"
              placeholder="运行后在这里显示结果"
              @pointerdown.stop
              @wheel.stop
            ></textarea>
          </div>
          <div
            v-else
            class="wb-node__generic"
            :style="{ '--node-color': node.nodeColor || 'var(--brand-primary)' }"
          >
            <span class="wb-node__generic-icon">▣</span>
            <small>{{ node.defId || node.kind }}</small>
            <ul v-if="node.inputMeta?.length" class="wb-node__inputs">
              <li v-for="(inp, i) in node.inputMeta" :key="i">
                <span class="wb-node__input-name">{{ inp.name || `输入${i + 1}` }}</span>
                <span v-if="inp.optional" class="wb-node__input-tag">可选</span>
                <span v-if="inp.optional && inp.default !== undefined" class="wb-node__input-default">{{ inp.default }}</span>
              </li>
            </ul>
          </div>
        </div>
        <span v-else class="wb-node__reroute-dot"></span>
        <template v-for="index in node.inputCount" :key="`in-${index}`">
          <span
            class="wb-port wb-port--in"
            :data-node="node.id"
            :style="portStyle(node, index - 1, node.inputCount)"
            :title="node.inputMeta?.[index - 1]?.optional ? '可选输入：不连线也能用' : '输入'"
          ></span>
        </template>
        <template v-for="index in node.outputCount" :key="`out-${index}`">
          <span
            class="wb-port wb-port--out"
            :data-node="node.id"
            :style="portStyle(node, index - 1, node.outputCount)"
            title="拖到其他节点输入口连线"
            @pointerdown.stop="onPortDown(node, $event)"
          ></span>
        </template>
        <span class="wb-node__edge" title="拖动调整尺寸"></span>
      </div>
    </div>

    <!-- 框选 -->
    <div v-if="boxSelect" class="workbench__box" :style="boxStyle"></div>

    <!-- 小地图 -->
    <div class="workbench__minimap" title="小地图：点击 / 拖动定位视野" @pointerdown.stop="onMiniDown">
      <header class="wb-minimap__title">小地图</header>
      <template v-if="minimap">
        <canvas ref="miniCanvas" class="wb-minimap__canvas" width="200" height="124"></canvas>
        <div class="wb-minimap__viewport" :style="miniViewportStyle"></div>
      </template>
      <span v-else class="wb-minimap__empty">暂无节点</span>
    </div>

    <!-- 工具栏 -->
    <div class="workbench__toolbar">
      <button class="wb-btn wb-btn--run" type="button" title="运行画布 (Ctrl+Enter)" @click="runWorkflow">▶ 运行</button>
      <div class="wb-add">
        <button class="wb-btn wb-btn--primary" type="button" @click="addMenuOpen = !addMenuOpen">＋ 添加节点 ▾</button>
        <div v-if="addMenuOpen" class="wb-add__menu">
          <button v-for="item in addMenuItems()" :key="item.label" type="button" @click="item.action(); addMenuOpen = false">
            {{ item.icon }} {{ item.label }}
          </button>
        </div>
      </div>
      <button class="wb-btn" type="button" @click="managerOpen = !managerOpen">管理器</button>
      <button class="wb-btn" type="button" @click="apiPanelOpen = !apiPanelOpen">API 配置</button>
      <span class="workbench__divider"></span>
      <button class="wb-btn wb-btn--icon" type="button" title="撤销 (Ctrl+Z)" :disabled="undoStack.length === 0" @click="undo">↶</button>
      <button class="wb-btn wb-btn--icon" type="button" title="重做 (Ctrl+Shift+Z)" :disabled="redoStack.length === 0" @click="redo">↷</button>
      <button
        class="wb-btn"
        :class="{ 'wb-btn--active': snapGrid }"
        type="button"
        :title="snapGrid ? '关闭网格吸附' : '开启网格吸附'"
        @click="snapGrid = !snapGrid"
      >
        吸附
      </button>
      <span class="workbench__divider"></span>
      <button class="wb-btn" type="button" :disabled="selectedNodeIds.length === 0 && selectedEdgeId === null" @click="removeSelected">删除选中</button>
      <button class="wb-btn" type="button" :disabled="selectedNodeIds.length === 0" @click="rotateSelectedNode">旋转</button>
      <button class="wb-btn" type="button" :disabled="nodes.length === 0" @click="clearCanvas">清空</button>
      <span class="workbench__divider"></span>
      <button class="wb-btn wb-btn--icon" type="button" title="缩小" @click="zoomOut">−</button>
      <span class="workbench__zoom">{{ Math.round(zoom * 100) }}%</span>
      <button class="wb-btn wb-btn--icon" type="button" title="放大" @click="zoomIn">＋</button>
      <button class="wb-btn" type="button" title="让所有节点适合窗口" @click="fitToContent">适应</button>
      <span class="workbench__hint">右键添加节点 · 左键拖动平移 · 空格+左键框选 · Ctrl+D 复制 · Ctrl+Z 撤销</span>
    </div>

    <!-- 节点管理器 -->
    <div v-if="managerOpen" class="workbench__manager">
      <header>
        <strong>节点管理器</strong>
        <button type="button" class="wb-manager__close" @click="managerOpen = false">×</button>
      </header>
      <p class="wb-manager__desc">从 GitHub 导入节点，或把节点 JSON 文件放到节点文件夹（启动时自动加载）。</p>
      <div class="wb-manager__row">
        <input v-model="repoUrl" placeholder="https://github.com/用户名/仓库名" @keyup.enter="importGithubNode" />
        <button type="button" :disabled="importing || !repoUrl.trim()" @click="importGithubNode">{{ importing ? '导入中…' : '导入' }}</button>
      </div>
      <p v-if="managerMessage" class="wb-manager__msg" :class="{ ok: managerMessage.ok, error: !managerMessage.ok }">{{ managerMessage.text }}</p>
      <div v-if="customNodes.length" class="wb-manager__list">
        <span>已安装节点（{{ customNodes.length }}）</span>
        <div v-for="def in customNodes" :key="def.id" class="wb-manager__node">
          <div class="wb-manager__node-info">
            <b>{{ def.label }}</b>
            <small>{{ def.id }} · {{ def._enabled === false ? '已禁用' : '已启用' }} · {{ def._source ? 'GitHub 来源' : '本地节点' }}</small>
          </div>
          <div class="wb-manager__node-actions">
            <button type="button" @click="toggleNodeEnabled(def)">{{ def._enabled === false ? '启用' : '禁用' }}</button>
            <button
              v-if="def._source"
              type="button"
              :disabled="updatingFile === def.file"
              @click="updateCustomNode(def)"
            >
              {{ updatingFile === def.file ? '更新中…' : '更新' }}
            </button>
            <button type="button" class="wb-manager__remove" @click="removeCustomNode(def)">删除</button>
          </div>
        </div>
      </div>
      <p v-else class="wb-manager__empty">还没有自定义节点，可以从 GitHub 导入或手动放入节点文件夹。</p>
    </div>

    <div v-if="apiPanelOpen" class="workbench__manager">
      <header>
        <strong>API 配置</strong>
        <button type="button" class="wb-manager__close" @click="apiPanelOpen = false">×</button>
      </header>
      <p class="wb-manager__desc">画布专用凭据库：给 AI 节点准备多套 API 配置（不同服务商 / 模型），密钥只存在本地。</p>
      <div v-if="apiConfigs.length" class="wb-manager__list">
        <span>已保存配置（{{ apiConfigs.length }}）</span>
        <div v-for="cfg in apiConfigs" :key="cfg.id" class="wb-manager__node">
          <div class="wb-manager__node-info">
            <b>{{ cfg.name }}</b>
            <small>{{ cfg.provider }} · {{ cfg.model || '未填模型' }} · {{ cfg.baseUrl || '默认地址' }}</small>
          </div>
          <div class="wb-manager__node-actions">
            <button type="button" :disabled="apiTesting === cfg.id" @click="testApiConfig(cfg)">
              {{ apiTesting === cfg.id ? '测试中…' : '测试' }}
            </button>
            <button type="button" @click="openApiForm(cfg)">编辑</button>
            <button type="button" class="wb-manager__remove" @click="removeApiConfig(cfg.id)">删除</button>
          </div>
        </div>
      </div>
      <p v-else class="wb-manager__empty">还没有配置，先添加一套吧。</p>
      <div class="wb-api__form">
        <input v-model="apiForm.name" placeholder="配置名称（如：打标专用）" />
        <select v-model="apiForm.provider">
          <option value="openai">OpenAI 兼容</option>
          <option value="gemini">Gemini</option>
        </select>
        <input v-model="apiForm.baseUrl" placeholder="接口地址（如 https://api.openai.com/v1，留空用默认）" />
        <input v-model="apiForm.apiKey" type="password" placeholder="API 密钥" />
        <div class="wb-api__model-row">
          <input v-model="apiForm.model" placeholder="模型（如 gpt-4o）" />
          <button type="button" :disabled="apiFetchingModels || !apiForm.apiKey.trim()" @click="fetchApiModels">
            {{ apiFetchingModels ? '获取中…' : '获取可用模型' }}
          </button>
        </div>
        <div v-if="apiModels.length" class="wb-api__models">
          <button
            v-for="m in apiModels"
            :key="m"
            type="button"
            :class="{ active: apiForm.model === m }"
            @click="apiForm.model = m"
          >
            {{ m }}
          </button>
        </div>
        <div class="wb-api__form-actions">
          <button type="button" class="wb-btn--primary" @click="saveApiForm">
            {{ apiForm.id ? '保存修改' : '新增配置' }}
          </button>
          <button v-if="apiForm.id" type="button" @click="openApiForm()">取消</button>
        </div>
        <p v-if="apiMessage" class="wb-manager__msg" :class="{ ok: apiMessage.ok, error: !apiMessage.ok }">
          {{ apiMessage.text }}
        </p>
      </div>
    </div>

    <!-- 空状态提示：每次进入显示，点击画布后消失 -->
    <Transition name="wb-empty">
      <div v-if="nodes.length === 0 && !hintDismissed" class="workbench__empty">
        <div class="workbench__empty-icon">⬡</div>
        <strong>节点工作台</strong>
        <span>右键画布空白处，添加任意节点（图片 / 视频 / 文本 / 已安装节点）</span>
      </div>
    </Transition>

    <ContextMenu
      v-if="contextMenu"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :items="contextMenu.items"
      @close="contextMenu = null"
    />
  </main>
</template>

<style scoped>
.workbench {
  position: relative;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border-radius: 14px;
  background: var(--surface-secondary);
  background-image:
    linear-gradient(var(--line-subtle) 1px, transparent 1px),
    linear-gradient(90deg, var(--line-subtle) 1px, transparent 1px);
  cursor: default;
  user-select: none;
}
.workbench:active { cursor: grabbing; }
.workbench--space { cursor: crosshair; }
.workbench--space:active { cursor: crosshair; }

.workbench__edges {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
}
.wb-edge {
  fill: none;
  stroke: var(--brand-primary);
  stroke-width: 2.5;
  opacity: 0.65;
  pointer-events: stroke;
  cursor: pointer;
}
.wb-edge--selected { stroke: var(--action-accent); opacity: 1; stroke-width: 3; }
.wb-edge--linking { stroke-dasharray: 6 5; opacity: 0.8; pointer-events: none; }

.workbench__world {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  z-index: 2;
}

.wb-node {
  position: absolute;
  left: 0;
  top: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line-strong);
  border-radius: 12px;
  background: var(--surface-primary);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.16);
  cursor: grab;
  transition: box-shadow 160ms ease, border-color 160ms ease;
}
.wb-node:active { cursor: grabbing; }
.wb-node--selected {
  border-color: var(--brand-primary);
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.22), 0 0 0 2px color-mix(in srgb, var(--brand-primary) 45%, transparent);
}
.wb-node--running {
  border-color: var(--action-accent);
  animation: wb-run-pulse 900ms ease-in-out infinite;
}
.wb-node--done {
  border-color: #2e9e5b;
  box-shadow: 0 0 0 2px rgba(46, 158, 91, 0.28);
}
.wb-node--error {
  border-color: #d64545;
  box-shadow: 0 0 0 2px rgba(214, 69, 69, 0.3);
}
@keyframes wb-run-pulse {
  0%, 100% { box-shadow: 0 0 0 2px rgba(217, 95, 143, 0.35); }
  50% { box-shadow: 0 0 0 5px rgba(217, 95, 143, 0.12); }
}
.wb-node__badge {
  position: absolute;
  top: -9px;
  right: -9px;
  z-index: 6;
  padding: 2px 8px;
  border-radius: 999px;
  color: #fff;
  font-size: 9.5px;
  font-weight: 700;
  line-height: 1.4;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.2);
  pointer-events: none;
}
.wb-node__badge--running { background: var(--action-accent); }
.wb-node__badge--done { background: #2e9e5b; }
.wb-node__badge--error { background: #d64545; }
.wb-node--reroute {
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border-color: color-mix(in srgb, var(--brand-primary) 60%, transparent);
  background: var(--surface-primary);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
}
.wb-node--reroute.wb-node--selected {
  border-color: var(--brand-primary);
}
.wb-node--reroute .wb-node__edge { display: none; }
.wb-node__reroute-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--brand-primary);
  border: 2px solid var(--surface-primary);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--brand-primary) 45%, transparent);
  pointer-events: none;
}
.wb-node__head {
  height: 38px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border-bottom: 1px solid var(--line-subtle);
  background: color-mix(in srgb, var(--brand-soft) 55%, var(--surface-primary));
  border-radius: 11px 11px 0 0;
}
.wb-node__kind {
  flex: none;
  max-width: 92px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 2px 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--brand-primary) 14%, transparent);
  color: var(--brand-primary);
  font-size: 9.5px;
  font-weight: 700;
}
.wb-node__head strong {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
  font-size: 12px;
}
.wb-node__head-actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 4px;
}
.wb-node__action {
  min-width: 22px;
  height: 22px;
  padding: 0 5px;
  border: 0;
  border-radius: 6px;
  background: color-mix(in srgb, var(--brand-primary) 10%, transparent);
  color: var(--brand-primary);
  font-size: 10px;
  line-height: 1;
  cursor: pointer;
  transition: background-color 140ms ease;
}
.wb-node__action:hover { background: color-mix(in srgb, var(--brand-primary) 22%, transparent); }
.wb-node__content {
  position: relative;
  flex: 1;
  min-height: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 0 0 11px 11px;
  background: transparent;
}
/* 新节点内容区记得带上底部圆角，避免方角露出 */
.wb-node__generic,
.wb-node__resize,
.wb-node__resize-control,
.wb-node__save,
.wb-node__ai,
.wb-node__media-gen,
.wb-node__text {
  border-radius: 0 0 11px 11px;
}
.wb-node__content img,
.wb-node__content video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  pointer-events: none;
}
.wb-node__text {
  width: 100%;
  height: 100%;
  padding: 10px 12px;
  border: 0;
  outline: none;
  resize: none;
  background: var(--surface-primary);
  color: var(--text-primary);
  font: inherit;
  font-size: 12px;
  line-height: 1.6;
  pointer-events: auto;
  cursor: text;
}
.wb-node__text--gen {
  flex: 1;
  min-height: 90px;
}
.wb-node__resize {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: transparent;
}
.wb-node__resize img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  pointer-events: none;
}
.wb-node__resize-empty {
  display: grid;
  place-items: center;
  height: 100%;
  color: var(--text-tertiary);
  font-size: 11px;
}
.wb-node__resize-control {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 5px 10px;
  background: color-mix(in srgb, var(--surface-primary) 84%, transparent);
  backdrop-filter: blur(6px);
  color: var(--text-secondary);
  font-size: 10px;
  pointer-events: auto;
}
.wb-node__resize-control select {
  border: 1px solid var(--line-subtle);
  border-radius: 6px;
  background: var(--surface-primary);
  color: var(--text-primary);
  font: inherit;
  font-size: 10px;
  padding: 2px 4px;
}
.wb-node__save {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: transparent;
}
.wb-node__save img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  pointer-events: none;
}
.wb-node__save-empty {
  display: grid;
  place-items: center;
  height: 100%;
  color: var(--text-tertiary);
  font-size: 11px;
}
.wb-node__save-btn {
  position: absolute;
  right: 10px;
  bottom: 10px;
  padding: 5px 12px;
  border: 0;
  border-radius: 8px;
  background: #2e9e5b;
  color: #fff;
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  pointer-events: auto;
}
.wb-node__save-btn:hover:not(:disabled) { background: #27814b; }
.wb-node__save-btn:disabled { opacity: 0.6; cursor: wait; }
.wb-node__media-gen {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: auto;
  background: var(--surface-primary);
}
.wb-node__media-preview {
  position: relative;
  flex: none;
  height: 120px;
  display: grid;
  place-items: center;
  background: var(--surface-secondary);
  overflow: hidden;
}
.wb-node__media-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  pointer-events: none;
}
.wb-node__media-empty { color: var(--text-tertiary); font-size: 11px; }
.wb-node__gen {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
}
.wb-node__gen-modes {
  display: flex;
  gap: 4px;
  padding: 3px;
  border-radius: 8px;
  background: var(--surface-secondary);
}
.wb-node__gen-modes button {
  flex: 1;
  height: 24px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-tertiary);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.wb-node__gen-modes button.on {
  background: var(--surface-primary);
  color: var(--brand-primary);
  font-weight: 700;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
}
.wb-node__gen-prompt {
  min-height: 52px;
  resize: none;
  padding: 6px 8px;
  border: 1px solid var(--line-subtle);
  border-radius: 8px;
  outline: none;
  background: var(--surface-secondary);
  color: var(--text-primary);
  font: inherit;
  font-size: 11px;
  line-height: 1.5;
}
.wb-node__gen-row { display: flex; gap: 6px; align-items: center; }
.wb-node__gen-row select {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 6px;
  border: 1px solid var(--line-subtle);
  border-radius: 6px;
  background: var(--surface-secondary);
  color: var(--text-primary);
  font: inherit;
  font-size: 11px;
}
.wb-node__gen-btn {
  flex: none;
  height: 28px;
  padding: 0 16px;
  border: 0;
  border-radius: 8px;
  background: #2e9e5b;
  color: #fff;
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.wb-node__gen-btn:disabled { opacity: 0.6; cursor: wait; }
.wb-node__tools { display: flex; flex-wrap: wrap; gap: 4px; }
.wb-node__tools button {
  padding: 3px 8px;
  border: 1px solid color-mix(in srgb, var(--brand-primary) 45%, transparent);
  border-radius: 999px;
  background: transparent;
  color: var(--brand-primary);
  font: inherit;
  font-size: 10px;
  cursor: pointer;
}
.wb-node__tools button:hover { background: var(--brand-soft); }
.wb-node__tools--ai button {
  border-color: var(--line-subtle);
  color: var(--text-tertiary);
}
.wb-node__tool-pop {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid var(--line-subtle);
  border-radius: 8px;
  background: var(--surface-secondary);
  font-size: 10px;
  color: var(--text-secondary);
}
.wb-node__tool-pop label { display: flex; align-items: center; gap: 5px; }
.wb-node__tool-pop select {
  height: 24px;
  border: 1px solid var(--line-subtle);
  border-radius: 6px;
  background: var(--surface-primary);
  color: var(--text-primary);
  font: inherit;
  font-size: 10px;
}
.wb-node__tool-pop button {
  height: 24px;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  background: var(--brand-primary);
  color: #fff;
  font: inherit;
  font-size: 10px;
  cursor: pointer;
}
.wb-node__media-preview.cropping { cursor: crosshair; }
.wb-node__crop {
  position: absolute;
  inset: 0;
  z-index: 3;
}
.wb-node__crop-box {
  position: absolute;
  border: 1px dashed var(--brand-primary);
  background: color-mix(in srgb, var(--brand-primary) 14%, transparent);
  pointer-events: none;
}
.wb-node__crop-confirm {
  position: absolute;
  right: 8px;
  bottom: 8px;
  z-index: 4;
  height: 26px;
  padding: 0 12px;
  border: 0;
  border-radius: 7px;
  background: var(--brand-primary);
  color: #fff;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.wb-node__ai {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  overflow: auto;
  background: var(--surface-primary);
}
.wb-node__ai-thumb {
  flex: none;
  max-height: 96px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 8px;
  background: var(--surface-secondary);
}
.wb-node__ai-thumb img {
  max-width: 100%;
  max-height: 96px;
  object-fit: contain;
  display: block;
  pointer-events: none;
}
.wb-node__ai-field {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: var(--text-secondary);
}
.wb-node__ai-field select {
  flex: 1;
  min-width: 0;
  height: 26px;
  padding: 0 6px;
  border: 1px solid var(--line-subtle);
  border-radius: 6px;
  background: var(--surface-secondary);
  color: var(--text-primary);
  font: inherit;
  font-size: 11px;
}
.wb-node__ai-field input[type='number'] {
  width: 56px;
  height: 26px;
  padding: 0 6px;
  border: 1px solid var(--line-subtle);
  border-radius: 6px;
  background: var(--surface-secondary);
  color: var(--text-primary);
  font: inherit;
  font-size: 11px;
}
.wb-node__ai-prompt {
  flex: 1;
  min-height: 54px;
  resize: none;
  padding: 6px 8px;
  border: 1px solid var(--line-subtle);
  border-radius: 8px;
  outline: none;
  background: var(--surface-secondary);
  color: var(--text-primary);
  font: inherit;
  font-size: 11px;
  line-height: 1.5;
}
.wb-node__ai-result {
  flex: 1.4;
  min-height: 64px;
  resize: none;
  padding: 6px 8px;
  border: 1px solid var(--line-subtle);
  border-radius: 8px;
  outline: none;
  background: var(--surface-primary);
  color: var(--text-primary);
  font: inherit;
  font-size: 11px;
  line-height: 1.5;
}
.wb-node__generic {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: color-mix(in srgb, var(--brand-soft) 34%, var(--surface-primary));
}
.wb-node__generic-icon {
  font-size: 24px;
  color: var(--node-color);
}
.wb-node__generic small {
  max-width: 85%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-tertiary);
  font-family: var(--font-mono);
  font-size: 9px;
}
.wb-node__inputs {
  width: 100%;
  margin: 0;
  padding: 4px 10px 8px;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 3px;
  overflow: auto;
}
.wb-node__inputs li {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  color: var(--text-secondary);
}
.wb-node__input-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wb-node__input-tag {
  flex: none;
  padding: 1px 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--brand-primary) 12%, transparent);
  color: var(--brand-primary);
  font-size: 8.5px;
  font-weight: 700;
}
.wb-node__input-default {
  flex: none;
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 1px 5px;
  border-radius: 5px;
  background: color-mix(in srgb, var(--ink-primary) 8%, transparent);
  color: var(--text-tertiary);
  font-family: var(--font-mono);
  font-size: 9px;
}
.wb-port {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--surface-primary);
  background: var(--brand-primary);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--brand-primary) 45%, transparent);
  z-index: 4;
}
.wb-port--in { left: -7px; cursor: crosshair; }
.wb-port--out { right: -7px; cursor: crosshair; }
.wb-port:hover { background: var(--action-accent); transform: translateY(-50%) scale(1.2); }
.wb-node__edge {
  position: absolute;
  right: 0;
  bottom: 0;
  z-index: 5;
  width: 26px;
  height: 26px;
  cursor: nwse-resize;
}

.workbench__box {
  position: absolute;
  z-index: 8;
  border: 1px solid var(--brand-primary);
  border-radius: 3px;
  background: color-mix(in srgb, var(--brand-primary) 10%, transparent);
  pointer-events: none;
}

.workbench__minimap {
  position: absolute;
  right: 14px;
  bottom: 14px;
  z-index: 12;
  width: 200px;
  height: 148px;
  border: 1px solid var(--line-subtle);
  border-radius: 10px;
  background: color-mix(in srgb, var(--surface-primary) 88%, transparent);
  backdrop-filter: blur(8px);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.16);
  overflow: hidden;
}
.wb-minimap__title {
  height: 24px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  border-bottom: 1px solid var(--line-subtle);
  color: var(--text-tertiary);
  font-size: 10px;
  letter-spacing: 0.12em;
  user-select: none;
}
.wb-minimap__canvas {
  position: absolute;
  left: 0;
  top: 24px;
  width: 200px;
  height: 124px;
  display: block;
  pointer-events: none;
}
.wb-minimap__viewport {
  position: absolute;
  border: 2px solid color-mix(in srgb, var(--ink-primary) 35%, transparent);
  background: rgba(255, 255, 255, 0.2);
  box-shadow: 0 0 3px rgba(0, 0, 0, 0.08);
  cursor: move;
}
.wb-minimap__empty {
  display: grid;
  place-items: center;
  height: calc(100% - 24px);
  color: var(--text-tertiary);
  font-size: 11px;
}

.workbench__toolbar {
  position: absolute;
  left: 50%;
  top: 14px;
  transform: translateX(-50%);
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: calc(100% - 28px);
  padding: 7px 10px;
  border: 1px solid var(--line-subtle);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-primary) 90%, transparent);
  backdrop-filter: blur(10px);
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.16);
}
.wb-add {
  position: relative;
}
.wb-add__menu {
  position: absolute;
  left: 0;
  top: calc(100% + 6px);
  z-index: 20;
  min-width: 170px;
  max-height: 320px;
  overflow-y: auto;
  padding: 5px;
  border: 1px solid var(--line-subtle);
  border-radius: 10px;
  background: var(--surface-primary);
  box-shadow: 0 16px 44px rgba(0, 0, 0, 0.24);
}
.wb-add__menu button {
  display: block;
  width: 100%;
  height: 34px;
  padding: 0 12px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
}
.wb-add__menu button:hover { background: var(--brand-soft); color: var(--brand-primary); }
.wb-btn {
  height: 30px;
  padding: 0 11px;
  border: 1px solid var(--line-subtle);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 160ms ease, color 160ms ease;
}
.wb-btn:hover { background: var(--brand-soft); color: var(--brand-primary); }
.wb-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.wb-btn--active { border-color: var(--brand-primary); background: var(--brand-soft); color: var(--brand-primary); }
.wb-btn--primary { border-color: transparent; background: var(--brand-primary); color: #fff; font-weight: 650; }
.wb-btn--primary:hover { background: var(--brand-hover); color: #fff; }
.wb-btn--run { border-color: transparent; background: #2e9e5b; color: #fff; font-weight: 700; box-shadow: 0 4px 12px rgba(46, 158, 91, 0.35); }
.wb-btn--run:hover { background: #27814b; color: #fff; }
.wb-btn--icon { min-width: 30px; padding: 0; font-size: 14px; }
.workbench__divider { width: 1px; height: 20px; background: var(--line-subtle); margin: 0 4px; }
.workbench__zoom { min-width: 46px; text-align: center; color: var(--text-secondary); font: 11px var(--font-mono); }
.workbench__hint { margin-left: 6px; padding-left: 8px; border-left: 1px solid var(--line-subtle); color: var(--text-tertiary); font-size: 10.5px; white-space: nowrap; }

.workbench__manager {
  position: absolute;
  right: 14px;
  top: 14px;
  z-index: 15;
  width: 330px;
  padding: 14px;
  border: 1px solid var(--line-subtle);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-primary) 95%, transparent);
  backdrop-filter: blur(12px);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.workbench__manager header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.workbench__manager header strong {
  color: var(--text-primary);
  font-size: 14px;
}
.wb-manager__close {
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 6px;
  background: var(--surface-secondary);
  color: var(--text-tertiary);
  cursor: pointer;
}
.wb-manager__desc {
  margin: 0;
  color: var(--text-tertiary);
  font-size: 11px;
  line-height: 1.6;
}
.wb-manager__row {
  display: flex;
  gap: 6px;
}
.wb-manager__row input {
  flex: 1;
  min-width: 0;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--line-subtle);
  border-radius: 8px;
  outline: none;
  background: var(--surface-secondary);
  color: var(--text-primary);
  font: inherit;
  font-size: 12px;
}
.wb-manager__row button {
  height: 32px;
  padding: 0 14px;
  border: 0;
  border-radius: 8px;
  background: var(--brand-primary);
  color: #fff;
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}
.wb-manager__row button:disabled { opacity: 0.5; cursor: not-allowed; }
.wb-api__form {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--line-subtle);
}
.wb-api__form input,
.wb-api__form select {
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--line-subtle);
  border-radius: 8px;
  outline: none;
  background: var(--surface-secondary);
  color: var(--text-primary);
  font: inherit;
  font-size: 12px;
}
.wb-api__model-row {
  display: flex;
  gap: 6px;
}
.wb-api__model-row input { flex: 1; min-width: 0; }
.wb-api__model-row button {
  flex: none;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--line-subtle);
  border-radius: 8px;
  background: var(--surface-secondary);
  color: var(--text-secondary);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.wb-api__model-row button:disabled { opacity: 0.5; cursor: not-allowed; }
.wb-api__models {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  max-height: 96px;
  overflow: auto;
  padding: 2px;
}
.wb-api__models button {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 3px 8px;
  border: 1px solid var(--line-subtle);
  border-radius: 999px;
  background: var(--surface-secondary);
  color: var(--text-secondary);
  font: inherit;
  font-size: 10px;
  cursor: pointer;
}
.wb-api__models button:hover { border-color: var(--brand-primary); color: var(--brand-primary); }
.wb-api__models button.active {
  border-color: var(--brand-primary);
  background: var(--brand-soft);
  color: var(--brand-primary);
}
.wb-api__form-actions {
  display: flex;
  gap: 6px;
}
.wb-api__form-actions button {
  height: 30px;
  padding: 0 14px;
  border: 1px solid var(--line-subtle);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.wb-api__form-actions button:first-child {
  border-color: transparent;
  background: var(--brand-primary);
  color: #fff;
  font-weight: 650;
}
.wb-manager__msg {
  margin: 0;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 11px;
  line-height: 1.5;
}
.wb-manager__msg.ok { background: rgba(52, 211, 153, 0.1); color: #34d399; }
.wb-manager__msg.error { background: rgba(255, 137, 117, 0.1); color: #ff8a78; }
.wb-manager__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 260px;
  overflow-y: auto;
}
.wb-manager__list > span {
  color: var(--text-tertiary);
  font-size: 10.5px;
  letter-spacing: 0.08em;
}
.wb-manager__node {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 8px;
  background: var(--surface-secondary);
}
.wb-manager__node-info { min-width: 0; flex: 1; }
.wb-manager__node-info b {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary);
  font-size: 12px;
}
.wb-manager__node-info small {
  display: block;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-tertiary);
  font-size: 9px;
}
.wb-manager__node-actions {
  display: flex;
  gap: 5px;
  flex: none;
}
.wb-manager__node-actions button {
  height: 26px;
  padding: 0 9px;
  border: 1px solid var(--line-subtle);
  border-radius: 7px;
  background: var(--surface-primary);
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
}
.wb-manager__node-actions button:hover { background: var(--brand-soft); color: var(--brand-primary); }
.wb-manager__node-actions button:disabled { opacity: 0.5; cursor: not-allowed; }
.wb-manager__node-actions button.wb-manager__remove {
  border-color: rgba(255, 137, 117, 0.2);
  color: #ff8a78;
}
.wb-manager__empty { margin: 0; color: var(--text-tertiary); font-size: 11px; }

.workbench__empty {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-tertiary);
  pointer-events: none;
}
.workbench__empty-icon { font-size: 34px; opacity: 0.5; color: var(--brand-primary); }
.workbench__empty strong { color: var(--text-secondary); font-size: 16px; }
.workbench__empty span { font-size: 12px; }
.wb-empty-enter-active,
.wb-empty-leave-active {
  transition: opacity 220ms ease;
}
.wb-empty-enter-from,
.wb-empty-leave-to {
  opacity: 0;
}
</style>
