import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '../app'

afterEach(() => {
  vi.useRealTimers()
})

describe('app store errors', () => {
  it('clears error history without changing ordinary error dismissal semantics', () => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    const appStore = useAppStore()

    appStore.setError('first failure')
    appStore.setError('second failure')

    expect(appStore.errorCount).toBe(2)

    appStore.clearErrorHistory()

    expect(appStore.errorCount).toBe(0)
    expect(appStore.lastError).toBe('')
    expect(appStore.status).toBe('就绪')
    vi.runOnlyPendingTimers()
  })
})
