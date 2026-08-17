export interface SearchClause {
  include: string[]
  exclude: string[]
}

export function parseSearchQuery(query: string): SearchClause[] {
  const raw = String(query || '').trim()
  if (!raw) return []

  const clauses: SearchClause[] = []
  for (const part of raw.split('|')) {
    const include: string[] = []
    const exclude: string[] = []
    for (const token of part.trim().split(/\s+/)) {
      if (!token) continue
      if (token.startsWith('-') && token.length > 1) exclude.push(token.slice(1).toLowerCase())
      else include.push(token.toLowerCase())
    }
    if (include.length || exclude.length) clauses.push({ include, exclude })
  }
  return clauses
}

export function matchesQuery(searchText: string, clauses: SearchClause[]): boolean {
  if (clauses.length === 0) return true
  const text = String(searchText || '').toLowerCase()
  return clauses.some((clause) => {
    const includeOk = clause.include.every((term) => text.includes(term))
    const excludeOk = clause.exclude.every((term) => !text.includes(term))
    return includeOk && excludeOk
  })
}
