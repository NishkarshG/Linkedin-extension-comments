/**
 * patch-manifest.mjs
 *
 * After the CRXJS build + our IIFE content-script build, patch dist/manifest.json
 * to point the content_scripts entry at our self-contained IIFE
 * (dist/assets/content-script.js) instead of the CRXJS loader file.
 *
 * Also ensures content-script.js is listed in web_accessible_resources
 * so Chrome allows the extension to serve it to LinkedIn pages.
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

// Make sure content-script.js is in web_accessible_resources so
// Chrome can serve it from the extension origin.
const linkedinMatches = ['https://www.linkedin.com/*', 'https://linkedin.com/*']

const existingWar = manifest.web_accessible_resources ?? []
// Find an existing entry that covers LinkedIn, or add a new one.
const warEntry = existingWar.find(
  (e) => Array.isArray(e.matches) && e.matches.some((m) => m.includes('linkedin.com')),
)
if (warEntry) {
  if (!warEntry.resources.includes('assets/content-script.js')) {
    warEntry.resources.push('assets/content-script.js')
  }
} else {
  existingWar.push({
    matches: linkedinMatches,
    resources: ['assets/content-script.js'],
    use_dynamic_url: false,
  })
}
manifest.web_accessible_resources = existingWar

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log('[patch-manifest] ✓ manifest.json updated → content-script: assets/content-script.js')
