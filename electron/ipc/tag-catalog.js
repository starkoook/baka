const fs = require('fs')

function parseCsvLine(line) {
  const out = []
  let value = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        value += '"'
        i++
      } else if (ch === '"') {
        quoted = false
      } else {
        value += ch
      }
    } else if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      out.push(value)
      value = ''
    } else {
      value += ch
    }
  }
  out.push(value)
  return out.map(item => item.trim())
}

class TagCatalog {
  constructor(entries) {
    this.entries = entries
    this.byEnglish = new Map(entries.map(entry => [entry.tag.toLowerCase(), entry]))
    this.byChinese = new Map()
    this.parentByChild = new Map()
    this.childrenByParent = new Map()

    for (const entry of entries) {
      for (const name of entry.chineseNames || []) {
        const key = name.toLowerCase()
        if (!this.byChinese.has(key)) this.byChinese.set(key, entry)
      }
      if (entry.parent) {
        this.parentByChild.set(entry.tag.toLowerCase(), entry.parent)
        const parentKey = entry.parent.toLowerCase()
        if (!this.childrenByParent.has(parentKey)) this.childrenByParent.set(parentKey, [])
        this.childrenByParent.get(parentKey).push(entry.tag)
      }
    }
  }

  searchChinese(query) {
    const q = String(query || '').toLowerCase()
    if (!q) return []
    const qChars = new Set([...q].filter(ch => ch.trim()))
    const qBigrams = new Set()
    for (let i = 0; i < q.length - 1; i++) qBigrams.add(q.slice(i, i + 2))
    const results = []
    for (const [name, entry] of this.byChinese) {
      const direct = name.includes(q) || entry.tag.toLowerCase().includes(q)
      const charsMatch = [...name].every(ch => qChars.has(ch))
      let bigramMatch = false
      for (let i = 0; i < name.length - 1; i++) {
        if (qBigrams.has(name.slice(i, i + 2))) { bigramMatch = true; break }
      }
      if (direct || charsMatch || bigramMatch) results.push(entry)
    }
    return results.slice(0, 80)
  }

  getParent(tag) {
    return this.parentByChild.get(String(tag || '').toLowerCase()) || null
  }

  getChildren(tag) {
    return this.childrenByParent.get(String(tag || '').toLowerCase()) || []
  }

  translateTags(tags, direction = 'en2zh') {
    return (tags || []).map((tag) => {
      const text = String(tag || '').trim()
      if (!text) return { tag: text, translation: '', found: false }
      if (direction === 'zh2en') {
        const entry = this.byChinese.get(text.toLowerCase())
        return { tag: text, translation: entry?.tag || '', found: !!entry }
      }
      const entry = this.byEnglish.get(text.toLowerCase())
      return { tag: text, translation: entry?.chineseNames?.[0] || '', found: !!entry }
    })
  }

  static async load({ zhPath, characterPath }) {
    const entries = []

    const zhText = fs.readFileSync(zhPath, 'utf8')
    for (const line of zhText.split(/\r?\n/).slice(1)) {
      const [tag, chinese] = parseCsvLine(line)
      if (!tag || !chinese) continue
      entries.push({ tag, chineseNames: [chinese] })
    }

    const charText = fs.readFileSync(characterPath, 'utf8')
    for (const line of charText.split(/\r?\n/).slice(1)) {
      const parts = parseCsvLine(line)
      const tag = parts[0]
      const parent = parts[3]
      if (!tag) continue
      const existing = entries.find(entry => entry.tag.toLowerCase() === tag.toLowerCase())
      if (existing) {
        if (parent) existing.parent = parent
      } else {
        entries.push({ tag, parent: parent || undefined, chineseNames: [] })
      }
    }

    return new TagCatalog(entries)
  }
}

module.exports = { TagCatalog, parseCsvLine }
