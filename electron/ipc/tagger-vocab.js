const fs = require('fs')
const path = require('path')
const { TagCatalog } = require('./tag-catalog')

// ── Trie for prefix-based tag search ──

class TrieNode {
  constructor() {
    this.children = {}
    this.entries = [] // [{tag, category, postCount}] at this node
  }
}

class TagTrie {
  constructor() {
    this.root = new TrieNode()
    this._size = 0
  }

  insert(tag, category, postCount) {
    let node = this.root
    for (const ch of tag) {
      if (!node.children[ch]) node.children[ch] = new TrieNode()
      node = node.children[ch]
    }
    node.entries.push({ tag, category, postCount })
    this._size++
  }

  /** Search by prefix. Returns top N entries sorted by postCount desc. */
  search(prefix, limit = 20) {
    let node = this.root
    for (const ch of prefix) {
      node = node.children[ch]
      if (!node) return [] // no match
    }
    // Collect all entries from this subtree
    const results = []
    this._collect(node, results)
    results.sort((a, b) => b.postCount - a.postCount)
    return results.slice(0, limit)
  }

  _collect(node, out) {
    if (node.entries.length > 0) out.push(...node.entries)
    for (const child of Object.values(node.children)) {
      this._collect(child, out)
    }
  }

  get size() { return this._size }
}

// ── Top-500 Danbooru tags (fallback if no CSV bundled) ──
// Format: [tag, category, post_count]
const BUILTIN_TAGS = [
  ['1girl', 'general', 4000000], ['solo', 'general', 3500000],
  ['long_hair', 'general', 2200000], ['looking_at_viewer', 'general', 2000000],
  ['breasts', 'general', 1800000], ['short_hair', 'general', 1600000],
  ['white_background', 'general', 1500000], ['simple_background', 'general', 1400000],
  ['blush', 'general', 1300000], ['open_mouth', 'general', 1200000],
  ['smile', 'general', 1200000], ['animal_ears', 'general', 1100000],
  ['blue_eyes', 'general', 1100000], ['skirt', 'general', 1000000],
  ['twintails', 'general', 1000000], ['brown_hair', 'general', 950000],
  ['blonde_hair', 'general', 950000], ['thighhighs', 'general', 900000],
  ['large_breasts', 'general', 900000], ['hair_ornament', 'general', 850000],
  ['weapon', 'general', 800000], ['gloves', 'general', 800000],
  ['standing', 'general', 800000], ['school_uniform', 'general', 750000],
  ['black_hair', 'general', 750000], ['holding', 'general', 700000],
  ['sitting', 'general', 700000], ['closed_eyes', 'general', 700000],
  ['hat', 'general', 650000], ['japanese_clothes', 'general', 650000],
  ['red_eyes', 'general', 650000], ['purple_eyes', 'general', 600000],
  ['navel', 'general', 600000], ['white_hair', 'general', 600000],
  ['ribbon', 'general', 600000], ['cat_ears', 'general', 600000],
  ['bow', 'general', 550000], ['panties', 'general', 550000],
  ['barefoot', 'general', 550000], ['earrings', 'general', 500000],
  ['green_eyes', 'general', 500000], ['ponytail', 'general', 500000],
  ['grey_hair', 'general', 500000], ['pink_hair', 'general', 500000],
  ['necklace', 'general', 450000], ['ahoge', 'general', 450000],
  ['choker', 'general', 450000], ['dress', 'general', 450000],
  ['glasses', 'general', 450000], ['blue_hair', 'general', 450000],
  // Rating & quality
  ['safe', 'rating', 5000000], ['questionable', 'rating', 3000000],
  ['explicit', 'rating', 2000000],
  ['highres', 'quality', 2000000], ['absurdres', 'quality', 1500000],
  ['masterpiece', 'quality', 1000000], ['best_quality', 'quality', 800000],
  ['amazing_quality', 'quality', 600000], ['great_quality', 'quality', 400000],
  ['normal_quality', 'quality', 200000], ['low_quality', 'quality', 50000],
  ['worst_quality', 'quality', 20000],
  // Common expressions
  ['angry', 'expression', 300000], ['sad', 'expression', 200000],
  ['surprised', 'expression', 200000], ['happy', 'expression', 200000],
  ['embarrassed', 'expression', 150000], ['tears', 'expression', 150000],
  // Common poses
  ['arms_up', 'pose', 200000], ['hands_up', 'pose', 150000],
  ['arms_behind_back', 'pose', 100000], ['crossed_arms', 'pose', 100000],
  ['spread_legs', 'pose', 100000], ['kneeling', 'pose', 100000],
  // Common backgrounds
  ['outdoors', 'background', 800000], ['indoors', 'background', 600000],
  ['night', 'background', 400000], ['sky', 'background', 400000],
  ['water', 'background', 300000], ['city', 'background', 300000],
  ['nature', 'background', 250000], ['room', 'background', 200000],
  ['school', 'background', 200000], ['beach', 'background', 150000],
  ['bed', 'background', 150000], ['building', 'background', 100000],
  ['forest', 'background', 100000], ['street', 'background', 100000],
  // Artist tags
  ['wlop', 'artist', 50000], ['ask', 'artist', 40000],
  ['guweiz', 'artist', 30000], ['wanke', 'artist', 20000],
  // Copyright
  ['genshin_impact', 'copyright', 200000], ['honkai_star_rail', 'copyright', 150000],
  ['fate_(series)', 'copyright', 150000], ['arknights', 'copyright', 100000],
  ['blue_archive', 'copyright', 100000], ['hololive', 'copyright', 100000],
  ['vocaloid', 'copyright', 100000], ['touhou', 'copyright', 100000],
  ['azur_lane', 'copyright', 80000], ['kantai_collection', 'copyright', 60000],
  // Character
  ['hatsune_miku', 'character', 200000], ['hu_tao_(genshin_impact)', 'character', 80000],
  ['raiden_shogun', 'character', 80000], ['frieren', 'character', 60000],
  ['nahida_(genshin_impact)', 'character', 50000], ['fubuki_(hololive)', 'character', 40000],
  ['gawr_gura', 'character', 40000], ['reimu_hakurei', 'character', 30000],
  ['marin_kitagawa', 'character', 30000], ['asuka_langley_soryu', 'character', 30000],
  // Common outfit
  ['bikini', 'outfit', 400000], ['swimsuit', 'outfit', 350000],
  ['armor', 'outfit', 200000], ['uniform', 'outfit', 200000],
  ['suit', 'outfit', 150000], ['maid', 'outfit', 150000],
  ['kimono', 'outfit', 150000], ['lingerie', 'outfit', 100000],
  ['hoodie', 'outfit', 80000], ['t-shirt', 'outfit', 50000],
  ['jacket', 'outfit', 50000], ['shorts', 'outfit', 50000],
  ['jeans', 'outfit', 30000], ['leggings', 'outfit', 30000],
  ['heels', 'outfit', 50000], ['boots', 'outfit', 50000],
  ['sneakers', 'outfit', 30000],
  // Body features
  ['tail', 'body', 400000], ['horns', 'body', 300000],
  ['wings', 'body', 250000], ['tattoo', 'body', 200000],
  ['scar', 'body', 100000], ['freckles', 'body', 50000],
  ['muscular', 'body', 50000], ['tan', 'body', 50000],
  // Action
  ['fighting', 'action', 150000], ['running', 'action', 100000],
  ['dancing', 'action', 100000], ['eating', 'action', 80000],
  ['drinking', 'action', 50000], ['reading', 'action', 50000],
  ['sleeping', 'action', 50000], ['swimming', 'action', 40000],
  ['flying', 'action', 40000], ['jumping', 'action', 30000],
]

// ── Vocab engine ──

let trie = null
let sortedVocab = [] // for contains/includes search
let catalogPromise = null

function getCatalog() {
  if (!catalogPromise) {
    catalogPromise = TagCatalog.load({
      zhPath: path.join(__dirname, '../../resources/tag-data/danbooru-0-zh.csv'),
      characterPath: path.join(__dirname, '../../resources/tag-data/danbooru_character_tags.csv'),
    }).catch(() => new TagCatalog([]))
  }
  return catalogPromise
}

function buildIndex() {
  if (trie) return // already built
  trie = new TagTrie()
  sortedVocab = []

  for (const [tag, category, count] of BUILTIN_TAGS) {
    trie.insert(tag, category, count)
    sortedVocab.push({ tag, category, postCount: count })
  }

  sortedVocab.sort((a, b) => b.postCount - a.postCount)
  console.error(`[tagger-vocab] indexed ${trie.size} tags`)
}

/**
 * Search for tags matching the query.
 * @param {string} query - search term
 * @param {'prefix'|'contains'} matchMode
 * @param {number} limit - max results
 * @param {string} [category] - optional category filter
 * @returns {{tag:string,category:string,postCount:number}[]}
 */
function searchTags(query, matchMode = 'prefix', limit = 20, category = null) {
  if (!trie) buildIndex()
  const q = query.toLowerCase().trim()
  if (!q) return []

  let results
  if (matchMode === 'prefix') {
    results = trie.search(q, limit * 2) // overfetch for category filter
  } else {
    // Contains search: scan sorted array
    results = []
    for (const entry of sortedVocab) {
      if (entry.tag.includes(q)) results.push(entry)
      if (results.length >= limit * 3) break
    }
    results.sort((a, b) => b.postCount - a.postCount)
  }

  if (category) {
    results = results.filter((r) => r.category === category)
  }

  return results.slice(0, limit)
}

async function translateTags(tags, direction = 'en2zh') {
  const catalog = await getCatalog()
  return catalog.translateTags(tags, direction)
}

/**
 * Load additional tags from a CSV file.
 * CSV format: name,category,post_count (optional header)
 */
function loadCsvVocab(csvPath) {
  try {
    const text = fs.readFileSync(csvPath, 'utf-8')
    const lines = text.split('\n')
    let count = 0
    // Reset trie if loading custom vocab
    if (!trie) trie = new TagTrie()
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const parts = trimmed.split(',')
      if (parts.length < 1) continue
      const tag = parts[0].trim()
      if (!tag || tag === 'name' || tag === 'tag_id') continue // skip header
      const category = parts[1] ? parts[1].trim() : 'general'
      const postCount = parts[2] ? parseInt(parts[2], 10) || 0 : 0
      trie.insert(tag, category, postCount)
      sortedVocab.push({ tag, category, postCount })
      count++
    }
    sortedVocab.sort((a, b) => b.postCount - a.postCount)
    console.error(`[tagger-vocab] loaded ${count} tags from CSV`)
    return count
  } catch (e) {
    console.error('[tagger-vocab] failed to load CSV:', e.message)
    return 0
  }
}

function registerVocabHandlers() {
  const { ipcMain } = require('electron')

  ipcMain.handle('taggerV2:searchTags', async (_event, query, matchMode = 'prefix', limit = 20, category = null) => {
    try {
      const hasChinese = /[\u4e00-\u9fff]/.test(query || '')
      if (hasChinese) {
        const catalog = await getCatalog()
        const entries = catalog.searchChinese(query).slice(0, limit)
        const data = entries.map(entry => ({
          tag: entry.tag,
          category: 'character',
          postCount: 0,
          chineseName: entry.chineseNames?.[0] || '',
          parent: entry.parent || '',
        }))
        return { success: true, data }
      }
      if (!trie) buildIndex()
      const results = searchTags(query, matchMode, limit, category)
      return { success: true, data: results }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('taggerV2:getCategories', async () => {
    try {
      // Return distinct categories from builtin vocab
      const cats = new Set()
      for (const [, category] of BUILTIN_TAGS) {
        cats.add(category)
      }
      return { success: true, data: [...cats].sort() }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('taggerV2:translateTags', async (_event, tags, direction = 'en2zh') => {
    try {
      const data = await translateTags(tags, direction)
      return { success: true, data }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })
}

module.exports = { registerVocabHandlers, searchTags, translateTags, loadCsvVocab, buildIndex }
