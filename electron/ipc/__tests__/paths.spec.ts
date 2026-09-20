import paths from '../paths.js'

describe('persistent data root selection', () => {
  it('uses the sibling -data directory next to the installed app', () => {
    expect(typeof paths.resolveDataRoot).toBe('function')
    expect(paths.resolveDataRoot({
      legacyRoot: 'D:\\BakaTOOLS',
      appDataRoot: 'C:\\Users\\Test\\AppData\\Roaming',
      exists: () => false,
      installRoot: 'D:\\baka\\BakaTOOLS-data',
    })).toBe('D:\\baka\\BakaTOOLS-data')
  })

  it('respects an explicit BAKA_DATA_ROOT override', () => {
    const previous = process.env.BAKA_DATA_ROOT
    process.env.BAKA_DATA_ROOT = 'E:\\custom-data'
    try {
      expect(paths.resolveDataRoot({
        legacyRoot: 'D:\\BakaTOOLS',
        appDataRoot: 'C:\\Users\\Test\\AppData\\Roaming',
        exists: () => false,
        installRoot: 'D:\\baka\\BakaTOOLS-data',
      })).toBe('E:\\custom-data')
    } finally {
      process.env.BAKA_DATA_ROOT = previous
    }
  })
})
