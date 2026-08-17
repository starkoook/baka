import { test, expect } from 'vitest'
test('probe', async () => {
  process.env.BAKA_DATA_ROOT = 'C:/tmp/baka-probe-' + Date.now()
  const g = await import('../gallery.js')
  await g.ensureDb()
  expect(typeof g.runSql).toBe('function')
})
