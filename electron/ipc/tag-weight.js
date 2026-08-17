const EPSILON = 0.001
const NAI_CLASSIC_STEP = 1.05

function normalizeWeight(weight) {
  const w = Number(weight)
  if (!Number.isFinite(w) || Math.abs(w - 1) < EPSILON) return 1
  return Math.round(w * 100) / 100
}

function formatWeight(weight) {
  const w = normalizeWeight(weight)
  if (w === 1) return null
  return Number.isInteger(w) ? String(w) : w.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

function serializeTag(tag, weight, format = 'sd') {
  const name = String(tag).trim()
  const w = normalizeWeight(weight)
  if (w === 1 || !name) return name
  if (format === 'naiNumeric') {
    return `${formatWeight(w)}::${name}::`
  }
  if (format === 'naiClassic') {
    const repeats = Math.max(1, Math.round(Math.abs(Math.log(w) / Math.log(NAI_CLASSIC_STEP))))
    const open = w > 1 ? '{' : '['
    const close = w > 1 ? '}' : ']'
    return open.repeat(repeats) + name + close.repeat(repeats)
  }
  const value = formatWeight(w)
  if (!value) return name
  return w > 1 ? `(${name}:${value})` : `[${name}:${value}]`
}

function serializeWeightedCaption(tags) {
  return (tags || [])
    .map((tag) => (typeof tag === 'string' ? tag : serializeTag(tag.tag, tag.weight)))
    .filter(Boolean)
    .join(', ')
}

function parseWeightedTag(text) {
  const piece = String(text || '').trim()
  if (!piece) return null

  let name = piece
  let weight = 1
  let matched = piece.match(/^\((.+):([\d.]+)\)$/)
  if (!matched) matched = piece.match(/^\[(.+):([\d.]+)\]$/)
  if (matched) {
    name = matched[1].trim()
    const parsed = Number(matched[2])
    if (name && Number.isFinite(parsed) && parsed > 0) weight = normalizeWeight(parsed)
  }
  return { tag: name, weight }
}

function parseWeightedCaption(text) {
  const seen = new Set()
  const tags = []
  for (const piece of String(text || '').split(/[，,]+/)) {
    const parsed = parseWeightedTag(piece)
    if (!parsed || !parsed.tag) continue
    const key = parsed.tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    tags.push(parsed)
  }
  return tags
}

function parseNaiNumericTag(text) {
  const piece = String(text || '').trim()
  if (!piece) return null
  const matched = piece.match(/^([\d.]+)::(.+)::$/)
  if (matched) {
    const tag = matched[2].trim()
    const weight = Number(matched[1])
    if (tag && Number.isFinite(weight) && weight > 0) {
      return { tag, weight: normalizeWeight(weight) }
    }
  }
  return { tag: piece, weight: 1 }
}

function parseNaiClassicTag(text) {
  const piece = String(text || '').trim()
  if (!piece) return null

  const brace = piece.match(/^\{+/)
  if (brace && piece.endsWith('}'.repeat(brace[0].length))) {
    const inner = piece.slice(brace[0].length, -brace[0].length).trim()
    if (inner) return { tag: inner, weight: normalizeWeight(Math.pow(NAI_CLASSIC_STEP, brace[0].length)) }
  }

  const bracket = piece.match(/^\[+/)
  if (bracket && piece.endsWith(']'.repeat(bracket[0].length))) {
    const inner = piece.slice(bracket[0].length, -bracket[0].length).trim()
    if (inner) return { tag: inner, weight: normalizeWeight(Math.pow(NAI_CLASSIC_STEP, -bracket[0].length)) }
  }

  return { tag: piece, weight: 1 }
}

function parseWeightedTagByFormat(text, format) {
  if (format === 'naiNumeric') return parseNaiNumericTag(text)
  if (format === 'naiClassic') return parseNaiClassicTag(text)
  return parseWeightedTag(text)
}

function convertWeightedCaption(text, from = 'sd', to = 'naiNumeric') {
  return String(text || '')
    .split(/[，,]+/)
    .map((piece) => {
      const parsed = parseWeightedTagByFormat(piece, from)
      if (!parsed || !parsed.tag) return piece.trim()
      return serializeTag(parsed.tag, parsed.weight, to)
    })
    .filter(Boolean)
    .join(', ')
}

module.exports = {
  normalizeWeight,
  serializeTag,
  serializeWeightedCaption,
  parseWeightedTag,
  parseWeightedCaption,
  convertWeightedCaption,
}
