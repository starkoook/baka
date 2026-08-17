<script setup lang="ts">
defineProps<{ image: GalleryImage; tags: TagInfo[] }>()
defineEmits<{ openMetadata: []; sendToTagger: []; audit: []; reveal: []; delete: [] }>()

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
</script>

<template>
  <aside class="gallery-inspector">
    <div class="inspector-heading"><span>图片详情</span><small>单击选择 · 双击查看</small></div>
    <div class="file-title" :title="image.filename">{{ image.filename }}</div>
    <dl>
      <div><dt>尺寸</dt><dd>{{ image.width }} × {{ image.height }}</dd></div>
      <div><dt>大小</dt><dd>{{ formatSize(image.file_size) }}</dd></div>
      <div><dt>修改时间</dt><dd>{{ image.file_modified_at || '未知' }}</dd></div>
    </dl>
    <div class="tag-heading"><span>标签</span><small>{{ tags.length }}</small></div>
    <div v-if="tags.length" class="tag-list"><span v-for="tag in tags.slice(0, 12)" :key="tag.tag">{{ tag.tag }}</span></div>
    <p v-else class="no-tags">这张图片还没有标签。</p>
    <div class="inspector-actions">
      <button class="primary" @click="$emit('openMetadata')">查看图片与元数据</button>
      <button @click="$emit('sendToTagger')">送去标注</button>
      <button @click="$emit('audit')">角色审计</button>
      <button class="danger" @click="$emit('delete')">移入回收站</button>
      <button class="text" @click="$emit('reveal')">打开文件位置</button>
    </div>
  </aside>
</template>

<style scoped>
.gallery-inspector { width: 250px; flex: 0 0 250px; min-height: 0; overflow: auto; padding: 14px; border: 0; border-radius: 12px; background: linear-gradient(180deg, color-mix(in srgb, var(--surface-secondary) 78%, transparent), transparent); }
.inspector-heading, .tag-heading { display: flex; align-items: center; justify-content: space-between; color: var(--text-secondary); font-size: 11px; font-weight: 650; }
.inspector-heading small, .tag-heading small { color: var(--text-tertiary); font-size: 8px; font-weight: 400; }
.file-title { margin-top: 18px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-primary); font-size: 13px; font-weight: 650; }
dl { margin: 12px 0 20px; }
dl div { display: flex; justify-content: space-between; gap: 10px; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,.04); font-size: 10px; }
dt { color: var(--text-tertiary); } dd { margin: 0; color: var(--text-secondary); text-align: right; }
.tag-list { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px; }
.tag-list span { padding: 4px 7px; border-radius: 999px; background: rgba(var(--accent-primary-rgb),.08); color: var(--text-secondary); font-size: 9px; }
.no-tags { color: var(--text-tertiary); font-size: 10px; }
.inspector-actions { display: grid; gap: 7px; margin-top: 20px; }
.inspector-actions button { height: 34px; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; background: rgba(255,255,255,.035); color: var(--text-secondary); cursor: pointer; font: inherit; font-size: 10px; }
.inspector-actions .primary { border-color: transparent; background: var(--accent-primary); color: white; font-weight: 650; }
.inspector-actions .danger { border-color: rgba(255,137,117,.35); color: #ff9a86; }
.inspector-actions .text { border: 0; background: transparent; color: var(--text-tertiary); }
@media (max-width: 1050px) { .gallery-inspector { width: 220px; flex-basis: 220px; } }
</style>
