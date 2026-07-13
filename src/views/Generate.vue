<script setup lang="ts"></script>
<template>
  <div class="gen-root">
    <div class="cabin-panel gen-card">
      <span class="cabin-label">/// GENERATE</span>
      <div class="cabin-panel-br"></div>
      <div class="gen-glow"></div>
      <div class="gen-icon">✨</div>
      <h1>AI 生成</h1>
      <p class="gen-sub">Gemini / NovelAI / OpenAI 云端图像生成</p>
      <div class="gen-features">
        <div class="gen-feat"><span class="gen-check">✓</span> 多平台 API 接入</div>
        <div class="gen-feat"><span class="gen-dot">○</span> 提示词模板库</div>
        <div class="gen-feat"><span class="gen-dot">○</span> 批量生成</div>
        <div class="gen-feat"><span class="gen-dot">○</span> 图生图 & ControlNet</div>
      </div>
      <div class="gen-bar"><div class="gen-fill" style="width:15%"></div></div>
      <p class="gen-eta">开发进度 15% · 规划中</p>
    </div>
  </div>
</template>

<style scoped>
.gen-root { max-width: 700px; margin: 0 auto; }
.gen-card { text-align: center; padding: 60px 24px; position: relative; overflow: hidden; }
.gen-glow {
  position: absolute; width: 300px; height: 300px; border-radius: 50%;
  background: radial-gradient(circle, var(--accent-glow) 0%, transparent 70%);
  top: 50%; left: 50%; transform: translate(-50%, -50%); pointer-events: none;
}
.gen-icon { font-size: 56px; margin-bottom: 16px; position: relative; }
.gen-card h1 { font-size: 28px; font-weight: 700; color: var(--text-primary); margin: 0 0 8px; position: relative; }
.gen-sub { font-size: 14px; color: var(--text-tertiary); margin: 0 0 36px; position: relative; }
.gen-features {
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
  max-width: 380px; margin: 0 auto 28px; text-align: left; position: relative;
}
.gen-feat {
  font-size: 13px; color: var(--text-secondary);
  padding: 8px 12px;
  background: var(--hud-bg); border: 1px solid var(--hud-border);
  border-radius: var(--radius-sm);
}
.gen-check { color: var(--accent-success); margin-right: 6px; font-weight: 700; }
.gen-dot { color: var(--text-tertiary); margin-right: 6px; }
.gen-bar {
  width: 200px; height: 3px;
  background: var(--hud-bg); border: 1px solid var(--hud-border);
  border-radius: 2px; margin: 0 auto 12px; overflow: hidden; position: relative;
}
.gen-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent-primary), var(--accent-secondary));
  border-radius: 2px;
}
.gen-eta { font-size: 11px; color: var(--text-tertiary); position: relative; }
</style>
