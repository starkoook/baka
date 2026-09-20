declare module "gifenc" {
  export interface GIFEncoderInstance {
    writeFrame(index: Uint8Array, width: number, height: number, opts?: Record<string, unknown>): void
    finish(): void
    bytes(): Uint8Array<ArrayBuffer>
    bytesView(): Uint8Array<ArrayBuffer>
    reset(): void
  }
  // gifenc exposes a factory function, not a class: `const gif = GIFEncoder()`.
  export function GIFEncoder(opts?: { auto?: boolean; initialCapacity?: number }): GIFEncoderInstance
  export function quantize(data: Uint8Array | Uint8ClampedArray, maxColors: number, opts?: Record<string, unknown>): Uint8Array
  export function applyPalette(data: Uint8Array | Uint8ClampedArray, palette: Uint8Array, format?: string): Uint8Array
}
