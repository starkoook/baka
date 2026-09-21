import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

import { beginAppLogSession } from '../app-log.js'

describe('app log session', () => {
  it('starts a new session by wiping the previous log file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'baka-applog-'))
    const file = join(dir, 'app.jsonl')
    writeFileSync(file, '{"message":"上次启动留下的记录"}\n', 'utf8')

    const path = beginAppLogSession(file)

    expect(path).toBe(file)
    expect(existsSync(file)).toBe(true)
    expect(readFileSync(file, 'utf8')).toBe('')
  })

  it('creates an empty log file when none exists yet', () => {
    const dir = mkdtempSync(join(tmpdir(), 'baka-applog-'))
    const file = join(dir, 'nested', 'app.jsonl')

    beginAppLogSession(file)

    expect(readFileSync(file, 'utf8')).toBe('')
  })

  it('clears the log before writing the startup line', () => {
    const main = readFileSync(resolve(process.cwd(), 'electron/main.js'), 'utf8')
    expect(main).toMatch(/beginAppLogSession\(\)[\s\S]{0,120}writeAppLog\('info', 'Baka TOOLS 已启动'/)
  })

  it('starts the log session before creating the window so the first paint errors survive', () => {
    const main = readFileSync(resolve(process.cwd(), 'electron/main.js'), 'utf8')
    const ready = main.slice(main.indexOf('app.whenReady()'))
    expect(ready.indexOf('beginAppLogSession()')).toBeGreaterThanOrEqual(0)
    expect(ready.indexOf('beginAppLogSession()')).toBeLessThan(ready.indexOf('createWindow()'))
  })
})
