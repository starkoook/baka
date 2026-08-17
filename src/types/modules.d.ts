declare module 'pixi.js' {
  export class Application {
    init(opts: any): Promise<void>
    stage: any
  }
}

declare module 'pixi-live2d-display' {
  export const Live2DModel: any
}
