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
    <div class="tr-hero">
      <div class="tr-hero-left">
        <h1>LoRA 训练</h1>
        <p>SD-reScripts 训练运行时管理</p>
        <div class="tr-path-row">
          <code :title="repoPath">{{ repoPath || '未选择训练器目录' }}</code>
          <button @click="selectRepo">📂 浏览</button>
        </div>
      </div>
      <div class="tr-hero-right">
        <div class="tr-status-big" :class="{ on: isRunning }">
          <span class="tr-status-dot"></span>
          {{ isRunning ? 'ONLINE' : 'IDLE' }}
        </div>
      </div>
    </div>

    <div class="tr-grid">
      <!-- Python card -->
      <div class="tr-card">
        <div class="tr-card-icon">🐍</div>
        <h3>Python 环境</h3>
        <div class="tr-card-row"><span>Python</span><code>{{ pyVer || '未检测' }}</code></div>
        <div class="tr-card-row"><span>Git</span><span :class="gitOk ? 'ok' : 'fail'">{{ gitOk ? '✓ 可用' : '✗ 不可用' }}</span></div>
        <div class="tr-card-row"><span>训练器</span><span :class="hasRepo ? 'ok' : 'fail'">{{ hasRepo ? '✓ 已配置' : '✗ 未找到' }}</span></div>
      </div>

      <!-- GPU card -->
      <div class="tr-card" v-if="gpu">
        <div class="tr-card-icon">🎮</div>
        <h3>{{ gpu.name?.slice(0, 24) || 'GPU' }}</h3>
        <div class="tr-card-row"><span>显存</span><code>{{ gpu.vramUsed }} / {{ gpu.vramTotal }} MB</code></div>
        <div class="tr-card-row" v-if="gpu.temp > 0"><span>温度</span><code>{{ gpu.temp }}°C</code></div>
        <div class="tr-vram-bar"><div class="tr-vram-fill" :style="{ width: gpu.vramTotal > 0 ? (gpu.vramUsed/gpu.vramTotal*100) + '%' : '0%' }"></div></div>
      </div>

      <!-- Control card -->
      <div class="tr-card tr-ctrl">
        <button class="tr-launch" :disabled="!hasRepo || isRunning" @click="launch">▶ 启动训练器</button>
        <button class="tr-stop-btn" :disabled="!isRunning" @click="stop">⏹ 停止</button>
        <div class="tr-msg" v-if="msg">{{ msg }}</div>
        <p class="tr-hint">启动后自动打开 WebUI → http://127.0.0.1:28000</p>
      </div>

      <!-- Info card -->
      <div class="tr-card">
        <div class="tr-card-icon">📋</div>
        <h3>服务端口</h3>
        <div class="tr-card-row"><span>训练 WebUI</span><code>28000</code></div>
        <div class="tr-card-row"><span>TensorBoard</span><code>6006</code></div>
        <div class="tr-card-row"><span>标签编辑器</span><code>28001</code></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tr-root { max-width: 900px; margin: 0 auto; }
.tr-hero { display: flex; justify-content: space-between; align-items: center; padding: 24px 28px; background: linear-gradient(135deg, rgba(255,105,180,0.06) 0%, rgba(30,30,32,0.4) 100%); border: 1px solid rgba(255,255,255,0.04); border-radius: 16px; margin-bottom: 16px; }
.tr-hero-left h1 { font-size: 24px; font-weight: 700; color: #f3f4f6; margin: 0 0 4px; }
.tr-hero-left p { font-size: 13px; color: #6b7280; margin: 0 0 12px; }
.tr-path-row { display: flex; align-items: center; gap: 8px; }
.tr-path-row code { font-size: 11px; color: #6b7280; font-family: monospace; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; background: rgba(0,0,0,0.2); padding: 4px 8px; border-radius: 4px; }
.tr-path-row button { padding: 5px 12px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); border-radius: 6px; color: #d1d5db; font-size: 11px; cursor: pointer; }
.tr-hero-right {}
.tr-status-big { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; color: #6b7280; font-family: monospace; padding: 10px 18px; background: rgba(0,0,0,0.2); border-radius: 10px; }
.tr-status-big.on { color: #22c55e; background: rgba(34,197,94,0.06); }
.tr-status-dot { width: 8px; height: 8px; border-radius: 50%; background: #6b7280; }
.tr-status-big.on .tr-status-dot { background: #22c55e; animation: pulse 2s infinite; }
@keyframes pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.4); } 50% { box-shadow: 0 0 0 8px rgba(34,197,94,0); } }

.tr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.tr-card { background: rgba(24,24,26,0.6); border: 1px solid rgba(255,255,255,0.04); border-radius: 14px; padding: 18px; }
.tr-card-icon { font-size: 24px; margin-bottom: 6px; }
.tr-card h3 { font-size: 14px; font-weight: 600; color: #e5e7eb; margin: 0 0 12px; }
.tr-card-row { display: flex; justify-content: space-between; align-items: center; padding: 5px 0; font-size: 12px; color: #9ca3af; }
.tr-card-row code { font-size: 11px; color: #d1d5db; font-family: monospace; }
.tr-card-row .ok { color: #22c55e; } .tr-card-row .fail { color: #ef4444; }
.tr-vram-bar { height: 4px; background: rgba(255,255,255,0.05); border-radius: 2px; margin-top: 8px; overflow: hidden; }
.tr-vram-fill { height: 100%; background: linear-gradient(90deg, #22c55e, #f59e0b, #ef4444); border-radius: 2px; transition: width 0.5s; }

.tr-ctrl { display: flex; flex-direction: column; gap: 8px; }
.tr-launch { width: 100%; padding: 14px; border: none; border-radius: 10px; background: linear-gradient(135deg, #ff69b4, #ff85c2); color: #fff; font-size: 15px; font-weight: 700; cursor: pointer; }
.tr-launch:disabled { opacity: 0.3; cursor: not-allowed; }
.tr-stop-btn { width: 100%; padding: 10px; border: 1px solid rgba(239,68,68,0.15); border-radius: 8px; background: rgba(239,68,68,0.04); color: #ef4444; font-size: 13px; cursor: pointer; }
.tr-stop-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.tr-msg { text-align: center; font-size: 11px; color: #d1d5db; padding: 6px; background: rgba(255,105,180,0.06); border-radius: 6px; }
.tr-hint { font-size: 10px; color: #4b5563; text-align: center; margin: 0; }
</style>
