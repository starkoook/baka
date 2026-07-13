<script setup lang="ts"></script>
<template>
  <div class="up-root">
    <div class="cabin-panel up-card">
      <span class="cabin-label">/// UPSCALE</span>
      <div class="cabin-panel-br"></div>
      <div class="up-glow"></div>
      <div class="up-icon">🔍</div>
      <h1>超分放大</h1>
      <p class="up-sub">waifu2x / Real-ESRGAN 超分辨率放大与降噪</p>
      <div class="up-features">
        <div class="up-feat"><span class="up-check">✓</span> 2x / 4x 超分辨率</div>
        <div class="up-feat"><span class="up-check">✓</span> 降噪 & 去伪影</div>
        <div class="up-feat"><span class="up-check">✓</span> 批量处理</div>
        <div class="up-feat"><span class="up-dot">○</span> 自定义模型</div>
      </div>
      <div class="up-bar"><div class="up-fill" style="width:30%"></div></div>
      <p class="up-eta">开发进度 30% · 预计下个版本上线</p>
    </div>
  </div>
</template>

<style scoped>
.up-root { max-width: 700px; margin: 0 auto; }
.up-card { text-align: center; padding: 60px 24px; position: relative; overflow: hidden; }
.up-glow {
  position: absolute; width: 300px; height: 300px; border-radius: 50%;
  background: radial-gradient(circle, var(--accent-glow) 0%, transparent 70%);
  top: 50%; left: 50%; transform: translate(-50%, -50%); pointer-events: none;
}
.up-icon { font-size: 56px; margin-bottom: 16px; position: relative; }
.up-card h1 { font-size: 28px; font-weight: 700; color: var(--text-primary); margin: 0 0 8px; position: relative; }
.up-sub { font-size: 14px; color: var(--text-tertiary); margin: 0 0 36px; position: relative; }
.up-features {
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
  max-width: 380px; margin: 0 auto 28px; text-align: left; position: relative;
}
.up-feat {
  font-size: 13px; color: var(--text-secondary);
  padding: 8px 12px;
  background: var(--hud-bg); border: 1px solid var(--hud-border);
  border-radius: var(--radius-sm);
}
.up-check { color: var(--accent-success); margin-right: 6px; font-weight: 700; }
.up-dot { color: var(--text-tertiary); margin-right: 6px; }
.up-bar {
  width: 200px; height: 3px;
  background: var(--hud-bg); border: 1px solid var(--hud-border);
  border-radius: 2px; margin: 0 auto 12px; overflow: hidden; position: relative;
}
.up-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent-primary), var(--accent-secondary));
  border-radius: 2px;
}
.up-eta { font-size: 11px; color: var(--text-tertiary); position: relative; }
</style>
