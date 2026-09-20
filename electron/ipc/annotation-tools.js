/**
 * 标注批量工具 — 借鉴 DatasetsDeputy 的标注格式转换 / 规范化体系
 *
 * 提供：
 *  - 格式转换：booruTag <-> anima（质量词 + @ 风格前缀）、natural 文本互转
 *  - 规范化：小写/全半角/去特殊字符/下划线/换行/垃圾词/非 ASCII/去重
 *  - 查找替换：文本查找 + 正则
 *  - 批量加字段：前缀/后缀/整行包裹
 *
 * 所有写操作都会先创建文件历史版本，供撤销恢复。
 */
const { ipcMain } = require('electron')
const fs = require('fs')
const path = require('path')
const { ensureDb, queryAll, runSql } = require('./gallery')
const { writeTextSafe } = require('./safe-file')
const { createHistoryRecord, restoreVersion, listVersions } = require('./file-history')

// ── Anima 质量词 ──
const ANIMA_QUALITY_WORDS = [
  'masterpiece',
  'best quality',
  'best_quality',
  'score_7',
  'score_8',
  'score_9',
  'absurdres',
  'highres',
  'very aesthetic',
]

// ── 常见 Danbooru 风格标签（用于 booruTag -> anima 时加 @ 前缀）──
// 轻量内置表作为兜底；优先从图库自带的角色标签 CSV 动态加载（与打标搜索共用数据）。
const STYLE_TAGS = new Set([
  'touhou', 'vocaloid', 'original', 'hololive', 'arknights', 'genshin_impact',
  'fate', 'azur_lane', 'blue_archive', 'girls_frontline', 'kancolle',
  'love_live', 'bang_dream', 'idolmaster', 'umamusume', 'project_sekai',
  'oshi_no_ko', 'chainsaw_man', 'jujutsu_kaisen', 'demon_slayer', 'spy_x_family',
  'one_piece', 'naruto', 'bleach', 'dragon_ball', 'pokemon', 'digimon',
  'evangelion', 'gundam', 'sword_art_online', 're_zero', 'konosuba',
  'overlord', 'made_in_abyss', 'mushoku_tensei', 'frieren', '86_eighty_six',
  'my_hero_academia', 'attack_on_titan', 'kingdom_hearts', 'final_fantasy',
  'nijisanji', 'vtuber', 'anime_style', 'chibi', 'watercolor', 'oil_painting',
  'pixel_art', 'sketch', 'lineart', 'monochrome', 'grayscale', 'flat_color',
  'western', 'realistic', 'semi_realistic', '2d', '3d', '3d_art', 'cg',
  'upper_body', 'full_body', 'portrait', 'landscape', 'architecture',
])

// 从角色标签 CSV 高效读取首列（版权/角色类标签，Anima 格式需加 @ 前缀）。
// 注意不能复用 TagCatalog.load —— 它对大 CSV 做 O(n²) 合并，会卡死。
let loadedCharacterTagsPromise = null

function loadCharacterTags() {
  if (!loadedCharacterTagsPromise) {
    loadedCharacterTagsPromise = (async () => {
      try {
        const csvPath = path.join(__dirname, '../../resources/tag-data/danbooru_character_tags.csv')
        const tags = new Set(STYLE_TAGS)
        const content = await fs.promises.readFile(csvPath, 'utf8')
        const lines = content.split(/\r?\n/)
        for (let index = 1; index < lines.length; index++) {
          const line = lines[index]
          if (!line) continue
          const commaIndex = line.indexOf(',')
          const tag = (commaIndex >= 0 ? line.slice(0, commaIndex) : line).trim()
          if (tag) tags.add(tag.toLowerCase())
        }
        return tags
      } catch (_) {
        return STYLE_TAGS
      }
    })()
  }
  return loadedCharacterTagsPromise
}

// 注解分隔符统一处理
function isBoundaryCharacter(value) {
  return value === undefined || /[\s,.;:!?()[\]{}"'，。；：！？、]/.test(value)
}

function shouldKeepAtPrefix(content, index) {
  const following = content.slice(index).toLowerCase()
  const isTrailingAtInSpacedFace =
    index >= 2 &&
    content.slice(index - 2, index + 1) === '@ @' &&
    isBoundaryCharacter(index === 2 ? undefined : content[index - 3])
  return (
    following.startsWith('@_@') ||
    following.startsWith('@ @') ||
    isTrailingAtInSpacedFace ||
    /^@[_ ]\((?:symbol)\)/.test(following)
  )
}

function removeAnimaAtPrefixes(content) {
  let result = ''
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]
    if (
      character === '@' &&
      isBoundaryCharacter(index === 0 ? undefined : content[index - 1]) &&
      !shouldKeepAtPrefix(content, index)
    ) {
      continue
    }
    result += character
  }
  return result
}

function removeAnimaQualityWords(content) {
  return content
    .replace(/\bmasterpiece\b/gi, '')
    .replace(/\bbest[ _]quality\b/gi, '')
    .replace(/\bscore[ _][0-9]\b/gi, '')
    .replace(/\babsurdres\b/gi, '')
    .replace(/\bhighres\b/gi, '')
    .replace(/\bvery[ _]aesthetic\b/gi, '')
}

// 空权重清理 + 分隔符归一整型 + 去重
const emptyWeightRegex =
  /\[[\s_,，]*\]|\{[\s_,，]*\}|\([\s_,，]*\)|<[\s_,，]*>|(?:-?\d+\.?\d*)?::[\s_,，]*::/g
const junkPhraseRegex =
  /\b(?:best quality|amazing quality|very aesthetic|absurdres)\b|\bartist:/gi
const isolatedPunctuationRegex = /^[\s.,，。;；:：!?！？、]+$/
const edgePunctuationRegex = /^[\s.,，。;；:：!?！？、]+|[\s.,，。;；:：!?！？、]+$/g

function cleanupAnnotationSeparators(value, separator = ', ') {
  let text = String(value || '')
  let previous = ''
  while (text !== previous) {
    previous = text
    text = text.replace(emptyWeightRegex, '')
  }

  const seenTags = new Set()
  const uniqueTags = text
    .replace(/，/g, ',')
    .split(',')
    .map((tag) => tag.trim().replace(edgePunctuationRegex, '').replace(/\//g, ''))
    .filter((tag) => {
      if (!tag || isolatedPunctuationRegex.test(tag) || seenTags.has(tag)) return false
      seenTags.add(tag)
      return true
    })

  return uniqueTags.join(separator)
}

function replaceWidth(text, halfWidth) {
  if (halfWidth) {
    return text
      .replace(/，/g, ',')
      .replace(/　/g, ' ')
      .replace(/（/g, '(')
      .replace(/）/g, ')')
      .replace(/、/g, ',')
  }
  return text.replace(/,/g, '，').replace(/\(/g, '（').replace(/\)/g, '）')
}

// 规范化标注文本
function normalizeAnnotationText(value, options = {}) {
  const {
    lowercase = true,
    halfWidth = true,
    removeSpecial = true,
    underscoreToSpace = true,
    removeNewlines = true,
    removeJunk = true,
    removeNonAscii = false,
    dedupe = true,
  } = options
  if (!value) return ''

  let text = String(value)
  if (lowercase) text = text.toLowerCase()
  text = replaceWidth(text, halfWidth)
  if (removeSpecial) text = text.replace(/[【】]/g, '')
  if (underscoreToSpace) text = text.replace(/_/g, ' ')
  if (removeNewlines) text = text.replace(/\r\n/g, '\n').replace(/\n/g, ',')
  if (removeJunk) text = text.replace(junkPhraseRegex, '')
  if (removeNonAscii) {
    text = Array.from(text).filter((char) => char.charCodeAt(0) <= 127).join('')
  }
  if (dedupe) {
    return cleanupAnnotationSeparators(text, halfWidth ? ', ' : '，')
  }
  return text.replace(emptyWeightRegex, '').replace(/,+/g, ',').trim()
}

// 把带权重的标签文本解析为纯标签列表（剥离 SD/NAI 权重语法）
function parseWeightedTags(text) {
  return cleanupAnnotationSeparators(String(text || ''))
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

// booruTag -> anima：质量词处理 + 风格 @ 前缀（权重保留为 A1111 语法）
async function convertBooruTagToAnima(text, options = {}) {
  const { qualityWordPlacement = 'keep', addStylePrefix = true } = options
  const styleTags = addStylePrefix ? await loadCharacterTags() : new Set()
  const parts = parseWeightedTags(text)
  const stylized = parts.map((tag) => {
    const trimmed = tag.trim()
    const key = trimmed.toLowerCase().replace(/[\s,.;:!?()[\]{}"'，。；：！？、]/g, '_')
    if (styleTags.has(key) && !trimmed.startsWith('@')) {
      return `@${trimmed}`
    }
    return trimmed
  })
  const body = stylized.join(', ')
  if (qualityWordPlacement === 'none' || qualityWordPlacement === 'remove') {
    return removeAnimaQualityWords(body)
  }
  const quality = 'masterpiece, best quality, score_7, score_8, score_9'
  if (qualityWordPlacement === 'prefix') return `${quality}. ${body}`
  return `${body}${body ? ', ' : ''}${quality}`
}

// anima -> booruTag：去 @ 前缀 + 去质量词 + 清理
function convertAnimaToBooruTag(text, options = {}) {
  const { qualityWordPlacement = 'remove' } = options
  const withoutAt = removeAnimaAtPrefixes(String(text || ''))
  const cleaned =
    qualityWordPlacement === 'keep' || qualityWordPlacement === 'suffix'
      ? cleanupAnnotationSeparators(withoutAt)
      : cleanupAnnotationSeparators(removeAnimaQualityWords(withoutAt))
  return cleaned
}

// anima -> anima（仅规范化/重排质量词）
async function normalizeAnima(text, options = {}) {
  const { qualityWordPlacement = 'prefix' } = options
  const again = convertAnimaToBooruTag(text, { qualityWordPlacement: 'remove' })
  return convertBooruTagToAnima(again, { qualityWordPlacement, addStylePrefix: true })
}

// booruTag -> natural 自然语言描述
function convertBooruTagToNatural(text) {
  const tags = parseWeightedTags(text)
  if (!tags.length) return ''
  return tags.join(', ')
}

// natural -> booruTag：把自然语言段落拆成标签列表
function convertNaturalToBooruTag(text) {
  return cleanupAnnotationSeparators(String(text || ''))
}

// 查找替换
function applyFindReplace(text, options = {}) {
  const find = options.find ?? ''
  const replace = options.replace ?? ''
  if (!find) return String(text || '')
  if (options.regex) {
    try {
      const flags = options.ignoreCase ? 'gi' : 'g'
      const regex = new RegExp(find, flags)
      return String(text || '').replace(regex, replace)
    } catch (_) {
      return String(text || '')
    }
  }
  if (options.wholeWord) {
    const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const flags = options.ignoreCase ? 'gi' : 'g'
    return String(text || '').replace(new RegExp(`\\b${escaped}\\b`, flags), replace)
  }
  if (options.ignoreCase) {
    const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return String(text || '').replace(new RegExp(escaped, 'gi'), replace)
  }
  return String(text || '').split(find).join(replace)
}

// 批量加字段
function applyAddFields(text, options = {}) {
  const { prefix = '', suffix = '', wrapNewLine = false } = options
  if (wrapNewLine) {
    return `${prefix}${String(text || '')}${suffix}`
  }
  return parseWeightedTags(text)
    .map((tag) => `${prefix}${tag}${suffix}`)
    .join(', ')
}

// 统一入口：按工具类型转换一段文本
async function transformAnnotationText(text, tool = {}) {
  const type = tool.type || 'normalize'
  const options = tool.options || {}
  switch (type) {
    case 'format-convert': {
      const { from = 'booruTag', to = 'anima' } = options
      if (from === 'booruTag' && to === 'anima') return await convertBooruTagToAnima(text, options)
      if (from === 'anima' && to === 'booruTag') return convertAnimaToBooruTag(text, options)
      if (from === 'anima' && to === 'anima') return await normalizeAnima(text, options)
      if (from === 'booruTag' && to === 'natural') return convertBooruTagToNatural(text)
      if (from === 'natural' && to === 'booruTag') return convertNaturalToBooruTag(text)
      if (from === 'anima' && to === 'natural') return convertBooruTagToNatural(convertAnimaToBooruTag(text))
      return text
    }
    case 'normalize':
      return normalizeAnnotationText(text, options)
    case 'find-replace':
      return applyFindReplace(text, options)
    case 'add-fields':
      return applyAddFields(text, options)
    default:
      return String(text || '')
  }
}

function captionPathForImage(imagePath) {
  return imagePath.replace(/\.[^.]+$/, '') + '.txt'
}

function readCaptionText(imagePath) {
  const captionPath = captionPathForImage(imagePath)
  try {
    return fs.existsSync(captionPath) ? String(fs.readFileSync(captionPath, 'utf-8') || '') : ''
  } catch (_) {
    return ''
  }
}

function findImageIdByPath(imagePath) {
  try {
    const rows = queryAll('SELECT id FROM images WHERE path = ?', [imagePath])
    return rows[0]?.id ?? null
  } catch (_) {
    return null
  }
}

// 同步图库数据库中的标签（保持 .txt 与数据库一致）
function syncDatabaseTags(imagePath, captionText) {
  const imageId = findImageIdByPath(imagePath)
  if (!imageId) return
  const tags = parseWeightedTags(captionText)
  try {
    runSql('DELETE FROM image_tags WHERE image_id = ?', [imageId])
    for (const tag of tags) {
      runSql('INSERT OR IGNORE INTO tags (name, category) VALUES (?, ?)', [tag, 'general'])
      const tagRow = queryAll('SELECT id FROM tags WHERE name = ?', [tag])[0]
      if (tagRow) {
        runSql('INSERT OR REPLACE INTO image_tags (image_id, tag_id, confidence, source) VALUES (?, ?, ?, ?)',
          [imageId, tagRow.id, null, 'manual'])
      }
    }
  } catch (_) {
    // 数据库同步失败不阻断文件写入
  }
}

// 批量应用工具到图片列表：为每张图创建历史版本 -> 写回 .txt -> 同步数据库
async function applyToolToImages(imagePaths, tool) {
  await ensureDb()
  const results = []
  const historyIds = []
  const failures = []
  let updated = 0

  for (const imagePath of imagePaths || []) {
    if (!imagePath) continue
    const captionPath = captionPathForImage(imagePath)
    const original = readCaptionText(imagePath)
    const transformed = await transformAnnotationText(original, tool)

    if (transformed === original) {
      results.push({ imagePath, changed: false })
      continue
    }

    try {
      const history = await createHistoryRecord(captionPath)
      if (history.success && history.id) historyIds.push(history.id)
      const writeResult = await writeTextSafe(captionPath, transformed)
      if (!writeResult.success) throw new Error(writeResult.error || '写入失败')
      syncDatabaseTags(imagePath, transformed)
      updated += 1
      results.push({ imagePath, changed: true })
    } catch (error) {
      failures.push({ imagePath, error: error.message || String(error) })
      results.push({ imagePath, changed: false, error: error.message || String(error) })
    }
  }

  return { success: failures.length === 0, data: { updated, total: (imagePaths || []).length, results, historyIds, failures } }
}

// 用外部提供的转换文本直接覆盖（供 AI 重写等无法在本地规则表达的场景使用）
async function applyOverrideToImages(imagePaths, texts) {
  await ensureDb()
  const results = []
  const historyIds = []
  const failures = []
  let updated = 0

  for (let index = 0; index < (imagePaths || []).length; index++) {
    const imagePath = imagePaths[index]
    const nextText = texts && texts[index] != null ? String(texts[index]) : ''
    if (!imagePath) continue
    const captionPath = captionPathForImage(imagePath)
    const original = readCaptionText(imagePath)
    if (nextText === original) {
      results.push({ imagePath, changed: false })
      continue
    }
    try {
      const history = await createHistoryRecord(captionPath)
      if (history.success && history.id) historyIds.push(history.id)
      const writeResult = await writeTextSafe(captionPath, nextText)
      if (!writeResult.success) throw new Error(writeResult.error || '写入失败')
      syncDatabaseTags(imagePath, nextText)
      updated += 1
      results.push({ imagePath, changed: true })
    } catch (error) {
      failures.push({ imagePath, error: error.message || String(error) })
      results.push({ imagePath, changed: false, error: error.message || String(error) })
    }
  }

  return { success: failures.length === 0, data: { updated, total: (imagePaths || []).length, results, historyIds, failures } }
}

// 撤销：恢复文件历史版本（restoreVersion 本身会先存档当前版本，可继续撤销）
async function undoApplyTool(historyIds) {
  const restored = []
  const failures = []
  for (const id of historyIds || []) {
    try {
      const result = await restoreVersion(id)
      if (result.success) restored.push(result.targetPath)
      else failures.push({ id, error: result.error })
    } catch (error) {
      failures.push({ id, error: error.message || String(error) })
    }
  }
  return { success: failures.length === 0, data: { restored, failures } }
}

function registerAnnotationToolsHandlers() {
  ipcMain.handle('annotationTools:transformText', async (_event, params) => {
    try {
      const text = await transformAnnotationText(params?.text || '', params?.tool)
      return { success: true, data: { text } }
    } catch (error) {
      return { success: false, error: error.message || String(error) }
    }
  })

  ipcMain.handle('annotationTools:preview', async (_event, params) => {
    try {
      const imagePaths = params?.imagePaths || []
      const samples = await Promise.all(
        imagePaths.slice(0, 3).map(async (imagePath) => ({
          imagePath,
          before: readCaptionText(imagePath),
          after: await transformAnnotationText(readCaptionText(imagePath), params?.tool),
        }))
      )
      return { success: true, data: { samples } }
    } catch (error) {
      return { success: false, error: error.message || String(error) }
    }
  })

  ipcMain.handle('annotationTools:applyBatch', async (_event, params) => {
    try {
      return await applyToolToImages(params?.imagePaths || [], params?.tool)
    } catch (error) {
      return { success: false, error: error.message || String(error) }
    }
  })

  ipcMain.handle('annotationTools:applyOverride', async (_event, params) => {
    try {
      return await applyOverrideToImages(params?.imagePaths || [], params?.texts || [])
    } catch (error) {
      return { success: false, error: error.message || String(error) }
    }
  })

  ipcMain.handle('annotationTools:undoBatch', async (_event, historyIds) => {
    try {
      return await undoApplyTool(historyIds)
    } catch (error) {
      return { success: false, error: error.message || String(error) }
    }
  })

  ipcMain.handle('annotationTools:listHistory', async (_event, imagePath) => {
    try {
      const versions = await listVersions(captionPathForImage(imagePath || ''))
      return { success: true, data: { versions } }
    } catch (error) {
      return { success: false, error: error.message || String(error) }
    }
  })
}

module.exports = {
  ANIMA_QUALITY_WORDS,
  STYLE_TAGS,
  applyAddFields,
  applyFindReplace,
  cleanupAnnotationSeparators,
  convertAnimaToBooruTag,
  convertBooruTagToAnima,
  normalizeAnnotationText,
  registerAnnotationToolsHandlers,
  transformAnnotationText,
  parseWeightedTags,
}
