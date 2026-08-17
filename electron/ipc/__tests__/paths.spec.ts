import paths from '../paths.js'

describe('persistent data root selection', () => {
  it('keeps an existing legacy D drive data directory', () => {
    expect(typeof paths.resolveDataRoot).toBe('function')
    expect(paths.resolveDataRoot({
      legacyRoot: 'D:\\BakaTOOLS',
      appDataRoot: 'C:\\Users\\Test\\AppData\\Roaming',
      exists: (candidate: string) => candidate === 'D:\\BakaTOOLS',
    })).toBe('D:\\BakaTOOLS')
  })

  it('uses the system application data directory when the legacy directory is absent', () => {
    expect(typeof paths.resolveDataRoot).toBe('function')
    expect(paths.resolveDataRoot({
      legacyRoot: 'D:\\BakaTOOLS',
      appDataRoot: 'C:\\Users\\Test\\AppData\\Roaming',
      exists: () => false,
    })).toBe('C:\\Users\\Test\\AppData\\Roaming\\BakaTOOLS')
  })
})
