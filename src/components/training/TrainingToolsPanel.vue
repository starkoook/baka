<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

interface ToolScript {
  name: string
  category: string
  positional_args: string[]
}

const scripts = ref<ToolScript[]>([])
const selected = ref('')
const positionalValues = ref<Record<string, string>>({})
const extraJson = ref('{}')
const loading = ref(false)
const message = ref('')
const error = ref('')

const current = computed(() => scripts.value.find(item => item.name === selected.value) || null)
const groups = computed(() => {
  const result: Record<string, ToolScript[]> = {}
  for (const script of scripts.value) (result[script.category] ||= []).push(script)
  return result
})

watch(selected, () => {
  positionalValues.value = Object.fromEntries((current.value?.positional_args || []).map(key => [key, '']))
  message.value = ''
  error.value = ''
})

onMounted(async () => {
  const response = await window.trainingHttpAPI.getScripts()
  if (!response.ok) {
    error.value = response.data?.message || response.data?.error || '无法读取训练工具'
    return
  }
  scripts.value = response.data?.data?.scripts || []
  selected.value = scripts.value[0]?.name || ''
})

async function runTool() {
  if (!current.value || loading.value) return
  error.value = ''
  message.value = ''
  let extra: Record<string, unknown>
  try {
    extra = JSON.parse(extraJson.value || '{}')
    if (!extra || Array.isArray(extra) || typeof extra !== 'object') throw new Error()
  } catch {
    error.value = '附加参数必须是 JSON 对象，例如 {"precision":"fp16"}'
    return
  }
  loading.value = true
  const response = await window.trainingHttpAPI.runScript({
    script_name: current.value.name,
    ...positionalValues.value,
    ...extra,
  })
  loading.value = false
  if (!response.ok || response.data?.status === 'fail') {
    error.value = response.data?.message || response.data?.error || '工具启动失败'
  } else {
    message.value = `工具已加入任务队列${response.data?.data?.task_id ? `：${response.data.data.task_id}` : ''}`
  }
}
</script>

<template>
  <section class="tool-panel">
    <aside>
      <header><h3>LoRA 与模型工具</h3><span>{{ scripts.length }} 个</span></header>
      <div v-for="(items, category) in groups" :key="category" class="tool-group">
        <b>{{ category }}</b>
        <button v-for="item in items" :key="item.name" :class="{ active: selected === item.name }" @click="selected = item.name">
          {{ item.name.split('/').pop()?.replace('.py', '') }}
        </button>
      </div>
    </aside>
    <main v-if="current">
      <div class="tool-title"><div><small>{{ current.category }}</small><h3>{{ current.name }}</h3></div><button :disabled="loading" @click="runTool">{{ loading ? '启动中…' : '运行工具' }}</button></div>
      <label v-for="key in current.positional_args" :key="key"><span>{{ key }}</span><input v-model="positionalValues[key]" :placeholder="`填写 ${key}`"></label>
      <label><span>附加参数（高级）</span><textarea v-model="extraJson" rows="8" spellcheck="false"></textarea><small>按脚本命令行参数填写 JSON；布尔值和数字会保持原类型。</small></label>
      <p v-if="message" class="ok">{{ message }}</p><p v-if="error" class="error">{{ error }}</p>
    </main>
    <main v-else class="empty">训练后端启动后会自动读取全部合并、转换、提取、缩放、检查和元数据工具。</main>
  </section>
</template>

<style scoped>
.tool-panel{display:grid;grid-template-columns:280px 1fr;min-height:calc(100vh - 190px);border:1px solid #2a2a4a;border-radius:10px;overflow:hidden;background:#151526}.tool-panel aside{padding:16px;border-right:1px solid #2a2a4a;overflow:auto}.tool-panel header,.tool-title{display:flex;align-items:center;justify-content:space-between;gap:12px}.tool-panel h3{margin:0;color:#eee}.tool-panel header span,.tool-title small,label small{color:#777;font-size:.72rem}.tool-group{display:grid;gap:4px;margin-top:18px}.tool-group b{padding:0 8px 5px;color:#777;font-size:.7rem;text-transform:uppercase}.tool-group button{padding:8px 10px;border:0;border-radius:6px;background:transparent;color:#aaa;text-align:left;cursor:pointer}.tool-group button:hover,.tool-group button.active{background:#6b8cff1c;color:#9cacff}.tool-panel main{padding:24px;overflow:auto}.tool-title{padding-bottom:20px;border-bottom:1px solid #2a2a4a}.tool-title h3{margin-top:5px;font-family:monospace}.tool-title button{padding:9px 18px;border:0;border-radius:7px;background:#6b8cff;color:white;cursor:pointer}.tool-title button:disabled{opacity:.5}.tool-panel label{display:grid;gap:7px;margin-top:18px;color:#aaa;font-size:.8rem}.tool-panel input,.tool-panel textarea{box-sizing:border-box;width:100%;padding:10px;border:1px solid #333453;border-radius:7px;background:#10101e;color:#ddd;font:inherit}.tool-panel textarea{font-family:monospace;resize:vertical}.ok{color:#22c55e}.error{color:#ef6464}.empty{display:grid;place-items:center;color:#777;text-align:center}
</style>
