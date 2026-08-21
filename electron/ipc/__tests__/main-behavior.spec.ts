import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const mainSource = readFileSync(resolve(process.cwd(), 'electron/main.js'), 'utf8')

describe('main process production behavior', () => {
  it('loads the bundled renderer directly in production', () => {
    expect(mainSource).toContain('function loadWindow()')
    expect(mainSource).toContain("loadFile(join(__dirname, '../dist/renderer/index.html'))")
    expect(mainSource).toContain('loadWindow()')
  })

  it('does not clear persistent browser storage when the window closes', () => {
    expect(mainSource).not.toContain('localStorage.clear()')
  })

  it('moves or copies a sibling caption with its image', () => {
    const helper = readFileSync(resolve(process.cwd(), 'electron/ipc/move-images-safe.js'), 'utf8')

    expect(mainSource).toContain("require('./ipc/move-images-safe')")
    expect(mainSource).toContain("ipcMain.handle('fs:moveImages'")
    expect(helper).toContain("const captionSrc = src.replace(/\\.[^.]+$/, '') + '.txt'")
    expect(helper).toContain('fs.copyFileSync(captionSrc, captionDest)')
    expect(helper).toContain('fs.renameSync(captionSrc, captionDest)')
  })
})
