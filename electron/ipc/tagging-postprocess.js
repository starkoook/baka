function parseStructuredOutput(raw) {
  const tagsMatch = String(raw || '').match(/<TAGS>([\s\S]*?)<\/TAGS>/i)
  const nlMatch = String(raw || '').match(/<NL>([\s\S]*?)<\/NL>/i)
  return {
    tags: parseTagText(tagsMatch?.[1] || ''),
    natural: (nlMatch?.[1] || '').trim(),
  }
}

function parseTagText(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[`\\]/g, '')
    .split(/[\n\r;，,]+/)
    .map(tag => tag.replace(/^[\s\-*.)]+/, '').replace(/["']/g, '').trim())
    .filter(Boolean)
}

function postprocessTags(tags, options = {}) {
  const seen = new Set()
  const result = []
  for (const tag of tags || []) {
    let value = String(tag).trim()
    if (!value || seen.has(value.toLowerCase())) continue
    seen.add(value.toLowerCase())
    if (options.replaceUnderscores) value = value.replace(/_/g, ' ')
    if (options.prefix) value = `${options.prefix} ${value}`
    if (options.suffix) value = `${value} ${options.suffix}`
    result.push(value)
  }
  if (options.sort === 'alphabetical') result.sort((a, b) => a.localeCompare(b))
  return result
}

module.exports = { parseStructuredOutput, postprocessTags }
