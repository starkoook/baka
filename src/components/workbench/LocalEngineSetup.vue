<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{ saved: [profile: LocalEngineProfile]; close: [] }>()
const type = ref<'comfy' | 'webui'>('comfy')
const detected = ref<LocalEngineDraft[]>([])
const candidate = ref<LocalEngineDraft | null>(null)
const busy = ref(false)
const error = ref('')
const connection = ref('')

async function detect() {
  busy.value = true
  error.value = ''
  try { detected.value = (await window.localEngineAPI.detect()).filter((item) => item.type === type.value) }
  catch (reason) { error.value = (reason as Error).message }
  finally { busy.value = false }
}

async function chooseFolder() {
  const root = await window.fsAPI.selectFolder()
  if (!root) return
  busy.value = true
  error.value = ''
  try {
    const result = await window.localEngineAPI.validateRoot({ root, type: type.value })
    if (!result.valid) throw new Error(result.error || '无法识别这个安装目录')
    candidate.value = result
  } catch (reason) { error.value = (reason as Error).message }
  finally { busy.value = false }
}

async function save() {
  if (!candidate.value) return
  busy.value = true
  try {
    const profile = await window.localEngineAPI.saveProfile({ ...candidate.value, name: type.value === 'comfy' ? '本机 ComfyUI' : '本机 WebUI / Forge' })
    const health = await window.localEngineAPI.health(profile.id)
    if (!health.healthy) {
      connection.value = '配置已保存，但引擎尚未运行'
      error.value = health.error || '连接失败，可稍后从工具箱启动引擎'
      return
    }
    connection.value = '已连接'
    emit('saved', profile)
  } catch (reason) { error.value = (reason as Error).message }
  finally { busy.value = false }
}
</script>

<template>
  <div class="engine-setup" @pointerdown.stop>
    <header><strong>选择本地引擎</strong><button type="button" @click="emit('close')">×</button></header>
    <p>选择你电脑上已经安装的绘图工具，后续模型、输出和插件路径会自动配置。</p>
    <div class="engine-setup__types">
      <button type="button" :class="{ on: type === 'comfy' }" @click="type = 'comfy'; candidate = null">ComfyUI</button>
      <button type="button" :class="{ on: type === 'webui' }" @click="type = 'webui'; candidate = null">WebUI / Forge</button>
    </div>
    <div class="engine-setup__actions">
      <button type="button" :disabled="busy" @click="detect">自动检测</button>
      <button type="button" :disabled="busy" @click="chooseFolder">选择安装目录</button>
    </div>
    <button v-for="item in detected" :key="item.root" type="button" class="engine-setup__detected" @click="candidate = item">
      <b>{{ item.type === 'comfy' ? 'ComfyUI' : 'WebUI / Forge' }}</b><span>{{ item.root }}</span>
    </button>
    <dl v-if="candidate" class="engine-setup__paths">
      <dt>安装目录</dt><dd>{{ candidate.root }}</dd>
      <dt>API 地址</dt><dd>{{ candidate.baseUrl }}</dd>
      <dt>Python</dt><dd>{{ candidate.pythonPath || '由启动器管理' }}</dd>
      <dt>模型目录</dt><dd>{{ candidate.modelsDir }}</dd>
      <dt>输出目录</dt><dd>{{ candidate.outputDir }}</dd>
      <dt v-if="candidate.customNodesDir">节点目录</dt><dd v-if="candidate.customNodesDir">{{ candidate.customNodesDir }}</dd>
    </dl>
    <p v-if="error" class="engine-setup__error">{{ error }}</p>
    <p v-if="connection" class="engine-setup__connection">{{ connection }}</p>
    <button v-if="candidate" type="button" class="engine-setup__save" :disabled="busy" @click="save">保存并测试连接</button>
  </div>
</template>

<style scoped>
.engine-setup { position: absolute; inset: 50% auto auto 50%; z-index: 80; width: min(440px, calc(100% - 40px)); transform: translate(-50%,-50%); padding: 18px; border: 1px solid var(--line-subtle); border-radius: 14px; background: var(--surface-primary); box-shadow: 0 24px 70px rgba(0,0,0,.35); display: grid; gap: 12px; }
header { display: flex; justify-content: space-between; align-items: center; } header button { border: 0; background: transparent; color: inherit; font-size: 22px; cursor: pointer; }
p { margin: 0; color: var(--text-tertiary); font-size: 12px; line-height: 1.6; }
.engine-setup__types,.engine-setup__actions { display: flex; gap: 8px; }
.engine-setup button { border: 1px solid var(--line-subtle); border-radius: 8px; background: var(--surface-secondary); color: inherit; padding: 8px 12px; cursor: pointer; }
.engine-setup__types button { flex: 1; }.engine-setup__types button.on { border-color: var(--brand-primary); color: var(--brand-primary); }
.engine-setup__detected { display: grid; text-align: left; }.engine-setup__detected span { font-size: 10px; opacity: .6; }
.engine-setup__paths { display: grid; grid-template-columns: 68px 1fr; gap: 5px 8px; margin: 0; font-size: 11px; }.engine-setup__paths dt { opacity: .6; }.engine-setup__paths dd { margin: 0; word-break: break-all; }
.engine-setup__error { color: #ff8a78; }.engine-setup__save { border: 0 !important; background: var(--brand-primary) !important; color: white !important; font-weight: 700; }
.engine-setup__connection { color: #34d399; }
</style>
