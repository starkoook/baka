export interface SeqFrame {
  id: string
  name: string
  src: string
  width: number
  height: number
}

export interface PixelImage {
  width: number
  height: number
  data: Uint8ClampedArray
}

export interface SliceOptions {
  cols: number
  rows: number
  padding?: number
  margin?: number
  emptyAlpha?: number
}

export interface PackedSheet {
  src: string
  columns: number
  rows: number
  cellWidth: number
  cellHeight: number
  width: number
  height: number
}

export interface GodotSequenceJson {
  name: string
  fps: number
  loop: boolean
  frames: { name: string; duration: number; width: number; height: number }[]
  sheet: { columns: number; cellWidth: number; cellHeight: number }
}

const EMPTY_ALPHA = 8

export function newFrameId(): string {
  return `frm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function packSheetColumns(n: number): number {
  if (n <= 0) return 1
  return Math.ceil(Math.sqrt(n))
}

export function computeCellSize(
  imgW: number,
  imgH: number,
  cols: number,
  rows: number,
  padding = 0,
  margin = 0,
): { cellW: number; cellH: number } {
  const cellW = Math.floor((imgW - margin * 2 - padding * (cols - 1)) / cols)
  const cellH = Math.floor((imgH - margin * 2 - padding * (rows - 1)) / rows)
  return { cellW, cellH }
}

export function cellHasContent(data: Uint8ClampedArray, maxAlpha = EMPTY_ALPHA): boolean {
  let max = 0
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > max) max = data[i]
    if (max > maxAlpha) return true
  }
  return false
}

export function sliceSheetFromPixels(
  image: PixelImage,
  cols: number,
  rows: number,
  padding = 0,
  margin = 0,
  emptyAlpha = EMPTY_ALPHA,
): PixelImage[] {
  const { cellW, cellH } = computeCellSize(image.width, image.height, cols, rows, padding, margin)
  if (cellW <= 0 || cellH <= 0) return []
  const out: PixelImage[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = margin + c * (cellW + padding)
      const y0 = margin + r * (cellH + padding)
      const data = new Uint8ClampedArray(cellW * cellH * 4)
      for (let y = 0; y < cellH; y++) {
        const srcY = y0 + y
        if (srcY < 0 || srcY >= image.height) continue
        for (let x = 0; x < cellW; x++) {
          const srcX = x0 + x
          if (srcX < 0 || srcX >= image.width) continue
          const si = (srcY * image.width + srcX) * 4
          const di = (y * cellW + x) * 4
          data[di] = image.data[si]
          data[di + 1] = image.data[si + 1]
          data[di + 2] = image.data[si + 2]
          data[di + 3] = image.data[si + 3]
        }
      }
      if (!cellHasContent(data, emptyAlpha)) continue
      out.push({ width: cellW, height: cellH, data })
    }
  }
  return out
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("failed to load image"))
    img.src = src
  })
}

function canvasToPixels(canvas: HTMLCanvasElement): PixelImage {
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) throw new Error("2d context unavailable")
  const { width, height } = canvas
  return { width, height, data: ctx.getImageData(0, 0, width, height).data }
}

function pixelsToDataUrl(pixels: PixelImage): string {
  const canvas = document.createElement("canvas")
  canvas.width = pixels.width
  canvas.height = pixels.height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("2d context unavailable")
  ctx.putImageData(new ImageData(pixels.data, pixels.width, pixels.height), 0, 0)
  return canvas.toDataURL("image/png")
}

export async function imageSrcToPixels(src: string): Promise<PixelImage> {
  const img = await loadHtmlImage(src)
  const canvas = document.createElement("canvas")
  canvas.width = img.naturalWidth || img.width
  canvas.height = img.naturalHeight || img.height
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) throw new Error("2d context unavailable")
  ctx.drawImage(img, 0, 0)
  return canvasToPixels(canvas)
}

export async function sliceSheet(
  src: string,
  cols: number,
  rows: number,
  padding = 0,
  margin = 0,
): Promise<SeqFrame[]> {
  const pixels = await imageSrcToPixels(src)
  const cells = sliceSheetFromPixels(pixels, cols, rows, padding, margin)
  return cells.map((cell, i) => ({
    id: newFrameId(),
    name: `frame_${String(i + 1).padStart(3, "0")}`,
    src: pixelsToDataUrl(cell),
    width: cell.width,
    height: cell.height,
  }))
}

export function packSheetLayout(frameCount: number): { columns: number; rows: number } {
  const columns = packSheetColumns(frameCount)
  const rows = Math.max(1, Math.ceil(frameCount / columns))
  return { columns, rows }
}

export async function packSheet(frames: SeqFrame[]): Promise<PackedSheet> {
  const n = frames.length
  const { columns, rows } = packSheetLayout(n)
  const cellWidth = n ? Math.max(...frames.map((f) => f.width)) : 1
  const cellHeight = n ? Math.max(...frames.map((f) => f.height)) : 1
  const width = columns * cellWidth
  const height = rows * cellHeight
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, width)
  canvas.height = Math.max(1, height)
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("2d context unavailable")
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  for (let i = 0; i < n; i++) {
    const img = await loadHtmlImage(frames[i].src)
    const col = i % columns
    const row = Math.floor(i / columns)
    const dx = col * cellWidth + Math.floor((cellWidth - frames[i].width) / 2)
    const dy = row * cellHeight + Math.floor((cellHeight - frames[i].height) / 2)
    ctx.drawImage(img, dx, dy)
  }
  return {
    src: canvas.toDataURL("image/png"),
    columns,
    rows,
    cellWidth,
    cellHeight,
    width: canvas.width,
    height: canvas.height,
  }
}

export function zipFrameName(index: number, name: string): string {
  const safe = (name || "frame").replace(/[^\w.\-]+/g, "_")
  return `${String(index).padStart(3, "0")}_${safe}.png`
}

export function buildGodotJson(
  name: string,
  fps: number,
  loop: boolean,
  frames: SeqFrame[],
  sheet: { columns: number; cellWidth: number; cellHeight: number },
): GodotSequenceJson {
  const duration = fps > 0 ? 1 / fps : 1
  return {
    name,
    fps,
    loop,
    frames: frames.map((f) => ({ name: f.name, duration, width: f.width, height: f.height })),
    sheet: { columns: sheet.columns, cellWidth: sheet.cellWidth, cellHeight: sheet.cellHeight },
  }
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(",")
  const mime = /data:([^;]+)/.exec(head)?.[1] || "application/octet-stream"
  const bin = atob(body)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function exportPackedPng(frames: SeqFrame[], filename = "sequence-sheet.png") {
  const sheet = await packSheet(frames)
  downloadBlob(dataUrlToBlob(sheet.src), filename)
  return sheet
}

export async function exportZip(frames: SeqFrame[], filename = "sequence-frames.zip") {
  const JSZip = (await import("jszip")).default
  const zip = new JSZip()
  for (let i = 0; i < frames.length; i++) {
    zip.file(zipFrameName(i, frames[i].name), dataUrlToBlob(frames[i].src))
  }
  const blob = await zip.generateAsync({ type: "blob" })
  downloadBlob(blob, filename)
}

export async function exportGif(
  frames: SeqFrame[],
  fps: number,
  loop: boolean,
  filename = "sequence.gif",
) {
  const { GIFEncoder, quantize, applyPalette } = await import("gifenc")
  const delay = Math.max(20, Math.round(1000 / Math.max(1, fps)))
  const gif = GIFEncoder()
  const gw = Math.max(...frames.map((f) => f.width), 1)
  const gh = Math.max(...frames.map((f) => f.height), 1)
  for (let i = 0; i < frames.length; i++) {
    const canvas = document.createElement("canvas")
    canvas.width = gw
    canvas.height = gh
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("2d context unavailable")
    ctx.clearRect(0, 0, gw, gh)
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error("gif frame load failed"))
      el.src = frames[i].src
    })
    ctx.drawImage(img, Math.floor((gw - frames[i].width) / 2), Math.floor((gh - frames[i].height) / 2))
    const pixels = ctx.getImageData(0, 0, gw, gh).data
    const palette = quantize(pixels, 256, { format: "rgba4444" })
    const index = applyPalette(pixels, palette, "rgba4444")
    const opts: Record<string, unknown> = {
      palette,
      delay,
      transparent: true,
    }
    if (i === 0) opts.repeat = loop ? 0 : -1
    gif.writeFrame(index, gw, gh, opts)
  }
  gif.finish()
  downloadBlob(new Blob([gif.bytes()], { type: "image/gif" }), filename)
}

export async function exportGodot(
  frames: SeqFrame[],
  fps: number,
  loop: boolean,
  name = "sequence",
) {
  const sheet = await packSheet(frames)
  const json = buildGodotJson(name, fps, loop, frames, {
    columns: sheet.columns,
    cellWidth: sheet.cellWidth,
    cellHeight: sheet.cellHeight,
  })
  downloadBlob(new Blob([JSON.stringify(json, null, 2)], { type: "application/json" }), `${name}.json`)
  downloadBlob(dataUrlToBlob(sheet.src), `${name}-sheet.png`)
  return { json, sheet }
}

export async function filesToFrames(files: File[]): Promise<SeqFrame[]> {
  const out: SeqFrame[] = []
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue
    const src = await readFileDataUrl(file)
    const size = await probeImageSize(src)
    out.push({
      id: newFrameId(),
      name: file.name.replace(/\.[^.]+$/, "") || "frame",
      src,
      width: size.width,
      height: size.height,
    })
  }
  return out
}

export function readFileDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error || new Error("read failed"))
    reader.readAsDataURL(file)
  })
}

export function probeImageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height })
    img.onerror = () => reject(new Error("image probe failed"))
    img.src = src
  })
}
