<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { useLogStore } from '@/stores/logs'

const appStore = useAppStore()
const logStore = useLogStore()

interface Item {
  name: string; path: string; txtPath: string | null
  caption: string; hasCaption: boolean; thumb?: string
}

const folderPath = ref('')
const items = ref<Item[]>([])
const selectedIdx = ref<number | null>(null)
const editCaption = ref('')
const saving = ref(false)
const searchTag = ref('')
const loadingThumbs = ref(0)

// Batch
const batchAddTag = ref('')
const batchRemoveTag = ref('')
const batchFind = ref('')
const batchReplace = ref('')

// ── Filtered items ──
const filteredItems = computed(() => {
  const q = searchTag.value.trim().toLowerCase()
  if (!q) return items.value
  return items.value.filter((i) => i.caption.toLowerCase().includes(q))
})

// ── Tag statistics ──
const tagStats = computed(() => {
  const map = new Map<string, number>()
  for (const item of items.value) {
    if (!item.caption) continue
    item.caption.split(/[,，\n]/).forEach((t) => {
      const tag = t.trim(); if (tag) map.set(tag, (map.get(tag) || 0) + 1)
    })
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1])
})

// ── Top tags ──
const topTags = computed(() => tagStats.value.slice(0, 30))

// ── Select folder ──
async function selectFolder() {
  if (!window.fsAPI) return
  const folder = await window.fsAPI.selectFolder()
  if (!folder) return
  folderPath.value = folder
  const list = await window.fsAPI.listDataset(folder)
  items.value = list; selectedIdx.value = null
  appStore.setStatus(`已加载 ${list.length} 张图片`)
  logStore.info(`数据集: ${list.length} 张, ${list.filter((i) => i.hasCaption).length} 个标注, ${tagStats.value.length} 种标签`)
  // Load thumbs in background
  loadThumbsBatch(0)
}

async function loadThumbsBatch(start: number) {
  const batch = items.value.slice(start, start + 8)
  for (const item of batch) {
    if (item.thumb) continue
    try {
      loadingThumbs.value++
      const res = await window.fsAPI.readThumb(item.path)
      if (res.success) item.thumb = 'data:image/jpeg;base64,' + res.base64
    } catch (_) {}
    loadingThumbs.value--
  }
  if (start + 8 < items.value.length) {
    setTimeout(() => loadThumbsBatch(start + 8), 100)
  }
}

// ── Edit ──
function selectItem(idx: number) {
  selectedIdx.value = idx
  editCaption.value = items.value[idx].caption || ''
}

async function saveCaption() {
  if (selectedIdx.value === null) return
  const item = items.value[selectedIdx.value]
  if (!item.txtPath) {
    const base = item.name.replace(/\.[^.]+$/, '')
    item.txtPath = item.path.replace(item.name, base + '.txt')
  }
  saving.value = true
  const res = await window.fsAPI.saveCaption({ txtPath: item.txtPath, caption: editCaption.value })
  if (res.success) { item.caption = editCaption.value; item.hasCaption = !!editCaption.value.trim() }
  saving.value = false
}

// ── Batch operations ──
async function batchAddTagFn(tag: string) {
  if (!tag) return; let count = 0
  for (const item of items.value) {
    if (!item.caption?.includes(tag)) {
      item.caption = item.caption ? item.caption + ', ' + tag : tag
      item.hasCaption = true
      if (!item.txtPath) { const base = item.name.replace(/\.[^.]+$/, ''); item.txtPath = item.path.replace(item.name, base + '.txt') }
      await window.fsAPI.saveCaption({ txtPath: item.txtPath!, caption: item.caption }); count++
    }
  }
  logStore.success(`已添加 "${tag}" → ${count} 个文件`)
}
async function batchRemoveTagFn(tag: string) {
  if (!tag) return; let count = 0
  for (const item of items.value) {
    if (!item.caption) continue
    const tags = item.caption.split(/[,，\n]/).map((t) => t.trim())
    if (tags.includes(tag)) {
      item.caption = tags.filter((t) => t !== tag).join(', ')
      await window.fsAPI.saveCaption({ txtPath: item.txtPath!, caption: item.caption }); count++
    }
  }
  logStore.success(`已移除 "${tag}" → ${count} 个文件`)
}
async function batchReplaceFn() {
  const f = batchFind.value.trim(); const r = batchReplace.value.trim()
  if (!f) return; let count = 0
  for (const item of items.value) {
    if (!item.caption?.includes(f)) continue
    item.caption = item.caption.split(f).join(r)
    await window.fsAPI.saveCaption({ txtPath: item.txtPath!, caption: item.caption }); count++
  }
  logStore.success(`替换 "${f}" → "${r}" 在 ${count} 个文件`)
  batchFind.value = ''; batchReplace.value = ''
}

function quickAdd(t: string) { batchAddTagFn(t) }
function quickRemove(t: string) { batchRemoveTagFn(t) }
</script>

<template>
  <div class="dataset-page">
    <div class="page-header">
      <h1 class="page-title">训练集处理</h1>
      <p class="page-desc">管理数据集标注 · 批量编辑标签 · 统计分析</p>
    </div>

    <!-- Top bar -->
    <div class="top-bar glass-panel">
      <button class="folder-btn" @click="selectFolder">
        <span v-if="!folderPath">📂 选择训练集目录</span>
        <span v-else>📂 更换目录</span>
      </button>
      <template v-if="folderPath">
        <span class="info-path">{{ folderPath }}</span>
        <span class="info-stats">{{ items.length }} 图 · {{ items.filter(i => i.hasCaption).length }} 标 · {{ tagStats.length }} 标签</span>
      </template>
      <input class="search-input" v-if="folderPath" v-model="searchTag" placeholder="🔍 搜索标签..." />
    </div>

    <template v-if="!folderPath">
      <div class="empty-hero">
        <div class="empty-icon">📁</div>
        <p>选择包含图片和 .txt 标注文件的训练集目录</p>
      </div>
    </template>

    <template v-else>
      <div class="dataset-body">
        <!-- Left: Image grid -->
        <div class="image-grid-panel">
          <div class="image-grid">
            <div
              v-for="(item, idx) in filteredItems" :key="item.path"
              class="image-card"
              :class="{ active: selectedIdx === idx, nocap: !item.hasCaption }"
              @click="selectItem(idx)"
            >
              <div class="card-img">
                <img v-if="item.thumb" :src="item.thumb" />
                <div v-else class="thumb-placeholder">🖼</div>
              </div>
              <div class="card-name">{{ item.name }}</div>
              <div class="card-tags" v-if="item.caption">
                <span v-for="(t, ti) in item.caption.split(/[,，]/).slice(0, 6)" :key="ti" class="tag-chip">{{ t.trim() }}</span>
                <span v-if="item.caption.split(/[,，]/).length > 6" class="tag-more">+{{ item.caption.split(/[,，]/).length - 6 }}</span>
              </div>
              <div class="card-status">{{ item.hasCaption ? '📝' : '未标注' }}</div>
            </div>
          </div>
        </div>

        <!-- Right: Editor + Stats -->
        <div class="right-panel">
          <!-- Editor -->
          <div class="panel glass-panel editor-panel" v-if="selectedIdx !== null">
            <div class="editor-header">
              <span class="editor-name">{{ items[selectedIdx]?.name }}</span>
              <span class="editor-count">{{ editCaption.split(/[,，]/).filter(t => t.trim()).length }} 个标签</span>
            </div>
            <textarea class="edit-area" v-model="editCaption" rows="8" placeholder="输入标签，逗号分隔..."></textarea>
            <div class="editor-bottom">
              <button class="save-btn" @click="saveCaption" :disabled="saving">💾 保存</button>
              <button class="close-btn" @click="selectedIdx = null">✕</button>
            </div>
          </div>
          <div class="panel glass-panel editor-panel dim-panel" v-else>
            <p>👆 点击左侧图片开始编辑</p>
          </div>

          <!-- Tag cloud -->
          <div class="panel glass-panel stats-panel">
            <h3 class="panel-title">热门标签</h3>
            <div class="tag-cloud" v-if="topTags.length > 0">
              <div v-for="[tag, count] in topTags" :key="tag" class="cloud-item">
                <span class="cloud-tag" @click="searchTag = tag">{{ tag }}</span>
                <span class="cloud-count">{{ count }}</span>
                <span class="cloud-acts">
                  <button @click="quickAdd(tag)" title="全部添加">+</button>
                  <button @click="quickRemove(tag)" title="全部删除">−</button>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Batch bar -->
      <div class="batch-bar glass-panel">
        <div class="batch-group">
          <input class="batch-input" v-model="batchAddTag" placeholder="添加标签..." @keyup.enter="batchAddTagFn(batchAddTag)" />
          <button class="batch-btn" @click="batchAddTagFn(batchAddTag)">➕ 全部添加</button>
        </div>
        <div class="batch-group">
          <input class="batch-input" v-model="batchRemoveTag" placeholder="删除标签..." @keyup.enter="batchRemoveTagFn(batchRemoveTag)" />
          <button class="batch-btn danger" @click="batchRemoveTagFn(batchRemoveTag)">➖ 全部删除</button>
        </div>
        <div class="batch-group">
          <input class="batch-input" v-model="batchFind" placeholder="查找..." />
          <input class="batch-input" v-model="batchReplace" placeholder="替换为..." />
          <button class="batch-btn" @click="batchReplaceFn">🔄 替换</button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.dataset-page { max-width: 1200px; margin: 0 auto; }
.page-header { margin-bottom: 20px; }
.page-title { font-size: 24px; font-weight: 700; color: var(--text-primary); }
.page-desc { font-size: 13px; color: var(--text-tertiary); margin-top: 4px; }

/* ── Top bar ── */
.top-bar { display: flex; align-items: center; gap: 12px; padding: 10px 16px; margin-bottom: 14px; }
.folder-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 16px; border: none; border-radius: var(--radius-full);
  background: var(--gradient-accent); color: #fff; font-size: 13px; font-weight: 600;
  font-family: var(--font-sans); cursor: pointer; white-space: nowrap;
  transition: all 0.2s; flex-shrink: 0;
}
.folder-btn:hover { transform: scale(1.03); }
.info-path { flex: 1; font-size: 12px; color: var(--accent-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.info-stats { font-size: 11px; color: var(--text-tertiary); white-space: nowrap; }
.search-input {
  width: 180px; padding: 7px 12px; border-radius: var(--radius-full);
  border: 1px solid var(--glass-border); background: var(--glass-bg);
  color: var(--text-primary); font-size: 12px; font-family: var(--font-sans);
}
.search-input:focus { outline: none; border-color: var(--border-accent); }

/* ── Empty hero ── */
.empty-hero { display: flex; flex-direction: column; align-items: center; padding: 80px 20px; color: var(--text-tertiary); }
.empty-icon { font-size: 48px; margin-bottom: 16px; opacity: 0.4; }
.empty-hero p { font-size: 14px; }

/* ── Dataset body ── */
.dataset-body { display: grid; grid-template-columns: 1fr 320px; gap: 14px; margin-bottom: 14px; }

/* ── Image grid ── */
.image-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
.image-card {
  background: var(--glass-bg); border: 1px solid var(--glass-border);
  border-radius: var(--radius-md); overflow: hidden;
  cursor: pointer; transition: all 0.2s;
  position: relative;
}
.image-card:hover { border-color: var(--border-accent); transform: translateY(-2px); box-shadow: var(--shadow-glow); }
.image-card.active { border-color: var(--border-accent); background: var(--accent-bg); box-shadow: var(--shadow-glow); }
.image-card.nocap { opacity: 0.6; }

.card-img { width: 100%; aspect-ratio: 1; overflow: hidden; background: rgba(0,0,0,0.2); display: flex; align-items: center; justify-content: center; }
.card-img img { width: 100%; height: 100%; object-fit: cover; }
.thumb-placeholder { font-size: 32px; opacity: 0.3; }

.card-name { padding: 6px 10px 0; font-size: 11px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card-tags { padding: 4px 10px 8px; display: flex; flex-wrap: wrap; gap: 3px; }
.tag-chip {
  font-size: 10px; padding: 1px 7px; border-radius: var(--radius-full);
  background: var(--accent-bg); color: var(--accent-primary);
  white-space: nowrap; max-width: 100px; overflow: hidden; text-overflow: ellipsis;
}
.tag-more { font-size: 10px; color: var(--text-tertiary); }
.card-status { position: absolute; top: 6px; right: 6px; font-size: 11px; }

/* ── Editor panel ── */
.editor-panel { padding: 14px; min-height: 160px; }
.editor-header { display: flex; justify-content: space-between; margin-bottom: 8px; }
.editor-name { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
.editor-count { font-size: 11px; color: var(--text-tertiary); }
.edit-area {
  width: 100%; padding: 10px; border-radius: var(--radius-sm);
  background: rgba(255,255,255,0.03); border: 1px solid var(--glass-border);
  color: var(--text-primary); font-family: var(--font-sans); font-size: 12px;
  resize: vertical; line-height: 1.8;
}
.edit-area:focus { outline: none; border-color: var(--border-accent); }
.editor-bottom { display: flex; gap: 8px; margin-top: 8px; justify-content: flex-end; }
.save-btn {
  padding: 7px 18px; border: none; border-radius: var(--radius-full);
  background: var(--gradient-accent); color: #fff; font-size: 12px; font-weight: 600;
  cursor: pointer; font-family: var(--font-sans);
}
.save-btn:disabled { opacity: 0.4; }
.close-btn {
  padding: 7px 12px; border: 1px solid var(--glass-border); border-radius: 50%;
  background: var(--glass-bg); color: var(--text-tertiary); cursor: pointer;
}
.dim-panel { display: flex; align-items: center; justify-content: center; color: var(--text-tertiary); font-size: 13px; }

/* ── Stats panel ── */
.stats-panel { padding: 14px; max-height: 350px; overflow-y: auto; }
.panel-title { font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 10px; }
.tag-cloud { display: flex; flex-direction: column; gap: 1px; }
.cloud-item { display: flex; align-items: center; gap: 6px; padding: 3px 6px; border-radius: var(--radius-xs); font-size: 12px; }
.cloud-item:hover { background: var(--glass-bg); }
.cloud-tag { flex: 1; color: var(--text-secondary); cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cloud-tag:hover { color: var(--accent-primary); }
.cloud-count { color: var(--text-tertiary); font-family: var(--font-mono); font-size: 11px; min-width: 24px; text-align: right; }
.cloud-acts { display: flex; gap: 2px; }
.cloud-acts button {
  width: 18px; height: 18px; border: 1px solid var(--glass-border); border-radius: 50%;
  background: var(--glass-bg); color: var(--text-tertiary); font-size: 10px;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  font-family: var(--font-sans);
}
.cloud-acts button:hover:first-child { background: rgba(52,211,153,0.15); border-color: #34d399; color: #34d399; }
.cloud-acts button:hover:last-child { background: rgba(239,68,68,0.15); border-color: #ef4444; color: #ef4444; }

/* ── Batch bar ── */
.batch-bar { display: flex; gap: 10px; padding: 12px 14px; }
.batch-group { display: flex; gap: 6px; flex: 1; }
.batch-input {
  flex: 1; min-width: 0; padding: 7px 12px; border-radius: var(--radius-full);
  border: 1px solid var(--glass-border); background: var(--glass-bg);
  color: var(--text-primary); font-size: 12px; font-family: var(--font-sans);
}
.batch-input:focus { outline: none; border-color: var(--border-accent); }
.batch-btn {
  padding: 7px 14px; border-radius: var(--radius-full); white-space: nowrap;
  border: 1px solid rgba(var(--accent-primary-rgb), 0.2);
  background: var(--accent-bg); color: var(--accent-primary);
  font-size: 11px; font-weight: 600; font-family: var(--font-sans); cursor: pointer;
}
.batch-btn:hover { background: var(--accent-bg-hover); }
.batch-btn.danger { border-color: rgba(239,68,68,0.2); background: rgba(239,68,68,0.08); color: #ef4444; }
.batch-btn.danger:hover { background: rgba(239,68,68,0.15); }
</style>
