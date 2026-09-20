import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'baka-tagger-settings-'))
const configPath = path.join(tempRoot, 'baka-config.json')

process.env.BAKA_DATA_ROOT = tempRoot

const {
  DEFAULT_TAGGING_SETTINGS,
  getTaggingSettings,
  saveTaggingSettings,
  resolveInferOptions,
  resolveTaggingProviders,
  isDmlTdrError,
  CPU_FALLBACK_LOG,
  filterPredictedTags,
} = await import('../tagger-settings.js')

describe('tagger settings persistence', () => {
  afterEach(() => {
    try { fs.unlinkSync(configPath) } catch {}
  })

  it('defaults auto-save-after-tagging to false and keeps other defaults', () => {
    const settings = getTaggingSettings()
    expect(settings.autoSaveAfterTagging).toBe(false)
    expect(settings.generalThreshold).toBe(DEFAULT_TAGGING_SETTINGS.generalThreshold)
    expect(settings.characterThreshold).toBe(DEFAULT_TAGGING_SETTINGS.characterThreshold)
    expect(settings.addCharacter).toBe(true)
    expect(settings.addCopyright).toBe(true)
    expect(settings.replaceUnderscores).toBe(false)
    expect(settings.preferGpu).toBe(true)
  })

  it('persists thresholds, category toggles, underscore policy, and model dir', () => {
    const saved = saveTaggingSettings({
      generalThreshold: 0.42,
      characterThreshold: 0.77,
      addCharacter: false,
      addCopyright: true,
      replaceUnderscores: true,
      autoSaveAfterTagging: false,
      localModelDir: 'D:\\models',
    })
    expect(saved.generalThreshold).toBe(0.42)
    expect(saved.replaceUnderscores).toBe(true)
    expect(saved.autoSaveAfterTagging).toBe(false)
    expect(saved.localModelDir).toBe('D:\\models')

    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    expect(raw.localModelDir).toBe('D:\\models')
    expect(raw.tagging.generalThreshold).toBe(0.42)
    expect(getTaggingSettings().characterThreshold).toBe(0.77)
  })

  it('does not wipe unrelated config keys', () => {
    fs.writeFileSync(configPath, JSON.stringify({ theme: 'light', provider: 'openai' }, null, 2))
    saveTaggingSettings({ generalThreshold: 0.5 })
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    expect(raw.theme).toBe('light')
    expect(raw.provider).toBe('openai')
    expect(raw.tagging.generalThreshold).toBe(0.5)
  })

  it('resolveInferOptions prefers explicit run params over saved settings', () => {
    saveTaggingSettings({ generalThreshold: 0.2, characterThreshold: 0.9 })
    expect(resolveInferOptions({ threshold: 0.55 }).generalThreshold).toBe(0.55)
    expect(resolveInferOptions({}).characterThreshold).toBe(0.9)
  })

  it('filters character/copyright tags and can replace underscores', () => {
    const tags = [
      { tag: '1girl', category: 0, confidence: 0.8 },
      { tag: 'hatsune_miku', category: 4, confidence: 0.9 },
      { tag: 'vocaloid', category: 3, confidence: 0.7 },
    ]
    expect(filterPredictedTags(tags, { addCharacter: false, addCopyright: true, generalThreshold: 0.35, characterThreshold: 0.85 }).map((t) => t.tag)).toEqual(['1girl', 'vocaloid'])
    expect(filterPredictedTags(tags, { replaceUnderscores: true, generalThreshold: 0.35, characterThreshold: 0.8 }).map((t) => t.tag)).toContain('hatsune miku')
  })
})

describe('tagging execution providers', () => {
  it('defaults tagging providers to DML then CPU when DML is available', () => {
    expect(resolveTaggingProviders({ providers: ['dml', 'cpu'] })).toEqual(['dml', 'cpu'])
    expect(resolveTaggingProviders({})).toEqual(['dml', 'cpu'])
    expect(resolveTaggingProviders({ providers: ['dml'] })).toEqual(['dml', 'cpu'])
  })

  it('stays on CPU only when preferGpu is explicitly false', () => {
    expect(resolveTaggingProviders({ providers: ['dml', 'cpu'], preferGpu: true })).toEqual(['dml', 'cpu'])
    saveTaggingSettings({ preferGpu: true })
    expect(resolveTaggingProviders({ providers: ['dml', 'cpu'] })).toEqual(['dml', 'cpu'])
    saveTaggingSettings({ preferGpu: false })
    expect(resolveTaggingProviders({ providers: ['dml'] })).toEqual(['cpu'])
    expect(resolveTaggingProviders({ preferGpu: false })).toEqual(['cpu'])
  })

  it('recognizes DirectML TDR HRESULTs and keeps a Chinese fallback line', () => {
    expect(isDmlTdrError('DXGI 887A0006 DEVICE_HUNG (DmlCommandRecorder.cpp)')).toBe(true)
    expect(isDmlTdrError('887A0005 DEVICE_REMOVED GetDeviceRemovedReason')).toBe(true)
    expect(isDmlTdrError(new Error('OOM CUDA_ERROR'))).toBe(false)
    expect(CPU_FALLBACK_LOG).toBe("GPU 超时（DirectML），已改用 CPU 继续标注")
  })
})
