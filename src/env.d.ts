/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare global {
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
    localModelDir?: string
    localModel?: string
  }

  interface WorkbenchApiConfig {
    id: string
    name: string
    provider: string
    baseUrl: string
    apiKey: string
    model: string
  }

  interface CacheAPI {
    getSize: () => Promise<{ items: { name: string; size: string }[]; total: string }>
    clear: (target: string) => Promise<void>
  }

  interface LLMAPI {
    tagImage: (params: { imageBase64: string; prompt?: string; threshold?: number; outputFormat?: string }) => Promise<{ success: boolean; tags?: string[]; raw?: string; natural?: string; error?: string }>
    getConfig: () => Promise<LLMConfig>
    saveConfig: (config: Partial<LLMConfig>) => Promise<{ success: boolean; error?: string }>
    listModels: (params?: { provider?: string; baseUrl?: string; apiKey?: string }) => Promise<{ success: boolean; models?: string[]; error?: string }>
    getProfiles: () => Promise<string[]>
    test: (params: { provider: string; apiKey: string; baseUrl: string; model: string }) => Promise<{ success: boolean; error?: string }>
    saveProfile: (params: { name: string; config: Partial<LLMConfig> }) => Promise<void>
    switchProfile: (name: string) => Promise<void>
    deleteProfile: (name: string) => Promise<void>
    chat: (params: {
      provider?: string
      baseUrl?: string
      apiKey?: string
      model?: string
      prompt: string
      imageBase64?: string
      mimeType?: string
      temperature?: number
      maxTokens?: number
    }) => Promise<{ success: boolean; text?: string; error?: string }>
    image: (params: {
      provider?: string
      baseUrl?: string
      apiKey?: string
      model?: string
      prompt: string
      imageBase64?: string
      mimeType?: string
      size?: string
    }) => Promise<{ success: boolean; images?: string[]; error?: string }>
    listApiConfigs: () => Promise<WorkbenchApiConfig[]>
    saveApiConfig: (cfg: Partial<WorkbenchApiConfig> & { name: string }) => Promise<{ success: boolean; config?: WorkbenchApiConfig; error?: string }>
    deleteApiConfig: (id: string) => Promise<{ success: boolean; error?: string }>
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
    selectImages: () => Promise<string[]>
    selectImage: () => Promise<string | null>
    selectMedia: () => Promise<string[]>
    selectVideos: () => Promise<string[]>
    selectModels: () => Promise<string[]>
    listImages: (folderPath: string) => Promise<FileInfo[]>
    readImageBase64: (filePath: string) => Promise<{ success: boolean; base64?: string; mime?: string; error?: string }>
    listDataset: (folderPath: string) => Promise<{ name: string; path: string; txtPath: string | null; caption: string; hasCaption: boolean }[]>
    saveCaption: (params: { txtPath: string; caption: string }) => Promise<{ success: boolean; error?: string }>
    copyFile: (params: { src: string; dest: string; destDir: string }) => Promise<{ success: boolean; error?: string }>
    readThumb: (filePath: string) => Promise<{ success: boolean; base64?: string; error?: string }>
    readText: (filePath: string) => Promise<{ success: boolean; text?: string; error?: string }>
    exists: (filePath: string) => Promise<boolean>
    createFolder: (folderPath: string) => Promise<{ success: boolean; path?: string; error?: string }>
    moveImages: (params: { filePaths: string[]; destFolder: string; keepOriginal: boolean }) => Promise<{ success: boolean; data?: { moved: number; destPaths: string[] }; error?: string }>
    scanModels: (dirPath: string) => Promise<{ success: boolean; models?: { name: string; path: string; hasCsv: boolean }[]; error?: string }>
    writeBase64: (params: { filePath: string; base64: string }) => Promise<{ success: boolean; error?: string }>
    saveImage: (params: { dataUrl: string; defaultName?: string }) => Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }>
    saveFile: (params: { sourcePath: string; defaultName?: string }) => Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }>
    saveText: (params: { text: string; defaultName?: string }) => Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }>
    saveWorkflow: (params: { content: string; defaultName?: string }) => Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }>
    saveWorkflowTo: (params: { filePath: string; content: string }) => Promise<{ success: boolean; path?: string; error?: string }>
    openWorkflow: () => Promise<{ success: boolean; content?: string; path?: string; canceled?: boolean; error?: string }>
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
    inspectDroppedPaths: (paths: string[]) => Promise<{
      success: boolean
      data?: { imagePaths: string[]; folderPaths: string[]; unsupportedCount: number }
      error?: string
    }>
    importFiles: (paths: string[]) => Promise<{
      success: boolean
      data?: { importedCount: number; skipCount: number; errorCount: number }
      error?: string
    }>
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
    saveAnnotation: (params: {
      imageId: number
      imagePath: string
      tags: { tag: string; category?: string; confidence?: number; source?: string }[]
    }) => Promise<{
      success: boolean
      partial: boolean
      databaseSaved: boolean
      captionSaved: boolean
      captionPath?: string
      error?: string
    }>
    updateImagePaths: (mappings: { oldPath: string; newPath: string }[]) => Promise<{ success: boolean; data?: { updated: number }; error?: string }>
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

  interface TrainingAPI {
    setPath: (folderPath: string) => Promise<void>
    status: () => Promise<{ repoPath: string; hasRepo: boolean; running: boolean }>
    checkEnv: () => Promise<{ python?: string; git?: boolean }>
    launch: () => Promise<{ success: boolean; error?: string }>
    stop: () => Promise<void>
    onLog: (cb: (entry: { type: string; message: string }) => void) => void
    onStatusChange: (cb: (st: { running: boolean; error?: string }) => void) => void
  }

  interface RuntimeAPI {
    defs: () => Promise<RuntimeDef[]>
    scan: () => Promise<{
      repoPath: string
      hasRepo: boolean
      runtimes: RuntimeStatus[]
    }>
    setRepoPath: (folderPath: string) => Promise<void>
    systemInfo: () => Promise<SystemInfo>
    recommendation: () => Promise<{ preferred_runtime_id: string | null; reason_zh?: string; gpu_name?: string; gpu_vendor?: string }>
    health: (runtimeId?: string) => Promise<Record<string, any>>
    install: (runtimeId: string) => Promise<{ success: boolean; cancelled?: boolean; taskId?: string; method?: string; script?: string; error?: string }>
    cancelInstall: () => Promise<{ success: boolean; runtimeId?: string; state?: 'cancelling'; error?: string }>
    launch: (params: { runtimeId: string; port: number }) => Promise<{ success: boolean; url?: string; error?: string }>
    stop: () => Promise<void>
    guiStatus: () => Promise<{ running: boolean; url?: string; error?: string }>
    getConfig: () => Promise<any>
    updateConfig: (partial: any) => Promise<void>
    distribution: () => Promise<{ repoPath: string; version: string; managed: boolean; packaged: boolean }>
    rollbackTrainer: () => Promise<{ success: boolean; path?: string; version?: string; error?: string }>
    autoClone: () => Promise<{ success: boolean; message?: string; path?: string; error?: string }>
    onLog: (cb: (entry: { type: string; message: string; runtimeId?: string }) => void) => () => void
    onStatusChange: (cb: (st: { running: boolean; error?: string }) => void) => () => void
  }

  interface RuntimeDef {
    id: string
    name_zh: string
    name_en: string
    desc_zh: string
    desc_en: string
    category: string
    experimental?: boolean
  }

  interface RuntimeStatus {
    id: string
    name_zh: string
    name_en: string
    desc_zh: string
    desc_en: string
    category: string
    experimental: boolean
    env_vars: Record<string, string>
    status: string
    statusText: string
    pythonPath: string | null
    envDir: string | null
  }

  interface SystemInfo {
    python: { path: string; version: string } | null
    git: boolean
    cuda: { available: boolean; gpus: Array<{ name: string; vramTotal: number; driver: string }>; cudaVersion: string | null }
  }

  interface TrainingHttpAPI {
    submitTraining: (config: Record<string, any>) => Promise<{ ok: boolean; status: number; data: any }>
    preflight: (config: Record<string, any>) => Promise<{ ok: boolean; status: number; data: any }>
    getTasks: () => Promise<{ ok: boolean; status: number; data: any }>
    getTaskOutput: (taskId: string, tail?: number) => Promise<{ ok: boolean; status: number; data: any }>
    stopTask: (taskId: string) => Promise<{ ok: boolean; status: number; data: any }>
    systemMonitor: () => Promise<{ ok: boolean; status: number; data: any }>
    gpuStatus: () => Promise<{ ok: boolean; status: number; data: any }>
    backendStatus: () => Promise<{ ok: boolean; status: number; data: any }>
    getSchemas: () => Promise<{ ok: boolean; status: number; data: any }>
    getSchemaHashes: () => Promise<{ ok: boolean; status: number; data: any }>
    getPresets: () => Promise<{ ok: boolean; status: number; data: any }>
    getScripts: () => Promise<{ ok: boolean; status: number; data: any }>
    runScript: (payload: Record<string, any>) => Promise<{ ok: boolean; status: number; data: any }>
  }

  interface TrainingComponentsAPI {
    inspect: () => Promise<any>
    recommendation: () => Promise<{ preferred_runtime_id: string | null; reason_zh: string; gpu_vendor?: string; gpu_name?: string; vram_mb?: number }>
    install: (runtimeId: string) => Promise<any>
    pause: () => Promise<void>
    resume: (runtimeId: string) => Promise<any>
    cancel: () => Promise<void>
    repair: (runtimeId: string) => Promise<any>
    rollback: (componentId: string) => Promise<any>
    clearCache: () => Promise<any>
    exportCache: (options: { destination: string; componentIds: string[] }) => Promise<any>
    importCache: (options: { source: string }) => Promise<any>
    onProgress: (cb: (progress: { componentId: string; downloaded: number; total: number; percent: number; bytesPerSecond: number }) => void) => () => void
  }

  interface NodeInputDef {
    name: string
    optional?: boolean
    default?: string
  }

  interface NodeDefinition {
    id: string
    label: string
    kind?: string
    category?: string
    inputs?: (string | NodeInputDef)[]
    outputs?: (string | NodeInputDef)[]
    inputCount?: number
    outputCount?: number
    color?: string
    contentH?: number
    file?: string
    _enabled?: boolean
    _source?: string
    _updatedAt?: string
  }

  interface NodesAPI {
    list: () => Promise<NodeDefinition[]>
    importFromGithub: (url: string) => Promise<{ success: boolean; nodes?: NodeDefinition[]; error?: string }>
    update: (file: string) => Promise<{ success: boolean; node?: NodeDefinition; error?: string }>
    remove: (file: string) => Promise<{ success: boolean; error?: string }>
    setEnabled: (file: string, enabled: boolean) => Promise<{ success: boolean; error?: string }>
  }

  interface Window {
    windowAPI: WindowAPI
    appAPI: AppAPI
    llmAPI: LLMAPI
    systemAPI: SystemAPI
    fsAPI: FsAPI
    galleryAPI: GalleryAPI
    taggerV2API: TaggerV2API
    cacheAPI: CacheAPI
    shellAPI: { openFolder: (filePath: string) => Promise<{ success: boolean; error?: string }> }
    logAPI: { onEntry: (cb: (entry: { time: string; type: string; message: string }) => void) => void }
    trainingAPI?: TrainingAPI
    runtimeAPI?: RuntimeAPI
    trainingComponentsAPI?: TrainingComponentsAPI
    nodesAPI?: NodesAPI
    trainingHttpAPI: TrainingHttpAPI
    updaterAPI: {
      check: () => Promise<{ available: boolean; compatible?: boolean; version?: string | null; currentVersion?: string; error?: string }>
      download: () => void
      install: () => void
      onProgress: (cb: (progress: { percent: number; speed: number }) => void) => void
      onDownloaded: (cb: (info: { version: string; local?: boolean; sha256?: string }) => void) => void
      onError: (cb: (error: string) => void) => void
    }
  }
}

export {}
