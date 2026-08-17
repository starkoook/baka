export interface TrainingProgress {
  epoch: number | null
  totalEpochs: number | null
  step: number | null
  totalSteps: number | null
  percent: number
  loss: number | null
  speed: string
  eta: string
}

export function parseTrainingProgress(lines: string[]): TrainingProgress {
  const text = lines.slice(-80).join('\n')
  const epochMatches = [...text.matchAll(/epoch\s*[:=]?\s*(\d+)\s*\/\s*(\d+)/gi)]
  const stepMatches = [...text.matchAll(/(\d{1,3})%[^\n]*?(\d+)\s*\/\s*(\d+)[^\n]*/g)]
  const lossMatches = [...text.matchAll(/loss\s*[=:]\s*(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/gi)]
  const speedMatches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*it\/s/gi)]
  const etaMatches = [...text.matchAll(/<\s*(\d{1,2}:\d{2}(?::\d{2})?)/g)]
  const epoch = epochMatches[epochMatches.length - 1]
  const step = stepMatches[stepMatches.length - 1]
  const loss = lossMatches[lossMatches.length - 1]
  const speed = speedMatches[speedMatches.length - 1]
  const eta = etaMatches[etaMatches.length - 1]

  return {
    epoch: epoch ? Number(epoch[1]) : null,
    totalEpochs: epoch ? Number(epoch[2]) : null,
    step: step ? Number(step[2]) : null,
    totalSteps: step ? Number(step[3]) : null,
    percent: step ? Number(step[1]) : 0,
    loss: loss ? Number(loss[1]) : null,
    speed: speed ? `${speed[1]} it/s` : '',
    eta: eta ? eta[1] : '',
  }
}
