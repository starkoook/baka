<script setup lang="ts">
interface ImageMetadataSummary {
  hasMetadata?: boolean
  prompt?: string
  negativePrompt?: string
  model?: string
  seed?: string | number
  steps?: number
  cfg?: number
  sampler?: string
  generator?: string
  width?: number
  height?: number
}

defineProps<{
  src?: string
  fileName?: string
  width?: number
  height?: number
  mimeType?: string
  metadata?: ImageMetadataSummary
}>()

defineEmits<{
  choose: []
  replace: []
  save: []
}>()
</script>

<template>
  <section class="image-load-node" @pointerdown.stop>
    <button v-if="!src" type="button" class="image-load-node__empty" @click="$emit('choose')">
      <span>＋</span>
      <strong>选择图片</strong>
      <small>也可以直接拖到画布</small>
    </button>
    <template v-else>
      <div class="image-load-node__preview">
        <img :src="src" :alt="fileName || '已加载图片'" draggable="false" />
      </div>
      <div class="image-load-node__facts">
        <strong :title="fileName">{{ fileName || '图片' }}</strong>
        <span>{{ width && height ? `${width} × ${height}` : '尺寸未知' }}</span>
        <span>{{ mimeType || '图片文件' }}</span>
      </div>
      <details v-if="metadata?.hasMetadata" class="image-load-node__metadata">
        <summary>已读取生成信息</summary>
        <dl>
          <template v-if="metadata.prompt"><dt>提示词</dt><dd>{{ metadata.prompt }}</dd></template>
          <template v-if="metadata.model"><dt>模型</dt><dd>{{ metadata.model }}</dd></template>
          <template v-if="metadata.generator"><dt>来源</dt><dd>{{ metadata.generator }}</dd></template>
          <template v-if="metadata.seed !== undefined"><dt>种子</dt><dd>{{ metadata.seed }}</dd></template>
          <template v-if="metadata.steps"><dt>步数</dt><dd>{{ metadata.steps }}</dd></template>
          <template v-if="metadata.cfg"><dt>CFG</dt><dd>{{ metadata.cfg }}</dd></template>
          <template v-if="metadata.sampler"><dt>采样器</dt><dd>{{ metadata.sampler }}</dd></template>
        </dl>
      </details>
      <div class="image-load-node__actions">
        <button type="button" @click="$emit('replace')">更换</button>
        <button type="button" @click="$emit('save')">保存副本</button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.image-load-node { display: grid; gap: 8px; height: 100%; padding: 8px; box-sizing: border-box; overflow: auto; }
.image-load-node__empty { min-height: 150px; border: 1px dashed rgba(255,255,255,.28); border-radius: 10px; background: rgba(255,255,255,.035); color: inherit; display: grid; place-content: center; gap: 5px; text-align: center; cursor: pointer; }
.image-load-node__empty span { font-size: 26px; color: var(--accent, #f08bc0); }
.image-load-node__empty small { opacity: .58; }
.image-load-node__preview { min-height: 110px; border-radius: 8px; overflow: hidden; background: #15141a; display: grid; place-items: center; }
.image-load-node__preview img { width: 100%; max-height: 210px; object-fit: contain; }
.image-load-node__facts { display: grid; grid-template-columns: 1fr auto; gap: 3px 8px; font-size: 11px; opacity: .72; }
.image-load-node__facts strong { grid-column: 1 / -1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; opacity: 1; }
.image-load-node__metadata { font-size: 11px; }
.image-load-node__metadata summary { cursor: pointer; color: var(--accent, #f08bc0); }
.image-load-node__metadata dl { display: grid; grid-template-columns: 42px 1fr; gap: 4px 6px; margin: 6px 0 0; }
.image-load-node__metadata dt { opacity: .58; }
.image-load-node__metadata dd { margin: 0; max-height: 42px; overflow: auto; word-break: break-word; }
.image-load-node__actions { display: flex; gap: 6px; margin-top: auto; }
.image-load-node__actions button { flex: 1; border: 1px solid rgba(255,255,255,.13); border-radius: 6px; padding: 5px; background: rgba(255,255,255,.055); color: inherit; cursor: pointer; }
</style>
