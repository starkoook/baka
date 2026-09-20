<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

const props = defineProps<{ visible: boolean; imageIds: number[] }>()
const emit = defineEmits<{ close: []; applied: [] }>()

const inventory = ref<CharacterAuditInventoryEntry[]>([])
const items = ref<CharacterAuditItem[]>([])
const decisions = ref<CharacterAuditDecision[]>([])
const excluded = ref<CharacterAuditInventoryEntry[]>([])
const triggerWords = ref('')
const otherTriggers = ref('')
const referenceImagePaths = ref<string[]>([])
const mode = ref<'sparse' | 'full'>('sparse')
const minimumCount = ref(1)
const busy = ref(false)
const error = ref('')
const status = ref('')
const parentByChild = ref<Record<string, string>>({})
const corePrompt = ref('')
const copied = ref(false)
const showExcluded = ref(false)

const CATEGORY_LABEL: Record<string, string> = {
  identity: '身份', hair: '头发', eyes: '眼睛', face: '脸', body: '身体', clothing: '服装', footwear: '鞋', legwear: '腿部',
  wearable_accessory: '配饰', action: '动作', pose: '姿势', expression: '表情', scene: '场景', composition: '构图', quality: '画质', object: '物件', other: '其他',
}
const PROTECTED = new Set(['identity', 'action', 'pose', 'expression', 'scene', 'composition', 'quality', 'object', 'other'])

function parseWords(text: string) {
  return text.split(/[,，\n]/).map((word) => word.trim()).filter(Boolean)
}

const summary = computed(() => {
  const counts = { keep: 0, delete: 0, replace: 0, unsure: 0 }
  for (const decision of decisions.value) counts[decision.type]++
  return counts
})

const visibleRows = computed(() => decisions.value.map((decision, index) => ({ decision, index, entry: inventory.value.find((item) => item.tag === decision.tag) })))

/** 本地实时算核心 prompt：用户在表格里改了决定 / 是否进 prompt，预览跟着变 */
const livePrompt = computed(() => {
  const chosen = decisions.value
    .filter((item) => item.includeInPrompt && item.type !== 'delete' && item.type !== 'unsure')
    .map((item) => ({ text: item.type === 'replace' && item.target ? item.target : item.tag, order: item.promptOrder ?? Number.MAX_SAFE_INTEGER }))
  for (const word of parseWords(triggerWords.value)) {
    if (!chosen.some((item) => item.text.toLowerCase() === word.toLowerCase())) chosen.unshift({ text: word, order: 0 })
  }
  chosen.sort((a, b) => a.order - b.order)
  const seen = new Set<string>()
  return chosen.filter((item) => { const key = item.text.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true }).map((item) => item.text).join(', ')
})

async function loadInventory() {
  if (!window.characterAuditAPI || !props.imageIds.length) return
  busy.value = true
  error.value = ''
  corePrompt.value = ''
  const response = await window.characterAuditAPI.inventory({ imageIds: props.imageIds })
  busy.value = false
  if (!response.success || !response.data) {
    error.value = response.error || '无法生成角色标签清单'
    return
  }
  inventory.value = response.data.inventory
  items.value = response.data.items
  parentByChild.value = response.data.parentByChild || {}
  excluded.value = []
  decisions.value = response.data.inventory.map((entry) => ({
    tag: entry.tag,
    type: 'keep' as const,
    decision: 'keep' as const,
    target: '',
    reason: '',
    category: 'other' as const,
    includeInPrompt: false,
    promptOrder: Number.MAX_SAFE_INTEGER,
    count: entry.count,
  }))
  status.value = `已扫描 ${items.value.length} 张图片，${inventory.value.length} 个标签`
}

async function chooseReferenceImages() {
  const paths = await window.fsAPI.selectImages()
  if (paths?.length) referenceImagePaths.value = paths.slice(0, 4)
}

async function runAudit() {
  if (!window.characterAuditAPI || !items.value.length) return
  const triggers = parseWords(triggerWords.value)
  if (!triggers.length) {
    error.value = '先填触发词：规则以它为准绳，永远保留并排在 prompt 最前。'
    return
  }
  busy.value = true
  error.value = ''
  status.value = referenceImagePaths.value.length ? '第一步：文本初筛 → 第二步：对照标准图视觉复核…' : '文本初筛中…（没选标准图，不做视觉复核）'
  const response = await window.characterAuditAPI.run({
    imageIds: props.imageIds,
    triggerWords: triggers,
    otherTriggers: parseWords(otherTriggers.value),
    referenceImagePaths: referenceImagePaths.value,
    mode: mode.value,
    minimumCount: Math.max(1, Math.floor(minimumCount.value) || 1),
  })
  busy.value = false
  if (!response.success || !response.data) {
    error.value = response.error || '审计失败'
    return
  }
  const returned = response.data.decisions
  const excludedTags = new Set((response.data.excluded ?? []).map((item) => item.tag.toLowerCase()))
  excluded.value = response.data.excluded ?? []
  decisions.value = inventory.value
    .filter((entry) => !excludedTags.has(entry.tag.toLowerCase()))
    .map((entry) => {
      const found = returned.find((decision) => decision.tag.toLowerCase() === entry.tag.toLowerCase())
      return found
        ? { ...found, type: found.type ?? (found.decision === 'uncertain' ? 'unsure' : (found.decision ?? 'keep')) }
        : { tag: entry.tag, type: 'keep' as const, decision: 'keep' as const, target: '', reason: '', category: 'other' as const, includeInPrompt: false, promptOrder: Number.MAX_SAFE_INTEGER, count: entry.count }
    })
  corePrompt.value = response.data.corePrompt ?? ''
  const visual = response.data.stages?.find((stage) => stage.stage === 'visual')
  status.value = `审计完成：保留 ${summary.value.keep} · 删除 ${summary.value.delete} · 替换 ${summary.value.replace} · 不确定 ${summary.value.unsure}`
    + (excluded.value.length ? ` · ${excluded.value.length} 个低频标签未送审` : '')
    + (visual?.error ? ' · 视觉复核失败，以下为文本初筛结果' : '')
}

function onTypeChange(decision: CharacterAuditDecision) {
  decision.decision = decision.type === 'unsure' ? 'uncertain' : decision.type
  if (decision.type !== 'replace') decision.target = ''
  if (decision.type === 'delete' || decision.type === 'unsure') decision.includeInPrompt = false
}

async function copyPrompt() {
  if (!livePrompt.value) return
  try {
    await navigator.clipboard?.writeText(livePrompt.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1400)
  } catch { /* 剪贴板不可用时静默 */ }
}

async function applyAudit() {
  if (!window.characterAuditAPI || !items.value.length) return
  busy.value = true
  error.value = ''
  const response = await window.characterAuditAPI.apply({
    items: items.value,
    decisions: decisions.value,
    parentByChild: parentByChild.value,
  })
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
      <section class="audit-card" role="dialog" aria-modal="true" aria-labelledby="audit-title">
        <header>
          <div><p>CHARACTER AUDIT · character-tag-auditor</p><h2 id="audit-title">角色标签审计</h2></div>
          <button type="button" aria-label="关闭" @click="emit('close')">×</button>
        </header>

        <div class="audit-fields">
          <label>触发词 <small>永远保留，排在 prompt 最前</small>
            <input v-model="triggerWords" placeholder="例如：hatsune miku" />
          </label>
          <label>标准图 <small>有它才会做视觉复核</small>
            <button class="picker" type="button" @click="chooseReferenceImages">{{ referenceImagePaths.length ? `已选 ${referenceImagePaths.length} 张（用第一张复核）` : '选择标准图（最多 4 张）' }}</button>
          </label>
          <label>标签方法
            <span class="seg">
              <button type="button" :class="{ on: mode === 'sparse' }" @click="mode = 'sparse'">少标法</button>
              <button type="button" :class="{ on: mode === 'full' }" @click="mode = 'full'">全标法</button>
            </span>
            <small>{{ mode === 'sparse' ? '只留核心特征：颜色+单品，删掉花纹、材质、刘海等细节' : '保留全部正确细节，只删错误和矛盾的' }}</small>
          </label>
          <label>最少出现次数 <small>低于此次数的标签不送审</small>
            <input v-model.number="minimumCount" type="number" min="1" step="1" />
          </label>
          <label class="audit-fields__wide">同图里的其他角色触发词 <small>可选；多角色数据集用，防止把别人的发色算到这个角色头上</small>
            <input v-model="otherTriggers" placeholder="例如：kagamine rin, kagamine len" />
          </label>
        </div>

        <div class="audit-actions">
          <span class="audit-legend"><i class="dot dot--keep"></i>保留 <i class="dot dot--delete"></i>删除 <i class="dot dot--replace"></i>替换 <i class="dot dot--unsure"></i>不确定 <b>·</b> 灰色类目受保护，AI 不能删</span>
          <button type="button" :disabled="busy || !items.length" @click="runAudit">{{ busy ? '处理中…' : 'LLM 审计' }}</button>
          <button type="button" class="primary" :disabled="busy || !decisions.length" @click="applyAudit">应用决定</button>
        </div>

        <p v-if="status" class="audit-status">{{ status }}</p>
        <p v-if="error" class="audit-error">{{ error }}</p>

        <div v-if="decisions.length" class="audit-prompt">
          <div>
            <strong>角色核心 prompt</strong>
            <small>{{ livePrompt ? livePrompt.split(',').length : 0 }} 个标签 · 按金字塔顺序 · 改表格会同步更新</small>
          </div>
          <p>{{ livePrompt || '还没有标签被标记为"进 prompt"' }}</p>
          <button type="button" :disabled="!livePrompt" @click="copyPrompt">{{ copied ? '已复制' : '复制' }}</button>
        </div>

        <div class="audit-table">
          <div class="audit-row audit-row--head">
            <span>标签</span><span>次数</span><span>类目</span><span>决定</span><span>替换为</span><span>进 prompt</span><span>说明</span>
          </div>
          <div
            v-for="row in visibleRows"
            :key="row.decision.tag"
            class="audit-row"
            :class="`is-${row.decision.type}`"
          >
            <strong :title="row.decision.tag">{{ row.decision.tag }}</strong>
            <small>{{ row.entry?.count ?? row.decision.count ?? '' }}</small>
            <em class="cat" :class="{ 'cat--protected': PROTECTED.has(row.decision.category ?? 'other') }" :title="row.decision.category">{{ CATEGORY_LABEL[row.decision.category ?? 'other'] }}</em>
            <select v-model="row.decision.type" @change="onTypeChange(row.decision)">
              <option value="keep">保留</option>
              <option value="delete">删除</option>
              <option value="replace">替换</option>
              <option value="unsure">不确定</option>
            </select>
            <input v-model="row.decision.target" :disabled="row.decision.type !== 'replace'" placeholder="目标标签" />
            <label class="inprompt"><input v-model="row.decision.includeInPrompt" type="checkbox" :disabled="row.decision.type === 'delete' || row.decision.type === 'unsure'" /><span>{{ row.decision.includeInPrompt ? '是' : '否' }}</span></label>
            <input v-model="row.decision.reason" placeholder="可选" :title="row.decision.reason" />
          </div>
          <div v-if="!decisions.length" class="audit-empty">当前范围没有标签。请先选择已标注图片。</div>
        </div>

        <div v-if="excluded.length" class="audit-excluded">
          <button type="button" @click="showExcluded = !showExcluded">{{ showExcluded ? '收起' : '展开' }} {{ excluded.length }} 个未送审的低频标签</button>
          <p v-if="showExcluded">{{ excluded.map((item) => `${item.tag} ×${item.count}`).join('，') }}</p>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.audit-backdrop { position: fixed; inset: 0; z-index: 760; display: grid; place-items: center; padding: 20px; background: rgba(74, 45, 61, .32); backdrop-filter: blur(9px); }
.audit-card { width: min(1040px, 96vw); max-height: 92vh; display: flex; flex-direction: column; padding: 22px 24px; border: 0; border-radius: 28px; background: var(--surface-primary); color: var(--ink-primary); box-shadow: 0 30px 80px rgba(255, 126, 182, .28); }
.audit-card header { display: flex; align-items: center; justify-content: space-between; }
.audit-card header p { margin: 0 0 3px; color: var(--brand-primary); font: 10px var(--font-mono); font-weight: 800; letter-spacing: .14em; }
.audit-card h2 { margin: 0; font-size: 19px; font-weight: 900; }
.audit-card header button { width: 32px; height: 32px; border: 0; border-radius: 50%; background: var(--surface-secondary); color: var(--ink-secondary); cursor: pointer; font-size: 18px; }
.audit-fields { display: grid; grid-template-columns: 1.2fr 1fr .9fr .6fr; gap: 12px; margin-top: 16px; }
.audit-fields__wide { grid-column: 1 / -1; }
.audit-fields label { display: grid; gap: 5px; align-content: start; color: var(--ink-secondary); font-size: 12px; font-weight: 700; }
.audit-fields small { color: var(--ink-tertiary); font-size: 10.5px; font-weight: 500; }
.audit-fields input, .picker { box-sizing: border-box; width: 100%; height: 36px; padding: 0 12px; border: 1px solid var(--line-subtle); border-radius: 12px; background: var(--surface-primary); color: var(--ink-primary); outline: none; font: inherit; font-size: 12.5px; text-align: left; }
.audit-fields input:focus { border-color: var(--brand-primary); box-shadow: 0 0 0 4px var(--brand-soft); }
.picker { cursor: pointer; color: var(--ink-secondary); }
.seg { display: flex; padding: 3px; border-radius: 999px; background: var(--surface-secondary); width: fit-content; }
.seg button { height: 28px; padding: 0 12px; border: 0; border-radius: 999px; background: transparent; color: var(--ink-tertiary); font: inherit; font-size: 12px; font-weight: 800; cursor: pointer; }
.seg button.on { background: var(--brand-primary); color: var(--brand-on-primary); }
.audit-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 14px; }
.audit-legend { margin-right: auto; display: flex; align-items: center; gap: 6px; color: var(--ink-tertiary); font-size: 11px; }
.audit-legend b { color: var(--ink-quaternary); }
.dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
.dot--keep { background: var(--accent-mint); } .dot--delete { background: var(--accent-rose); } .dot--replace { background: var(--accent-lavender); } .dot--unsure { background: var(--accent-peach); }
.audit-actions button { height: 36px; padding: 0 16px; border: 0; border-radius: 999px; background: var(--surface-secondary); color: var(--ink-secondary); cursor: pointer; font: inherit; font-size: 12.5px; font-weight: 800; }
.audit-actions .primary { background: var(--brand-gradient); color: var(--brand-on-primary); box-shadow: 0 10px 22px rgba(var(--brand-primary-rgb), .3); }
.audit-actions button:disabled { opacity: .4; cursor: wait; }
.audit-status { margin: 10px 0 0; color: var(--ink-tertiary); font-size: 12px; }
.audit-error { margin: 10px 0 0; padding: 8px 12px; border-radius: 12px; background: var(--danger-bg); color: var(--danger-foreground); font-size: 12px; }
.audit-prompt { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; margin-top: 12px; padding: 12px 14px; border-radius: 18px; background: var(--brand-tint); }
.audit-prompt > div { display: flex; align-items: baseline; gap: 8px; }
.audit-prompt strong { font-size: 12.5px; font-weight: 900; }
.audit-prompt small { color: var(--ink-tertiary); font-size: 10.5px; }
.audit-prompt p { grid-column: 1; margin: 0; color: var(--ink-primary); font: 12px/1.6 var(--font-mono); user-select: text; word-break: break-word; }
.audit-prompt button { grid-row: 1 / span 2; align-self: center; height: 32px; padding: 0 14px; border: 0; border-radius: 999px; background: var(--surface-primary); color: var(--brand-hover); font: inherit; font-size: 12px; font-weight: 800; cursor: pointer; box-shadow: var(--shadow-sm); }
.audit-table { flex: 1; min-height: 160px; margin-top: 12px; overflow: auto; border-radius: 16px; background: var(--surface-secondary); }
.audit-row { display: grid; grid-template-columns: minmax(150px, 1.4fr) 52px 64px 96px minmax(120px, 1fr) 72px minmax(160px, 1.4fr); gap: 8px; align-items: center; padding: 7px 12px; border-bottom: 1px solid var(--surface-primary); }
.audit-row:last-child { border-bottom: 0; }
.audit-row--head { position: sticky; top: 0; z-index: 1; background: var(--surface-secondary); color: var(--ink-tertiary); font-size: 10.5px; font-weight: 800; letter-spacing: .04em; }
.audit-row.is-delete strong { color: var(--danger-foreground); text-decoration: line-through; }
.audit-row.is-replace strong { color: var(--accent-lavender-strong); }
.audit-row.is-unsure strong { color: var(--accent-peach-strong); }
.audit-row strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink-primary); font-size: 12px; font-weight: 700; }
.audit-row small { color: var(--ink-tertiary); font: 11px var(--font-mono); }
.cat { display: inline-block; padding: 2px 8px; border-radius: 999px; background: var(--accent-mint-soft); color: var(--accent-mint-strong); font-size: 10.5px; font-style: normal; font-weight: 800; text-align: center; white-space: nowrap; }
.cat--protected { background: var(--surface-tertiary); color: var(--ink-tertiary); }
.audit-row select, .audit-row input[type="text"], .audit-row input:not([type]) { box-sizing: border-box; width: 100%; height: 30px; padding: 0 8px; border: 1px solid transparent; border-radius: 10px; background: var(--surface-primary); color: var(--ink-primary); outline: none; font: inherit; font-size: 11.5px; }
.audit-row input:focus, .audit-row select:focus { border-color: var(--brand-primary); }
.audit-row input:disabled { opacity: .35; }
.inprompt { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--ink-secondary); cursor: pointer; }
.inprompt input { width: 15px; height: 15px; margin: 0; accent-color: var(--brand-primary); }
.inprompt input:disabled + span { opacity: .4; }
.audit-empty { grid-column: 1 / -1; padding: 30px; color: var(--ink-tertiary); text-align: center; font-size: 12px; }
.audit-excluded { margin-top: 10px; font-size: 11.5px; color: var(--ink-tertiary); }
.audit-excluded button { border: 0; background: none; color: var(--brand-hover); font: inherit; font-size: 11.5px; font-weight: 800; cursor: pointer; padding: 0; }
.audit-excluded p { margin: 6px 0 0; line-height: 1.7; }
@media (max-width: 900px) { .audit-fields { grid-template-columns: 1fr 1fr; } }
</style>
