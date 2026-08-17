export interface TrainingInputPaths {
  localModel: string
  remoteModel: string
  trainDataDir: string
  outputDir: string
  outputName: string
}

type PathExists = (path: string) => Promise<boolean>
type BackendCheck = () => Promise<{ ok: boolean }>
type Delay = (milliseconds: number) => Promise<unknown>

interface TrainingBackendResponse {
  ok: boolean
  data?: {
    status?: string
    message?: string
    error?: string
    data?: { warnings?: unknown[]; errors?: unknown[] }
    warnings?: unknown[]
    errors?: unknown[]
  }
}

export function readTrainingPreflight(response: TrainingBackendResponse): {
  warnings: string[]
  errors: string[]
} {
  const payload = response.data?.data || response.data || {}
  const warnings = Array.isArray(payload.warnings) ? payload.warnings.map(String) : []
  const errors = Array.isArray(payload.errors) ? payload.errors.map(String) : []
  const applicationFailed = response.data?.status === 'fail'

  if ((!response.ok || applicationFailed) && errors.length === 0) {
    errors.push(response.data?.message || response.data?.error || '训练配置预检失败')
  }

  return { warnings, errors }
}

export function resolveTrainingModel(localModel: string, remoteModel: string): string {
  return localModel.trim() || remoteModel.trim()
}

export async function validateTrainingInputs(
  input: TrainingInputPaths,
  pathExists: PathExists,
): Promise<string[]> {
  const issues: string[] = []
  const localModel = input.localModel.trim()
  const remoteModel = input.remoteModel.trim()
  const trainDataDir = input.trainDataDir.trim()
  const outputDir = input.outputDir.trim()

  if (!localModel && !remoteModel) issues.push('请先选择底模')
  if (localModel && !await pathExists(localModel)) {
    issues.push(`本地底模文件不存在：${localModel}`)
  }
  if (!trainDataDir) issues.push('请先选择训练数据集')
  else if (!await pathExists(trainDataDir)) issues.push(`训练数据集目录不存在：${trainDataDir}`)
  if (!outputDir) issues.push('请先选择输出目录')
  else if (!await pathExists(outputDir)) issues.push(`输出目录不存在：${outputDir}`)
  if (!input.outputName.trim()) issues.push('请填写输出名称')

  return issues
}

export async function waitForTrainingBackend(
  checkBackend: BackendCheck,
  options: { attempts?: number; intervalMs?: number; delay?: Delay } = {},
): Promise<boolean> {
  const attempts = options.attempts ?? 30
  const intervalMs = options.intervalMs ?? 1000
  const delay = options.delay ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)))

  for (let attempt = 0; attempt < attempts; attempt++) {
    const status = await checkBackend()
    if (status.ok) return true
    if (attempt < attempts - 1) await delay(intervalMs)
  }
  return false
}
