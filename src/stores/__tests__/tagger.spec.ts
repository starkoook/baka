import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTaggerStore } from '@/stores/tagger'
import type { GalleryHandoff } from '@/features/gallery/gallery-workflow'

const handoff: GalleryHandoff = {
  items: [
    { id: 2, path: 'B.png' },
    { id: 1, path: 'A.png' },
  ],
  returnContext: {
    kind: 'root',
    id: 7,
    search: 'blue hair',
    tagState: 'untagged',
    sort: 'modified-desc',
    scrollTop: 640,
    selectedIds: [2, 1],
  },
}

describe('tagger store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('creates a queue in gallery order and keeps the return context', () => {
    const store = useTaggerStore()

    store.createQueueFromGallery(handoff)

    expect(store.queue.map((item) => item.path)).toEqual(['B.png', 'A.png'])
    expect(store.queue.every((item) => item.status === 'pending')).toBe(true)
    expect(store.returnContext?.search).toBe('blue hair')
    expect(store.currentIndex).toBe(0)
    expect(JSON.parse(localStorage.getItem('baka-tagger-session-v1') || '{}').queue).toHaveLength(2)
  })

  it('restores interrupted running work as retryable review work', () => {
    localStorage.setItem('baka-tagger-session-v1', JSON.stringify({
      version: 1,
      phase: 'running',
      currentIndex: 0,
      taskId: 'old-task',
      queue: [{
        id: 2,
        path: 'B.png',
        status: 'running',
        tags: [],
        error: '',
        databaseSaved: false,
        captionSaved: false,
      }],
      returnContext: handoff.returnContext,
      config: { tagSource: 'local', threshold: 0.35, activeModelPath: '' },
    }))
    const store = useTaggerStore()

    store.restoreSession()

    expect(store.phase).toBe('review')
    expect(store.taskId).toBe('')
    expect(store.queue[0].status).toBe('failed')
    expect(store.queue[0].error).toContain('中断')
  })

  it('does not replace an active in-memory queue with an older stored session', () => {
    const store = useTaggerStore()
    store.createQueueFromGallery(handoff)
    store.queue[0].status = 'running'

    localStorage.setItem('baka-tagger-session-v1', JSON.stringify({
      version: 1,
      phase: 'running',
      currentIndex: 0,
      taskId: 'old-task',
      queue: [{
        id: 99,
        path: 'old-session.png',
        status: 'running',
        tags: [],
        error: '',
        databaseSaved: false,
        captionSaved: false,
      }],
      returnContext: null,
      config: { tagSource: 'local', threshold: 0.35, activeModelPath: '' },
    }))

    const restored = store.restoreSession()

    expect(restored).toBe(false)
    expect(store.queue.map((item) => item.path)).toEqual(['B.png', 'A.png'])
    expect(store.queue[0].status).toBe('running')
    expect(store.queue[0].error).toBe('')
  })

  it('stays in stopping state until cancellation is confirmed', async () => {
    let finishCancel!: (value: { success: boolean }) => void
    const cancel = vi.fn(() => new Promise<{ success: boolean }>((resolve) => { finishCancel = resolve }))
    Object.assign(window, { taggerV2API: { cancel } })
    const store = useTaggerStore()
    store.phase = 'running'
    store.taskId = 'task-1'

    const pending = store.stopRun()
    expect(store.phase).toBe('stopping')

    finishCancel({ success: true })
    await pending
    expect(cancel).toHaveBeenCalledWith('task-1')
    expect(store.phase).toBe('review')
  })

  it('marks only the failed inference result as failed', () => {
    const store = useTaggerStore()
    store.createQueueFromGallery(handoff)

    store.applyInferenceResults([
      { path: 'B.png', tags: [{ tag: '1girl', confidence: 0.9 }] },
      { path: 'A.png', error: 'cannot decode image' },
    ])

    expect(store.queue[0].status).toBe('ready')
    expect(store.queue[0].tags[0].tag).toBe('1girl')
    expect(store.queue[1].status).toBe('failed')
    expect(store.queue[1].error).toContain('cannot decode image')
    expect(store.phase).toBe('review')
  })

  it('updates queue paths using move results and persists them', () => {
    const store = useTaggerStore()
    store.createQueueFromGallery(handoff)

    store.replacePaths([{ oldPath: 'A.png', newPath: 'D:\\dataset\\A.png' }])

    expect(store.queue[1].path).toBe('D:\\dataset\\A.png')
    const persisted = JSON.parse(localStorage.getItem('baka-tagger-session-v1') || '{}')
    expect(persisted.queue[1].path).toBe('D:\\dataset\\A.png')
  })

  it('returns the gallery context once', () => {
    const store = useTaggerStore()
    store.createQueueFromGallery(handoff)

    expect(store.consumeReturnContext()).toEqual(handoff.returnContext)
    expect(store.consumeReturnContext()).toBeNull()
  })

  it('marks an item reviewed only when database and caption both save', async () => {
    const saveAnnotation = vi.fn(async () => ({
      success: true,
      partial: false,
      databaseSaved: true,
      captionSaved: true,
      captionPath: 'B.txt',
    }))
    Object.assign(window, { galleryAPI: { saveAnnotation } })
    const store = useTaggerStore()
    store.createQueueFromGallery(handoff)
    store.queue[0].status = 'ready'
    store.queue[0].tags = [{ tag: '1girl', confidence: 0.9 }]

    const saved = await store.saveCurrent()

    expect(saved).toBe(true)
    expect(store.queue[0]).toMatchObject({ status: 'reviewed', databaseSaved: true, captionSaved: true, error: '' })
  })

  it('keeps a caption failure as partial and does not advance', async () => {
    Object.assign(window, { galleryAPI: { saveAnnotation: async () => ({
      success: false,
      partial: true,
      databaseSaved: true,
      captionSaved: false,
      error: 'disk full',
    }) } })
    const store = useTaggerStore()
    store.createQueueFromGallery(handoff)
    store.queue[0].status = 'ready'

    await store.saveAndNext()

    expect(store.currentIndex).toBe(0)
    expect(store.queue[0]).toMatchObject({ status: 'partial', databaseSaved: true, captionSaved: false, error: 'disk full' })
  })

  it('turns a rejected save into a retryable failed item', async () => {
    Object.assign(window, { galleryAPI: { saveAnnotation: vi.fn().mockRejectedValue(new Error('disk unavailable')) } })
    const store = useTaggerStore()
    store.createQueueFromGallery(handoff)
    store.queue[0].status = 'ready'

    const saved = await store.saveCurrent()

    expect(saved).toBe(false)
    expect(store.queue[0].status).toBe('failed')
    expect(store.queue[0].error).toContain('disk unavailable')
    expect(store.lastError).toContain('disk unavailable')
  })

  it('returns to review when the inference request rejects', async () => {
    Object.assign(window, { taggerV2API: { inferBatch: vi.fn().mockRejectedValue(new Error('worker exited')) } })
    const store = useTaggerStore()
    store.createQueueFromGallery(handoff)
    store.models = [{
      name: 'WD14', path: 'model.onnx', csvPath: 'selected_tags.csv', resolution: 448,
      quality: 'balanced', speed: 'fast', memoryMb: 512, provider: 'CPU',
    }]
    store.activeModelPath = 'model.onnx'

    await store.startRun()

    expect(store.phase).toBe('review')
    expect(store.queue.every((item) => item.status === 'failed')).toBe(true)
    expect(store.lastError).toContain('worker exited')
  })
})
