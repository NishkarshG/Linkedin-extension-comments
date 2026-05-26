import { URL, fileURLToPath } from 'node:url'
import { crx } from '@crxjs/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import manifest from './src/manifest'

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [react(), crx({ manifest })],
  build: {
    target: 'esnext',
    sourcemap: false,
    // Keep the content-script chunk lean; warn early if we drift past budget.
    chunkSizeWarningLimit: 200,
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173,
    },
  },
})
