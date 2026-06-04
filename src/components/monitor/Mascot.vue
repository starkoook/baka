<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

type Pose = 'idle' | 'walking' | 'sitting' | 'sleeping' | 'bounce'
const pose = ref<Pose>('idle')
const facing = ref(1)
const posX = ref(0)
const message = ref('')
const hearts = ref<{ id: number; x: number; y: number; c: string }[]>([])
let hid = 0

// Mouse parallax
const tiltX = ref(0); const tiltY = ref(0)

// Timers
let poseTimer: number | null = null
let walkTimer: number | null = null
let idleMsgTimer: number | null = null

// ── Mouse tracking ──
function onMouse(e: MouseEvent) {
  const cx = window.innerWidth / 2; const cy = window.innerHeight / 2
  tiltX.value = ((e.clientX - cx) / cx) * 8
  tiltY.value = ((e.clientY - cy) / cy) * 6
}

// ── State machine ──
function changePose() {
  stopWalk()
  const r = Math.random()
  if (r < 0.4) setPose('idle')
  else if (r < 0.65) setPose('walking')
  else if (r < 0.8) setPose('sitting')
  else setPose('sleeping')
}

function setPose(p: Pose) {
  pose.value = p
  if (p === 'walking') startWalk()
  if (p === 'sleeping') {
    idleMsgTimer = setInterval(() => {
      if (pose.value === 'sleeping') {
        message.value = ['Zzz...', 'zzZ...', '呼...'][Math.floor(Math.random() * 3)]
        setTimeout(() => { if (pose.value === 'sleeping') message.value = '' }, 2500)
      }
    }, 4000)
  } else {
    if (idleMsgTimer) { clearInterval(idleMsgTimer); idleMsgTimer = null }
    message.value = ''
  }
}

function startWalk() {
  walkTimer = window.setInterval(() => {
    if (pose.value !== 'walking') return
    posX.value += 2 * facing.value
    if (posX.value > 45) facing.value = -1
    if (posX.value < -45) facing.value = 1
    if (Math.random() < 0.008) setPose('idle')
  }, 45)
}

function stopWalk() { if (walkTimer) { clearInterval(walkTimer); walkTimer = null } }

// ── Click ──
function handleClick(e: MouseEvent) {
  pose.value = 'bounce'
  setTimeout(() => { pose.value = 'idle' }, 500)

  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const cx = ((e.clientX - rect.left) / rect.width) * 100
  const cy = ((e.clientY - rect.top) / rect.height) * 100

  for (let i = 0; i < 4; i++) {
    const id = ++hid
    hearts.value = [...hearts.value.slice(-8), {
      id, c: ['❤️','💖','💕','✨','💝'][i % 5],
      x: cx + (Math.random() - 0.5) * 35,
      y: cy + (Math.random() - 0.5) * 25,
    }]
    setTimeout(() => { hearts.value = hearts.value.filter(h => h.id !== id) }, 1300)
  }

  message.value = ['呀！','别戳~','嗯？','> <','哼！','嘿嘿~'][Math.floor(Math.random() * 6)]
  setTimeout(() => { message.value = '' }, 2000)

  if (pose.value === 'sleeping') setPose('idle')
}

onMounted(() => {
  window.addEventListener('mousemove', onMouse)
  poseTimer = window.setInterval(changePose, 10000 + Math.random() * 6000)
})

onUnmounted(() => {
  window.removeEventListener('mousemove', onMouse)
  if (poseTimer) clearInterval(poseTimer)
  if (walkTimer) clearInterval(walkTimer)
  if (idleMsgTimer) clearInterval(idleMsgTimer)
})
</script>

<template>
  <div class="mascot-root">
    <!-- Speech -->
    <Transition name="bub">
      <div class="speech" v-if="message">{{ message }}</div>
    </Transition>

    <!-- Character body -->
    <div
      class="mascot-body"
      :class="pose"
      :style="{
        transform: `translateX(${posX}px) scaleX(${facing}) rotate(${tiltX * 0.15}deg)`,
      }"
      @click="handleClick"
    >
      <img src="/mascot.png" alt="mascot" class="mascot-img" />

      <!-- Hearts -->
      <TransitionGroup name="h">
        <span v-for="h in hearts" :key="h.id" class="heart" :style="{ left: h.x + '%', top: h.y + '%' }">{{ h.c }}</span>
      </TransitionGroup>
    </div>

    <!-- Shadow -->
    <div class="shadow" :class="pose"></div>
  </div>
</template>

<style scoped>
.mascot-root { position: relative; display: flex; flex-direction: column; align-items: center; user-select: none; }

.speech {
  position: absolute; top: -8px; left: 50%; transform: translateX(-50%);
  background: rgba(255,255,255,0.14); backdrop-filter: blur(24px);
  border: 1px solid rgba(255,0,127,0.3); border-radius: var(--radius-lg);
  padding: 5px 14px; font-size: 12px; color: var(--text-primary);
  white-space: nowrap; z-index: 5; pointer-events: none;
}
.speech::after { content:''; position:absolute; bottom:-6px; left:50%; transform:translateX(-50%); width:0;height:0; border-left:6px solid transparent; border-right:6px solid transparent; border-top:6px solid rgba(255,255,255,0.14); }
.bub-enter-active { transition: all 0.35s cubic-bezier(0.34,1.56,0.64,1); }
.bub-leave-active { transition: all 0.2s ease; }
.bub-enter-from { opacity:0; transform:translateX(-50%) translateY(8px) scale(0.8); }
.bub-leave-to { opacity:0; }

.mascot-body {
  width: 140px; height: 200px;
  cursor: pointer; position: relative;
  transition: transform 0.8s cubic-bezier(0.34,1.56,0.64,1);
  transform-origin: center bottom;
}

.mascot-img {
  width: 100%; height: 100%;
  object-fit: contain;
  pointer-events: none;
  filter: drop-shadow(0 4px 12px rgba(0,0,0,0.3));
}

/* ── Poses ── */
.mascot-body.idle { animation: p-idle 3.5s ease-in-out infinite; }
.mascot-body.walking { animation: p-walk 0.5s ease-in-out infinite; }
.mascot-body.sitting { animation: p-sit 5s ease-in-out infinite; }
.mascot-body.sleeping { animation: p-sleep 5s ease-in-out infinite; }
.mascot-body.sleeping .mascot-img { filter: drop-shadow(0 4px 12px rgba(0,0,0,0.3)) brightness(0.7) saturate(0.6); }
.mascot-body.bounce { animation: p-bounce 0.5s ease; }

.shadow {
  width: 45px; height: 6px; background: rgba(0,0,0,0.15);
  border-radius: 50%; margin-top: 6px; transition: all 0.5s ease;
}
.shadow.sitting { width: 28px; height: 4px; opacity: 0.5; }
.shadow.sleeping { width: 55px; height: 3px; opacity: 0.3; }
.shadow.walking { animation: s-walk 0.5s ease-in-out infinite; }

/* Hearts */
.heart { position: absolute; font-size: 16px; pointer-events: none; z-index: 10; transform: translate(-50%, -50%); }
.h-enter-active { animation: h-pop 1.3s ease-out forwards; }

@keyframes p-idle { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-5px);} }
@keyframes p-walk { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-10px);} }
@keyframes p-sit { 0%,100%{transform:translateY(5px) scale(0.95);} 50%{transform:translateY(2px) scale(0.96);} }
@keyframes p-sleep { 0%,100%{transform:translateY(0) scale(0.95);} 50%{transform:translateY(-2px) scale(0.97);} }
@keyframes p-bounce { 0%{transform:scale(1);} 20%{transform:scale(1.15);} 40%{transform:scale(0.88);} 60%{transform:scale(1.06);} 100%{transform:scale(1);} }
@keyframes s-walk { 0%,100%{transform:scaleX(1);} 50%{transform:scaleX(0.65);} }
@keyframes h-pop { 0%{transform:translate(-50%,-50%) scale(0);opacity:1;} 30%{transform:translate(-50%,-130%) scale(1.3);opacity:0.9;} 100%{transform:translate(-50%,-230%) scale(0.3);opacity:0;} }
</style>
