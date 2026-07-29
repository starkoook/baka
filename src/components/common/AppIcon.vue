<script setup lang="ts">
import type { AppNavigationId } from '@/features/navigation/app-navigation'

defineProps<{
  name: AppNavigationId
}>()
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    width="24"
    height="24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="name === 'home'">
      <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
      <path d="M9 21v-6h6v6" />
    </template>
    <template v-else-if="name === 'gallery'">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8" cy="9" r="1.5" />
      <path d="m4 18 5-5 3 3 3-4 5 6" />
    </template>
    <template v-else-if="name === 'tagger'">
      <path d="M20 13.5 13.5 20H6a2 2 0 0 1-2-2v-7.5L10.5 4H18a2 2 0 0 1 2 2Z" />
      <circle cx="15.5" cy="8.5" r="1" />
    </template>
    <template v-else-if="name === 'training'">
      <path d="M4 5h16v11H4z" />
      <path d="M8 20h8M12 16v4M8 10h2m2-3v6m2-4h2" />
    </template>
    <template v-else-if="name === 'tools'">
      <path d="m14.5 6.5 3-3 3 3-3 3" />
      <path d="m13 8-8.5 8.5a2.1 2.1 0 0 0 3 3L16 11" />
      <path d="m5 5 4 4M4 20l4-4" />
    </template>
    <template v-else-if="name === 'settings'">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.2 2.2-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-3.2v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-2.2-2.2.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H4.6v-3.2h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L6 7.8l2.2-2.2.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2h3.2v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 2.2 2.2-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2V14h-.2a1.7 1.7 0 0 0-1.4 1Z" />
    </template>
  </svg>
</template>
