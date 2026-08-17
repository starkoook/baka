function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function applyBrightnessContrast(data, width, height, effect) {
  const brightness = Number(effect.value1 || 0) * 255
  const scale = 1 + Number(effect.value2 || 0)
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4
    for (let c = 0; c < 3; c++) {
      data[offset + c] = clampByte(128 + (data[offset + c] + brightness - 128) * scale)
    }
  }
}

function applyPixelate(data, width, height, effect) {
  const block = Math.max(1, Math.round(Number(effect.value1 || 8)))
  const src = new Uint8Array(data)
  for (let by = 0; by < height; by += block) {
    for (let bx = 0; bx < width; bx += block) {
      let r = 0
      let g = 0
      let b = 0
      let count = 0
      const maxY = Math.min(height, by + block)
      const maxX = Math.min(width, bx + block)
      for (let y = by; y < maxY; y++) {
        for (let x = bx; x < maxX; x++) {
          const offset = (y * width + x) * 4
          r += src[offset]
          g += src[offset + 1]
          b += src[offset + 2]
          count++
        }
      }
      const avgR = Math.round(r / count)
      const avgG = Math.round(g / count)
      const avgB = Math.round(b / count)
      for (let y = by; y < maxY; y++) {
        for (let x = bx; x < maxX; x++) {
          const offset = (y * width + x) * 4
          data[offset] = avgR
          data[offset + 1] = avgG
          data[offset + 2] = avgB
        }
      }
    }
  }
}

function parseHexColor(text) {
  const hex = String(text || '').replace('#', '')
  const normalized = hex.length === 3
    ? hex.split('').map((ch) => ch + ch).join('')
    : hex
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return { r: 255, g: 255, b: 255 }
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  }
}

function applySolidBlock(data, width, height, effect) {
  const color = parseHexColor(effect.textValue)
  const blockW = Math.max(1, Math.round(width * Number(effect.value3 || 1)))
  const blockH = Math.max(1, Math.round(height * Number(effect.value4 || 1)))
  const left = Math.round(width * Number(effect.value1 ?? 0.5) - blockW / 2)
  const top = Math.round(height * Number(effect.value2 ?? 0.5) - blockH / 2)
  for (let y = top; y < Math.min(height, top + blockH); y++) {
    for (let x = left; x < Math.min(width, left + blockW); x++) {
      const offset = (Math.max(0, y) * width + Math.max(0, x)) * 4
      data[offset] = color.r
      data[offset + 1] = color.g
      data[offset + 2] = color.b
    }
  }
}

function applySaturationVibrance(data, width, height, effect) {
  const saturation = 1 + Number(effect.value1 || 0)
  const vibrance = Number(effect.value2 || 0)
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4
    const r = data[offset]
    const g = data[offset + 1]
    const b = data[offset + 2]
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const luma = 0.299 * r + 0.587 * g + 0.114 * b
    const vibranceScale = vibrance * (1 - (max - min) / 255)
    const scale = saturation + vibranceScale
    data[offset] = clampByte(luma + (r - luma) * scale)
    data[offset + 1] = clampByte(luma + (g - luma) * scale)
    data[offset + 2] = clampByte(luma + (b - luma) * scale)
  }
}

function applyTemperatureTint(data, width, height, effect) {
  const temperature = Number(effect.value1 || 0) * 255
  const tint = Number(effect.value2 || 0) * 255
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4
    data[offset] = clampByte(data[offset] + temperature)
    data[offset + 1] = clampByte(data[offset + 1] + tint)
    data[offset + 2] = clampByte(data[offset + 2] - temperature)
  }
}

function applyGamma(data, width, height, effect) {
  const gamma = Math.max(0.01, Number(effect.value1 || 1))
  const inv = 1 / gamma
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4
    for (let c = 0; c < 3; c++) {
      data[offset + c] = clampByte(Math.pow(data[offset + c] / 255, inv) * 255)
    }
  }
}

function applyVignette(data, width, height, effect) {
  const strength = Number(effect.value1 || 0)
  const feather = Number(effect.value2 ?? 0.5)
  const cx = width / 2
  const cy = height / 2
  const maxDist = Math.sqrt(cx * cx + cy * cy)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx
      const dy = y - cy
      const dist = Math.sqrt(dx * dx + dy * dy) / Math.max(1, maxDist)
      const start = Math.max(0, Math.min(1, 1 - feather))
      const t = Math.max(0, Math.min(1, (dist - start) / Math.max(0.001, feather)))
      const factor = 1 - strength * t
      const offset = (y * width + x) * 4
      data[offset] = clampByte(data[offset] * factor)
      data[offset + 1] = clampByte(data[offset + 1] * factor)
      data[offset + 2] = clampByte(data[offset + 2] * factor)
    }
  }
}

function createSeededRandom(seed) {
  let state = Number(seed) >>> 0
  return () => {
    state += 0x6d2b79f5
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function applyNoise(data, width, height, effect) {
  const mono = Number(effect.value1 || 0) * 255
  const color = Number(effect.value2 || 0) * 255
  const random = createSeededRandom(Number(effect.value3 || 0))
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4
    const base = (random() - 0.5) * 2 * mono
    for (let c = 0; c < 3; c++) {
      const channelNoise = color ? (random() - 0.5) * 2 * color : 0
      data[offset + c] = clampByte(data[offset + c] + base + channelNoise)
    }
  }
}

function applyScanline(data, width, height, effect) {
  const lineWidth = Math.max(1, Number(effect.value1 || 1))
  const spacing = Math.max(1, Number(effect.value2 || 3))
  const opacity = Number(effect.value5 ?? 0.5)
  const period = lineWidth + spacing
  for (let y = 0; y < height; y++) {
    const mod = y % period
    if (mod >= lineWidth) continue
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4
      const factor = 1 - opacity
      data[offset] = clampByte(data[offset] * factor)
      data[offset + 1] = clampByte(data[offset + 1] * factor)
      data[offset + 2] = clampByte(data[offset + 2] * factor)
    }
  }
}

function smoothstep(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / Math.max(0.000001, edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function boxBlurRgb(src, width, height, radius) {
  const r = Math.max(1, Math.round(radius))
  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sr = 0
      let sg = 0
      let sb = 0
      let count = 0
      for (let dx = -r; dx <= r; dx++) {
        const xx = Math.max(0, Math.min(width - 1, x + dx))
        const offset = (y * width + xx) * 3
        sr += src[offset]
        sg += src[offset + 1]
        sb += src[offset + 2]
        count++
      }
      const offset = (y * width + x) * 3
      tmp[offset] = sr / count
      tmp[offset + 1] = sg / count
      tmp[offset + 2] = sb / count
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sr = 0
      let sg = 0
      let sb = 0
      let count = 0
      for (let dy = -r; dy <= r; dy++) {
        const yy = Math.max(0, Math.min(height - 1, y + dy))
        const offset = (yy * width + x) * 3
        sr += tmp[offset]
        sg += tmp[offset + 1]
        sb += tmp[offset + 2]
        count++
      }
      const offset = (y * width + x) * 3
      out[offset] = sr / count
      out[offset + 1] = sg / count
      out[offset + 2] = sb / count
    }
  }

  return out
}

function applyGlow(data, width, height, effect) {
  const threshold = Number(effect.value1 ?? 0.5)
  const strength = Number(effect.value2 ?? 0.5)
  const radius = Number(effect.value3 || 8)
  const glow = new Float32Array(width * height * 3)

  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4]
    const g = data[i * 4 + 1]
    const b = data[i * 4 + 2]
    const max = Math.max(r, g, b) / 255
    const contribution = smoothstep(threshold, Math.min(1, threshold + 0.25), max)
    glow[i * 3] = r * contribution
    glow[i * 3 + 1] = g * contribution
    glow[i * 3 + 2] = b * contribution
  }

  const blurred = boxBlurRgb(glow, width, height, radius)
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = clampByte(data[i * 4] + blurred[i * 3] * strength)
    data[i * 4 + 1] = clampByte(data[i * 4 + 1] + blurred[i * 3 + 1] * strength)
    data[i * 4 + 2] = clampByte(data[i * 4 + 2] + blurred[i * 3 + 2] * strength)
  }
}

function applyRadialBlur(data, width, height, effect) {
  const strength = Number(effect.value1 ?? 0.5)
  const cx = width * Number(effect.value2 ?? 0.5)
  const cy = height * Number(effect.value3 ?? 0.5)
  const samples = Math.max(2, Math.round(Number(effect.value4 || 16)))
  const src = new Uint8Array(data)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      let r = 0
      let g = 0
      let b = 0
      for (let i = 0; i < samples; i++) {
        const f = 1 - strength * (i / (samples - 1))
        const sx = Math.max(0, Math.min(width - 1, Math.round(cx + dx * f)))
        const sy = Math.max(0, Math.min(height - 1, Math.round(cy + dy * f)))
        const offset = (sy * width + sx) * 4
        r += src[offset]
        g += src[offset + 1]
        b += src[offset + 2]
      }
      const offset = (y * width + x) * 4
      data[offset] = clampByte(r / samples)
      data[offset + 1] = clampByte(g / samples)
      data[offset + 2] = clampByte(b / samples)
    }
  }
}

function sampleChannel(src, width, height, channel, x, y) {
  const sx = Math.max(0, Math.min(width - 1, Math.round(x)))
  const sy = Math.max(0, Math.min(height - 1, Math.round(y)))
  return src[(sy * width + sx) * 4 + channel]
}

function applyChromaticAberration(data, width, height, effect) {
  const amount = Number(effect.value1 ?? 0)
  const cx = width / 2
  const cy = height / 2
  const maxDist = Math.max(1, Math.sqrt(cx * cx + cy * cy))
  const src = new Uint8Array(data)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      const shift = amount * (dist / maxDist)
      const dirX = dist > 0 ? dx / dist : 0
      const dirY = dist > 0 ? dy / dist : 0
      const offset = (y * width + x) * 4
      data[offset] = sampleChannel(src, width, height, 0, x + dirX * shift, y + dirY * shift)
      data[offset + 2] = sampleChannel(src, width, height, 2, x - dirX * shift, y - dirY * shift)
    }
  }
}

function applyJpegLoss(data, width, height, effect) {
  const loss = Math.max(0, Math.min(1, Number(effect.value1 ?? 0)))
  const block = Math.max(1, Math.round(Number(effect.value3 || 8)))
  const src = new Uint8Array(data)

  for (let by = 0; by < height; by += block) {
    for (let bx = 0; bx < width; bx += block) {
      let r = 0
      let g = 0
      let b = 0
      let count = 0
      const maxY = Math.min(height, by + block)
      const maxX = Math.min(width, bx + block)
      for (let y = by; y < maxY; y++) {
        for (let x = bx; x < maxX; x++) {
          const offset = (y * width + x) * 4
          r += src[offset]
          g += src[offset + 1]
          b += src[offset + 2]
          count++
        }
      }
      const avgR = r / count
      const avgG = g / count
      const avgB = b / count
      for (let y = by; y < maxY; y++) {
        for (let x = bx; x < maxX; x++) {
          const offset = (y * width + x) * 4
          data[offset] = clampByte(src[offset] + (avgR - src[offset]) * loss)
          data[offset + 1] = clampByte(src[offset + 1] + (avgG - src[offset + 1]) * loss)
          data[offset + 2] = clampByte(src[offset + 2] + (avgB - src[offset + 2]) * loss)
        }
      }
    }
  }
}

const EFFECT_HANDLERS = {
  brightnessContrast: applyBrightnessContrast,
  saturationVibrance: applySaturationVibrance,
  temperatureTint: applyTemperatureTint,
  gamma: applyGamma,
  vignette: applyVignette,
  noise: applyNoise,
  pixelate: applyPixelate,
  solidBlock: applySolidBlock,
  scanline: applyScanline,
  glow: applyGlow,
  radialBlur: applyRadialBlur,
  chromaticAberration: applyChromaticAberration,
  jpegLoss: applyJpegLoss,
}

function applyEffectChain(data, width, height, effects) {
  const out = new Uint8Array(data)
  for (const effect of effects || []) {
    const handler = EFFECT_HANDLERS[effect?.type]
    if (handler) handler(out, width, height, effect)
  }
  return out
}

module.exports = { applyEffectChain, EFFECT_HANDLERS }
