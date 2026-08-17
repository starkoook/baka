<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{ src: string; filename?: string }>()
const emit = defineEmits<{ save: [dataUrl: string] }>()

type Tool = 'brush' | 'eraser' | 'eyedropper' | 'crop'

const tool = ref<Tool>('brush')
const color = ref('#ff0000')
const brushSize = ref(12)
const zoom = ref(1)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const undoStack = ref<string[]>([])
const redoStack = ref<string[]>([])
const cropRect = ref<{ x: number; y: number; w: number; h: number } | null>(null)
const status = ref('')
const naturalSize = ref({ width: 0, height: 0 })

let image: HTMLImageElement | null = null
let drawing = false
let startPoint = { x: 0, y: 0 }
let currentPoint = { x: 0, y: 0 }
let dirty = false
const MAX_HISTORY = 20

function ctx() {
  return canvasRef.value?.getContext('2d') ?? null
}

function toCanvasPoint(event: PointerEvent) {
  const canvas = canvasRef.value!
  const rect = canvas.getBoundingClientRect()
  return {
    x: Math.min(Math.max(0, (event.clientX - rect.left) * canvas.width / rect.width), canvas.width),
    y: Math.min(Math.max(0, (event.clientY - rect.top) * canvas.height / rect.height), canvas.height),
  }
}

function pushHistory() {
  const canvas = canvasRef.value
  if (!canvas) return
  undoStack.value.push(canvas.toDataURL('image/png'))
  if (undoStack.value.length > MAX_HISTORY) undoStack.value.shift()
  redoStack.value = []
}

function restoreFromDataUrl(dataUrl: string) {
  const canvas = canvasRef.value
  const context = ctx()
  if (!canvas || !context) return
  const img = new Image()
  img.onload = () => {
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    naturalSize.value = { width: img.naturalWidth, height: img.naturalHeight }
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(img, 0, 0)
    dirty = true
  }
  img.src = dataUrl
}

function undo() {
  if (!undoStack.value.length) return
  redoStack.value.push(canvasRef.value?.toDataURL('image/png') ?? '')
  restoreFromDataUrl(undoStack.value.pop()!)
}

function redo() {
  if (!redoStack.value.length) return
  undoStack.value.push(canvasRef.value?.toDataURL('image/png') ?? '')
  restoreFromDataUrl(redoStack.value.pop()!)
}

function load() {
  const canvas = canvasRef.value
  const context = ctx()
  if (!canvas || !context || !props.src) return
  const img = new Image()
  img.onload = () => {
    image = img
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(img, 0, 0)
    undoStack.value = []
    redoStack.value = []
    cropRect.value = null
    dirty = false
    zoom.value = 1
    status.value = `${img.naturalWidth} × ${img.naturalHeight}`
  }
  img.src = props.src
}

const cropBoxStyle = computed(() => {
  const canvas = canvasRef.value
  const rect = cropRect.value
  if (!canvas || !rect) return {}
  const displayWidth = canvas.clientWidth || 1
  const displayHeight = canvas.clientHeight || 1
  return {
    left: `${canvas.offsetLeft + rect.x / canvas.width * displayWidth}px`,
    top: `${canvas.offsetTop + rect.y / canvas.height * displayHeight}px`,
    width: `${rect.w / canvas.width * displayWidth}px`,
    height: `${rect.h / canvas.height * displayHeight}px`,
  }
})

function onPointerDown(event: PointerEvent) {
  if (!image) return
  const point = toCanvasPoint(event)
  if (tool.value === 'eyedropper') {
    const context = ctx()
    if (!context) return
    const data = context.getImageData(Math.round(point.x), Math.round(point.y), 1, 1).data
    color.value = `#${[data[0], data[1], data[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`
    return
  }
  if (tool.value === 'crop') {
    drawing = true
    startPoint = point
    currentPoint = point
    cropRect.value = { x: point.x, y: point.y, w: 0, h: 0 }
    return
  }
  pushHistory()
  drawing = true
  startPoint = point
  currentPoint = point
  drawSegment(startPoint, currentPoint)
}

function onPointerMove(event: PointerEvent) {
  if (!drawing || !image) return
  const point = toCanvasPoint(event)
  if (tool.value === 'crop') {
    currentPoint = point
    cropRect.value = {
      x: Math.min(startPoint.x, point.x),
      y: Math.min(startPoint.y, point.y),
      w: Math.abs(point.x - startPoint.x),
      h: Math.abs(point.y - startPoint.y),
    }
    return
  }
  currentPoint = point
  drawSegment(startPoint, currentPoint)
  startPoint = currentPoint
}

function onPointerUp() {
  drawing = false
  dirty = true
}

function drawSegment(from: { x: number; y: number }, to: { x: number; y: number }) {
  const context = ctx()
  if (!context) return
  context.save()
  if (tool.value === 'eraser') {
    context.globalCompositeOperation = 'destination-out'
    context.strokeStyle = 'rgba(0,0,0,1)'
  } else {
    context.globalCompositeOperation = 'source-over'
    context.strokeStyle = color.value
  }
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.lineWidth = brushSize.value
  context.beginPath()
  context.moveTo(from.x, from.y)
  context.lineTo(to.x, to.y)
  context.stroke()
  context.restore()
}

function applyCrop() {
  const rect = cropRect.value
  const canvas = canvasRef.value
  const context = ctx()
  if (!rect || !canvas || !context || rect.w < 1 || rect.h < 1) return
  pushHistory()
  const source = context.getImageData(Math.round(rect.x), Math.round(rect.y), Math.round(rect.w), Math.round(rect.h))
  canvas.width = Math.max(1, Math.round(rect.w))
  canvas.height = Math.max(1, Math.round(rect.h))
  context.putImageData(source, 0, 0)
  cropRect.value = null
  dirty = true
  status.value = `${canvas.width} × ${canvas.height}`
}

function cancelCrop() {
  cropRect.value = null
}

function zoomBy(factor: number) {
  zoom.value = Math.min(6, Math.max(0.1, +(zoom.value * factor).toFixed(2)))
}

function fitZoom() {
  zoom.value = 1
}

function save() {
  const canvas = canvasRef.value
  if (!canvas || !dirty) return
  emit('save', canvas.toDataURL('image/png'))
}

watch(() => props.src, load)

function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
  const key = event.key.toLowerCase()
  if ((event.ctrlKey || event.metaKey) && key === 'z') {
    event.preventDefault()
    if (event.shiftKey) redo()
    else undo()
    return
  }
  if ((event.ctrlKey || event.metaKey) && key === 'y') {
    event.preventDefault()
    redo()
    return
  }
  if ((event.ctrlKey || event.metaKey) && key === 's') {
    event.preventDefault()
    save()
    return
  }
  if (key === 'b') tool.value = 'brush'
  else if (key === 'e') tool.value = 'eraser'
  else if (key === 'i') tool.value = 'eyedropper'
  else if (key === 'c') tool.value = 'crop'
  else if (event.key === '[') brushSize.value = Math.max(1, brushSize.value - 2)
  else if (event.key === ']') brushSize.value = Math.min(120, brushSize.value + 2)
}

onMounted(() => window.addEventListener('keydown', onKeydown))

onBeforeUnmount(() => {
  image = null
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="image-editor">
    <div class="image-editor__toolbar">
      <div class="tool-group">
        <button type="button" :class="{ active: tool === 'brush' }" title="画笔 (B)" @click="tool = 'brush'">🖌</button>
        <button type="button" :class="{ active: tool === 'eraser' }" title="橡皮擦 (E)" @click="tool = 'eraser'">◻</button>
        <button type="button" :class="{ active: tool === 'eyedropper' }" title="吸管 (I)" @click="tool = 'eyedropper'">💧</button>
        <button type="button" :class="{ active: tool === 'crop' }" title="裁切 (C)" @click="tool = 'crop'">✂</button>
      </div>
      <label class="color-picker"><input v-model="color" type="color" :disabled="tool === 'eraser'" /><span>颜色</span></label>
      <label class="brush-size">笔刷 <strong>{{ brushSize }}</strong><input v-model.number="brushSize" type="range" min="1" max="120" /></label>
      <div class="tool-group">
        <button type="button" :disabled="!undoStack.length" title="撤销 (Ctrl+Z)" @click="undo">↶</button>
        <button type="button" :disabled="!redoStack.length" title="重做 (Ctrl+Shift+Z)" @click="redo">↷</button>
      </div>
      <div class="tool-group">
        <button type="button" title="缩小" @click="zoomBy(0.8)">−</button>
        <button type="button" title="适应窗口" @click="fitZoom">{{ Math.round(zoom * 100) }}%</button>
        <button type="button" title="放大" @click="zoomBy(1.25)">＋</button>
      </div>
      <button v-if="cropRect" type="button" class="crop-confirm" @click="applyCrop">确认裁切</button>
      <button v-if="cropRect" type="button" @click="cancelCrop">取消</button>
      <button type="button" class="save-btn" :disabled="!dirty" @click="save">保存</button>
    </div>

    <div class="image-editor__stage" @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp">
      <canvas
        ref="canvasRef"
        class="image-editor__canvas"
        :style="{ width: `${naturalSize.width * zoom}px`, height: `${naturalSize.height * zoom}px` }"
        :data-crop="tool === 'crop' ? 'true' : 'false'"
      />
      <div v-if="cropRect" class="crop-box" :style="cropBoxStyle" />
      <span v-if="status" class="image-editor__status">{{ status }}</span>
    </div>
  </div>
</template>

<style scoped>
.image-editor { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.image-editor__toolbar { flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,.06); }
.tool-group { display: flex; gap: 4px; }
.image-editor button { height: 30px; min-width: 30px; padding: 0 9px; border: 1px solid rgba(255,255,255,.08); border-radius: 7px; background: rgba(255,255,255,.03); color: var(--text-secondary); cursor: pointer; font-size: 13px; }
.image-editor button.active { background: rgba(var(--accent-primary-rgb),.14); border-color: rgba(var(--accent-primary-rgb),.4); color: var(--accent-primary); }
.image-editor button:disabled { opacity: .32; cursor: not-allowed; }
.color-picker, .brush-size { display: flex; align-items: center; gap: 5px; color: var(--text-tertiary); font-size: 9px; }
.color-picker input { width: 26px; height: 26px; padding: 0; border: 0; background: transparent; cursor: pointer; }
.brush-size input { width: 90px; accent-color: var(--accent-primary); }
.brush-size strong { color: var(--accent-primary); font-family: ui-monospace, monospace; }
.crop-confirm, .save-btn { border-color: transparent !important; background: var(--accent-primary) !important; color: white !important; font-weight: 700; }
.image-editor__stage { position: relative; flex: 1; min-height: 0; display: flex; overflow: auto; padding: 20px; background: radial-gradient(circle at center,#221f27,#121116 72%); touch-action: none; }
.image-editor__canvas { display: block; margin: auto; box-shadow: 0 20px 60px rgba(0,0,0,.4); cursor: crosshair; }
.crop-box { position: absolute; pointer-events: none; border: 1px dashed #fff; box-shadow: 0 0 0 9999px rgba(0,0,0,.45); }
.image-editor__status { position: absolute; left: 12px; bottom: 10px; color: var(--text-tertiary); font-size: 9px; }
</style>
