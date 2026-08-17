import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'

const { ComponentDownload } = require(resolve('electron/components/download.js'))
const hash = (value: Buffer | string) => createHash('sha256').update(value).digest('hex')

describe('component download', () => {
  it('resumes a local component from an existing part file', async () => {
    const root = mkdtempSync(join(tmpdir(), 'baka-download-'))
    const source = join(root, 'source.zip')
    const target = join(root, 'target.zip')
    const bytes = Buffer.alloc(1024 * 1024, 7)
    writeFileSync(source, bytes)
    writeFileSync(`${target}.part`, bytes.subarray(0, 256 * 1024))

    const result = await new ComponentDownload({ source, target, size: bytes.length, sha256: hash(bytes) }).start()

    expect(result).toMatchObject({ ok: true, resumedFrom: 256 * 1024 })
    expect(readFileSync(target)).toEqual(bytes)
  })

  it('sends an HTTP Range request when a partial file exists', async () => {
    const root = mkdtempSync(join(tmpdir(), 'baka-http-'))
    const target = join(root, 'target.zip')
    writeFileSync(`${target}.part`, 'ab')
    let range = ''
    const fetchImpl = async (_url: string, options: any) => {
      range = options.headers.Range
      return new Response(Buffer.from('cdef'), { status: 206 })
    }

    const result = await new ComponentDownload({ source: 'https://example.test/component.zip', target, size: 6, sha256: hash('abcdef'), fetchImpl }).start()

    expect(range).toBe('bytes=2-')
    expect(result.resumedFrom).toBe(2)
    expect(readFileSync(target, 'utf8')).toBe('abcdef')
  })

  it('keeps the part file after cancellation', async () => {
    const root = mkdtempSync(join(tmpdir(), 'baka-cancel-'))
    const target = join(root, 'target.zip')
    let task: any
    const openSource = async () => ({
      resumedFrom: 0,
      total: 4096,
      stream: Readable.from((async function* () {
        for (let index = 0; index < 4; index++) {
          await new Promise(resolve => setTimeout(resolve, 10))
          yield Buffer.alloc(1024, index)
        }
      })()),
    })
    task = new ComponentDownload({
      source: 'fixture://slow', target, size: 4096, sha256: '0'.repeat(64), openSource,
      onProgress: (progress: any) => { if (progress.downloaded >= 1024) task.cancel() },
    })

    expect(await task.start()).toMatchObject({ ok: false, cancelled: true })
    expect(existsSync(target)).toBe(false)
    expect(existsSync(`${target}.part`)).toBe(true)
  })

  it('does not promote a file with a bad checksum', async () => {
    const root = mkdtempSync(join(tmpdir(), 'baka-hash-'))
    const source = join(root, 'source.zip')
    const target = join(root, 'target.zip')
    writeFileSync(source, 'changed')

    await expect(new ComponentDownload({ source, target, size: 7, sha256: 'a'.repeat(64) }).start()).rejects.toThrow('SHA-256')
    expect(existsSync(target)).toBe(false)
    expect(existsSync(`${target}.part`)).toBe(false)
  })

  it('reuses an already verified imported cache package in place', async () => {
    const root = mkdtempSync(join(tmpdir(), 'baka-imported-cache-'))
    const target = join(root, 'trainer.zip')
    writeFileSync(target, 'verified')

    const result = await new ComponentDownload({ source: target, target, size: 8, sha256: hash('verified') }).start()

    expect(result).toMatchObject({ ok: true, cached: true, target })
    expect(readFileSync(target, 'utf8')).toBe('verified')
  })

  it('reuses a completed online cache package before opening the source', async () => {
    const root = mkdtempSync(join(tmpdir(), 'baka-complete-cache-'))
    const target = join(root, 'runtime.zip')
    writeFileSync(target, 'complete')
    let opened = false

    const result = await new ComponentDownload({
      source: 'https://example.test/runtime.zip', target, size: 8, sha256: hash('complete'),
      openSource: async () => { opened = true; throw new Error('should not open') },
    }).start()

    expect(result.cached).toBe(true)
    expect(opened).toBe(false)
  })
})
