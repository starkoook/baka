// 二次元风格音效：用 Web Audio API 实时合成，不需要外部音频文件
let audioCtx: AudioContext | null = null
let soundEnabled = true

export function setSoundEnabled(value: boolean) {
  soundEnabled = value
}

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext()
    if (audioCtx.state === 'suspended') void audioCtx.resume()
  }
  return audioCtx
}

// 点击：明亮的上滑 "piko"（三角波 + 泛音，像游戏里的小弹跳音）
export function playClick() {
  if (!soundEnabled) return
  try {
    const ctx = getCtx()
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const osc2 = ctx.createOscillator()
    const gain = ctx.createGain()
    const gain2 = ctx.createGain()

    osc.type = 'triangle'
    osc.frequency.setValueAtTime(880, t)
    osc.frequency.exponentialRampToValueAtTime(1480, t + 0.06)
    gain.gain.setValueAtTime(0.16, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12)

    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(1760, t)
    osc2.frequency.exponentialRampToValueAtTime(2640, t + 0.05)
    gain2.gain.setValueAtTime(0.05, t)
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.08)

    osc.connect(gain).connect(ctx.destination)
    osc2.connect(gain2).connect(ctx.destination)

    osc.start(t)
    osc.stop(t + 0.12)
    osc2.start(t)
    osc2.stop(t + 0.08)
  } catch (_) {}
}

// 悬停：极轻的高音 "tick"（像小铃铛碰一下）
export function playHover() {
  if (!soundEnabled) return
  try {
    const ctx = getCtx()
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

// 成功：清脆的 C6-E6-G6 上行叮咚（带一点闪闪的泛音）
export function playSuccess() {
  if (!soundEnabled) return
  try {
    const ctx = getCtx()
    const notes = [1047, 1319, 1568] // C6, E6, G6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const osc2 = ctx.createOscillator()
      const gain = ctx.createGain()
      const gain2 = ctx.createGain()
      osc.type = 'triangle'
      osc2.type = 'sine'
      const t = ctx.currentTime + i * 0.08
      osc.frequency.setValueAtTime(freq, t)
      osc2.frequency.setValueAtTime(freq * 2, t)
      gain.gain.setValueAtTime(0.11, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16)
      gain2.gain.setValueAtTime(0.04, t)
      gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.1)
      osc.connect(gain).connect(ctx.destination)
      osc2.connect(gain2).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.16)
      osc2.start(t)
      osc2.stop(t + 0.1)
    })
  } catch (_) {}
}
