import { beforeEach, describe, expect, it, vi } from 'vitest'

class FakeAudio {
  static sources: string[] = []
  static played: string[] = []
  currentTime = 0
  volume = 1
  preload = ''

  constructor(public src: string) {
    FakeAudio.sources.push(src)
  }

  pause = vi.fn()
  play = vi.fn(() => {
    FakeAudio.played.push(this.src)
    return Promise.resolve()
  })
}

describe('character sound policy', () => {
  beforeEach(() => {
    vi.resetModules()
    FakeAudio.sources = []
    FakeAudio.played = []
    vi.stubGlobal('Audio', FakeAudio)
    localStorage.clear()
    localStorage.setItem('baka-sound-enabled', 'on')
  })

  it('creates audio lazily: one click loads exactly one clip', async () => {
    const sound = await import('../useSound')

    sound.playClick()

    expect(FakeAudio.sources).toHaveLength(1)
    expect(FakeAudio.played).toHaveLength(1)
  })

  it('keeps the classic nya-only pack when the user asks for it', async () => {
    localStorage.setItem('baka-sound-pack', 'nya')
    const sound = await import('../useSound')

    for (let i = 0; i < 5; i++) sound.playClick()

    expect(FakeAudio.sources).toHaveLength(1)
    expect(FakeAudio.sources[0]).toContain('click-nya')
  })

  it('rotates through the Japanese pack without repeating the previous line', async () => {
    localStorage.setItem('baka-sound-pack', 'jp')
    const sound = await import('../useSound')

    const seen: string[] = []
    for (let i = 0; i < 40; i++) seen.push(sound.pickClip().id)

    expect(seen.every((id) => id.startsWith('jp-'))).toBe(true)
    expect(new Set(seen).size).toBeGreaterThan(3)
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1])
  })

  it('mixes nya and Japanese lines in the default pack and persists pack changes', async () => {
    const sound = await import('../useSound')
    expect(sound.getSoundPack()).toBe('all')

    const ids = new Set<string>()
    let seed = 0
    for (let i = 0; i < 9; i++) ids.add(sound.pickClip('all', () => (seed++ % 9) / 9).id)
    expect(ids.has('nya')).toBe(true)
    expect([...ids].some((id) => id.startsWith('jp-'))).toBe(true)

    sound.setSoundPack('jp')
    expect(localStorage.getItem('baka-sound-pack')).toBe('jp')
    expect(sound.getSoundPack()).toBe('jp')
  })

  it('stays silent when sound is disabled', async () => {
    localStorage.setItem('baka-sound-enabled', 'off')
    const sound = await import('../useSound')

    sound.playClick()

    expect(FakeAudio.sources).toHaveLength(0)
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
