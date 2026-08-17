<script setup lang="ts">
defineProps<{ missingCount?: number; configured: boolean }>()
defineEmits<{ open: [] }>()
</script>

<template>
  <button type="button" class="comfy-notice" @click="$emit('open')">
    <strong>{{ configured ? `检测到 ${missingCount || 0} 个缺失节点` : '图片含 ComfyUI 工作流' }}</strong>
    <span>{{ configured ? '查看依赖 →' : '配置本地引擎 →' }}</span>
  </button>
</template>

<style scoped>
.comfy-notice { position: absolute; right: 16px; top: 64px; z-index: 38; display: grid; gap: 3px; min-width: 230px; padding: 11px 13px; border: 1px solid rgba(240,139,192,.32); border-radius: 11px; background: color-mix(in srgb,var(--surface-primary) 94%,transparent); color: inherit; text-align: left; box-shadow: var(--surface-shadow); cursor: pointer; }.comfy-notice strong { font-size: 12px; }.comfy-notice span { color: var(--brand-primary); font-size: 11px; }
</style>
