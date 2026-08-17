function normalizeTags(tags) {
  return [...new Set((tags || []).map((tag) => String(tag).trim()).filter(Boolean))]
}

function mergeTagLists(a, b, strategy = 'union') {
  const setA = normalizeTags(a)
  const setB = normalizeTags(b)
  const keysB = new Set(setB.map((tag) => tag.toLowerCase()))

  if (strategy === 'intersect') return setA.filter((tag) => keysB.has(tag.toLowerCase()))
  if (strategy === 'difference') return setA.filter((tag) => !keysB.has(tag.toLowerCase()))
  if (strategy === 'a_only') return setA
  if (strategy === 'b_only') return setB

  const seen = new Set()
  const merged = []
  for (const tag of [...setA, ...setB]) {
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(tag)
  }
  return merged
}

module.exports = { mergeTagLists, normalizeTags }
