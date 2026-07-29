const path = require('node:path')
const sharp = require('sharp')

const projectRoot = path.resolve(__dirname, '..')
const brandingDirectory = path.join(projectRoot, 'public', 'branding')
const masterPath = path.join(brandingDirectory, 'dashboard-hero-master.png')

async function buildBrandAssets() {
  const metadata = await sharp(masterPath).metadata()

  if (metadata.width !== 2400 || metadata.height !== 900) {
    throw new Error(`Dashboard hero master must be 2400x900; received ${metadata.width}x${metadata.height}`)
  }

  await Promise.all([
    sharp(masterPath)
      .resize(1920, 720, { fit: 'cover', position: 'center' })
      .webp({ quality: 88, smartSubsample: true })
      .toFile(path.join(brandingDirectory, 'dashboard-hero-1920.webp')),
    sharp(masterPath)
      .resize(1200, 600, { fit: 'cover', position: 'east' })
      .webp({ quality: 88, smartSubsample: true })
      .toFile(path.join(brandingDirectory, 'dashboard-hero-1200.webp')),
  ])
}

buildBrandAssets().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
