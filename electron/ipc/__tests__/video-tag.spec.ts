import { describe, expect, it } from 'vitest'
import { summarizeTags } from '../video-tag.js'

describe('video tag summary', () => {
  it('counts tags across frames and sorts by frequency', () => {
    const frames = ['frame-1.jpg', 'frame-2.jpg', 'frame-3.jpg']
    const frameTags = new Map<string, string[]>([
      ['frame-1.jpg', ['1girl', 'long hair']],
      ['frame-2.jpg', ['1girl', 'blue eyes']],
      ['frame-3.jpg', ['1girl', 'solo']],
    ])
    const tags = summarizeTags(frames, frameTags)
    expect(tags[0]).toEqual({ tag: '1girl', count: 3, frequency: 1 })
    expect(tags).toContainEqual({ tag: 'long hair', count: 1, frequency: 1 / 3 })
  })
})
