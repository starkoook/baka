import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertPluginTarget, buildClonePlan, buildRequirementsPlan, deriveRepositoryTarget, installRepository, normalizeGitHubRepository } from '../local-engine/git-install.js'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))

describe('Comfy Git install safety', () => {
  it('allows only a direct child of custom_nodes', () => {
    const root = 'D:/ComfyUI/custom_nodes'
    const target = join(root, 'ComfyUI-Test')
    expect(assertPluginTarget(root, target)).toBe(target)
    expect(() => assertPluginTarget(root, 'D:/ComfyUI/output')).toThrow('安装目录越界')
    expect(() => assertPluginTarget(root, join(root, '..', 'models'))).toThrow('安装目录越界')
  })

  it('accepts only normalized GitHub HTTPS repositories and creates argument arrays', () => {
    const target = 'D:/ComfyUI/custom_nodes/ComfyUI-Test'
    expect(normalizeGitHubRepository('https://github.com/acme/ComfyUI-Test.git/')).toBe('https://github.com/acme/ComfyUI-Test')
    expect(() => normalizeGitHubRepository('git@github.com:acme/ComfyUI-Test.git')).toThrow('仅支持 GitHub HTTPS 仓库')
    expect(buildClonePlan('https://github.com/acme/ComfyUI-Test', target)).toEqual({ file: 'git', args: ['clone', '--', 'https://github.com/acme/ComfyUI-Test', target] })
    expect(buildRequirementsPlan('D:/python.exe', 'D:/ComfyUI/custom_nodes/ComfyUI-Test/requirements.txt').args).toEqual(['-m', 'pip', 'install', '-r', 'D:/ComfyUI/custom_nodes/ComfyUI-Test/requirements.txt'])
  })

  it('derives a safe direct child and reports requirements without executing them', async () => {
    const root = mkdtempSync(join(tmpdir(), 'baka-custom-nodes-'))
    roots.push(root)
    const target = deriveRepositoryTarget(root, 'https://github.com/acme/ComfyUI-Test.git')
    expect(target).toBe(join(root, 'ComfyUI-Test'))
    const execute = vi.fn(async () => {
      mkdirSync(target, { recursive: true })
      writeFileSync(join(target, 'requirements.txt'), 'requests')
      return { stdout: '', stderr: '' }
    })
    await expect(installRepository({ customNodesDir: root, repository: 'https://github.com/acme/ComfyUI-Test', execute })).resolves.toMatchObject({ target, requirementsPath: join(target, 'requirements.txt'), requiresRestart: true })
    expect(execute).toHaveBeenCalledWith('git', ['clone', '--', 'https://github.com/acme/ComfyUI-Test', target], expect.any(Object))
  })
})
