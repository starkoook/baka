import { describe, expect, it } from "vitest"
import {
  cellHasContent,
  packSheetColumns,
  packSheetLayout,
  sliceSheetFromPixels,
  zipFrameName,
  type PixelImage,
} from "./sequence"

function solid(w: number, h: number, rgba: [number, number, number, number]): PixelImage {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = rgba[0]
    data[i * 4 + 1] = rgba[1]
    data[i * 4 + 2] = rgba[2]
    data[i * 4 + 3] = rgba[3]
  }
  return { width: w, height: h, data }
}

function blit(dst: PixelImage, src: PixelImage, x0: number, y0: number) {
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const di = ((y0 + y) * dst.width + (x0 + x)) * 4
      const si = (y * src.width + x) * 4
      dst.data[di] = src.data[si]
      dst.data[di + 1] = src.data[si + 1]
      dst.data[di + 2] = src.data[si + 2]
      dst.data[di + 3] = src.data[si + 3]
    }
  }
}

describe("sliceSheet", () => {
  it("skips empty cells with max alpha <= 8", () => {
    const sheet = solid(20, 10, [0, 0, 0, 0])
    blit(sheet, solid(10, 10, [10, 20, 30, 255]), 10, 0)
    const cells = sliceSheetFromPixels(sheet, 2, 1)
    expect(cells).toHaveLength(1)
    expect(cellHasContent(cells[0].data)).toBe(true)
    const emptyOnly = sliceSheetFromPixels(solid(20, 10, [0, 0, 0, 4]), 2, 1)
    expect(emptyOnly).toHaveLength(0)
  })

  it("demo 4x2 walk sheet yields 8 frames", () => {
    const cell = 8
    const sheet = solid(cell * 4, cell * 2, [0, 0, 0, 0])
    for (let i = 0; i < 8; i++) {
      const c = i % 4
      const r = Math.floor(i / 4)
      blit(sheet, solid(cell, cell, [i * 20, 80, 160, 255]), c * cell, r * cell)
    }
    const cells = sliceSheetFromPixels(sheet, 4, 2)
    expect(cells).toHaveLength(8)
    expect(cells[0].width).toBe(8)
    expect(cells[0].height).toBe(8)
  })
})

describe("packSheet", () => {
  it("uses ceil(sqrt(n)) columns", () => {
    expect(packSheetColumns(1)).toBe(1)
    expect(packSheetColumns(2)).toBe(2)
    expect(packSheetColumns(3)).toBe(2)
    expect(packSheetColumns(4)).toBe(2)
    expect(packSheetColumns(5)).toBe(3)
    expect(packSheetLayout(10).columns).toBe(4)
    expect(packSheetLayout(10).rows).toBe(3)
  })
})

describe("zip names", () => {
  it("prefixes zero-padded index", () => {
    expect(zipFrameName(0, "walk")).toBe("000_walk.png")
    expect(zipFrameName(12, "a b")).toBe("012_a_b.png")
  })
})
