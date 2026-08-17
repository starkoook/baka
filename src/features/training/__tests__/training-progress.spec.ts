import { describe, expect, it } from 'vitest'
import { parseTrainingProgress } from '../training-progress'

describe('training log progress', () => {
  it('extracts epoch, step, loss, speed, and eta from recent trainer output', () => {
    const progress = parseTrainingProgress([
      'epoch 2/10',
      'steps:  42%|████ | 420/1000 [01:20<01:50, 5.25it/s, loss=0.0876]',
    ])

    expect(progress).toEqual({
      epoch: 2,
      totalEpochs: 10,
      step: 420,
      totalSteps: 1000,
      percent: 42,
      loss: 0.0876,
      speed: '5.25 it/s',
      eta: '01:50',
    })
  })

  it('returns null values when the task has not emitted progress yet', () => {
    expect(parseTrainingProgress(['loading model'])).toMatchObject({ percent: 0, loss: null, speed: '', eta: '' })
  })
})
