import { describe, expect, it } from 'vitest'
import {
  readTrainingPreflight,
  resolveTrainingModel,
  validateTrainingInputs,
  waitForTrainingBackend,
} from '../training-readiness'

describe('training readiness', () => {
  it('treats backend preflight errors as blocking even when HTTP succeeds', () => {
    const report = readTrainingPreflight({
      ok: true,
      data: {
        status: 'success',
        data: { warnings: ['显存偏低'], errors: ['训练集没有图片'] },
      },
    })

    expect(report).toEqual({ warnings: ['显存偏低'], errors: ['训练集没有图片'] })
  })

  it('turns an application-level backend failure into a blocking error', () => {
    const report = readTrainingPreflight({
      ok: true,
      data: { status: 'fail', message: '配置值无效' },
    })

    expect(report.errors).toEqual(['配置值无效'])
  })

  it('uses the selected local model before the remote model value', () => {
    expect(resolveTrainingModel('  D:\\models\\hero.safetensors  ', 'owner/remote-model'))
      .toBe('D:\\models\\hero.safetensors')
    expect(resolveTrainingModel('', '  owner/remote-model  ')).toBe('owner/remote-model')
  })

  it('reports missing local model, dataset, output directory, and output name', async () => {
    const existing = new Set<string>()
    const issues = await validateTrainingInputs({
      localModel: 'D:\\models\\missing.safetensors',
      remoteModel: 'owner/remote-model',
      trainDataDir: 'D:\\dataset',
      outputDir: 'D:\\output',
      outputName: '   ',
    }, async path => existing.has(path))

    expect(issues).toEqual([
      '本地底模文件不存在：D:\\models\\missing.safetensors',
      '训练数据集目录不存在：D:\\dataset',
      '输出目录不存在：D:\\output',
      '请填写输出名称',
    ])
  })

  it('accepts a remote model without treating it as a local path', async () => {
    const issues = await validateTrainingInputs({
      localModel: '',
      remoteModel: 'owner/remote-model',
      trainDataDir: 'D:\\dataset',
      outputDir: 'D:\\output',
      outputName: 'hero_lora',
    }, async path => path !== '')

    expect(issues).toEqual([])
  })

  it('polls until the backend becomes ready', async () => {
    let checks = 0
    const ready = await waitForTrainingBackend(
      async () => ({ ok: ++checks === 3 }),
      { attempts: 5, intervalMs: 1, delay: async () => undefined },
    )

    expect(ready).toBe(true)
    expect(checks).toBe(3)
  })

  it('returns false after the backend readiness timeout', async () => {
    let checks = 0
    const ready = await waitForTrainingBackend(
      async () => ({ ok: false, attempt: ++checks }),
      { attempts: 2, intervalMs: 1, delay: async () => undefined },
    )

    expect(ready).toBe(false)
    expect(checks).toBe(2)
  })
})
