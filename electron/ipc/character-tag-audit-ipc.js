const fs = require('fs')
const path = require('path')
const { ipcMain } = require('electron')
const { ensureDb, queryAll } = require('./gallery')
const {
  buildInventory,
  applyInventoryDecisions,
  auditInventory,
  buildPyramidPrompt,
  parsePyramidOutput,
} = require('./character-tag-audit')
const { writeImageTagsAndCaption } = require('./tagging-batch')
const { chatCompletion } = require('./llm')
const { TagCatalog } = require('./tag-catalog')

let catalogPromise = null
function getTagCatalog() {
  if (!catalogPromise) {
    catalogPromise = TagCatalog.load({
      zhPath: path.join(__dirname, '../../resources/tag-data/danbooru-0-zh.csv'),
      characterPath: path.join(__dirname, '../../resources/tag-data/danbooru_character_tags.csv'),
    }).catch(() => new TagCatalog([]))
  }
  return catalogPromise
}

async function resolveParentByChild(explicit) {
  if (explicit && Object.keys(explicit).length) return explicit
  const catalog = await getTagCatalog()
  return Object.fromEntries(catalog.parentByChild || [])
}

function getAuditItems(imageIds) {
  if (imageIds?.length) {
    const placeholders = imageIds.map(() => '?').join(',')
    const rows = queryAll(
      `SELECT i.id, i.path, t.name as tag
       FROM images i
       LEFT JOIN image_tags it ON it.image_id = i.id
       LEFT JOIN tags t ON t.id = it.tag_id
       WHERE i.id IN (${placeholders})`,
      imageIds
    )
    return groupRows(rows)
  }

  const rows = queryAll(
    `SELECT i.id, i.path, t.name as tag
     FROM images i
     LEFT JOIN image_tags it ON it.image_id = i.id
     LEFT JOIN tags t ON t.id = it.tag_id`
  )
  return groupRows(rows)
}

function groupRows(rows) {
  const byId = new Map()
  for (const row of rows) {
    if (!byId.has(row.id)) {
      byId.set(row.id, { id: row.id, path: row.path, tags: [] })
    }
    if (row.tag) byId.get(row.id).tags.push(row.tag)
  }
  return [...byId.values()]
}

function getReferenceImages(referenceImagePaths) {
  return (referenceImagePaths || []).slice(0, 4)
    .filter((filePath) => fs.existsSync(filePath))
    .map((filePath) => ({
      imageBase64: fs.readFileSync(filePath).toString('base64'),
      mimeType: path.extname(filePath).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg',
    }))
}

function registerCharacterTagAuditHandlers() {
  ipcMain.handle('characterAudit:inventory', async (_event, params = {}) => {
    try {
      await ensureDb()
      const items = getAuditItems(params.imageIds || [])
      const inventory = buildInventory(items).sort((a, b) => b.count - a.count)
      const parentByChild = await resolveParentByChild()
      return { success: true, data: { items, inventory, parentByChild } }
    } catch (e) {
      return { success: false, error: e.message || String(e) }
    }
  })

  /** 一次 LLM 请求：规则 + 任务合成一条 prompt，有参考图就带第一张。返回原始文本。 */
  const requestLlm = async ({ prompt, imagePaths = [] }) => {
    const refs = getReferenceImages(imagePaths)
    const image = refs[0] || null
    return chatCompletion({
      prompt,
      imageBase64: image?.imageBase64 || undefined,
      mimeType: image?.mimeType || 'image/jpeg',
      temperature: 0.2,
      maxTokens: 6000,
    })
  }

  ipcMain.handle('characterAudit:run', async (_event, params = {}) => {
    try {
      await ensureDb()
      const items = getAuditItems(params.imageIds || [])
      const inventory = buildInventory(items).sort((a, b) => b.count - a.count)
      const triggerWords = params.triggerWords || []

      const result = await auditInventory({
        inventory,
        triggerWords,
        referenceImagePaths: params.referenceImagePaths || [],
        requestLlm,
        mode: params.mode === 'full' ? 'full' : 'sparse',
        minimumCount: Math.max(1, Number(params.minimumCount) || 1),
        otherTriggers: params.otherTriggers || [],
      })

      return {
        success: true,
        data: {
          items,
          inventory,
          decisions: result.decisions,
          excluded: result.excluded,
          corePrompt: result.corePrompt,
          stages: result.stages,
        },
      }
    } catch (e) {
      return { success: false, error: e.message || String(e) }
    }
  })

  // prompt-pyramid：把一张图的标签按视觉权重金字塔排序（只重排，不增删）
  ipcMain.handle('characterAudit:pyramid', async (_event, params = {}) => {
    try {
      const tags = Array.isArray(params.tags) ? params.tags.map((tag) => String(tag)).filter(Boolean) : []
      if (tags.length < 2) return { success: true, data: { ordered: tags, matched: tags.length } }
      const raw = await chatCompletion({
        prompt: buildPyramidPrompt({ tags, triggerWords: params.triggerWords || [] }),
        temperature: 0.1,
        maxTokens: 1500,
      })
      const { ordered, matched } = parsePyramidOutput(raw, tags)
      return { success: true, data: { ordered, matched } }
    } catch (e) {
      return { success: false, error: e.message || String(e) }
    }
  })

  ipcMain.handle('characterAudit:apply', async (_event, params = {}) => {
    try {
      await ensureDb()
      const items = params.items || []
      const decisions = params.decisions || []
      const parentByChild = new Map(Object.entries(await resolveParentByChild(params.parentByChild || {})))
      const applied = applyInventoryDecisions(items, decisions, parentByChild)
      const failures = []
      let updated = 0

      for (const item of applied) {
        try {
          if (!item.id) {
            const captionPath = item.path.replace(/\.[^.]+$/, '') + '.txt'
            fs.writeFileSync(captionPath, item.tags.join(', '), 'utf-8')
          } else {
            await writeImageTagsAndCaption(item.id, item.path, item.tags)
          }
          updated++
        } catch (error) {
          failures.push({ path: item.path, error: error.message || String(error) })
        }
      }

      return { success: failures.length === 0, data: { updated, failures } }
    } catch (e) {
      return { success: false, error: e.message || String(e) }
    }
  })
}

module.exports = { registerCharacterTagAuditHandlers }
