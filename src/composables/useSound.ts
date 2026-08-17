import clickNyaUrl from '@/assets/sounds/click-nya.mp3'

let soundEnabled = typeof localStorage === 'undefined' || localStorage.getItem('baka-sound-enabled') !== 'off'

export function setSoundEnabled(value: boolean) {
  soundEnabled = value
}

const clickAudio = new Audio(clickNyaUrl)
clickAudio.volume = 0.5
clickAudio.preload = 'auto'

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
  if (soundEnabled) void restartAudio(clickAudio)
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
