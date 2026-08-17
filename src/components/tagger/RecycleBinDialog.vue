<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ close: []; restored: [] }>()
const items = ref<RecycleItem[]>([])
const thumbs = ref<Record<number, string>>({})

async function load() {
  if (!window.recycleAPI) return
  const result = await window.recycleAPI.list()
  if (result.success && result.data) {
    items.value = result.data
    for (const item of items.value) {
      const thumb = await window.fsAPI.readThumb(item.recycle_path)
      if (thumb.success && thumb.base64) thumbs.value[item.id] = `data:image/jpeg;base64,${thumb.base64}`
    }
  }
}

watch(() => props.visible, (visible) => {
  if (visible) void load()
})

async function restore(id: number) {
  if (!window.recycleAPI) return
  const result = await window.recycleAPI.restore(id)
  if (result.success) {
    await load()
    emit('restored')
  }
}

async function purge(id: number) {
  if (!window.recycleAPI) return
  if (!confirm('确定彻底删除这个项目吗？')) return
  const result = await window.recycleAPI.purge(id)
  if (result.success) await load()
}

defineExpose({ load })
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="dialog-backdrop" @click.self="emit('close')">
      <section class="dialog-card">
        <div><p>RECYCLE BIN</p><h2>回收站</h2></div>
        <div class="recycle-list" v-if="items.length">
          <div v-for="item in items" :key="item.id" class="recycle-row">
            <img v-if="thumbs[item.id]" :src="thumbs[item.id]" alt="" />
            <span v-else class="thumb-placeholder">IMG</span>
            <span>{{ item.original_path }}</span>
            <button @click="restore(item.id)">恢复</button>
            <button @click="purge(item.id)">彻底删除</button>
          </div>
        </div>
        <div v-else class="empty">回收站是空的</div>
        <footer><button @click="emit('close')">关闭</button></footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.dialog-backdrop { position: fixed; inset: 0; z-index: 750; display: grid; place-items: center; padding: 20px; background: rgba(7,6,9,.68); backdrop-filter: blur(9px); }
.dialog-card { width: min(620px, 100%); padding: 22px; border: 1px solid rgba(255,255,255,.1); border-radius: 16px; background: #1c1921; box-shadow: 0 30px 80px rgba(0,0,0,.48); }
.dialog-card h2 { margin: 0; font-size: 19px; }
.recycle-list { display: grid; gap: 6px; margin-top: 18px; max-height: 360px; overflow: auto; }
.recycle-row { display: flex; align-items: center; gap: 8px; padding: 9px; border: 1px solid rgba(255,255,255,.06); border-radius: 8px; background: rgba(255,255,255,.02); }
.recycle-row img, .thumb-placeholder { width: 48px; height: 48px; flex: 0 0 48px; object-fit: cover; border-radius: 6px; background: #16151b; color: var(--text-tertiary); display: grid; place-items: center; font-size: 8px; }
.recycle-row span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); font-size: 10px; }
.recycle-row button { height: 28px; padding: 0 9px; border: 1px solid rgba(255,255,255,.08); border-radius: 7px; background: rgba(255,255,255,.035); color: var(--text-secondary); cursor: pointer; font-size: 9px; }
.empty { padding: 30px; text-align: center; color: var(--text-tertiary); }
footer { display: flex; justify-content: flex-end; margin-top: 18px; }
footer button { height: 34px; padding: 0 14px; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; background: rgba(255,255,255,.035); color: var(--text-secondary); cursor: pointer; }
</style>
