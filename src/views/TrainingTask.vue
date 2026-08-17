<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePipelineStore } from '@/stores/pipeline'
import AdvancedTrainingWorkbench from '@/components/training/AdvancedTrainingWorkbench.vue'
import TrainingComponentSetup from '@/components/training/TrainingComponentSetup.vue'
import {
  readTrainingPreflight,
  resolveTrainingModel,
  validateTrainingInputs,
  waitForTrainingBackend,
} from '@/features/training/training-readiness'

const router = useRouter()
const pipelineStore = usePipelineStore()
const trainingMode = ref<'basic' | 'advanced' | 'original'>((localStorage.getItem('baka-training-mode') as any) || 'basic')
const componentGate = ref<'loading' | 'setup' | 'ready'>('loading')

function setTrainingMode(mode: 'basic' | 'advanced' | 'original') {
  trainingMode.value = mode
  localStorage.setItem('baka-training-mode', mode)
}

// ── 预设方案 ──
interface Preset {
  label: string
  desc: string
  color: string
  apply: () => void
}
const activePreset = ref<string | null>(null)

function applyPresetSD15() {
  activePreset.value = 'SD1.5'
  baseModel.value = ''
  pretrainedModel.value = 'runwayml/stable-diffusion-v1-5'
  resolution.value = 512
  networkDim.value = 32; networkAlpha.value = 16
  networkModule.value = 'networks.lora'
  unetLR.value = 1e-4; textEncoderLR.value = 5e-5
  optimizerType.value = 'AdamW8bit'
  lrScheduler.value = 'cosine'
  mixedPrecision.value = 'fp16'; savePrecision.value = 'fp16'
  maxEpochs.value = 10; saveEveryNEpochs.value = 1
  batchSize.value = 1; maxTokenLength.value = 75
  clipSkip.value = 1; seed.value = 42
  cacheLatents.value = true
  noiseOffset.value = 0; gradientAccumulationSteps.value = 1
  convDim.value = 0; convAlpha.value = 0; lrWarmupEpochs.value = 0
  v2.value = false; vParam.value = false
}
function applyPresetSD21() {
  activePreset.value = 'SD2.1'
  baseModel.value = ''
  pretrainedModel.value = 'stabilityai/stable-diffusion-2-1'
  resolution.value = 768
  networkDim.value = 32; networkAlpha.value = 16
  networkModule.value = 'networks.lora'
  unetLR.value = 1e-4; textEncoderLR.value = 5e-5
  optimizerType.value = 'AdamW8bit'
  lrScheduler.value = 'cosine'
  mixedPrecision.value = 'fp16'; savePrecision.value = 'fp16'
  maxEpochs.value = 10; saveEveryNEpochs.value = 1
  batchSize.value = 1; maxTokenLength.value = 75
  clipSkip.value = 1; seed.value = 42
  cacheLatents.value = true
  noiseOffset.value = 0; gradientAccumulationSteps.value = 1
  convDim.value = 0; convAlpha.value = 0; lrWarmupEpochs.value = 0
  v2.value = true; vParam.value = false
}
function applyPresetSDXL() {
  activePreset.value = 'SDXL'
  baseModel.value = ''
  pretrainedModel.value = 'stabilityai/stable-diffusion-xl-base-1.0'
  resolution.value = 1024
  networkDim.value = 64; networkAlpha.value = 32
  networkModule.value = 'networks.lora'
  unetLR.value = 5e-5; textEncoderLR.value = 1e-4
  optimizerType.value = 'AdamW8bit'
  lrScheduler.value = 'cosine'
  mixedPrecision.value = 'fp16'; savePrecision.value = 'fp16'
  maxEpochs.value = 10; saveEveryNEpochs.value = 1
  batchSize.value = 1; maxTokenLength.value = 75
  clipSkip.value = 1; seed.value = 42
  cacheLatents.value = true
  noiseOffset.value = 0; gradientAccumulationSteps.value = 1
  convDim.value = 0; convAlpha.value = 0; lrWarmupEpochs.value = 0
  v2.value = true; vParam.value = false
}
function applyPresetSD3() {
  activePreset.value = 'SD3'
  baseModel.value = ''
  pretrainedModel.value = 'stabilityai/stable-diffusion-3-medium'
  resolution.value = 1024
  networkDim.value = 32; networkAlpha.value = 16
  networkModule.value = 'networks.lora'
  unetLR.value = 1e-4; textEncoderLR.value = 5e-5
  optimizerType.value = 'AdamW8bit'
  lrScheduler.value = 'cosine_with_restarts'
  mixedPrecision.value = 'bf16'; savePrecision.value = 'bf16'
  maxEpochs.value = 10; saveEveryNEpochs.value = 1
  batchSize.value = 1; maxTokenLength.value = 225
  clipSkip.value = 1; seed.value = 42
  cacheLatents.value = true
  noiseOffset.value = 0; gradientAccumulationSteps.value = 1
  convDim.value = 0; convAlpha.value = 0; lrWarmupEpochs.value = 1
  v2.value = false; vParam.value = false
}
function applyPresetFlux() {
  activePreset.value = 'Flux'
  baseModel.value = ''
  pretrainedModel.value = 'black-forest-labs/FLUX.1-dev'
  resolution.value = 1024
  networkDim.value = 16; networkAlpha.value = 8
  networkModule.value = 'networks.lora'
  unetLR.value = 1e-4; textEncoderLR.value = 1e-4
  optimizerType.value = 'AdamW8bit'
  lrScheduler.value = 'constant_with_warmup'
  mixedPrecision.value = 'bf16'; savePrecision.value = 'bf16'
  maxEpochs.value = 10; saveEveryNEpochs.value = 1
  batchSize.value = 1; maxTokenLength.value = 256
  clipSkip.value = 1; seed.value = 42
  cacheLatents.value = false
  noiseOffset.value = 0; gradientAccumulationSteps.value = 1
  convDim.value = 0; convAlpha.value = 0; lrWarmupEpochs.value = 1
  v2.value = false; vParam.value = false
}

const presets: Preset[] = [
  { label: 'SD1.5', desc: '512px · dim 32 · 经典平衡', color: '#6b8cff', apply: applyPresetSD15 },
  { label: 'SD2.1', desc: '768px · dim 32 · v2 架构', color: '#22c55e', apply: applyPresetSD21 },
  { label: 'SDXL', desc: '1024px · dim 64 · 高分辨率', color: '#a855f7', apply: applyPresetSDXL },
  { label: 'SD3', desc: '1024px · dim 32 · MMDiT', color: '#ec4899', apply: applyPresetSD3 },
  { label: 'Flux', desc: '1024px · dim 16 · bf16', color: '#f97316', apply: applyPresetFlux },
]

// ── 折叠状态 ──
const collapseState = ref<Record<string, boolean>>({
  model: false,
  dataset: true,
  network: true,
  optimizer: true,
  training: true,
})
function toggleSection(key: string) {
  collapseState.value[key] = !collapseState.value[key]
}

// ── 训练参数 ──
const baseModel = ref('')
const baseModelPath = ref('')
const outputDir = ref('')
const outputName = ref('my_lora')
const pretrainedModel = ref('runwayml/stable-diffusion-v1-5')

const trainDataDir = ref('')
const regDataDir = ref('')
const resolution = ref(512)
const batchSize = ref(1)
const maxEpochs = ref(10)
const saveEveryNEpochs = ref(1)

const unetLR = ref(1e-4)
const textEncoderLR = ref(5e-5)
const lrScheduler = ref('cosine')
const lrWarmupEpochs = ref(0)
const optimizerType = ref('AdamW8bit')

const networkDim = ref(32)
const networkAlpha = ref(16)
const networkModule = ref('networks.lora')
const convDim = ref(0)
const convAlpha = ref(0)

const mixedPrecision = ref('fp16')
const savePrecision = ref('fp16')
const seed = ref(42)
const noiseOffset = ref(0)
const maxTokenLength = ref(75)
const clipSkip = ref(1)
const cacheLatents = ref(true)
const gradientAccumulationSteps = ref(1)
const v2 = ref(false)
const vParam = ref(false)
const networkTrainUnetOnly = ref(false)
const networkTrainTextEncoderOnly = ref(false)
const trainingComment = ref('')
const effectiveModel = computed(() => resolveTrainingModel(baseModel.value, pretrainedModel.value))

// ── 训练类型映射 ──
const modelTrainType = computed(() => {
  const map: Record<string, string> = {
    'SD1.5': 'sd-lora', 'SD2.1': 'sd-lora', 'SDXL': 'sdxl-lora',
    'SD3': 'sd3-lora', 'Flux': 'flux-lora',
  }
  return map[activePreset.value || ''] || 'sd-lora'
})

// ── JSON 配置（用于 POST /api/run）──
const configJson = computed(() => ({
  model_train_type: modelTrainType.value,
  pretrained_model_name_or_path: effectiveModel.value,
  train_data_dir: trainDataDir.value,
  reg_data_dir: regDataDir.value || undefined,
  output_dir: outputDir.value,
  output_name: outputName.value,
  resolution: resolution.value,
  train_batch_size: batchSize.value,
  max_train_epochs: maxEpochs.value,
  save_every_n_epochs: saveEveryNEpochs.value,
  network_module: networkModule.value,
  network_dim: networkDim.value,
  network_alpha: networkAlpha.value,
  conv_dim: convDim.value,
  conv_alpha: convAlpha.value,
  unet_lr: unetLR.value,
  text_encoder_lr: textEncoderLR.value,
  optimizer_type: optimizerType.value,
  lr_scheduler: lrScheduler.value,
  lr_warmup_epochs: lrWarmupEpochs.value,
  lr_scheduler_num_cycles: 1,
  mixed_precision: mixedPrecision.value,
  save_precision: savePrecision.value,
  max_token_length: maxTokenLength.value,
  clip_skip: clipSkip.value,
  seed: seed.value,
  noise_offset: noiseOffset.value,
  gradient_accumulation_steps: gradientAccumulationSteps.value,
  cache_latents: cacheLatents.value,
  v2: v2.value,
  v_parameterization: vParam.value,
  network_train_unet_only: networkTrainUnetOnly.value,
  network_train_text_encoder_only: networkTrainTextEncoderOnly.value,
  training_comment: trainingComment.value || undefined,
}))

// ── 计算预览 ──
const configPreview = computed(() => `[model_arguments]
pretrained_model_name_or_path = "${effectiveModel.value}"
mixed_precision = "${mixedPrecision.value}"
save_precision = "${savePrecision.value}"

[dataset_arguments]
dataset_config = ""
cache_latents = ${cacheLatents.value}
resolution = ${resolution.value}
batch_size = ${batchSize.value}
max_token_length = ${maxTokenLength.value}
max_data_loader_n_workers = 1
persistent_data_loader_workers = true

[additional_network_arguments]
unet_lr = ${unetLR.value}
text_encoder_lr = ${textEncoderLR.value}
network_module = "${networkModule.value}"
network_dim = ${networkDim.value}
network_alpha = ${networkAlpha.value}
conv_dim = ${convDim.value}
conv_alpha = ${convAlpha.value}

[optimizer_arguments]
optimizer_type = "${optimizerType.value}"
lr_scheduler = "${lrScheduler.value}"
lr_warmup_epochs = ${lrWarmupEpochs.value}
lr_scheduler_num_cycles = 1

[training_arguments]
output_dir = "${outputDir.value}"
output_name = "${outputName.value}"
save_every_n_epochs = ${saveEveryNEpochs.value}
max_train_epochs = ${maxEpochs.value}
clip_skip = ${clipSkip.value}
seed = ${seed.value}
noise_offset = ${noiseOffset.value}
gradient_accumulation_steps = ${gradientAccumulationSteps.value}

[training_script_arguments]
v2 = ${v2.value}
v_parameterization = ${vParam.value}
network_train_unet_only = ${networkTrainUnetOnly.value}
network_train_text_encoder_only = ${networkTrainTextEncoderOnly.value}
training_comment = "${trainingComment.value}"`)

const paramCount = computed(() => {
  if (activePreset.value === 'SD1.5') return '~8.6M'
  if (activePreset.value === 'SD2.1') return '~8.6M'
  if (activePreset.value === 'SDXL') return '~17.2M'
  if (activePreset.value === 'SD3') return '~8.6M'
  if (activePreset.value === 'Flux') return '~4.3M'
  return '自定义'
})

// ── 操作 ──
const isTraining = ref(false)
const logs = ref<string[]>([])
const taskId = ref('')

function addLog(msg: string) {
  logs.value.push(`[${new Date().toLocaleTimeString()}] ${msg}`)
}

async function selectFolder(target: 'train' | 'reg' | 'base' | 'output') {
  const folder = await window.fsAPI?.selectFolder()
  if (!folder) return
  switch (target) {
    case 'train': trainDataDir.value = folder; break
    case 'reg': regDataDir.value = folder; break
    case 'base': baseModelPath.value = folder; break
    case 'output': outputDir.value = folder; break
  }
}

async function selectBaseModelFile() {
  const files = await window.fsAPI?.selectModels()
  if (files?.length) baseModel.value = files[0]
}

async function startTraining() {
  isTraining.value = true
  let pipelineStarted = false
  try {
    const inputIssues = await validateTrainingInputs({
      localModel: baseModel.value,
      remoteModel: pretrainedModel.value,
      trainDataDir: trainDataDir.value,
      outputDir: outputDir.value,
      outputName: outputName.value,
    }, async path => await window.fsAPI?.exists(path) ?? false)
    if (inputIssues.length) {
      for (const issue of inputIssues) addLog(`❌ ${issue}`)
      addLog('请修正以上项目后再开始训练')
      return
    }

    addLog('🚀 正在执行训练前检查...')
    addLog(`底模: ${effectiveModel.value}`)
    addLog(`数据集: ${trainDataDir.value}`)
    addLog(`输出: ${outputDir.value}\\${outputName.value}`)
    addLog(`训练类型: ${modelTrainType.value}`)

    const st = await window.runtimeAPI?.scan()
    if (!st?.hasRepo) {
      addLog('❌ 没有找到有效训练仓库，请先到「运行时管理」设置目录')
      return
    }
    repoPath.value = st.repoPath
    const installedRuntime = st.runtimes?.find((runtime: any) => runtime.status === 'installed')
    if (!installedRuntime) {
      addLog('❌ 没有可用的 Python 训练环境，请先到「运行时管理」完成安装')
      return
    }

    const gs = await window.runtimeAPI?.guiStatus()
    if (!gs?.running) {
      addLog(`🔄 正在启动训练环境：${installedRuntime.name_zh || installedRuntime.id}`)
      const result = await window.runtimeAPI?.launch({ runtimeId: installedRuntime.id, port: 28000 })
      if (!result?.success) {
        addLog(`❌ 训练后端启动失败：${result?.error || '未知错误'}`)
        addLog('请到「运行时管理」检查该环境后重试')
        return
      }
    } else {
      addLog('✓ 训练后端进程已启动')
    }

    addLog('🔄 正在等待训练后端就绪...')
    const backendReady = await waitForTrainingBackend(async () => (
      await window.trainingHttpAPI?.backendStatus() ?? { ok: false }
    ))
    if (!backendReady) {
      addLog('❌ 训练后端在 30 秒内没有准备完成')
      addLog('请查看运行时日志，确认环境依赖和显卡驱动是否正常')
      return
    }
    guiRunning.value = true
    addLog('✓ 训练后端已就绪')

    const pf = await (window.trainingHttpAPI?.preflight(configJson.value) || { ok: false, data: { error: 'API 不可用' } })
    const preflightReport = readTrainingPreflight(pf)
    for (const warning of preflightReport.warnings) addLog(`⚠ ${warning}`)
    if (preflightReport.errors.length) {
      for (const error of preflightReport.errors) addLog(`❌ ${error}`)
      addLog('预检没有通过，请修复配置后重试')
      return
    }

    const encoder = new TextEncoder()
    const tomlBytes = encoder.encode(configPreview.value)
    let tomlBase64 = ''
    for (let i = 0; i < tomlBytes.length; i++) tomlBase64 += String.fromCharCode(tomlBytes[i])
    tomlBase64 = btoa(tomlBase64)
    const tomlPath = `${outputDir.value}\\${outputName.value}_config.toml`
    const backup = await window.fsAPI?.writeBase64({ filePath: tomlPath, base64: tomlBase64 })
    if (!backup?.success) {
      addLog(`❌ 无法备份训练配置：${backup?.error || '文件写入失败'}`)
      return
    }
    addLog(`📝 配置已备份: ${tomlPath}`)

    addLog('📤 正在提交训练配置到后端...')
    pipelineStore.startTask(`LoRA 训练: ${outputName.value}`)
    pipelineStarted = true
    pipelineStore.updateProgress(5, '提交配置中', '配置中')
    const res = await (window.trainingHttpAPI?.submitTraining(configJson.value) || { ok: false, data: { error: 'API 不可用' } })
    if (res.ok && res.data?.status !== 'fail') {
      taskId.value = res.data.data?.task_id || ''
      if (!taskId.value) {
        addLog('❌ 后端接受了请求，但没有返回任务编号')
        pipelineStore.finishTask()
        return
      }
      addLog(`✅ 训练已提交！任务 ID: ${taskId.value}`)
      if (res.data.data?.tensorboard_run_dir) {
        addLog(`📊 TensorBoard: ${res.data.data.tensorboard_run_dir}`)
      }
      if (res.data.message) addLog(`📋 ${res.data.message}`)
      pipelineStore.updateProgress(15, '训练运行中', '训练中')
      // 跳转到训练运行监控页
      setTimeout(() => router.push({ path: '/training/run', query: { taskId: taskId.value } }), 800)
    } else {
      const err = res.data?.message || res.data?.error || res.data?.detail || '未知错误'
      addLog(`❌ 提交失败: ${err}`)
      pipelineStore.finishTask()
    }
  } catch (e: any) {
    addLog(`❌ 训练前检查或提交失败：${e.message}`)
    if (pipelineStarted) pipelineStore.finishTask()
  } finally {
    isTraining.value = false
  }
}

function stopTraining() {
  addLog('⏹ 停止训练')
  if (taskId.value) {
    window.trainingHttpAPI?.stopTask(taskId.value).then(() => {
      addLog('已发送停止信号')
    })
  }
  isTraining.value = false
}

function exportConfig() {
  addLog('📋 配置已复制到剪贴板')
  navigator.clipboard.writeText(configPreview.value)
}

function clearLogs() {
  logs.value = []
}

// ── 加载运行时配置 ──
const repoPath = ref('')
const guiRunning = ref(false)
let removeRuntimeLogListener: (() => void) | undefined
onMounted(async () => {
  try {
    const componentState = await window.trainingComponentsAPI?.inspect()
    componentGate.value = !window.trainingComponentsAPI || componentState?.ready ? 'ready' : 'setup'
  } catch {
    componentGate.value = 'setup'
  }
  try {
    const st = await window.runtimeAPI?.scan()
    if (st?.repoPath) repoPath.value = st.repoPath
  } catch {}
  try {
    const gs = await window.runtimeAPI?.guiStatus()
    if (gs) guiRunning.value = gs.running
  } catch {}
  try {
    removeRuntimeLogListener = window.runtimeAPI?.onLog((entry: any) => addLog(`[${entry.runtimeId || 'runtime'}] ${entry.message}`))
  } catch {}
})
onUnmounted(() => removeRuntimeLogListener?.())
</script>

<template>
  <div v-if="componentGate === 'loading'" class="lrs-component-loading">正在检查训练功能…</div>
  <TrainingComponentSetup v-else-if="componentGate === 'setup'" @ready="componentGate = 'ready'" />
  <div v-else class="lrs-root">
    <!-- ═══ HEADER ═══ -->
    <div class="lrs-hero">
      <div class="lrs-hero-left">
        <h1>LoRA 训练配置</h1>
        <div class="lrs-hero-meta" v-if="repoPath">
          <span class="lrs-hero-dot" :class="guiRunning ? 'on' : ''"></span>
          {{ repoPath }}
          <router-link to="/training/runtime" class="lrs-hero-link">管理运行时 →</router-link>
        </div>
      </div>
      <div class="lrs-hero-status">
        <span class="lrs-badge" :style="{ background: activePreset ? '#1a1a2e' : 'var(--bg-elevated)' }">
          {{ activePreset || '自定义' }}
        </span>
        <span class="lrs-badge-param" v-if="activePreset">{{ paramCount }}</span>
      </div>
    </div>

    <!-- ═══ PRESET 卡片 ═══ -->
    <div class="lrs-mode-switch">
      <button :class="{ active: trainingMode === 'basic' }" @click="setTrainingMode('basic')"><strong>基础模式</strong><span>常用 LoRA 参数</span></button>
      <button :class="{ active: trainingMode === 'advanced' }" @click="setTrainingMode('advanced')"><strong>完整模式</strong><span>全部训练类型与参数</span></button>
      <button :class="{ active: trainingMode === 'original' }" @click="setTrainingMode('original')"><strong>原版界面</strong><span>兼容与应急入口</span></button>
    </div>

    <AdvancedTrainingWorkbench v-if="trainingMode === 'advanced'" />
    <section v-else-if="trainingMode === 'original'" class="lrs-original-entry">
      <div><strong>原版完整训练界面</strong><span>直接使用训练器自带界面，适合刚新增且 Baka 尚未识别的功能。</span></div>
      <router-link class="btn btn-primary" to="/training/run">打开原版训练器</router-link>
    </section>

    <template v-if="trainingMode === 'basic'">
    <div class="lrs-presets">
      <div
        v-for="p in presets" :key="p.label"
        class="lrs-preset-card"
        :class="{ active: activePreset === p.label }"
        :style="{ '--preset-color': p.color }"
        @click="p.apply"
      >
        <div class="lrs-preset-label">{{ p.label }}</div>
        <div class="lrs-preset-desc">{{ p.desc }}</div>
      </div>
    </div>

    <!-- ═══ TWO-COLUMN ═══ -->
    <div class="lrs-two-col">

      <!-- ─── LEFT: 参数表单 ─── -->
      <div class="lrs-col-left">

        <!-- 1. 模型 -->
        <div class="lrs-section" :class="{ collapsed: collapseState.model }">
          <div class="lrs-section-header" @click="toggleSection('model')">
            <span class="lrs-section-arrow">{{ collapseState.model ? '▶' : '▼' }}</span>
            <span class="lrs-section-label">模型</span>
            <span class="lrs-section-tag">MODEL</span>
          </div>
          <div class="lrs-section-body" v-show="!collapseState.model">
            <div class="lrs-field">
              <label>底模 (HuggingFace)</label>
              <input class="form-input" v-model="pretrainedModel" placeholder="runwayml/stable-diffusion-v1-5" />
            </div>
            <div class="lrs-field">
              <label>本地底模路径（选择后优先使用）</label>
              <div class="lrs-input-row">
                <input class="form-input" v-model="baseModel" placeholder="选择 .safetensors 文件" readonly />
                <button class="btn btn-ghost btn-sm" @click="selectBaseModelFile">📂</button>
                <button v-if="baseModel" class="btn btn-ghost btn-sm" @click="baseModel = ''">清除</button>
              </div>
            </div>
            <div class="lrs-field-row">
              <div class="lrs-field-half">
                <label>混合精度</label>
                <select class="form-select" v-model="mixedPrecision">
                  <option>fp16</option><option>bf16</option><option>fp32</option><option>no</option>
                </select>
              </div>
              <div class="lrs-field-half">
                <label>保存精度</label>
                <select class="form-select" v-model="savePrecision">
                  <option>fp16</option><option>bf16</option><option>fp32</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <!-- 2. 数据集 -->
        <div class="lrs-section" :class="{ collapsed: collapseState.dataset }">
          <div class="lrs-section-header" @click="toggleSection('dataset')">
            <span class="lrs-section-arrow">{{ collapseState.dataset ? '▶' : '▼' }}</span>
            <span class="lrs-section-label">数据集</span>
            <span class="lrs-section-tag">DATASET</span>
          </div>
          <div class="lrs-section-body" v-show="!collapseState.dataset">
            <div class="lrs-field">
              <label>训练集目录</label>
              <div class="lrs-input-row">
                <input class="form-input" v-model="trainDataDir" placeholder="选择训练图片文件夹" readonly />
                <button class="btn btn-ghost btn-sm" @click="selectFolder('train')">📂</button>
              </div>
            </div>
            <div class="lrs-field">
              <label>正则化集目录 (可选)</label>
              <div class="lrs-input-row">
                <input class="form-input" v-model="regDataDir" placeholder="选择正则化图片文件夹" readonly />
                <button class="btn btn-ghost btn-sm" @click="selectFolder('reg')">📂</button>
              </div>
            </div>
            <div class="lrs-field-row">
              <div class="lrs-field-half">
                <label>分辨率</label>
                <select class="form-select" v-model="resolution">
                  <option :value="512">512×512</option>
                  <option :value="768">768×768</option>
                  <option :value="1024">1024×1024</option>
                </select>
              </div>
              <div class="lrs-field-half">
                <label>Batch Size</label>
                <input class="form-input" type="number" v-model.number="batchSize" min="1" max="32" />
              </div>
            </div>
            <div class="lrs-field">
              <label class="lrs-check">
                <input type="checkbox" v-model="cacheLatents" />
                <span class="lrs-check-mark"></span>
                缓存 latents（加速训练、占磁盘空间）
              </label>
            </div>
          </div>
        </div>

        <!-- 3. 网络 -->
        <div class="lrs-section" :class="{ collapsed: collapseState.network }">
          <div class="lrs-section-header" @click="toggleSection('network')">
            <span class="lrs-section-arrow">{{ collapseState.network ? '▶' : '▼' }}</span>
            <span class="lrs-section-label">网络</span>
            <span class="lrs-section-tag">NETWORK</span>
          </div>
          <div class="lrs-section-body" v-show="!collapseState.network">
            <div class="lrs-field-row">
              <div class="lrs-field-third">
                <label>Dim</label>
                <input class="form-input" type="number" v-model.number="networkDim" min="1" max="256" />
              </div>
              <div class="lrs-field-third">
                <label>Alpha</label>
                <input class="form-input" type="number" v-model.number="networkAlpha" min="1" max="256" />
              </div>
              <div class="lrs-field-third">
                <label>Conv Dim</label>
                <input class="form-input" type="number" v-model.number="convDim" min="0" max="256" />
              </div>
            </div>
            <div class="lrs-field">
              <label>网络模块</label>
              <select class="form-select" v-model="networkModule">
                <option value="networks.lora">LoRA</option>
                <option value="networks.locon">LoCon</option>
                <option value="networks.loha">LoHa</option>
                <option value="networks.dylora">DyLoRA</option>
              </select>
            </div>
          </div>
        </div>

        <!-- 4. 优化器 -->
        <div class="lrs-section" :class="{ collapsed: collapseState.optimizer }">
          <div class="lrs-section-header" @click="toggleSection('optimizer')">
            <span class="lrs-section-arrow">{{ collapseState.optimizer ? '▶' : '▼' }}</span>
            <span class="lrs-section-label">优化器</span>
            <span class="lrs-section-tag">OPTIMIZER</span>
          </div>
          <div class="lrs-section-body" v-show="!collapseState.optimizer">
            <div class="lrs-field">
              <label>优化器</label>
              <select class="form-select" v-model="optimizerType">
                <option>AdamW8bit</option><option>AdamW</option><option>Lion</option>
                <option>SGDNesterov</option><option>DAdaptation</option>
              </select>
            </div>
            <div class="lrs-field-row">
              <div class="lrs-field-half">
                <label>UNet LR</label>
                <input class="form-input" type="number" v-model="unetLR" step="0.00001" />
              </div>
              <div class="lrs-field-half">
                <label>TE LR</label>
                <input class="form-input" type="number" v-model="textEncoderLR" step="0.00001" />
              </div>
            </div>
            <div class="lrs-field-row">
              <div class="lrs-field-half">
                <label>调度器</label>
                <select class="form-select" v-model="lrScheduler">
                  <option>cosine</option><option>cosine_with_restarts</option>
                  <option>linear</option><option>constant</option><option>constant_with_warmup</option>
                </select>
              </div>
              <div class="lrs-field-half">
                <label>预热 Epoch</label>
                <input class="form-input" type="number" v-model.number="lrWarmupEpochs" min="0" max="50" />
              </div>
            </div>
          </div>
        </div>

        <!-- 5. 训练 & 保存 -->
        <div class="lrs-section" :class="{ collapsed: collapseState.training }">
          <div class="lrs-section-header" @click="toggleSection('training')">
            <span class="lrs-section-arrow">{{ collapseState.training ? '▶' : '▼' }}</span>
            <span class="lrs-section-label">训练 & 保存</span>
            <span class="lrs-section-tag">TRAINING</span>
          </div>
          <div class="lrs-section-body" v-show="!collapseState.training">
            <div class="lrs-field-row">
              <div class="lrs-field-half">
                <label>Max Epochs</label>
                <input class="form-input" type="number" v-model.number="maxEpochs" min="1" max="9999" />
              </div>
              <div class="lrs-field-half">
                <label>保存间隔 (epoch)</label>
                <input class="form-input" type="number" v-model.number="saveEveryNEpochs" min="1" max="100" />
              </div>
            </div>
            <div class="lrs-field-row">
              <div class="lrs-field-half">
                <label>Seed</label>
                <input class="form-input" type="number" v-model.number="seed" />
              </div>
              <div class="lrs-field-half">
                <label>Clip Skip</label>
                <input class="form-input" type="number" v-model.number="clipSkip" min="1" max="12" />
              </div>
            </div>
            <div class="lrs-field">
              <label>最大 Token 长度</label>
              <input class="form-input" type="number" v-model.number="maxTokenLength" min="75" max="225" />
            </div>
            <div class="lrs-field">
              <label>输出目录</label>
              <div class="lrs-input-row">
                <input class="form-input" v-model="outputDir" placeholder="选择输出文件夹" readonly />
                <button class="btn btn-ghost btn-sm" @click="selectFolder('output')">📂</button>
              </div>
            </div>
            <div class="lrs-field">
              <label>输出名称</label>
              <input class="form-input" v-model="outputName" placeholder="my_lora" />
            </div>
          </div>
        </div>

        <!-- 底部操作栏 -->
        <div class="lrs-actions">
          <button class="btn btn-primary" :disabled="isTraining" @click="startTraining">
            {{ isTraining ? '⌛ 训练中...' : '▶ 开始训练' }}
          </button>
          <button class="btn btn-danger-outline" :disabled="!isTraining" @click="stopTraining">⏹ 停止</button>
          <button class="btn btn-secondary" @click="exportConfig">📋 导出 TOML</button>
        </div>

      </div>

      <!-- ─── RIGHT: 日志 + 预览 ─── -->
      <div class="lrs-col-right">
        <!-- 日志 -->
        <div class="lrs-console-card">
          <div class="lrs-console-header">
            <span class="lrs-console-title">训练日志</span>
            <button class="btn btn-ghost btn-xs" @click="clearLogs" v-if="logs.length">🗑 清空</button>
          </div>
          <div class="lrs-console-body">
            <div v-if="logs.length === 0" class="lrs-console-empty">配置参数，点击「开始训练」即可启动</div>
            <div v-for="(l, i) in logs" :key="i" class="lrs-console-line">{{ l }}</div>
          </div>
          <div class="lrs-console-footer" v-if="logs.length > 0">
            <span class="lrs-console-count">{{ logs.length }} 条</span>
          </div>
        </div>

        <!-- 配置预览 -->
        <div class="lrs-config-card">
          <div class="lrs-config-header">
            <span>TOML 配置预览</span>
            <span class="lrs-config-keys">{{ Object.keys(configPreview).length }} 参数</span>
          </div>
          <pre class="lrs-config-code">{{ configPreview }}</pre>
        </div>
      </div>

    </div>
    </template>
  </div>
</template>

<style scoped>
/* ── ROOT ── */
.lrs-root {
  max-width: 1200px;
  margin: 0 auto;
  padding-bottom: 48px;
}
.lrs-component-loading{min-height:calc(100vh - 120px);display:grid;place-items:center;color:var(--text-tertiary);font-size:13px}
.lrs-mode-switch{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:14px;padding:4px;border:1px solid var(--border-color);border-radius:11px;background:var(--bg-elevated)}
.lrs-mode-switch button{display:grid;gap:2px;padding:9px 12px;border:0;border-radius:8px;background:transparent;color:var(--text-tertiary);cursor:pointer;text-align:left}.lrs-mode-switch button strong{color:var(--text-secondary);font-size:12px}.lrs-mode-switch button span{font-size:9px}.lrs-mode-switch button.active{background:rgba(var(--accent-primary-rgb),.14)}.lrs-mode-switch button.active strong{color:var(--accent-primary)}
.lrs-original-entry{display:flex;align-items:center;justify-content:space-between;min-height:150px;padding:24px;border:1px solid var(--border-color);border-radius:13px;background:var(--bg-elevated)}.lrs-original-entry div{display:grid;gap:6px}.lrs-original-entry strong{font-size:17px}.lrs-original-entry span{color:var(--text-tertiary);font-size:11px}

/* ═══ HEADER ═══ */
.lrs-hero {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding: 0 4px;
}
.lrs-hero-left h1 {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 4px 0;
}
.lrs-hero-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--text-tertiary);
  font-family: var(--font-mono);
  max-width: 500px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lrs-hero-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-tertiary);
  flex-shrink: 0;
}
.lrs-hero-dot.on { background: var(--accent-success); }
.lrs-hero-link {
  color: var(--accent-primary);
  text-decoration: none;
  font-size: 11px;
  font-family: var(--font-sans);
  white-space: nowrap;
}
.lrs-hero-link:hover { text-decoration: underline; }
.lrs-hero-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.lrs-badge {
  font-size: 11px;
  font-weight: 600;
  font-family: var(--font-mono);
  padding: 3px 10px;
  border-radius: var(--radius-xs);
  border: 1px solid var(--border-default);
  color: var(--text-secondary);
}
.lrs-badge-param {
  font-size: 10px;
  color: var(--text-tertiary);
  font-family: var(--font-mono);
}

/* ═══ PRESETS ═══ */
.lrs-presets {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}
.lrs-preset-card {
  flex: 1;
  padding: 12px 16px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  cursor: pointer;
  transition: all var(--transition-fast);
  border-left: 3px solid transparent;
}
.lrs-preset-card:hover {
  border-color: var(--border-hover);
  background: var(--bg-overlay);
}
.lrs-preset-card.active {
  border-color: var(--preset-color);
  border-left-color: var(--preset-color);
  background: color-mix(in srgb, var(--preset-color) 6%, var(--bg-elevated));
}
.lrs-preset-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 2px;
}
.lrs-preset-desc {
  font-size: 11px;
  color: var(--text-tertiary);
}

/* ═══ TWO-COL ═══ */
.lrs-two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  align-items: start;
}
.lrs-col-left {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-width: 0;
}
.lrs-col-right {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  position: sticky;
  top: 12px;
}

/* ═══ SECTION (折叠卡片) ═══ */
.lrs-section {
  border: 1px solid var(--border-default);
  border-bottom: none;
  background: var(--bg-elevated);
}
.lrs-section:first-child {
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
}
.lrs-section:last-child {
  border-bottom: 1px solid var(--border-default);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
}
.lrs-section.collapsed:last-child {
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
}

.lrs-section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  cursor: pointer;
  user-select: none;
  transition: background var(--transition-fast);
}
.lrs-section-header:hover {
  background: var(--bg-overlay);
}
.lrs-section-arrow {
  font-size: 9px;
  color: var(--text-tertiary);
  width: 12px;
  flex-shrink: 0;
}
.lrs-section-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}
.lrs-section-tag {
  margin-left: auto;
  font-size: 9px;
  font-weight: 500;
  font-family: var(--font-mono);
  color: var(--text-tertiary);
  letter-spacing: 0.06em;
}
.lrs-section-body {
  padding: 4px 14px 12px 14px;
  border-top: 1px solid var(--border-default);
}

/* ═══ FIELD ═══ */
.lrs-field { margin-bottom: 10px; }
.lrs-field:last-child { margin-bottom: 0; }
.lrs-field label {
  display: block;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-tertiary);
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.lrs-field-row {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}
.lrs-field-row:last-child { margin-bottom: 0; }
.lrs-field-half { flex: 1; min-width: 0; }
.lrs-field-half label {
  display: block;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-tertiary);
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.lrs-field-third { flex: 1; min-width: 0; }
.lrs-field-third label {
  display: block;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-tertiary);
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.lrs-input-row { display: flex; gap: 6px; }
.lrs-input-row .form-input { flex: 1; }

/* ── Checkbox ── */
.lrs-check {
  display: flex;
  align-items: center;
  gap: 7px;
  cursor: pointer;
  user-select: none;
  font-size: 12px !important;
  color: var(--text-secondary) !important;
  text-transform: none !important;
  font-weight: 400 !important;
  letter-spacing: 0 !important;
}
.lrs-check input { display: none; }
.lrs-check-mark {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border-default);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
  flex-shrink: 0;
}
.lrs-check input:checked + .lrs-check-mark {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
}
.lrs-check input:checked + .lrs-check-mark::after {
  content: '✓';
  font-size: 10px;
  color: #fff;
  font-weight: 700;
}

/* ═══ ACTIONS ═══ */
.lrs-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 16px;
}

/* ═══ CONSOLE ═══ */
.lrs-console-card {
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  display: flex;
  flex-direction: column;
}
.lrs-console-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-default);
}
.lrs-console-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.lrs-console-body {
  flex: 1;
  min-height: 160px;
  max-height: 280px;
  overflow-y: auto;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.6;
  padding: 10px 14px;
}
.lrs-console-empty {
  color: var(--text-tertiary);
  font-style: italic;
  text-align: center;
  padding: 50px 0;
  font-size: 12px;
}
.lrs-console-line {
  color: var(--text-secondary);
  padding: 1px 0;
  word-break: break-word;
}
.lrs-console-line:nth-child(odd) {
  background: var(--bg-overlay-subtle);
}
.lrs-console-footer {
  padding: 6px 14px;
  border-top: 1px solid var(--border-default);
  font-size: 10px;
  color: var(--text-tertiary);
}

/* ═══ CONFIG PREVIEW ═══ */
.lrs-config-card {
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
}
.lrs-config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-default);
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.lrs-config-keys {
  font-size: 10px;
  font-weight: 400;
  color: var(--text-tertiary);
  text-transform: none;
  letter-spacing: 0;
}
.lrs-config-code {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-tertiary);
  padding: 12px 14px;
  max-height: 260px;
  overflow: auto;
  line-height: 1.5;
  white-space: pre;
  tab-size: 2;
}

/* ═══ RESPONSIVE ═══ */
@media (max-width: 800px) {
  .lrs-two-col { grid-template-columns: 1fr; }
  .lrs-col-right { position: static; }
  .lrs-presets { flex-direction: column; }
}
</style>
