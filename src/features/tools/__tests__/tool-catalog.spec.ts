import { describe, expect, it } from 'vitest'
import { TOOL_CATALOG, filterTools, findTool, findToolByRoute } from '../tool-catalog'

describe('tool catalog', () => {
  it('lists every tool route once with a poster', () => {
    const routes = TOOL_CATALOG.map((tool) => tool.route)
    expect(new Set(routes).size).toBe(routes.length)
    expect(routes).toEqual(expect.arrayContaining(['/gallery', '/booru-gallery', '/tagger', '/training', '/upscale', '/workbench', '/video', '/image-tools', '/console']))
    for (const tool of TOOL_CATALOG) expect(tool.poster).toMatch(/^\/(tools|branding)\//)
  })

  it('resolves the current tool from nested routes', () => {
    expect(findToolByRoute('/training/run')?.key).toBe('training')
    expect(findToolByRoute('/video/extract')?.key).toBe('video')
    expect(findToolByRoute('/')).toBeNull()
    expect(findToolByRoute('/settings')).toBeNull()
    expect(findTool('gallery').label).toBe('图库')
  })

  it('filters by label, description, key or route', () => {
    expect(filterTools('').length).toBe(TOOL_CATALOG.length)
    expect(filterTools('标注').map((tool) => tool.key)).toEqual(['tagger'])
    expect(filterTools('打标').map((tool) => tool.key)).toEqual(['tagger', 'video'])
    expect(filterTools('lora').map((tool) => tool.key)).toEqual(['training'])
    expect(filterTools('booru').map((tool) => tool.key)).toEqual(['booruGallery'])
    expect(filterTools('不存在的工具')).toEqual([])
  })
})
