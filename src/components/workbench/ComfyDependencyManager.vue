<script setup lang="ts">
defineProps<{ records: ComfyDependencyRecord[]; busyRepository?: string }>()
defineEmits<{
  close: []
  recheck: []
  install: [record: ComfyDependencyRecord, repository: string]
  requirements: [record: ComfyDependencyRecord, repository: string]
  copyName: [nodeType: string]
}>()
</script>

<template>
  <aside class="dependency-manager" @pointerdown.stop>
    <header><strong>ComfyUI 节点依赖</strong><button type="button" @click="$emit('close')">×</button></header>
    <p>这里仅管理图片工作流缺少的 ComfyUI 节点，与 Baka 自定义节点分开。</p>
    <button type="button" class="dependency-manager__recheck" @click="$emit('recheck')">重新检查</button>
    <div v-for="record in records" :key="record.nodeType" class="dependency-manager__item">
      <div><b>{{ record.nodeType }}</b><small>{{ record.status === 'unknown' ? '来源未知' : record.status === 'ambiguous' ? '可能来源' : record.status === 'installed' ? '已安装' : record.requiresRestart ? '已拉取，待重启' : '缺失' }}</small></div>
      <template v-if="record.status === 'missing' && record.candidates.length === 1">
        <button type="button" :disabled="busyRepository === record.candidates[0].repository" @click="$emit('install', record, record.candidates[0].repository)">Git 拉取</button>
      </template>
      <select v-else-if="record.status === 'ambiguous'" @change="$emit('install', record, ($event.target as HTMLSelectElement).value)">
        <option value="">选择可能来源</option><option v-for="item in record.candidates" :key="item.repository" :value="item.repository">{{ item.title }}</option>
      </select>
      <button v-else-if="record.status === 'unknown'" type="button" @click="$emit('copyName', record.nodeType)">复制名称</button>
      <button v-if="record.requirementsPath && record.candidates[0]" type="button" @click="$emit('requirements', record, record.candidates[0].repository)">安装依赖</button>
    </div>
  </aside>
</template>

<style scoped>
.dependency-manager { position: absolute; right: 16px; top: 64px; bottom: 16px; z-index: 50; width: 360px; box-sizing: border-box; padding: 15px; border: 1px solid var(--line-subtle); border-radius: 13px; background: var(--surface-primary); box-shadow: var(--surface-shadow); overflow: auto; display: grid; align-content: start; gap: 10px; }.dependency-manager header { display:flex;justify-content:space-between;align-items:center }.dependency-manager header button { border:0;background:transparent;color:inherit;font-size:20px;cursor:pointer }.dependency-manager p { margin:0;color:var(--text-tertiary);font-size:11px;line-height:1.6 }.dependency-manager button,.dependency-manager select { border:1px solid var(--line-subtle);border-radius:7px;background:var(--surface-secondary);color:inherit;padding:6px 8px;cursor:pointer }.dependency-manager__recheck { justify-self:start }.dependency-manager__item { display:grid;grid-template-columns:1fr auto;gap:7px;padding:9px;border-radius:9px;background:var(--surface-secondary) }.dependency-manager__item b,.dependency-manager__item small { display:block }.dependency-manager__item small { color:var(--text-tertiary);font-size:10px;margin-top:2px }
</style>
