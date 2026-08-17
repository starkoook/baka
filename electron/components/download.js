const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { Readable } = require('stream')

async function sha256File(filePath) {
  const hash = crypto.createHash('sha256')
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk)
  return hash.digest('hex')
}

class ComponentDownload {
  constructor({ source, target, size, sha256, onProgress = () => {}, fetchImpl = fetch, openSource = null }) {
    Object.assign(this, { source, target, size, sha256, onProgress, fetchImpl, openSource })
    this.abortController = null
    this.cancelled = false
    this.paused = false
  }

  async defaultOpen(existingBytes) {
    if (/^https?:\/\//i.test(this.source)) {
      this.abortController = new AbortController()
      const response = await this.fetchImpl(this.source, {
        headers: existingBytes ? { Range: `bytes=${existingBytes}-` } : {},
        signal: this.abortController.signal,
      })
      if (!response.ok && response.status !== 206) throw new Error(`组件下载失败：HTTP ${response.status}`)
      if (!response.body) throw new Error('组件下载响应没有内容')
      return {
        stream: Readable.fromWeb(response.body),
        resumedFrom: response.status === 206 ? existingBytes : 0,
        total: this.size,
      }
    }
    if (!fs.existsSync(this.source)) throw new Error(`本地组件不存在：${this.source}`)
    if (existingBytes >= this.size) {
      return { stream: Readable.from([]), resumedFrom: existingBytes, total: this.size }
    }
    return {
      stream: fs.createReadStream(this.source, { start: existingBytes }),
      resumedFrom: existingBytes,
      total: this.size,
    }
  }

  async start() {
    this.cancelled = false
    this.paused = false
    if (fs.existsSync(this.target)) {
      const actual = await sha256File(this.target)
      if (actual.toLowerCase() === this.sha256.toLowerCase()) {
        return { ok: true, target: this.target, resumedFrom: this.size, sha256: actual, cached: true }
      }
      fs.rmSync(this.target, { force: true })
    }
    const partPath = `${this.target}.part`
    fs.mkdirSync(path.dirname(this.target), { recursive: true })
    const existingBytes = fs.existsSync(partPath) ? fs.statSync(partPath).size : 0
    const opened = this.openSource
      ? await this.openSource(existingBytes)
      : await this.defaultOpen(existingBytes)
    if (opened.resumedFrom === 0 && existingBytes) fs.truncateSync(partPath, 0)

    const output = fs.createWriteStream(partPath, { flags: opened.resumedFrom ? 'a' : 'w' })
    let outputError = null
    output.on('error', error => { outputError = error })
    const startedAt = Date.now()
    let downloaded = opened.resumedFrom
    try {
      for await (const chunk of opened.stream) {
        if (this.cancelled || this.paused) throw new Error('DOWNLOAD_STOPPED')
        if (outputError) throw outputError
        if (!output.write(chunk)) {
          await new Promise((resolve, reject) => {
            const onDrain = () => { output.removeListener('error', onError); resolve() }
            const onError = error => { output.removeListener('drain', onDrain); reject(error) }
            output.once('drain', onDrain)
            output.once('error', onError)
          })
        }
        downloaded += chunk.length
        const seconds = Math.max(0.001, (Date.now() - startedAt) / 1000)
        this.onProgress({
          downloaded,
          total: opened.total,
          percent: Math.min(100, downloaded / opened.total * 100),
          bytesPerSecond: (downloaded - opened.resumedFrom) / seconds,
        })
      }
      await new Promise((resolve, reject) => {
        if (outputError) { reject(outputError); return }
        output.on('error', reject)
        output.end(resolve)
      })
    } catch (error) {
      output.destroy()
      if (this.cancelled || this.paused || error.name === 'AbortError' || error.message === 'DOWNLOAD_STOPPED') {
        return { ok: false, cancelled: this.cancelled, paused: this.paused }
      }
      throw error
    }

    const actual = await sha256File(partPath)
    if (actual.toLowerCase() !== this.sha256.toLowerCase()) {
      fs.rmSync(partPath, { force: true })
      throw new Error('组件 SHA-256 校验失败')
    }
    fs.renameSync(partPath, this.target)
    return { ok: true, target: this.target, resumedFrom: opened.resumedFrom, sha256: actual }
  }

  pause() {
    this.paused = true
    this.abortController?.abort()
  }

  cancel() {
    this.cancelled = true
    this.abortController?.abort()
  }
}

module.exports = { ComponentDownload, sha256File }
