const { fixSubjectCount, mergeChildTags } = require('./character-tag-decisions')

function buildInventory(items) {
  const counts = new Map()
  const imagesByTag = new Map()
  for (const item of items || []) {
    for (const tag of item.tags || []) {
      const key = tag.toLowerCase()
      counts.set(key, (counts.get(key) || 0) + 1)
      if (!imagesByTag.has(key)) imagesByTag.set(key, [])
      imagesByTag.get(key).push(item.path)
    }
  }
  return [...counts.entries()].map(([tag, count]) => ({ tag, count, paths: imagesByTag.get(tag) || [] }))
}

function applyInventoryDecisions(items, decisions, parentByChild = new Map()) {
  const replaceMap = new Map()
  const deleteSet = new Set()
  for (const decision of decisions || []) {
    if (decision.type === 'replace' && decision.target) {
      replaceMap.set(decision.tag.toLowerCase(), decision.target)
    } else if (decision.type === 'delete') {
      deleteSet.add(decision.tag.toLowerCase())
    }
  }

  return (items || []).map(item => {
    let tags = item.tags || []
    tags = tags.filter(tag => !deleteSet.has(tag.toLowerCase()))
    tags = tags.map(tag => replaceMap.get(tag.toLowerCase()) || tag)
    tags = fixSubjectCount(tags)
    tags = mergeChildTags(tags, parentByChild)
    return { ...item, tags: [...new Set(tags)] }
  })
}

async function auditInventory({ inventory, triggerWords, referenceImagePaths = [], requestLlm }) {
  if (!requestLlm) throw new Error('requestLlm is required')
  const textPrompt = `Audit these character tags for trigger words: ${triggerWords.join(', ')}.\nTags: ${inventory.map(item => item.tag).join(', ')}`
  const textResult = await requestLlm({ prompt: textPrompt, imagePaths: referenceImagePaths })
  const decisions = Array.isArray(textResult) ? textResult : []
  return { textResult, decisions }
}

module.exports = { buildInventory, applyInventoryDecisions, auditInventory }
