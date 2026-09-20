<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  visible: boolean
  imagePaths: string[]
}>()

const emit = defineEmits<{ close: []; applied: [] }>()

type ToolType = 'format-convert' | 'normalize' | 'find-replace' | 'add-fields' | 'ai-rewrite'

const toolType = ref<ToolType>('format-convert')

// ── 格式转换 ──
const convertFrom = ref('booruTag')
const convertTo = ref('anima')
const qualityPlacement = ref('keep')
const addStylePrefix = ref(true)

// ── 规范化 ──
const normLowercase = ref(true)
const normHalfWidth = ref(true)
const normRemoveSpecial = ref(true)
const normUnderscoreToSpace = ref(true)
const normRemoveNewlines = ref(true)
const normRemoveJunk = ref(true)
const normRemoveNonAscii = ref(false)
const normDedupe = ref(true)

// ── 查找替换 ──
const findText = ref('')
const replaceText = ref('')
const findIgnoreCase = ref(false)
const findWholeWord = ref(false)
const findRegex = ref(false)

// ── 加字段 ──
const fieldPrefix = ref('')
const fieldSuffix = ref('')
const fieldWrapNewLine = ref(false)

// ── AI 重写（使用设置页配置的 LLM API）──
const rewritePreset = ref('booru-clean')
const rewriteCustomPrompt = ref('')
const rewriteTemperature = ref(0.3)
const rewriteApiConfigId = ref('')
interface RewriteApiConfig {
  id: string; name: string; provider: string; baseUrl: string; model: string; apiKey: string
}
const rewriteApiConfigs = ref<RewriteApiConfig[]>([])

const busy = ref(false)
const error = ref('')
const previews = ref<{ imagePath: string; before: string; after: string }[]>([])
const lastHistoryIds = ref<number[]>([])
const lastUpdated = ref(0)

const formatConvertEnabled = computed(
  () => !(convertFrom.value === 'booruTag' && convertTo.value === 'booruTag')
)

const REWRITE_PRESETS: { id: string; name: string; prompt: string }[] = [
  { id: 'booru-clean', name: '清洗 Booru 标签', prompt: '你是一名专业的图像标注整理助手。请将下面的标签列表清洗整理：去掉重复、空权重、无意义的质量词（如 best quality / absurdres），统一为 Danbooru 风格（下划线、小写、按语义分组），只输出逗号分隔的标签，不要任何解释。' },
  { id: 'booru-anima', name: '转为 Anima 格式', prompt: '你是一名专业的图像标注助手。请将下面的 Booru 标签转换为 Anima（NovelAI）风格标注：为风格/画风类标签添加 @ 前缀，在开头补上质量词（masterpiece, best quality），保留逗号分隔，不要任何解释。' },
  { id: 'anima-booru', name: 'Anima 转 Booru', prompt: '你是一名专业的图像标注助手。请将下面的 Anima 风格标注转换为标准 Danbooru 标签：去掉 @ 前缀和质量词，保留有效的视觉标签，统一小写和下划线，逗号分隔，不要任何解释。' },
  { id: 'natural-en', name: '翻译为英文描述', prompt: '你是一名专业的图像标注助手。请将下面的中文标注翻译成通顺的英文自然语言描述，适合用作 AI 图像生成提示词，保持所有细节，不要任何解释。' },
  { id: 'natural-zh', name: '翻译为中文描述', prompt: '你是一名专业的图像标注助手。请将下面的标注翻译成通顺的中文自然语言描述，保留所有细节，不要任何解释。' },
]

function buildTool(): AnnotationToolOptions {
  if (toolType.value === 'format-convert') {
    return {
      type: 'format-convert',
      options: {
        from: convertFrom.value,
        to: convertTo.value,
        qualityWordPlacement: qualityPlacement.value,
        addStylePrefix: addStylePrefix.value,
      },
    }
  }
  if (toolType.value === 'normalize') {
    return {
      type: 'normalize',
      options: {
        lowercase: normLowercase.value,
        halfWidth: normHalfWidth.value,
        removeSpecial: normRemoveSpecial.value,
        underscoreToSpace: normUnderscoreToSpace.value,
        removeNewlines: normRemoveNewlines.value,
        removeJunk: normRemoveJunk.value,
        removeNonAscii: normRemoveNonAscii.value,
        dedupe: normDedupe.value,
      },
    }
  }
  if (toolType.value === 'find-replace') {
    return {
      type: 'find-replace',
      options: {
        find: findText.value,
        replace: replaceText.value,
        ignoreCase: findIgnoreCase.value,
        wholeWord: findWholeWord.value,
        regex: findRegex.value,
      },
    }
  }
  return {
    type: 'add-fields',
    options: {
      prefix: fieldPrefix.value,
      suffix: fieldSuffix.value,
      wrapNewLine: fieldWrapNewLine.value,
    },
  }
}

function canApply() {
  if (props.imagePaths.length === 0) return false
  if (toolType.value === 'find-replace' && !findText.value) return false
  if (toolType.value === 'add-fields' && !fieldPrefix.value && !fieldSuffix.value) return false
  if (toolType.value === 'format-convert' && !formatConvertEnabled.value) return false
  if (toolType.value === 'ai-rewrite' && !rewritePrompt().trim()) return false
  return true
}

function rewritePrompt() {
  const preset = REWRITE_PRESETS.find((item) => item.id === rewritePreset.value)
  return rewriteCustomPrompt.value || preset?.prompt || ''
}

async function loadRewriteApiConfigs() {
  if (!window.llmAPI) return
  const result = await window.llmAPI.listApiConfigs()
  if (Array.isArray(result)) {
    rewriteApiConfigs.value = result.map((cfg) => ({
      id: cfg.id, name: cfg.name, provider: cfg.provider,
      baseUrl: cfg.baseUrl, model: cfg.model, apiKey: cfg.apiKey,
    }))
    if (!rewriteApiConfigId.value && rewriteApiConfigs.value.length) {
      rewriteApiConfigId.value = rewriteApiConfigs.value[0].id
    }
  }
}

async function callRewriteLLM(text: string): Promise<string> {
  if (!window.llmAPI) throw new Error('LLM 功能不可用')
  const preset = REWRITE_PRESETS.find((item) => item.id === rewritePreset.value)
  const instruction = rewriteCustomPrompt.value || preset?.prompt || ''
  const apiConfig = rewriteApiConfigs.value.find((cfg) => cfg.id === rewriteApiConfigId.value)
  const response = await window.llmAPI.chat({
    provider: apiConfig?.provider,
    baseUrl: apiConfig?.baseUrl,
    apiKey: apiConfig?.apiKey,
    model: apiConfig?.model,
    prompt: `${instruction}\n\n标注内容：\n${text}`,
    temperature: rewriteTemperature.value,
    maxTokens: 512,
    requestId: `rewrite_${Date.now()}_${Math.random().toString(16).slice(2)}`,
  })
  if (response?.cancelled) throw new Error('已取消')
  if (!response?.success || response?.error) {
    throw new Error(response?.error || 'LLM 重写失败')
  }
  return (response.text || '').trim()
}

async function previewAiRewrite() {
  if (!props.imagePaths.length) return
  busy.value = true
  error.value = ''
  try {
    const samplePath = props.imagePaths[0]
    const capText = await readCaptionTextFromDisk(samplePath)
    const rewritten = await callRewriteLLM(capText)
    previews.value = [{ imagePath: samplePath, before: capText, after: rewritten }]
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function readCaptionTextFromDisk(imagePath: string): Promise<string> {
  if (!window.fsAPI) return ''
  const captionPath = imagePath.replace(/\.[^.]+$/, '') + '.txt'
  const response = await window.fsAPI.readText(captionPath)
  return response.success ? String(response.text ?? '') : ''
}

async function applyAiRewrite() {
  if (!window.annotationToolsAPI || !props.imagePaths.length) return
  busy.value = true
  error.value = ''
  try {
    const texts: string[] = []
    for (const imagePath of props.imagePaths) {
      const capText = await readCaptionTextFromDisk(imagePath)
      texts.push(await callRewriteLLM(capText))
    }
    const response = await window.annotationToolsAPI.applyOverride({
      imagePaths: props.imagePaths,
      texts,
    })
    if (!response.success || !response.data) {
      error.value = response.error || '写入失败'
      return
    }
    lastHistoryIds.value = response.data.historyIds ?? []
    lastUpdated.value = response.data.updated ?? 0
    emit('applied')
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function refreshPreview() {
  if (!window.annotationToolsAPI || !canApply()) return
  busy.value = true
  error.value = ''
  const response = await window.annotationToolsAPI.preview({
    imagePaths: props.imagePaths.slice(0, 3),
    tool: buildTool(),
  })
  busy.value = false
  if (!response.success) {
    error.value = response.error || '预览失败'
    previews.value = []
    return
  }
  previews.value = response.data?.samples ?? []
}

async function apply() {
  if (!window.annotationToolsAPI || !canApply()) return
  busy.value = true
  error.value = ''
  const response = await window.annotationToolsAPI.applyBatch({
    imagePaths: props.imagePaths,
    tool: buildTool(),
  })
  busy.value = false
  if (!response.success || !response.data) {
    error.value = response.error || '修改失败'
    return
  }
  lastHistoryIds.value = response.data.historyIds ?? []
  lastUpdated.value = response.data.updated ?? 0
  emit('applied')

  if (lastHistoryIds.value.length > 0) {
    error.value = ''
  } else if (response.data.updated === 0) {
    error.value = '没有内容发生变化（可能标注文件为空，或已符合目标格式）'
  }
}

async function undo() {
  if (!window.annotationToolsAPI || lastHistoryIds.value.length === 0) return
  busy.value = true
  error.value = ''
  const response = await window.annotationToolsAPI.undoBatch(lastHistoryIds.value)
  busy.value = false
  if (!response.success) {
    error.value = response.error || '撤销失败'
    return
  }
  lastHistoryIds.value = []
  lastUpdated.value = 0
  emit('applied')
  error.value = ''
  await refreshPreview()
}

watch(
  () => [props.visible, toolType.value, convertFrom.value, convertTo.value, qualityPlacement.value, addStylePrefix.value],
  () => {
    if (props.visible) {
      void refreshPreview()
      void loadRewriteApiConfigs()
    }
  }
)

watch(
  () => [
    normLowercase.value, normHalfWidth.value, normRemoveSpecial.value,
    normUnderscoreToSpace.value, normRemoveNewlines.value, normRemoveJunk.value,
    normRemoveNonAscii.value, normDedupe.value, findText.value, replaceText.value,
    findIgnoreCase.value, findWholeWord.value, findRegex.value,
    fieldPrefix.value, fieldSuffix.value, fieldWrapNewLine.value,
  ],
  () => {
    if (props.visible) void refreshPreview()
  }
)
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="dialog-backdrop" @click.self="emit('close')">
      <section class="dialog-card">
        <div class="dialog-head">
          <p>BATCH TOOLS</p>
          <h2>批量标注工具</h2>
        </div>

        <div class="dialog-tabs">
          <button :class="{ active: toolType === 'format-convert' }" @click="toolType = 'format-convert'">格式转换</button>
          <button :class="{ active: toolType === 'normalize' }" @click="toolType = 'normalize'">清洗规范</button>
          <button :class="{ active: toolType === 'find-replace' }" @click="toolType = 'find-replace'">查找替换</button>
          <button :class="{ active: toolType === 'add-fields' }" @click="toolType = 'add-fields'">添加字段</button>
          <button :class="{ active: toolType === 'ai-rewrite' }" @click="toolType = 'ai-rewrite'">AI 重写</button>
        </div>

        <div class="dialog-fields">
          <template v-if="toolType === 'format-convert'">
            <div class="field-grid">
              <label>当前格式
                <select v-model="convertFrom">
                  <option value="booruTag">Booru 标签</option>
                  <option value="anima">Anima 标签</option>
                  <option value="natural">自然语言</option>
                </select>
              </label>
              <label>目标格式
                <select v-model="convertTo">
                  <option value="anima">Anima 标签</option>
                  <option value="booruTag">Booru 标签</option>
                  <option value="natural">自然语言</option>
                </select>
              </label>
            </div>
            <label v-if="convertTo === 'anima'">质量词策略
              <select v-model="qualityPlacement">
                <option value="keep">保留原有</option>
                <option value="prefix">放在开头</option>
                <option value="suffix">放在结尾</option>
                <option value="remove">移除</option>
              </select>
            </label>
            <label v-if="convertTo === 'anima'" class="check-row">
              <input v-model="addStylePrefix" type="checkbox" />
              <span>识别风格标签并添加 @ 前缀</span>
            </label>
          </template>

          <template v-if="toolType === 'normalize'">
            <div class="check-grid">
              <label class="check-row"><input v-model="normLowercase" type="checkbox" /><span>转小写</span></label>
              <label class="check-row"><input v-model="normHalfWidth" type="checkbox" /><span>全角转半角</span></label>
              <label class="check-row"><input v-model="normRemoveSpecial" type="checkbox" /><span>去掉特殊符号</span></label>
              <label class="check-row"><input v-model="normUnderscoreToSpace" type="checkbox" /><span>下划线转空格</span></label>
              <label class="check-row"><input v-model="normRemoveNewlines" type="checkbox" /><span>换行转逗号</span></label>
              <label class="check-row"><input v-model="normRemoveJunk" type="checkbox" /><span>去除垃圾词</span></label>
              <label class="check-row"><input v-model="normRemoveNonAscii" type="checkbox" /><span>仅保留 ASCII</span></label>
              <label class="check-row"><input v-model="normDedupe" type="checkbox" /><span>去重</span></label>
            </div>
          </template>

          <template v-if="toolType === 'find-replace'">
            <label>查找
              <input v-model="findText" placeholder="例如 blue_hair / masterpiece" />
            </label>
            <label>替换为
              <input v-model="replaceText" placeholder="留空则删除" />
            </label>
            <div class="check-grid">
              <label class="check-row"><input v-model="findIgnoreCase" type="checkbox" /><span>忽略大小写</span></label>
              <label class="check-row"><input v-model="findWholeWord" type="checkbox" /><span>整词匹配</span></label>
              <label class="check-row"><input v-model="findRegex" type="checkbox" /><span>正则表达式</span></label>
            </div>
          </template>

          <template v-if="toolType === 'add-fields'">
            <div class="field-grid">
              <label>前缀（每个标签前）
                <input v-model="fieldPrefix" placeholder="masterpiece," />
              </label>
              <label>后缀（每个标签后）
                <input v-model="fieldSuffix" placeholder=", 8k" />
              </label>
            </div>
            <label class="check-row">
              <input v-model="fieldWrapNewLine" type="checkbox" />
              <span>整行包裹（而不是每个标签）</span>
            </label>
          </template>

          <template v-if="toolType === 'ai-rewrite'">
            <label>重写指令
              <select v-model="rewritePreset">
                <option v-for="preset in REWRITE_PRESETS" :key="preset.id" :value="preset.id">{{ preset.name }}</option>
              </select>
            </label>
            <label>自定义指令（可选，覆盖预设）
              <textarea v-model="rewriteCustomPrompt" rows="2" placeholder="留空则使用预设指令"></textarea>
            </label>
            <div class="field-grid">
              <label>API 配置
                <select v-model="rewriteApiConfigId">
                  <option v-for="cfg in rewriteApiConfigs" :key="cfg.id" :value="cfg.id">{{ cfg.name }}</option>
                  <option value="" disabled v-if="rewriteApiConfigs.length === 0">暂无 API 配置，请先在设置页添加</option>
                </select>
              </label>
              <label>温度
                <input class="form-range" type="range" min="0" max="1.5" step="0.05" v-model.number="rewriteTemperature" />
              </label>
            </div>
          </template>
        </div>

        <div v-if="busy" class="dialog-progress">处理中…</div>
        <p v-if="error" class="dialog-error">{{ error }}</p>
        <p v-else-if="lastUpdated > 0" class="dialog-success">已修改 {{ lastUpdated }} 张 · 可通过「撤销本次」恢复</p>

        <div v-if="previews.length" class="preview-list">
          <p class="preview-title">预览（最多前 3 张）</p>
          <div v-for="sample in previews" :key="sample.imagePath" class="preview-row">
            <strong>{{ sample.imagePath.split(/[/\\]/).pop() }}</strong>
            <span class="before">{{ sample.before || '（空）' }}</span>
            <span class="arrow">→</span>
            <span class="after">{{ sample.after || '（空）' }}</span>
          </div>
        </div>

        <footer>
          <button :disabled="busy" @click="emit('close')">取消</button>
          <button v-if="toolType !== 'ai-rewrite'" :disabled="busy || !canApply()" @click="refreshPreview">刷新预览</button>
          <button v-if="toolType === 'ai-rewrite'" :disabled="busy || !canApply()" @click="previewAiRewrite">AI 预览</button>
          <button v-if="lastHistoryIds.length" class="quiet" :disabled="busy" @click="undo">撤销本次</button>
          <button v-if="toolType !== 'ai-rewrite'" class="primary" :disabled="busy || !canApply()" @click="apply">应用到 {{ imagePaths.length }} 张</button>
          <button v-if="toolType === 'ai-rewrite'" class="primary" :disabled="busy || !canApply()" @click="applyAiRewrite">AI 重写全部（{{ imagePaths.length }} 张）</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.dialog-backdrop { position: fixed; inset: 0; z-index: 500; display: grid; place-items: center; padding: 20px; background: rgba(7,6,9,.68); backdrop-filter: blur(9px); }
.dialog-card { width: min(580px, 100%); max-height: 88vh; overflow: auto; padding: 22px; border: 1px solid rgba(255,255,255,.1); border-radius: 16px; background: #1c1921; box-shadow: 0 30px 80px rgba(0,0,0,.48); }
.dialog-head p { margin: 0 0 2px; color: var(--accent-primary); font-size: 9px; letter-spacing: .12em; }
.dialog-card h2 { margin: 0; font-size: 19px; }
.dialog-tabs { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; margin: 20px 0 12px; padding: 3px; border-radius: 9px; background: rgba(255,255,255,.03); }
.dialog-tabs button { height: 32px; border: 0; border-radius: 7px; background: transparent; color: var(--text-tertiary); cursor: pointer; }
.dialog-tabs button.active { background: rgba(var(--accent-primary-rgb),.12); color: var(--accent-primary); }
.dialog-fields { display: grid; gap: 13px; }
.dialog-fields label { display: grid; gap: 6px; color: var(--text-tertiary); font-size: 9px; }
.dialog-fields input, .dialog-fields select { box-sizing: border-box; width: 100%; height: 36px; padding: 0 10px; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; background: rgba(255,255,255,.035); color: var(--text-primary); outline: none; font: inherit; }
.field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.check-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 10px; }
.check-row { display: flex !important; flex-direction: row; align-items: center; gap: 8px; color: var(--text-secondary) !important; font-size: 10px !important; }
.check-row input { width: auto; height: auto; }
.dialog-progress { margin-top: 12px; color: var(--text-tertiary); font-size: 10px; }
.dialog-error { margin: 10px 0 0; color: #ff9a86; font-size: 10px; }
.dialog-success { margin: 10px 0 0; color: #7fd9a6; font-size: 10px; }
.preview-list { margin-top: 14px; display: grid; gap: 8px; }
.preview-title { margin: 0; color: var(--text-tertiary); font-size: 9px; }
.preview-row { display: grid; gap: 4px; padding: 9px 10px; border-radius: 8px; background: rgba(0,0,0,.18); font-size: 9px; }
.preview-row strong { color: var(--text-secondary); font-size: 10px; }
.preview-row .before { color: var(--text-tertiary); white-space: pre-wrap; word-break: break-all; }
.preview-row .arrow { color: var(--accent-primary); }
.preview-row .after { color: #9fd6b8; white-space: pre-wrap; word-break: break-all; }
.dialog-card footer { display: flex; justify-content: flex-end; gap: 7px; margin-top: 20px; }
.dialog-card footer button { height: 34px; padding: 0 14px; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; background: rgba(255,255,255,.035); color: var(--text-secondary); cursor: pointer; }
.dialog-card footer button:disabled { opacity: .38; cursor: not-allowed; }
.dialog-card footer .primary { border-color: transparent; background: var(--accent-primary); color: white; font-weight: 700; }
.dialog-card footer .quiet { color: var(--text-tertiary); }
</style>
