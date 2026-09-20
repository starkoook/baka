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

  it('defaults to one consistent character and every character has all eight lines', async () => {
    const sound = await import('../useSound')

    expect(sound.getSoundPack()).toBe('hau')
    for (const pack of ['hau', 'metan', 'bii'] as const) {
      expect(sound.clipsOf(pack).map((clip) => clip.label)).toEqual(sound.VOICE_LINES.map((line) => line.text))
    }
    expect(sound.clipsOf('nya')).toHaveLength(1)
    expect(sound.clipsOf('all')).toHaveLength(1 + 3 * 8)
  })

  it('keeps the classic nya-only pack when the user asks for it', async () => {
    localStorage.setItem('baka-sound-pack', 'nya')
    const sound = await import('../useSound')

    for (let i = 0; i < 5; i++) sound.playClick()

    expect(FakeAudio.sources).toHaveLength(1)
    expect(FakeAudio.sources[0]).toContain('click-nya')
  })

  it('rotates inside the chosen character pack without repeating the previous line', async () => {
    localStorage.setItem('baka-sound-pack', 'metan')
    const sound = await import('../useSound')

    const seen: string[] = []
    for (let i = 0; i < 40; i++) seen.push(sound.pickClip().id)

    expect(seen.every((id) => id.startsWith('metan-'))).toBe(true)
    expect(new Set(seen).size).toBeGreaterThan(3)
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1])
  })

  it('falls back to the default pack for unknown or legacy values and persists changes', async () => {
    localStorage.setItem('baka-sound-pack', 'jp')
    const sound = await import('../useSound')
    expect(sound.getSoundPack()).toBe('hau')

    sound.setSoundPack('bii')
    expect(localStorage.getItem('baka-sound-pack')).toBe('bii')
    expect(sound.getSoundPack()).toBe('bii')
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
