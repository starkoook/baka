<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  applyPromptMode,
  compiledPrompt,
  loadLlmPromptState,
  saveLlmPromptState,
  type LlmPromptMode,
  type LlmPromptState,
} from './llm-prompt-state'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ close: [] }>()

const state = ref<LlmPromptState>(loadLlmPromptState())
const saveMessage = ref('')
let saveTimer: ReturnType<typeof setTimeout> | null = null

const preview = computed(() => compiledPrompt(state.value))
const isEmptyMode = computed(() => state.value.annotationMode === 'empty')
const modeLabel = computed(() => ({
  exact: '精确',
  short: '简略',
  tag: '标签',
  empty: '空',
}[state.value.annotationMode]))

const promptModes: Array<{ value: LlmPromptMode; label: string }> = [
  { value: 'exact', label: '精确' },
  { value: 'short', label: '简略' },
  { value: 'tag', label: '标签' },
  { value: 'empty', label: '空' },
]

const promptOptions: Array<{ key: keyof Pick<LlmPromptState,
  'atmosphere' | 'quality' | 'lensInfo' | 'ignoreText' | 'facialFeatures' | 'jpegCompression' | 'adversarialNoise' | 'aiGenerated'
>; label: string }> = [
  { key: 'atmosphere', label: '描述氛围/情感' },
  { key: 'quality', label: '评估美学质量' },
  { key: 'lensInfo', label: '分析镜头信息' },
  { key: 'ignoreText', label: '忽略图片文字' },
  { key: 'facialFeatures', label: '描述面部特征/名人' },
  { key: 'jpegCompression', label: 'JPEG 压缩损失' },
  { key: 'adversarialNoise', label: '对抗噪声' },
  { key: 'aiGenerated', label: 'AI 生成痕迹' },
]

function persistSoon() {
  if (saveTimer) window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    saveLlmPromptState(state.value)
    saveMessage.value = '已保存'
  }, 450)
}

function setMode(mode: LlmPromptMode) {
  saveMessage.value = ''
  state.value = applyPromptMode(mode, state.value)
  persistSoon()
}

function patch(partial: Partial<LlmPromptState>) {
  saveMessage.value = ''
  state.value = { ...state.value, ...partial }
  persistSoon()
}

function toggleOption(key: (typeof promptOptions)[number]['key'], checked: boolean) {
  patch({ [key]: checked })
}

watch(() => props.visible, (visible) => {
  if (!visible) return
  state.value = loadLlmPromptState()
  saveMessage.value = ''
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="dialog-backdrop" @click.self="emit('close')">
      <section class="dialog-card" role="dialog" aria-modal="true" aria-labelledby="prompt-title">
        <header>
          <h2 id="prompt-title">提示词管理</h2>
          <button type="button" class="icon-close" aria-label="关闭" @click="emit('close')">×</button>
        </header>

        <div class="dialog-split">
          <div class="pane pane-left">
            <section class="block">
              <div class="block-head">标注模式</div>
              <div class="mode-chips">
                <button
                  v-for="mode in promptModes"
                  :key="mode.value"
                  type="button"
                  :class="{ active: state.annotationMode === mode.value }"
                  @click="setMode(mode.value)"
                >{{ mode.label }}</button>
              </div>
            </section>

            <section class="block">
              <div class="block-head">详细选项</div>
              <div class="options-grid" :class="{ disabled: isEmptyMode }">
                <label v-for="option in promptOptions" :key="option.key" class="opt-switch">
                  <span>{{ option.label }}</span>
                  <input
                    type="checkbox"
                    :checked="Boolean(state[option.key])"
                    :disabled="isEmptyMode"
                    @change="toggleOption(option.key, ($event.target as HTMLInputElement).checked)"
                  />
                </label>
              </div>
            </section>

            <section class="block grow">
              <div class="block-head">附加提示词</div>
              <div class="block-body grow">
                <textarea
                  :value="state.additionalPromptContent"
                  @input="patch({ additionalPromptContent: ($event.target as HTMLTextAreaElement).value })"
                ></textarea>
              </div>
            </section>
          </div>

          <div class="pane pane-right">
            <div class="preview-head">
              <div>提示词预览<span v-if="modeLabel"> · {{ modeLabel }}</span></div>
              <small v-if="saveMessage">{{ saveMessage }}</small>
            </div>
            <textarea class="preview" readonly :value="preview"></textarea>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.dialog-backdrop {
  position: fixed; inset: 0; z-index: 700;
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
  background: rgba(7, 6, 9, 0.42);
}
.dialog-card {
  width: min(960px, 100%);
  height: min(600px, 90vh);
  display: flex; flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--line-subtle, rgba(255,255,255,.1));
  border-radius: 12px;
  background: var(--surface-primary, #19171d);
  box-shadow: 0 24px 72px rgba(0,0,0,.36);
}
.dialog-card header {
  display: flex; align-items: center; justify-content: space-between;
  height: 56px; flex: none; padding: 0 20px;
  border-bottom: 1px solid var(--line-subtle, rgba(255,255,255,.08));
}
.dialog-card h2 { margin: 0; font-size: 15px; font-weight: 650; color: var(--text-primary); }
.icon-close {
  width: 32px; height: 32px; border: 1px solid var(--line-subtle, rgba(255,255,255,.08));
  border-radius: 8px; background: transparent; color: var(--text-tertiary); cursor: pointer; font-size: 18px;
}
.dialog-split {
  min-height: 0; flex: 1;
  display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr);
  background: rgba(255,255,255,.015);
}
.pane { min-height: 0; display: flex; flex-direction: column; padding: 20px; }
.pane-left { border-right: 1px solid var(--line-subtle, rgba(255,255,255,.08)); overflow: auto; }
.pane-right { min-height: 0; }
.block {
  border: 1px solid var(--line-subtle, rgba(255,255,255,.08));
  border-radius: 10px;
  background: rgba(255,255,255,.02);
  overflow: hidden;
}
.block + .block { margin-top: 12px; }
.block.grow, .block-body.grow, .pane-right { display: flex; flex-direction: column; min-height: 0; }
.block.grow { flex: 1; }
.block-head {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255,255,255,.06);
  color: var(--text-primary); font-size: 13px; font-weight: 650;
}
.block-body { padding: 12px 16px; }
.block-body.grow { flex: 1; min-height: 0; }
.mode-chips { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 12px 16px; }
.mode-chips button {
  height: 32px; border: 1px solid rgba(255,255,255,.08); border-radius: 8px;
  background: rgba(255,255,255,.03); color: var(--text-secondary);
  cursor: pointer; font-size: 13px; font-weight: 550;
}
.mode-chips button.active {
  border-color: transparent; background: var(--accent-primary, #111); color: #fff;
}
.options-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
  padding: 12px 16px;
}
.options-grid.disabled { opacity: .42; }
.opt-switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 28px;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
}
.opt-switch input {
  flex: none;
  width: 16px;
  height: 16px;
  accent-color: var(--accent-primary, #111);
  cursor: pointer;
}
.opt-switch input:disabled { cursor: not-allowed; }
.block-body textarea, .preview {
  box-sizing: border-box; width: 100%;
  border: 1px solid rgba(255,255,255,.08); border-radius: 8px;
  background: rgba(255,255,255,.035); color: var(--text-primary);
  outline: none; font: inherit;
}
.block-body textarea {
  min-height: 160px; flex: 1; padding: 10px;
  resize: none; line-height: 1.6; font-size: 13px;
}
.preview-head {
  display: flex; align-items: center; justify-content: space-between;
  height: 32px; margin-bottom: 8px;
  color: var(--text-primary); font-size: 13px; font-weight: 650;
}
.preview-head small { color: var(--text-tertiary); font-weight: 400; font-size: 12px; }
.preview {
  min-height: 0; flex: 1; padding: 12px;
  resize: none; line-height: 1.6; font-size: 12px; color: var(--text-secondary);
}
</style>
