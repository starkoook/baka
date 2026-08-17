import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')

describe('workbench reliability', () => {
  const workbench = read('src/views/Workbench.vue')
  const preload = read('electron/preload.js')
  const llm = read('electron/ipc/llm.js')
  const workflow = read('electron/ipc/workflow-store.js')
  const sidebar = read('src/components/sidebar/AppSidebar.vue')
  const store = read('src/stores/workbench.ts')

  it('aborts the currently running LLM request when a workflow is cancelled', () => {
    expect(workbench).toContain('activeChatRequestId')
    expect(workbench).toContain('llmAPI?.cancelChat')
    expect(preload).toContain("cancelChat: (requestId) => ipcRenderer.invoke('llm:cancelChat', requestId)")
    expect(llm).toContain('new AbortController()')
    expect(llm).toContain("ipcMain.handle('llm:cancelChat'")
    expect(llm).toContain('signal: controller.signal')
  })

  it('flushes the latest workflow synchronously before the renderer unloads', () => {
    expect(workbench).toContain("window.addEventListener('beforeunload', flushAutosave)")
    expect(workbench).toContain('workflowAPI?.saveAutosaveSync?.(workflowPayload())')
    expect(preload).toContain("saveAutosaveSync: (content) => ipcRenderer.sendSync('workflow:saveAutosaveSync', content)")
    expect(workflow).toContain("ipcMain.on('workflow:saveAutosaveSync'")
  })

  it('previews text contents and keeps the asset extension when saving', () => {
    expect(workbench).toContain('assetPreviewText')
    expect(workbench).toContain('fsAPI?.readText?.(asset.file)')
    expect(workbench).toContain("assetPreviewText || '文本结果'")
    expect(workbench).toContain('assetFileExtension(asset)')
  })

  it('applies and persists reduced motion across the whole workbench', () => {
    expect(workbench).toContain("'workbench--reduced': wbStore.reduceMotion")
    expect(workbench).toContain('.workbench--reduced *')
    expect(sidebar).toContain("'sidebar-workbench--reduced': wbStore.reduceMotion")
    expect(store).toContain("localStorage.getItem('baka-workbench-reduce-motion')")
    expect(store).toContain("localStorage.setItem('baka-workbench-reduce-motion'")
  })

  it('does not crash the canvas when local engine APIs are unavailable', () => {
    expect(workbench).toContain('if (!window.localEngineAPI) return')
  })
})
