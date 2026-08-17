#!/usr/bin/env node
const path = require('path')
const { execFileSync } = require('child_process')

const projectRoot = path.resolve(__dirname, '..')
const cacheDir = path.join(projectRoot, '.cache')
process.env.ELECTRON_CACHE = path.join(cacheDir, 'electron')
process.env.ELECTRON_BUILDER_CACHE = path.join(cacheDir, 'electron-builder')

function run(executable, args) {
  execFileSync(executable, args, { cwd: projectRoot, stdio: 'inherit', env: process.env })
}

run(process.execPath, [path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'])
run(process.execPath, [path.join(projectRoot, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js'), '--config', 'electron-builder.yml'])
run(process.execPath, [path.join(__dirname, 'create-release-manifest.js')])
