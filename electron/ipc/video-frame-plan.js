function parseFps(value) {
  const text = String(value || '').trim()
  if (!text || text === '0/0') return 0
  if (text.includes('/')) {
    const [a, b] = text.split('/').map(Number)
    return a && b ? a / b : 0
  }
  const n = Number(text)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function distributedFrameIndexes(total, count) {
  const n = Math.max(0, Math.min(total, count))
  if (total <= 0 || n === 0) return []
  if (n === 1) return [Math.floor((total - 1) / 2)]
  const indexes = []
  for (let i = 0; i < n; i++) {
    indexes.push(Math.min(total - 1, Math.floor((i * (total - 1)) / (n - 1))))
  }
  return [...new Set(indexes)]
}

function regionalFrameIndexes(total, count) {
  if (total <= 0 || count <= 0) return []
  const regions = Math.min(count, total)
  const indexes = new Set()
  for (let r = 0; r < regions; r++) {
    const start = Math.floor((r * total) / regions)
    const end = Math.max(start + 1, Math.floor(((r + 1) * total) / regions))
    indexes.add(Math.min(total - 1, Math.floor((start + end - 1) / 2)))
  }
  return [...indexes].sort((a, b) => a - b)
}

function randomPercentFrameIndexes(total, percent, seed = Date.now()) {
  if (total <= 0) return []
  const ratio = Math.max(0, Math.min(100, percent)) / 100
  const count = Math.max(1, Math.floor(total * ratio))
  let state = seed >>> 0
  const next = () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
  const indexes = new Set()
  while (indexes.size < count) {
    indexes.add(Math.floor(next() * total))
  }
  return [...indexes].sort((a, b) => a - b)
}

function buildSelectFilter(indexes) {
  const unique = [...new Set(indexes)].filter(i => Number.isInteger(i) && i >= 0)
  if (unique.length === 0) return ''
  return unique.map(i => `eq(n,${i})`).join('+')
}

module.exports = { parseFps, distributedFrameIndexes, regionalFrameIndexes, randomPercentFrameIndexes, buildSelectFilter }
