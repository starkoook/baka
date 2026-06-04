<script setup lang="ts">
// ═══════════════════════════════════════
// Live2D Cubism SDK 加载器
// 将 .moc3 / .model3.json 放入 public/live2d/ 即可自动加载
// ═══════════════════════════════════════

import { ref, onMounted, onUnmounted } from 'vue'

const status = ref<'loading' | 'ready' | 'error'>('loading')
const errMsg = ref('')
const canvasRef = ref<HTMLCanvasElement | null>(null)

// Live2D 参数映射
let animId: number | null = null

onMounted(async () => {
  try {
    // 动态导入 pixi-live2d-display（需安装依赖）
    // npm install pixi.js pixi-live2d-display
    const { Application } = await import('pixi.js')
    const { Live2DModel } = await import('pixi-live2d-display')

    if (!canvasRef.value) return

    const app = new Application()
    await app.init({
      view: canvasRef.value,
      width: 300,
      height: 450,
      backgroundAlpha: 0,
      antialias: true,
    })

    // 加载模型
    const model = await Live2DModel.from('/live2d/character.model3.json')

    // 缩放适配画布
    model.scale.set(0.18)
    model.x = 150
    model.y = 420
    model.anchor.set(0.5, 1)

    app.stage.addChild(model)

    // ── 鼠标交互 ──
    const onMouse = (e: MouseEvent) => {
      const rect = canvasRef.value!.getBoundingClientRect()
      const mx = ((e.clientX - rect.left) / rect.width - 0.5) * 2  // -1~1
      const my = ((e.clientY - rect.top) / rect.height - 0.5) * 2

      // 驱动 Live2D 参数（对应规范 ParamAngleX/Y/Z）
      model?.internalModel?.coreModel?.setParameterValueById('ParamAngleX', mx * 30)
      model?.internalModel?.coreModel?.setParameterValueById('ParamAngleY', my * 30)
      model?.internalModel?.coreModel?.setParameterValueById('ParamAngleZ', mx * 15)
      model?.internalModel?.coreModel?.setParameterValueById('ParamEyeBallX', mx)
      model?.internalModel?.coreModel?.setParameterValueById('ParamEyeBallY', my)
    }

    // ── 点击交互 ──
    const onClick = () => {
      model?.motion('tap_body')  // 点击动画
    }

    canvasRef.value.addEventListener('mousemove', onMouse)
    canvasRef.value.addEventListener('click', onClick)

    // ── 动画循环 ──
    function tick() {
      const t = Date.now() / 1000
      // 呼吸 (3.2s 周期)
      const breath = Math.sin(t * (2 * Math.PI) / 3.2)
      model?.internalModel?.coreModel?.setParameterValueById('ParamBreath', (breath + 1) / 2)
      animId = requestAnimationFrame(tick)
    }
    animId = requestAnimationFrame(tick)

    status.value = 'ready'
  } catch (e: any) {
    status.value = 'error'
    if (e.message?.includes('Cannot find module')) {
      errMsg.value = '请先安装: npm install pixi.js pixi-live2d-display'
    } else if (e.message?.includes('Failed to fetch') || e.message?.includes('404')) {
      errMsg.value = '模型文件未找到，请将 .model3.json 放入 public/live2d/'
    } else {
      errMsg.value = e.message || '加载失败'
    }
  }
})

onUnmounted(() => {
  if (animId) cancelAnimationFrame(animId)
})
</script>

<template>
  <div class="live2d-wrapper">
    <canvas ref="canvasRef" class="live2d-canvas"></canvas>
    <div class="live2d-status" v-if="status === 'loading'">加载模型中...</div>
    <div class="live2d-status error" v-if="status === 'error'">{{ errMsg }}</div>
  </div>
</template>

<style scoped>
.live2d-wrapper {
  position: relative;
  width: 240px;
  height: 320px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.live2d-canvas {
  width: 100%;
  height: 100%;
}

.live2d-status {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--text-tertiary);
  text-align: center;
  padding: 16px;
}

.live2d-status.error {
  color: #f87171;
}
</style>
