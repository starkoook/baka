<script setup lang="ts">
defineProps<{ image: GalleryImage | null; tags: TagInfo[] }>()
defineEmits<{ openMetadata: []; sendToTagger: []; batchTools: []; audit: []; reveal: []; delete: [] }>()

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
</script>

<template>
  <aside v-if="image" class="gallery-inspector">
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
      <button @click="$emit('batchTools')">批量工具</button>
      <button @click="$emit('audit')">角色审计</button>
      <button class="danger" @click="$emit('delete')">移入回收站</button>
      <button class="text" @click="$emit('reveal')">打开文件位置</button>
    </div>
  </aside>
</template>

<style scoped>
.gallery-inspector { width: 262px; flex: 0 0 262px; min-height: 0; overflow: auto; padding: 18px 16px 16px; border-radius: var(--radius-hero); background: var(--surface-primary); box-shadow: var(--surface-shadow); }
.inspector-heading, .tag-heading { display: flex; align-items: center; justify-content: space-between; color: var(--ink-tertiary); font-size: 11px; font-weight: 800; letter-spacing: .06em; }
.inspector-heading small, .tag-heading small { color: var(--ink-quaternary); font-size: 10px; font-weight: 600; font-family: var(--font-mono); }
.file-title { margin-top: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink-primary); font-size: 14px; font-weight: 900; }
dl { margin: 12px 0 18px; }
dl div { display: flex; justify-content: space-between; gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--line-subtle); font-size: 11.5px; }
dt { color: var(--ink-tertiary); font-weight: 700; } dd { margin: 0; color: var(--ink-primary); text-align: right; font-family: var(--font-mono); font-size: 11px; }
.tag-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.tag-list span { padding: 5px 11px; border-radius: var(--radius-pill); background: var(--brand-tint); color: var(--ink-secondary); font-size: 11px; font-weight: 700; }
.no-tags { margin-top: 10px; color: var(--ink-tertiary); font-size: 11.5px; }
.inspector-actions { display: grid; gap: 8px; margin-top: 18px; }
.inspector-actions button { height: 36px; border: 0; border-radius: var(--radius-pill); background: var(--surface-secondary); color: var(--ink-secondary); cursor: pointer; font: inherit; font-size: 12px; font-weight: 700; transition: background-color 140ms ease, color 140ms ease, transform 160ms var(--ease-bounce); }
.inspector-actions button:hover { background: var(--brand-soft); color: var(--brand-hover); }
.inspector-actions button:active { transform: scale(.97); }
.inspector-actions .primary { background: var(--brand-gradient); color: var(--brand-on-primary); box-shadow: 0 10px 22px rgba(var(--brand-primary-rgb), .32); }
.inspector-actions .primary:hover { color: #fff; }
.inspector-actions .danger { color: var(--danger-foreground); }
.inspector-actions .text { background: transparent; color: var(--ink-tertiary); }
@media (max-width: 1050px) { .gallery-inspector { width: 230px; flex-basis: 230px; } }
</style>
