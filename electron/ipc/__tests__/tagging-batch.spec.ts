import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyPostprocessOptions, applyWriteMode, mapLimit } from '../tagging-batch.js'

describe('tagging batch postprocess and write modes', () => {
  it('cleans, deduplicates, and applies prefix/suffix', () => {
    expect(applyPostprocessOptions(
      ['1girl', '<think>ignore</think>', 'long_hair', 'long_hair', '  blue_eyes'],
      { prefix: 'anime', suffix: 'style', replaceUnderscores: true },
    )).toEqual(['anime 1girl style', 'anime long hair style', 'anime blue eyes style'])
  })

  it('applies all write modes', () => {
    const existing = ['1girl', 'long_hair']
    expect(applyWriteMode(existing, ['blue_eyes'], 'replace')).toEqual(['blue_eyes'])
    expect(applyWriteMode(existing, ['blue_eyes'], 'append')).toEqual(['1girl', 'long_hair', 'blue_eyes'])
    expect(applyWriteMode(existing, ['blue_eyes'], 'skip_existing')).toEqual(existing)
    expect(applyWriteMode([], ['blue_eyes'], 'empty_only')).toEqual(['blue_eyes'])
  })
})

describe('mapLimit rate limiting', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('starts each item no sooner than the configured interval', async () => {
    const worker = vi.fn(async (item: number) => item * 2)
    const run = mapLimit([1, 2, 3], 2, worker, { intervalMs: 100 })

    expect(worker).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(99)
    expect(worker).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(worker).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(100)
    expect(worker).toHaveBeenCalledTimes(3)

    const results = await run
    expect(results).toEqual([2, 4, 6])
  })

  it('starts all workers immediately when intervalMs is 0', async () => {
    const worker = vi.fn(async (item: number) => item)
    const run = mapLimit([1, 2, 3], 3, worker, { intervalMs: 0 })

    await vi.advanceTimersByTimeAsync(0)
    expect(worker).toHaveBeenCalledTimes(3)

    const results = await run
    expect(results).toEqual([1, 2, 3])
  })
})
