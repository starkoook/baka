import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

describe('reverse result state', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('keeps tags, natural description, and drawing prompt separate', async () => {
    const reverseModule = await import('../reverse').catch(() => null)
    expect(reverseModule).not.toBeNull()
    if (!reverseModule) return

    const store = reverseModule.useReverseStore()
    store.setResult({
      tags: ['1girl', 'blue eyes'],
      naturalText: 'A girl looks toward the viewer.',
      drawingPrompt: 'masterpiece, cinematic light',
    })

    expect(store.tags).toEqual(['1girl', 'blue eyes'])
    expect(store.naturalText).toBe('A girl looks toward the viewer.')
    expect(store.drawingPrompt).toBe('masterpiece, cinematic light')
  })

  it('restores the latest result after the store is recreated', async () => {
    const reverseModule = await import('../reverse').catch(() => null)
    expect(reverseModule).not.toBeNull()
    if (!reverseModule) return

    const first = reverseModule.useReverseStore()
    first.imagePath = 'D:\\images\\sample.png'
    first.setResult({ tags: ['solo'], naturalText: 'Portrait.', drawingPrompt: 'portrait lighting' })
    first.persist()

    setActivePinia(createPinia())
    const restored = reverseModule.useReverseStore()
    restored.restore()

    expect(restored.imagePath).toBe('D:\\images\\sample.png')
    expect(restored.tags).toEqual(['solo'])
    expect(restored.naturalText).toBe('Portrait.')
    expect(restored.drawingPrompt).toBe('portrait lighting')
  })
})
