<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()

// LLM config loaded from main process
const provider = ref('openai')
const baseUrl = ref('https://api.openai.com/v1')
const apiKey = ref('')
const model = ref('gpt-4o')
const prompt = ref('')
const saving = ref(false)
const saved = ref(false)

onMounted(async () => {
  if (window.llmAPI) {
    try {
      const config = await window.llmAPI.getConfig()
      provider.value = config.provider || 'openai'
      baseUrl.value = config.baseUrl || 'https://api.openai.com/v1'
      apiKey.value = config.apiKey || ''
      model.value = config.model || 'gpt-4o'
      prompt.value = config.prompt || ''
    } catch (_) {}
  }
})

async function saveLLMConfig() {
  if (!window.llmAPI) return
  saving.value = true
  saved.value = false
  try {
    await window.llmAPI.saveConfig({
      provider: provider.value,
      baseUrl: baseUrl.value,
      apiKey: apiKey.value,
      model: model.value,
      prompt: prompt.value,
    })
    saved.value = true
    setTimeout(() => (saved.value = false), 2000)
  } catch (_) {}
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
          <span class="setting-desc">
            {{ appStore.theme === 'dark' ? '暗色霓虹模式' : '亮色日间模式' }}
          </span>
        </div>
        <button class="theme-toggle" @click="appStore.toggleTheme()">
          <svg v-if="appStore.theme === 'dark'" class="toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <circle cx="12" cy="12" r="5"/>
            <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
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
          <span class="setting-desc">
            {{ appStore.showMascot ? '仪表盘常驻显示' : '已关闭' }}
          </span>
        </div>
        <button class="theme-toggle" @click="appStore.toggleMascot()">
          <span>{{ appStore.showMascot ? '🎀 显示中' : '关闭' }}</span>
        </button>
      </div>
    </div>

    <!-- LLM API -->
    <div class="settings-group glass-panel" style="margin-top: 16px;">
      <div class="setting-section-title">🤖 LLM 标注配置</div>

      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">API 提供商</span>
        </div>
        <select class="form-select" style="width: 180px;" v-model="provider">
          <option value="openai">OpenAI 兼容</option>
          <option value="gemini">Google Gemini</option>
        </select>
      </div>
      <div class="setting-divider"></div>

      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">API 地址</span>
        </div>
        <input
          class="form-input"
          style="width: 280px;"
          v-model="baseUrl"
          placeholder="https://api.openai.com/v1"
        />
      </div>
      <div class="setting-divider"></div>

      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">API Key</span>
        </div>
        <input
          class="form-input"
          style="width: 280px;"
          type="password"
          v-model="apiKey"
          placeholder="sk-..."
        />
      </div>
      <div class="setting-divider"></div>

      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">模型名称</span>
        </div>
        <input
          class="form-input"
          style="width: 200px;"
          v-model="model"
          placeholder="gpt-4o / gemini-pro-vision"
        />
      </div>
      <div class="setting-divider"></div>

      <div class="setting-item" style="flex-direction: column; align-items: flex-start; gap: 8px;">
        <div class="setting-info">
          <span class="setting-label">标注 Prompt</span>
          <span class="setting-desc">发送给 LLM 的标注指令</span>
        </div>
        <textarea
          class="form-textarea"
          v-model="prompt"
          rows="3"
          placeholder="Describe this anime image and list all character tags..."
        ></textarea>
      </div>
      <div class="setting-divider"></div>

      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">本地模型目录</span>
          <span class="setting-desc">ONNX / 标注模型存放路径</span>
        </div>
        <button class="btn btn-secondary" disabled>选择目录</button>
      </div>
      <div class="setting-divider"></div>

      <div class="setting-item">
        <span></span>
        <button class="btn btn-primary" @click="saveLLMConfig" :disabled="saving">
          {{ saving ? '保存中...' : saved ? '✓ 已保存' : '保存 LLM 配置' }}
        </button>
      </div>
    </div>

    <!-- About -->
    <div class="settings-group glass-panel" style="margin-top: 16px;">
      <div class="setting-section-title">关于</div>
      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">版本</span>
          <span class="setting-desc">Baka TOOLS v{{ appStore.version }}</span>
        </div>
      </div>
      <div class="setting-divider"></div>
      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">技术栈</span>
          <span class="setting-desc">Electron · Vue 3 · Vite · LLM</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-page {
  max-width: 680px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 24px;
}

.page-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 4px;
  letter-spacing: -0.01em;
}

.page-desc {
  font-size: 13px;
  color: var(--text-tertiary);
}

.settings-group {
  padding: 8px 0;
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
}

.setting-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.setting-label {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 500;
}

.setting-desc {
  font-size: 12px;
  color: var(--text-tertiary);
}

.setting-divider {
  height: 1px;
  background: var(--border-subtle);
  margin: 0 20px;
}

.setting-section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  padding: 12px 20px 8px;
}

/* Theme toggle */
.theme-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 16px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-full);
  color: var(--text-secondary);
  font-size: 13px;
  font-family: var(--font-sans);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-base);
  backdrop-filter: blur(8px);
}

.theme-toggle:hover {
  background: var(--glass-bg-hover);
  border-color: var(--border-accent);
  color: var(--text-primary);
  transform: scale(1.04);
}

.toggle-icon {
  width: 16px;
  height: 16px;
}

/* Textarea */
.form-textarea {
  width: 100%;
  padding: 10px 14px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 12px;
  font-family: var(--font-sans);
  resize: vertical;
  transition: border-color var(--transition-fast);
}

.form-textarea:focus {
  outline: none;
  border-color: var(--border-accent);
  box-shadow: 0 0 0 3px rgba(var(--accent-primary-rgb), 0.1);
}
</style>
