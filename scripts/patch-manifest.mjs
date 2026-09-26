/**
 * patch-manifest.mjs
 *
 * After the CRXJS build + our IIFE content-script build, patch dist/manifest.json
 * to point the content_scripts entry at our self-contained IIFE
 * (dist/assets/content-script.js) instead of the CRXJS loader file.
 *
 * The script is intentionally NOT listed in web_accessible_resources, so pages
 * cannot probe for it to detect the extension.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const manifestPath = join(process.cwd(), 'dist', 'manifest.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

// Set the content script entry to point to our self-contained IIFE bundle
manifest.content_scripts = [
  {
    js: ['assets/content-script.js'],
    matches: ['https://www.linkedin.com/*', 'https://linkedin.com/*'],
    run_at: 'document_idle',
  },
]

// Deliberately NOT web accessible. Files in content_scripts are injected by
// Chrome without it, and listing them would let any LinkedIn page fetch
// chrome-extension://<id>/assets/content-script.js to detect the extension.
if (Array.isArray(manifest.web_accessible_resources)) {
  manifest.web_accessible_resources = manifest.web_accessible_resources.filter(
    (e) => !(e.resources ?? []).includes('assets/content-script.js'),
  )
  // undefined keys are dropped by JSON.stringify below.
  if (manifest.web_accessible_resources.length === 0) manifest.web_accessible_resources = undefined
}

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log('[patch-manifest] ✓ manifest.json updated → content-script: assets/content-script.js')
