<script setup lang="ts">
import { onMounted, ref } from 'vue'

type WeightFormat = 'sd' | 'naiNumeric' | 'naiClassic'

const prompt = ref('')
const negative = ref('')
const seed = ref(0)
const weightFormat = ref<WeightFormat>('naiNumeric')
const expanded = ref('')
const expandedNegative = ref('')
const warnings = ref<string[]>([])
const logs = ref<string[]>([])
const wildcardNames = ref<string[]>([])
const error = ref('')

const convertText = ref('')
const convertFrom = ref<WeightFormat>('sd')
const convertTo = ref<WeightFormat>('naiNumeric')
const convertResult = ref('')

async function loadWildcards() {
  if (!window.promptAPI) return
  const res = await window.promptAPI.listWildcards()
  if (res.success && res.data) wildcardNames.value = Object.keys(res.data.entries).sort()
}

async function expandPrompt() {
  error.value = ''
  if (!window.promptAPI) return
  const res = await window.promptAPI.expandWildcards({
    text: prompt.value,
    seed: seed.value,
    weightFormat: weightFormat.value,
  })
  if (!res.success || !res.data) {
    error.value = res.error || '展开失败'
    return
  }
  expanded.value = res.data.text
  warnings.value = [...res.data.warnings]
  logs.value = [...res.data.logs]

  if (negative.value.trim()) {
    const negativeRes = await window.promptAPI.expandWildcards({
      text: negative.value,
      seed: seed.value,
      weightFormat: weightFormat.value,
    })
    if (negativeRes.success && negativeRes.data) {
      expandedNegative.value = negativeRes.data.text
      warnings.value.push(...negativeRes.data.warnings)
      logs.value.push(...negativeRes.data.logs)
    }
  } else {
    expandedNegative.value = ''
  }
}

async function convertWeights() {
  if (!window.promptAPI) return
  const res = await window.promptAPI.convertWeights({
    text: convertText.value,
    from: convertFrom.value,
    to: convertTo.value,
  })
  convertResult.value = res.success && res.data ? res.data.text : res.error || '转换失败'
}

function insertWildcard(name: string) {
  prompt.value += `__${name}__`
}

onMounted(loadWildcards)
</script>

<template>
  <main class="generate">
    <header class="page-head">
      <div>
        <span>GENERATE</span>
        <h1>AI 生成</h1>
        <p>提示词通配符与权重语法工具，为 Stable Diffusion / NovelAI 提示词做准备。</p>
      </div>
    </header>

    <div class="generate-grid">
      <section class="cabin-panel prompt-card">
        <span class="cabin-label">/// PROMPT</span>
        <div class="cabin-panel-br"></div>

        <label class="field">
          <span>正向提示词</span>
          <textarea v-model="prompt" rows="6" placeholder="例如：__hair__, 1girl, looking at viewer"></textarea>
        </label>

        <label class="field">
          <span>负向提示词</span>
          <textarea v-model="negative" rows="3" placeholder="lowres, bad anatomy, worst quality"></textarea>
        </label>

        <div class="row">
          <label class="field">
            <span>随机种子</span>
            <input v-model.number="seed" type="number" min="0" />
          </label>
          <label class="field">
            <span>权重格式</span>
            <select v-model="weightFormat">
              <option value="naiNumeric">NAI 数字</option>
              <option value="naiClassic">NAI 经典</option>
              <option value="sd">SD 括号</option>
            </select>
          </label>
        </div>

        <button class="primary" :disabled="!prompt.trim()" @click="expandPrompt">展开通配符</button>
        <p v-if="error" class="error">{{ error }}</p>

        <template v-if="expanded">
          <h2>展开结果</h2>
          <pre class="result">{{ expanded }}</pre>
          <p v-if="expandedNegative" class="hint">负向提示词：{{ expandedNegative }}</p>
          <div v-if="logs.length" class="hint">本次选择：{{ logs.join(' · ') }}</div>
          <div v-if="warnings.length" class="warn">{{ warnings.join(' · ') }}</div>
        </template>
      </section>

      <aside class="side">
        <section class="cabin-panel wildcard-card">
          <span class="cabin-label">/// WILDCARDS</span>
          <div class="cabin-panel-br"></div>
          <p class="hint">已加载的通配符，点击插入到提示词末尾。</p>
          <div v-if="wildcardNames.length" class="chip-list">
            <button v-for="name in wildcardNames" :key="name" @click="insertWildcard(name)">{{ name }}</button>
          </div>
          <p v-else class="hint">暂无通配符。把 .txt 文件放进应用数据目录的 wildcards 文件夹即可。</p>
        </section>

        <section class="cabin-panel convert-card">
          <span class="cabin-label">/// WEIGHT CONVERT</span>
          <div class="cabin-panel-br"></div>
          <textarea v-model="convertText" rows="4" placeholder="(1girl:1.2), [long hair:0.8]"></textarea>
          <div class="row">
            <label class="field">
              <span>从</span>
              <select v-model="convertFrom">
                <option value="sd">SD 括号</option>
                <option value="naiNumeric">NAI 数字</option>
                <option value="naiClassic">NAI 经典</option>
              </select>
            </label>
            <label class="field">
              <span>到</span>
              <select v-model="convertTo">
                <option value="naiNumeric">NAI 数字</option>
                <option value="naiClassic">NAI 经典</option>
                <option value="sd">SD 括号</option>
              </select>
            </label>
          </div>
          <button :disabled="!convertText.trim()" @click="convertWeights">转换</button>
          <pre v-if="convertResult" class="result">{{ convertResult }}</pre>
        </section>
      </aside>
    </div>
  </main>
</template>

<style scoped>
.generate { min-height: 100%; display: flex; flex-direction: column; gap: 16px; color: var(--text-primary); }
.page-head span { color: var(--accent-primary); font-size: 9px; font-weight: 750; letter-spacing: .18em; }
.page-head h1 { margin: 5px 0 4px; font-size: 26px; }
.page-head p { margin: 0; color: var(--text-tertiary); font-size: 12px; }
.generate-grid { flex: 1; display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 14px; align-items: start; }
.prompt-card, .wildcard-card, .convert-card { padding: 20px; position: relative; overflow: hidden; }
.field { display: grid; gap: 7px; margin: 13px 0; color: var(--text-tertiary); font-size: 10px; }
.field span { color: var(--text-secondary); }
.field textarea, .field input, .field select, .convert-card textarea {
  box-sizing: border-box; width: 100%; border: 1px solid rgba(255,255,255,.08); border-radius: 8px;
  background: rgba(255,255,255,.035); color: var(--text-primary); outline: none; font: inherit; padding: 9px 10px;
}
.field textarea { resize: vertical; }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
button { height: 36px; padding: 0 14px; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; background: rgba(255,255,255,.035); color: var(--text-secondary); cursor: pointer; font: inherit; }
button.primary { width: 100%; margin-top: 4px; border-color: transparent; background: var(--accent-primary); color: white; font-weight: 700; }
button:disabled { opacity: .45; cursor: not-allowed; }
h2 { margin: 18px 0 8px; font-size: 14px; color: var(--text-secondary); }
.result { margin: 0; padding: 12px; border: 1px solid rgba(255,255,255,.07); border-radius: 9px; background: rgba(0,0,0,.22); color: var(--text-primary); white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, monospace; font-size: 12px; }
.hint { color: var(--text-tertiary); font-size: 10px; line-height: 1.6; }
.warn { color: #f0c674; font-size: 10px; }
.error { color: #ff9a86; font-size: 10px; }
.chip-list { display: flex; flex-wrap: wrap; gap: 6px; max-height: 220px; overflow: auto; margin-top: 12px; }
.chip-list button { height: auto; padding: 6px 9px; font-size: 11px; }
.convert-card textarea { margin-top: 6px; }
.convert-card .row { margin: 10px 0; }
.convert-card button { width: 100%; }
.convert-card .result { margin-top: 10px; }
@media (max-width: 900px) { .generate-grid { grid-template-columns: 1fr; } }
</style>
