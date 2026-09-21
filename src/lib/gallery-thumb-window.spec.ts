import { describe, expect, it } from 'vitest'
import { distanceOutsideViewport, shouldReleaseThumb } from './gallery-thumb-window'

describe('gallery thumb window', () => {
  it('measures how far a card is outside the viewport', () => {
    expect(distanceOutsideViewport({ top: -120, bottom: -40 }, { top: 0, bottom: 800 })).toBe(40)
    expect(distanceOutsideViewport({ top: 900, bottom: 1100 }, { top: 0, bottom: 800 })).toBe(100)
    expect(distanceOutsideViewport({ top: 100, bottom: 300 }, { top: 0, bottom: 800 })).toBe(0)
  })

  it('releases decoded thumbs only after they leave the overscan band', () => {
    expect(shouldReleaseThumb(true, 0, 800)).toBe(false)
    expect(shouldReleaseThumb(false, 200, 800)).toBe(false)
    expect(shouldReleaseThumb(false, 801, 800)).toBe(true)
  })
})
