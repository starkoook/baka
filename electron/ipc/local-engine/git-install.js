const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')
const { promisify } = require('util')

const run = promisify(execFile)

function normalizeGitHubRepository(repository) {
  let url
  try { url = new URL(String(repository || '')) } catch { throw new Error('仅支持 GitHub HTTPS 仓库') }
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com') throw new Error('仅支持 GitHub HTTPS 仓库')
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.length !== 2) throw new Error('仅支持 GitHub HTTPS 仓库')
  const [owner, repositoryName] = parts
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+(?:\.git)?$/.test(repositoryName)) throw new Error('仅支持 GitHub HTTPS 仓库')
  return `https://github.com/${owner}/${repositoryName.replace(/\.git$/i, '')}`
}

function assertPluginTarget(customNodesDir, target) {
  const root = path.resolve(customNodesDir)
  const resolved = path.resolve(target)
  const relative = path.relative(root, resolved)
  if (!relative || relative.includes(path.sep) || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('安装目录越界')
  return target
}

function deriveRepositoryTarget(customNodesDir, repository) {
  const normalized = normalizeGitHubRepository(repository)
  const name = normalized.split('/').pop().replace(/[^A-Za-z0-9_.-]/g, '')
  if (!name || name === '.' || name === '..') throw new Error('仓库目录无效')
  const target = path.join(customNodesDir, name)
  assertPluginTarget(customNodesDir, target)
  return target
}

function buildClonePlan(repository, target) {
  return { file: 'git', args: ['clone', '--', normalizeGitHubRepository(repository), target] }
}

function buildRequirementsPlan(pythonPath, requirementsPath) {
  if (!pythonPath) throw new Error('没有找到已验证的 ComfyUI Python')
  return { file: pythonPath, args: ['-m', 'pip', 'install', '-r', requirementsPath] }
}

async function executePlan(file, args, options = {}) {
  return run(file, args, { windowsHide: true, ...options })
}

async function repositoryResult(target) {
  const requirementsPath = path.join(target, 'requirements.txt')
  return { target, requirementsPath: fs.existsSync(requirementsPath) ? requirementsPath : '', requiresRestart: true }
}

async function installRepository({ customNodesDir, repository, execute = executePlan }) {
  const normalized = normalizeGitHubRepository(repository)
  const target = deriveRepositoryTarget(customNodesDir, normalized)
  assertPluginTarget(customNodesDir, target)
  if (fs.existsSync(target)) throw new Error('插件目录已存在，请使用更新操作')
  await execute('git', buildClonePlan(normalized, target).args, { cwd: customNodesDir, windowsHide: true })
  return repositoryResult(target)
}

async function updateRepository({ customNodesDir, repository, execute = executePlan }) {
  const normalized = normalizeGitHubRepository(repository)
  const target = deriveRepositoryTarget(customNodesDir, normalized)
  assertPluginTarget(customNodesDir, target)
  if (!fs.existsSync(path.join(target, '.git'))) throw new Error('插件目录不是 Git 仓库')
  const origin = await execute('git', ['remote', 'get-url', 'origin'], { cwd: target, windowsHide: true })
  if (normalizeGitHubRepository(origin.stdout.trim()) !== normalized) throw new Error('插件远程仓库不一致')
  const status = await execute('git', ['status', '--porcelain'], { cwd: target, windowsHide: true })
  if (status.stdout.trim()) throw new Error('插件存在本地修改，无法安全更新')
  await execute('git', ['pull', '--ff-only'], { cwd: target, windowsHide: true })
  return repositoryResult(target)
}

async function installRequirements({ pythonPath, requirementsPath, execute = executePlan }) {
  if (!requirementsPath || !fs.existsSync(requirementsPath)) throw new Error('没有找到 requirements.txt')
  const plan = buildRequirementsPlan(pythonPath, requirementsPath)
  await execute(plan.file, plan.args, { windowsHide: true })
  return { requirementsPath, requiresRestart: true }
}

module.exports = { normalizeGitHubRepository, assertPluginTarget, deriveRepositoryTarget, buildClonePlan, buildRequirementsPlan, installRepository, updateRepository, installRequirements }
