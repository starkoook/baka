import { newFrameId, type SeqFrame } from "./sequence"

const CELL = 64
const COLS = 4
const ROWS = 2

function drawPose(ctx: CanvasRenderingContext2D, ox: number, oy: number, frame: number) {
  const t = frame / 8
  const bob = Math.round(Math.sin(t * Math.PI * 2) * 2)
  const swing = Math.sin(t * Math.PI * 2)
  ctx.save()
  ctx.translate(ox, oy + bob)
  ctx.fillStyle = "rgba(40, 44, 70, 0.9)"
  ctx.beginPath()
  ctx.ellipse(32, 22, 10, 11, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = "#6ee0c0"
  ctx.beginPath()
  ctx.ellipse(32, 20, 8, 9, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = "#3d8bff"
  ctx.fillRect(26, 30, 12, 14)
  ctx.strokeStyle = "#f4d35e"
  ctx.lineWidth = 3
  ctx.lineCap = "round"
  ctx.beginPath()
  ctx.moveTo(26, 32)
  ctx.lineTo(18, 38 + swing * 6)
  ctx.moveTo(38, 32)
  ctx.lineTo(46, 38 - swing * 6)
  ctx.stroke()
  ctx.strokeStyle = "#c97b84"
  ctx.beginPath()
  ctx.moveTo(28, 44)
  ctx.lineTo(24, 56 - swing * 5)
  ctx.moveTo(36, 44)
  ctx.lineTo(40, 56 + swing * 5)
  ctx.stroke()
  ctx.restore()
}

export function createDemoWalkSheetCanvas(cell = CELL): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = cell * COLS
  canvas.height = cell * ROWS
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("2d context unavailable")
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  for (let i = 0; i < 8; i++) {
    const c = i % COLS
    const r = Math.floor(i / COLS)
    drawPose(ctx, c * cell, r * cell, i)
  }
  return canvas
}

export function createDemoWalkSheetDataUrl(): string {
  return createDemoWalkSheetCanvas().toDataURL("image/png")
}

export function createDemoWalkSheetPixels(): { width: number; height: number; data: Uint8ClampedArray; cols: number; rows: number } {
  const canvas = createDemoWalkSheetCanvas()
  const ctx = canvas.getContext("2d")!
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return { width: canvas.width, height: canvas.height, data, cols: COLS, rows: ROWS }
}

export function createDemoWalkFrames(): SeqFrame[] {
  const frames: SeqFrame[] = []
  for (let i = 0; i < 8; i++) {
    const canvas = document.createElement("canvas")
    canvas.width = CELL
    canvas.height = CELL
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("2d context unavailable")
    ctx.clearRect(0, 0, CELL, CELL)
    drawPose(ctx, 0, 0, i)
    frames.push({
      id: newFrameId(),
      name: `walk_${String(i + 1).padStart(2, "0")}`,
      src: canvas.toDataURL("image/png"),
      width: CELL,
      height: CELL,
    })
  }
  return frames
}

export const DEMO_SHEET_COLS = COLS
export const DEMO_SHEET_ROWS = ROWS
