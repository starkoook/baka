<script setup lang="ts"></script>
<template>
  <div class="page"><div class="coming-soon">
    <div class="cs-glow"></div>
    <div class="cs-icon">🔍</div>
    <h1>超分放大</h1>
    <p class="cs-sub">waifu2x / Real-ESRGAN 超分辨率放大与降噪</p>
    <div class="cs-features">
      <div class="cs-feat"><span class="cs-check">✓</span> 2x / 4x 超分辨率</div>
      <div class="cs-feat"><span class="cs-check">✓</span> 降噪 & 去伪影</div>
      <div class="cs-feat"><span class="cs-check">✓</span> 批量处理</div>
      <div class="cs-feat"><span class="cs-dot">○</span> 自定义模型</div>
    </div>
    <div class="cs-bar"><div class="cs-fill" style="width:30%"></div></div>
    <p class="cs-eta">开发进度 30% · 预计下个版本上线</p>
  </div></div>
</template>
<style scoped>
.page { max-width: 700px; margin: 0 auto; }
.coming-soon { text-align: center; padding: 80px 20px; position: relative; }
.cs-glow { position: absolute; width: 300px; height: 300px; border-radius: 50%; background: radial-gradient(circle, rgba(255,105,180,0.06) 0%, transparent 70%); top: 50%; left: 50%; transform: translate(-50%, -50%); pointer-events: none; }
.cs-icon { font-size: 56px; margin-bottom: 16px; position: relative; }
h1 { font-size: 28px; font-weight: 700; color: #f3f4f6; margin: 0 0 8px; position: relative; }
.cs-sub { font-size: 14px; color: #6b7280; margin: 0 0 36px; position: relative; }
.cs-features { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; max-width: 380px; margin: 0 auto 28px; text-align: left; position: relative; }
.cs-feat { font-size: 13px; color: #9ca3af; padding: 8px 12px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.03); border-radius: 8px; }
.cs-check { color: #22c55e; margin-right: 6px; font-weight: 700; }
.cs-dot { color: #4b5563; margin-right: 6px; }
.cs-bar { width: 200px; height: 3px; background: rgba(255,255,255,0.06); border-radius: 2px; margin: 0 auto 12px; overflow: hidden; position: relative; }
.cs-fill { height: 100%; background: linear-gradient(90deg, #ff69b4, #ff85c2); border-radius: 2px; }
.cs-eta { font-size: 11px; color: #4b5563; position: relative; }
</style>
