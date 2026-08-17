import { describe, expect, it } from 'vitest'
import { buildExtractCommand, buildConvertCommand, parseProbe } from '../video-processing.js'

describe('video processing command builder', () => {
  it('builds all-frame extraction', () => {
    expect(buildExtractCommand('in.mp4', 'frame-%05d.jpg', { mode: 'all' })).toEqual(['-i', 'in.mp4', 'frame-%05d.jpg'])
  })

  it('builds fps extraction', () => {
    expect(buildExtractCommand('in.mp4', 'frame-%05d.jpg', { mode: 'fps', fps: 2 })).toContain('fps=2')
  })

  it('builds conversion command', () => {
    expect(buildConvertCommand('in.mkv', 'out.mp4', { codec: 'h264' })).toEqual(['-i', 'in.mkv', '-c:v', 'libx264', 'out.mp4'])
  })

  it('parses probe output', () => {
    const info = parseProbe({
      streams: [{ codec_type: 'video', avg_frame_rate: '30000/1001', width: 1920, height: 1080 }],
      format: { duration: '12.5' },
    })
    expect(info.fps).toBeCloseTo(29.97)
    expect(info.width).toBe(1920)
    expect(info.height).toBe(1080)
    expect(info.duration).toBe(12.5)
  })
})
