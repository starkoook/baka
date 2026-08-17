/**
 * MCP Server — HTTP/SSE transport
 *
 * 在 Electron 主进程中运行，监听 localhost 端口，暴露图库操作给外部 AI 客户端。
 * 端口默认 3200，可通过 D:\BakaTOOLS\baka-config.json 的 mcpPort 字段自定义。
 */
const http = require('http')
const fs = require('fs')
const path = require('path')

let httpServer = null

// ── 工具定义 (JSON Schema) ──
function buildTools() {
  // lazy require to avoid init-order issues
  const tools = require('./tools')
  return [
    { name: 'gallery_add_root',    description: '添加图库根目录（扫描动漫图片文件夹）', inputSchema: { type: 'object', properties: { folderPath: { type: 'string', description: '文件夹路径' } }, required: ['folderPath'] }, handler: tools.handleAddRoot },
    { name: 'gallery_list_roots',   description: '列出所有图库根目录及图片数量', inputSchema: { type: 'object', properties: {} }, handler: tools.handleListRoots },
    { name: 'gallery_remove_root',  description: '移除图库根目录', inputSchema: { type: 'object', properties: { rootId: { type: 'number', description: '根目录 ID' }, deleteImages: { type: 'boolean', description: '是否同时删除图片数据' } }, required: ['rootId'] }, handler: tools.handleRemoveRoot },
    { name: 'gallery_scan',         description: '扫描图库目录，同步新图片', inputSchema: { type: 'object', properties: { folderPath: { type: 'string', description: '指定扫描某个目录（留空则扫描全部）' } } }, handler: tools.handleScan },
    { name: 'gallery_list_images',  description: '分页列出图库图片', inputSchema: { type: 'object', properties: { rootId: { type: 'number', description: '按根目录筛选（可选）' }, sort: { type: 'string', enum: ['name','date','size'], default: 'date' }, order: { type: 'string', enum: ['asc','desc'], default: 'desc' }, limit: { type: 'number', default: 100 }, offset: { type: 'number', default: 0 } } }, handler: tools.handleListImages },
    { name: 'gallery_get_thumbnail',description: '获取图片缩略图（base64 JPEG）', inputSchema: { type: 'object', properties: { imageId: { type: 'number', description: '图片 ID' } }, required: ['imageId'] }, handler: tools.handleGetThumbnail },
    { name: 'gallery_get_stats',     description: '获取图库统计（图片数/根目录数/总大小）', inputSchema: { type: 'object', properties: {} }, handler: tools.handleGetStats },
    { name: 'gallery_get_image_tags',     description: '查询单张图片的标签', inputSchema: { type: 'object', properties: { imageId: { type: 'number' } }, required: ['imageId'] }, handler: tools.handleGetImageTags },
    { name: 'gallery_batch_get_tags',     description: '批量查询多张图片的标签', inputSchema: { type: 'object', properties: { imageIds: { type: 'array', items: { type: 'number' } } }, required: ['imageIds'] }, handler: tools.handleBatchGetTags },
    { name: 'gallery_set_image_tags',     description: '设置单张图片标签（替换式）', inputSchema: { type: 'object', properties: { imageId: { type: 'number' }, tags: { type: 'array', items: { type: 'object', properties: { tag: { type: 'string' }, category: { type: 'string' }, confidence: { type: 'number' } }, required: ['tag'] } } }, required: ['imageId','tags'] }, handler: tools.handleSetImageTags },
    { name: 'gallery_batch_set_tags',     description: '批量设置多张图片标签', inputSchema: { type: 'object', properties: { entries: { type: 'array', items: { type: 'object', properties: { imageId: { type: 'number' }, tags: { type: 'array', items: { type: 'object', properties: { tag: { type: 'string' }, category: { type: 'string' }, confidence: { type: 'number' } }, required: ['tag'] } } }, required: ['imageId','tags'] } } }, required: ['entries'] }, handler: tools.handleBatchSetTags },
    { name: 'gallery_get_metadata',       description: '获取图库内图片的 SD 元数据（prompt/seed/model 等）', inputSchema: { type: 'object', properties: { imageId: { type: 'number' } }, required: ['imageId'] }, handler: tools.handleGetMetadata },
    { name: 'gallery_read_file_meta',     description: '直接读任意图片文件的 SD 元数据（不需要已入库）', inputSchema: { type: 'object', properties: { filePath: { type: 'string', description: '图片文件完整路径' } }, required: ['filePath'] }, handler: tools.handleReadFileMeta },
    { name: 'gallery_save_caption_file',  description: '将图片标签导出为 .txt 标注文件', inputSchema: { type: 'object', properties: { imageId: { type: 'number' } }, required: ['imageId'] }, handler: tools.handleSaveCaptionFile },
    { name: 'gallery_batch_save_captions',description: '批量导出图片标签为 .txt 标注文件', inputSchema: { type: 'object', properties: { imageIds: { type: 'array', items: { type: 'number' } } }, required: ['imageIds'] }, handler: tools.handleBatchSaveCaptions },
  ]
}

// ── 端口 ──
function getConfigPath() {
  try { return require('../ipc/paths').getConfigPath() } catch (_) { return null }
}
function getMcpPort() {
  try {
    const configPath = getConfigPath()
    if (configPath && fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      if (config.mcpPort && Number.isInteger(config.mcpPort)) return config.mcpPort
    }
  } catch (_) {}
  return 3200
}

// ── SSE + JSON-RPC 手动实现 ──
let sseClients = []

function addSSEClient(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  })
  sseClients.push(res)
  res.on('close', () => { sseClients = sseClients.filter(c => c !== res) })
}

function sendSSE(res, event, data) {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  } catch (_) {}
}

async function handleJsonRpc(body) {
  const { jsonrpc, id, method, params } = body
  try {
    if (method === 'initialize') {
      return { jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', serverInfo: { name: 'baka-tools-gallery', version: '0.1.0' }, capabilities: { tools: {} } } }
    }
    if (method === 'notifications/initialized') {
      return null // no response for notification
    }
    if (method === 'tools/list') {
      const tools = buildTools()
      return { jsonrpc: '2.0', id, result: { tools: tools.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) } }
    }
    if (method === 'tools/call') {
      const toolDefs = buildTools()
      const def = toolDefs.find(t => t.name === params?.name)
      if (!def) return { jsonrpc: '2.0', id, error: { code: -32601, message: `Tool not found: ${params?.name}` } }
      const result = await def.handler(params?.arguments || {})
      return { jsonrpc: '2.0', id, result }
    }
    return { jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown method: ${method}` } }
  } catch (e) {
    return { jsonrpc: '2.0', id, error: { code: -32603, message: e.message } }
  }
}

// ── 读取请求体 ──
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', chunk => { data += chunk })
    req.on('end', () => {
      try { resolve(JSON.parse(data)) } catch (e) { reject(e) }
    })
    req.on('error', reject)
  })
}

// ── 生命周期 ──

async function startMcpServer() {
  const port = getMcpPort()
  httpServer = http.createServer(async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

    const url = new URL(req.url, `http://localhost:${port}`)

    // SSE endpoint
    if (req.method === 'GET' && url.pathname === '/sse') {
      addSSEClient(res)
      // Send endpoint event
      sendSSE(res, 'endpoint', `/messages?sessionId=default`)
      return
    }

    // Messages endpoint (JSON-RPC)
    if (req.method === 'POST' && url.pathname === '/messages') {
      try {
        const body = await readBody(req)
        const response = await handleJsonRpc(body)
        if (response === null) {
          res.writeHead(202)
          res.end()
          return
        }
        // Send via SSE to all clients
        for (const client of sseClients) {
          sendSSE(client, 'message', response)
        }
        res.writeHead(202)
        res.end('Accepted')
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error: ' + e.message } }))
      }
      return
    }

    // Health check
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok', port }))
      return
    }

    res.writeHead(404)
    res.end('Not Found')
  })

  return new Promise((resolve, reject) => {
    httpServer.listen(port, '127.0.0.1', () => {
      console.log(`[mcp] server listening on http://127.0.0.1:${port}`)
      resolve()
    })
    httpServer.on('error', reject)
  })
}

async function stopMcpServer() {
  sseClients = []
  if (httpServer) {
    return new Promise(resolve => {
      httpServer.close(() => {
        console.log('[mcp] server stopped')
        resolve()
      })
    })
  }
}

module.exports = { startMcpServer, stopMcpServer }
