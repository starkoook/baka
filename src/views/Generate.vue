<script setup lang="ts">
</script>

<template>
  <div class="placeholder-page">
    <div class="page-header">
      <h1 class="page-title">✨ AI 生成</h1>
      <p class="page-desc">Gemini / NovelAI 云端 API 图像生成</p>
    </div>

    <div class="placeholder-panel glass-panel">
      <div class="empty-state">
        <div class="placeholder-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
            <path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5z"/>
            <path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z"/>
          </svg>
        </div>
        <p class="placeholder-title">🐾 功能开发中</p>
        <p class="placeholder-desc">即将支持多平台 API 接入与批量生成</p>
        <div class="paw-prints"><span>🐾</span><span>🐾</span><span>🐾</span></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.placeholder-page { max-width: 960px; margin: 0 auto; }
.page-header { margin-bottom: 24px; }
.page-title { font-size: 24px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px; letter-spacing: -0.01em; }
.page-desc { font-size: 13px; color: var(--text-tertiary); }
.placeholder-panel {
  padding: 80px 24px;
  background: linear-gradient(180deg, var(--glass-bg) 0%, rgba(var(--accent-primary-rgb), 0.04) 100%);
  border: 1px solid rgba(var(--accent-primary-rgb), 0.08);
}
.placeholder-icon {
  width: 64px; height: 64px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(var(--accent-primary-rgb), 0.15), rgba(var(--accent-secondary-rgb), 0.08));
  color: var(--accent-primary);
  margin-bottom: 18px;
  box-shadow: 0 0 20px rgba(var(--accent-primary-rgb), 0.1);
}
.placeholder-icon svg { width: 30px; height: 30px; }
.placeholder-title { font-size: 17px; font-weight: 700; color: var(--text-secondary); margin-bottom: 6px; }
.placeholder-desc { font-size: 13px; color: var(--text-tertiary); }
.paw-prints { display: flex; gap: 8px; margin-top: 16px; opacity: 0.3; font-size: 16px; }
</style>
