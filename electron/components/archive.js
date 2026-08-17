const AdmZip = require('adm-zip')
const { execFile } = require('child_process')
const fs = require('fs')
const path = require('path')

function inspectArchiveEntries(entries) {
  for (const entry of entries) {
    const name = String(entry.entryName || '').replaceAll('\\', '/')
    const normalized = path.posix.normalize(name)
    if (!name || normalized.startsWith('../') || path.posix.isAbsolute(normalized) || /^[a-z]:/i.test(normalized)) {
      throw new Error(`组件压缩包包含越界路径：${entry.entryName}`)
    }
  }
  return true
}

function inspectArchiveListing(listing) {
  for (const line of String(listing).split(/\r?\n/).filter(Boolean)) {
    if (/^[lh]/i.test(line.trimStart())) throw new Error('组件压缩包不能包含符号链接或硬链接')
  }
  return true
}

function readActive(activePath) {
  try { return JSON.parse(fs.readFileSync(activePath, 'utf8')) } catch { return {} }
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.tmp`
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), 'utf8')
  fs.renameSync(temporary, filePath)
}

function extractEntries(entries, destination) {
  const root = path.resolve(destination)
  for (const entry of entries) {
    const normalized = path.posix.normalize(entry.entryName.replaceAll('\\', '/'))
    const target = path.resolve(root, ...normalized.split('/'))
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error(`组件压缩包包含越界路径：${entry.entryName}`)
    if (entry.isDirectory) fs.mkdirSync(target, { recursive: true })
    else {
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, entry.getData())
    }
  }
}

function runArchiveTool(args) {
  return new Promise((resolve, reject) => {
    execFile('tar.exe', args, { encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr?.trim() || error.message))
      else resolve(stdout)
    })
  })
}

async function extractLargeArchive(archivePath, destination) {
  const [listing, verboseListing] = await Promise.all([
    runArchiveTool(['-t', '-f', archivePath]),
    runArchiveTool(['-t', '-v', '-f', archivePath]),
  ])
  const entries = listing.split(/\r?\n/).filter(Boolean).map(entryName => ({ entryName }))
  inspectArchiveEntries(entries)
  inspectArchiveListing(verboseListing)
  await runArchiveTool(['-x', '-f', archivePath, '-C', destination])
}

async function installArchive({ archivePath, versionsRoot, version, activePath, healthCheck }) {
  if (!fs.existsSync(archivePath)) throw new Error(`组件压缩包不存在：${archivePath}`)
  const useStreamingExtractor = fs.statSync(archivePath).size > 512 * 1024 * 1024
  const zip = useStreamingExtractor ? null : new AdmZip(archivePath)
  if (zip) inspectArchiveEntries(zip.getEntries())
  fs.mkdirSync(versionsRoot, { recursive: true })
  const resolvedVersionsRoot = path.resolve(versionsRoot)
  const finalPath = path.resolve(resolvedVersionsRoot, String(version))
  if (finalPath === resolvedVersionsRoot || !finalPath.startsWith(`${resolvedVersionsRoot}${path.sep}`)) {
    throw new Error('组件版本路径越界')
  }
  const stagingPath = `${finalPath}.installing`
  const backupPath = `${finalPath}.replaced`
  fs.rmSync(stagingPath, { recursive: true, force: true })
  if (fs.existsSync(backupPath) && !fs.existsSync(finalPath)) fs.renameSync(backupPath, finalPath)
  else fs.rmSync(backupPath, { recursive: true, force: true })

  try {
    if (useStreamingExtractor) {
      fs.mkdirSync(stagingPath, { recursive: true })
      await extractLargeArchive(archivePath, stagingPath)
    }
    else extractEntries(zip.getEntries(), stagingPath)
    const healthy = await healthCheck(stagingPath)
    if (!healthy) throw new Error('组件解压后的健康检查未通过')
    const active = readActive(activePath)
    if (fs.existsSync(finalPath)) fs.renameSync(finalPath, backupPath)
    try {
      fs.renameSync(stagingPath, finalPath)
      writeJsonAtomic(activePath, {
        activeVersion: version,
        previousVersion: active.activeVersion && active.activeVersion !== version ? active.activeVersion : active.previousVersion || null,
        updatedAt: new Date().toISOString(),
      })
      fs.rmSync(backupPath, { recursive: true, force: true })
    } catch (error) {
      fs.rmSync(finalPath, { recursive: true, force: true })
      if (fs.existsSync(backupPath)) fs.renameSync(backupPath, finalPath)
      throw error
    }
    return { path: finalPath, version }
  } catch (error) {
    fs.rmSync(stagingPath, { recursive: true, force: true })
    throw error
  }
}

module.exports = { extractEntries, extractLargeArchive, inspectArchiveEntries, inspectArchiveListing, installArchive, writeJsonAtomic }
