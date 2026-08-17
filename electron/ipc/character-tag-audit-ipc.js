const fs = require('fs')
const path = require('path')
const { ipcMain } = require('electron')
const { ensureDb, queryAll } = require('./gallery')
const { buildInventory, applyInventoryDecisions, auditInventory } = require('./character-tag-audit')
const { writeImageTagsAndCaption } = require('./tagging-batch')
const { callLLM } = require('./llm')

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

function parseDecisions(raw) {
  const text = String(raw || '')
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] || text
  const arrayMatch = fenced.match(/\[[\s\S]*\]/)
  if (!arrayMatch) return []
  try {
    const parsed = JSON.parse(arrayMatch[0])
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        tag: String(item.tag || '').trim(),
        type: ['keep', 'delete', 'replace', 'unsure'].includes(item.type) ? item.type : 'keep',
        target: item.target ? String(item.target).trim() : '',
        reason: item.reason ? String(item.reason).trim() : '',
      }))
      .filter((item) => item.tag)
  } catch (_) {
    return []
  }
}

function buildAuditPrompt(triggerWords, inventory) {
  const triggerText = triggerWords.length ? triggerWords.join(', ') : 'none'
  return `You are auditing character tags in an anime image dataset.

Trigger words configured by the user:
${triggerText}

Character tag inventory (tag, image count):
${inventory.map((item) => `${item.tag} (${item.count})`).join('\n')}

For every character tag in the inventory, choose one decision:
- keep: the tag is correct and should stay.
- delete: the tag is wrong or should not be kept.
- replace: the tag should be replaced, and provide "target".
- unsure: need a human to decide.

Return ONLY a JSON array. Every item must have "tag", "type", optional "target", and optional "reason".
Example:
[{"tag":"hatsune_miku","type":"keep","reason":"correct trigger word"},{"tag":"blue_hair","type":"delete"}]`
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
      return { success: true, data: { items, inventory } }
    } catch (e) {
      return { success: false, error: e.message || String(e) }
    }
  })

  ipcMain.handle('characterAudit:run', async (_event, params = {}) => {
    try {
      await ensureDb()
      const items = getAuditItems(params.imageIds || [])
      const inventory = buildInventory(items).sort((a, b) => b.count - a.count)
      const referenceImages = getReferenceImages(params.referenceImagePaths || [])
      const textPrompt = buildAuditPrompt(params.triggerWords || [], inventory)

      const requestLlm = async ({ prompt, imagePaths = [] }) => {
        const refs = getReferenceImages(imagePaths)
        const image = refs[0] || null
        const result = await callLLM({
          prompt,
          outputFormat: 'natural',
          imageBase64: image?.imageBase64 || undefined,
          mimeType: image?.mimeType || 'image/jpeg',
          temperature: 0.2,
          maxTokens: 2000,
        })
        const raw = result.natural || result.raw || ''
        return parseDecisions(raw)
      }

      const { textResult, decisions } = await auditInventory({
        inventory,
        triggerWords: params.triggerWords || [],
        referenceImagePaths: params.referenceImagePaths || [],
        requestLlm,
      })

      return {
        success: true,
        data: {
          items,
          inventory,
          decisions,
          raw: textResult,
        },
      }
    } catch (e) {
      return { success: false, error: e.message || String(e) }
    }
  })

  ipcMain.handle('characterAudit:apply', async (_event, params = {}) => {
    try {
      await ensureDb()
      const items = params.items || []
      const decisions = params.decisions || []
      const parentByChild = new Map(Object.entries(params.parentByChild || {}))
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
