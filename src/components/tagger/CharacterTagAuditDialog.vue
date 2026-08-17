<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

const props = defineProps<{ visible: boolean; imageIds: number[] }>()
const emit = defineEmits<{ close: []; applied: [] }>()

const inventory = ref<CharacterAuditInventoryEntry[]>([])
const items = ref<CharacterAuditItem[]>([])
const decisions = ref<CharacterAuditDecision[]>([])
const triggerWords = ref('')
const referenceImagePaths = ref<string[]>([])
const busy = ref(false)
const error = ref('')
const status = ref('')

async function loadInventory() {
  if (!window.characterAuditAPI || !props.imageIds.length) return
  busy.value = true
  error.value = ''
  const response = await window.characterAuditAPI.inventory({ imageIds: props.imageIds })
  busy.value = false
  if (!response.success || !response.data) {
    error.value = response.error || '无法生成角色标签清单'
    return
  }
  inventory.value = response.data.inventory
  items.value = response.data.items
  decisions.value = response.data.inventory.map((entry) => ({
    tag: entry.tag,
    type: 'keep' as const,
    target: '',
    reason: '',
  }))
  status.value = `已扫描 ${items.value.length} 张图片，${inventory.value.length} 个标签`
}

async function chooseReferenceImages() {
  const paths = await window.fsAPI.selectImages()
  if (paths?.length) referenceImagePaths.value = paths.slice(0, 4)
}

async function runAudit() {
  if (!window.characterAuditAPI || !items.value.length) return
  busy.value = true
  error.value = ''
  status.value = '正在使用 LLM 审计角色标签…'
  const response = await window.characterAuditAPI.run({
    imageIds: props.imageIds,
    triggerWords: triggerWords.value
      .split(/[,，\n]/)
      .map((word) => word.trim())
      .filter(Boolean),
    referenceImagePaths: referenceImagePaths.value,
  })
  busy.value = false
  if (!response.success || !response.data) {
    error.value = response.error || '审计失败'
    return
  }
  decisions.value = response.data.inventory.map((entry) => {
    const found = response.data?.decisions.find((decision) => decision.tag.toLowerCase() === entry.tag.toLowerCase())
    return found || { tag: entry.tag, type: 'keep', target: '', reason: '' }
  })
  status.value = `审计完成，共 ${decisions.value.length} 条决定`
}

async function applyAudit() {
  if (!window.characterAuditAPI || !items.value.length) return
  busy.value = true
  error.value = ''
  const response = await window.characterAuditAPI.apply({ items: items.value, decisions: decisions.value })
  busy.value = false
  if (!response.success) {
    error.value = response.error || '应用失败'
    return
  }
  emit('applied')
  emit('close')
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) void loadInventory()
  },
)

onMounted(() => {
  if (props.visible) void loadInventory()
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="audit-backdrop" @click.self="emit('close')">
      <section class="audit-card">
        <header>
          <div><p>CHARACTER AUDIT</p><h2>角色标签审计</h2></div>
          <button aria-label="关闭" @click="emit('close')">×</button>
        </header>

        <div class="audit-fields">
          <label>触发词
            <input v-model="triggerWords" placeholder="例如：hatsune miku, 初音未来" />
          </label>
          <label>标准图
            <button class="picker" type="button" @click="chooseReferenceImages">{{ referenceImagePaths.length ? `已选 ${referenceImagePaths.length} 张` : '选择标准图（最多 4 张）' }}</button>
          </label>
        </div>

        <div class="audit-actions">
          <button :disabled="busy || !items.length" @click="runAudit">{{ busy ? '处理中…' : 'LLM 审计' }}</button>
          <button class="primary" :disabled="busy || !decisions.length" @click="applyAudit">应用决定</button>
        </div>

        <p v-if="status" class="audit-status">{{ status }}</p>
        <p v-if="error" class="audit-error">{{ error }}</p>

        <div class="audit-table">
          <div class="audit-row audit-row--head">
            <span>标签</span><span>图片数</span><span>决定</span><span>替换为</span><span>说明</span>
          </div>
          <div v-for="(entry, index) in inventory" :key="entry.tag" class="audit-row">
            <strong>{{ entry.tag }}</strong>
            <small>{{ entry.count }}</small>
            <select v-model="decisions[index].type">
              <option value="keep">保留</option>
              <option value="delete">删除</option>
              <option value="replace">替换</option>
              <option value="unsure">不确定</option>
            </select>
            <input v-model="decisions[index].target" :disabled="decisions[index].type !== 'replace'" placeholder="目标标签" />
            <input v-model="decisions[index].reason" placeholder="可选" />
          </div>
          <div v-if="!inventory.length" class="audit-empty">当前范围没有角色标签。请先选择已标注图片。</div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.audit-backdrop { position: fixed; inset: 0; z-index: 760; display: grid; place-items: center; padding: 20px; background: rgba(7,6,9,.68); backdrop-filter: blur(9px); }
.audit-card { width: min(920px, 96vw); max-height: 90vh; display: flex; flex-direction: column; padding: 22px; border: 1px solid rgba(255,255,255,.1); border-radius: 16px; background: #1c1921; box-shadow: 0 30px 80px rgba(0,0,0,.48); }
.audit-card header { display: flex; align-items: center; justify-content: space-between; }
.audit-card header p { margin: 0 0 3px; color: var(--accent-primary); font-size: 8px; font-weight: 750; letter-spacing: .17em; }
.audit-card h2 { margin: 0; font-size: 19px; }
.audit-card header button { width: 31px; height: 31px; border: 1px solid rgba(255,255,255,.07); border-radius: 8px; background: rgba(255,255,255,.025); color: var(--text-tertiary); cursor: pointer; font-size: 17px; }
.audit-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 18px; }
.audit-fields label { display: grid; gap: 6px; color: var(--text-tertiary); font-size: 9px; }
.audit-fields input, .picker { box-sizing: border-box; width: 100%; height: 36px; padding: 0 10px; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; background: rgba(255,255,255,.035); color: var(--text-primary); outline: none; font: inherit; text-align: left; }
.picker { cursor: pointer; }
.audit-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.audit-actions button { height: 34px; padding: 0 14px; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; background: rgba(255,255,255,.035); color: var(--text-secondary); cursor: pointer; }
.audit-actions .primary { border-color: transparent; background: var(--accent-primary); color: white; font-weight: 700; }
.audit-actions button:disabled { opacity: .4; cursor: wait; }
.audit-status { margin: 10px 0 0; color: var(--text-tertiary); font-size: 9px; }
.audit-error { margin: 10px 0 0; color: #ff9a86; font-size: 9px; }
.audit-table { flex: 1; min-height: 0; margin-top: 16px; overflow: auto; border: 1px solid rgba(255,255,255,.07); border-radius: 10px; }
.audit-row { display: grid; grid-template-columns: minmax(140px, 1.3fr) 64px 108px minmax(120px, 1fr) minmax(140px, 1.2fr); gap: 7px; align-items: center; padding: 8px 9px; border-bottom: 1px solid rgba(255,255,255,.05); }
.audit-row:last-child { border-bottom: 0; }
.audit-row--head { position: sticky; top: 0; z-index: 1; background: #211e26; color: var(--text-tertiary); font-size: 8px; }
.audit-row strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); font-size: 9px; }
.audit-row small { color: var(--text-tertiary); font-size: 9px; }
.audit-row select, .audit-row input { box-sizing: border-box; width: 100%; height: 30px; padding: 0 7px; border: 1px solid rgba(255,255,255,.07); border-radius: 7px; background: rgba(255,255,255,.03); color: var(--text-primary); outline: none; font: inherit; font-size: 8px; }
.audit-row input:disabled { opacity: .35; }
.audit-empty { grid-column: 1 / -1; padding: 30px; color: var(--text-tertiary); text-align: center; font-size: 11px; }
</style>
