import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { addAsset, listAssets, deleteAsset, clearAssets } from '../assets'

let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'baka-assets-')) })
afterEach(() => { rmSync(root, { recursive: true, force: true }) })

const PNG = 'data:image/png;base64,' + Buffer.from('fake-png').toString('base64')

describe('assets store', () => {
  it('persists an image asset as a file and lists it', () => {
    const res = addAsset({ type: 'image', dataUrl: PNG, meta: { node: '图片节点' } }, root)
    expect(res.success).toBe(true)
    const asset = res.asset!
    expect(asset.type).toBe('image')
    expect(existsSync(asset.file)).toBe(true)
    expect(readFileSync(asset.file).toString()).toBe('fake-png')
    expect(listAssets(root)).toHaveLength(1)
  })

  it('persists text assets and references video paths without copying', () => {
    addAsset({ type: 'text', text: '你好', meta: {} }, root)
    const video = addAsset({ type: 'video', sourcePath: 'D:/video.mp4', meta: {} }, root)
    expect(video.success).toBe(true)
    expect(video.asset!.file).toBe('D:/video.mp4')
  })

  it('caps the list at 200 entries newest first', () => {
    for (let i = 0; i < 205; i++) addAsset({ type: 'text', text: `t${i}`, meta: {} }, root)
    const list = listAssets(root)
    expect(list).toHaveLength(200)
  })

  it('deletes and clears assets', () => {
    const a = addAsset({ type: 'text', text: 'x', meta: {} }, root).asset!
    const b = addAsset({ type: 'text', text: 'y', meta: {} }, root).asset!
    const del = deleteAsset(a.id, root)
    expect(del.success).toBe(true)
    expect(del.list?.map((i) => i.id)).not.toContain(a.id)
    expect(existsSync(a.file)).toBe(false)
    expect(existsSync(b.file)).toBe(true)
    expect(clearAssets(root).success).toBe(true)
    expect(listAssets(root)).toHaveLength(0)
  })
})
