declare module "gifenc" {
  export class GIFEncoder {
    writeFrame(index: Uint8Array, width: number, height: number, opts?: Record<string, unknown>): void
    finish(): void
    bytes(): Uint8Array
  }
  export function quantize(data: Uint8Array | Uint8ClampedArray, maxColors: number, opts?: Record<string, unknown>): Uint8Array
  export function applyPalette(data: Uint8Array | Uint8ClampedArray, palette: Uint8Array, format?: string): Uint8Array
}
