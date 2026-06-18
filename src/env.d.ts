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
  tagImage: (params: { imageBase64: string; prompt?: string }) => Promise<{ success: boolean; tags?: string[]; raw?: string; error?: string }>
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

interface GalleryImage {
  id: number
  path: string
  filename: string
  dirname: string
  root_id: number | null
  width: number
  height: number
  file_size: number
  file_modified_at: string
  indexed_at: string
  thumb_hash: string | null
}

interface LibraryRoot {
  id: number
  path: string
  label: string
  added_at: string
  image_count?: number
}

interface ScanProgress {
  current: number
  total: number
  status: string
}

interface TagInfo {
  tag: string
  category: string
  confidence?: number
  source?: string
}

interface SDMetadata {
  hasMetadata: boolean
  generator?: string
  prompt?: string
  negative?: string
  steps?: number
  sampler?: string
  cfg?: number
  seed?: number
  model?: string
  modelType?: string
  vae?: string
  clip?: string
  width?: number
  height?: number
  loras?: { name: string; weight: number }[]
}

interface GalleryAPI {
  getFilePath: (file: File) => string
  addRoot: (folderPath: string) => Promise<{ success: boolean; data?: { id: number }; error?: string }>
  getRoots: () => Promise<{ success: boolean; data?: LibraryRoot[]; error?: string }>
  removeRoot: (rootId: number, deleteImages: boolean) => Promise<{ success: boolean; error?: string }>
  scan: (folderPath?: string) => Promise<{ success: boolean; data?: { newCount: number; skipCount: number; errorCount: number }; error?: string }>
  getImages: (params: { rootId?: number; sort?: string; order?: string; limit?: number; offset?: number }) => Promise<{ success: boolean; data?: GalleryImage[]; error?: string }>
  getThumbnail: (imageId: number) => Promise<{ success: boolean; data?: { base64: string; thumbHash: string }; error?: string }>
  getStats: () => Promise<{ success: boolean; data?: { totalImages: number; totalRoots: number; totalSize: number }; error?: string }>
  getImageTags: (imageId: number) => Promise<{ success: boolean; data?: TagInfo[]; error?: string }>
  batchGetTags: (imageIds: number[]) => Promise<{ success: boolean; data?: { [id: string]: TagInfo[] }; error?: string }>
  setImageTags: (imageId: number, tags: { tag: string; category?: string; confidence?: number; source?: string }[]) => Promise<{ success: boolean; error?: string }>
  batchSetTags: (entries: { imageId: number; tags: { tag: string; category?: string; confidence?: number; source?: string }[] }[]) => Promise<{ success: boolean; data?: { updated: number }; error?: string }>
  getMetadata: (imageId: number) => Promise<{ success: boolean; data?: SDMetadata; error?: string }>
  readFileMeta: (filePath: string) => Promise<{ success: boolean; data?: SDMetadata & { width?: number; height?: number; thumbBase64?: string }; error?: string }>
  saveCaptionFile: (imageId: number) => Promise<{ success: boolean; data?: { path: string; caption: string }; error?: string }>
  batchSaveCaptions: (imageIds: number[]) => Promise<{ success: boolean; data?: { count: number }; error?: string }>
  onScanProgress: (callback: (progress: ScanProgress) => void) => void
}

interface ModelInfo {
  name: string
  path: string
  csvPath: string | null
  resolution: number
  quality: string
  speed: string
  memoryMb: number
  provider: string
  inputLayout?: string
  normalization?: string
  outputActivation?: string
  resizeMode?: string
  padColor?: number[]
  defaultThreshold?: number
  characterThreshold?: number
  maxTags?: number
}

interface GpuInfo {
  name: string
  vramTotalMb: number
  vramUsedMb: number
  provider: string
}

interface VocabEntry {
  tag: string
  category: string
  postCount: number
}

interface TagResultV2 {
  tag: string
  confidence: number
}

interface InferBatchParams {
  modelPath: string
  csvPath?: string
  imagePaths: string[]
  threshold?: number
  batchSize?: number
  resolution?: number
  providers?: string[]
}

interface InferSingleParams {
  modelPath: string
  csvPath?: string
  imagePath: string
  threshold?: number
  resolution?: number
  providers?: string[]
}

interface TaggerProgressEvent {
  taskId: string
  type: 'progress' | 'complete' | 'cancelled' | 'error'
  completed?: number
  total?: number
  currentFile?: string
  batchSize?: number
  provider?: string
  results?: { path: string; tags: TagResultV2[]; error?: string }[]
  message?: string
  count?: number
  cancelled?: boolean
}

interface BulkOperation {
  type: 'add' | 'remove' | 'replace' | 'cleanup'
  tags?: string[]
  findPattern?: string
  replaceWith?: string
  useRegex?: boolean
}

interface DryRunPreview {
  imageId: number
  filename: string
  before: string[]
  after: string[]
  added: string[]
  removed: string[]
}

interface ExportTemplate {
  name: string
  format: string
  fileExt: string
}

interface TaggerV2API {
  listModels: () => Promise<{ success: boolean; data?: { models: ModelInfo[]; providers: string[] }; error?: string }>
  gpuInfo: () => Promise<{ success: boolean; data?: { gpu: GpuInfo; providers: string[] }; error?: string }>
  setModelDir: (dirPath: string) => Promise<{ success: boolean; error?: string }>
  getModelDir: () => Promise<{ success: boolean; data?: { dir: string; isDefault: boolean }; error?: string }>
  importModel: (filePath: string) => Promise<{ success: boolean; data?: { dest: string; models: ModelInfo[] }; error?: string }>
  openModelDir: () => Promise<{ success: boolean; error?: string }>
  inferSingle: (params: InferSingleParams) => Promise<{ success: boolean; data?: { tags: TagResultV2[] }; error?: string }>
  inferBatch: (params: InferBatchParams) => Promise<{ success: boolean; taskId?: string; data?: { results: { path: string; tags: TagResultV2[]; error?: string }[]; count: number; cancelled?: boolean }; error?: string }>
  cancel: (taskId: string) => Promise<{ success: boolean; error?: string }>
  onProgress: (callback: (event: TaggerProgressEvent) => void) => void
  searchTags: (query: string, matchMode?: string, limit?: number, category?: string | null) => Promise<{ success: boolean; data?: VocabEntry[]; error?: string }>
  getCategories: () => Promise<{ success: boolean; data?: string[]; error?: string }>
  bulkDryRun: (imageIds: number[], operation: BulkOperation) => Promise<{ success: boolean; data?: { previews: DryRunPreview[] }; error?: string }>
  bulkApply: (imageIds: number[], operation: BulkOperation) => Promise<{ success: boolean; data?: { updated: number }; error?: string }>
  exportTags: (imageIds: number[], template: ExportTemplate) => Promise<{ success: boolean; data?: { results: { imageId: number; text: string }[] }; error?: string }>
}

declare global {
  interface Window {
    windowAPI: WindowAPI
    appAPI: AppAPI
    llmAPI: LLMAPI
    systemAPI: SystemAPI
    fsAPI: FsAPI
    galleryAPI: GalleryAPI
    taggerV2API: TaggerV2API
    shellAPI: { openFolder: (filePath: string) => Promise<{ success: boolean; error?: string }> }
    logAPI: { onEntry: (cb: (entry: { time: string; type: string; message: string }) => void) => void }
  }
}

export {}
