<script setup lang="ts">
defineProps<{
  greeting: string
  question: string
  actionLabel: string
  showMascot: boolean
}>()

const emit = defineEmits<{
  action: []
  openTools: []
}>()
</script>

<template>
  <section class="hero-card" aria-labelledby="hero-title">
    <i class="hero-card__ring" aria-hidden="true"></i>
    <div class="hero-card__copy">
      <slot name="eyebrow" />
      <h1 id="hero-title">
        <span class="hero-card__wave">{{ greeting }}</span>
        <span class="hero-card__flower" aria-hidden="true">✿</span>
        <small>{{ question }}</small>
      </h1>
      <div class="hero-card__actions">
        <button class="btn btn-primary btn-lg" type="button" @click="emit('action')">{{ actionLabel }} →</button>
        <button class="btn btn-secondary btn-lg" type="button" @click="emit('openTools')">打开工具选择</button>
      </div>
    </div>
    <img v-if="showMascot" class="hero-card__mascot" src="/mascot.png" alt="" aria-hidden="true" />
  </section>
</template>

<style scoped>
.hero-card {
  position: relative;
  height: 300px;
  border-radius: var(--radius-hero);
  background: var(--gradient-hero);
  box-shadow: var(--surface-shadow-lg);
  /* 人物要越过卡片顶边，所以不能 overflow hidden；光环用 clip 单独裁 */
}
.hero-card__ring {
  position: absolute; right: 250px; top: -40px; width: 260px; height: 260px; border-radius: 50%;
  border: 26px solid rgba(255, 255, 255, 0.55); pointer-events: none;
  clip-path: inset(40px 0 0 0);
}
.hero-card__copy { position: absolute; left: 44px; top: 44px; z-index: 2; max-width: min(480px, 60%); }
.hero-card h1 { margin-top: 14px; font-size: clamp(34px, 3.4vw, 46px); font-weight: 900; letter-spacing: -0.02em; line-height: 1.08; color: var(--ink-primary); }
.hero-card h1 small { display: block; font-size: 20px; font-weight: 600; color: var(--ink-secondary); margin-top: 14px; letter-spacing: 0; }
.hero-card__flower { color: var(--brand-primary); margin-left: 8px; }
.hero-card__wave { position: relative; display: inline-block; }
.hero-card__wave::after {
  content: ""; position: absolute; left: 0; right: 0; bottom: -6px; height: 10px; opacity: 0.9;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 10' preserveAspectRatio='none'%3E%3Cpath d='M0 6 Q 7.5 0 15 6 T 30 6 T 45 6 T 60 6' fill='none' stroke='%23ff7eb6' stroke-width='3.2' stroke-linecap='round'/%3E%3C/svg%3E") repeat-x;
  background-size: 60px 10px;
}
.hero-card__actions { display: flex; gap: 10px; margin-top: 26px; align-items: center; flex-wrap: wrap; }
.hero-card__mascot {
  position: absolute; right: 16px; bottom: 0; height: 392px; width: auto; z-index: 2; pointer-events: none;
  filter: drop-shadow(0 24px 30px rgba(74, 45, 61, 0.25));
  -webkit-mask-image: linear-gradient(180deg, #000 80%, transparent 99%);
  mask-image: linear-gradient(180deg, #000 80%, transparent 99%);
}
@media (max-width: 1240px) {
  .hero-card__mascot { height: 340px; right: 0; }
  .hero-card__ring { right: 200px; }
}
@media (max-width: 1080px) {
  .hero-card { height: 280px; }
  .hero-card__mascot { height: 300px; opacity: 0.9; }
  .hero-card__copy { max-width: 62%; }
}
</style>
