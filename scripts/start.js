// Single-process launcher — no extra windows, no browser
const { spawn } = require('child_process')
const { createServer } = require('vite')
const path = require('path')

async function start() {
  const root = path.resolve(__dirname, '..')

  // 1. Start Vite dev server
  console.log('[1/2] Starting Vite dev server...')
  const vite = await createServer({
    root,
    server: { port: 5173, strictPort: true },
  })
  await vite.listen()
  console.log('       Vite ready on http://localhost:5173')

  // 2. Launch Electron (env cleaned of ELECTRON_RUN_AS_NODE)
  console.log('[2/2] Launching Electron...')

  const electronPath = require('electron')
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE

  const electron = spawn(electronPath, [root], {
    stdio: 'inherit',
    env,
  })

  electron.on('close', (code) => {
    vite.close()
    process.exit(code || 0)
  })
}

start().catch((err) => {
  console.error('Failed to start:', err.message)
  process.exit(1)
})
