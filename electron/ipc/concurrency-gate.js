function createConcurrencyGate(limit) {
  const max = Math.max(1, Number(limit) || 1)
  let active = 0
  const waiting = []

  function acquire() {
    if (active < max) {
      active += 1
      return Promise.resolve()
    }
    return new Promise((resolve) => waiting.push(resolve))
  }

  function release() {
    const next = waiting.shift()
    if (next) next()
    else active = Math.max(0, active - 1)
  }

  async function run(task) {
    await acquire()
    try {
      return await task()
    } finally {
      release()
    }
  }

  return { run }
}

module.exports = { createConcurrencyGate }
