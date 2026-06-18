<script setup lang="ts">
import { ref, computed, watch } from 'vue'

interface ModalImage { id: number; path: string; filename: string; width: number; height: number; file_size: number; file_modified_at: string }

const props = defineProps<{
  visible: boolean
  image: ModalImage | null
  images: ModalImage[]
  imageIndex: number
  meta: SDMetadata | null
  tags: { tag: string; confidence?: number; source?: string }[]
  fullSrc: string
  thumbSrc: string
}>()

const emit = defineEmits<{
  close: []; prev: []; next: []
  saveTags: [imageId: number, tags: { tag: string; confidence?: number; source?: string }[]]
  tagCurrent: [imageId: number]
}>()

const editingTagIdx = ref(-1)
const editTagText = ref('')
const addingTag = ref(false)
const newTagText = ref('')
const localTags = ref<{ tag: string; confidence?: number; source?: string }[]>([])
const promptCopied = ref(false)
const negCopied = ref(false)

watch(() => props.tags, v => { localTags.value = [...(v || [])] }, { immediate: true })
watch(() => props.visible, v => { if (!v) { editingTagIdx.value = -1; addingTag.value = false } })

function startEdit(idx: number) { editingTagIdx.value = idx; editTagText.value = localTags.value[idx]?.tag || '' }
function saveEdit() {
  if (editingTagIdx.value < 0) return
  const text = editTagText.value.trim()
  if (text) { localTags.value[editingTagIdx.value] = { ...localTags.value[editingTagIdx.value], tag: text }; save() }
  editingTagIdx.value = -1
}
function deleteTag(idx: number) { localTags.value.splice(idx, 1); save() }
function startAdd() { addingTag.value = true; newTagText.value = '' }
function confirmAdd() {
  const text = newTagText.value.trim()
  if (text) { localTags.value.push({ tag: text, confidence: 0.9, source: 'manual' }); save() }
  addingTag.value = false
}
async function save() { if (props.image) emit('saveTags', props.image.id, localTags.value) }

function copyPrompt() { if (props.meta?.prompt) { navigator.clipboard.writeText(props.meta.prompt); promptCopied.value = true; setTimeout(() => promptCopied.value = false, 1500) } }
function copyNegative() { if (props.meta?.negative) { navigator.clipboard.writeText(props.meta.negative); negCopied.value = true; setTimeout(() => negCopied.value = false, 1500) } }
function copySeed() { if (props.meta?.seed) navigator.clipboard.writeText(String(props.meta.seed)) }

const canPrev = computed(() => props.imageIndex > 0)
const canNext = computed(() => props.imageIndex < props.images.length - 1)

function fmtSize(b: number) {
  if (b < 1024) return `${b} B`; if (b < 1048576) return `${(b/1024).toFixed(1)} KB`; return `${(b/1048576).toFixed(1)} MB`
}
function fmtDate(iso: string) { if (!iso) return ''; try { return new Date(iso).toLocaleDateString('zh-CN') } catch { return iso } }
</script>

<template>
  <Teleport to="body">
    <div v-if="visible && image" class="mo" @click.self="emit('close')">
      <div class="mo-box">
        <!-- Preview -->
        <div class="mo-pv">
          <button class="mo-nav l" :disabled="!canPrev" @click="emit('prev')">‹</button>
          <div class="mo-img">
            <img v-if="fullSrc || thumbSrc" :src="fullSrc || thumbSrc" />
          </div>
          <button class="mo-nav r" :disabled="!canNext" @click="emit('next')">›</button>
        </div>

        <!-- Sidebar -->
        <div class="mo-sb">
          <!-- Header -->
          <div class="mo-hd">
            <div>
              <div class="mo-fn">{{ image.filename }}</div>
              <div class="mo-dims">{{ image.width }} × {{ image.height }} · {{ fmtSize(image.file_size) }} · {{ fmtDate(image.file_modified_at) }}</div>
            </div>
            <button class="mo-x" @click="emit('close')">✕</button>
          </div>

          <div class="mo-scroll">
            <!-- ═══ TAG THIS IMAGE ═══ -->
            <button class="mo-tag-btn" @click="emit('tagCurrent', image!.id)">
              <span>🔮</span> 标注此图
            </button>

            <!-- ═══ TAGS ═══ -->
            <div class="mo-sec">
              <div class="mo-sec-hd">
                <span>🏷 AI 标签</span>
                <span class="mo-sec-count">{{ localTags.length }}</span>
                <button class="mo-add-btn" @click="startAdd">＋</button>
              </div>
              <div class="mo-sec-hint">机器自动识别的标签，双击编辑</div>
              <div class="mo-tags">
                <span v-for="(t, i) in localTags" :key="i" class="mo-tag" @dblclick="startEdit(i)">
                  <template v-if="editingTagIdx === i">
                    <input v-model="editTagText" class="mo-tag-inp" @keydown.enter="saveEdit" @keydown.escape="editingTagIdx = -1" @blur="saveEdit" autofocus />
                  </template>
                  <template v-else>
                    <span class="mo-tag-name">{{ t.tag }}</span>
                    <span v-if="t.confidence" class="mo-tag-pct">{{ (t.confidence * 100).toFixed(0) }}%</span>
                    <button class="mo-tag-x" @click.stop="deleteTag(i)">×</button>
                  </template>
                </span>
                <span v-if="addingTag" class="mo-tag">
                  <input v-model="newTagText" class="mo-tag-inp" placeholder="标签名..." @keydown.enter="confirmAdd" @keydown.escape="addingTag = false" @blur="confirmAdd" autofocus />
                </span>
                <span v-if="localTags.length === 0 && !addingTag" class="mo-empty">暂无标签</span>
              </div>
            </div>

            <!-- ═══ SD PROMPT ═══ -->
            <div class="mo-sec" v-if="meta?.hasMetadata">
              <div class="mo-sec-hd">
                <span>✨ 生成提示词</span>
                <span class="mo-sec-badge">{{ meta.generator || 'SD' }}</span>
              </div>
              <div class="mo-sec-hint">Stable Diffusion 原始生成参数</div>

              <!-- Params -->
              <div class="mo-params">
                <div class="mo-param"><span>STEPS</span><b>{{ meta.steps || '-' }}</b></div>
                <div class="mo-param"><span>CFG</span><b class="pink">{{ meta.cfg || '-' }}</b></div>
                <div class="mo-param w2"><span>SAMPLER</span><b>{{ meta.sampler || '-' }}</b></div>
                <div class="mo-param w2"><span>SEED</span><b class="mono" @click="copySeed" style="cursor:pointer">{{ meta.seed || '-' }}</b></div>
              </div>

              <!-- Model cards -->
              <div class="mo-models" v-if="meta.model">
                <div class="mo-mcard main">
                  <div class="mo-mcard-icon">{{ meta.modelType === 'checkpoint' ? '🧩' : '🔧' }}</div>
                  <div class="mo-mcard-body">
                    <div class="mo-mcard-label">{{ meta.modelType === 'checkpoint' ? 'Checkpoint' : 'UNET' }}</div>
                    <div class="mo-mcard-name">{{ meta.model }}</div>
                  </div>
                  <span class="mo-mcard-badge" v-if="meta.modelType === 'checkpoint'">一体</span>
                </div>
                <div class="mo-mcard" v-if="meta.clip && meta.clip !== '内置'">
                  <div class="mo-mcard-icon">📝</div>
                  <div class="mo-mcard-body">
                    <div class="mo-mcard-label">CLIP</div>
                    <div class="mo-mcard-name">{{ meta.clip }}</div>
                  </div>
                </div>
                <div class="mo-mcard" v-if="meta.vae && meta.vae !== '内置'">
                  <div class="mo-mcard-icon">🖼</div>
                  <div class="mo-mcard-body">
                    <div class="mo-mcard-label">VAE</div>
                    <div class="mo-mcard-name">{{ meta.vae }}</div>
                  </div>
                </div>
              </div>

              <!-- Positive -->
              <div class="mo-prompt pos" v-if="meta.prompt">
                <div class="mo-prompt-hd">
                  <span>POSITIVE</span>
                  <button class="mo-copy" @click="copyPrompt">{{ promptCopied ? '✓ 已复制' : '📋 复制' }}</button>
                </div>
                <div class="mo-prompt-text">{{ meta.prompt }}</div>
              </div>

              <!-- Negative -->
              <div class="mo-prompt neg" v-if="meta.negative">
                <div class="mo-prompt-hd">
                  <span>NEGATIVE</span>
                  <button class="mo-copy" @click="copyNegative">{{ negCopied ? '✓ 已复制' : '📋 复制' }}</button>
                </div>
                <div class="mo-prompt-text">{{ meta.negative }}</div>
              </div>

              <!-- LoRA -->
              <div class="mo-loras" v-if="meta.loras?.length">
                <span class="mo-lora-label">⚡ LoRA</span>
                <span v-for="(l, i) in meta.loras" :key="i" class="mo-lora">{{ l.name }} <em>{{ l.weight }}</em></span>
              </div>
            </div>

            <!-- No metadata -->
            <div class="mo-sec mo-none" v-if="!meta?.hasMetadata">
              <div class="mo-no-icon">📄</div>
              <div>此图片不含 SD 元数据</div>
            </div>
          </div>

          <!-- Footer -->
          <div class="mo-ft">
            <code>{{ image.path }}</code>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.mo { position: fixed; inset: 0; background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 14px; box-sizing: border-box; }
.mo-box { display: flex; width: 100%; max-width: 1500px; height: calc(100vh - 28px); background: rgba(22,22,24,0.5); border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.12); box-shadow: 0 32px 80px rgba(0,0,0,0.4); }

/* Preview */
.mo-pv { flex: 1; position: relative; background: transparent; }
.mo-img { position: absolute; inset: 12px; display: flex; align-items: center; justify-content: center; }
.mo-img img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 8px; }
.mo-nav { position: absolute; top: 50%; transform: translateY(-50%); width: 38px; height: 38px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.06); background: rgba(20,20,22,0.7); color: #d1d5db; font-size: 22px; cursor: pointer; z-index: 5; display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
.mo-nav:hover:not(:disabled) { background: #ff69b4; border-color: #ff69b4; color: #fff; }
.mo-nav:disabled { opacity: 0.08; cursor: not-allowed; }
.l { left: 12px; } .r { right: 12px; }

/* Sidebar */
.mo-sb { width: 360px; flex-shrink: 0; display: flex; flex-direction: column; background: rgba(20,20,22,0.45); border-left: 1px solid rgba(255,255,255,0.1); }
.mo-hd { padding: 18px 20px; display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid rgba(255,255,255,0.06); background: rgba(20,20,22,0.4); }
.mo-fn { font-size: 14px; font-weight: 600; color: #f3f4f6; word-break: break-all; line-height: 1.3; margin-bottom: 4px; }
.mo-dims { font-size: 11px; color: #6b7280; font-family: monospace; }
.mo-x { background: none; border: none; color: #4b5563; font-size: 16px; cursor: pointer; padding: 2px 6px; }
.mo-x:hover { color: #ef4444; }

.mo-scroll { flex: 1; overflow-y: auto; padding: 14px 20px; }
.mo-scroll::-webkit-scrollbar { width: 3px; }
.mo-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.06); border-radius: 2px; }

/* Tag button */
.mo-tag-btn { width: 100%; padding: 12px; background: linear-gradient(135deg, #ff69b4, #ff85c2); border: none; border-radius: 10px; color: #fff; font-size: 14px; font-weight: 700; cursor: pointer; margin-bottom: 18px; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 3px 14px rgba(255,105,180,0.25); transition: all 0.2s; }
.mo-tag-btn:hover { filter: brightness(1.08); transform: translateY(-1px); box-shadow: 0 6px 20px rgba(255,105,180,0.35); }

/* Section */
.mo-sec { margin-bottom: 18px; }
.mo-sec-hd { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; color: #e5e7eb; margin-bottom: 2px; }
.mo-sec-count { font-size: 10px; color: #ff69b4; background: rgba(255,105,180,0.1); padding: 1px 7px; border-radius: 10px; font-weight: 600; }
.mo-sec-badge { font-size: 9px; color: #ff69b4; background: rgba(255,105,180,0.08); padding: 2px 8px; border-radius: 8px; font-weight: 500; }
.mo-sec-hint { font-size: 10px; color: #4b5563; margin-bottom: 10px; }
.mo-add-btn { background: none; border: 1px solid rgba(255,105,180,0.15); color: #ff69b4; font-size: 12px; padding: 0 8px; border-radius: 6px; cursor: pointer; margin-left: auto; }
.mo-add-btn:hover { background: rgba(255,105,180,0.1); }

/* Tags */
.mo-tags { display: flex; flex-wrap: wrap; gap: 5px; }
.mo-tag { display: flex; align-items: center; gap: 4px; padding: 5px 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; font-size: 11px; color: #d1d5db; cursor: pointer; transition: all 0.15s; }
.mo-tag:hover { background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.1); }
.mo-tag-pct { font-size: 9px; color: #22c55e; font-family: monospace; }
.mo-tag-x { background: none; border: none; color: #6b7280; font-size: 13px; cursor: pointer; padding: 0 2px; line-height: 1; }
.mo-tag-x:hover { color: #ef4444; }
.mo-tag-inp { background: transparent; border: none; color: #ff69b4; font-size: 11px; outline: none; width: 80px; }
.mo-empty { font-size: 11px; color: #4b5563; padding: 8px 0; }

/* Params */
.mo-params { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 10px; }
.mo-param { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.03); border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; gap: 2px; }
.mo-param.w2 { grid-column: span 2; }
.mo-param span { font-size: 8px; font-weight: 700; color: #6b7280; letter-spacing: 0.05em; }
.mo-param b { font-size: 13px; color: #e5e7eb; font-weight: 600; }
.mo-param b.pink { color: #ff69b4; }
.mo-param b.mono { font-family: monospace; font-size: 12px; color: #9ca3af; }

/* Model cards */
.mo-models { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.mo-mcard {
  display: flex; align-items: center; gap: 10px;
  background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04);
  border-radius: 10px; padding: 10px 12px;
  transition: all 0.2s;
}
.mo-mcard:hover { border-color: rgba(255,255,255,0.08); background: rgba(255,255,255,0.04); }
.mo-mcard.main { border-color: rgba(255,105,180,0.12); background: rgba(255,105,180,0.03); }
.mo-mcard.main:hover { border-color: rgba(255,105,180,0.25); background: rgba(255,105,180,0.06); }
.mo-mcard-icon { font-size: 22px; flex-shrink: 0; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.03); border-radius: 8px; }
.mo-mcard-body { flex: 1; min-width: 0; }
.mo-mcard-label { font-size: 9px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 2px; }
.mo-mcard-name { font-size: 12px; color: #e5e7eb; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mo-mcard.main .mo-mcard-name { color: #ff85c2; }
.mo-mcard-badge { font-size: 9px; padding: 2px 8px; background: rgba(255,105,180,0.15); color: #ff69b4; border-radius: 10px; font-weight: 600; flex-shrink: 0; }

/* Prompt boxes */
.mo-prompt { border-radius: 10px; padding: 12px; margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.04); }
.mo-prompt.pos { background: rgba(255,105,180,0.04); border-left: 3px solid #ff69b4; }
.mo-prompt.neg { background: rgba(239,68,68,0.04); border-left: 3px solid #ef4444; }
.mo-prompt-hd { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; }
.mo-prompt.pos .mo-prompt-hd { color: #ff69b4; }
.mo-prompt.neg .mo-prompt-hd { color: #ef4444; }
.mo-copy { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); color: #9ca3af; font-size: 10px; padding: 3px 10px; border-radius: 5px; cursor: pointer; }
.mo-copy:hover { background: rgba(255,255,255,0.08); color: #e5e7eb; }
.mo-prompt-text { font-size: 12px; line-height: 1.55; color: #9ca3af; max-height: 120px; overflow-y: auto; word-break: break-all; white-space: pre-wrap; }

/* LoRA */
.mo-loras { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 4px; }
.mo-lora-label { font-size: 9px; font-weight: 700; color: #4b5563; }
.mo-lora { font-size: 9px; background: rgba(255,105,180,0.06); border: 1px solid rgba(255,105,180,0.1); border-radius: 4px; padding: 2px 6px; color: #ff69b4; }
.mo-lora em { color: #9ca3af; font-style: normal; margin-left: 3px; }

/* No meta */
.mo-none { text-align: center; padding: 30px 0; color: #4b5563; font-size: 12px; }
.mo-no-icon { font-size: 28px; margin-bottom: 8px; opacity: 0.4; }

/* Footer */
.mo-ft { padding: 12px 20px; border-top: 1px solid rgba(255,255,255,0.04); background: rgba(20,20,22,0.4); }
.mo-ft code { font-size: 9px; color: #374151; font-family: monospace; word-break: break-all; }
</style>
