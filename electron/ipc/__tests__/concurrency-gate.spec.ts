import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createConcurrencyGate } from '../concurrency-gate.js'

describe('concurrency gate', () => {
  it('never runs more than the limit at once', async () => {
    const gate = createConcurrencyGate(2)
    let active = 0
    let peak = 0
    const jobs = Array.from({ length: 8 }, () => gate.run(async () => {
      active++
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 15))
      active--
    }))

    await Promise.all(jobs)
    expect(peak).toBeLessThanOrEqual(2)
    expect(active).toBe(0)
  })

  it('limits online-gallery preview fetches so a page of thumbs does not stampede the proxy', () => {
    const gallery = readFileSync(resolve(process.cwd(), 'electron/ipc/booru-gallery.js'), 'utf8')
    const main = readFileSync(resolve(process.cwd(), 'electron/main.js'), 'utf8')
    expect(gallery).toContain('createConcurrencyGate(8)')
    expect(gallery).toContain('fetchBooruPreview')
    expect(main).toContain('fetchBooruPreview')
  })
})
