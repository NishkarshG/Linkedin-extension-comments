/**
 * build-content.mjs
 *
 * Builds the content script as a single, self-contained IIFE bundle
 * that does NOT need any dynamic imports at runtime.
 *
 * This bypasses CRXJS's loader (which emits a dynamic import() call that
 * breaks with chrome-extension://invalid/ after the extension is reloaded).
 *
 * Output: dist/assets/content-script.js
 * The post-build manifest patcher (patch-manifest.mjs) points the manifest
 * at this file instead of the CRXJS loader.
 */

import { URL, fileURLToPath } from 'node:url'
import { build } from 'vite'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const entry = fileURLToPath(new URL('../src/content/index.ts', import.meta.url))
const outDir = fileURLToPath(new URL('../dist/assets', import.meta.url))

await build({
  configFile: false,
  resolve: {
    alias: {
      '@': `${projectRoot}/src`,
    },
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  build: {
    lib: {
      entry,
      formats: ['iife'],
      name: 'InlineAIContent',
      fileName: () => 'content-script.js',
    },
    outDir,
    emptyOutDir: false,
    target: 'esnext',
    minify: true,
    rollupOptions: {
      output: {
        // Inline every import so the output is truly one file.
        inlineDynamicImports: true,
      },
    },
  },
})

console.log('[build-content] ✓ dist/assets/content-script.js written')
