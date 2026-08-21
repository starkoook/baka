import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'

class FakeWorker extends EventEmitter {
  sent: any[] = []

  send(message: any) {
    this.sent.push(message)
  }
}

function loadTaggerModule() {
  const sourcePath = resolve(process.cwd(), 'electron/ipc/tagger-v2.js')
  const source = readFileSync(sourcePath, 'utf8')
  const handlers = new Map<string, (...args: any[]) => any>()
  const fakeWorker = new FakeWorker()
  const module = { exports: {} as any }

  const localRequire = (id: string) => {
    if (id === 'electron') {
      return { ipcMain: { handle: (channel: string, handler: (...args: any[]) => any) => handlers.set(channel, handler) } }
    }
    if (id === 'child_process') return { fork: () => fakeWorker }
    if (id === 'path') return require('node:path')
    if (id === 'fs') return require('node:fs')
    if (id === './gallery') return { ensureDb: async () => undefined, queryAll: () => [], runSql: () => undefined }
    if (id === './safe-file') return { writeTextSafe: async () => ({ success: true }) }
    if (id === './tag-catalog') return { TagCatalog: { load: async () => ({}) } }
    if (id === './tagging-batch') {
      return {
        applyTaggingResults: async () => ({}),
        deleteTemplate: () => [],
        generateTaggingResults: async () => [],
        getImagePaths: async () => [],
        getImageTagNames: async () => [],
        importTemplates: () => ({}),
        listTaggingConfigs: () => [],
        loadTemplates: () => [],
        resolveTaggingConfigs: () => [],
        upsertTemplate: (template: unknown) => template,
      }
    }
    if (id === './video-frames') return { isVideoFile: () => false, extractVideoFrames: async () => [] }
    throw new Error(`Unexpected dependency: ${id}`)
  }

  const wrapper = vm.runInThisContext(`(function(require,module,exports,__dirname){${source}\n})`, {
    filename: sourcePath,
  })
  wrapper(localRequire, module, module.exports, resolve(process.cwd(), 'electron/ipc'))

  const window = {
    isDestroyed: () => false,
    webContents: { send: () => undefined },
  }
  module.exports.registerTaggerV2Handlers(window)
  return { handlers, worker: fakeWorker, shutdown: module.exports.shutdownWorker }
}

describe('tagger v2 worker orchestration', () => {
  it('starts inference after the worker reports ready', async () => {
    const { handlers, worker, shutdown } = loadTaggerModule()
    const infer = handlers.get('taggerV2:inferBatch')!
    const pending = infer({}, {
      modelPath: 'model.onnx',
      csvPath: 'tags.csv',
      imagePaths: ['image.png'],
    })

    worker.emit('message', { type: 'ready' })

    expect(worker.sent).toContainEqual({
      cmd: 'infer',
      imagePaths: ['image.png'],
      threshold: 0.35,
      batchSize: 4,
    })

    worker.emit('message', { type: 'complete', results: [{ path: 'image.png', tags: [] }] })
    await pending
    shutdown()
  })

  it('settles one batch once and removes batch listeners', async () => {
    const { handlers, worker, shutdown } = loadTaggerModule()
    const infer = handlers.get('taggerV2:inferBatch')!
    const pending = infer({}, { modelPath: 'model.onnx', imagePaths: ['image.png'] })

    worker.emit('message', { type: 'ready' })
    worker.emit('message', { type: 'complete', results: [{ path: 'image.png', tags: ['tag'] }] })

    await expect(pending).resolves.toMatchObject({
      success: true,
      data: { count: 1 },
    })
    expect(worker.listenerCount('message')).toBe(1)
    shutdown()
  })
})
