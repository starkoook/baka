import { onMounted } from 'vue'
import { useLogStore } from '@/stores/logs'
import { toPlainLogEntry } from '@/lib/ipc-payload'

let bound = false

export function useAppLogs() {
  const logStore = useLogStore()

  onMounted(async () => {
    if (bound) return
    bound = true
    try {
      const response = await window.logAPI?.getHistory?.(500)
      if (response?.success && response.data?.entries) {
        logStore.hydrate(response.data.entries.map((entry) => toPlainLogEntry(entry)), response.data.path)
      }
    } catch (error) {
      logStore.warn('无法读取日志文件：' + ((error as Error).message || error))
    }
    window.logAPI?.onEntry?.((entry) => logStore.ingest(toPlainLogEntry(entry)))
    window.trainingAPI?.onLog?.((entry: any) => {
      logStore.ingest(toPlainLogEntry({
        type: entry?.type || 'info',
        message: entry?.message || String(entry || ''),
        time: entry?.time,
        source: 'training',
      }))
    })
  })
}
