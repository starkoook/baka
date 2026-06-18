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
    class="card hover-lift card-entrance"
    :class="{ clickable: !!to && !disabled, disabled, 'lock-clicked': clicked }"
    :style="index != null ? { animationDelay: index * 0.1 + 's' } : {}"
    @click="disabled ? onLockClick() : null"
  >
    <div class="card-glow"></div>

    <!-- Matrix code rain for locked cards -->
    <div class="matrix-rain" v-if="disabled">
      <span v-for="i in 8" :key="i" class="matrix-col" :style="{
        left: (i * 12 + Math.random() * 7) + '%',
        animationDelay: (i * 0.3) + 's',
        animationDuration: (1.5 + Math.random() * 2) + 's',
      }">{{ '01' }}</span>
    </div>

    <!-- Lock icon -->
    <div class="lock-overlay" v-if="disabled">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="lock-icon">
        <rect x="5" y="11" width="14" height="11" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/><circle cx="12" cy="16" r="1.5" fill="currentColor" stroke="none"/>
      </svg>
    </div>

    <div class="card-icon" v-if="icon">
      <div class="icon-bg"></div>
      <svg v-if="icon === 'tag'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><circle cx="7" cy="7" r="1.5" fill="currentColor" stroke="none"/>
      </svg>
      <svg v-else-if="icon === 'zoom'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/><path d="M11 8v6M8 11h6"/>
      </svg>
      <svg v-else-if="icon === 'sparkle'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5z"/><path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z"/>
      </svg>
      <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
      </svg>
    </div>
    <div class="card-body">
      <h3 class="card-title">{{ title }}</h3>
      <p class="card-desc" v-if="description">{{ description }}</p>
    </div>
    <div class="card-arrow" v-if="to && !disabled">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
    </div>
    <!-- HUD corner reticles -->
    <span class="card-reticle tl"></span><span class="card-reticle tr"></span>
    <span class="card-reticle bl"></span><span class="card-reticle br"></span>
    <!-- Spec code -->
    <span class="card-spec">[SPEC: WD14_BKB_v0.1]</span>
    <div class="card-badge" v-if="disabled">🔒 即将推出</div>
    <div class="lock-msg" v-if="clicked">{{ clickMsg }}</div>
  </component>
</template>

<style scoped>
.card {
  display: flex; align-items: center; gap: 16px; padding: 18px 22px;
  background: var(--hud-bg);
  border: 1px solid rgba(255,255,255,0.04);
  border-radius: var(--radius-md);
  box-shadow: inset 0 4px 12px rgba(0,0,0,0.5);
  transition: all var(--transition-base); text-decoration: none; color: inherit;
  position: relative; overflow: hidden;
}
.card-entrance { animation: card-in 0.55s cubic-bezier(0.34,1.56,0.64,1) both; }
@keyframes card-in { 0%{opacity:0;transform:translateY(24px) scale(0.92)} 100%{opacity:1;transform:translateY(0) scale(1)} }
.card-glow { position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse at 50% 0%,rgba(var(--accent-primary-rgb),0.1) 0%,transparent 70%);transition:opacity var(--transition-base);pointer-events:none; }
.card.clickable { cursor:pointer; }
.card.clickable:hover { background:var(--hud-bg-lighter);border-color:rgba(244,114,182,0.2);box-shadow:inset 0 4px 12px rgba(0,0,0,0.5),0 0 24px rgba(244,114,182,0.18);transform:perspective(600px) rotateX(3deg) translateY(-2px); }
.card.clickable:hover .card-reticle { opacity:1; }
.card.clickable:hover .card-glow { opacity:1; }

/* ── Disabled / Locked cards ── */
.card.disabled { opacity: 0.5; cursor: pointer; pointer-events: auto; transition: all 0.3s ease; }
.card.disabled:hover { opacity: 0.75; border-color: rgba(var(--accent-primary-rgb), 0.3); }

/* Matrix rain */
.matrix-rain { position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity 0.3s; overflow:hidden; }
.card.disabled:hover .matrix-rain { opacity: 1; }
.matrix-col { position:absolute;top:-20px;font-family:var(--font-mono);font-size:10px;color:rgba(var(--accent-primary-rgb),0.3);animation:matrix-drop linear infinite;writing-mode:vertical-rl; }
@keyframes matrix-drop { 0%{transform:translateY(-20px)} 100%{transform:translateY(120px)} }

/* Lock overlay */
.lock-overlay { position:absolute;right:16px;top:50%;transform:translateY(-50%);opacity:0;transition:all 0.3s;pointer-events:none;z-index:2; }
.card.disabled:hover .lock-overlay { opacity: 0.7; }
.lock-icon { width:28px;height:28px;color:var(--accent-primary);filter:drop-shadow(0 0 6px rgba(var(--accent-primary-rgb),0.4)); }

/* Lock message toast */
.lock-msg { position:absolute;bottom:-36px;left:50%;transform:translateX(-50%);background:rgba(var(--accent-primary-rgb),0.15);backdrop-filter:blur(20px);border:1px solid rgba(var(--accent-primary-rgb),0.3);border-radius:var(--radius-lg);padding:6px 16px;font-size:12px;color:var(--accent-primary);white-space:nowrap;z-index:5;animation:msg-pop 2.5s ease;pointer-events:none; }
@keyframes msg-pop { 0%{opacity:0;transform:translateX(-50%) translateY(10px)} 15%{opacity:1;transform:translateX(-50%) translateY(0)} 85%{opacity:1} 100%{opacity:0;transform:translateX(-50%) translateY(-10px)} }

.card-icon { display:flex;align-items:center;justify-content:center;width:52px;height:52px;border-radius:var(--radius-sm);flex-shrink:0;position:relative;color:var(--accent-primary); }
.icon-bg { position:absolute;inset:0;border-radius:var(--radius-sm);background:linear-gradient(135deg,rgba(var(--accent-primary-rgb),0.22) 0%,rgba(var(--accent-secondary-rgb),0.1) 100%);border:1px solid rgba(var(--accent-primary-rgb),0.2); }
.card.disabled .icon-bg { opacity:0.5; }
.card-icon svg { width:26px;height:26px;position:relative;z-index:1; }
.card-body { flex:1;min-width:0; }
.card-title { font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:2px;letter-spacing:0.01em; }
.card-desc { font-size:12px;color:var(--text-tertiary);line-height:1.4; }
.card-arrow { flex-shrink:0;color:var(--text-tertiary);transition:all var(--transition-base); }
.card.clickable:hover .card-arrow { transform:translateX(4px);color:var(--accent-primary); }
.card-arrow svg { width:18px;height:18px; }
.card-badge {
  position:absolute;top:10px;right:14px;font-size:10px;font-weight:600;
  background:rgba(var(--accent-primary-rgb),0.08);color:var(--accent-primary);
  padding:4px 12px;border-radius:var(--radius-full);
  border:1px solid rgba(var(--accent-primary-rgb),0.2);letter-spacing:0.03em;backdrop-filter:blur(8px);
  z-index:1;
}
.card.disabled:hover .card-badge { animation:lock-shake 0.4s ease;background:rgba(var(--accent-primary-rgb),0.15); }
@keyframes lock-shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-3px)} 75%{transform:translateX(3px)} }

/* HUD corner reticles */
.card-reticle { position:absolute; width:8px;height:8px;pointer-events:none;z-index:1;opacity:0;transition:opacity 0.3s; }
.card-reticle.tl { top:4px;left:4px;border-top:1px solid rgba(244,114,182,0.25);border-left:1px solid rgba(244,114,182,0.25); }
.card-reticle.tr { top:4px;right:4px;border-top:1px solid rgba(244,114,182,0.25);border-right:1px solid rgba(244,114,182,0.25); }
.card-reticle.bl { bottom:4px;left:4px;border-bottom:1px solid rgba(244,114,182,0.25);border-left:1px solid rgba(244,114,182,0.25); }
.card-reticle.br { bottom:4px;right:4px;border-bottom:1px solid rgba(244,114,182,0.25);border-right:1px solid rgba(244,114,182,0.25); }
.card-spec { position:absolute;bottom:4px;right:16px;font-family:var(--font-mono);font-size:7px;color:rgba(244,114,182,0.15);letter-spacing:0.06em;pointer-events:none;z-index:1; }

/* Light theme */
[data-theme="light"] .card { background:linear-gradient(135deg,#fff 0%,#FFF5F7 100%);border-color:rgba(236,72,153,0.2);box-shadow:0 4px 12px rgba(255,182,193,0.1); }
[data-theme="light"] .card-title { color:#2D2627; }
[data-theme="light"] .card-desc { color:#665557; }
[data-theme="light"] .card-icon { color:#FF1493; }
[data-theme="light"] .card.disabled { opacity:0.55; }
[data-theme="light"] .card.clickable:hover { background:#FFF0F5;border-color:#FF69B4;box-shadow:inset 0 2px 6px rgba(0,0,0,0.03),0 0 20px rgba(255,105,180,0.3); }
</style>
