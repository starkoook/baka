<script setup lang="ts">
defineProps<{
  title: string
  description?: string
  icon?: string
  to?: string
  disabled?: boolean
  index?: number
}>()
</script>

<template>
  <component
    :is="to && !disabled ? 'router-link' : 'div'"
    :to="to"
    class="card hover-lift card-entrance"
    :class="{ clickable: !!to && !disabled, disabled }"
    :style="index != null ? { animationDelay: index * 0.1 + 's' } : {}"
  >
    <div class="card-glow"></div>
    <div class="card-icon" v-if="icon">
      <div class="icon-bg"></div>
      <svg v-if="icon === 'tag'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/>
        <circle cx="7" cy="7" r="1.5" fill="currentColor" stroke="none"/>
      </svg>
      <svg v-else-if="icon === 'zoom'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="11" cy="11" r="7"/>
        <path d="M21 21l-4.35-4.35"/>
        <path d="M11 8v6M8 11h6"/>
      </svg>
      <svg v-else-if="icon === 'sparkle'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5z"/>
        <path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z"/>
      </svg>
      <svg v-else-if="icon === 'gear'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
      </svg>
      <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <path d="M21 15l-5-5L5 21"/>
      </svg>
    </div>
    <div class="card-body">
      <h3 class="card-title">{{ title }}</h3>
      <p class="card-desc" v-if="description">{{ description }}</p>
    </div>
    <div class="card-arrow" v-if="to && !disabled">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 18l6-6-6-6"/>
      </svg>
    </div>
    <div class="card-badge" v-if="disabled">即将推出</div>
  </component>
</template>

<style scoped>
.card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px 22px;
  background: var(--glass-bg);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  transition: all var(--transition-base);
  text-decoration: none;
  color: inherit;
  position: relative;
  overflow: hidden;
}

/* ── Entrance animation ── */
.card-entrance {
  animation: card-in 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

@keyframes card-in {
  0% {
    opacity: 0;
    transform: translateY(24px) scale(0.92);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.card-glow {
  position: absolute;
  inset: 0;
  opacity: 0;
  background: radial-gradient(ellipse at 50% 0%, rgba(var(--accent-primary-rgb), 0.1) 0%, transparent 70%);
  transition: opacity var(--transition-base);
  pointer-events: none;
}

.card.clickable { cursor: pointer; }

.card.clickable:hover {
  background: var(--glass-bg-hover);
  border-color: var(--border-accent);
  box-shadow: var(--shadow-glow);
  transform: translateY(-1px);
}

.card.clickable:hover .card-glow { opacity: 1; }
.card.disabled { opacity: 0.45; pointer-events: none; }

.card-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
  position: relative;
  color: var(--accent-primary);
}

.icon-bg {
  position: absolute;
  inset: 0;
  border-radius: var(--radius-sm);
  background: linear-gradient(135deg, rgba(var(--accent-primary-rgb), 0.22) 0%, rgba(var(--accent-secondary-rgb), 0.1) 100%);
  border: 1px solid rgba(var(--accent-primary-rgb), 0.2);
}

.card-icon svg { width: 26px; height: 26px; position: relative; z-index: 1; }

.card-body { flex: 1; min-width: 0; }
.card-title { font-size: 15px; font-weight: 600; color: var(--text-primary); margin-bottom: 2px; letter-spacing: 0.01em; }
.card-desc { font-size: 12px; color: var(--text-tertiary); line-height: 1.4; }

.card-arrow {
  flex-shrink: 0;
  color: var(--text-tertiary);
  transition: all var(--transition-base);
}

.card.clickable:hover .card-arrow {
  transform: translateX(4px);
  color: var(--accent-primary);
}

.card-arrow svg { width: 18px; height: 18px; }

.card-badge {
  position: absolute;
  top: 10px; right: 14px;
  font-size: 10px; font-weight: 500;
  background: var(--glass-bg);
  color: var(--text-tertiary);
  padding: 3px 10px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-subtle);
}
</style>
