const { parseCsvLine } = require('./tag-catalog')

function resolveInputLayout(dims) {
  if (!Array.isArray(dims) || dims.length !== 4) {
    throw new Error('Unsupported tagger input shape')
  }
  if (dims[1] === 3) return 'nchw'
  if (dims[3] === 3) return 'nhwc'
  throw new Error('Unsupported tagger input shape')
}

function selectOutputNames(outputMetadata, expectedTagCount) {
  const entries = Object.entries(outputMetadata || {}).map(([name, dims]) => {
    const dimensions = Array.isArray(dims) ? dims : (dims?.dims || [])
    const matchesTagCount = dimensions.some((dim) => dim === expectedTagCount)
    const positive = dimensions.filter((dim) => Number.isFinite(dim) && dim > 0)
    const knownSize = positive.length > 0 ? positive.reduce((acc, dim) => acc * dim, 1) : -1
    return { name, matchesTagCount, knownSize }
  })

  entries.sort((a, b) => {
    if (a.matchesTagCount !== b.matchesTagCount) return a.matchesTagCount ? -1 : 1
    return b.knownSize - a.knownSize
  })

  return entries.map((entry) => entry.name)
}

function sigmoid(value) {
  if (!Number.isFinite(value)) return 0.5
  if (value >= 0) {
    const exp = Math.exp(-value)
    return 1 / (1 + exp)
  }
  const exp = Math.exp(value)
  return exp / (1 + exp)
}

function applySigmoidIfNeeded(values) {
  const numbers = values ? Array.from(values) : []
  if (numbers.length === 0) return numbers
  const looksLikeProbability = numbers.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)
  if (looksLikeProbability) return numbers
  return numbers.map(sigmoid)
}

function parseTagLabels(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length === 0) return []

  let start = 0
  let header = false
  if (/tag_id/.test(lines[0]) && /name/.test(lines[0])) {
    header = true
    start = 1
  }

  const labels = []
  for (let i = start; i < lines.length; i++) {
    const parts = parseCsvLine(lines[i])
    if (parts.length === 0) continue

    const name = parts[header ? 1 : 0].trim()
    if (!name) continue

    let category = 0
    if (header) {
      category = Number.parseInt(parts[2], 10) || 0
    } else if (parts.length >= 2 && /^\d+$/.test(parts[1])) {
      category = Number.parseInt(parts[1], 10) || 0
    }

    labels.push({ name, category })
  }

  return labels
}

module.exports = { resolveInputLayout, selectOutputNames, applySigmoidIfNeeded, parseTagLabels }
