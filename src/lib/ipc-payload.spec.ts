import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import { toIpcPayload, toPlainLogEntry } from './ipc-payload'

describe('toIpcPayload', () => {
  it('unwraps vue reactive proxies into structured-cloneable data', () => {
    const payload = reactive({
      imagePaths: ['a.png', 'b.png'],
      providers: ['cpu'],
      padColor: [255, 255, 255],
      nested: { id: 'cfg-1' },
    })
    expect(() => structuredClone(payload)).toThrow()
    const plain = toIpcPayload(payload)
    expect(plain).toEqual({
      imagePaths: ['a.png', 'b.png'],
      providers: ['cpu'],
      padColor: [255, 255, 255],
      nested: { id: 'cfg-1' },
    })
    expect(structuredClone(plain)).toEqual(plain)
  })

  it('serializes Error instances instead of dropping them', () => {
    const plain = toIpcPayload({ error: new Error('boom') })
    expect(plain.error).toMatchObject({ name: 'Error', message: 'boom' })
    expect(structuredClone(plain).error.message).toBe('boom')
  })

  it('drops functions', () => {
    const plain = toIpcPayload({ a: 1, fn: () => 2 })
    expect(plain).toEqual({ a: 1 })
  })
})

describe('toPlainLogEntry', () => {
  it('clones a reactive log entry into primitives', () => {
    const entry = reactive({ type: 'error', message: 'x', time: '01:00:00', source: 'tagging' })
    const plain = toPlainLogEntry(entry)
    expect(plain).toEqual({ type: 'error', message: 'x', time: '01:00:00', source: 'tagging' })
    expect(structuredClone(plain)).toEqual(plain)
  })

  it('stringifies Error messages', () => {
    const plain = toPlainLogEntry({ type: 'error', message: new Error('fail') })
    expect(plain.message).toBe('fail')
  })
})
