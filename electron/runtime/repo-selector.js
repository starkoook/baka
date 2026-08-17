const fs = require('fs')
const path = require('path')

function isTrainerRepo(directory) {
  return typeof directory === 'string'
    && directory.length > 0
    && fs.existsSync(path.join(directory, 'gui.py'))
}

function selectTrainerRepo(configured, candidates = []) {
  for (const directory of [configured, ...candidates]) {
    if (isTrainerRepo(directory)) return directory
  }
  return ''
}

module.exports = { isTrainerRepo, selectTrainerRepo }
