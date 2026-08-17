import { describe, expect, it } from 'vitest'
import {
  createMinimapTransform,
  minimapViewportRect,
  visibleWorldRect,
  worldToMinimap,
  minimapToWorld,
} from '../minimap'

describe('workbench minimap coordinates', () => {
  it('derives the visible world rectangle from pan and zoom without page offsets', () => {
    expect(visibleWorldRect({ x: 80, y: 40 }, 2, { w: 1000, h: 600 })).toEqual({
      x: -40,
      y: -20,
      width: 500,
      height: 300,
    })
  })

  it('keeps the viewport rectangle inside the minimap when content is smaller than the screen', () => {
    const viewport = visibleWorldRect({ x: 80, y: 80 }, 1, { w: 1200, h: 800 })
    const transform = createMinimapTransform(
      [{ x: 60, y: 60, width: 220, height: 348 }],
      viewport,
      { w: 200, h: 124 },
    )
    const rect = minimapViewportRect(viewport, transform)

    expect(rect.x).toBeGreaterThanOrEqual(0)
    expect(rect.y).toBeGreaterThanOrEqual(0)
    expect(rect.x + rect.width).toBeLessThanOrEqual(200)
    expect(rect.y + rect.height).toBeLessThanOrEqual(124)
  })

  it('round-trips minimap and world coordinates', () => {
    const viewport = { x: -400, y: -200, width: 1000, height: 700 }
    const transform = createMinimapTransform(
      [{ x: 900, y: 500, width: 240, height: 320 }],
      viewport,
      { w: 200, h: 124 },
    )
    const mini = worldToMinimap({ x: 320, y: 180 }, transform)

    const world = minimapToWorld(mini, transform)
    expect(world.x).toBeCloseTo(320)
    expect(world.y).toBeCloseTo(180)
  })
})
