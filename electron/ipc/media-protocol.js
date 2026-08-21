'use strict'

const fs = require('fs')
const { pathToFileURL } = require('url')

/**
 * Parse a media:// URL without `new URL()`, which truncates at `#` and `?`.
 * Filenames like `foo#1.png` or `bar?.webp` must round-trip intact.
 */
function parseMediaUrl(requestUrl, platform, existsSync) {
  const plat = platform || process.platform
  const exists = existsSync || fs.existsSync
  const rest = String(requestUrl || '').replace(/^media:/i, '')
  let filePath = decodeURIComponent(
    plat === 'win32' ? rest.replace(/^\/+/, '') : rest.replace(/^\/\/+/, '/')
  )
  if (plat === 'win32' && filePath.startsWith('/')) filePath = filePath.slice(1)
  else if (filePath.startsWith('/') && exists(filePath.slice(1)) && !exists(filePath)) {
    filePath = filePath.slice(1)
  }
  return filePath
}

function install() {
  const { protocol, net } = require('electron')
  protocol.handle('media', function (request) {
    try {
      const filePath = parseMediaUrl(request.url)
      if (!filePath || !fs.existsSync(filePath)) {
        return new Response('Not found', { status: 404 })
      }
      return net.fetch(pathToFileURL(filePath).toString())
    } catch (err) {
      return new Response('Not found', { status: 404 })
    }
  })
}

module.exports = { install, parseMediaUrl }
