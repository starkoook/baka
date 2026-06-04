<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { useLogStore } from '@/stores/logs'

const appStore = useAppStore()
const logStore = useLogStore()

interface Item {
  name: string; path: string; txtPath: string | null
  caption: string; hasCaption: boolean
}

const folderPath = ref('')
const items = ref<Item[]>([])
const selectedIdx = ref<number | null>(null)
const editCaption = ref('')
const saving = ref(false)

// Batch
const batchAddTag = ref('')
const batchRemoveTag = ref('')
const batchFind = ref('')
const batchReplace = ref('')

// Stats
const tagStats = computed(() => {
  const map = new Map<string, number>()
  for (const item of items.value) {
    if (!item.caption) continue
    item.caption.split(/[,，\n]/).forEach((t) => {
      const tag = t.trim().toLowerCase()
      if (tag) map.set(tag, (map.get(tag) || 0) + 1)
    })
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1])
})

const withCaption = computed(() => items.value.filter((i) => i.hasCaption).length)

// ── Select folder ──
async function selectFolder() {
  if (!window.fsAPI) return
  const folder = await window.fsAPI.selectFolder()
  if (!folder) return
  folderPath.value = folder
  const list = await window.fsAPI.listDataset(folder)
  items.value = list
  selectedIdx.value = null
  appStore.setStatus(`已加载 ${list.length} 张图片`)
  logStore.info(`数据集: ${list.length} 张, ${list.filter((i) => i.hasCaption).length} 个标注`)
}

// ── Edit caption ──
function selectItem(idx: number) {
  selectedIdx.value = idx
  editCaption.value = items.value[idx].caption || ''
}

async function saveCaption() {
  if (selectedIdx.value === null) return
  const item = items.value[selectedIdx.value]
  if (!item.txtPath) {
    // Create txt path
    const base = item.name.replace(/\.[^.]+$/, '')
    item.txtPath = item.path.replace(item.name, base + '.txt')
  }
  saving.value = true
  const res = await window.fsAPI.saveCaption({ txtPath: item.txtPath, caption: editCaption.value })
  if (res.success) {
    item.caption = editCaption.value
    item.hasCaption = !!editCaption.value.trim()
    appStore.setStatus('标注已保存')
  }
  saving.value = false
}

// ── Batch operations ──
async function batchAdd() {
  const tag = batchAddTag.value.trim(); if (!tag) return
  let count = 0
  for (const item of items.value) {
    if (!item.caption?.includes(tag)) {
      item.caption = item.caption ? item.caption + ', ' + tag : tag
      item.hasCaption = true
      if (!item.txtPath) {
        const base = item.name.replace(/\.[^.]+$/, '')
        item.txtPath = item.path.replace(item.name, base + '.txt')
      }
      await window.fsAPI.saveCaption({ txtPath: item.txtPath, caption: item.caption })
      count++
    }
  }
  logStore.success(`已添加 "${tag}" 到 ${count} 个文件`)
  batchAddTag.value = ''
}

async function batchRemove() {
  const tag = batchRemoveTag.value.trim().toLowerCase(); if (!tag) return
  let count = 0
  for (const item of items.value) {
    if (!item.caption) continue
    const tags = item.caption.split(/[,，\n]/).map((t) => t.trim().toLowerCase())
    if (tags.includes(tag)) {
      item.caption = tags.filter((t) => t !== tag).join(', ')
      await window.fsAPI.saveCaption({ txtPath: item.txtPath, caption: item.caption })
      count++
    }
  }
  logStore.success(`已移除 "${tag}" 从 ${count} 个文件`)
  batchRemoveTag.value = ''
}

async function batchFindReplace() {
  const find = batchFind.value.trim(); const repl = batchReplace.value.trim()
  if (!find) return
  let count = 0
  for (const item of items.value) {
    if (!item.caption?.includes(find)) continue
    item.caption = item.caption.split(find).join(repl)
    await window.fsAPI.saveCaption({ txtPath: item.txtPath, caption: item.caption })
    count++
  }
  logStore.success(`替换 "${find}" → "${repl}" 在 ${count} 个文件`)
  batchFind.value = ''; batchReplace.value = ''
}

// ── Quick add/remove tag from stats ──
function quickAdd(tag: string) { batchAddTag.value = tag; batchAdd() }
function quickRemove(tag: string) { batchRemoveTag.value = tag; batchRemove() }
</script>

<template>
  <div class="dataset-page">
    <div class="page-header">
      <h1 class="page-title">训练集处理</h1>
      <p class="page-desc">管理数据集标注，批量编辑标签与统计分析</p>
    </div>

    <!-- Select folder -->
    <div class="top-bar" v-if="!folderPath">
      <button class="action-btn" @click="selectFolder">
        <span class="action-btn-icon">📂</span>
        <span>选择训练集目录</span>
      </button>
    </div>

    <template v-if="folderPath">
      <!-- Info bar -->
      <div class="info-bar glass-panel">
        <span class="info-path">{{ folderPath }}</span>
        <span class="info-stats">{{ items.length }} 张图片 · {{ withCaption }} 个标注 · {{ tagStats.length }} 种标签</span>
        <button class="btn btn-ghost" @click="selectFolder">更换目录</button>
      </div>

      <div class="dataset-layout">
        <!-- Left: Image list -->
        <div class="panel glass-panel image-list-panel">
          <h3 class="panel-title">文件列表</h3>
          <div class="image-list">
            <div
              v-for="(item, idx) in items" :key="item.path"
              class="image-item"
              :class="{ active: selectedIdx === idx, hasCap: item.hasCaption }"
              @click="selectItem(idx)"
            >
              <span class="item-status">{{ item.hasCaption ? '📝' : '🖼' }}</span>
              <span class="item-name">{{ item.name }}</span>
            </div>
          </div>
        </div>

        <!-- Middle: Editor -->
        <div class="panel glass-panel" v-if="selectedIdx !== null">
          <h3 class="panel-title">编辑标注 — {{ items[selectedIdx]?.name }}</h3>
          <textarea
            class="edit-area"
            v-model="editCaption"
            rows="6"
            placeholder="输入标签，逗号分隔..."
          ></textarea>
          <div class="edit-actions">
            <button class="save-btn" @click="saveCaption" :disabled="saving">
              {{ saving ? '保存中...' : '💾 保存' }}
            </button>
          </div>
        </div>
        <div class="panel glass-panel empty-panel" v-else>
          <p class="dim-text">← 点击左侧文件开始编辑</p>
        </div>

        <!-- Right: Stats + Batch -->
        <div class="panel glass-panel stats-panel">
          <h3 class="panel-title">标签统计</h3>
          <div class="stats-list" v-if="tagStats.length > 0">
            <div v-for="[tag, count] in tagStats.slice(0, 50)" :key="tag" class="stat-row">
              <span class="stat-tag">{{ tag }}</span>
              <span class="stat-count">{{ count }}</span>
              <span class="stat-actions">
                <button class="mini-btn add" @click="quickAdd(tag)" title="批量添加">+</button>
                <button class="mini-btn del" @click="quickRemove(tag)" title="批量删除">−</button>
              </span>
            </div>
          </div>
          <p class="dim-text" v-else>暂无标签数据</p>
        </div>
      </div>

      <!-- Batch operations bar -->
      <div class="batch-bar glass-panel">
        <h3 class="panel-title">批量操作</h3>
        <div class="batch-row">
          <div class="batch-group">
            <input class="form-input styled-input" v-model="batchAddTag" placeholder="添加标签..." @keyup.enter="batchAdd" />
            <button class="mini-action-btn" @click="batchAdd">➕ 全部添加</button>
          </div>
          <div class="batch-group">
            <input class="form-input styled-input" v-model="batchRemoveTag" placeholder="删除标签..." @keyup.enter="batchRemove" />
            <button class="mini-action-btn danger" @click="batchRemove">➖ 全部删除</button>
          </div>
          <div class="batch-group">
            <input class="form-input styled-input" v-model="batchFind" placeholder="查找..." />
            <input class="form-input styled-input" v-model="batchReplace" placeholder="替换为..." />
            <button class="mini-action-btn" @click="batchFindReplace">🔄 替换</button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.dataset-page { max-width: 1100px; margin: 0 auto; }
.page-header { margin-bottom: 24px; }
.page-title { font-size: 24px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px; }
.page-desc { font-size: 13px; color: var(--text-tertiary); }

/* ── Top bar ── */
.top-bar { display: flex; justify-content: center; padding: 40px 0; }

.action-btn {
  display: flex; align-items: center; gap: 10px; padding: 14px 28px;
  border: none; border-radius: var(--radius-full);
  background: var(--gradient-accent); color: #fff; font-size: 15px; font-weight: 700;
  font-family: var(--font-sans); cursor: pointer;
  box-shadow: 0 4px 20px rgba(var(--accent-primary-rgb), 0.35);
  transition: all 0.3s cubic-bezier(0.34,1.56,0.64,1);
}
.action-btn:hover { transform: scale(1.03); box-shadow: 0 8px 30px rgba(var(--accent-primary-rgb), 0.5); }
.action-btn-icon { font-size: 20px; }

.info-bar {
  display: flex; align-items: center; gap: 16px; padding: 10px 16px; margin-bottom: 16px;
  font-size: 12px;
}
.info-path { color: var(--accent-primary); font-weight: 500; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.info-stats { color: var(--text-tertiary); }

/* ── Layout ── */
.dataset-layout { display: grid; grid-template-columns: 220px 1fr 240px; gap: 12px; margin-bottom: 16px; }

.panel { padding: 14px; }
.panel-title { font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 10px; }

.image-list { max-height: 400px; overflow-y: auto; display: flex; flex-direction: column; gap: 1px; }
.image-item {
  display: flex; align-items: center; gap: 6px; padding: 6px 8px;
  border-radius: var(--radius-xs); cursor: pointer; transition: background 0.15s;
  font-size: 11px; color: var(--text-tertiary);
}
.image-item:hover { background: var(--glass-bg); }
.image-item.active { background: var(--accent-bg); color: var(--accent-primary); }
.image-item.hasCap .item-name { color: var(--text-secondary); }
.item-status { font-size: 12px; flex-shrink: 0; }
.item-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ── Editor ── */
.edit-area {
  width: 100%; padding: 12px; border-radius: var(--radius-sm);
  background: rgba(255,255,255,0.03); border: 1px solid var(--glass-border);
  color: var(--text-primary); font-family: var(--font-sans); font-size: 13px;
  resize: vertical; line-height: 1.7;
}
.edit-area:focus { outline: none; border-color: var(--border-accent); }
.edit-actions { margin-top: 8px; }
.save-btn {
  padding: 8px 20px; border: none; border-radius: var(--radius-full);
  background: var(--gradient-accent); color: #fff; font-size: 12px; font-weight: 600;
  cursor: pointer; font-family: var(--font-sans); transition: all 0.25s;
}
.save-btn:hover { transform: scale(1.03); }
.save-btn:disabled { opacity: 0.4; }

.empty-panel { display: flex; align-items: center; justify-content: center; min-height: 200px; }
.dim-text { font-size: 12px; color: var(--text-tertiary); text-align: center; }

/* ── Stats ── */
.stats-panel { max-height: 450px; overflow-y: auto; }
.stats-list { display: flex; flex-direction: column; gap: 1px; }
.stat-row {
  display: flex; align-items: center; gap: 6px; padding: 3px 6px;
  border-radius: var(--radius-xs); font-size: 11px;
}
.stat-row:hover { background: var(--glass-bg); }
.stat-tag { flex: 1; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stat-count { color: var(--text-tertiary); font-family: var(--font-mono); font-size: 10px; width: 24px; text-align: right; }
.stat-actions { display: flex; gap: 2px; }
.mini-btn {
  width: 16px; height: 16px; border: 1px solid var(--glass-border); border-radius: 50%;
  background: var(--glass-bg); color: var(--text-tertiary); font-size: 10px;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all 0.15s; font-family: var(--font-sans);
}
.mini-btn.add:hover { background: rgba(34,197,94,0.15); border-color: #34d399; color: #34d399; }
.mini-btn.del:hover { background: rgba(239,68,68,0.15); border-color: #ef4444; color: #ef4444; }

/* ── Batch ── */
.batch-bar { padding: 14px; }
.batch-row { display: flex; flex-direction: column; gap: 8px; }
.batch-group { display: flex; gap: 8px; align-items: center; }
.styled-input {
  padding: 8px 12px; background: rgba(255,255,255,0.04);
  border: 1px solid var(--glass-border); border-radius: var(--radius-sm);
  color: var(--text-primary); font-size: 12px; font-family: var(--font-sans);
  flex: 1; min-width: 0;
}
.styled-input:focus { outline: none; border-color: var(--border-accent); }
.mini-action-btn {
  padding: 7px 14px; white-space: nowrap;
  border: 1px solid rgba(var(--accent-primary-rgb), 0.2);
  border-radius: var(--radius-full); background: var(--accent-bg);
  color: var(--accent-primary); font-size: 11px; font-weight: 600;
  font-family: var(--font-sans); cursor: pointer; transition: all 0.2s;
}
.mini-action-btn:hover { background: var(--accent-bg-hover); }
.mini-action-btn.danger { border-color: rgba(239,68,68,0.2); background: rgba(239,68,68,0.08); color: #ef4444; }
.mini-action-btn.danger:hover { background: rgba(239,68,68,0.15); }
</style>
