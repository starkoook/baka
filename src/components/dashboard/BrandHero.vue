<script setup lang="ts">
defineProps<{
  actionLabel: string
  showArtwork: boolean
}>()

const emit = defineEmits<{
  action: []
}>()
</script>

<template>
  <section class="brand-hero" aria-labelledby="brand-hero-title">
    <picture v-if="showArtwork" class="brand-hero__artwork" aria-hidden="true">
      <source
        media="(max-width: 1200px)"
        srcset="/branding/dashboard-hero-1200.webp"
        type="image/webp"
      />
      <img
        class="brand-hero__image"
        src="/branding/dashboard-hero-1920.webp"
        alt=""
      />
    </picture>

    <div class="brand-hero__shade" aria-hidden="true"></div>

    <div class="brand-hero__copy">
      <p class="brand-hero__kicker">BAKA CREATIVE STUDIO</p>
      <h1 id="brand-hero-title">欢迎回来，继续完成你的作品。</h1>
      <p class="brand-hero__description">
        素材整理、标注和 LoRA 训练都在同一个本地工作区。
      </p>
      <button class="btn btn-primary brand-hero__action" type="button" @click="emit('action')">
        {{ actionLabel }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.brand-hero {
  position: relative;
  isolation: isolate;
  display: flex;
  width: 100%;
  min-height: 300px;
  max-height: 380px;
  aspect-ratio: 8 / 3;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: var(--radius-hero);
  background:
    radial-gradient(circle at 78% 24%, rgba(239, 126, 170, 0.3), transparent 28%),
    linear-gradient(120deg, #29233f 0%, #4f467d 56%, #8f82e4 100%);
  box-shadow: var(--surface-shadow);
}

.brand-hero__artwork,
.brand-hero__image,
.brand-hero__shade {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.brand-hero__artwork {
  z-index: -2;
}

.brand-hero__image {
  object-fit: cover;
  object-position: center;
  animation: hero-breathe 12s ease-in-out infinite alternate;
}

.brand-hero__shade {
  z-index: -1;
  background: linear-gradient(
    90deg,
    rgba(24, 18, 31, 0.88) 0%,
    rgba(24, 18, 31, 0.72) 34%,
    rgba(24, 18, 31, 0.3) 58%,
    rgba(24, 18, 31, 0.04) 78%
  );
}

.brand-hero__copy {
  align-self: center;
  width: min(45%, 560px);
  margin-left: clamp(28px, 4vw, 64px);
  color: #ffffff;
}

.brand-hero__kicker {
  margin-bottom: 12px;
  color: rgba(255, 255, 255, 0.76);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.18em;
}

.brand-hero h1 {
  max-width: 520px;
  color: #ffffff;
  font-size: clamp(30px, 3.2vw, 48px);
  line-height: 1.16;
  letter-spacing: -0.035em;
}

.brand-hero__description {
  max-width: 480px;
  margin-top: 16px;
  color: rgba(255, 255, 255, 0.84);
  font-size: 14px;
}

.brand-hero__action {
  margin-top: 24px;
}

@keyframes hero-breathe {
  from {
    transform: scale(1);
  }

  to {
    transform: scale(1.03);
  }
}

@media (max-width: 1200px) {
  .brand-hero__copy {
    width: 52%;
    margin-left: 32px;
  }

  .brand-hero h1 {
    font-size: clamp(28px, 3.6vw, 40px);
  }
}

@media (max-width: 760px) {
  .brand-hero {
    min-height: 320px;
    aspect-ratio: auto;
  }

  .brand-hero__shade {
    background: linear-gradient(90deg, rgba(24, 18, 31, 0.92), rgba(24, 18, 31, 0.46));
  }

  .brand-hero__copy {
    width: calc(100% - 56px);
    margin-left: 28px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .brand-hero__image {
    animation: none;
    transform: none;
  }
}
</style>
