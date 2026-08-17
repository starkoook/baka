<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  title: string; description?: string; icon?: string; to?: string; disabled?: boolean; index?: number
}>()

const clicked = ref(false)
const clickMsg = ref('')

const lockedMsgs = [
  '模块正在充能中，别急嘛！', '还没有给Baka大人充能，打不开哦~',
  '这个功能还在开发中呢！', '别戳了，开发还没做完~',
]

function onLockClick() {
  clicked.value = true
  clickMsg.value = lockedMsgs[Math.floor(Math.random() * lockedMsgs.length)]
  setTimeout(() => { clicked.value = false; clickMsg.value = '' }, 2500)
}
</script>

<template>
  <component
    :is="to && !disabled ? 'router-link' : 'div'"
    :to="to"
    class="mod-card card-entrance"
    :class="{ clickable: !!to && !disabled, disabled, 'lock-clicked': clicked }"
    :style="index != null ? { animationDelay: index * 0.1 + 's' } : {}"
    @click="disabled ? onLockClick() : null"
  >
    <div class="mc-shimmer" v-if="disabled"></div>

    <div class="mc-icon" v-if="icon">
      <svg v-if="icon === 'tag'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><circle cx="7" cy="7" r="1.5" fill="currentColor" stroke="none"/>
      </svg>
      <svg v-else-if="icon === 'zoom'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
        <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/><path d="M11 8v6M8 11h6"/>
      </svg>
      <svg v-else-if="icon === 'sparkle'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
        <path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5z"/><path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z"/>
      </svg>
      <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
        <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
      </svg>
    </div>

    <div class="mc-body">
      <h3 class="mc-title">{{ title }}</h3>
      <p class="mc-desc" v-if="description">{{ description }}</p>
    </div>

    <div class="mc-arrow" v-if="to && !disabled">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
    </div>

    <span class="mc-badge" v-if="disabled">🔒 即将推出</span>
    <div class="mc-msg" v-if="clicked">{{ clickMsg }}</div>
  </component>
</template>

<style scoped>
.mod-card {
  display: flex; align-items: center; gap: 16px;
  padding: 20px 22px;
  background: var(--glass-bg);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  box-shadow: var(--elev-1);
  text-decoration: none; color: inherit;
  position: relative; overflow: hidden;
  transition: border-color var(--transition-base), background var(--transition-base), transform var(--transition-base), box-shadow var(--transition-base);
}
.mod-card.clickable { cursor: pointer; }
.mod-card.clickable:hover {
  border-color: var(--border-accent);
  background: var(--glass-bg-hover);
  transform: translateY(-3px);
  box-shadow: var(--elev-2), 0 0 26px rgba(var(--accent-primary-rgb), 0.18);
}
.mod-card.clickable:hover .mc-arrow { transform: translateX(4px); color: var(--accent-primary); }
.mod-card.clickable:hover .mc-icon { border-color: rgba(var(--accent-primary-rgb), 0.4); box-shadow: var(--accent-glow); }

/* Locked state — calm, not busy */
.mod-card.disabled { opacity: 0.62; cursor: pointer; }
.mod-card.disabled:hover { opacity: 0.85; border-color: rgba(var(--accent-primary-rgb), 0.3); }
.mc-shimmer {
  position: absolute; top: 0; left: -60%; width: 50%; height: 100%;
  background: linear-gradient(100deg, transparent, rgba(var(--accent-primary-rgb), 0.10), transparent);
  animation: mc-shimmer 3.2s ease-in-out infinite; pointer-events: none;
}
@keyframes mc-shimmer { 0% { left: -60%; } 60%,100% { left: 130%; } }

.mc-icon {
  display: flex; align-items: center; justify-content: center;
  width: 50px; height: 50px; border-radius: var(--radius-sm); flex-shrink: 0;
  color: var(--accent-primary);
  background: linear-gradient(135deg, rgba(var(--accent-primary-rgb),0.20), rgba(var(--accent-secondary-rgb),0.08));
  border: 1px solid rgba(var(--accent-primary-rgb),0.20);
  transition: border-color var(--transition-base), box-shadow var(--transition-base);
}
.mc-icon svg { width: 25px; height: 25px; }

.mc-body { flex: 1; min-width: 0; }
.mc-title { font-size: 15px; font-weight: 700; color: var(--text-primary); margin-bottom: 3px; letter-spacing: 0.01em; }
.mc-desc { font-size: 12px; color: var(--text-tertiary); line-height: 1.45; }

.mc-arrow { flex-shrink: 0; color: var(--text-tertiary); transition: all var(--transition-base); }
.mc-arrow svg { width: 18px; height: 18px; }

.mc-badge {
  position: absolute; top: 12px; right: 16px;
  font-size: 10px; font-weight: 600;
  background: rgba(var(--accent-primary-rgb),0.10); color: var(--accent-primary);
  padding: 3px 10px; border-radius: var(--radius-full);
  border: 1px solid rgba(var(--accent-primary-rgb),0.22);
  letter-spacing: 0.03em; z-index: 1;
}

.mc-msg {
  position: absolute; bottom: -38px; left: 50%; transform: translateX(-50%);
  background: rgba(var(--accent-primary-rgb),0.16); backdrop-filter: blur(20px);
  border: 1px solid rgba(var(--accent-primary-rgb),0.32); border-radius: var(--radius-lg);
  padding: 6px 16px; font-size: 12px; color: var(--accent-primary); white-space: nowrap;
  z-index: 5; animation: mc-msg 2.5s ease; pointer-events: none;
}
@keyframes mc-msg {
  0% { opacity: 0; transform: translateX(-50%) translateY(10px); }
  15% { opacity: 1; transform: translateX(-50%) translateY(0); }
  85% { opacity: 1; }
  100% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
}

/* Light theme */
[data-theme="light"] .mod-card { background: #fff; border-color: rgba(236,72,153,0.14); box-shadow: var(--shadow-sm); }
[data-theme="light"] .mod-card.clickable:hover { background: #fff; border-color: rgba(236,72,153,0.4); box-shadow: var(--shadow-md), 0 0 22px rgba(236,72,153,0.22); }
[data-theme="light"] .mc-icon { color: #ec4899; }
[data-theme="light"] .mc-title { color: #2a1326; }
[data-theme="light"] .mc-desc { color: #7d5d75; }
[data-theme="light"] .mod-card.disabled { opacity: 0.66; }
</style>
