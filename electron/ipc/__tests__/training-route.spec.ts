import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const taskSource = readFileSync(resolve(process.cwd(), 'src/views/TrainingTask.vue'), 'utf8')
const runSource = readFileSync(resolve(process.cwd(), 'src/views/TrainingRun.vue'), 'utf8')
const runtimeSource = readFileSync(resolve(process.cwd(), 'src/views/Training.vue'), 'utf8')
const bridgeSource = readFileSync(resolve(process.cwd(), 'electron/ipc/training-http-bridge.js'), 'utf8')
const advancedSource = readFileSync(resolve(process.cwd(), 'src/components/training/AdvancedTrainingWorkbench.vue'), 'utf8')

describe('training task identity', () => {
  it('opens the monitor with the submitted task id', () => {
    expect(taskSource).toContain("router.push({ path: '/training/run', query: { taskId: taskId.value } })")
  })

  it('submits the effective model selected by the user', () => {
    expect(taskSource).toContain('const effectiveModel = computed')
    expect(taskSource).toContain('pretrained_model_name_or_path: effectiveModel.value')
    expect(taskSource).toContain('pretrained_model_name_or_path = "${effectiveModel.value}"')
  })

  it('checks local inputs before submitting training', () => {
    expect(taskSource).toContain('validateTrainingInputs')
    expect(taskSource).toContain('window.fsAPI?.exists')
  })

  it('launches an installed runtime and waits for backend readiness', () => {
    expect(taskSource).toContain('runtimeId: installedRuntime.id')
    expect(taskSource).toContain('waitForTrainingBackend')
    expect(taskSource).toContain('trainingHttpAPI?.backendStatus()')
    expect(taskSource).not.toContain('await new Promise(r => setTimeout(r, 2000))')
  })

  it('honors application-level preflight and submission failures', () => {
    expect(taskSource).toContain('readTrainingPreflight')
    expect(taskSource).toContain("res.data?.status !== 'fail'")
  })

  it('reads the current task id through vue-router', () => {
    expect(runSource).toContain('useRoute')
    expect(runSource).toContain('route.query.taskId')
    expect(runSource).not.toContain("window.location.hash.split('?')")
  })

  it('keeps runtime cancellation pending until the install promise finishes', () => {
    expect(runtimeSource).toContain("addLog('正在取消安装")
    expect(runtimeSource).not.toContain("if (r?.success) addLog('安装已取消'")
  })

  it('removes runtime event listeners when leaving the page', () => {
    expect(runtimeSource).toContain('removeRuntimeLogListener?.()')
    expect(runtimeSource).toContain('removeRuntimeStatusListener?.()')
  })

  it('bridges the trainer schema registry, presets, and script runner', () => {
    expect(bridgeSource).toContain("fetchBackend('/schemas/all')")
    expect(bridgeSource).toContain('compileTrainerSchemas')
    expect(bridgeSource).toContain("fetchBackend('/presets')")
    expect(bridgeSource).toContain("fetchBackend('/scripts')")
    expect(bridgeSource).toContain("fetchBackend('/run_script', 'POST', payload)")
  })

  it('renders a complete schema-driven training mode without hiding compatibility errors', () => {
    expect(taskSource).toContain('AdvancedTrainingWorkbench')
    expect(taskSource).toContain("trainingMode === 'advanced'")
    expect(taskSource).toContain("trainingMode === 'original'")
    expect(advancedSource).toContain('trainingHttpAPI.getSchemas()')
    expect(advancedSource).toContain('unsupported')
    expect(advancedSource).toContain('collectVisibleFields')
    expect(advancedSource).toContain('validateTrainingDraft')
    expect(advancedSource).toContain('trainingHttpAPI.preflight')
    expect(advancedSource).toContain('trainingHttpAPI.submitTraining')
  })

  it('exposes progress, TensorBoard, training tools, retry, and output actions', () => {
    expect(runSource).toContain('parseTrainingProgress')
    expect(runSource).toContain("activeTab === 'tensorboard'")
    expect(runSource).toContain("activeTab === 'tools'")
    expect(runSource).toContain("'/tensorboard.html'")
    expect(runSource).toContain('TrainingToolsPanel')
    expect(runSource).toContain("guiUrl + '/'")
    expect(runSource).toContain('copyLastConfig')
    expect(runSource).toContain('openLastOutput')
    expect(runSource).toContain('returnToConfig')
  })
})
