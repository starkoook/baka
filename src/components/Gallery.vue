<template>
  <div class="gallery-container">
    <div class="gallery-header">
      <input 
        v-model="searchQuery"
        placeholder="搜索图片、标签或文件名..."
        class="search-input"
      >
      <div class="controls">
        <button @click="importSelected" class="btn primary">导入选中</button>
        <button @click="exportSelected" class="btn secondary">导出选中</button>
        <button @click="toggleTagFilter" class="btn tertiary">标签过滤</button>
      </div>
    </div>

    <div class="tag-filters" v-if="showTagFilter">
      <span 
        v-for="tag in uniqueTags" 
        :key="tag"
        :class="{ 'active': selectedTags.includes(tag) }"
        @click="toggleTag(tag)"
        class="tag-pill"
      >
        {{ tag }}
      </span>
    </div>

    <div class="gallery-grid">
      <div 
        v-for="(image, index) in filteredImages" 
        :key="index"
        class="gallery-item"
        :class="{ selected: selectedImages.includes(index) }"
        @click="toggleSelect(index)"
        @dblclick="viewImage(index)"
      >
        <img :src="image.thumbnail || image.url" :alt="image.name">
        <div class="item-info">
          <div class="item-name">{{ image.name }}</div>
          <div class="item-tags">
            <span v-for="tag in image.tags" :key="tag" class="item-tag">{{ tag }}</span>
          </div>
        </div>
        <div class="overlay">
          <span class="select-icon">✓</span>
        </div>
      </div>
    </div>

    <div v-if="selectedImages.length" class="selection-bar">
      选中 {{ selectedImages.length }} 张图片
      <button @click="importSelected" class="btn small">导入</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  images: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['import', 'export'])

const searchQuery = ref('')
const selectedImages = ref([])
const selectedTags = ref([])
const showTagFilter = ref(false)

const filteredImages = computed(() => {
  return props.images.filter(img => {
    const matchesSearch = !searchQuery.value || 
      img.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      img.tags.some(tag => tag.toLowerCase().includes(searchQuery.value.toLowerCase()))
    
    const matchesTags = selectedTags.value.length === 0 || 
      selectedTags.value.every(tag => img.tags.includes(tag))
    
    return matchesSearch && matchesTags
  })
})

const uniqueTags = computed(() => {
  const tags = new Set()
  props.images.forEach(img => {
    img.tags.forEach(tag => tags.add(tag))
  })
  return Array.from(tags).sort()
})

const toggleSelect = (index) => {
  if (selectedImages.value.includes(index)) {
    selectedImages.value = selectedImages.value.filter(i => i !== index)
  } else {
    selectedImages.value.push(index)
  }
}

const toggleTag = (tag) => {
  if (selectedTags.value.includes(tag)) {
    selectedTags.value = selectedTags.value.filter(t => t !== tag)
  } else {
    selectedTags.value.push(tag)
  }
}

const toggleTagFilter = () => {
  showTagFilter.value = !showTagFilter.value
}

const importSelected = () => {
  emit('import', selectedImages.value)
  selectedImages.value = []
}

const exportSelected = () => {
  emit('export', selectedImages.value)
}
</script>

<style scoped>
.gallery-container {
  padding: 20px;
  background: #1a1a1a;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.gallery-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.search-input {
  flex: 1;
  min-width: 300px;
  padding: 12px 16px;
  background: #2a2a2a;
  border: 1px solid #444;
  border-radius: 8px;
  color: #fff;
  font-size: 16px;
}

.search-input:focus {
  outline: none;
  border-color: #00ff9d;
  box-shadow: 0 0 0 3px rgba(0, 255, 157, 0.2);
}

.controls {
  display: flex;
  gap: 8px;
}

.btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn.primary {
  background: #00ff9d;
  color: #000;
}

.btn.primary:hover {
  background: #00cc7a;
  transform: translateY(-1px);
}

.btn.secondary {
  background: #333;
  color: #fff;
}

.btn.tertiary {
  background: #444;
  color: #fff;
}

.tag-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 20px;
}

.tag-pill {
  background: #2a2a2a;
  color: #aaa;
  padding: 6px 12px;
  border-radius: 20px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.tag-pill.active {
  background: #00ff9d;
  color: #000;
  box-shadow: 0 0 0 2px rgba(0, 255, 157, 0.3);
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
}

.gallery-item {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  background: #222;
}

.gallery-item:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.4);
}

.gallery-item img {
  width: 100%;
  height: 180px;
  object-fit: cover;
  display: block;
}

.item-info {
  padding: 12px;
}

.item-name {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 8px;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.item-tag {
  font-size: 11px;
  background: #333;
  padding: 2px 8px;
  border-radius: 4px;
  color: #aaa;
}

.overlay {
  position: absolute;
  top: 12px;
  right: 12px;
  background: rgba(0, 255, 157, 0.9);
  color: #000;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  opacity: 0;
  transition: all 0.2s;
  pointer-events: none;
}

.gallery-item.selected .overlay {
  opacity: 1;
  pointer-events: auto;
}

.selection-bar {
  position: fixed;
  bottom: 30px;
  left: 50%;
  transform: translateX(-50%);
  background: #1a1a1a;
  border: 1px solid #00ff9d;
  padding: 12px 24px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  z-index: 1000;
}

.btn.small {
  padding: 6px 12px;
  font-size: 14px;
}
</style>