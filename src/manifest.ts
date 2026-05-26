import { defineManifest } from '@crxjs/vite-plugin'
import pkg from '../package.json'

// Typed Manifest V3 definition fed to @crxjs/vite-plugin.
// crxjs rewrites the TS/HTML entry paths to their built equivalents at build time.
export default defineManifest({
  manifest_version: 3,
  name: 'InlineAI for LinkedIn',
  version: pkg.version,
  description:
    'Drafts genuinely personalised LinkedIn comments inline. Open-source, bring-your-own-key, privacy-first.',

  icons: {
    16: 'icon16.png',
    32: 'icon32.png',
    48: 'icon48.png',
    128: 'icon128.png',
  },

  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'InlineAI for LinkedIn',
    default_icon: {
      16: 'icon16.png',
      32: 'icon32.png',
      48: 'icon48.png',
      128: 'icon128.png',
    },
  },

  options_page: 'src/options/index.html',

  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },

  permissions: ['storage', 'activeTab', 'scripting'],

  host_permissions: [
    'https://www.linkedin.com/*',
    'https://linkedin.com/*',
    'https://api.openai.com/*',
    'https://api.anthropic.com/*',
    'https://generativelanguage.googleapis.com/*',
    'https://openrouter.ai/*',
    'https://api.groq.com/*',
    'http://localhost/*',
  ],

  web_accessible_resources: [],
})
