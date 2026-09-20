<script setup lang="ts">
defineProps<{ image: GalleryImage | null; tags: TagInfo[]; preview?: string; metadata?: SDMetadata | null }>()
defineEmits<{ openMetadata: []; sendToTagger: []; batchTools: []; audit: []; reveal: []; delete: [] }>()

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function shortModel(name?: string) {
  if (!name) return ''
  return name.replace(/\.(safetensors|ckpt|pt)$/i, '').split(/[\\/]/).pop() ?? name
}
</script>

<template>
  <aside v-if="image" class="gallery-inspector">
    <button class="polaroid" type="button" :title="image.filename" aria-label="查看图片与元数据" @click="$emit('openMetadata')">
      <img v-if="preview" :src="preview" alt="" draggable="false" />
      <span v-else class="polaroid__blank" aria-hidden="true"></span>
      <span class="polaroid__hint">点击放大</span>
    </button>

    <div class="file-title" :title="image.filename">{{ image.filename }}</div>
    <dl class="facts">
      <div><dt>尺寸</dt><dd>{{ image.width }} × {{ image.height }}</dd></div>
      <div><dt>大小</dt><dd>{{ formatSize(image.file_size) }}</dd></div>
      <div><dt>修改</dt><dd>{{ (image.file_modified_at || '未知').slice(0, 16) }}</dd></div>
      <div v-if="metadata?.hasMetadata && metadata.seed !== undefined"><dt>种子</dt><dd>{{ metadata.seed }}</dd></div>
    </dl>

    <div class="tag-heading"><span>标签</span><small>{{ tags.length }}</small></div>
    <div v-if="tags.length" class="tag-list"><span v-for="tag in tags.slice(0, 14)" :key="tag.tag">{{ tag.tag }}</span><span v-if="tags.length > 14" class="tag-list__more">+{{ tags.length - 14 }}</span></div>
    <p v-else class="no-tags">这张图片还没有标签。</p>

    <template v-if="metadata?.hasMetadata">
      <div class="tag-heading"><span>生成信息</span><button class="link" type="button" @click="$emit('openMetadata')">完整参数</button></div>
      <dl class="facts facts--gen">
        <div v-if="metadata.model"><dt>模型</dt><dd :title="metadata.model">{{ shortModel(metadata.model) }}</dd></div>
        <div v-if="metadata.sampler"><dt>采样</dt><dd>{{ metadata.sampler }}<template v-if="metadata.steps"> · {{ metadata.steps }} 步</template></dd></div>
        <div v-if="metadata.cfg !== undefined"><dt>CFG</dt><dd>{{ metadata.cfg }}</dd></div>
        <div v-if="metadata.loras?.length"><dt>LoRA</dt><dd>{{ metadata.loras.length }} 个</dd></div>
      </dl>
      <p v-if="metadata.prompt" class="prompt" :title="metadata.prompt">{{ metadata.prompt }}</p>
    </template>

    <div class="inspector-actions">
      <button class="primary" @click="$emit('sendToTagger')">送去标注</button>
      <button @click="$emit('openMetadata')">查看图片与元数据</button>
      <div class="inspector-actions__row">
        <button @click="$emit('batchTools')">批量工具</button>
        <button @click="$emit('audit')">角色审计</button>
      </div>
      <div class="inspector-actions__row">
        <button class="text" @click="$emit('reveal')">打开位置</button>
        <button class="danger" @click="$emit('delete')">移入回收站</button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.gallery-inspector { width: 268px; flex: 0 0 268px; min-height: 0; overflow: auto; padding: 18px 16px 16px; border-radius: var(--radius-hero); background: var(--surface-primary); box-shadow: var(--surface-shadow); scrollbar-width: thin; }
.polaroid { position: relative; display: block; width: 100%; margin: 4px 0 18px; padding: 8px 8px 26px; border: 0; border-radius: 18px; background: var(--surface-primary); box-shadow: var(--ink-shadow); transform: rotate(-3deg); cursor: zoom-in; transition: transform .3s var(--ease-bounce), box-shadow .3s ease; }
.polaroid:hover { transform: rotate(0deg) translateY(-4px); box-shadow: var(--surface-shadow-lg); }
.polaroid img, .polaroid__blank { display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 12px; background: var(--surface-tertiary); }
.polaroid__blank { background: linear-gradient(135deg, var(--surface-tertiary), var(--brand-tint)); }
.polaroid__hint { position: absolute; left: 0; right: 0; bottom: 7px; text-align: center; font: 10px var(--font-mono); color: var(--ink-quaternary); }
.file-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink-primary); font-size: 14px; font-weight: 900; }
.facts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 12px; margin: 12px 0 16px; }
.facts div { min-width: 0; }
.facts dt { color: var(--ink-tertiary); font-size: 10.5px; font-weight: 800; letter-spacing: .04em; }
.facts dd { margin: 3px 0 0; color: var(--ink-primary); font: 11.5px var(--font-mono); font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.facts--gen { margin-top: 10px; }
.tag-heading { display: flex; align-items: center; justify-content: space-between; margin-top: 4px; color: var(--ink-tertiary); font-size: 11px; font-weight: 800; letter-spacing: .06em; }
.tag-heading small { color: var(--ink-quaternary); font: 10.5px var(--font-mono); font-weight: 700; }
.tag-heading .link { border: 0; background: none; color: var(--brand-hover); font: inherit; font-size: 11px; font-weight: 800; cursor: pointer; padding: 2px 6px; border-radius: 999px; }
.tag-heading .link:hover { background: var(--brand-soft); }
.tag-list { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 16px; }
.tag-list span { padding: 5px 11px; border-radius: var(--radius-pill); background: var(--brand-tint); color: var(--ink-secondary); font-size: 11px; font-weight: 700; }
.tag-list span:nth-child(3n) { background: var(--accent-lavender-soft); }
.tag-list span:nth-child(5n) { background: var(--accent-mint-soft); }
.tag-list__more { background: var(--surface-secondary) !important; color: var(--ink-tertiary) !important; font-family: var(--font-mono); }
.no-tags { margin: 10px 0 16px; color: var(--ink-tertiary); font-size: 11.5px; }
.prompt { margin: 10px 0 16px; padding: 10px 12px; border-radius: 14px; background: var(--surface-secondary); color: var(--ink-secondary); font-size: 11px; line-height: 1.6; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
.inspector-actions { display: grid; gap: 8px; margin-top: 6px; }
.inspector-actions__row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.inspector-actions button { height: 36px; border: 0; border-radius: var(--radius-pill); background: var(--surface-secondary); color: var(--ink-secondary); cursor: pointer; font: inherit; font-size: 12px; font-weight: 700; transition: background-color 140ms ease, color 140ms ease, transform 160ms var(--ease-bounce); white-space: nowrap; }
.inspector-actions button:hover { background: var(--brand-soft); color: var(--brand-hover); }
.inspector-actions button:active { transform: scale(.97); }
.inspector-actions .primary { background: var(--brand-gradient); color: var(--brand-on-primary); box-shadow: 0 10px 22px rgba(var(--brand-primary-rgb), .32); }
.inspector-actions .primary:hover { color: #fff; }
.inspector-actions .danger { color: var(--danger-foreground); }
.inspector-actions .danger:hover { background: var(--danger-bg); color: var(--danger-foreground); }
.inspector-actions .text { background: transparent; color: var(--ink-tertiary); }
@media (max-width: 1050px) { .gallery-inspector { width: 236px; flex-basis: 236px; } }
@media (prefers-reduced-motion: reduce) { .polaroid { transition: none; transform: none; } .polaroid:hover { transform: none; } }
</style>
