import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

const rootPath = (path: string) => resolve(process.cwd(), path)

const expectImage = async (path: string, width: number, height: number) => {
  const absolutePath = rootPath(path)

  expect(existsSync(absolutePath), `${path} must exist`).toBe(true)

  const metadata = await sharp(absolutePath).metadata()
  expect(metadata.width).toBe(width)
  expect(metadata.height).toBe(height)
}

describe('dashboard branding assets', () => {
  it('keeps the master artwork at 2400x900', async () => {
    await expectImage('public/branding/dashboard-hero-master.png', 2400, 900)
  })

  it('provides the 1920x720 runtime variant under 1.5 MB', async () => {
    const path = 'public/branding/dashboard-hero-1920.webp'

    await expectImage(path, 1920, 720)
    expect(statSync(rootPath(path)).size).toBeLessThan(1_500_000)
  })

  it('provides the 1200x600 runtime variant under 1.5 MB', async () => {
    const path = 'public/branding/dashboard-hero-1200.webp'

    await expectImage(path, 1200, 600)
    expect(statSync(rootPath(path)).size).toBeLessThan(1_500_000)
  })

  it('exposes the reproducible branding build command', () => {
    const packageJson = JSON.parse(readFileSync(rootPath('package.json'), 'utf8'))

    expect(packageJson.scripts['branding:build']).toBe('node scripts/build-brand-assets.js')
  })
})
