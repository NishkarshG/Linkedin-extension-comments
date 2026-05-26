import { URL, fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts so the crxjs extension plugin never runs during
// unit tests. Vitest still uses Vite's transform pipeline, so `?raw` imports and
// the `@` alias resolve exactly as they do in the build.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
    globals: false,
    restoreMocks: true,
  },
})
