<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()

const provider = ref('openai')
const baseUrl = ref('https://api.openai.com/v1')
const apiKey = ref('')
const model = ref('gpt-4o')
const prompt = ref('')
const saving = ref(false)
const saved = ref(false)
const connecting = ref(false)
const connectStatus = ref('')
const models = ref<string[]>([])
const showKey = ref(false)

onMounted(async () => {
  if (window.llmAPI) {
    try {
      const c = await window.llmAPI.getConfig()
      provider.value = c.provider || 'openai'
      baseUrl.value = c.baseUrl || 'https://api.openai.com/v1'
      apiKey.value = c.apiKey || ''
      model.value = c.model || 'gpt-4o'
      prompt.value = c.prompt || ''
    } catch (_) {}
  }
})

async function connectAndList() {
  if (!apiKey.value.trim()) {
    connectStatus.value = '请输入 API Key'; return
  }
  connecting.value = true; connectStatus.value = '连接中...'; models.value = []
  try {
    const res = await window.llmAPI.listModels({
      provider: provider.value, baseUrl: baseUrl.value, apiKey: apiKey.value,
    })
    if (res.success && res.models?.length) {
      models.value = res.models
      connectStatus.value = `已获取 ${res.models.length} 个模型`
      if (!model.value || !res.models.includes(model.value)) {
        model.value = res.models[0]
      }
    } else {
      connectStatus.value = res.error || '未获取到模型'
    }
  } catch (e: any) { connectStatus.value = e.message || '连接失败' }
  connecting.value = false
}

async function saveConfig() {
  if (!window.llmAPI) return
  saving.value = true; saved.value = false
  await window.llmAPI.saveConfig({
    provider: provider.value, baseUrl: baseUrl.value,
    apiKey: apiKey.value, model: model.value, prompt: prompt.value,
  })
  saved.value = true
  setTimeout(() => { saved.value = false }, 2000)
  saving.value = false
}
</script>

<template>
  <div class="settings-page">
    <div class="page-header">
      <h1 class="page-title">设置</h1>
      <p class="page-desc">配置 Baka TOOLS 参数</p>
    </div>

    <!-- Appearance -->
    <div class="settings-group glass-panel">
      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">主题</span>
          <span class="setting-desc">{{ appStore.theme === 'dark' ? '暗色霓虹模式' : '亮色日间模式' }}</span>
        </div>
        <button class="theme-toggle" @click="appStore.toggleTheme()">
          <svg v-if="appStore.theme === 'dark'" class="toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
          <svg v-else class="toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
          </svg>
          <span>{{ appStore.theme === 'dark' ? '夜间' : '日间' }}</span>
        </button>
      </div>
      <div class="setting-divider"></div>
      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">桌面人偶</span>
          <span class="setting-desc">{{ appStore.showMascot ? '仪表盘常驻显示' : '已关闭' }}</span>
        </div>
        <button class="theme-toggle" @click="appStore.toggleMascot()">
          <span>{{ appStore.showMascot ? '🎀 显示中' : '关闭' }}</span>
        </button>
      </div>
    </div>

    <!-- LLM API -->
    <div class="settings-group glass-panel" style="margin-top: 16px;">
      <div class="setting-section-title">🤖 LLM API 配置</div>

      <!-- Provider -->
      <div class="setting-row">
        <label class="field-label">提供商</label>
        <div class="field-right">
          <div class="source-tabs">
            <button class="source-tab" :class="{ active: provider === 'openai' }" @click="provider = 'openai'">OpenAI 兼容</button>
            <button class="source-tab" :class="{ active: provider === 'gemini' }" @click="provider = 'gemini'">Google Gemini</button>
          </div>
        </div>
      </div>
      <div class="setting-divider"></div>

      <!-- Base URL -->
      <div class="setting-row">
        <label class="field-label">API 地址</label>
        <div class="field-right">
          <input class="form-input styled-input" v-model="baseUrl" placeholder="https://api.openai.com/v1" />
        </div>
      </div>
      <div class="setting-divider"></div>

      <!-- API Key -->
      <div class="setting-row">
        <label class="field-label">API Key</label>
        <div class="field-right">
          <div class="input-with-icon">
            <input class="form-input styled-input" :type="showKey ? 'text' : 'password'" v-model="apiKey" placeholder="sk-..." />
            <button class="eye-btn" @click="showKey = !showKey">
              <svg v-if="!showKey" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
              </svg>
              <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
      <div class="setting-divider"></div>

      <!-- Connect + Model -->
      <div class="setting-row">
        <label class="field-label">模型</label>
        <div class="field-right">
          <div class="model-row">
            <select class="form-input styled-input" v-model="model" style="flex:1;">
              <option v-if="models.length === 0" :value="model">{{ model || '请先连接' }}</option>
              <option v-for="m in models" :key="m" :value="m">{{ m }}</option>
            </select>
            <button class="connect-btn" @click="connectAndList" :disabled="connecting">
              <svg v-if="connecting" class="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
              <span v-else>🔗</span>
              {{ connecting ? '获取中' : '连接' }}
            </button>
          </div>
          <span class="connect-status" v-if="connectStatus" :class="{ error: connectStatus.includes('失败') || connectStatus.includes('请输入') }">
            {{ connectStatus }}
          </span>
        </div>
      </div>
      <div class="setting-divider"></div>

      <!-- Prompt -->
      <div class="setting-row">
        <label class="field-label">标注 Prompt</label>
        <div class="field-right">
          <textarea class="form-input styled-input" v-model="prompt" rows="3" placeholder="发送给 LLM 的标注指令..."></textarea>
        </div>
      </div>

      <!-- Save -->
      <div class="setting-footer">
        <button class="save-btn" @click="saveConfig" :disabled="saving">
          {{ saving ? '保存中...' : saved ? '✓ 已保存' : '💾 保存配置' }}
        </button>
      </div>
    </div>

    <!-- About -->
    <div class="settings-group glass-panel" style="margin-top: 16px;">
      <div class="setting-section-title">关于</div>
      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">版本</span><span class="setting-desc">Baka TOOLS v{{ appStore.version }}</span>
        </div>
      </div>
      <div class="setting-divider"></div>
      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">技术栈</span><span class="setting-desc">Electron · Vue 3 · Vite · LLM</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-page { max-width: 660px; margin: 0 auto; }
.page-header { margin-bottom: 24px; }
.page-title { font-size: 24px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px; letter-spacing: -0.01em; }
.page-desc { font-size: 13px; color: var(--text-tertiary); }

.settings-group { padding: 8px 0; }

/* ── Rows ── */
.setting-row {
  display: flex; align-items: flex-start; gap: 16px;
  padding: 14px 20px;
}
.field-label {
  font-size: 13px; font-weight: 600; color: var(--text-secondary);
  min-width: 80px; padding-top: 9px; flex-shrink: 0;
}
.field-right { flex: 1; min-width: 0; }

/* ── Styled inputs ── */
.styled-input {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: var(--radius-sm);
  padding: 10px 14px; font-size: 13px; color: var(--text-primary);
  font-family: var(--font-sans);
  transition: all 0.25s ease;
  width: 100%;
}
.styled-input:focus {
  outline: none;
  border-color: rgba(var(--accent-primary-rgb), 0.4);
  box-shadow: 0 0 0 3px rgba(var(--accent-primary-rgb), 0.08);
  background: rgba(255,255,255,0.06);
}
.styled-input::placeholder { color: var(--text-disabled); }

/* ── Input with eye icon ── */
.input-with-icon { position: relative; display: flex; align-items: center; }
.input-with-icon .styled-input { padding-right: 40px; }
.eye-btn {
  position: absolute; right: 8px;
  background: none; border: none; color: var(--text-tertiary);
  cursor: pointer; padding: 4px; display: flex;
  transition: color 0.2s;
}
.eye-btn:hover { color: var(--text-secondary); }

/* ── Model row ── */
.model-row { display: flex; gap: 8px; align-items: center; }

.connect-btn {
  display: flex; align-items: center; gap: 5px;
  padding: 9px 16px; white-space: nowrap;
  border: 1px solid rgba(var(--accent-primary-rgb), 0.25);
  border-radius: var(--radius-sm);
  background: rgba(var(--accent-primary-rgb), 0.08);
  color: var(--accent-primary); font-size: 12px; font-weight: 600;
  font-family: var(--font-sans); cursor: pointer;
  transition: all 0.25s ease;
}
.connect-btn:hover { background: rgba(var(--accent-primary-rgb), 0.15); box-shadow: 0 0 12px rgba(var(--accent-primary-rgb), 0.15); }
.connect-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.connect-status {
  display: block; font-size: 11px; margin-top: 5px;
  color: var(--accent-success);
}
.connect-status.error { color: var(--accent-danger); }

/* ── Save button ── */
.setting-footer { padding: 16px 20px; display: flex; justify-content: flex-end; }
.save-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 11px 28px;
  border: none; border-radius: var(--radius-full);
  background: var(--gradient-accent);
  color: #fff; font-size: 13px; font-weight: 700;
  font-family: var(--font-sans); cursor: pointer;
  box-shadow: 0 4px 16px rgba(var(--accent-primary-rgb), 0.3);
  transition: all 0.3s cubic-bezier(0.34,1.56,0.64,1);
}
.save-btn:hover { transform: scale(1.04); box-shadow: 0 8px 28px rgba(var(--accent-primary-rgb), 0.45); }
.save-btn:active { transform: scale(0.96); }
.save-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }

/* ── Source tabs ── */
.source-tabs { display: flex; gap: 6px; }
.source-tab {
  padding: 8px 16px; border: 1px solid var(--glass-border);
  border-radius: var(--radius-full); background: var(--glass-bg);
  color: var(--text-tertiary); font-size: 12px;
  font-family: var(--font-sans); font-weight: 500;
  cursor: pointer; transition: all var(--transition-fast);
}
.source-tab:hover { background: var(--glass-bg-hover); color: var(--text-secondary); }
.source-tab.active { background: var(--accent-bg); border-color: var(--border-accent); color: var(--accent-primary); font-weight: 600; }

/* ── Theme toggle ── */
.setting-item {
  display: flex; align-items: center; justify-content: space-between; padding: 14px 20px;
}
.setting-info { display: flex; flex-direction: column; gap: 2px; }
.setting-label { font-size: 14px; color: var(--text-primary); font-weight: 500; }
.setting-desc { font-size: 12px; color: var(--text-tertiary); }
.setting-divider { height: 1px; background: var(--border-subtle); margin: 0 20px; }
.setting-section-title { font-size: 13px; font-weight: 600; color: var(--text-secondary); padding: 12px 20px 8px; }
.theme-toggle {
  display: flex; align-items: center; gap: 8px; padding: 9px 16px;
  background: var(--glass-bg); border: 1px solid var(--glass-border);
  border-radius: var(--radius-full); color: var(--text-secondary);
  font-size: 13px; font-family: var(--font-sans); font-weight: 500;
  cursor: pointer; transition: all var(--transition-base); backdrop-filter: blur(8px);
}
.theme-toggle:hover { background: var(--glass-bg-hover); border-color: var(--border-accent); color: var(--text-primary); transform: scale(1.04); }
.toggle-icon { width: 16px; height: 16px; }

.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
