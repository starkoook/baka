<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { useTaggerStore, type TagResult } from '@/stores/tagger'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ close: [] }>()

const taggerStore = useTaggerStore()
const appStore = useAppStore()

const fixVariants = ref(true)
const mergeChildren = ref(false)
const childThreshold = ref(30)
const busy = ref(false)
const error = ref('')
const plans = ref<TagFixPlan[]>([])
const checked = ref<Record<string, boolean>>({})
const scanned = ref(false)

const selectedPlans = computed(() => plans.value.filter((plan) => checked.value[plan.path] !== false))
const totalRemovals = computed(() => selectedPlans.value.reduce((sum, plan) => sum + plan.remove.length, 0))
const totalAdds = computed(() => selectedPlans.value.reduce((sum, plan) => sum + plan.add.length, 0))

function fileName(path: string) {
  return path.split(/[\\/]/).pop() || path
}

async function scan() {
  if (!window.characterAuditAPI?.planFixes) {
    error.value = '当前环境不支持修复扫描'
    return
  }
  busy.value = true
  error.value = ''
  try {
    const res = await window.characterAuditAPI.planFixes({
      items: taggerStore.queue.map((item) => ({ path: item.path, tags: item.tags.map((tag) => tag.tag) })),
      fixCharacterVariants: fixVariants.value,
      childThreshold: fixVariants.value && mergeChildren.value ? Math.max(1, Math.floor(childThreshold.value) || 1) : 0,
    })
    if (!res.success || !res.data) {
      error.value = res.error || '扫描失败'
      return
    }
    plans.value = res.data.plans
    checked.value = Object.fromEntries(plans.value.map((plan) => [plan.path, true]))
    scanned.value = true
  } finally {
    busy.value = false
  }
}

function apply() {
  let changed = 0
  for (const plan of selectedPlans.value) {
    const index = taggerStore.queue.findIndex((item) => item.path === plan.path)
    if (index < 0) continue
    const item = taggerStore.queue[index]
    const removeKeys = new Set(plan.remove.map((entry) => entry.tag.trim().toLowerCase().replace(/\s+/g, '_')))
    let tags: TagResult[] = item.tags.filter((tag) => !removeKeys.has(tag.tag.trim().toLowerCase().replace(/\s+/g, '_')))
    for (const entry of plan.add) {
      if (!tags.some((tag) => tag.tag.trim().toLowerCase().replace(/\s+/g, '_') === entry.tag.trim().toLowerCase().replace(/\s+/g, '_'))) {
        tags = [...tags, { tag: entry.tag, confidence: 1, source: 'manual', category: '角色' }]
      }
    }
    if (tags.length === item.tags.length && tags.every((tag, i) => tag.tag === item.tags[i].tag)) continue
    item.tags = tags
    if (item.status === 'reviewed') item.status = 'ready'
    changed++
  }
  taggerStore.persistSession()
  appStore.setStatus(changed ? `错误标签修复：改了 ${changed} 张（未写盘，可在编辑卡里撤销 / 用"全部标签"面板保存全部）` : '没有需要改的图片')
  emit('close')
}

watch(() => props.visible, (visible) => { if (visible) { plans.value = []; scanned.value = false; void scan() } })
watch([fixVariants, mergeChildren, childThreshold], () => { if (props.visible && scanned.value) void scan() })
onMounted(() => { if (props.visible) void scan() })
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="fix-backdrop" @click.self="emit('close')">
      <section class="fix-card" role="dialog" aria-modal="true" aria-labelledby="fix-title">
        <header>
          <div><p>TAG FIXES</p><h2 id="fix-title">错误标签修复</h2></div>
          <button type="button" aria-label="关闭" @click="emit('close')">×</button>
        </header>

        <div class="fix-options">
          <label class="check"><input v-model="fixVariants" type="checkbox" /><span>角色父子 / 变体重复：同图多个同家族标签时，按全库出现量投票保留胜者</span></label>
          <label class="check" :class="{ off: !fixVariants }"><input v-model="mergeChildren" type="checkbox" :disabled="!fixVariants" /><span>子级并入父级：子级变体全库少于 <input v-model.number="childThreshold" type="number" min="1" :disabled="!fixVariants || !mergeChildren" @click.stop /> 次时并入父级</span></label>
          <p>人数冲突（1girl 与 2girls 并存删低留高、多人图清 solo，`solo focus` 永不误伤）总是处理。应用为普通编辑，不自动写盘。</p>
        </div>

        <p v-if="error" class="fix-error">{{ error }}</p>
        <p v-else-if="busy" class="fix-status">扫描 {{ taggerStore.queue.length }} 张中…</p>
        <p v-else-if="scanned" class="fix-status">{{ plans.length ? `${plans.length} 张需要修复 · 勾选了 ${selectedPlans.length} 张 · 移除 ${totalRemovals} · 新增 ${totalAdds}` : '没有发现矛盾标签' }}</p>

        <div class="fix-table">
          <div class="fix-row fix-row--head"><span></span><span>图片</span><span>移除</span><span>保留 / 新增</span><span>原因</span></div>
          <div v-for="plan in plans" :key="plan.path" class="fix-row" :class="{ off: checked[plan.path] === false }">
            <input v-model="checked[plan.path]" type="checkbox" />
            <strong :title="plan.path">{{ fileName(plan.path) }}</strong>
            <span class="chips"><i v-for="entry in plan.remove" :key="entry.tag" class="chip chip--remove">{{ entry.tag }}</i></span>
            <span class="chips"><i v-for="entry in plan.add" :key="entry.tag" class="chip chip--add">+ {{ entry.tag }}</i><i v-if="!plan.add.length" class="muted">—</i></span>
            <small>{{ [...plan.remove, ...plan.add].map((entry) => entry.reason).filter((reason, index, all) => all.indexOf(reason) === index).join('；') }}</small>
          </div>
        </div>

        <footer>
          <button type="button" :disabled="busy" @click="scan">重新扫描</button>
          <button type="button" class="primary" :disabled="busy || !selectedPlans.length" @click="apply">应用到 {{ selectedPlans.length }} 张</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.fix-backdrop { position: fixed; inset: 0; z-index: 760; display: grid; place-items: center; padding: 20px; background: rgba(74, 45, 61, .32); backdrop-filter: blur(9px); }
.fix-card { width: min(920px, 96vw); max-height: 90vh; display: flex; flex-direction: column; padding: 22px 24px; border-radius: 28px; background: var(--surface-primary); color: var(--ink-primary); box-shadow: 0 30px 80px rgba(255, 126, 182, .28); }
.fix-card header { display: flex; align-items: center; justify-content: space-between; }
.fix-card header p { margin: 0 0 3px; color: var(--brand-primary); font: 10px var(--font-mono); font-weight: 800; letter-spacing: .14em; }
.fix-card h2 { margin: 0; font-size: 19px; font-weight: 900; }
.fix-card header button { width: 32px; height: 32px; border: 0; border-radius: 50%; background: var(--surface-secondary); color: var(--ink-secondary); cursor: pointer; font-size: 18px; }
.fix-options { display: grid; gap: 6px; margin-top: 14px; padding: 12px 14px; border-radius: 18px; background: var(--surface-secondary); font-size: 12px; }
.fix-options .check { display: flex; align-items: center; gap: 8px; color: var(--ink-primary); font-weight: 700; }
.fix-options .check.off { opacity: .5; }
.fix-options .check input[type="checkbox"] { width: 15px; height: 15px; margin: 0; accent-color: var(--brand-primary); }
.fix-options .check input[type="number"] { width: 56px; height: 24px; margin: 0 2px; padding: 0 6px; border: 1px solid var(--line-subtle); border-radius: 8px; background: var(--surface-primary); color: var(--ink-primary); font: inherit; font-size: 11.5px; text-align: center; }
.fix-options p { margin: 2px 0 0; color: var(--ink-tertiary); font-size: 11px; line-height: 1.6; }
.fix-status, .fix-error { margin: 10px 0 0; font-size: 12px; color: var(--ink-tertiary); }
.fix-error { padding: 8px 12px; border-radius: 12px; background: var(--danger-bg); color: var(--danger-foreground); }
.fix-table { flex: 1; min-height: 140px; margin-top: 10px; overflow: auto; border-radius: 16px; background: var(--surface-secondary); }
.fix-row { display: grid; grid-template-columns: 24px minmax(120px, 1fr) minmax(140px, 1.2fr) minmax(120px, 1fr) minmax(160px, 1.6fr); gap: 10px; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--surface-primary); }
.fix-row:last-child { border-bottom: 0; }
.fix-row.off { opacity: .45; }
.fix-row--head { position: sticky; top: 0; z-index: 1; background: var(--surface-secondary); color: var(--ink-tertiary); font-size: 10.5px; font-weight: 800; letter-spacing: .04em; }
.fix-row input { width: 15px; height: 15px; margin: 0; accent-color: var(--brand-primary); }
.fix-row strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 700; }
.fix-row small { color: var(--ink-tertiary); font-size: 11px; line-height: 1.5; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; }
.chip { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-style: normal; font-weight: 700; }
.chip--remove { background: var(--danger-bg); color: var(--danger-foreground); text-decoration: line-through; }
.chip--add { background: var(--accent-mint-soft); color: var(--accent-mint-strong); }
.muted { color: var(--ink-quaternary); font-style: normal; }
.fix-card footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
.fix-card footer button { height: 36px; padding: 0 16px; border: 0; border-radius: 999px; background: var(--surface-secondary); color: var(--ink-secondary); cursor: pointer; font: inherit; font-size: 12.5px; font-weight: 800; }
.fix-card footer .primary { background: var(--brand-gradient); color: var(--brand-on-primary); box-shadow: 0 10px 22px rgba(var(--brand-primary-rgb), .3); }
.fix-card footer button:disabled { opacity: .4; cursor: not-allowed; }
</style>
