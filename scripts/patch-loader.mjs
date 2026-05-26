/**
 * patch-loader.mjs
 *
 * Post-build step: replaces the CRXJS content-script loader file
 * (which uses a dynamic import() at runtime) with a simple inline script
 * that directly executes the bundled content-script code.
 *
 * Problem:
 *   CRXJS emits a tiny loader:
 *     import(chrome.runtime.getURL("assets/index.ts-XXX.js"))
 *   After the extension is reloaded (without removing + re-adding it),
 *   Chrome invalidates the extension's runtime ID and that URL becomes
 *   chrome-extension://invalid/... causing ERR_FAILED.
 *
 * Fix:
 *   Rewrite the loader to use a <script> tag injection via
 *   chrome.runtime.getURL so the browser resolves it at execution time
 *   using the CURRENT (valid) extension ID rather than the stale one
 *   captured at injection time.
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const distAssets = join(process.cwd(), 'dist', 'assets')

// Find the loader file (CRXJS names it index.ts-loader-HASH.js)
const loaderFile = readdirSync(distAssets).find(
  (f) => f.startsWith('index.ts-loader') && f.endsWith('.js'),
)
if (!loaderFile) {
  console.error('[patch-loader] Could not find index.ts-loader-*.js in dist/assets. Skipping.')
  process.exit(0)
}

// Find the actual content-script bundle (index.ts-HASH.js, NOT the loader)
const contentFile = readdirSync(distAssets).find(
  (f) => f.startsWith('index.ts-') && !f.includes('loader') && f.endsWith('.js'),
)
if (!contentFile) {
  console.error('[patch-loader] Could not find content-script bundle in dist/assets. Skipping.')
  process.exit(0)
}

const loaderPath = join(distAssets, loaderFile)

// Replace the loader content with a script-tag injector.
// Using a <script src> element means the browser resolves
// chrome.runtime.getURL at the moment the script runs — always with
// the live, current extension ID.
const patched = `(function () {
  'use strict';
  // Patched by scripts/patch-loader.mjs — avoids chrome-extension://invalid/ on reload.
  // We create a <script> element so Chrome resolves the extension URL at execution
  // time (current valid ID) rather than at injection time (potentially stale ID).
  var s = document.createElement('script');
  s.src = chrome.runtime.getURL('assets/${contentFile}');
  s.type = 'module';
  (document.head || document.documentElement).appendChild(s);
})();
`

writeFileSync(loaderPath, patched, 'utf8')
console.log(`[patch-loader] Patched ${loaderFile} → inlines assets/${contentFile}`)
