import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readHero = () =>
  readFileSync(resolve(process.cwd(), 'src/components/dashboard/BrandHero.vue'), 'utf8')

describe('dashboard brand hero', () => {
  it('exposes the artwork and action contract', () => {
    const hero = readHero()

    expect(hero).toContain('actionLabel: string')
    expect(hero).toContain('showArtwork: boolean')
    expect(hero).toContain("action: []")
    expect(hero).toContain('@click="emit(\'action\')"')
  })

  it('serves responsive dashboard artwork only when enabled', () => {
    const hero = readHero()

    expect(hero).toContain('<picture v-if="showArtwork"')
    expect(hero).toContain('media="(max-width: 1200px)"')
    expect(hero).toContain('srcset="/branding/dashboard-hero-1200.webp"')
    expect(hero).toContain('src="/branding/dashboard-hero-1920.webp"')
  })

  it('keeps the approved editorial copy and single action', () => {
    const hero = readHero()

    expect(hero).toContain('BAKA CREATIVE STUDIO')
    expect(hero).toContain('欢迎回来，继续完成你的作品。')
    expect(hero).toContain('素材整理、标注和 LoRA 训练都在同一个本地工作区。')
    expect(hero).toContain('{{ actionLabel }}')
  })

  it('keeps a calm wide composition with reduced-motion support', () => {
    const hero = readHero()

    expect(hero).toContain('aspect-ratio: 8 / 3')
    expect(hero).toContain('animation: hero-breathe 12s')
    expect(hero).toContain('scale(1.03)')
    expect(hero).toContain('prefers-reduced-motion: reduce')

    for (const forbiddenPattern of ['Math.random', 'speech', 'heart', 'walking']) {
      expect(hero).not.toContain(forbiddenPattern)
    }
  })
})
