// IPC 通道名 —— 单一事实来源 (single source of truth)
//
// 渲染端 preload.js 与主进程 electron/ipc/*.js 共用的所有 IPC 通道名常量。
// 新增/改名通道必须先在此登记；scripts/check-ipc-channels.js 会校验
// preload 与 handler 中实际使用的字符串与此处一致，拼错或漏登记即报错。
//
// 说明：当前 preload.js 与 handler 仍使用字符串字面量（未直接 import 本文件），
// 本文件作为「契约清单」由校验脚本消费。后续如需进一步收紧，可让 preload/handler
// 改为 import 这些常量，届时校验脚本依旧能兜底。

const Channels = {
  // ── Window 控制 ──
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_IS_MAXIMIZED: 'window:isMaximized',
  WINDOW_MAXIMIZE_CHANGE: 'window:maximizeChange', // event: main → renderer

  // ── LLM 配置/标注 ──
  LLM_TAG: 'llm:tag',
  LLM_GET_CONFIG: 'llm:getConfig',
  LLM_SAVE_CONFIG: 'llm:saveConfig',
  LLM_LIST_MODELS: 'llm:listModels',
  LLM_TEST: 'llm:test',
  LLM_GET_PROFILES: 'llm:getProfiles',
  LLM_SAVE_PROFILE: 'llm:saveProfile',
  LLM_SWITCH_PROFILE: 'llm:switchProfile',
  LLM_DELETE_PROFILE: 'llm:deleteProfile',
  LLM_CHAT: 'llm:chat',
  LLM_CANCEL_CHAT: 'llm:cancelChat',
  LLM_IMAGE: 'llm:image',
  LLM_LIST_API_CONFIGS: 'llm:listApiConfigs',
  LLM_SAVE_API_CONFIG: 'llm:saveApiConfig',
  LLM_DELETE_API_CONFIG: 'llm:deleteApiConfig',

  // ── Dialog ──
  DIALOG_SELECT_FOLDER: 'dialog:selectFolder',
  DIALOG_SELECT_IMAGES: 'dialog:selectImages',
  DIALOG_SELECT_MODELS: 'dialog:selectModels',
  DIALOG_SELECT_IMAGE: 'dialog:selectImage',
  DIALOG_SELECT_MEDIA: 'dialog:selectMedia',
  DIALOG_SELECT_VIDEOS: 'dialog:selectVideos',
  DIALOG_SAVE_IMAGE: 'dialog:saveImage',
  DIALOG_SAVE_FILE: 'dialog:saveFile',
  DIALOG_SAVE_TEXT: 'dialog:saveText',
  DIALOG_SAVE_WORKFLOW: 'dialog:saveWorkflow',
  DIALOG_SAVE_WORKFLOW_TO: 'dialog:saveWorkflowTo',
  DIALOG_OPEN_WORKFLOW: 'dialog:openWorkflow',

  // ── 文件系统 ──
  FS_LIST_IMAGES: 'fs:listImages',
  FS_READ_IMAGE_BASE64: 'fs:readImageBase64',
  FS_LIST_DATASET: 'fs:listDataset',
  FS_SAVE_CAPTION: 'fs:saveCaption',
  FS_COPY_FILE: 'fs:copyFile',
  FS_READ_THUMB: 'fs:readThumb',
  FS_READ_TEXT: 'fs:readText',
  FS_EXISTS: 'fs:exists',
  FS_CREATE_FOLDER: 'fs:createFolder',
  FS_MOVE_IMAGES: 'fs:moveImages',
  FS_SCAN_MODELS: 'fs:scanModels',
  FS_WRITE_BASE64: 'fs:writeBase64',
  FS_WRITE_TEXT_SAFE: 'fs:writeTextSafe',
  FS_WRITE_BYTES_SAFE: 'fs:writeBytesSafe',
  FS_DELETE_MEDIA: 'fs:deleteMedia',
  RECYCLE_LIST: 'recycle:list',
  RECYCLE_RESTORE: 'recycle:restore',
  RECYCLE_PURGE: 'recycle:purge',
  HISTORY_LIST: 'history:list',
  HISTORY_RESTORE: 'history:restore',
  WORKBENCH_IMAGE_INSPECT: 'workbenchImage:inspect',
  LOCAL_ENGINE_DETECT: 'localEngine:detect',
  LOCAL_ENGINE_LIST_PROFILES: 'localEngine:listProfiles',
  LOCAL_ENGINE_VALIDATE_ROOT: 'localEngine:validateRoot',
  LOCAL_ENGINE_SAVE_PROFILE: 'localEngine:saveProfile',
  LOCAL_ENGINE_REMOVE_PROFILE: 'localEngine:removeProfile',
  LOCAL_ENGINE_HEALTH: 'localEngine:health',
  LOCAL_ENGINE_LIST_MODELS: 'localEngine:listModels',
  LOCAL_ENGINE_OBJECT_INFO: 'localEngine:objectInfo',
  LOCAL_ENGINE_START: 'localEngine:start',
  LOCAL_ENGINE_EDIT_IMAGE: 'localEngine:editImage',
  LOCAL_ENGINE_RESOLVE_DEPENDENCIES: 'localEngine:resolveDependencies',
  LOCAL_ENGINE_REFRESH_DEPENDENCY_MAP: 'localEngine:refreshDependencyMap',
  LOCAL_ENGINE_INSTALL_REPOSITORY: 'localEngine:installRepository',
  LOCAL_ENGINE_UPDATE_REPOSITORY: 'localEngine:updateRepository',
  LOCAL_ENGINE_INSTALL_REQUIREMENTS: 'localEngine:installRequirements',
  LOCAL_ENGINE_PROGRESS: 'localEngine:progress',

  // ── 在线画廊 ──
  BOORU_LIST_SITES: 'booru:listSites',
  BOORU_SAVE_SITE: 'booru:saveSite',
  BOORU_DELETE_SITE: 'booru:deleteSite',
  BOORU_RESET_SITES: 'booru:resetSites',
  BOORU_GET_SETTINGS: 'booru:getSettings',
  BOORU_SAVE_SETTINGS: 'booru:saveSettings',
  BOORU_SEARCH: 'booru:search',
  BOORU_RANKING: 'booru:ranking',
  BOORU_TAG_SUGGEST: 'booru:tagSuggest',
  BOORU_RELATED_TAGS: 'booru:relatedTags',
  BOORU_DETAIL: 'booru:detail',
  BOORU_PROXY_IMAGE: 'booru:proxyImage',
  BOORU_DOWNLOAD: 'booru:download',
  BOORU_CHOOSE_FOLDER: 'booru:chooseFolder',
  BOORU_CREATE_FOLDER: 'booru:createFolder',
  BOORU_BATCH_DOWNLOAD: 'booru:batchDownload',
  BOORU_BATCH_PROGRESS: 'booru:batchProgress',

  // ── 系统监控 ──
  SYSTEM_STATS: 'system:stats',

  // ── 日志 ──
  LOG_ENTRY: 'log:entry', // event: main → renderer

  // ── 训练(旧 training) ──
  TRAINING_STATUS: 'training:status',
  TRAINING_SET_PATH: 'training:setPath',
  TRAINING_LAUNCH: 'training:launch',
  TRAINING_STOP: 'training:stop',
  TRAINING_CLONE: 'training:clone',
  TRAINING_CHECK_ENV: 'training:checkEnv',
  TRAINING_LOG: 'training:log', // event: main → renderer
  TRAINING_STATUS_CHANGE: 'training:statusChange', // event: main → renderer

  // ── Tagger V1(遗留接口,仍被部分组件使用) ──
  TAGGER_LOCAL_INFER: 'tagger:local-infer',

  // ── 缓存 ──
  CACHE_GET_SIZE: 'cache:getSize',
  CACHE_CLEAR: 'cache:clear',

  // ── Shell ──
  SHELL_OPEN_FOLDER: 'shell:openFolder',

  // ── Tagger V2 ──
  TAGGER_V2_LIST_MODELS: 'taggerV2:listModels',
  TAGGER_V2_GPU_INFO: 'taggerV2:gpuInfo',
  TAGGER_V2_SET_MODEL_DIR: 'taggerV2:setModelDir',
  TAGGER_V2_GET_MODEL_DIR: 'taggerV2:getModelDir',
  TAGGER_V2_IMPORT_MODEL: 'taggerV2:importModel',
  TAGGER_V2_OPEN_MODEL_DIR: 'taggerV2:openModelDir',
  TAGGER_V2_INFER_SINGLE: 'taggerV2:inferSingle',
  TAGGER_V2_INFER_BATCH: 'taggerV2:inferBatch',
  TAGGER_V2_CANCEL: 'taggerV2:cancel',
  TAGGER_V2_PROGRESS: 'taggerV2:progress', // event: main → renderer
  TAGGER_V2_SEARCH_TAGS: 'taggerV2:searchTags',
  TAGGER_V2_GET_CATEGORIES: 'taggerV2:getCategories',
  TAGGER_V2_TRANSLATE_TAGS: 'taggerV2:translateTags',
  TAGGER_V2_LIST_DOWNLOADABLE_MODELS: 'taggerV2:listDownloadableModels',
  TAGGER_V2_DOWNLOAD_MODEL: 'taggerV2:downloadModel',
  TAGGER_V2_DOWNLOAD_PROGRESS: 'taggerV2:downloadProgress', // event: main → renderer
  TAGGER_V2_BULK_DRY_RUN: 'taggerV2:bulkDryRun',
  TAGGER_V2_BULK_APPLY: 'taggerV2:bulkApply',
  TAGGER_V2_EXPORT_TAGS: 'taggerV2:exportTags',
  TAGGING_GENERATE: 'tagging:generate',
  TAGGING_PREVIEW: 'tagging:preview',
  TAGGING_APPLY: 'tagging:apply',
  TAGGING_PROGRESS: 'tagging:progress',
  TAGGING_CANCEL: 'tagging:cancel',
  TAGGING_LIST_TEMPLATES: 'tagging:listTemplates',
  TAGGING_SAVE_TEMPLATE: 'tagging:saveTemplate',
  TAGGING_DELETE_TEMPLATE: 'tagging:deleteTemplate',
  TAGGING_IMPORT_TEMPLATES: 'tagging:importTemplates',
  TAGGING_LIST_CONFIGS: 'tagging:listConfigs',
  CHARACTER_AUDIT_INVENTORY: 'characterAudit:inventory',
  CHARACTER_AUDIT_RUN: 'characterAudit:run',
  CHARACTER_AUDIT_APPLY: 'characterAudit:apply',
  IMAGE_TOOLS_REMOVE_BACKGROUND: 'imageTools:removeBackground',
  IMAGE_TOOLS_REPLACE_TRANSPARENT_BACKGROUND: 'imageTools:replaceTransparentBackground',
  IMAGE_TOOLS_EDIT: 'imageTools:edit',
  IMAGE_TOOLS_SIMILAR: 'imageTools:similar',
  IMAGE_TOOLS_BAD_SCAN: 'imageTools:badScan',
  IMAGE_TOOLS_REMOVE_BACKGROUND_AI: 'imageTools:removeBackgroundAi',
  IMAGE_TOOLS_GET_AI_MODEL_INFO: 'imageTools:getAiModelInfo',
  IMAGE_TOOLS_DOWNLOAD_AI_MODEL: 'imageTools:downloadAiModel',
  IMAGE_TOOLS_DOWNLOAD_AI_PROGRESS: 'imageTools:downloadAiProgress', // event: main → renderer
  PROMPT_LIST_WILDCARDS: 'prompt:listWildcards',
  PROMPT_EXPAND_WILDCARDS: 'prompt:expandWildcards',
  PROMPT_CONVERT_WEIGHTS: 'prompt:convertWeights',
  EFFECTS_RENDER: 'effects:render',
  EFFECTS_LIST_PRESETS: 'effects:listPresets',
  EFFECTS_SAVE_PRESET: 'effects:savePreset',
  EFFECTS_DELETE_PRESET: 'effects:deletePreset',
  VIDEO_PROBE: 'video:probe',
  VIDEO_EXTRACT: 'video:extract',
  VIDEO_CONVERT: 'video:convert',
  VIDEO_TAG: 'video:tag',
  VIDEO_CANCEL: 'video:cancel',
  VIDEO_PROGRESS: 'video:progress',
  VIDEO_TAG_PROGRESS: 'video:tagProgress', // event: main → renderer
  VIDEO_SET_FFMPEG_DIR: 'video:setFfmpegDir',

  // ── Gallery ──
  GALLERY_ADD_ROOT: 'gallery:addRoot',
  GALLERY_GET_ROOTS: 'gallery:getRoots',
  GALLERY_REMOVE_ROOT: 'gallery:removeRoot',
  GALLERY_SCAN: 'gallery:scan',
  GALLERY_GET_IMAGES: 'gallery:getImages',
  GALLERY_GET_THUMBNAIL: 'gallery:getThumbnail',
  GALLERY_GET_STATS: 'gallery:getStats',
  GALLERY_GET_IMAGE_TAGS: 'gallery:getImageTags',
  GALLERY_BATCH_GET_TAGS: 'gallery:batchGetTags',
  GALLERY_SET_IMAGE_TAGS: 'gallery:setImageTags',
  GALLERY_SAVE_ANNOTATION: 'gallery:saveAnnotation',
  GALLERY_UPDATE_IMAGE_PATHS: 'gallery:updateImagePaths',
  GALLERY_BATCH_SET_TAGS: 'gallery:batchSetTags',
  GALLERY_GET_METADATA: 'gallery:getMetadata',
  GALLERY_READ_FILE_META: 'gallery:readFileMeta',
  GALLERY_INSPECT_DROPPED_PATHS: 'gallery:inspectDroppedPaths',
  GALLERY_IMPORT_FILES: 'gallery:importFiles',
  GALLERY_SAVE_CAPTION_FILE: 'gallery:saveCaptionFile',
  GALLERY_BATCH_SAVE_CAPTIONS: 'gallery:batchSaveCaptions',
  GALLERY_SCAN_PROGRESS: 'gallery:scanProgress', // event: main → renderer

  // ── Updater ──
  UPDATER_CHECK: 'updater:check',
  UPDATER_DOWNLOAD: 'updater:download', // ipcRenderer.send (无需 handler 返回)
  UPDATER_INSTALL: 'updater:install', // ipcRenderer.send
  UPDATER_PROGRESS: 'updater:progress', // event: main → renderer
  UPDATER_DOWNLOADED: 'updater:downloaded', // event: main → renderer
  UPDATER_ERROR: 'updater:error', // event: main → renderer

  // ── 训练 HTTP 桥接 ──
  THTTP_SUBMIT_TRAINING: 'thttp:submitTraining',
  THTTP_PREFLIGHT: 'thttp:preflight',
  THTTP_GET_TASKS: 'thttp:getTasks',
  THTTP_GET_TASK_OUTPUT: 'thttp:getTaskOutput',
  THTTP_STOP_TASK: 'thttp:stopTask',
  THTTP_SYSTEM_MONITOR: 'thttp:systemMonitor',
  THTTP_GPU_STATUS: 'thttp:gpuStatus',
  THTTP_BACKEND_STATUS: 'thttp:backendStatus',
  THTTP_GET_SCHEMAS: 'thttp:getSchemas',
  THTTP_GET_SCHEMA_HASHES: 'thttp:getSchemaHashes',
  THTTP_GET_PRESETS: 'thttp:getPresets',
  THTTP_GET_SCRIPTS: 'thttp:getScripts',
  THTTP_RUN_SCRIPT: 'thttp:runScript',

  // ── Runtime 管理 ──
  RUNTIME_DEFS: 'runtime:defs',
  RUNTIME_SCAN: 'runtime:scan',
  RUNTIME_SET_REPO_PATH: 'runtime:setRepoPath',
  RUNTIME_SYSTEM_INFO: 'runtime:systemInfo',
  RUNTIME_RECOMMENDATION: 'runtime:recommendation',
  RUNTIME_HEALTH: 'runtime:health',
  RUNTIME_INSTALL: 'runtime:install',
  RUNTIME_CANCEL_INSTALL: 'runtime:cancelInstall',
  RUNTIME_LAUNCH: 'runtime:launch',
  RUNTIME_STOP: 'runtime:stop',
  RUNTIME_GUI_STATUS: 'runtime:guiStatus',
  RUNTIME_GET_CONFIG: 'runtime:getConfig',
  RUNTIME_UPDATE_CONFIG: 'runtime:updateConfig',
  RUNTIME_DISTRIBUTION: 'runtime:distribution',
  RUNTIME_ROLLBACK_TRAINER: 'runtime:rollbackTrainer',
  RUNTIME_AUTO_CLONE: 'runtime:autoClone',
  RUNTIME_LOG: 'runtime:log', // event: main → renderer
  RUNTIME_STATUS_CHANGE: 'runtime:statusChange', // event: main → renderer
  COMPONENTS_INSPECT: 'components:inspect',
  COMPONENTS_RECOMMENDATION: 'components:recommendation',
  COMPONENTS_INSTALL: 'components:install',
  COMPONENTS_PAUSE: 'components:pause',
  COMPONENTS_RESUME: 'components:resume',
  COMPONENTS_CANCEL: 'components:cancel',
  COMPONENTS_REPAIR: 'components:repair',
  COMPONENTS_ROLLBACK: 'components:rollback',
  COMPONENTS_CLEAR_CACHE: 'components:clearCache',
  COMPONENTS_EXPORT_CACHE: 'components:exportCache',
  COMPONENTS_IMPORT_CACHE: 'components:importCache',
  COMPONENTS_PROGRESS: 'components:progress',

  // ── Workflow ──
  WORKFLOW_SAVE_AUTOSAVE: 'workflow:saveAutosave',
  WORKFLOW_SAVE_AUTOSAVE_SYNC: 'workflow:saveAutosaveSync',
  WORKFLOW_LOAD_AUTOSAVE: 'workflow:loadAutosave',
  WORKFLOW_LIST_RECENT: 'workflow:listRecent',
  WORKFLOW_RECORD_RECENT: 'workflow:recordRecent',
  WORKFLOW_REMOVE_RECENT: 'workflow:removeRecent',

  // ── Assets ──
  ASSETS_LIST: 'assets:list',
  ASSETS_ADD: 'assets:add',
  ASSETS_DELETE: 'assets:delete',
  ASSETS_CLEAR: 'assets:clear',

  // ── Nodes ──
  NODES_LIST: 'nodes:list',
  NODES_IMPORT_FROM_GITHUB: 'nodes:importFromGithub',
  NODES_UPDATE: 'nodes:update',
  NODES_REMOVE: 'nodes:remove',
  NODES_SET_ENABLED: 'nodes:setEnabled',
}

module.exports = { Channels }
