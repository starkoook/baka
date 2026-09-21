import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const mainSource = readFileSync(resolve(process.cwd(), 'electron/main.js'), 'utf8')
const moveImagesSource = readFileSync(resolve(process.cwd(), 'electron/ipc/move-images-safe.js'), 'utf8')

describe('main process production behavior', () => {
  it('loads the bundled renderer directly in production', () => {
    const productionBranch = mainSource.match(/if \(isDev\)[\s\S]*?\n  } else \{([\s\S]*?)\n  \}/)?.[1] ?? ''

    expect(productionBranch).toContain("loadFile(join(__dirname, '../dist/renderer/index.html'))")
    expect(productionBranch).not.toContain("loadURL('http://localhost:5173')")
  })

  it('does not clear persistent browser storage when the window closes', () => {
    expect(mainSource).not.toContain('localStorage.clear()')
  })

  it('moves or copies a sibling caption with its image', () => {
    const moveHandler = mainSource.match(/ipcMain\.handle\('fs:moveImages'[\s\S]*?\n\}\)/)?.[0] ?? ''

    expect(moveHandler).toContain('return moveImages({ filePaths, destFolder, keepOriginal })')
    expect(moveImagesSource).toContain("const captionSrc = src.replace(/\\.[^.]+$/, '') + '.txt'")
    expect(moveImagesSource).toContain('fs.copyFileSync(captionSrc, captionDest)')
    expect(moveImagesSource).toContain('fs.renameSync(captionSrc, captionDest)')
  })
})
