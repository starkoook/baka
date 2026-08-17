const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

function parseColor(value) {
  if (typeof value === 'string' && /^#?[0-9a-f]{6}$/i.test(value)) {
    const hex = value.replace('#', '')
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      alpha: 1,
    }
  }
  if (typeof value === 'string' && /^#?[0-9a-f]{8}$/i.test(value)) {
    const hex = value.replace('#', '')
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      alpha: parseInt(hex.slice(6, 8), 16) / 255,
    }
  }
  if (Array.isArray(value)) {
    return { r: Number(value[0]) || 0, g: Number(value[1]) || 0, b: Number(value[2]) || 0, alpha: Number(value[3] ?? 1) }
  }
  return { r: 255, g: 255, b: 255, alpha: 1 }
}

function colorToSharp(value) {
  const color = parseColor(value)
  return { r: color.r, g: color.g, b: color.b, alpha: color.alpha }
}

function outputFormatFor(outputPath, inputPath) {
  const ext = path.extname(outputPath || '').toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') return 'jpeg'
  if (ext === '.webp') return 'webp'
  if (ext === '.png') return 'png'
  return path.extname(inputPath || '').toLowerCase() === '.png' ? 'png' : 'jpeg'
}

async function writeSharpBuffer(buffer, outputPath, inputPath) {
  const format = outputFormatFor(outputPath, inputPath)
  let pipeline = sharp(buffer)
  if (format === 'png') pipeline = pipeline.png()
  else if (format === 'webp') pipeline = pipeline.webp()
  else pipeline = pipeline.jpeg({ quality: 92 })
  const result = await pipeline.toBuffer()
  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, result)
  }
  return result
}

async function readRawRgba(inputPath) {
  return sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
}

function sampleBackgroundRgb(data, info) {
  const width = info.width
  const height = info.height
  const channels = info.channels || 4
  const samples = []
  const step = Math.max(1, Math.floor(Math.min(width, height) / 24))

  for (let x = 0; x < width; x += step) {
    const top = (x * channels)
    const bottom = ((height - 1) * width + x) * channels
    if (data[top + 3] > 0) samples.push([data[top], data[top + 1], data[top + 2]])
    if (data[bottom + 3] > 0) samples.push([data[bottom], data[bottom + 1], data[bottom + 2]])
  }
  for (let y = 0; y < height; y += step) {
    const left = (y * width) * channels
    const right = (y * width + width - 1) * channels
    if (data[left + 3] > 0) samples.push([data[left], data[left + 1], data[left + 2]])
    if (data[right + 3] > 0) samples.push([data[right], data[right + 1], data[right + 2]])
  }

  if (!samples.length) return { r: 255, g: 255, b: 255 }
  const sum = samples.reduce((acc, pixel) => {
    acc[0] += pixel[0]
    acc[1] += pixel[1]
    acc[2] += pixel[2]
    return acc
  }, [0, 0, 0])
  return {
    r: sum[0] / samples.length,
    g: sum[1] / samples.length,
    b: sum[2] / samples.length,
  }
}

async function removeBackground(inputPath, { tolerance = 45, feather = 2, outputPath = '' } = {}) {
  const { data, info } = await readRawRgba(inputPath)
  const channels = info.channels || 4
  const background = sampleBackgroundRgb(data, info)
  const toleranceSq = (Number(tolerance) || 0) ** 2 * 3
  const featherSq = toleranceSq + Math.max(0, Number(feather) || 0) ** 2 * 3

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const a = data[i + 3]
    if (a === 0) continue

    const distance = (r - background.r) ** 2 + (g - background.g) ** 2 + (b - background.b) ** 2
    if (distance <= toleranceSq) {
      data[i + 3] = 0
    } else if (distance <= featherSq) {
      const t = (Math.sqrt(distance) - Math.sqrt(toleranceSq)) / Math.max(1, Math.sqrt(featherSq) - Math.sqrt(toleranceSq))
      data[i + 3] = Math.max(0, Math.min(255, Math.round(a * t)))
    }
  }

  const buffer = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer()
  const result = await writeSharpBuffer(buffer, outputPath, inputPath)
  return { buffer: result, width: info.width, height: info.height }
}

async function replaceTransparentBackground(inputPath, { color = '#ffffff', outputPath = '' } = {}) {
  const background = colorToSharp(color)
  const buffer = await sharp(inputPath).flatten({ background }).toBuffer()
  const result = await writeSharpBuffer(buffer, outputPath, inputPath)
  const meta = await sharp(result).metadata()
  return { buffer: result, width: meta.width || 0, height: meta.height || 0 }
}

async function editImage(inputPath, operation = {}, outputPath = '') {
  let pipeline = sharp(inputPath)

  if (operation.crop) {
    pipeline = pipeline.extract({
      left: Math.max(0, Math.round(Number(operation.crop.left) || 0)),
      top: Math.max(0, Math.round(Number(operation.crop.top) || 0)),
      width: Math.max(1, Math.round(Number(operation.crop.width) || 1)),
      height: Math.max(1, Math.round(Number(operation.crop.height) || 1)),
    })
  }
  if (operation.resize?.width || operation.resize?.height) {
    pipeline = pipeline.resize({
      width: operation.resize.width ? Math.max(1, Math.round(Number(operation.resize.width))) : undefined,
      height: operation.resize.height ? Math.max(1, Math.round(Number(operation.resize.height))) : undefined,
      fit: operation.resize.fit || 'inside',
      withoutEnlargement: Boolean(operation.resize.withoutEnlargement),
    })
  }
  if (operation.rotate) {
    pipeline = pipeline.rotate(Number(operation.rotate) || 0, { background: operation.rotateBackground || { r: 0, g: 0, b: 0, alpha: 0 } })
  }
  if (operation.flip) pipeline = pipeline.flip()
  if (operation.flop) pipeline = pipeline.flop()
  if (operation.grayscale) pipeline = pipeline.grayscale()
  if (operation.modulate) {
    pipeline = pipeline.modulate({
      brightness: operation.modulate.brightness,
      saturation: operation.modulate.saturation,
      hue: operation.modulate.hue,
    })
  }

  const buffer = await pipeline.toBuffer()
  const result = await writeSharpBuffer(buffer, outputPath, inputPath)
  const meta = await sharp(result).metadata()
  return { buffer: result, width: meta.width || 0, height: meta.height || 0 }
}

async function perceptualHash(inputPath) {
  const { data, info } = await sharp(inputPath)
    .resize(16, 16, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const pixels = new Uint8Array(data)
  let total = 0
  for (let i = 0; i < pixels.length; i++) total += pixels[i]
  const average = total / pixels.length
  let hash = 0n
  for (let i = 0; i < pixels.length; i++) {
    hash = (hash << 1n) | (pixels[i] >= average ? 1n : 0n)
  }
  return hash.toString(16).padStart(64, '0')
}

function hammingDistance(a, b) {
  let count = 0
  for (let i = 0; i < a.length; i++) {
    const diff = parseInt(a[i], 16) ^ parseInt(b[i], 16)
    count += [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4][diff]
  }
  return count
}

async function findSimilarImages(inputPaths, { threshold = 8 } = {}) {
  const records = []
  for (const inputPath of inputPaths || []) {
    try {
      const hash = await perceptualHash(inputPath)
      const meta = await sharp(inputPath).metadata()
      records.push({ path: inputPath, hash, width: meta.width || 0, height: meta.height || 0 })
    } catch (_) {
      records.push({ path: inputPath, hash: '', width: 0, height: 0, error: 'unreadable' })
    }
  }

  const visited = new Set()
  const groups = []
  for (let i = 0; i < records.length; i++) {
    if (visited.has(i) || !records[i].hash) continue
    const group = [records[i]]
    visited.add(i)
    for (let j = i + 1; j < records.length; j++) {
      if (visited.has(j) || !records[j].hash) continue
      if (hammingDistance(records[i].hash, records[j].hash) <= threshold) {
        group.push(records[j])
        visited.add(j)
      }
    }
    if (group.length > 1) groups.push(group)
  }
  return { groups, total: records.length, compared: records.filter((record) => record.hash).length }
}

async function scanBadImages(inputPaths) {
  const results = []
  for (const inputPath of inputPaths || []) {
    try {
      const stat = fs.statSync(inputPath)
      const image = sharp(inputPath)
      const [meta, stats] = await Promise.all([image.metadata(), image.stats()])
      const issues = []
      if (!meta.width || !meta.height) issues.push('无法读取尺寸')
      if (stat.size < 1024) issues.push('文件过小')
      if (meta.width && meta.width < 64 || meta.height && meta.height < 64) issues.push('分辨率过低')
      if (stats && typeof stats.entropy === 'number' && stats.entropy < 0.08) issues.push('图像内容可能为空')
      results.push({
        path: inputPath,
        status: issues.length ? 'bad' : 'ok',
        issues,
        width: meta.width || 0,
        height: meta.height || 0,
        size: stat.size,
        entropy: stats?.entropy ?? null,
      })
    } catch (error) {
      results.push({ path: inputPath, status: 'bad', issues: [error.message || '无法读取'], width: 0, height: 0, size: 0, entropy: null })
    }
  }
  return results
}

async function removeBackgroundAi(inputPath, { modelPath = '', outputPath = '' } = {}) {
  if (!modelPath || !fs.existsSync(modelPath)) {
    throw new Error('还没有 AI 抠图模型，请先下载。')
  }
  const ort = require('onnxruntime-node')
  const session = await ort.InferenceSession.create(modelPath)

  const inputMeta = await sharp(inputPath).metadata()
  const { data, info } = await sharp(inputPath)
    .removeAlpha()
    .resize(1024, 1024, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true })

  const sourceChannels = info.channels || 3
  const pixelCount = 1024 * 1024
  const inputTensor = new Float32Array(3 * pixelCount)
  for (let i = 0; i < pixelCount; i++) {
    const offset = i * sourceChannels
    inputTensor[i] = data[offset] / 255
    inputTensor[pixelCount + i] = data[offset + 1] / 255
    inputTensor[2 * pixelCount + i] = data[offset + 2] / 255
  }

  const tensor = new ort.Tensor('float32', inputTensor, [1, 3, 1024, 1024])
  const feeds = { [session.inputNames[0]]: tensor }
  const output = await session.run(feeds)
  const maskFloat = output[session.outputNames[0]].data

  const maskU8 = new Uint8Array(pixelCount)
  for (let i = 0; i < pixelCount; i++) {
    maskU8[i] = Math.round(Math.min(1, Math.max(0, maskFloat[i])) * 255)
  }

  const width = inputMeta.width || 0
  const height = inputMeta.height || 0
  const maskBuffer = await sharp(Buffer.from(maskU8), { raw: { width: 1024, height: 1024, channels: 1 } })
    .resize(width, height, { fit: 'fill' })
    .raw()
    .toBuffer()

  const original = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const outputData = Buffer.from(original.data)
  const originalChannels = original.info.channels || 4
  const originalPixels = width * height
  for (let i = 0; i < originalPixels; i++) {
    outputData[i * originalChannels + 3] = maskBuffer[i]
  }

  const buffer = await sharp(outputData, { raw: { width, height, channels: originalChannels } }).png().toBuffer()
  const result = await writeSharpBuffer(buffer, outputPath, inputPath)
  return { buffer: result, width, height }
}

module.exports = {
  colorToSharp,
  editImage,
  findSimilarImages,
  hammingDistance,
  parseColor,
  perceptualHash,
  removeBackground,
  removeBackgroundAi,
  replaceTransparentBackground,
  scanBadImages,
}
