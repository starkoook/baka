#!/usr/bin/env node
/**
 * IPC 通道一致性校验
 *
 * 用途：防止 preload.js 与 electron/ipc/*.js 之间的通道名拼错 / 漏登记 / 漏注册 handler。
 * - 读取 electron/ipc/channels.js 作为契约清单(canonical)。
 * - 扫描 preload.js(渲染端) 与 main.js + electron/ipc/*.js(主进程端) 的实际通道字符串。
 * - ERROR：出现契约外的通道字符串(典型是拼错或新增通道忘了登记) → 退出码 1。
 * - WARN ：渲染端发起但主进程无 handler、主进程发送但渲染端未监听、契约登记但无人使用。
 *
 * 运行：npm run check:ipc
 */
const fs = require('fs')
const path = require('path')
const { Channels } = require('../electron/ipc/channels')

const ROOT = path.resolve(__dirname, '..')
const canonical = new Set(Object.values(Channels))

function readText(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}
function listJs(dir) {
  return fs
    .readdirSync(path.join(ROOT, dir))
    .filter((f) => f.endsWith('.js'))
    .map((f) => path.join(dir, f))
}
function scan(text, regex, map) {
  const out = []
  let m
  const re = new RegExp(regex, 'g')
  while ((m = re.exec(text)) !== null) out.push(map(m))
  return out
}

// ── 渲染端：preload.js ──
const preloadText = readText('electron/preload.js')
const rendererCalls = scan(
  preloadText,
  /ipcRenderer\.(invoke|send|on)\(\s*['"]([^'"]+)['"]/g,
  (m) => ({ ch: m[2], kind: m[1] })
)

// ── 主进程端：main.js + electron/ipc/*.js ──
const mainFiles = ['electron/main.js', ...listJs('electron/ipc')]
const mainHandlers = [] // ipcMain.handle / ipcMain.on  (处理渲染端发起的请求)
const mainEvents = [] // webContents.send             (主进程 → 渲染端事件)
for (const f of mainFiles) {
  const t = readText(f)
  mainHandlers.push(
    ...scan(t, /ipcMain\.(handle|on)\(\s*['"]([^'"]+)['"]/g, (m) => ({ ch: m[2], kind: m[1], file: f }))
  )
  mainEvents.push(...scan(t, /webContents\.send\(\s*['"]([^'"]+)['"]/g, (m) => ({ ch: m[1], file: f })))
}

const rendererReq = new Set(rendererCalls.filter((c) => c.kind === 'invoke' || c.kind === 'send').map((c) => c.ch))
const rendererLis = new Set(rendererCalls.filter((c) => c.kind === 'on').map((c) => c.ch))
const mainHdl = new Set(mainHandlers.map((c) => c.ch))
const mainEvt = new Set(mainEvents.map((c) => c.ch))
const used = new Set([...rendererReq, ...rendererLis, ...mainHdl, ...mainEvt])

const errors = []
const warns = []

// ERROR: 实际用到但不在契约里(拼错 / 漏登记)
for (const ch of used) if (!canonical.has(ch)) errors.push(`未登记通道(疑似拼错或漏登记): ${ch}`)
// WARN: 契约里登记了但没人用(死契约)
for (const ch of canonical) if (!used.has(ch)) warns.push(`契约登记但无人使用: ${ch}`)
// WARN: 渲染端发起但主进程无 handler → 运行时会静默失败
for (const ch of rendererReq) if (!mainHdl.has(ch)) warns.push(`渲染端发起但主进程无 handler: ${ch}`)
// WARN: 主进程发送的事件渲染端没监听
for (const ch of mainEvt) if (!rendererLis.has(ch)) warns.push(`主进程发送但渲染端未监听: ${ch}`)
// WARN: 渲染端监听的事件主进程没发送
for (const ch of rendererLis) if (!mainEvt.has(ch)) warns.push(`渲染端监听但主进程未发送: ${ch}`)

// ── 输出 ──
console.log(`\n[check:ipc] 契约通道 ${canonical.size} 个 | 实际使用 ${used.size} 个`)
console.log(`  渲染端: 发起 ${rendererReq.size} / 监听 ${rendererLis.size}`)
console.log(`  主进程: handler ${mainHdl.size} / 事件发送 ${mainEvt.size}`)

if (warns.length) {
  console.log(`\n⚠ 警告 ${warns.length} 条:`)
  for (const w of warns) console.log(`  - ${w}`)
}
if (errors.length) {
  console.log(`\n✗ 错误 ${errors.length} 条:`)
  for (const e of errors) console.log(`  - ${e}`)
  console.log('\n请把新通道登记到 electron/ipc/channels.js，或修正拼错的通道名。')
  process.exit(1)
}
console.log('\n✓ 所有通道字符串均在契约内，无拼错/漏登记。')
process.exit(0)
