import { describe, expect, it, vi } from 'vitest'

const { saveAnnotation } = require('../annotation-save')

const request = {
  imageId: 7,
  imagePath: 'D:\\images\\A.png',
  tags: [{ tag: '1girl', confidence: 0.9, source: 'manual' }],
}

describe('annotation save coordinator', () => {
  it('reports complete save only after database and caption both succeed', async () => {
    const writeDatabase = vi.fn(async () => undefined)
    const writeCaption = vi.fn(async () => 'D:\\images\\A.txt')

    const result = await saveAnnotation({ writeDatabase, writeCaption }, request)

    expect(writeDatabase).toHaveBeenCalledWith(request)
    expect(writeCaption).toHaveBeenCalledWith(request)
    expect(result).toEqual({
      success: true,
      partial: false,
      databaseSaved: true,
      captionSaved: true,
      captionPath: 'D:\\images\\A.txt',
    })
  })

  it('does not write a caption when the database save fails', async () => {
    const writeCaption = vi.fn(async () => 'D:\\images\\A.txt')

    const result = await saveAnnotation({
      writeDatabase: async () => { throw new Error('database locked') },
      writeCaption,
    }, request)

    expect(writeCaption).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      success: false,
      partial: false,
      databaseSaved: false,
      captionSaved: false,
      error: 'database locked',
    })
  })

  it('reports a retryable partial save when caption writing fails', async () => {
    const result = await saveAnnotation({
      writeDatabase: async () => undefined,
      writeCaption: async () => { throw new Error('disk full') },
    }, request)

    expect(result).toMatchObject({
      success: false,
      partial: true,
      databaseSaved: true,
      captionSaved: false,
      error: 'disk full',
    })
  })
})
