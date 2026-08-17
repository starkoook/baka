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
    apiKeys?: string[]
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
      requestId?: string
    }) => Promise<{ success: boolean; text?: string; error?: string; cancelled?: boolean }>
    cancelChat: (requestId: string) => Promise<{ success: boolean }>
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
    moveImages: (params: { filePaths: string[]; destFolder: string; keepOriginal: boolean }) => Promise<{ success: boolean; data?: { moved: number; destPaths: string[]; results: { oldPath: string; newPath: string }[]; failures: { path: string; error: string }[] }; error?: string }>
    scanModels: (dirPath: string) => Promise<{ success: boolean; models?: { name: string; path: string; hasCsv: boolean }[]; error?: string }>
    writeBase64: (params: { filePath: string; base64: string }) => Promise<{ success: boolean; error?: string }>
    writeTextSafe: (params: { filePath: string; text: string }) => Promise<{ success: boolean; error?: string }>
    writeBytesSafe: (params: { filePath: string; base64: string }) => Promise<{ success: boolean; error?: string }>
    deleteMedia: (params: { filePaths: string[] }) => Promise<{ success: boolean; data?: { moved: number; failures: { path: string; error: string }[] }; error?: string }>
    saveImage: (params: { dataUrl: string; defaultName?: string }) => Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }>
    saveFile: (params: { sourcePath: string; defaultName?: string }) => Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }>
    saveText: (params: { text: string; defaultName?: string }) => Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }>
    saveWorkflow: (params: { content: string; defaultName?: string }) => Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }>
    saveWorkflowTo: (params: { filePath: string; content: string }) => Promise<{ success: boolean; path?: string; error?: string }>
    openWorkflow: () => Promise<{ success: boolean; content?: string; path?: string; canceled?: boolean; error?: string }>
    getFilePath: (file: File) => string
  }

  interface RecycleItem {
    id: number
    original_path: string
    recycle_path: string
    kind: string
    size: number
    deleted_at: string
  }

  interface RecycleAPI {
    list: () => Promise<{ success: boolean; data?: RecycleItem[]; error?: string }>
    restore: (id: number) => Promise<{ success: boolean; restoredPath?: string; error?: string }>
    purge: (id: number) => Promise<{ success: boolean; error?: string }>
  }

  interface HistoryVersion {
    id: number
    version_path: string
    created_at: string
  }

  interface HistoryAPI {
    list: (filePath: string) => Promise<{ success: boolean; data?: HistoryVersion[]; error?: string }>
    restore: (id: number) => Promise<{ success: boolean; targetPath?: string; error?: string }>
  }

  interface WorkbenchImageRecord {
    filePath: string
    fileName: string
    mimeType: string
    width: number
    height: number
    dataUrl: string
    metadata: import('./features/workbench/image-nodes').GenerationMetadata
  }

  interface WorkbenchImageAPI {
    inspect: (filePath: string) => Promise<{ success: boolean; image?: WorkbenchImageRecord; error?: string }>
  }

  interface LocalEngineDraft {
    valid: boolean
    error?: string
    type: 'comfy' | 'webui'
    root: string
    engineRoot: string
    baseUrl: string
    pythonPath?: string
    mainPath?: string
    entryPath?: string
    customNodesDir?: string
    extensionsDir?: string
    modelsDir: string
    outputDir: string
  }

  interface LocalEngineProfile extends LocalEngineDraft {
    id: string
    name: string
    lastVerifiedAt?: number
  }

  interface ComfyDependencyCandidate { repository: string; title: string; exact?: boolean }
  interface ComfyDependencyRecord {
    nodeType: string
    status: 'installed' | 'missing' | 'ambiguous' | 'unknown'
    candidates: ComfyDependencyCandidate[]
    requirementsPath?: string
    requiresRestart?: boolean
  }

  interface LocalEngineAPI {
    detect: () => Promise<LocalEngineDraft[]>
    listProfiles: () => Promise<LocalEngineProfile[]>
    validateRoot: (params: { root: string; type: 'comfy' | 'webui' }) => Promise<LocalEngineDraft>
    saveProfile: (profile: Partial<LocalEngineProfile> & Pick<LocalEngineProfile, 'type' | 'root' | 'name'>) => Promise<LocalEngineProfile>
    removeProfile: (id: string) => Promise<{ success: boolean }>
    health: (id: string) => Promise<{ healthy: boolean; error?: string }>
    listModels: (id: string) => Promise<string[]>
    start: (id: string) => Promise<{ success: boolean; started?: boolean; error?: string }>
    editImage: (params: { profileId: string; imageBase64: string; maskImageBase64?: string; mimeType?: string; prompt: string; negativePrompt?: string; model?: string; width?: number; height?: number }) => Promise<{ success: boolean; image?: string; error?: string }>
    resolveDependencies: (params: { profileId: string; nodeTypes: string[]; sourceHints?: import('./features/workbench/image-nodes').GenerationMetadata['sourceHints'] }) => Promise<ComfyDependencyRecord[]>
    installRepository: (params: { profileId: string; repository: string }) => Promise<{ target: string; requirementsPath?: string; requiresRestart: boolean }>
    updateRepository: (params: { profileId: string; repository: string }) => Promise<{ target: string; requirementsPath?: string; requiresRestart: boolean }>
    installRequirements: (params: { profileId: string; repository: string }) => Promise<{ requirementsPath: string; requiresRestart: boolean }>
    refreshDependencyMap: () => Promise<{ refreshed: boolean }>
    onProgress: (callback: (progress: { profileId: string; repository?: string; stage: string; message: string; success?: boolean }) => void) => void
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
    weight?: number
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
    loras?: { name: string; displayName?: string; weight: number; textEncoderWeight?: number }[]
    rawMetadata?: Record<string, string>
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
    setImageTags: (imageId: number, tags: { tag: string; category?: string; confidence?: number; source?: string; weight?: number }[]) => Promise<{ success: boolean; error?: string }>
    saveAnnotation: (params: {
      imageId: number
      imagePath: string
      tags: { tag: string; category?: string; confidence?: number; source?: string; weight?: number }[]
    }) => Promise<{
      success: boolean
      partial: boolean
      databaseSaved: boolean
      captionSaved: boolean
      captionPath?: string
      error?: string
    }>
    updateImagePaths: (mappings: { oldPath: string; newPath: string }[]) => Promise<{ success: boolean; data?: { updated: number }; error?: string }>
    batchSetTags: (entries: { imageId: number; tags: { tag: string; category?: string; confidence?: number; source?: string; weight?: number }[] }[]) => Promise<{ success: boolean; data?: { updated: number }; error?: string }>
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
    listDownloadableModels: () => Promise<{ success: boolean; data?: { id: string; name: string; repo: string; installed: boolean }[]; error?: string }>
    downloadModel: (modelId: string) => Promise<{ success: boolean; data?: { dirPath: string; models: ModelInfo[] }; error?: string }>
    onDownloadProgress: (callback: (event: { modelId: string; received: number; total: number }) => void) => void
    inferSingle: (params: InferSingleParams) => Promise<{ success: boolean; data?: { tags: TagResultV2[] }; error?: string }>
    inferBatch: (params: InferBatchParams) => Promise<{ success: boolean; taskId?: string; data?: { results: { path: string; tags: TagResultV2[]; error?: string }[]; count: number; cancelled?: boolean }; error?: string }>
    cancel: (taskId: string) => Promise<{ success: boolean; error?: string }>
    onProgress: (callback: (event: TaggerProgressEvent) => void) => void
    searchTags: (query: string, matchMode?: string, limit?: number, category?: string | null) => Promise<{ success: boolean; data?: VocabEntry[]; error?: string }>
    getCategories: () => Promise<{ success: boolean; data?: string[]; error?: string }>
    translateTags: (tags: string[], direction?: 'en2zh' | 'zh2en') => Promise<{ success: boolean; data?: { tag: string; translation: string; found: boolean }[]; error?: string }>
    bulkDryRun: (imageIds: number[], operation: BulkOperation) => Promise<{ success: boolean; data?: { previews: DryRunPreview[] }; error?: string }>
    bulkApply: (imageIds: number[], operation: BulkOperation) => Promise<{ success: boolean; data?: { updated: number }; error?: string }>
    exportTags: (imageIds: number[], template: ExportTemplate) => Promise<{ success: boolean; data?: { results: { imageId: number; text: string }[] }; error?: string }>
  }

  interface TaggingOptions {
    source: 'local' | 'llm' | 'combined' | 'natural'
    outputFormat?: 'danbooru' | 'natural' | 'both'
    templateId?: string
    customPrompt?: string
    imageIds?: number[]
    imagePaths?: string[]
    threshold?: number
    modelPath?: string
    csvPath?: string
    temperature?: number
    maxTokens?: number
    concurrency?: number
    retries?: number
    targetRpm?: number
    apiConfigIds?: string[]
    providers?: string[]
    resolution?: number
    batchSize?: number
    writeMode?: 'replace' | 'append' | 'skip_existing' | 'empty_only'
    prefix?: string
    suffix?: string
    replaceUnderscores?: boolean
    taskId?: string
    mergeStrategy?: 'union' | 'intersect' | 'difference' | 'a_only' | 'b_only'
  }

  interface TaggingResult {
    imageId?: number
    imagePath?: string
    tags: string[]
    natural?: string
    error?: string
  }

  interface TaggingPromptTemplate {
    id: string
    name: string
    prompt: string
    updatedAt?: number
  }

  interface TaggingAPI {
    generate: (params: TaggingOptions) => Promise<{ success: boolean; data?: TaggingResult[]; error?: string }>
    preview: (params: TaggingOptions) => Promise<{ success: boolean; data?: TaggingResult[]; error?: string }>
    apply: (params: { results: TaggingResult[]; writeMode?: 'replace' | 'append' | 'skip_existing' | 'empty_only' }) => Promise<{ success: boolean; data?: { updated: number; failures: { path: string; error: string }[] }; error?: string }>
    cancel: (taskId: string) => Promise<{ success: boolean; error?: string }>
    listTemplates: () => Promise<{ success: boolean; data?: { templates: TaggingPromptTemplate[] }; error?: string }>
    saveTemplate: (template: TaggingPromptTemplate) => Promise<{ success: boolean; data?: { template: TaggingPromptTemplate; templates: TaggingPromptTemplate[] }; error?: string }>
    deleteTemplate: (id: string) => Promise<{ success: boolean; data?: { templates: TaggingPromptTemplate[] }; error?: string }>
    importTemplates: (entries: TaggingPromptTemplate[]) => Promise<{ success: boolean; data?: { count: number; templates: TaggingPromptTemplate[] }; error?: string }>
    listConfigs: () => Promise<{ success: boolean; data?: { configs: WorkbenchApiConfig[] }; error?: string }>
    onProgress: (callback: (progress: { taskId: string; completed: number; total: number; currentFile?: string }) => void) => void
  }

  interface CharacterAuditItem {
    id?: number
    path: string
    tags: string[]
  }

  interface CharacterAuditInventoryEntry {
    tag: string
    count: number
    paths: string[]
  }

  interface CharacterAuditDecision {
    tag: string
    type: 'keep' | 'delete' | 'replace' | 'unsure'
    target?: string
    reason?: string
  }

  interface CharacterAuditAPI {
    inventory: (params: { imageIds?: number[] }) => Promise<{
      success: boolean
      data?: { items: CharacterAuditItem[]; inventory: CharacterAuditInventoryEntry[] }
      error?: string
    }>
    run: (params: { imageIds?: number[]; triggerWords?: string[]; referenceImagePaths?: string[] }) => Promise<{
      success: boolean
      data?: { items: CharacterAuditItem[]; inventory: CharacterAuditInventoryEntry[]; decisions: CharacterAuditDecision[]; raw?: unknown }
      error?: string
    }>
    apply: (params: { items: CharacterAuditItem[]; decisions: CharacterAuditDecision[]; parentByChild?: Record<string, string> }) => Promise<{
      success: boolean
      data?: { updated: number; failures: { path: string; error: string }[] }
      error?: string
    }>
  }

  interface ImageToolResult {
    base64: string
    outputPath: string
    width: number
    height: number
  }

  interface SimilarImageGroup {
    path: string
    hash: string
    width: number
    height: number
    error?: string
  }

  interface BadImageResult {
    path: string
    status: 'ok' | 'bad'
    issues: string[]
    width: number
    height: number
    size: number
    entropy: number | null
  }

  interface ImageToolsAPI {
    removeBackground: (params: { inputPath: string; outputPath?: string; tolerance?: number; feather?: number }) => Promise<{ success: boolean; data?: ImageToolResult; error?: string }>
    replaceTransparentBackground: (params: { inputPath: string; outputPath?: string; color?: string }) => Promise<{ success: boolean; data?: ImageToolResult; error?: string }>
    edit: (params: { inputPath: string; outputPath?: string; operation?: Record<string, any> }) => Promise<{ success: boolean; data?: ImageToolResult; error?: string }>
    similar: (params: { paths: string[]; threshold?: number }) => Promise<{ success: boolean; data?: { groups: SimilarImageGroup[][]; total: number; compared: number }; error?: string }>
    badScan: (params: { paths: string[] }) => Promise<{ success: boolean; data?: { results: BadImageResult[] }; error?: string }>
    removeBackgroundAi: (params: { inputPath: string; outputPath?: string; modelPath?: string }) => Promise<{ success: boolean; data?: ImageToolResult; error?: string }>
    getAiModelInfo: () => Promise<{ success: boolean; data?: { modelPath: string; installed: boolean }; error?: string }>
    downloadAiModel: () => Promise<{ success: boolean; data?: { modelPath: string }; error?: string }>
    onDownloadAiProgress: (callback: (event: { received: number; total: number }) => void) => void
  }

  interface WildcardOption {
    text: string
    weight: number
  }

  interface PromptAPI {
    listWildcards: () => Promise<{ success: boolean; data?: { entries: Record<string, WildcardOption[]> }; error?: string }>
    expandWildcards: (params: { text: string; seed?: number; weightFormat?: string }) => Promise<{ success: boolean; data?: { text: string; warnings: string[]; logs: string[]; variables: Record<string, string> }; error?: string }>
    convertWeights: (params: { text: string; from?: string; to?: string }) => Promise<{ success: boolean; data?: { text: string }; error?: string }>
  }

  interface EffectEntry {
    type: string
    value1?: number
    value2?: number
    value3?: number
    value4?: number
    value5?: number
    value6?: number
    textValue?: string
  }

  interface EffectsAPI {
    render: (params: { inputPath: string; effects: EffectEntry[]; outputPath?: string }) => Promise<{ success: boolean; data?: { base64: string; outputPath?: string }; error?: string }>
    listPresets: () => Promise<{ success: boolean; data?: { presets: { name: string; savedAt: string; effects: EffectEntry[] }[] }; error?: string }>
    savePreset: (preset: { name: string; effects: EffectEntry[] }) => Promise<{ success: boolean; error?: string }>
    deletePreset: (name: string) => Promise<{ success: boolean; error?: string }>
  }

  interface VideoProbeInfo {
    fps: number
    width: number
    height: number
    duration: number
  }

  interface VideoAPI {
    probe: (videoPath: string) => Promise<{ success: boolean; data?: VideoProbeInfo; error?: string }>
    extract: (params: { videoPath: string; outputDir: string; mode: string; fps?: number; count?: number; percent?: number; frameIndexes?: number[]; taskId?: string }) => Promise<{ success: boolean; data?: { frames: string[] }; error?: string }>
    convert: (params: { videoPath: string; outputPath: string; codec?: string; replaceOriginal?: boolean; taskId?: string }) => Promise<{ success: boolean; error?: string }>
    tag: (params: { videoPath: string; outputDir?: string; mode: string; fps?: number; count?: number; percent?: number; modelPath: string; csvPath?: string; threshold?: number; providers?: string[] }) => Promise<{ success: boolean; data?: { frames: string[]; tags: { tag: string; count: number; frequency: number }[]; frameTags: { frame: string; tags: string[] }[] }; error?: string }>
    cancel: (taskId: string) => Promise<{ success: boolean; error?: string }>
    onProgress: (callback: (progress: { taskId: string; frame?: number; time?: string }) => void) => void
    onTagProgress: (callback: (progress: { stage: string; completed: number; total: number; currentFile?: string }) => void) => void
    setFfmpegDir: (dirPath: string) => Promise<{ success: boolean; error?: string }>
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

  interface WorkflowRecentEntry {
    path: string
    name: string
    updatedAt: number
  }

  interface WorkflowAPI {
    saveAutosave: (content: string) => Promise<{ success: boolean; path?: string; error?: string }>
    saveAutosaveSync: (content: string) => { success: boolean; path?: string; error?: string }
    loadAutosave: () => Promise<{ success: boolean; content?: string; path?: string; error?: string }>
    listRecent: () => Promise<{ success: boolean; list?: WorkflowRecentEntry[] }>
    recordRecent: (entry: { path: string; name: string }) => Promise<{ success: boolean; list?: WorkflowRecentEntry[]; error?: string }>
    removeRecent: (filePath: string) => Promise<{ success: boolean; list?: WorkflowRecentEntry[] }>
  }

  interface AssetRecord {
    id: string
    type: 'image' | 'text' | 'video'
    file: string
    meta: { node?: string; prompt?: string }
    createdAt: number
  }

  interface AssetsAPI {
    list: () => Promise<{ success: boolean; list?: AssetRecord[] }>
    add: (entry: {
      type: AssetRecord['type']
      dataUrl?: string
      text?: string
      sourcePath?: string
      meta?: AssetRecord['meta']
    }) => Promise<{ success: boolean; asset?: AssetRecord; error?: string }>
    remove: (id: string) => Promise<{ success: boolean; list?: AssetRecord[] }>
    clear: () => Promise<{ success: boolean }>
  }

  interface Window {
    windowAPI: WindowAPI
    appAPI: AppAPI
    llmAPI: LLMAPI
    systemAPI: SystemAPI
    fsAPI: FsAPI
    galleryAPI: GalleryAPI
    taggerV2API: TaggerV2API
    taggingAPI: TaggingAPI
    characterAuditAPI: CharacterAuditAPI
    imageToolsAPI: ImageToolsAPI
    promptAPI: PromptAPI
    effectsAPI: EffectsAPI
    videoAPI: VideoAPI
    recycleAPI: RecycleAPI
    historyAPI: HistoryAPI
    cacheAPI: CacheAPI
    shellAPI: { openFolder: (filePath: string) => Promise<{ success: boolean; error?: string }> }
    logAPI: { onEntry: (cb: (entry: { time: string; type: string; message: string }) => void) => void }
    trainingAPI?: TrainingAPI
    runtimeAPI?: RuntimeAPI
    trainingComponentsAPI?: TrainingComponentsAPI
    nodesAPI?: NodesAPI
    workflowAPI: WorkflowAPI
    assetsAPI: AssetsAPI
    workbenchImageAPI: WorkbenchImageAPI
    booruGalleryAPI: BooruGalleryAPI
    localEngineAPI: LocalEngineAPI
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

  interface BooruGalleryAPI {
    listSites: () => Promise<{ success: boolean; sites: BooruGallerySite[]; error?: string }>
    saveSite: (site: BooruGallerySite) => Promise<{ success: boolean; sites: BooruGallerySite[]; error?: string }>
    deleteSite: (siteId: string) => Promise<{ success: boolean; sites: BooruGallerySite[]; error?: string }>
    resetSites: () => Promise<{ success: boolean; sites: BooruGallerySite[]; error?: string }>
    getSettings: () => Promise<{ success: boolean; settings: BooruGallerySettings; error?: string }>
    saveSettings: (settings: BooruGallerySettings) => Promise<{ success: boolean; settings: BooruGallerySettings; error?: string }>
    search: (params: {
      siteId: string
      query: string
      page?: number
      limit?: number
      rating?: string
      sort?: string
    }) => Promise<{ success: boolean; posts?: BooruGalleryPost[]; nextPage?: number | null; ended?: boolean; error?: string }>
    ranking: (params: { siteId: string; period: string; page?: number; limit?: number; rating?: string }) => Promise<{ success: boolean; posts?: BooruGalleryPost[]; nextPage?: number | null; ended?: boolean; error?: string }>
    tagSuggest: (params: { siteId: string; prefix: string; limit?: number }) => Promise<{ success: boolean; tags?: BooruGalleryTag[]; error?: string }>
    relatedTags: (params: { siteId: string; query: string }) => Promise<{ success: boolean; tags?: BooruGalleryTag[]; error?: string }>
    detail: (params: { siteId: string; postId: string }) => Promise<{ success: boolean; post?: BooruGalleryPost; site?: BooruGallerySite; error?: string }>
    proxyImage: (url: string) => Promise<{ success: boolean; base64?: string; mime?: string; error?: string }>
    download: (params: { url: string; suggestedName?: string }) => Promise<{ success: boolean; canceled?: boolean; filePath?: string; error?: string }>
    chooseFolder: () => Promise<{ success: boolean; folderPath?: string; error?: string }>
    createFolder: (parent: string, name: string) => Promise<{ success: boolean; folderPath?: string; error?: string }>
    batchDownload: (params: { items: { url: string; filename: string }[]; folder: string }) => Promise<{ success: boolean; downloaded?: number; failed?: { filename: string; error: string }[]; error?: string }>
    onBatchProgress: (callback: (data: { done: number; total: number; current: string }) => void) => void
  }

  interface BooruGallerySite {
    id: string
    label: string
    type: string
    baseUrl: string
  }

  interface BooruGalleryPost {
    id: string
    previewUrl: string
    fileUrl: string
    sampleUrl: string
    rating: string
    tags: string[]
    width: number
    height: number
    score: number
    createdAt: string
    author: string
    source: string
    postUrl: string
    uploader: string
    fileSize: number
  }

  interface BooruGallerySettings {
    proxy: string
    timeout: number
    credentials: {
      danbooru: { username: string; apiKey: string }
      gelbooru: { userId: string; apiKey: string }
      e621: { username: string; apiKey: string }
      derpibooru: { apiKey: string }
    }
  }

  interface BooruGalleryTag {
    name: string
    count: number
    category: string
  }
}

export {}
