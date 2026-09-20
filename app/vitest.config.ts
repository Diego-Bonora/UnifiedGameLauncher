import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

// Mirrors the aliases in electron.vite.config.ts, which Vitest does not read.
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer/src')
    }
  }
})
