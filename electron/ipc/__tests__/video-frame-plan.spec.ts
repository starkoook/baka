import { describe, expect, it } from 'vitest'
import { parseFps, distributedFrameIndexes, regionalFrameIndexes, randomPercentFrameIndexes, buildSelectFilter } from '../video-frame-plan.js'

describe('video frame plan', () => {
  it('parses fps', () => {
    expect(parseFps('30/1')).toBe(30)
    expect(parseFps('0/0')).toBe(0)
    expect(parseFps('23.976')).toBeCloseTo(23.976)
  })

  it('builds distributed and regional indexes', () => {
    expect(distributedFrameIndexes(100, 3)).toEqual([0, 49, 99])
    expect(regionalFrameIndexes(100, 4).length).toBe(4)
  })

  it('builds select filter', () => {
    expect(buildSelectFilter([0, 10, 20])).toBe('eq(n,0)+eq(n,10)+eq(n,20)')
  })

  it('creates random percentage frame indexes', () => {
    expect(randomPercentFrameIndexes(100, 10, 1).length).toBe(10)
  })
})
