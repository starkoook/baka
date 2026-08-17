function fixSubjectCount(tags) {
  const result = [...tags]
  if (result.includes('solo') && result.some(tag => /^\d+girls?$/.test(tag))) {
    result.splice(result.indexOf('solo'), 1)
  }
  return result
}

function mergeChildTags(tags, parentByChild) {
  return tags.filter(tag => {
    const parent = parentByChild.get(tag.toLowerCase())
    return !parent || !tags.includes(parent)
  })
}

module.exports = { fixSubjectCount, mergeChildTags }
