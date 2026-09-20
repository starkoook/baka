import { defineStore } from 'pinia'
import { ref } from 'vue'
import { toPlainLogEntry } from '@/lib/ipc-payload'

export interface LogEntry {
  id: number
  time: string
  type: 'info' | 'error' | 'warn' | 'success'
  message: string
}

let nextId = 0

export const useLogStore = defineStore('logs', () => {
  const logs = ref<LogEntry[]>([])
  const filePath = ref('')

  function add(type: LogEntry['type'], message: string, time?: string) {
    const stamp = time || new Date().toLocaleTimeString('zh-CN', { hour12: false })
    logs.value.push({ id: ++nextId, time: stamp, type, message })
    if (logs.value.length > 500) logs.value.shift()
  }

  function ingest(entry: { type?: string; message?: string; time?: string; source?: string }) {
    const plain = toPlainLogEntry(entry)
    const type = plain.type === 'error' || plain.type === 'warn' || plain.type === 'success' ? plain.type : 'info'
    let message = String(plain.message || '')
    if (!message) return
    if (plain.source && !message.startsWith('[')) message = '[' + plain.source + '] ' + message
    const last = logs.value[logs.value.length - 1]
    if (last && last.time === (plain.time || last.time) && last.type === type && last.message === message) return
    add(type, message, plain.time)
  }

  function hydrate(entries: Array<{ type?: string; message?: string; time?: string; source?: string }>, path?: string) {
    logs.value = []
    nextId = 0
    if (path) filePath.value = String(path || '')
    for (const entry of entries || []) ingest(toPlainLogEntry(entry))
  }

  function info(msg: string) { add('info', msg) }
  function error(msg: string) { add('error', msg) }
  function warn(msg: string) { add('warn', msg) }
  function success(msg: string) { add('success', msg) }
  function clear() { logs.value = [] }

  return { logs, filePath, info, error, warn, success, clear, ingest, hydrate, add }
})
