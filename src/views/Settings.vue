<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { getSettingsReturnTarget } from '@/features/navigation/workspace-history'
import { useAppStore, type ToolPosterKey } from '@/stores/app'
import { useTaggerStore } from '@/stores/tagger'
import { setSoundEnabled } from '@/composables/useSound'
import TrainingComponentsPanel from '@/components/settings/TrainingComponentsPanel.vue'
import SettingsCard from '@/components/settings/SettingsCard.vue'
import SettingsRow from '@/components/settings/SettingsRow.vue'
import SettingsToggle from '@/components/settings/SettingsToggle.vue'
import SettingsLayout from '@/components/settings/SettingsLayout.vue'
import {
  SETTINGS_SECTIONS,
  inferDataRoot,
  normalizeCacheSize,
  type SettingsSectionId,
} from '@/components/settings/settings-ia'

const appStore = useAppStore()
const taggerStore = useTaggerStore()
const router = useRouter()
const settingsReturnTarget = getSettingsReturnTarget()
function returnToWorkspace() {
  if (settingsReturnTarget) void router.push(settingsReturnTarget.route)
}

const sections = SETTINGS_SECTIONS
const activeSection = ref<SettingsSectionId>('general')
const active = computed(() => sections.find((s) => s.id === activeSection.value) ?? sections[0])

const provider = ref('openai')
const apiKey = ref('')
const apiKeys = ref('')
const baseUrl = ref('')
const model = ref('gpt-4o')
const temperature = ref(0.3)
const maxTokens = ref(500)
const systemPrompt = ref('')
const profiles = ref<string[]>([])
const activeProfile = ref('')
const apiModels = ref<string[]>([])
const testResult = ref('')
const testOk = ref(false)
const showApiKey = ref(false)

const apiConfigs = ref<WorkbenchApiConfig[]>([])
const showApiConfigEditor = ref(false)
const editingApiCfg = ref<WorkbenchApiConfig | null>(null)
const editApiCfgId = ref('')
const editApiCfgName = ref('')
const editApiCfgProvider = ref('openai')
const editApiCfgUrl = ref('')
const editApiCfgModel = ref('')
const editApiCfgKey = ref('')
const editApiCfgRpm = ref(5)
const editApiCfgMode = ref<'queue' | 'concurrent'>('queue')
const editApiCfgModels = ref<string[]>([])
const editApiCfgBusy = ref(false)
const editApiCfgActionMsg = ref('')
const editApiCfgTestOk = ref(false)
const apiCfgError = ref('')
const apiCfgAutosaveReady = ref(false)
let apiCfgSaveTimer = 0

const localModels = ref<ModelInfo[]>([])
const localModelProviders = ref<string[]>([])
const downloadableModels = ref<{ id: string; name: string; repo: string; installed: boolean }[]>([])
const modelThreshold = ref(0.35)
const characterThreshold = ref(0.85)
const addCharacter = ref(true)
const addCopyright = ref(true)
const replaceUnderscores = ref(false)
const autoSaveAfterTagging = ref(false)
const modelDir = ref('')
const modelDirIsDefault = ref(true)
const modelDownloading = ref<{ id: string; received: number; total: number } | null>(null)
const modelsError = ref('')
const dataRoot = computed(() => inferDataRoot(modelDir.value))

const cacheItems = ref<{ name: string; size: string }[]>([])
const cacheTotal = ref('0 B')
const recycleItems = ref<RecycleItem[]>([])

const booruProxy = ref('')
const booruTimeout = ref(30)
const networkSaving = ref(false)

async function loadRecycleItems() {
  if (!window.recycleAPI) return
  const result = await window.recycleAPI.list()
  if (result.success && result.data) recycleItems.value = result.data
}

async function restoreRecycleItem(id: number) {
  if (!window.recycleAPI) return
  const result = await window.recycleAPI.restore(id)
  if (result.success) appStore.setStatus('\u5df2\u6062\u590d\u5230\u539f\u4f4d\u7f6e')
  else appStore.setError(result.error || '\u6062\u590d\u5931\u8d25')
  await loadRecycleItems()
}

async function purgeRecycleItem(id: number) {
  if (!window.recycleAPI) return
  if (!confirm('\u786e\u8ba4\u5f7b\u5e95\u5220\u9664\u8fd9\u4e2a\u56de\u6536\u7ad9\u9879\u76ee\uff1f')) return
  const result = await window.recycleAPI.purge(id)
  if (result.success) appStore.setStatus('\u5df2\u5f7b\u5e95\u5220\u9664')
  else appStore.setError(result.error || '\u5220\u9664\u5931\u8d25')
  await loadRecycleItems()
}

const isLight = computed(() => appStore.theme === 'light')
const soundEnabled = ref(localStorage.getItem('baka-sound-enabled') !== 'off')
watch(soundEnabled, (value) => {
  localStorage.setItem('baka-sound-enabled', value ? 'on' : 'off')
  setSoundEnabled(value)
})
onMounted(() => setSoundEnabled(soundEnabled.value))

const TOOL_PREVIEWS: { key: ToolPosterKey; label: string; default: string }[] = [
  { key: 'gallery', label: '\u56fe\u5e93', default: '/tools/gallery.jpg' },
  { key: 'booruGallery', label: '\u5728\u7ebf\u56fe\u5e93', default: '/tools/upscale.jpg' },
  { key: 'tagger', label: '\u6807\u6ce8', default: '/tools/tagger.jpg' },
  { key: 'training', label: '\u8bad\u7ec3', default: '/tools/train.jpg' },
  { key: 'upscale', label: '\u653e\u5927', default: '/tools/upscale.jpg' },
  { key: 'workbench', label: '\u5de5\u4f5c\u53f0', default: '/tools/workbench.jpg' },
  { key: 'video', label: '\u89c6\u9891\u5de5\u5177', default: '/tools/upscale.jpg' },
  { key: 'imageTools', label: '\u56fe\u50cf\u5de5\u5177', default: '/tools/upscale.jpg' },
]
const posterPreviews = ref<Record<string, string>>({})

async function refreshPosterPreviews() {
  for (const tool of TOOL_PREVIEWS) {
    const path = appStore.toolPosters[tool.key]
    if (path && window.fsAPI) {
      const result = await window.fsAPI.readImageBase64(path)
      if (result.success) {
        posterPreviews.value[tool.key] = `data:${result.mime};base64,${result.base64}`
        continue
      }
    }
    posterPreviews.value[tool.key] = tool.default
  }
}

async function pickToolPoster(key: ToolPosterKey) {
  if (!window.fsAPI) return
  const path = await window.fsAPI.selectImage()
  if (path) {
    appStore.setToolPoster(key, path)
    await refreshPosterPreviews()
    const label = TOOL_PREVIEWS.find((t) => t.key === key)?.label ?? key
    appStore.setStatus(`${label}\u9884\u89c8\u56fe\u5df2\u66f4\u65b0`)
  }
}

function resetToolPoster(key: ToolPosterKey) {
  appStore.setToolPoster(key, null)
  void refreshPosterPreviews()
}

async function loadConfig() {
  if (!window.llmAPI) return
  const c = await window.llmAPI.getConfig()
  if (c) {
    provider.value = c.provider || 'openai'
    apiKey.value = c.apiKey || ''
    apiKeys.value = Array.isArray(c.apiKeys) ? c.apiKeys.join('\n') : ''
    baseUrl.value = c.baseUrl || ''
    model.value = c.model || 'gpt-4o'
    temperature.value = c.temperature ?? 0.3
    maxTokens.value = c.maxTokens ?? 500
    systemPrompt.value = c.prompt || ''
  }
  const p = await window.llmAPI.getProfiles()
  if (p) {
    profiles.value = p.profiles
    activeProfile.value = p.activeProfile
  }
  if (window.cacheAPI) {
    const s = await window.cacheAPI.getSize()
    const normalized = normalizeCacheSize(s)
    cacheItems.value = normalized.items
    cacheTotal.value = normalized.total
  }
  await loadApiConfigs()
  await loadLocalModels()
  await loadTaggingSettings()
  await loadNetworkSettings()
}

async function saveConfig() {
  if (window.llmAPI) await window.llmAPI.saveConfig({
    provider: provider.value, apiKey: apiKey.value, baseUrl: baseUrl.value,
    model: model.value, temperature: temperature.value,
    maxTokens: maxTokens.value, prompt: systemPrompt.value,
    apiKeys: apiKeys.value.split('\n').map((key) => key.trim()).filter(Boolean),
  })
  appStore.setStatus('\u914d\u7f6e\u5df2\u4fdd\u5b58')
}

async function testConn() {
  if (!window.llmAPI) return
  testResult.value = '\u6d4b\u8bd5\u4e2d...'; testOk.value = false
  const r = await window.llmAPI.test({
    provider: provider.value, apiKey: apiKey.value,
    baseUrl: baseUrl.value, model: model.value,
  })
  testOk.value = r.success
  testResult.value = r.success ? '\u8fde\u63a5\u6210\u529f' : (r.error || '\u8fde\u63a5\u5931\u8d25')
}

async function loadApiModels() {
  if (!window.llmAPI) return
  const r = await window.llmAPI.listModels({
    provider: provider.value, baseUrl: baseUrl.value, apiKey: apiKey.value,
  })
  if (r.success && r.models) apiModels.value = r.models
}

async function loadApiConfigs() {
  if (!window.llmAPI) return
  const result = await window.llmAPI.listApiConfigs()
  if (Array.isArray(result)) apiConfigs.value = result
}

function resetApiCfgAction() {
  apiCfgError.value = ''
  editApiCfgActionMsg.value = ''
  editApiCfgTestOk.value = false
}

function apiCfgPayload() {
  return {
    id: editApiCfgId.value,
    name: editApiCfgName.value.trim(),
    provider: editApiCfgProvider.value,
    baseUrl: editApiCfgUrl.value,
    model: editApiCfgModel.value,
    apiKey: editApiCfgKey.value,
    targetRpm: Number.isFinite(editApiCfgRpm.value) ? Math.max(0, Number(editApiCfgRpm.value)) : 5,
    requestMode: editApiCfgMode.value === 'concurrent' ? 'concurrent' as const : 'queue' as const,
  }
}

function openNewApiConfig() {
  apiCfgAutosaveReady.value = false
  editApiCfgId.value = `cfg_${Date.now()}`
  editApiCfgName.value = ''
  editApiCfgProvider.value = 'openai'
  editApiCfgUrl.value = ''
  editApiCfgModel.value = ''
  editApiCfgKey.value = ''
  editApiCfgRpm.value = 5
  editApiCfgMode.value = 'queue'
  editApiCfgModels.value = []
  editingApiCfg.value = null
  showApiConfigEditor.value = true
  resetApiCfgAction()
  queueMicrotask(() => { apiCfgAutosaveReady.value = true })
}

function openEditApiConfig(cfg: WorkbenchApiConfig) {
  apiCfgAutosaveReady.value = false
  editApiCfgId.value = cfg.id
  editApiCfgName.value = cfg.name
  editApiCfgProvider.value = cfg.provider
  editApiCfgUrl.value = cfg.baseUrl
  editApiCfgModel.value = cfg.model
  editApiCfgKey.value = cfg.apiKey
  editApiCfgRpm.value = cfg.targetRpm ?? 5
  editApiCfgMode.value = cfg.requestMode === 'concurrent' ? 'concurrent' : 'queue'
  editApiCfgModels.value = []
  editingApiCfg.value = cfg
  showApiConfigEditor.value = true
  resetApiCfgAction()
  queueMicrotask(() => { apiCfgAutosaveReady.value = true })
}

function scheduleApiCfgAutosave() {
  if (!apiCfgAutosaveReady.value || !showApiConfigEditor.value || !editApiCfgName.value.trim()) return
  window.clearTimeout(apiCfgSaveTimer)
  apiCfgSaveTimer = window.setTimeout(() => { void saveApiConfigEntry({ silent: true }) }, 400)
}

async function saveApiConfigEntry(opts: { silent?: boolean } = {}) {
  if (!window.llmAPI || !editApiCfgName.value.trim()) {
    if (!opts.silent) apiCfgError.value = '\u914d\u7f6e\u540d\u79f0\u4e0d\u80fd\u4e3a\u7a7a'
    return
  }
  const r = await window.llmAPI.saveApiConfig(apiCfgPayload())
  if (!r.success) {
    apiCfgError.value = r.error || '\u4fdd\u5b58\u5931\u8d25'
    return
  }
  if (r.config?.id) editApiCfgId.value = r.config.id
  if (!opts.silent) showApiConfigEditor.value = false
  await loadApiConfigs()
  if (!opts.silent) appStore.setStatus('API \u914d\u7f6e\u5df2\u4fdd\u5b58\uff0c\u6253\u6807\u65f6\u53ef\u76f4\u63a5\u9009\u7528')
}

async function fetchApiCfgModels() {
  if (!window.llmAPI) return
  editApiCfgBusy.value = true
  editApiCfgActionMsg.value = ''
  editApiCfgTestOk.value = false
  try {
    const r = await window.llmAPI.listModels({
      provider: editApiCfgProvider.value,
      baseUrl: editApiCfgUrl.value,
      apiKey: editApiCfgKey.value,
    })
    if (r.success && r.models) {
      editApiCfgModels.value = r.models
      if (!editApiCfgModel.value && r.models[0]) editApiCfgModel.value = r.models[0]
      editApiCfgActionMsg.value = r.models.length ? `\u5df2\u83b7\u53d6 ${r.models.length} \u4e2a\u6a21\u578b` : '\u672a\u8fd4\u56de\u6a21\u578b'
      editApiCfgTestOk.value = true
    } else {
      editApiCfgActionMsg.value = r.error || '\u83b7\u53d6\u6a21\u578b\u5931\u8d25'
    }
  } finally {
    editApiCfgBusy.value = false
  }
}

async function testApiCfgConn() {
  if (!window.llmAPI) return
  editApiCfgBusy.value = true
  editApiCfgActionMsg.value = '\u6d4b\u8bd5\u4e2d...'
  editApiCfgTestOk.value = false
  try {
    const r = await window.llmAPI.test({
      provider: editApiCfgProvider.value,
      apiKey: editApiCfgKey.value,
      baseUrl: editApiCfgUrl.value,
      model: editApiCfgModel.value,
    })
    editApiCfgTestOk.value = r.success
    editApiCfgActionMsg.value = r.success ? '\u8fde\u63a5\u6210\u529f' : (r.error || '\u8fde\u63a5\u5931\u8d25')
  } finally {
    editApiCfgBusy.value = false
  }
}

async function deleteApiConfigEntry(id: string) {
  if (!window.llmAPI || !confirm('\u786e\u8ba4\u5220\u9664\u8fd9\u4e2a API \u914d\u7f6e\uff1f')) return
  await window.llmAPI.deleteApiConfig(id)
  await loadApiConfigs()
}

async function loadTaggingSettings() {
  if (!window.taggerSettingsAPI) return
  const result = await window.taggerSettingsAPI.get()
  if (!result.success || !result.data) return
  modelThreshold.value = result.data.generalThreshold
  characterThreshold.value = result.data.characterThreshold
  addCharacter.value = result.data.addCharacter
  addCopyright.value = result.data.addCopyright
  replaceUnderscores.value = result.data.replaceUnderscores
  autoSaveAfterTagging.value = result.data.autoSaveAfterTagging
  modelDir.value = result.data.localModelDir || ''
}

async function persistTaggingSettings(partial: Partial<TaggerSettings> = {}) {
  if (!window.taggerSettingsAPI) return
  const result = await window.taggerSettingsAPI.save({
    generalThreshold: modelThreshold.value,
    characterThreshold: characterThreshold.value,
    addCharacter: addCharacter.value,
    addCopyright: addCopyright.value,
    replaceUnderscores: replaceUnderscores.value,
    autoSaveAfterTagging: autoSaveAfterTagging.value,
    ...partial,
  })
  if (result.success && result.data) {
    modelThreshold.value = result.data.generalThreshold
    characterThreshold.value = result.data.characterThreshold
    addCharacter.value = result.data.addCharacter
    addCopyright.value = result.data.addCopyright
    replaceUnderscores.value = result.data.replaceUnderscores
    autoSaveAfterTagging.value = result.data.autoSaveAfterTagging
    if (result.data.localModelDir) modelDir.value = result.data.localModelDir
    appStore.setStatus('\u6807\u6ce8\u8bbe\u7f6e\u5df2\u4fdd\u5b58')
  } else if (result.error) {
    modelsError.value = result.error
  }
}

async function chooseModelDir() {
  if (!window.fsAPI || !window.taggerV2API) return
  const dir = await window.fsAPI.selectFolder()
  if (!dir) return
  const set = await window.taggerV2API.setModelDir(dir)
  if (!set.success) {
    modelsError.value = set.error || '\u65e0\u6cd5\u8bbe\u7f6e\u6a21\u578b\u76ee\u5f55'
    return
  }
  await persistTaggingSettings({ localModelDir: dir })
  const info = await window.taggerV2API.getModelDir()
  if (info.success && info.data) {
    modelDir.value = info.data.dir
    modelDirIsDefault.value = info.data.isDefault
  }
  await loadLocalModels()
}

async function loadLocalModels() {
  if (!window.taggerV2API) return
  const r = await window.taggerV2API.listModels()
  if (r.success) {
    localModels.value = r.data?.models ?? []
    localModelProviders.value = r.data?.providers ?? []
  }
  const dl = await window.taggerV2API.listDownloadableModels()
  if (dl.success) downloadableModels.value = dl.data ?? []
  const dir = await window.taggerV2API.getModelDir()
  if (dir.success && dir.data) {
    modelDir.value = dir.data.dir
    modelDirIsDefault.value = dir.data.isDefault
  }
}

function selectActiveTaggerModel(path: string) {
  taggerStore.activeModelPath = path
  taggerStore.persistSession()
}

async function downloadLocalModel(id: string) {
  if (!window.taggerV2API) return
  modelDownloading.value = { id, received: 0, total: 0 }
  await window.taggerV2API.downloadModel(id)
  modelDownloading.value = null
  await loadLocalModels()
}

async function deleteLocalModel(modelPath: string) {
  if (!window.taggerV2API?.deleteModel) return
  if (!confirm('确认删除这个已安装模型？')) return
  const result = await window.taggerV2API.deleteModel(modelPath)
  if (!result.success) {
    modelsError.value = result.error || '删除失败'
    return
  }
  if (taggerStore.activeModelPath === modelPath) {
    taggerStore.activeModelPath = ''
    taggerStore.persistSession()
  }
  await loadLocalModels()
  appStore.setStatus('模型已删除')
}

async function importLocalModel() {
  if (!window.fsAPI || !window.taggerV2API) return
  const paths = await window.fsAPI.selectModels()
  if (paths?.length) {
    for (const p of paths) await window.taggerV2API.importModel(p)
    await loadLocalModels()
    appStore.setStatus('\u6a21\u578b\u5df2\u5bfc\u5165')
  }
}

async function openModelDir() {
  await window.taggerV2API?.openModelDir()
}

async function openDataRoot() {
  const target = dataRoot.value || modelDir.value
  if (!target || !window.shellAPI) return
  await window.shellAPI.openFolder(target)
}

async function saveProfile() {
  const name = prompt('\u914d\u7f6e\u5b58\u6863\u540d\u79f0:')
  if (name && window.llmAPI) {
    await window.llmAPI.saveProfile({
      name, config: {
        provider: provider.value, apiKey: apiKey.value, baseUrl: baseUrl.value,
        model: model.value, temperature: temperature.value,
        maxTokens: maxTokens.value, prompt: systemPrompt.value,
      },
    })
    profiles.value = (await window.llmAPI.getProfiles())?.profiles || []
  }
}

async function switchProfile(name: string) {
  if (!window.llmAPI) return
  await window.llmAPI.switchProfile(name)
  activeProfile.value = name
  await loadConfig()
}

async function deleteProfile(name: string) {
  if (!confirm(`\u5220\u9664 "${name}"\uff1f`)) return
  if (window.llmAPI) {
    await window.llmAPI.deleteProfile(name)
    profiles.value = (await window.llmAPI.getProfiles())?.profiles || []
  }
}

async function clearCache(target: string) {
  if (window.cacheAPI) {
    await window.cacheAPI.clear(target)
    const s = await window.cacheAPI.getSize()
    const normalized = normalizeCacheSize(s)
    cacheItems.value = normalized.items
    cacheTotal.value = normalized.total
  }
}

async function loadNetworkSettings() {
  if (!window.booruGalleryAPI?.getSettings) return
  const result = await window.booruGalleryAPI.getSettings()
  if (result.success && result.settings) {
    booruProxy.value = result.settings.proxy || ''
    booruTimeout.value = result.settings.timeout ?? 30
  }
}

async function saveNetworkSettings() {
  if (!window.booruGalleryAPI?.getSettings || !window.booruGalleryAPI.saveSettings) return
  networkSaving.value = true
  try {
    const current = await window.booruGalleryAPI.getSettings()
    if (!current.success || !current.settings) {
      appStore.setError(current.error || '\u65e0\u6cd5\u8bfb\u53d6\u7f51\u7edc\u8bbe\u7f6e')
      return
    }
    const settings = { ...current.settings, proxy: booruProxy.value.trim(), timeout: Number(booruTimeout.value) || 30 }
    const result = await window.booruGalleryAPI.saveSettings(settings)
    if (result.success) {
      if (result.settings) {
        booruProxy.value = result.settings.proxy || ''
        booruTimeout.value = result.settings.timeout ?? 30
      }
      appStore.setStatus('\u7f51\u7edc\u8bbe\u7f6e\u5df2\u4fdd\u5b58')
    } else {
      appStore.setError(result.error || '\u7f51\u7edc\u8bbe\u7f6e\u4fdd\u5b58\u5931\u8d25')
    }
  } finally {
    networkSaving.value = false
  }
}

watch(
  [editApiCfgName, editApiCfgProvider, editApiCfgUrl, editApiCfgModel, editApiCfgKey, editApiCfgRpm, editApiCfgMode],
  () => scheduleApiCfgAutosave(),
)

onMounted(() => {
  void loadConfig()
  void refreshPosterPreviews()
  void loadRecycleItems()
})
</script>

<template>
  <SettingsLayout v-model="activeSection" :sections="sections" title="设置">
    <header class="settings-pane-head">
      <button
        v-if="settingsReturnTarget"
        class="settings-back"
        type="button"
        @click="returnToWorkspace"
      >
        返回{{ settingsReturnTarget.shortLabel }}
      </button>
      <h2>{{ active.label }}</h2>
      <p>{{ active.hint }}</p>
    </header>

    <div v-if="activeSection === 'general'" class="settings-stack">
      <SettingsCard title="标注保存" description="自动写入默认关闭，避免覆盖已有标注">
        <SettingsRow title="标注后自动保存" description="关闭时只生成预览，需手动确认写入">
          <SettingsToggle
            :model-value="autoSaveAfterTagging"
            @update:model-value="(value) => { autoSaveAfterTagging = value; persistTaggingSettings({ autoSaveAfterTagging: value }) }"
          />
        </SettingsRow>
      </SettingsCard>
      <SettingsCard title="操作反馈" description="二次元萌系语音（nya〜 / 笑声，CC0）">
        <SettingsRow title="点击音效" description="开启后操作按钮会播放萌系反馈音">
          <SettingsToggle v-model="soundEnabled" />
        </SettingsRow>
      </SettingsCard>
    </div>

    <div v-else-if="activeSection === 'appearance'" class="settings-stack">
      <SettingsCard title="界面主题" description="切换后立即生效，保存在本机">
        <SettingsRow title="颜色模式" description="深色 / 浅色，跟随现有主题变量">
          <button class="sk-theme-btn" type="button" :class="{ active: !isLight }" @click="isLight ? appStore.setTheme('dark') : undefined">
            <span class="sk-theme-swatch sk-theme-swatch--dark"></span>
            <span>深色</span>
          </button>
          <button class="sk-theme-btn" type="button" :class="{ active: isLight }" @click="!isLight ? appStore.setTheme('light') : undefined">
            <span class="sk-theme-swatch sk-theme-swatch--light"></span>
            <span>浅色</span>
          </button>
        </SettingsRow>
      </SettingsCard>
      <SettingsCard title="互动助手" description="Baka 小人的全息投影">
        <SettingsRow title="显示助手" description="在界面角落显示 Baka 小人">
          <SettingsToggle :model-value="appStore.showMascot" @update:model-value="appStore.toggleMascot()" />
        </SettingsRow>
      </SettingsCard>
      <SettingsCard title="工具预览图" description="自定义工具选择页的背景大图">
        <SettingsRow
          v-for="tool in TOOL_PREVIEWS"
          :key="tool.key"
          :title="tool.label"
          :description="appStore.toolPosters[tool.key] ? '已自定义' : '使用默认'"
        >
          <img v-if="posterPreviews[tool.key]" :src="posterPreviews[tool.key]" class="sk-poster-thumb" alt="" />
          <button class="sk-btn" type="button" @click="pickToolPoster(tool.key)">选择图片</button>
          <button v-if="appStore.toolPosters[tool.key]" class="sk-btn" type="button" @click="resetToolPoster(tool.key)">重置</button>
        </SettingsRow>
      </SettingsCard>
    </div>

    <div v-else-if="activeSection === 'models'" class="settings-stack">
      <SettingsCard title="ONNX 模型" description="WD14 / PixAI / CL Tagger 等本地模型">
        <SettingsRow v-if="localModels.length === 0" title="暂无模型" description="从下方下载或手动导入 .onnx + .csv" />
        <SettingsRow
          v-for="m in localModels"
          :key="m.path"
          class="sk-model-row"
          :class="{ 'is-active': m.path === taggerStore.activeModelPath }"
          :title="m.name || (m.path.split(/[/\\]/).pop() ?? '')"
          :description="String(m.resolution) + 'px · ' + (m.provider || 'ONNX')"
          @click="selectActiveTaggerModel(m.path)"
        >
          <span v-if="m.path === taggerStore.activeModelPath" class="sk-badge">当前</span>
          <button class="sk-btn sk-btn--danger" type="button" @click.stop="deleteLocalModel(m.path)">删除</button>
        </SettingsRow>
        <SettingsRow title="模型目录" :description="modelDir || '默认 BakaTOOLS-data/tagger-models'">
          <button class="sk-btn" type="button" @click="chooseModelDir">选择目录</button>
          <button class="sk-btn" type="button" @click="openModelDir">打开目录</button>
        </SettingsRow>
        <SettingsRow title="导入模型" description="选择 .onnx 文件，自动匹配同目录 .csv">
          <button class="sk-btn" type="button" @click="importLocalModel">导入</button>
          <button class="sk-btn" type="button" @click="openModelDir">打开目录</button>
        </SettingsRow>
        <p v-if="modelsError" class="sk-error">{{ modelsError }}</p>
      </SettingsCard>
      <SettingsCard title="在线下载" description="从官方源下载预训练模型">
        <SettingsRow
          v-for="dl in downloadableModels"
          :key="dl.id"
          :title="dl.name"
          :description="dl.installed ? '已安装' : '未安装'"
        >
          <button class="sk-btn" type="button" :disabled="dl.installed || !!modelDownloading" @click="downloadLocalModel(dl.id)">
            {{ modelDownloading?.id === dl.id ? '下载中…' : dl.installed ? '已安装' : '下载' }}
          </button>
        </SettingsRow>
      </SettingsCard>
    </div>

    <div v-else-if="activeSection === 'api'" class="settings-stack">
      <SettingsCard title="打标 API 配置" description="工作台与设置页共享，密钥仍走现有凭证库">
        <SettingsRow v-for="cfg in apiConfigs" :key="cfg.id" :title="cfg.name" :description="cfg.provider + ' · ' + cfg.model">
          <button class="sk-btn" type="button" @click="openEditApiConfig(cfg)">编辑</button>
          <button class="sk-btn sk-btn--danger" type="button" @click="deleteApiConfigEntry(cfg.id)">删除</button>
        </SettingsRow>
        <div v-if="showApiConfigEditor" class="sk-editor sk-editor--rows">
          <SettingsRow title="名称">
            <input class="sk-input" v-model="editApiCfgName" placeholder="配置名称，如 GROK" />
          </SettingsRow>
          <SettingsRow title="供应方">
            <select class="sk-input" v-model="editApiCfgProvider">
              <option value="openai">OpenAI</option>
              <option value="gemini">Gemini</option>
              <option value="anthropic">Anthropic</option>
              <option value="grok">Grok</option>
            </select>
          </SettingsRow>
          <SettingsRow title="API 密钥">
            <input class="sk-input" type="password" v-model="editApiCfgKey" placeholder="sk-..." />
          </SettingsRow>
          <SettingsRow title="Base URL">
            <input class="sk-input" v-model="editApiCfgUrl" placeholder="可选，OpenAI 兼容 / OpenRouter / 本地" />
          </SettingsRow>
          <SettingsRow title="模型">
            <div class="sk-inline sk-inline--wide">
              <input class="sk-input" v-model="editApiCfgModel" list="baka-api-cfg-models" placeholder="模型名称" />
              <datalist id="baka-api-cfg-models">
                <option v-for="m in editApiCfgModels" :key="m" :value="m" />
              </datalist>
              <button class="sk-btn" type="button" :disabled="editApiCfgBusy" @click="fetchApiCfgModels">获取模型</button>
              <button class="sk-btn" type="button" :disabled="editApiCfgBusy" :class="{ 'is-ok': editApiCfgTestOk, 'is-bad': editApiCfgActionMsg && !editApiCfgTestOk }" @click="testApiCfgConn">测试连接</button>
            </div>
          </SettingsRow>
          <SettingsRow title="目标 RPM" description="0 表示不限制">
            <input class="sk-input sk-input--narrow" type="number" min="0" step="1" v-model.number="editApiCfgRpm" />
          </SettingsRow>
          <SettingsRow title="请求模式">
            <div class="sk-seg">
              <button type="button" :class="{ on: editApiCfgMode === 'queue' }" @click="editApiCfgMode = 'queue'">队列</button>
              <button type="button" :class="{ on: editApiCfgMode === 'concurrent' }" @click="editApiCfgMode = 'concurrent'">并发</button>
            </div>
          </SettingsRow>
          <p v-if="apiCfgError" class="sk-error">{{ apiCfgError }}</p>
          <p v-if="editApiCfgActionMsg" class="sk-note" :class="{ 'is-ok': editApiCfgTestOk, 'is-bad': !editApiCfgTestOk }">{{ editApiCfgActionMsg }}</p>
          <div class="sk-actions">
            <button class="sk-btn" type="button" @click="showApiConfigEditor = false">取消</button>
            <button class="sk-btn sk-btn--primary" type="button" @click="saveApiConfigEntry()">保存</button>
          </div>
        </div>
        <SettingsRow v-if="!showApiConfigEditor" title="添加新配置" description="新的 API 服务商">
          <button class="sk-btn" type="button" @click="openNewApiConfig">新建</button>
        </SettingsRow>
      </SettingsCard>

      <SettingsCard title="LLM API" description="云端大模型用于图像标注和提示词反推">
        <SettingsRow v-if="profiles.length > 0" title="配置存档" description="切换已保存的 API 配置">
          <div class="sk-chips">
            <button v-for="p in profiles" :key="p" class="sk-chip" type="button" :class="{ active: activeProfile === p }" @click="switchProfile(p)">{{ p }}</button>
            <button v-if="activeProfile" class="sk-chip sk-chip--x" type="button" @click="deleteProfile(activeProfile)">×</button>
          </div>
        </SettingsRow>
        <SettingsRow title="提供商" description="选择要使用的云端模型服务">
          <div class="sk-seg">
            <button type="button" :class="{ on: provider === 'openai' }" @click="provider = 'openai'">OpenAI</button>
            <button type="button" :class="{ on: provider === 'gemini' }" @click="provider = 'gemini'">Gemini</button>
          </div>
        </SettingsRow>
        <SettingsRow title="API 地址" description="兼容 OpenAI 协议的接口地址">
          <input class="sk-input sk-input--wide" v-model="baseUrl" :placeholder="provider === 'openai' ? 'https://api.openai.com/v1' : ''" />
        </SettingsRow>
        <SettingsRow title="API 密钥" description="从服务商控制台获取，走现有加密存储">
          <div class="sk-secret">
            <input class="sk-input" :type="showApiKey ? 'text' : 'password'" v-model="apiKey" placeholder="sk-..." />
            <button class="sk-secret__btn" type="button" @click="showApiKey = !showApiKey">{{ showApiKey ? '隐藏' : '显示' }}</button>
          </div>
        </SettingsRow>
        <SettingsRow title="多个 API Key" description="每行一个，自动轮换">
          <textarea class="sk-input sk-area" v-model="apiKeys" rows="2" placeholder="sk-...&#10;sk-..."></textarea>
        </SettingsRow>
        <SettingsRow title="模型" description="用于 LLM 聊天与标注">
          <div class="sk-inline sk-inline--wide">
            <select class="sk-input" v-model="model" v-if="apiModels.length > 0">
              <option v-for="m in apiModels" :key="m" :value="m">{{ m }}</option>
            </select>
            <input class="sk-input" v-else v-model="model" placeholder="gpt-4o" />
            <button class="sk-btn" type="button" @click="loadApiModels">拉取列表</button>
          </div>
        </SettingsRow>
        <SettingsRow align="start" title="标注指令" description="告诉 AI 如何标注图像">
          <textarea class="sk-input sk-area" v-model="systemPrompt" rows="3" placeholder="Danbooru 标签格式…"></textarea>
        </SettingsRow>
        <SettingsRow align="start" title="参数" description="生成温度与最大 Token 数">
          <div class="sk-params">
            <label class="sk-param">
              <span>Temperature</span>
              <input class="sk-range" type="range" min="0" max="2" step="0.1" v-model.number="temperature" />
              <strong>{{ temperature.toFixed(1) }}</strong>
            </label>
            <label class="sk-param">
              <span>Max Tokens</span>
              <input class="sk-input" type="number" min="50" max="4000" step="50" v-model.number="maxTokens" />
            </label>
          </div>
        </SettingsRow>
        <SettingsRow title="操作">
          <button class="sk-btn sk-btn--primary" type="button" @click="saveConfig">保存配置</button>
          <button class="sk-btn" type="button" @click="saveProfile">另存为档案</button>
          <button class="sk-btn" type="button" :class="{ 'is-ok': testOk, 'is-bad': testResult && !testOk }" @click="testConn">{{ testResult || '测试连接' }}</button>
        </SettingsRow>
      </SettingsCard>
    </div>

    <div v-else-if="activeSection === 'network'" class="settings-stack">
      <SettingsCard title="图站代理" description="与在线画廊共用同一套已持久化设置，不会新增空控件">
        <SettingsRow title="代理地址" description="留空则直连。例如 http://127.0.0.1:7890">
          <input class="sk-input sk-input--wide" v-model="booruProxy" placeholder="http://127.0.0.1:7890" />
        </SettingsRow>
        <SettingsRow title="超时（秒）" description="图站请求超时">
          <input class="sk-input sk-input--narrow" type="number" min="5" max="180" step="1" v-model.number="booruTimeout" />
        </SettingsRow>
        <SettingsRow title="保存">
          <button class="sk-btn sk-btn--primary" type="button" :disabled="networkSaving" @click="saveNetworkSettings">{{ networkSaving ? '保存中…' : '保存代理' }}</button>
        </SettingsRow>
      </SettingsCard>
    </div>

    <div v-else-if="activeSection === 'local'" class="settings-stack">
      <SettingsCard title="文件位置" description="数据目录在安装目录旁的 BakaTOOLS-data">
        <SettingsRow title="数据目录" :description="dataRoot || '读取模型目录后显示'">
          <button class="sk-btn" type="button" :disabled="!dataRoot && !modelDir" @click="openDataRoot">打开</button>
        </SettingsRow>
        <SettingsRow title="模型目录" :description="modelDir || '默认 tagger-models'">
          <button class="sk-btn" type="button" @click="chooseModelDir">选择</button>
          <button class="sk-btn" type="button" @click="openModelDir">打开</button>
        </SettingsRow>
      </SettingsCard>
      <SettingsCard title="缓存" :description="'合计 ' + cacheTotal">
        <SettingsRow v-for="c in cacheItems" :key="c.name" :title="c.name" :description="c.size">
          <button class="sk-btn" type="button" @click="clearCache(c.name)">清理</button>
        </SettingsRow>
        <div v-if="cacheItems.length === 0" class="sk-empty">暂无缓存数据</div>
      </SettingsCard>
      <SettingsCard title="回收站" description="误删的图片和标签可以从这里恢复">
        <SettingsRow v-for="item in recycleItems" :key="item.id" :title="item.original_path" :description="item.kind" align="start">
          <button class="sk-btn" type="button" @click="restoreRecycleItem(item.id)">恢复</button>
          <button class="sk-btn sk-btn--danger" type="button" @click="purgeRecycleItem(item.id)">彻底删除</button>
        </SettingsRow>
        <div v-if="recycleItems.length === 0" class="sk-empty">回收站是空的</div>
      </SettingsCard>
    </div>

    <div v-else-if="activeSection === 'components'" class="settings-stack">
      <TrainingComponentsPanel />
    </div>

    <div v-else-if="activeSection === 'about'" class="settings-stack">
      <SettingsCard title="Baka TOOLS" :description="'v' + appStore.version + ' · Anime image toolbox'">
        <SettingsRow title="版本" :description="appStore.version" />
        <SettingsRow title="数据目录" :description="dataRoot || 'BakaTOOLS-data'">
          <button class="sk-btn" type="button" :disabled="!dataRoot && !modelDir" @click="openDataRoot">打开</button>
        </SettingsRow>
        <SettingsRow title="ONNX 推理" :description="localModels.length > 0 ? String(localModels.length) + ' 个模型就绪' : '无模型'" />
        <SettingsRow title="可用设备" :description="localModelProviders.join(', ') || 'CPU'" />
        <SettingsRow title="API 配置" :description="String(apiConfigs.length) + ' 个已保存'" />
        <SettingsRow title="技术栈" description="TypeScript + Vue 3 + Electron" />
        <SettingsRow title="数据保留" description="卸载/覆盖安装不会删掉 BakaTOOLS-data" />
      </SettingsCard>
    </div>
  </SettingsLayout>
</template>

<style scoped>
.settings-pane-head { margin-bottom: 16px; }
.settings-back { display: inline-flex; align-items: center; margin: 0 0 8px; padding: 0; border: 0; background: transparent; color: var(--settings-accent); font: inherit; font-size: 12px; font-weight: 620; cursor: pointer; }
.settings-back:hover { color: var(--brand-primary); }
.settings-pane-head h2 { margin: 0; font-size: 18px; font-weight: 700; color: var(--text-primary); }
.settings-pane-head p { margin: 4px 0 0; font-size: 12px; color: var(--settings-muted); }
.settings-stack { display: flex; flex-direction: column; gap: 14px; max-width: 860px; }

.sk-input, .sk-area {
  box-sizing: border-box;
  width: 280px;
  max-width: 100%;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  background: var(--glass-bg);
  color: var(--text-primary);
  font: inherit;
  font-size: 12px;
  padding: 7px 10px;
  outline: none;
}
.sk-area { width: 320px; resize: vertical; min-height: 46px; }
.sk-input--wide { width: 320px; }
.sk-input--narrow { width: 88px; }
.sk-inline { display: flex; gap: 6px; width: 320px; max-width: 100%; }
.sk-inline--wide { width: 360px; }
.sk-inline .sk-input { flex: 1; width: auto; }
.sk-secret { display: flex; width: 320px; max-width: 100%; }
.sk-secret .sk-input { border-radius: var(--radius-sm) 0 0 var(--radius-sm); width: 100%; }
.sk-secret__btn {
  padding: 0 10px;
  border: 1px solid var(--border-default);
  border-left: none;
  background: var(--hud-bg);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  color: var(--text-secondary);
  cursor: pointer;
  font: inherit;
  font-size: 11px;
}
.sk-seg {
  display: flex;
  border-radius: var(--radius-full);
  background: var(--hud-bg);
  border: 1px solid var(--hud-border);
  overflow: hidden;
}
.sk-seg button {
  padding: 6px 14px;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 11px;
  font-weight: 550;
  font-family: var(--font-sans);
  cursor: pointer;
}
.sk-seg button.on { color: var(--settings-accent); background: var(--settings-accent-soft); }
.sk-chips { display: flex; flex-wrap: wrap; gap: 4px; max-width: 320px; }
.sk-chip {
  padding: 4px 10px;
  border: 1px solid var(--border-default);
  background: transparent;
  border-radius: var(--radius-full);
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 550;
  font-family: var(--font-sans);
  cursor: pointer;
}
.sk-chip.active { border-color: var(--border-accent); background: var(--settings-accent-soft); color: var(--settings-accent); }
.sk-chip--x { color: var(--accent-danger); border-color: transparent; }
.sk-params { display: flex; gap: 16px; width: 340px; max-width: 100%; }
.sk-param { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.sk-param span { font-size: 10px; color: var(--settings-muted); letter-spacing: 0.04em; text-transform: uppercase; }
.sk-param strong { font-size: 11px; color: var(--settings-accent); font-family: var(--font-mono); }
.sk-range { width: 180px; max-width: 100%; accent-color: var(--settings-accent); }
.sk-theme-btn {
  min-width: 88px;
  padding: 8px 12px;
  border: 1px solid var(--border-default);
  background: var(--glass-bg);
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--text-secondary);
}
.sk-theme-btn.active { border-color: var(--border-accent); background: var(--settings-accent-soft); color: var(--settings-accent); }
.sk-theme-swatch { width: 14px; height: 14px; border-radius: 50%; border: 1px solid var(--border-default); }
.sk-theme-swatch--dark { background: #1a1620; }
.sk-theme-swatch--light { background: #f7f1f4; }
.sk-poster-thumb { width: 44px; height: 30px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border-default); }
.sk-btn {
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
}
.sk-btn:hover { border-color: var(--border-accent); color: var(--settings-accent); }
.sk-btn--primary { border-color: transparent; background: var(--settings-accent); color: var(--brand-on-primary); font-weight: 650; }
.sk-btn--danger { color: var(--accent-danger); border-color: rgba(239,68,68,0.35); }
.sk-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.sk-btn.is-ok { border-color: var(--accent-success); color: var(--accent-success); }
.sk-btn.is-bad { border-color: var(--accent-danger); color: var(--accent-danger); }
.sk-empty { padding: 14px var(--settings-row-pad-x); color: var(--settings-muted); font-size: 12px; }
.sk-error { margin: 0; padding: 8px var(--settings-row-pad-x) 12px; color: var(--accent-danger); font-size: 11px; }
.sk-editor { display: grid; gap: 8px; padding: 12px var(--settings-row-pad-x); border-top: 1px solid var(--settings-divider); }
.sk-editor--rows { padding: 0; gap: 0; }
.sk-editor .sk-input { width: 100%; }
.sk-note { margin: 0; padding: 8px var(--settings-row-pad-x) 12px; color: var(--settings-muted); font-size: 11px; }
.sk-note.is-ok { color: var(--accent-success); }
.sk-note.is-bad { color: var(--accent-danger); }
.sk-actions { display: flex; gap: 6px; justify-content: flex-end; padding: 8px var(--settings-row-pad-x) 12px; }
.sk-badge { padding: 2px 8px; border-radius: var(--radius-full); background: var(--settings-accent-soft); color: var(--settings-accent); font-size: 10px; font-weight: 700; }
.sk-model-row { cursor: pointer; }
.sk-model-row:hover { background: var(--settings-accent-soft); }
</style>
