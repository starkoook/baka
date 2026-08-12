// 二次元萌系语音音效：内置 CC0 免费语音（Freesound），点击/成功时随机播放
import clickNyaUrl from '@/assets/sounds/click-nya.mp3'
import clickGiggle1Url from '@/assets/sounds/click-giggle-1.mp3'
import clickGiggle2Url from '@/assets/sounds/click-giggle-2.mp3'
import successNyuuUrl from '@/assets/sounds/success-nyuu.mp3'
import successMahouUrl from '@/assets/sounds/success-mahou.mp3'

let soundEnabled = true

export function setSoundEnabled(value: boolean) {
  soundEnabled = value
}

interface VoiceClip {
  el: HTMLAudioElement
}

// 预创建音频对象，点击时直接重播，避免反复创建导致的卡顿
const clickClips: VoiceClip[] = [
  { el: new Audio(clickNyaUrl) },
  { el: new Audio(clickGiggle1Url) },
  { el: new Audio(clickGiggle2Url) },
]
const successClips: VoiceClip[] = [
  { el: new Audio(successNyuuUrl) },
  { el: new Audio(successMahouUrl) },
]

for (const clip of clickClips) {
  clip.el.volume = 0.5
  clip.el.preload = 'auto'
}
for (const clip of successClips) {
  clip.el.volume = 0.65
  clip.el.preload = 'auto'
}

let lastClick = -1
let hoverCtx: AudioContext | null = null

function getHoverCtx(): AudioContext {
  if (!hoverCtx) {
    hoverCtx = new AudioContext()
    if (hoverCtx.state === 'suspended') void hoverCtx.resume()
  }
  return hoverCtx
}

// 随机选一条语音播放，尽量不和上一条重复；快速连点时打断上一段，避免声音叠在一起
function playRandom(clips: VoiceClip[]) {
  if (!soundEnabled || clips.length === 0) return
  let idx = Math.floor(Math.random() * clips.length)
  if (clips.length > 1 && idx === lastClick) idx = (idx + 1) % clips.length
  lastClick = idx
  const audio = clips[idx].el
  try {
    audio.pause()
    audio.currentTime = 0
    void audio.play()
  } catch (_) {}
}

// 点击：随机萌音（nya / 可爱笑声）
export function playClick() {
  playRandom(clickClips)
}

// 悬停：极轻的高音 "tick"（用小铃铛碰一下的感觉），不做成语音避免每移一次都说话
export function playHover() {
  if (!soundEnabled) return
  try {
    const ctx = getHoverCtx()
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(1760, t)
    osc.frequency.exponentialRampToValueAtTime(2200, t + 0.03)
    gain.gain.setValueAtTime(0.035, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05)

    osc.connect(gain).connect(ctx.destination)

    osc.start(t)
    osc.stop(t + 0.05)
  } catch (_) {}
}

// 成功：随机一条魔法少女/猫娘语音
export function playSuccess() {
  playRandom(successClips)
}
