import { describe, expect, it } from 'vitest'
import { isBenignRendererError } from './renderer-errors'

describe('benign renderer errors', () => {
  it('ignores ResizeObserver delivery loops so they do not freeze the status bar', () => {
    expect(isBenignRendererError('ResizeObserver loop completed with undelivered notifications.')).toBe(true)
    expect(isBenignRendererError('ResizeObserver loop limit exceeded')).toBe(true)
    expect(isBenignRendererError('Cannot read properties of null')).toBe(false)
  })
})
