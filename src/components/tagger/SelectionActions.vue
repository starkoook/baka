<script setup lang="ts">
import { ref } from 'vue'
import { useAppStore } from '@/stores/app'

const props = defineProps<{ selectedCount: number; selectedPaths: string[] }>()
const emit = defineEmits<{ done: []; addToDataset: [] }>()
const appStore = useAppStore()
const showDialog = ref(false)
const dialogAction = ref<'move' | 'new'>('move')
const newFolderName = ref('')
const keepOriginal = ref(true)

async function pickAndMove() {
  if (!window.fsAPI) return
  const target = await window.fsAPI.selectFolder()
  if (!target) return
  dialogAction.value = 'move'; showDialog.value = true
  ;(window as any).__selTargetFolder = target
}
async function createAndMove() {
  dialogAction.value = 'new'; newFolderName.value = ''; showDialog.value = true
}
async function confirmAction() {
  showDialog.value = false
  if (!window.fsAPI || props.selectedPaths.length === 0) return
  let targetFolder = ''
  if (dialogAction.value === 'new') {
    const name = newFolderName.value.trim(); if (!name) return
    const parent = await window.fsAPI.selectFolder(); if (!parent) return
    targetFolder = parent + '\\' + name
    const r = await window.fsAPI.createFolder(targetFolder)
    if (!r.success) { appStore.setStatus(r.error || '创建失败'); return }
  } else {
    targetFolder = (window as any).__selTargetFolder; if (!targetFolder) return
  }
  appStore.setStatus(`处理中...`)
  const res = await window.fsAPI.moveImages({ filePaths: props.selectedPaths, destFolder: targetFolder, keepOriginal: keepOriginal.value })
  if (res.success) { appStore.setStatus(`完成: ${res.data!.moved} 张${keepOriginal.value ? '复制' : '移动'}`); emit('done') }
  else appStore.setStatus(res.error || '失败')
}
</script>

<template>
  <div class="sa-panel" v-if="selectedCount > 0">
    <!-- Card 1: File operations -->
    <div class="sa-card">
      <div class="sa-card-head">📁 文件操作</div>
      <div class="sa-stat">{{ selectedCount }} 张已选</div>
      <button class="sa-btn" @click="pickAndMove">
        <span class="sa-btn-icon">📂</span>
        <span class="sa-btn-text">移动到文件夹</span>
        <span class="sa-btn-hint">选择目标位置</span>
      </button>
      <button class="sa-btn" @click="createAndMove">
        <span class="sa-btn-icon">🆕</span>
        <span class="sa-btn-text">新建文件夹并放入</span>
        <span class="sa-btn-hint">创建文件夹后移入</span>
      </button>
    </div>

    <!-- Card 2: Dataset -->
    <div class="sa-card">
      <div class="sa-card-head">📦 数据集</div>
      <button class="sa-btn" @click="emit('addToDataset')">
        <span class="sa-btn-icon">➕</span>
        <span class="sa-btn-text">添加到数据集</span>
        <span class="sa-btn-hint">选择已有或新建</span>
      </button>
    </div>

    <!-- Card 3: Placeholder -->
    <div class="sa-card sa-placeholder">
      <div class="sa-card-head">🔧 更多操作</div>
      <div class="sa-empty">
        <span class="sa-empty-icon">📦</span>
        <span>更多功能开发中</span>
        <span class="sa-empty-sub">批量重命名 · 格式转换 · 导出</span>
      </div>
    </div>

    <!-- Confirm dialog -->
    <Teleport to="body">
      <div v-if="showDialog" class="sa-overlay" @click.self="showDialog = false">
        <div class="sa-dialog">
          <h3>{{ dialogAction === 'new' ? '🆕 新建文件夹' : '📁 移动到文件夹' }}</h3>
          <div class="sa-field" v-if="dialogAction === 'new'">
            <label>文件夹名称</label>
            <input v-model="newFolderName" placeholder="输入文件夹名..." @keyup.enter="confirmAction" autofocus />
          </div>
          <div class="sa-row">
            <span>{{ selectedCount }} 张图片</span>
          </div>
          <div class="sa-toggle">
            <span>原图处理</span>
            <div class="sa-seg">
              <button :class="{ on: keepOriginal }" @click="keepOriginal = true">📋 保留 · 复制</button>
              <button :class="{ on: !keepOriginal }" @click="keepOriginal = false">✂ 不保留 · 移动</button>
            </div>
          </div>
          <div class="sa-dlg-actions">
            <button class="sa-confirm" @click="confirmAction">确认{{ keepOriginal ? '复制' : '移动' }} {{ selectedCount }} 张</button>
            <button class="sa-cancel" @click="showDialog = false">取消</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.sa-panel { width: 200px; flex-shrink: 0; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; padding: 4px 0; }
.sa-card {
  background: rgba(24,24,26,0.7); border: 1px solid rgba(255,255,255,0.04);
  border-radius: 12px; padding: 14px;
}
.sa-card-head { font-size: 11px; font-weight: 700; color: #d1d5db; margin-bottom: 8px; }
.sa-stat { font-size: 18px; font-weight: 700; color: #ff69b4; margin-bottom: 10px; }
.sa-btn {
  width: 100%; display: flex; flex-direction: column; gap: 2px; padding: 10px;
  border: 1px solid rgba(255,255,255,0.05); background: rgba(255,255,255,0.02);
  border-radius: 8px; cursor: pointer; text-align: left; margin-bottom: 6px;
  transition: all 0.15s;
}
.sa-btn:hover { background: rgba(255,105,180,0.06); border-color: rgba(255,105,180,0.15); }
.sa-btn-icon { font-size: 16px; }
.sa-btn-text { font-size: 12px; font-weight: 600; color: #e5e7eb; }
.sa-btn-hint { font-size: 10px; color: #6b7280; }

.sa-placeholder { opacity: 0.5; }
.sa-placeholder:hover { opacity: 0.7; }
.sa-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 16px 0; text-align: center; }
.sa-empty-icon { font-size: 28px; opacity: 0.3; }
.sa-empty { font-size: 11px; color: #6b7280; }
.sa-empty-sub { font-size: 9px; color: #4b5563; }

.sa-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 200; }
.sa-dialog { background: #1c1c1e; border: 1px solid rgba(255,105,180,0.1); border-radius: 16px; padding: 24px; width: 380px; }
.sa-dialog h3 { font-size: 16px; font-weight: 600; color: #f3f4f6; margin: 0 0 16px; }
.sa-field { margin-bottom: 14px; }
.sa-field label { display: block; font-size: 11px; color: #6b7280; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.04em; }
.sa-field input { width: 100%; padding: 10px 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; color: #e5e7eb; font-size: 13px; box-sizing: border-box; }
.sa-row { padding: 6px 0; font-size: 12px; color: #9ca3af; margin-bottom: 8px; }
.sa-toggle { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.sa-toggle > span { font-size: 12px; color: #d1d5db; }
.sa-seg { display: flex; border-radius: 8px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08); }
.sa-seg button { padding: 6px 12px; border: none; background: none; color: #6b7280; font-size: 11px; cursor: pointer; }
.sa-seg button.on { background: rgba(255,105,180,0.15); color: #ff69b4; font-weight: 500; }
.sa-dlg-actions { display: flex; gap: 8px; }
.sa-confirm { flex: 1; padding: 10px; background: linear-gradient(135deg, #ff69b4, #ff85c2); border: none; border-radius: 8px; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; }
.sa-cancel { padding: 10px 16px; background: none; border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; color: #6b7280; font-size: 13px; cursor: pointer; }
</style>
