<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useGalleryStore } from '@/stores/gallery'

defineProps<{
  title: string
  search: string
  tagState: 'all' | 'tagged' | 'untagged'
  sort: string
  viewMode: 'small' | 'large' | 'list'
  imageCount: number
  scanning: boolean
}>()

const emit = defineEmits<{
  'update:search': [value: string]
  'update:tagState': [value: 'all' | 'tagged' | 'untagged']
  'update:sort': [value: string]
  'update:viewMode': [value: 'small' | 'large' | 'list']
  scan: []
  addRoot: []
  importImages: []
}>()

const galleryStore = useGalleryStore()
const importMenu = ref<HTMLElement | null>(null)
const importMenuOpen = ref(false)

async function onSortChange(event: Event) {
  const mode = (event.target as HTMLSelectElement).value
  emit('update:sort', mode)
  await galleryStore.setSortMode(mode)
}

function chooseImages() {
  importMenuOpen.value = false
  emit('importImages')
}

function chooseFolder() {
  importMenuOpen.value = false
  emit('addRoot')
}

function closeImportMenu(event: MouseEvent) {
  if (!importMenu.value?.contains(event.target as Node)) importMenuOpen.value = false
}

onMounted(() => document.addEventListener('click', closeImportMenu))
OnBeforeUnmount_PLACEHOLDER
</script>
