import { beforeEach, describe, expect, it, vi } from 'vitest'

class FakeAudio {
  static sources: string[] = []
  currentTime = 0
  volume = 1
  preload = ''

  constructor(public src: string) {
    FakeAudio.sources.push(src)
  }

  pause = vi.fn()
  play = vi.fn(() => Promise.resolve())
}

describe('character sound policy', () => {
  beforeEach(() => {
    vi.resetModules()
    FakeAudio.sources = []
    vi.stubGlobal('Audio', FakeAudio)
    localStorage.setItem('baka-sound-enabled', 'on')
  })

  it('loads only the short nya voice clip', async () => {
    const sound = await import('../useSound')

    sound.playClick()

    expect(FakeAudio.sources).toHaveLength(1)
    expect(FakeAudio.sources[0]).toContain('click-nya')
  })

  it('swallows a rejected audio play promise', async () => {
    const sound = await import('../useSound')
    const audio = {
      pause: vi.fn(),
      currentTime: 2,
      play: vi.fn(() => Promise.reject(new Error('blocked'))),
    }

    await expect(sound.restartAudio(audio as any)).resolves.toBeUndefined()
  })
})
