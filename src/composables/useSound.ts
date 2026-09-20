import clickNyaUrl from '@/assets/sounds/click-nya.mp3'
import jpEheheUrl from '@/assets/sounds/jp-ehehe.mp3'
import jpHaiUrl from '@/assets/sounds/jp-hai.mp3'
import jpIkuyoUrl from '@/assets/sounds/jp-ikuyo.mp3'
import jpNyanUrl from '@/assets/sounds/jp-nyan.mp3'
import jpOkkeUrl from '@/assets/sounds/jp-okke.mp3'
import jpPochiUrl from '@/assets/sounds/jp-pochi.mp3'
import jpUnUrl from '@/assets/sounds/jp-un.mp3'
import jpYattaUrl from '@/assets/sounds/jp-yatta.mp3'

/** 音色包：喵（原版）/ 日语萌音 / 全部随机 */
export type SoundPack = 'all' | 'nya' | 'jp'
export const SOUND_PACK_KEY = 'baka-sound-pack'
export const SOUND_PACKS: { value: SoundPack; label: string; description: string }[] = [
  { value: 'all', label: '全部随机', description: '喵 + 日语萌音轮着来' },
  { value: 'jp', label: '日语萌音', description: 'はいっ / おっけー / ぽちっ / やったー…' },
  { value: 'nya', label: '只要喵', description: '经典 nya～' },
]

interface VoiceClip {
  id: string
  pack: Exclude<SoundPack, 'all'>
  url: string
  /** 单独微调音量，让每一句听起来差不多响 */
  gain: number
}

export const VOICE_CLIPS: readonly VoiceClip[] = [
  { id: 'nya', pack: 'nya', url: clickNyaUrl, gain: 0.5 },
  { id: 'jp-hai', pack: 'jp', url: jpHaiUrl, gain: 0.55 },
  { id: 'jp-okke', pack: 'jp', url: jpOkkeUrl, gain: 0.6 },
  { id: 'jp-pochi', pack: 'jp', url: jpPochiUrl, gain: 0.6 },
  { id: 'jp-un', pack: 'jp', url: jpUnUrl, gain: 0.45 },
  { id: 'jp-ikuyo', pack: 'jp', url: jpIkuyoUrl, gain: 0.6 },
  { id: 'jp-ehehe', pack: 'jp', url: jpEheheUrl, gain: 0.6 },
  { id: 'jp-yatta', pack: 'jp', url: jpYattaUrl, gain: 0.6 },
  { id: 'jp-nyan', pack: 'jp', url: jpNyanUrl, gain: 0.5 },
]

function readStorage(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key)
  } catch {
    return null
  }
}

function normalizePack(value: string | null): SoundPack {
  return value === 'nya' || value === 'jp' ? value : 'all'
}

let soundEnabled = readStorage('baka-sound-enabled') !== 'off'
let soundPack: SoundPack = normalizePack(readStorage(SOUND_PACK_KEY))

export function setSoundEnabled(value: boolean) {
  soundEnabled = value
}

export function getSoundPack(): SoundPack {
  return soundPack
}

export function setSoundPack(pack: SoundPack) {
  soundPack = normalizePack(pack)
  try {
    localStorage.setItem(SOUND_PACK_KEY, soundPack)
  } catch {}
}

/** 音频元素按需创建：只有真正播过的那句才会占内存 */
const audioCache = new Map<string, HTMLAudioElement>()
let lastClipId = ''

function getAudio(clip: VoiceClip): HTMLAudioElement {
  let audio = audioCache.get(clip.id)
  if (!audio) {
    audio = new Audio(clip.url)
    audio.volume = clip.gain
    audio.preload = 'auto'
    audioCache.set(clip.id, audio)
  }
  return audio
}

export function pickClip(pack: SoundPack = soundPack, random: () => number = Math.random): VoiceClip {
  const pool = VOICE_CLIPS.filter((clip) => pack === 'all' || clip.pack === pack)
  const candidates = pool.length > 1 ? pool.filter((clip) => clip.id !== lastClipId) : pool
  const clip = candidates[Math.floor(random() * candidates.length)] ?? pool[0]
  lastClipId = clip.id
  return clip
}

let audioContext: AudioContext | null = null
let lastHoverAt = 0

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext()
    if (audioContext.state === 'suspended') void audioContext.resume().catch(() => {})
  }
  return audioContext
}

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
  if (!soundEnabled) return
  void restartAudio(getAudio(pickClip()))
}

/** 设置页试听用：指定播放某一句 */
export function previewClip(id: string) {
  const clip = VOICE_CLIPS.find((entry) => entry.id === id)
  if (clip) void restartAudio(getAudio(clip))
}

function playTone(start: number, end: number, duration: number, volume: number) {
  if (!soundEnabled) return

  try {
    const context = getAudioContext()
    const time = context.currentTime
    const oscillator = context.createOscillator()
    const gain = context.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(start, time)
    oscillator.frequency.exponentialRampToValueAtTime(end, time + duration)
    gain.gain.setValueAtTime(volume, time)
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start(time)
    oscillator.stop(time + duration)
  } catch {}
}

export function playHover() {
  const now = performance.now()
  if (now - lastHoverAt < 90) return
  lastHoverAt = now
  playTone(1760, 2200, 0.05, 0.035)
}

export function playSuccess() {
  playTone(880, 1320, 0.14, 0.055)
}
