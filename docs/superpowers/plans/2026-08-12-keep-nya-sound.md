# Keep Nya Sound Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the short “nya” click voice, restore a short synthesized success sound, and prevent audio playback rejections from leaking.

**Architecture:** Keep the existing composable API and settings behavior. Replace randomized voice pools with one reusable click audio element, generate success/hover cues through Web Audio, and isolate safe audio playback in a tiny exported helper that can be tested with fake audio objects.

**Tech Stack:** Vue 3 composable, browser HTMLAudioElement/Web Audio API, TypeScript 6, Vitest/jsdom.

---

## File map

- Modify `src/composables/useSound.ts` — one “nya” clip, safe playback, synthesized success cue.
- Create `src/composables/__tests__/useSound.spec.ts` — sound choice and rejection handling.
- Delete `src/assets/sounds/click-giggle-1.mp3`, `src/assets/sounds/click-giggle-2.mp3`, `src/assets/sounds/success-nyuu.mp3`, `src/assets/sounds/success-mahou.mp3` only after imports are removed and repository-wide search confirms they are unused.

### Task 1: Lock click and success behavior with tests

**Files:**
- Create: `src/composables/__tests__/useSound.spec.ts`
- Modify: `src/composables/useSound.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

class FakeAudio {
  static sources: string[] = []
  currentTime = 0
  volume = 1
  preload = ''
  constructor(public src: string) { FakeAudio.sources.push(src) }
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
    const audio = { pause: vi.fn(), currentTime: 2, play: vi.fn(() => Promise.reject(new Error('blocked'))) }
    await expect(sound.restartAudio(audio as any)).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm.cmd test -- src/composables/__tests__/useSound.spec.ts`

Expected: FAIL because three click clips load and `restartAudio` is not exported.

- [ ] **Step 3: Replace randomized clips with one safe click clip**

Keep only:

```ts
import clickNyaUrl from '@/assets/sounds/click-nya.mp3'

const clickAudio = new Audio(clickNyaUrl)
clickAudio.volume = 0.5
clickAudio.preload = 'auto'

export async function restartAudio(audio: Pick<HTMLAudioElement, 'pause' | 'currentTime' | 'play'>) {
  try {
    audio.pause()
    audio.currentTime = 0
    await audio.play()
  } catch {
    // Autoplay can be blocked; sound failure must never break the UI.
  }
}

export function playClick() {
  if (soundEnabled) void restartAudio(clickAudio)
}
```

Read local storage with a browser guard:

```ts
let soundEnabled = typeof localStorage === 'undefined' || localStorage.getItem('baka-sound-enabled') !== 'off'
```

- [ ] **Step 4: Restore a short synthesized success cue**

Factor a reusable oscillator cue helper:

```ts
function playTone(start: number, end: number, duration: number, volume: number) {
  if (!soundEnabled) return
  try {
    const ctx = getAudioContext()
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(start, t)
    osc.frequency.exponentialRampToValueAtTime(end, t + duration)
    gain.gain.setValueAtTime(volume, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + duration)
  } catch {}
}

export function playSuccess() { playTone(880, 1320, 0.14, 0.055) }
export function playHover() { playTone(1760, 2200, 0.05, 0.035) }
```

- [ ] **Step 5: Verify GREEN**

Run: `npm.cmd test -- src/composables/__tests__/useSound.spec.ts`

Expected: PASS with no unhandled rejection.

- [ ] **Step 6: Remove orphaned long clips**

Run: `rg -n "click-giggle|success-nyuu|success-mahou" src`

Expected: no matches.

Delete only these now-unused files:

```text
src/assets/sounds/click-giggle-1.mp3
src/assets/sounds/click-giggle-2.mp3
src/assets/sounds/success-nyuu.mp3
src/assets/sounds/success-mahou.mp3
```

- [ ] **Step 7: Run regression checks**

Run: `npm.cmd test -- src/composables/__tests__/useSound.spec.ts src/components/sidebar/__tests__/AppSidebar.spec.ts`

Run: `npm.cmd run typecheck`

Run: `npm.cmd run build`

Expected: all commands exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/composables/useSound.ts src/composables/__tests__/useSound.spec.ts src/assets/sounds/click-giggle-1.mp3 src/assets/sounds/click-giggle-2.mp3 src/assets/sounds/success-nyuu.mp3 src/assets/sounds/success-mahou.mp3
git commit -m "fix(sound): keep nya click and short success cue"
```
