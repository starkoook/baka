<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()

const provider = ref('openai'); const apiKey = ref(''); const baseUrl = ref(''); const model = ref('gpt-4o')
const temperature = ref(0.3); const maxTokens = ref(500); const systemPrompt = ref('')
const profiles = ref<string[]>([]); const activeProfile = ref(''); const models = ref<string[]>([])
const testResult = ref(''); const testOk = ref(false); const showApiKey = ref(false)
const cacheItems = ref<{ name: string; size: string }[]>([]); const cacheTotal = ref('')

async function loadConfig() {
  if (!window.llmAPI) return
  const c = await window.llmAPI.getConfig()
  if (c) { provider.value = c.provider || 'openai'; apiKey.value = c.apiKey || ''; baseUrl.value = c.baseUrl || ''; model.value = c.model || 'gpt-4o'; temperature.value = c.temperature ?? 0.3; maxTokens.value = c.maxTokens ?? 500; systemPrompt.value = c.prompt || '' }
  const p = await window.llmAPI.getProfiles(); if (p) profiles.value = p
  if (window.cacheAPI) { const s = await window.cacheAPI.getSize(); if (s) { cacheItems.value = s.items || []; cacheTotal.value = s.total || '0 B' } }
}
async function saveConfig() { if (window.llmAPI) await window.llmAPI.saveConfig({ provider: provider.value, apiKey: apiKey.value, baseUrl: baseUrl.value, model: model.value, temperature: temperature.value, maxTokens: maxTokens.value, prompt: systemPrompt.value }); appStore.setStatus('配置已保存') }
async function testConn() { if (!window.llmAPI) return; testResult.value = '测试中...'; testOk.value = false; const r = await window.llmAPI.test({ provider: provider.value, apiKey: apiKey.value, baseUrl: baseUrl.value, model: model.value }); testOk.value = r.success; testResult.value = r.success ? '连接成功' : (r.error || '连接失败') }
async function loadModels() { if (!window.llmAPI) return; const r = await window.llmAPI.listModels({ provider: provider.value, baseUrl: baseUrl.value, apiKey: apiKey.value }); if (r.success && r.models) models.value = r.models }
async function saveProfile() { const name = prompt('配置存档名称:'); if (name && window.llmAPI) { await window.llmAPI.saveProfile({ name, config: { provider: provider.value, apiKey: apiKey.value, baseUrl: baseUrl.value, model: model.value, temperature: temperature.value, maxTokens: maxTokens.value, prompt: systemPrompt.value } }); profiles.value = await window.llmAPI.getProfiles() || [] } }
async function switchProfile(name: string) { if (!window.llmAPI) return; await window.llmAPI.switchProfile(name); activeProfile.value = name; await loadConfig() }
async function deleteProfile(name: string) { if (!confirm(`删除 "${name}"？`)) return; if (window.llmAPI) { await window.llmAPI.deleteProfile(name); profiles.value = await window.llmAPI.getProfiles() || [] } }
async function clearCache(target: string) { if (window.cacheAPI) { await window.cacheAPI.clear(target); const s = await window.cacheAPI.getSize(); if (s) { cacheItems.value = s.items || []; cacheTotal.value = s.total || '0 B' } } }
onMounted(loadConfig)
</script>

<template>
  <div class="sk-root">
    <div class="sk-hero">
      <div class="sk-hero-glow"></div>
      <div class="sk-hero-icon">⚙</div>
      <h1>Settings</h1>
      <p>配置 LLM API · 管理缓存 · 自定义外观</p>
      <div class="sk-version">v0.2 · {{ appStore.platform }}</div>
    </div>

    <div class="sk-grid">
      <!-- LEFT COLUMN -->
      <div class="sk-col">
        <!-- Appearance -->
        <div class="sk-card">
          <div class="sk-card-icon">🎨</div>
          <div class="sk-card-title">外观</div>
          <div class="sk-card-sub">选择你喜欢的界面风格</div>
          <div class="sk-theme-row">
            <button class="sk-theme-btn" :class="{ on: !appStore.isLight }" @click="appStore.isLight ? appStore.toggleTheme() : undefined">
              <span class="sk-theme-icon">🌙</span>
              <span class="sk-theme-label">深色模式</span>
              <span class="sk-theme-check" v-if="!appStore.isLight">✓</span>
            </button>
            <button class="sk-theme-btn" :class="{ on: appStore.isLight }" @click="!appStore.isLight ? appStore.toggleTheme() : undefined">
              <span class="sk-theme-icon">☀</span>
              <span class="sk-theme-label">浅色模式</span>
              <span class="sk-theme-check" v-if="appStore.isLight">✓</span>
            </button>
          </div>
        </div>

        <!-- Cache -->
        <div class="sk-card">
          <div class="sk-card-icon">🗂</div>
          <div class="sk-card-title">缓存</div>
          <div class="sk-card-sub">总计 {{ cacheTotal }}</div>
          <div class="sk-cache-list" v-if="cacheItems.length > 0">
            <div v-for="c in cacheItems" :key="c.name" class="sk-cache-row">
              <span>{{ c.name }}</span>
              <span class="sk-cache-size">{{ c.size }}</span>
              <button @click="clearCache(c.name)">清理</button>
            </div>
          </div>
          <div v-else class="sk-empty">暂无缓存数据</div>
        </div>
      </div>

      <!-- RIGHT COLUMN -->
      <div class="sk-col">
        <!-- LLM Config -->
        <div class="sk-card sk-card-main">
          <div class="sk-card-icon">☁</div>
          <div class="sk-card-title">LLM API</div>
          <div class="sk-card-sub">云端大模型用于图像标注和提示词反推</div>

          <!-- Profiles -->
          <div class="sk-field" v-if="profiles.length > 0">
            <label>配置存档</label>
            <div class="sk-chips">
              <button v-for="p in profiles" :key="p" :class="{ active: activeProfile === p }" @click="switchProfile(p)">{{ p }}</button>
              <button v-if="activeProfile" class="sk-chip-x" @click="deleteProfile(activeProfile)">×</button>
            </div>
          </div>

          <!-- Provider -->
          <div class="sk-field">
            <label>提供商</label>
            <div class="sk-seg">
              <button :class="{ on: provider === 'openai' }" @click="provider = 'openai'">OpenAI</button>
              <button :class="{ on: provider === 'gemini' }" @click="provider = 'gemini'">Gemini</button>
            </div>
          </div>

          <!-- Base URL -->
          <div class="sk-field">
            <label>API 地址</label>
            <input v-model="baseUrl" :placeholder="provider === 'openai' ? 'https://api.openai.com/v1' : ''" />
          </div>

          <!-- API Key -->
          <div class="sk-field">
            <label>API 密钥</label>
            <div class="sk-input-grp">
              <input :type="showApiKey ? 'text' : 'password'" v-model="apiKey" placeholder="sk-..." />
              <button @click="showApiKey = !showApiKey">{{ showApiKey ? '🙈' : '👁' }}</button>
            </div>
          </div>

          <!-- Model -->
          <div class="sk-field">
            <label>模型</label>
            <div class="sk-input-row">
              <select v-model="model" v-if="models.length > 0"><option v-for="m in models" :key="m" :value="m">{{ m }}</option></select>
              <input v-else v-model="model" placeholder="gpt-4o" />
              <button class="sk-btn-mini" @click="loadModels">获取</button>
            </div>
          </div>

          <!-- System Prompt -->
          <div class="sk-field">
            <label>标注指令 <span class="sk-label-hint">— 告诉 AI 如何标注图像</span></label>
            <textarea v-model="systemPrompt" rows="4" placeholder="Danbooru 标签格式输出，按置信度排序..."></textarea>
          </div>

          <!-- Params -->
          <div class="sk-field">
            <label>参数</label>
            <div class="sk-params">
              <div class="sk-param">
                <span>Temperature</span>
                <input type="range" min="0" max="2" step="0.1" v-model.number="temperature" />
                <em>{{ temperature.toFixed(1) }}</em>
              </div>
              <div class="sk-param">
                <span>Max Tokens</span>
                <input type="number" min="50" max="4000" step="50" v-model.number="maxTokens" />
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="sk-actions">
            <button class="sk-btn sk-btn-pri" @click="saveConfig">
              <span>💾</span> 保存
            </button>
            <button class="sk-btn" @click="saveProfile">
              <span>📋</span> 另存为
            </button>
            <button class="sk-btn" @click="testConn" :class="{ ok: testOk, fail: testResult && !testOk }">
              <span>🔌</span> {{ testResult || '测试连接' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sk-root { max-width: 880px; margin: 0 auto; }
.sk-hero { text-align: center; padding: 36px 0 28px; position: relative; }
.sk-hero-glow { position: absolute; width: 260px; height: 260px; border-radius: 50%; background: radial-gradient(circle, rgba(255,105,180,0.1) 0%, transparent 70%); top: 50%; left: 50%; transform: translate(-50%, -50%); pointer-events: none; }
.sk-hero-icon { font-size: 40px; margin-bottom: 8px; position: relative; display: block; animation: sk-float 3s ease-in-out infinite; }
@keyframes sk-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
.sk-hero h1 { font-size: 28px; font-weight: 700; background: linear-gradient(135deg, #ff69b4 0%, #f9a8d4 50%, #c4b5fd 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin: 0 0 6px; position: relative; }
.sk-hero p { font-size: 13px; color: #6b7280; margin: 0; position: relative; }
.sk-version { font-size: 10px; color: #374151; margin-top: 8px; position: relative; font-family: monospace; }

.sk-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: start; }

/* Cards */
.sk-card {
  background: linear-gradient(145deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.01) 100%);
  border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; padding: 22px;
  transition: all 0.3s; position: relative; overflow: hidden;
}
.sk-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent); opacity: 0; transition: opacity 0.3s; }
.sk-card:hover::before { opacity: 1; }
.sk-card:hover { border-color: rgba(255,255,255,0.1); transform: translateY(-2px); box-shadow: 0 12px 40px rgba(0,0,0,0.3); }
.sk-card-main { border-color: rgba(255,105,180,0.1); }
.sk-card-main:hover { border-color: rgba(255,105,180,0.2); box-shadow: 0 12px 40px rgba(255,105,180,0.08); }
.sk-card-icon { font-size: 26px; margin-bottom: 8px; }
.sk-card-title { font-size: 15px; font-weight: 700; color: #f3f4f6; margin-bottom: 2px; }
.sk-card-sub { font-size: 11px; color: #6b7280; margin-bottom: 16px; }
.sk-empty { text-align: center; padding: 20px; font-size: 12px; color: #4b5563; }

/* Theme buttons */
.sk-theme-row { display: flex; gap: 10px; }
.sk-theme-btn {
  flex: 1; padding: 14px; border: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.02);
  border-radius: 12px; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 6px;
  transition: all 0.2s; position: relative;
}
.sk-theme-btn:hover { border-color: rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); }
.sk-theme-btn.on { border-color: rgba(255,105,180,0.3); background: rgba(255,105,180,0.06); }
.sk-theme-icon { font-size: 28px; }
.sk-theme-label { font-size: 12px; color: #9ca3af; font-weight: 500; }
.sk-theme-btn.on .sk-theme-label { color: #ff69b4; }
.sk-theme-check { position: absolute; top: 8px; right: 10px; font-size: 12px; color: #ff69b4; font-weight: 700; }

/* Cache */
.sk-cache-list { display: flex; flex-direction: column; gap: 6px; }
.sk-cache-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: rgba(255,255,255,0.02); border-radius: 8px; font-size: 12px; color: #9ca3af; }
.sk-cache-size { font-family: monospace; font-size: 11px; color: #6b7280; margin-left: auto; }
.sk-cache-row button { padding: 3px 10px; border: 1px solid rgba(239,68,68,0.15); background: none; border-radius: 14px; color: #ef4444; font-size: 10px; cursor: pointer; }
.sk-cache-row button:hover { background: rgba(239,68,68,0.1); }

/* Fields */
.sk-field { margin-bottom: 14px; }
.sk-field label { display: block; font-size: 11px; font-weight: 600; color: #9ca3af; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.04em; }
.sk-label-hint { font-weight: 400; text-transform: none; letter-spacing: 0; color: #6b7280; font-size: 10px; }
.sk-field input, .sk-field select, .sk-field textarea {
  width: 100%; padding: 9px 12px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px; color: #e5e7eb; font-size: 12px; font-family: inherit; box-sizing: border-box;
  transition: border-color 0.2s;
}
.sk-field input:focus, .sk-field select:focus, .sk-field textarea:focus { outline: none; border-color: rgba(255,105,180,0.3); box-shadow: 0 0 0 3px rgba(255,105,180,0.06); }
.sk-field textarea { resize: vertical; line-height: 1.5; }

.sk-input-grp { display: flex; }
.sk-input-grp input { flex: 1; border-radius: 8px 0 0 8px; }
.sk-input-grp button { padding: 9px 12px; border: 1px solid rgba(255,255,255,0.08); border-left: none; background: rgba(0,0,0,0.2); border-radius: 0 8px 8px 0; cursor: pointer; font-size: 14px; }

.sk-input-row { display: flex; gap: 6px; }
.sk-input-row input, .sk-input-row select { flex: 1; }

/* Segmented */
.sk-seg { display: flex; border-radius: 8px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08); }
.sk-seg button { flex: 1; padding: 8px; border: none; background: none; color: #6b7280; font-size: 12px; cursor: pointer; transition: all 0.15s; }
.sk-seg button.on { background: rgba(255,105,180,0.15); color: #ff69b4; font-weight: 600; }

/* Chips */
.sk-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.sk-chips button { padding: 5px 12px; border: 1px solid rgba(255,255,255,0.08); background: none; border-radius: 20px; color: #9ca3af; font-size: 11px; cursor: pointer; }
.sk-chips button.active { border-color: #ff69b4; color: #ff69b4; }
.sk-chip-x { border-color: transparent !important; color: #ef4444 !important; }

/* Params */
.sk-params { display: flex; gap: 14px; }
.sk-param { flex: 1; }
.sk-param span { font-size: 10px; color: #6b7280; display: block; margin-bottom: 4px; }
.sk-param em { font-style: normal; font-size: 12px; color: #ff69b4; font-weight: 700; font-family: monospace; }
.sk-param input[type=range] { width: 100%; accent-color: #ff69b4; padding: 0; background: none; border: none; }
.sk-param input[type=number] { width: 100%; }

/* Buttons */
.sk-btn-mini { padding: 5px 10px; border: 1px solid rgba(255,255,255,0.08); background: none; border-radius: 6px; color: #6b7280; font-size: 10px; cursor: pointer; white-space: nowrap; }
.sk-btn-mini:hover { color: #ff69b4; border-color: rgba(255,105,180,0.2); }

.sk-actions { display: flex; gap: 8px; padding-top: 8px; }
.sk-btn { padding: 9px 16px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.02); border-radius: 10px; color: #9ca3af; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.2s; }
.sk-btn:hover { border-color: rgba(255,255,255,0.15); color: #d1d5db; background: rgba(255,255,255,0.04); }
.sk-btn-pri { background: linear-gradient(135deg, rgba(255,105,180,0.15), rgba(255,105,180,0.05)); border-color: rgba(255,105,180,0.2); color: #ff69b4; font-weight: 600; }
.sk-btn-pri:hover { background: linear-gradient(135deg, rgba(255,105,180,0.25), rgba(255,105,180,0.1)); border-color: rgba(255,105,180,0.35); }
.sk-btn.ok { border-color: rgba(34,197,94,0.3); color: #22c55e; }
.sk-btn.fail { border-color: rgba(239,68,68,0.3); color: #ef4444; }
</style>
