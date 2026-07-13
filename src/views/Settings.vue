<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()

// ── Tab state ──
type TabId = 'api' | 'appearance' | 'cache' | 'about'
const activeTab = ref<TabId>('api')
const tabs: { id: TabId; label: string; icon: string }[] = [
  { id: 'api', label: 'API', icon: '☁' },
  { id: 'appearance', label: '外观', icon: '🎨' },
  { id: 'cache', label: '缓存', icon: '🗂' },
  { id: 'about', label: '关于', icon: 'ℹ' },
]

// ── API config ──
const provider = ref('openai')
const apiKey = ref('')
const baseUrl = ref('')
const model = ref('gpt-4o')
const temperature = ref(0.3)
const maxTokens = ref(500)
const systemPrompt = ref('')
const profiles = ref<string[]>([])
const activeProfile = ref('')
const models = ref<string[]>([])
const testResult = ref('')
const testOk = ref(false)
const showApiKey = ref(false)

// ── Cache ──
const cacheItems = ref<{ name: string; size: string }[]>([])
const cacheTotal = ref('')

// ── Theme ──
const isLight = computed(() => appStore.theme === 'light')

async function loadConfig() {
  if (!window.llmAPI) return
  const c = await window.llmAPI.getConfig()
  if (c) {
    provider.value = c.provider || 'openai'
    apiKey.value = c.apiKey || ''
    baseUrl.value = c.baseUrl || ''
    model.value = c.model || 'gpt-4o'
    temperature.value = c.temperature ?? 0.3
    maxTokens.value = c.maxTokens ?? 500
    systemPrompt.value = c.prompt || ''
  }
  const p = await window.llmAPI.getProfiles()
  if (p) profiles.value = p
  if (window.cacheAPI) {
    const s = await window.cacheAPI.getSize()
    if (s) { cacheItems.value = s.items || []; cacheTotal.value = s.total || '0 B' }
  }
}

async function saveConfig() {
  if (window.llmAPI) await window.llmAPI.saveConfig({
    provider: provider.value, apiKey: apiKey.value, baseUrl: baseUrl.value,
    model: model.value, temperature: temperature.value,
    maxTokens: maxTokens.value, prompt: systemPrompt.value,
  })
  appStore.setStatus('配置已保存')
}

async function testConn() {
  if (!window.llmAPI) return
  testResult.value = '测试中...'; testOk.value = false
  const r = await window.llmAPI.test({
    provider: provider.value, apiKey: apiKey.value,
    baseUrl: baseUrl.value, model: model.value,
  })
  testOk.value = r.success
  testResult.value = r.success ? '连接成功' : (r.error || '连接失败')
}

async function loadModels() {
  if (!window.llmAPI) return
  const r = await window.llmAPI.listModels({
    provider: provider.value, baseUrl: baseUrl.value, apiKey: apiKey.value,
  })
  if (r.success && r.models) models.value = r.models
}

async function saveProfile() {
  const name = prompt('配置存档名称:')
  if (name && window.llmAPI) {
    await window.llmAPI.saveProfile({
      name, config: {
        provider: provider.value, apiKey: apiKey.value, baseUrl: baseUrl.value,
        model: model.value, temperature: temperature.value,
        maxTokens: maxTokens.value, prompt: systemPrompt.value,
      },
    })
    profiles.value = await window.llmAPI.getProfiles() || []
  }
}

async function switchProfile(name: string) {
  if (!window.llmAPI) return
  await window.llmAPI.switchProfile(name)
  activeProfile.value = name
  await loadConfig()
}

async function deleteProfile(name: string) {
  if (!confirm(`删除 "${name}"？`)) return
  if (window.llmAPI) {
    await window.llmAPI.deleteProfile(name)
    profiles.value = await window.llmAPI.getProfiles() || []
  }
}

async function clearCache(target: string) {
  if (window.cacheAPI) {
    await window.cacheAPI.clear(target)
    const s = await window.cacheAPI.getSize()
    if (s) { cacheItems.value = s.items || []; cacheTotal.value = s.total || '0 B' }
  }
}

onMounted(loadConfig)
</script>

<template>
  <div class="sk-root">
    <!-- ═══ TAB BAR ═══ -->
    <div class="sk-tabs">
      <button
        v-for="tab in tabs" :key="tab.id"
        class="sk-tab"
        :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id"
      >
        <span class="sk-tab-icon">{{ tab.icon }}</span>
        <span class="sk-tab-label">{{ tab.label }}</span>
      </button>
    </div>

    <!-- ───────────── API ───────────── -->
    <div v-if="activeTab === 'api'" class="sk-panel">
      <div class="cabin-panel sk-card">
        <span class="cabin-label">/// LLM_API</span>
        <div class="cabin-panel-br"></div>
        <div class="sk-card-header">
          <span class="sk-card-icon">☁</span>
          <div>
            <div class="sk-card-title">LLM API</div>
            <div class="sk-card-sub">云端大模型用于图像标注和提示词反推</div>
          </div>
        </div>

        <!-- Profiles -->
        <div class="sk-field" v-if="profiles.length > 0">
          <label class="form-label">配置存档</label>
          <div class="sk-chips">
            <button
              v-for="p in profiles" :key="p"
              class="sk-chip"
              :class="{ active: activeProfile === p }"
              @click="switchProfile(p)"
            >{{ p }}</button>
            <button v-if="activeProfile" class="sk-chip sk-chip-x" @click="deleteProfile(activeProfile)">✕</button>
          </div>
        </div>

        <!-- Provider -->
        <div class="sk-field">
          <label class="form-label">提供商</label>
          <div class="sk-seg">
            <button :class="{ on: provider === 'openai' }" @click="provider = 'openai'">OpenAI</button>
            <button :class="{ on: provider === 'gemini' }" @click="provider = 'gemini'">Gemini</button>
          </div>
        </div>

        <!-- Base URL -->
        <div class="sk-field">
          <label class="form-label">API 地址</label>
          <input class="form-input" v-model="baseUrl" :placeholder="provider === 'openai' ? 'https://api.openai.com/v1' : ''" />
        </div>

        <!-- API Key -->
        <div class="sk-field">
          <label class="form-label">API 密钥</label>
          <div class="sk-input-grp">
            <input class="form-input" :type="showApiKey ? 'text' : 'password'" v-model="apiKey" placeholder="sk-..." />
            <button class="sk-eye" @click="showApiKey = !showApiKey">{{ showApiKey ? '🙈' : '👁' }}</button>
          </div>
        </div>

        <!-- Model -->
        <div class="sk-field">
          <label class="form-label">模型</label>
          <div class="sk-input-row">
            <select class="form-select" v-model="model" v-if="models.length > 0">
              <option v-for="m in models" :key="m" :value="m">{{ m }}</option>
            </select>
            <input class="form-input" v-else v-model="model" placeholder="gpt-4o" />
            <button class="btn btn-ghost btn-sm" @click="loadModels">获取列表</button>
          </div>
        </div>

        <!-- System Prompt -->
        <div class="sk-field">
          <label class="form-label">标注指令 <span class="sk-hint">— 告诉 AI 如何标注图像</span></label>
          <textarea class="form-textarea" v-model="systemPrompt" rows="4" placeholder="Danbooru 标签格式输出，按置信度排序..."></textarea>
        </div>

        <!-- Params -->
        <div class="sk-field">
          <label class="form-label">参数</label>
          <div class="sk-params-grid">
            <div class="sk-param">
              <span class="sk-param-label">Temperature</span>
              <input class="form-range" type="range" min="0" max="2" step="0.1" v-model.number="temperature" />
              <span class="sk-param-val">{{ temperature.toFixed(1) }}</span>
            </div>
            <div class="sk-param">
              <span class="sk-param-label">Max Tokens</span>
              <input class="form-input" type="number" min="50" max="4000" step="50" v-model.number="maxTokens" />
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="sk-actions">
          <button class="btn btn-primary" @click="saveConfig">💾 保存配置</button>
          <button class="btn btn-secondary" @click="saveProfile">📋 另存为存档</button>
          <button
            class="btn btn-secondary"
            :class="{ 'sk-test-ok': testOk, 'sk-test-fail': testResult && !testOk }"
            @click="testConn"
          >🔌 {{ testResult || '测试连接' }}</button>
        </div>
      </div>
    </div>

    <!-- ───────────── 外观 ───────────── -->
    <div v-if="activeTab === 'appearance'" class="sk-panel">
      <div class="cabin-panel sk-card">
        <span class="cabin-label">/// APPEARANCE</span>
        <div class="cabin-panel-br"></div>
        <div class="sk-card-header">
          <span class="sk-card-icon">🎨</span>
          <div>
            <div class="sk-card-title">界面主题</div>
            <div class="sk-card-sub">选择你喜欢的界面风格</div>
          </div>
        </div>
        <div class="sk-theme-row">
          <button
            class="sk-theme-btn"
            :class="{ active: !isLight }"
            @click="isLight ? appStore.toggleTheme() : undefined"
          >
            <span class="sk-theme-icon">🌙</span>
            <span class="sk-theme-label">深色模式</span>
            <span class="sk-theme-check" v-if="!isLight">✓</span>
          </button>
          <button
            class="sk-theme-btn"
            :class="{ active: isLight }"
            @click="!isLight ? appStore.toggleTheme() : undefined"
          >
            <span class="sk-theme-icon">☀</span>
            <span class="sk-theme-label">浅色模式</span>
            <span class="sk-theme-check" v-if="isLight">✓</span>
          </button>
        </div>
      </div>

      <div class="cabin-panel sk-card">
        <span class="cabin-label">/// MASCOT</span>
        <div class="cabin-panel-br"></div>
        <div class="sk-card-header">
          <span class="sk-card-icon">🤖</span>
          <div>
            <div class="sk-card-title">互动助手</div>
            <div class="sk-card-sub">Baka 小人的全息投影</div>
          </div>
        </div>
        <label class="sk-toggle">
          <input type="checkbox" :checked="appStore.showMascot" @change="appStore.toggleMascot()" />
          <span class="sk-toggle-track">
            <span class="sk-toggle-knob"></span>
          </span>
          <span class="sk-toggle-label">{{ appStore.showMascot ? '显示中' : '已隐藏' }}</span>
        </label>
      </div>
    </div>

    <!-- ───────────── 缓存 ───────────── -->
    <div v-if="activeTab === 'cache'" class="sk-panel">
      <div class="cabin-panel sk-card">
        <span class="cabin-label">/// CACHE</span>
        <div class="cabin-panel-br"></div>
        <div class="sk-card-header">
          <span class="sk-card-icon">🗂</span>
          <div>
            <div class="sk-card-title">缓存管理</div>
            <div class="sk-card-sub">总计 {{ cacheTotal }}</div>
          </div>
        </div>
        <div class="sk-cache-list" v-if="cacheItems.length > 0">
          <div v-for="c in cacheItems" :key="c.name" class="sk-cache-row">
            <span class="sk-cache-name">{{ c.name }}</span>
            <span class="sk-cache-size">{{ c.size }}</span>
            <button class="btn btn-ghost btn-sm" @click="clearCache(c.name)">清理</button>
          </div>
        </div>
        <div v-else class="sk-empty-state">暂无缓存数据</div>
      </div>
    </div>

    <!-- ───────────── 关于 ───────────── -->
    <div v-if="activeTab === 'about'" class="sk-panel">
      <div class="cabin-panel sk-card sk-card-center">
        <span class="cabin-label">/// ABOUT</span>
        <div class="cabin-panel-br"></div>
        <div class="sk-about-icon">⚙</div>
        <h2 class="sk-about-title">Baka Tools</h2>
        <div class="sk-about-version">v{{ appStore.version }}</div>
        <p class="sk-about-desc">Anime image toolbox — 标注 · 超分 · 生成 · 训练</p>
        <div class="sk-about-meta">
          <span class="sk-about-meta-item">TypeScript + Vue 3 + Electron</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sk-root {
  max-width: 720px;
  margin: 0 auto;
  padding-bottom: 40px;
}

/* ═══ TABS ═══ */
.sk-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 20px;
  background: var(--hud-bg);
  border: 1px solid var(--hud-border);
  border-radius: var(--radius-md);
  padding: 4px;
}
.sk-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 14px;
  border: none;
  background: none;
  border-radius: var(--radius-sm);
  color: var(--text-tertiary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-base);
  font-family: var(--font-sans);
}
.sk-tab:hover { color: var(--text-secondary); background: rgba(255,255,255,0.02); }
.sk-tab.active {
  color: var(--accent-primary);
  background: var(--accent-bg);
}
.sk-tab-icon { font-size: 16px; line-height: 1; }

/* ═══ PANEL ═══ */
.sk-panel { display: flex; flex-direction: column; gap: 14px; }
.sk-card { padding: 22px; }
.sk-card-center { text-align: center; display: flex; flex-direction: column; align-items: center; }
.sk-card-header { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 18px; }
.sk-card-icon { font-size: 24px; line-height: 1; flex-shrink: 0; margin-top: 2px; }
.sk-card-title { font-size: 15px; font-weight: 600; color: var(--text-primary); margin-bottom: 2px; }
.sk-card-sub { font-size: 12px; color: var(--text-tertiary); }

/* ═══ FIELDS ═══ */
.sk-field { margin-bottom: 14px; }
.sk-field:last-child { margin-bottom: 0; }
.sk-hint { font-weight: 400; text-transform: none; letter-spacing: 0; color: var(--text-tertiary); font-size: 10px; }

/* ── Input group ── */
.sk-input-grp { display: flex; }
.sk-input-grp .form-input:first-child {
  border-radius: var(--radius-sm) 0 0 var(--radius-sm);
}
.sk-eye {
  padding: 9px 12px;
  border: 1px solid var(--border-default);
  border-left: none;
  background: var(--hud-bg);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  transition: all var(--transition-fast);
  color: var(--text-tertiary);
}
.sk-eye:hover { color: var(--text-primary); }

/* ── Input row ── */
.sk-input-row { display: flex; gap: 6px; }
.sk-input-row .form-input,
.sk-input-row .form-select { flex: 1; }

/* ── Segmented control ── */
.sk-seg {
  display: flex;
  border-radius: var(--radius-full);
  background: var(--hud-bg);
  border: 1px solid var(--hud-border);
  overflow: hidden;
  width: fit-content;
}
.sk-seg button {
  padding: 8px 18px;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 12px;
  font-weight: 500;
  font-family: var(--font-sans);
  cursor: pointer;
  transition: all var(--transition-fast);
  position: relative;
}
.sk-seg button:hover { color: var(--text-secondary); }
.sk-seg button.on {
  color: var(--accent-primary);
  background: var(--accent-bg);
}
.sk-seg button + button::before {
  content: '';
  position: absolute;
  left: 0; top: 20%;
  height: 60%;
  width: 1px;
  background: var(--hud-border);
}

/* ── Profile chips ── */
.sk-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.sk-chip {
  padding: 5px 14px;
  border: 1px solid var(--border-default);
  background: transparent;
  border-radius: var(--radius-full);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 500;
  font-family: var(--font-sans);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.sk-chip:hover {
  border-color: var(--border-accent);
  color: var(--accent-primary);
}
.sk-chip.active {
  border-color: var(--border-accent);
  background: var(--accent-bg);
  color: var(--accent-primary);
}
.sk-chip-x { color: var(--accent-danger) !important; border-color: transparent !important; }
.sk-chip-x:hover { border-color: rgba(239,68,68,0.3) !important; }

/* ── Params grid ── */
.sk-params-grid { display: flex; gap: 20px; }
.sk-param { flex: 1; }
.sk-param-label {
  display: block;
  font-size: 10px;
  color: var(--text-tertiary);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.sk-param-val {
  display: block;
  font-size: 12px;
  color: var(--accent-primary);
  font-weight: 700;
  font-family: var(--font-mono);
  margin-top: 4px;
}

/* ── Actions ── */
.sk-actions { display: flex; gap: 8px; padding-top: 8px; flex-wrap: wrap; }
.sk-test-ok { border-color: var(--accent-success) !important; color: var(--accent-success) !important; }
.sk-test-fail { border-color: var(--accent-danger) !important; color: var(--accent-danger) !important; }

/* ═══ THEME ═══ */
.sk-theme-row { display: flex; gap: 10px; }
.sk-theme-btn {
  flex: 1;
  padding: 16px;
  border: 1px solid var(--border-default);
  background: var(--glass-bg);
  border-radius: var(--radius-md);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  transition: all var(--transition-base);
  position: relative;
  font-family: var(--font-sans);
}
.sk-theme-btn:hover {
  border-color: var(--border-accent);
  background: var(--glass-bg-hover);
}
.sk-theme-btn.active {
  border-color: var(--border-accent);
  background: var(--accent-bg);
}
.sk-theme-icon { font-size: 28px; }
.sk-theme-label { font-size: 12px; color: var(--text-secondary); font-weight: 500; }
.sk-theme-btn.active .sk-theme-label { color: var(--accent-primary); }
.sk-theme-check {
  position: absolute;
  top: 8px; right: 10px;
  font-size: 12px;
  color: var(--accent-primary);
  font-weight: 700;
}

/* ═══ TOGGLE ═══ */
.sk-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}
.sk-toggle input { display: none; }
.sk-toggle-track {
  position: relative;
  width: 42px; height: 24px;
  border-radius: 12px;
  background: var(--hud-bg);
  border: 1px solid var(--hud-border);
  transition: all var(--transition-fast);
  flex-shrink: 0;
}
.sk-toggle input:checked + .sk-toggle-track {
  background: var(--accent-bg);
  border-color: var(--border-accent);
}
.sk-toggle-knob {
  position: absolute;
  top: 2px; left: 2px;
  width: 18px; height: 18px;
  border-radius: 50%;
  background: var(--text-tertiary);
  transition: all var(--transition-fast);
}
.sk-toggle input:checked + .sk-toggle-track .sk-toggle-knob {
  left: 20px;
  background: var(--accent-primary);
}
.sk-toggle-label { font-size: 13px; color: var(--text-secondary); }

/* ═══ CACHE ═══ */
.sk-cache-list { display: flex; flex-direction: column; gap: 2px; }
.sk-cache-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--hud-bg);
  border: 1px solid var(--hud-border);
  border-radius: var(--radius-sm);
}
.sk-cache-name { flex: 1; font-size: 12px; color: var(--text-primary); font-family: var(--font-mono); }
.sk-cache-size { font-size: 11px; color: var(--text-tertiary); font-family: var(--font-mono); }
.sk-empty-state {
  text-align: center;
  padding: 30px;
  color: var(--text-tertiary);
  font-size: 13px;
}

/* ═══ ABOUT ═══ */
.sk-about-icon {
  width: 56px; height: 56px;
  border-radius: var(--radius-lg);
  background: var(--accent-bg);
  border: 1px solid var(--border-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  margin-bottom: 12px;
}
.sk-about-title {
  font-size: 22px;
  font-weight: 700;
  margin: 0 0 4px;
}
.sk-about-version {
  font-size: 12px;
  color: var(--text-tertiary);
  font-family: var(--font-mono);
  margin-bottom: 10px;
}
.sk-about-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0 0 16px;
}
.sk-about-meta {
  display: flex;
  gap: 10px;
}
.sk-about-meta-item {
  font-size: 10px;
  color: var(--text-tertiary);
  font-family: var(--font-mono);
  padding: 4px 10px;
  background: var(--hud-bg);
  border: 1px solid var(--hud-border);
  border-radius: var(--radius-full);
}
</style>
