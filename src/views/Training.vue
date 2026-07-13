<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
const repoPath = ref(''); const hasRepo = ref(false); const isRunning = ref(false); const msg = ref('')
const gpu = ref<any>(null); const pyVer = ref(''); const gitOk = ref(false)
let timer: any = null
async function refresh() {
  if (!window.trainingAPI) return; const s = await window.trainingAPI.status()
  repoPath.value = s.repoPath || ''; hasRepo.value = s.hasRepo; isRunning.value = s.running
  try { gpu.value = (await window.systemAPI?.getStats())?.gpu } catch {}
  try { const e = await window.trainingAPI.checkEnv(); pyVer.value = e.python || ''; gitOk.value = !!e.git } catch {}
}
async function selectRepo() { if (!window.fsAPI) return; const f = await window.fsAPI.selectFolder(); if (!f) return; await window.trainingAPI.setPath(f); await refresh() }
async function launch() { msg.value = '启动中...'; const r = await window.trainingAPI.launch(); if (r.success) { isRunning.value = true; msg.value = '已启动'; window.open('http://127.0.0.1:28000', '_blank') } else msg.value = r.error }
async function stop() { await window.trainingAPI.stop(); isRunning.value = false; msg.value = '已停止' }
onMounted(() => { refresh(); timer = setInterval(refresh, 3000) })
onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<template>
  <div class="tr-root">
    <!-- ═══ HERO ═══ -->
    <div class="cabin-panel tr-hero">
      <span class="cabin-label">/// TRAINING_HUB</span>
      <div class="cabin-panel-br"></div>
      <div class="tr-hero-inner">
        <div class="tr-hero-left">
          <h1>LoRA 训练</h1>
          <p>SD-reScripts 训练运行时管理</p>
          <div class="tr-path-row">
            <code>{{ repoPath || '未选择训练器目录' }}</code>
            <button class="btn btn-ghost btn-sm" @click="selectRepo">📂 浏览</button>
          </div>
        </div>
        <div class="tr-status-big" :class="{ on: isRunning }">
          <span class="tr-status-dot"></span>
          {{ isRunning ? 'ONLINE' : 'IDLE' }}
        </div>
      </div>
    </div>

    <!-- ═══ GRID ═══ -->
    <div class="tr-grid">
      <!-- Python -->
      <div class="cabin-panel tr-card">
        <span class="cabin-label">/// PYTHON</span>
        <div class="cabin-panel-br"></div>
        <div class="tr-card-icon">🐍</div>
        <h3>Python 环境</h3>
        <div class="tr-row"><span>Python</span><code>{{ pyVer || '未检测' }}</code></div>
        <div class="tr-row"><span>Git</span><span class="tr-badge" :class="gitOk ? 'ok' : 'fail'">{{ gitOk ? '✓ 可用' : '✗ 不可用' }}</span></div>
        <div class="tr-row"><span>训练器</span><span class="tr-badge" :class="hasRepo ? 'ok' : 'fail'">{{ hasRepo ? '✓ 已配置' : '✗ 未找到' }}</span></div>
      </div>

      <!-- GPU -->
      <div class="cabin-panel tr-card" v-if="gpu">
        <span class="cabin-label">/// GPU</span>
        <div class="cabin-panel-br"></div>
        <div class="tr-card-icon">🎮</div>
        <h3>{{ gpu.name?.slice(0, 24) || 'GPU' }}</h3>
        <div class="tr-row"><span>显存</span><code>{{ gpu.vramUsed }} / {{ gpu.vramTotal }} MB</code></div>
        <div class="tr-row" v-if="gpu.temp > 0"><span>温度</span><code>{{ gpu.temp }}°C</code></div>
        <div class="tr-vram-bar"><div class="tr-vram-fill" :style="{ width: gpu.vramTotal > 0 ? (gpu.vramUsed/gpu.vramTotal*100) + '%' : '0%' }"></div></div>
      </div>

      <!-- Control -->
      <div class="cabin-panel tr-card tr-ctrl">
        <span class="cabin-label">/// CONTROL</span>
        <div class="cabin-panel-br"></div>
        <button class="btn btn-primary" :disabled="!hasRepo || isRunning" @click="launch">▶ 启动训练器</button>
        <button class="btn btn-secondary" :disabled="!isRunning" @click="stop">⏹ 停止</button>
        <div class="tr-msg" v-if="msg">{{ msg }}</div>
        <p class="tr-hint">启动后自动打开 WebUI → http://127.0.0.1:28000</p>
      </div>

      <!-- Ports -->
      <div class="cabin-panel tr-card">
        <span class="cabin-label">/// PORTS</span>
        <div class="cabin-panel-br"></div>
        <div class="tr-card-icon">📋</div>
        <h3>服务端口</h3>
        <div class="tr-row"><span>训练 WebUI</span><code>28000</code></div>
        <div class="tr-row"><span>TensorBoard</span><code>6006</code></div>
        <div class="tr-row"><span>标签编辑器</span><code>28001</code></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tr-root { max-width: 900px; margin: 0 auto; }

/* ═══ HERO ═══ */
.tr-hero { padding: 20px 24px; margin-bottom: 16px; }
.tr-hero-inner { display: flex; justify-content: space-between; align-items: center; }
.tr-hero-left h1 { font-size: 24px; font-weight: 700; color: var(--text-primary); margin: 0 0 2px; }
.tr-hero-left p { font-size: 13px; color: var(--text-tertiary); margin: 0 0 10px; }
.tr-path-row { display: flex; align-items: center; gap: 8px; }
.tr-path-row code {
  font-size: 11px; color: var(--text-tertiary);
  font-family: var(--font-mono);
  max-width: 280px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  background: var(--hud-bg);
  padding: 4px 8px;
  border: 1px solid var(--hud-border);
  border-radius: var(--radius-xs);
}

/* ── Status badge ── */
.tr-status-big {
  display: flex; align-items: center; gap: 8px;
  font-size: 12px; font-weight: 700;
  color: var(--text-tertiary);
  font-family: var(--font-mono);
  padding: 10px 18px;
  background: var(--hud-bg);
  border: 1px solid var(--hud-border);
  border-radius: var(--radius-sm);
}
.tr-status-big.on {
  color: var(--accent-success);
  background: var(--success-bg);
  border-color: var(--border-success);
}
.tr-status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-tertiary); }
.tr-status-big.on .tr-status-dot {
  background: var(--accent-success);
  animation: tr-pulse 2s infinite;
}
@keyframes tr-pulse {
  0%,100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.4); }
  50% { box-shadow: 0 0 0 8px rgba(34,197,94,0); }
}

/* ═══ GRID ═══ */
.tr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

/* ── Card ── */
.tr-card { padding: 18px; }
.tr-card-icon { font-size: 24px; margin-bottom: 6px; }
.tr-card h3 { font-size: 14px; font-weight: 600; color: var(--text-primary); margin: 0 0 12px; }
.tr-row { display: flex; justify-content: space-between; align-items: center; padding: 5px 0; font-size: 12px; color: var(--text-secondary); }
.tr-row code { font-size: 11px; color: var(--text-primary); font-family: var(--font-mono); }
.tr-badge { font-size: 11px; font-weight: 500; padding: 2px 8px; border-radius: var(--radius-full); }
.tr-badge.ok { color: var(--accent-success); background: var(--success-bg); }
.tr-badge.fail { color: var(--accent-danger); background: var(--danger-bg); }

/* ── VRAM bar ── */
.tr-vram-bar { height: 4px; background: var(--hud-bg); border-radius: 2px; margin-top: 8px; overflow: hidden; border: 1px solid var(--hud-border); }
.tr-vram-fill { height: 100%; background: linear-gradient(90deg, var(--accent-success), var(--accent-warning), var(--accent-danger)); border-radius: 2px; transition: width 0.5s; }

/* ── Control ── */
.tr-ctrl { display: flex; flex-direction: column; gap: 8px; }
.tr-msg {
  text-align: center;
  font-size: 11px;
  color: var(--accent-primary);
  padding: 6px 10px;
  background: var(--accent-bg);
  border: 1px solid var(--border-accent);
  border-radius: var(--radius-xs);
}
.tr-hint { font-size: 10px; color: var(--text-tertiary); text-align: center; margin: 4px 0 0; }

/* ── Responsive ── */
@media (max-width: 640px) {
  .tr-grid { grid-template-columns: 1fr; }
  .tr-hero-inner { flex-direction: column; align-items: stretch; gap: 12px; }
}
</style>
