import { isProxy, toRaw } from 'vue'

function jsonReplacer(_key: string, value: unknown) {
  if (typeof value === 'function') return undefined
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack }
  }
  return value
}

function unwrapDeep(value: unknown, seen: WeakSet<object>): unknown {
  if (value == null || typeof value !== 'object') return value
  if (typeof value === 'function') return undefined
  if (value instanceof Error) {
    return {
      name: value.name,
      message: String(value.message || ''),
      stack: value.stack ? String(value.stack) : undefined,
    }
  }
  if (seen.has(value as object)) return null
  seen.add(value as object)

  let raw: unknown = value
  try {
    if (isProxy(value)) raw = toRaw(value)
  } catch {
    raw = value
  }
  if (raw !== value) {
    seen.delete(value as object)
    return unwrapDeep(raw, seen)
  }

  if (Array.isArray(raw)) return raw.map((item) => unwrapDeep(item, seen))
  if (raw instanceof Date) return raw.toISOString()

  const proto = Object.getPrototypeOf(raw)
  if (proto !== Object.prototype && proto !== null) {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(raw as object)) {
      out[key] = unwrapDeep((raw as Record<string, unknown>)[key], seen)
    }
    return out
  }

  const out: Record<string, unknown> = {}
  for (const key of Object.keys(raw as object)) {
    const next = unwrapDeep((raw as Record<string, unknown>)[key], seen)
    if (typeof next !== 'function') out[key] = next
  }
  return out
}

/** Vue Proxy / Error / function → JSON-serializable plain object for Electron IPC. */
export function toIpcPayload<T>(value: T): T {
  const plain = unwrapDeep(value, new WeakSet())
  try {
    return JSON.parse(JSON.stringify(plain, jsonReplacer)) as T
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error('IPC payload is not JSON-serializable: ' + message)
  }
}

export function toPlainLogEntry(entry: {
  type?: unknown
  message?: unknown
  time?: unknown
  source?: unknown
} | null | undefined) {
  const source = entry && typeof entry === 'object' ? entry : { message: entry }
  let raw: any = source
  try {
    const unwrapped = source && typeof source === 'object' && isProxy(source) ? toRaw(source) : source
    const message = unwrapped && typeof unwrapped === 'object' && unwrapped.message instanceof Error
      ? unwrapped.message.message
      : unwrapped && typeof unwrapped === 'object'
        ? unwrapped.message
        : unwrapped
    raw = toIpcPayload({
      type: unwrapped && typeof unwrapped === 'object' ? unwrapped.type : undefined,
      message,
      time: unwrapped && typeof unwrapped === 'object' ? unwrapped.time : undefined,
      source: unwrapped && typeof unwrapped === 'object' ? unwrapped.source : undefined,
    })
  } catch {
    raw = {
      type: (source as any)?.type,
      message: (source as any)?.message instanceof Error
        ? (source as any).message.message
        : String((source as any)?.message ?? source ?? ''),
      time: (source as any)?.time,
      source: (source as any)?.source,
    }
  }
  return {
    type: String(raw?.type ?? ''),
    message: raw?.message instanceof Error ? raw.message.message : String(raw?.message ?? ''),
    time: raw?.time == null || raw?.time === '' ? undefined : String(raw.time),
    source: raw?.source == null || raw?.source === '' ? undefined : String(raw.source),
  }
}
