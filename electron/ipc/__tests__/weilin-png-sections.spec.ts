import { describe, expect, it } from 'vitest'
import { parseMetadata } from '../metadata.js'
import { buildMetadataSections } from '../../../src/features/gallery/metadata-sections'

describe('real ComfyUI WeiLin PNG', () => {
  it('shows the artwork XML as 正向提示词', () => {
    const png = 'D:/浏览器下载/八月/ComfyUI_temp_rxxgr_00033_ (1).png'
    const meta = parseMetadata(png)
    expect(String(meta.prompt || '').length).toBeGreaterThan(1000)
    expect(String(meta.prompt || '').startsWith('<artwork')).toBe(true)
    const sections = buildMetadataSections(meta, [])
    const promptField = sections.generation.find((field) => field.key === 'prompt')
    expect(promptField?.label).toBe('正向提示词')
    expect(String(promptField?.value || '').startsWith('<artwork id="celestial_conservatory_waltz_masterpiece">')).toBe(true)
  })
})
