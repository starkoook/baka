const fs = require('fs')
const path = require('path')
const { serializeTag } = require('./tag-weight')

const TOKEN_REGEX = /__(.+?)__/g

function normalizeWildcardName(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/{2,}/g, '/')
}

function parseWildcardOptions(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const sep = line.lastIndexOf('|')
      if (sep > 0 && sep < line.length - 1) {
        const tail = line.slice(sep + 1).trim()
        const weight = Number(tail)
        if (Number.isFinite(weight)) {
          return { text: line.slice(0, sep).trim(), weight }
        }
      }
      return { text: line, weight: 1 }
    })
    .filter((option) => option.text)
}

function createSeededRandom(seed) {
  let state = Number(seed) >>> 0
  return function next() {
    state += 0x6d2b79f5
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

class WildcardEngine {
  constructor(entries = {}) {
    this.entries = entries
    this._byName = new Map()
    for (const [name, options] of Object.entries(entries)) {
      this._byName.set(name.toLowerCase(), options)
    }
  }

  static async load(rootDir) {
    const entries = {}
    const warnings = []
    if (!rootDir || !fs.existsSync(rootDir)) return new WildcardEngine(entries)

    const files = []
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (entry.isFile() && entry.name.toLowerCase().endsWith('.txt')) files.push(full)
      }
    }
    walk(rootDir)

    for (const file of files) {
      const relative = path.relative(rootDir, file)
      const name = normalizeWildcardName(relative.replace(/\.txt$/i, ''))
      if (!name) continue
      if (entries[name]) {
        warnings.push(`Duplicate wildcard name: ${name}`)
        continue
      }
      entries[name] = parseWildcardOptions(fs.readFileSync(file, 'utf8'))
    }

    return new WildcardEngine(entries)
  }

  _options(name, warnings) {
    const normalized = normalizeWildcardName(name)
    const options = this.entries[normalized] || this._byName.get(normalized.toLowerCase())
    if (!options || options.length === 0) {
      warnings.push(`Missing or empty wildcard: ${normalized}`)
      return null
    }
    return options
  }

  _pickOne(options, random) {
    return options[Math.floor(random() * options.length)]
  }

  _pickMultiple(options, count, random) {
    const pool = options.map((_, index) => index)
    const picked = []
    for (let i = 0; i < count; i++) {
      if (pool.length === 0) {
        for (let j = 0; j < options.length; j++) pool.push(j)
      }
      const index = Math.floor(random() * pool.length)
      picked.push(options[pool.splice(index, 1)[0]])
    }
    return picked
  }

  _render(option, weightFormat) {
    return serializeTag(option.text, option.weight, weightFormat)
  }

  _resolveToken(body, random, weightFormat, variables, warnings, logs) {
    if (body.startsWith('@')) {
      const name = body.slice(1).trim()
      if (variables[name] != null) return variables[name]
      warnings.push(`Undefined wildcard variable: @${name}`)
      return `__${body}__`
    }

    let name = body
    let suffix = ''
    const atIndex = body.lastIndexOf('@')
    if (atIndex > 0 && atIndex < body.length - 1) {
      name = body.slice(0, atIndex).trim()
      suffix = body.slice(atIndex + 1).trim()
    }

    const options = this._options(name, warnings)
    if (!options) return `__${body}__`

    const count = suffix && /^\d+$/.test(suffix) ? Number(suffix) : 0
    if (count > 0) {
      const picks = this._pickMultiple(options, count, random)
      const rendered = picks.map((option) => this._render(option, weightFormat))
      logs.push(`${normalizeWildcardName(name)} x${count}`)
      return rendered.join(', ')
    }

    const selected = this._pickOne(options, random)
    const rendered = this._render(selected, weightFormat)
    if (suffix) variables[suffix] = rendered
    logs.push(suffix ? `${normalizeWildcardName(name)} -> @${suffix}` : normalizeWildcardName(name))
    return rendered
  }

  expand(text, options = {}) {
    const seed = Number(options.seed ?? 0)
    const weightFormat = options.weightFormat || 'naiNumeric'
    const variables = options.variables && typeof options.variables === 'object' ? options.variables : {}
    const warnings = []
    const logs = []
    const random = createSeededRandom(seed)

    const result = String(text || '').replace(TOKEN_REGEX, (match, body) => {
      const trimmed = String(body).trim()
      if (!trimmed) return match
      return this._resolveToken(trimmed, random, weightFormat, variables, warnings, logs)
    })

    return { text: result, warnings, logs, variables }
  }
}

module.exports = { WildcardEngine, normalizeWildcardName, parseWildcardOptions }
