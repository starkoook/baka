import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface LogEntry {
  id: number
  time: string
  type: 'info' | 'error' | 'warn' | 'success'
  message: string
}

let nextId = 0

export const useLogStore = defineStore('logs', () => {
  const logs = ref<LogEntry[]>([])

  function add(type: LogEntry['type'], message: string) {
    const now = new Date()
    const time = now.toLocaleTimeString('zh-CN', { hour12: false })
    logs.value.push({ id: ++nextId, time, type, message })
    // Keep max 200 entries
    if (logs.value.length > 200) logs.value.shift()
  }

  function info(msg: string) { add('info', msg) }
  function error(msg: string) { add('error', msg) }
  function warn(msg: string) { add('warn', msg) }
  function success(msg: string) { add('success', msg) }
  function clear() { logs.value = [] }

  return { logs, info, error, warn, success, clear }
})
