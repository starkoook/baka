import clickNyaUrl from '@/assets/sounds/click-nya.mp3'
import hauEhehe from '@/assets/sounds/hau-ehehe.mp3'
import hauHai from '@/assets/sounds/hau-hai.mp3'
import hauIkuyo from '@/assets/sounds/hau-ikuyo.mp3'
import hauNyan from '@/assets/sounds/hau-nyan.mp3'
import hauOkke from '@/assets/sounds/hau-okke.mp3'
import hauPochi from '@/assets/sounds/hau-pochi.mp3'
import hauUn from '@/assets/sounds/hau-un.mp3'
import hauYatta from '@/assets/sounds/hau-yatta.mp3'
import metanEhehe from '@/assets/sounds/metan-ehehe.mp3'
import metanHai from '@/assets/sounds/metan-hai.mp3'
import metanIkuyo from '@/assets/sounds/metan-ikuyo.mp3'
import metanNyan from '@/assets/sounds/metan-nyan.mp3'
import metanOkke from '@/assets/sounds/metan-okke.mp3'
import metanPochi from '@/assets/sounds/metan-pochi.mp3'
import metanUn from '@/assets/sounds/metan-un.mp3'
import metanYatta from '@/assets/sounds/metan-yatta.mp3'
import biiEhehe from '@/assets/sounds/bii-ehehe.mp3'
import biiHai from '@/assets/sounds/bii-hai.mp3'
import biiIkuyo from '@/assets/sounds/bii-ikuyo.mp3'
import biiNyan from '@/assets/sounds/bii-nyan.mp3'
import biiOkke from '@/assets/sounds/bii-okke.mp3'
import biiPochi from '@/assets/sounds/bii-pochi.mp3'
import biiUn from '@/assets/sounds/bii-un.mp3'
import biiYatta from '@/assets/sounds/bii-yatta.mp3'

/**
 * 音色包：一个角色一套 8 句短语，'all' 是所有角色 + 喵 一起随机。
 * 日语短句由 VOICEVOX 合成（雨晴はう / 四国めたん / 猫使ビィ），出处见 THIRD_PARTY_NOTICES.md。
 */
export type SoundPack = 'all' | 'nya' | 'hau' | 'metan' | 'bii'
export const SOUND_PACK_KEY = 'baka-sound-pack'
export const DEFAULT_SOUND_PACK: SoundPack = 'hau'
export const SOUND_PACKS: { value: SoundPack; label: string; description: string; credit?: string }[] = [
  { value: 'hau', label: '雨晴はう', description: '软软的、慢半拍的小声音', credit: 'VOICEVOX:雨晴はう' },
  { value: 'metan', label: '四国めたん', description: '甜甜的、带点撒娇', credit: 'VOICEVOX:四国めたん' },
  { value: 'bii', label: '猫使ビィ', description: '猫猫系，音调更高更元气', credit: 'VOICEVOX:猫使ビィ' },
  { value: 'nya', label: '只要喵', description: '经典 nya～' },
  { value: 'all', label: '全部随机', description: '三个角色 + 喵 轮着来' },
]

/** 八句短语的固定顺序与显示文字 */
export const VOICE_LINES: { key: string; text: string }[] = [
  { key: 'hai', text: 'はいっ！' },
  { key: 'okke', text: 'おっけー！' },
  { key: 'pochi', text: 'ぽちっ！' },
  { key: 'un', text: 'うんっ！' },
  { key: 'ikuyo', text: 'いくよー！' },
  { key: 'ehehe', text: 'えへへっ' },
  { key: 'yatta', text: 'やったー！' },
  { key: 'nyan', text: 'にゃん！' },
]

interface VoiceClip {
  id: string
  pack: Exclude<SoundPack, 'all'>
  label: string
  url: string
  /** 单独微调音量，让每一句听起来差不多响 */
  gain: number
}

function characterPack(pack: Exclude<SoundPack, 'all' | 'nya'>, urls: Record<string, string>): VoiceClip[] {
  return VOICE_LINES.map((line) => ({ id: `${pack}-${line.key}`, pack, label: line.text, url: urls[line.key], gain: 0.55 }))
}

export const VOICE_CLIPS: readonly VoiceClip[] = [
  { id: 'nya', pack: 'nya', label: 'nya～', url: clickNyaUrl, gain: 0.5 },
  ...characterPack('hau', { hai: hauHai, okke: hauOkke, pochi: hauPochi, un: hauUn, ikuyo: hauIkuyo, ehehe: hauEhehe, yatta: hauYatta, nyan: hauNyan }),
  ...characterPack('metan', { hai: metanHai, okke: metanOkke, pochi: metanPochi, un: metanUn, ikuyo: metanIkuyo, ehehe: metanEhehe, yatta: metanYatta, nyan: metanNyan }),
  ...characterPack('bii', { hai: biiHai, okke: biiOkke, pochi: biiPochi, un: biiUn, ikuyo: biiIkuyo, ehehe: biiEhehe, yatta: biiYatta, nyan: biiNyan }),
]

function readStorage(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key)
  } catch {
    return null
  }
}

function normalizePack(value: string | null): SoundPack {
  return SOUND_PACKS.some((pack) => pack.value === value) ? (value as SoundPack) : DEFAULT_SOUND_PACK
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

export function clipsOf(pack: SoundPack): VoiceClip[] {
  return VOICE_CLIPS.filter((clip) => pack === 'all' || clip.pack === pack)
}

export function pickClip(pack: SoundPack = soundPack, random: () => number = Math.random): VoiceClip {
  const pool = clipsOf(pack)
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
