import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    // Main-process specs are plain Node and must not pay for a jsdom environment
    // (jsdom boot dominated the previous single-environment runs).
    projects: [
      {
        extends: true,
        test: { name: 'renderer', environment: 'jsdom', include: ['src/**/*.spec.ts'] },
      },
      {
        extends: true,
        test: { name: 'electron', environment: 'node', include: ['electron/**/*.spec.ts'] },
      },
    ],
  },
})
