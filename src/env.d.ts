/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface WindowAPI {
  minimize: () => void
  maximize: () => void
  close: () => void
  isMaximized: () => Promise<boolean>
  onMaximizeChange: (callback: (maximized: boolean) => void) => void
}

interface AppAPI {
  getVersion: () => string
  getPlatform: () => string
}

interface LLMConfig {
  provider: string
  baseUrl: string
  apiKey: string
  model: string
  prompt: string
  temperature: number
  maxTokens: number
}

interface LLMAPI {
  tagImage: (params: { imageBase64: string; prompt?: string }) => Promise<{ success: boolean; tags?: string[]; error?: string }>
  getConfig: () => Promise<LLMConfig>
  saveConfig: (config: Partial<LLMConfig>) => Promise<{ success: boolean; error?: string }>
  listModels: (params?: { provider?: string; baseUrl?: string; apiKey?: string }) => Promise<{ success: boolean; models?: string[]; error?: string }>
}

interface SysStats {
  cpu: { usage: number; cores: number; model: string }
  memory: { used: number; total: number; percent: number }
  gpu: { name: string; vramUsed: number; vramTotal: number; vramPercent: number; temp: number; usage: number } | null
  uptime: number
  platform: string
}

interface SystemAPI {
  getStats: () => Promise<SysStats>
}

interface FileInfo { name: string; path: string }
interface FsAPI {
  selectFolder: () => Promise<string | null>
  listImages: (folderPath: string) => Promise<FileInfo[]>
  readImageBase64: (filePath: string) => Promise<{ success: boolean; base64?: string; mime?: string; error?: string }>
}

declare global {
  interface Window {
    windowAPI: WindowAPI
    appAPI: AppAPI
    llmAPI: LLMAPI
    systemAPI: SystemAPI
    fsAPI: FsAPI
  }
}

export {}
