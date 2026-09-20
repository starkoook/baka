import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyConflictMode, applyPostprocessOptions, applyWriteMode, mapLimit, normalizeTagEntries, pickTaggingConfigs } from '../tagging-batch.js'
import { serializeWeightedCaption } from '../tag-weight.js'

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


describe('tagging conflict and scope defaults', () => {
  it('defaults skip, overwrites, and merges as a tag-set union', () => {
    const existing = ['1girl', 'long_hair']
    expect(applyConflictMode(existing, ['blue_eyes'], 'skip')).toEqual(existing)
    expect(applyConflictMode(existing, ['blue_eyes'], 'overwrite')).toEqual(['blue_eyes'])
    expect(applyConflictMode(existing, ['blue_eyes', '1girl'], 'merge')).toEqual(['1girl', 'long_hair', 'blue_eyes'])
  })

  it('merge dedupes without treating the caption as a sentence', () => {
    expect(applyConflictMode(
      ['1girl', 'smile'],
      ['smile', 'looking at viewer'],
      'merge',
    )).toEqual(['1girl', 'smile', 'looking at viewer'])
  })


  it('mergePrefix puts incoming first and mergeSuffix keeps existing first', () => {
    const existing = ['1girl', 'long_hair']
    expect(applyWriteMode(existing, ['blue_eyes', '1girl'], 'mergePrefix')).toEqual(['blue_eyes', '1girl', 'long_hair'])
    expect(applyWriteMode(existing, ['blue_eyes', '1girl'], 'mergeSuffix')).toEqual(['1girl', 'long_hair', 'blue_eyes'])
  })

  it('keeps writeMode aliases mapped onto conflict modes', () => {
    const existing = ['1girl']
    expect(applyWriteMode(existing, ['blue_eyes'], 'skip_existing')).toEqual(existing)
    expect(applyWriteMode(existing, ['blue_eyes'], 'replace')).toEqual(['blue_eyes'])
    expect(applyWriteMode(existing, ['blue_eyes'], 'append')).toEqual(['1girl', 'blue_eyes'])
    expect(applyWriteMode([], ['blue_eyes'], 'empty_only')).toEqual(['blue_eyes'])
  })
})


describe('write helper keeps tag weights', () => {
  it('serializes weighted tags instead of dropping weight', () => {
    const entries = normalizeTagEntries([{ tag: '1girl', weight: 1.2 }, 'smile'])
    expect(serializeWeightedCaption(entries)).toBe('(1girl:1.2), smile')
  })
})

describe('pickTaggingConfigs', () => {
  const keyed = { id: 'a', name: 'GROK', provider: 'grok', apiKey: 'sk-1', model: 'grok-4' }
  const empty = { id: 'b', name: 'empty', provider: 'openai', apiKey: '', model: 'gpt-4o' }

  it('uses workbench configs that have apiKey when ids are omitted', () => {
    expect(pickTaggingConfigs([keyed, empty], undefined)).toEqual([keyed])
    expect(pickTaggingConfigs([empty], [])).toEqual([{}])
  })

  it('prefers selected ids and only falls back when none match', () => {
    expect(pickTaggingConfigs([keyed, empty], ['b'])).toEqual([empty])
    expect(pickTaggingConfigs([keyed, empty], ['missing'])).toEqual([keyed])
  })
})
