import {
  GENERATE_PORT,
  type GeneratePortRequest,
  type GeneratePortResponse,
  type RuntimeMessage,
} from '@/shared/messages'
import type { PostData } from '@/shared/types'
import { InlineButton } from './button'
import { activatePostButton, replaceText } from './inserter'
import {
  commentInputFrom,
  debugLog,
  expandSeeMore,
  extractPost,
  findComposerScope,
  findPostContainer,
  isExtractable,
  setDebug,
} from './linkedin-dom'

// Hardcoded here (not imported from storage.ts) so the content bundle never
// pulls in zod — keeping it under the 30KB gzipped budget.
const SETTINGS_KEY = 'inlineai:settings'

const button = new InlineButton()
button.onClick(handleClick)

let currentPort: chrome.runtime.Port | null = null
let accumulated = ''
let lastUrl = location.href

// ---------------------------------------------------------------------------
// Scope + theme
// ---------------------------------------------------------------------------

function isInScope(): boolean {
  const p = location.pathname
  if (p.startsWith('/messaging')) return false
  return (
    p.startsWith('/feed') ||
    p.includes('/posts/') ||
    p.includes('/pulse/') ||
    p.includes('/feed/update/') ||
    p.startsWith('/in/')
  )
}

function detectDarkMode(): boolean {
  const html = document.documentElement
  const dataTheme = html.getAttribute('data-theme')
  if (dataTheme) return dataTheme.toLowerCase().includes('dark')
  if (html.classList.contains('theme--dark') || document.body.classList.contains('theme--dark')) {
    return true
  }
  return isDarkColor(getComputedStyle(document.body).backgroundColor)
}

function isDarkColor(color: string): boolean {
  const match = color.match(/rgba?\(([^)]+)\)/)
  if (!match || !match[1]) return false
  const parts = match[1].split(',').map((n) => Number.parseFloat(n.trim()))
  const r = parts[0] ?? 255
  const g = parts[1] ?? 255
  const b = parts[2] ?? 255
  // Relative luminance; < 0.5 means a dark background.
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5
}

// ---------------------------------------------------------------------------
// Showing / hiding the button
// ---------------------------------------------------------------------------

function onFocusIn(e: FocusEvent): void {
  if (!isInScope()) return
  const input = commentInputFrom(e.target)
  if (!input) return
  showButtonFor(input)
}

function showButtonFor(input: HTMLElement): void {
  if (button.getState() === 'loading') return
  if (button.getTarget() === input && button.isVisible()) {
    return
  }
  button.attachTo(input, detectDarkMode())
}

function onDocClick(e: MouseEvent): void {
  if (!button.isVisible()) return
  if (button.getState() === 'loading') return
  const target = e.target as Node | null
  if (button.contains(target)) return
  const current = button.getTarget()
  if (!current) return
  if (target && current.contains(target)) return
  // Stay visible if the click is in the post container OR the composer scope.
  const container = findPostContainer(current)
  if (container && target && container.contains(target)) return
  const scope = findComposerScope(current)
  if (scope && target && scope.contains(target)) return
  button.hide()
}

// ---------------------------------------------------------------------------
// Generation flow
// ---------------------------------------------------------------------------

async function handleClick(): Promise<void> {
  const target = button.getTarget()
  if (!target) return

  // Clicking while writing cancels the in-flight request (spec F1 loading state).
  if (button.getState() === 'loading') {
    abortGeneration()
    button.setState('default')
    return
  }

  const container = findPostContainer(target)
  if (!container) {
    button.showError("Couldn't read the post — please report this")
    return
  }

  button.setState('loading')
  try {
    const flags = await readContentFlags()
    setDebug(flags.debug)
    if (flags.autoExpandSeeMore) {
      await expandSeeMore(container)
    }
    const post = extractPost(target, container)
    console.log('[InlineAI] extracted post data:', post)

    if (!isExtractable(post)) {
      console.warn('[InlineAI] post data is not extractable (all fields empty)')
      button.showError("Couldn't read the post — please report this")
      return
    }
    accumulated = ''
    startGeneration(target, post)
  } catch (err) {
    console.error('[InlineAI] handleClick error:', err)
    button.showError('Something went wrong. Try again.')
  }
}

function startGeneration(target: HTMLElement, post: PostData): void {
  abortGeneration() // never run two requests at once

  const port = chrome.runtime.connect({ name: GENERATE_PORT })
  currentPort = port

  port.onMessage.addListener((raw: unknown) => {
    const msg = raw as GeneratePortResponse
    switch (msg.type) {
      case 'chunk': {
        accumulated += msg.delta
        replaceText(target, accumulated)
        break
      }
      case 'done': {
        accumulated = msg.text
        if (msg.text.length > 0) {
          replaceText(target, msg.text)
          activatePostButton(target)
        }
        teardownPort()
        button.flashSuccess()
        break
      }
      case 'skip': {
        teardownPort()
        button.setState('default')
        button.showInfo('Not worth a comment')
        break
      }
      case 'error': {
        teardownPort()
        if (msg.code === 'no_api_key') {
          button.showError('Add your API key in InlineAI settings')
          chrome.runtime.sendMessage({ type: 'OPEN_SETTINGS' } satisfies RuntimeMessage)
        } else {
          button.showError(msg.message)
        }
        break
      }
    }
  })

  port.onDisconnect.addListener(() => {
    if (currentPort === port) currentPort = null
  })

  const startMsg: GeneratePortRequest = { type: 'start', post }
  port.postMessage(startMsg)
}

function abortGeneration(): void {
  if (!currentPort) return
  try {
    const abortMsg: GeneratePortRequest = { type: 'abort' }
    currentPort.postMessage(abortMsg)
  } catch {
    /* port may already be closed */
  }
  try {
    currentPort.disconnect()
  } catch {
    /* ignore */
  }
  currentPort = null
}

function teardownPort(): void {
  if (currentPort) {
    try {
      currentPort.disconnect()
    } catch {
      /* ignore */
    }
    currentPort = null
  }
}

async function readContentFlags(): Promise<{ autoExpandSeeMore: boolean; debug: boolean }> {
  try {
    const raw = await chrome.storage.local.get(SETTINGS_KEY)
    const s = raw[SETTINGS_KEY] as Record<string, unknown> | undefined
    if (s && typeof s === 'object') {
      return {
        autoExpandSeeMore: s.autoExpandSeeMore !== false,
        debug: s.debug === true,
      }
    }
  } catch {
    /* fall through to defaults */
  }
  return { autoExpandSeeMore: true, debug: false }
}

// ---------------------------------------------------------------------------
// Observation (SPA navigation, theme changes, detached targets)
// ---------------------------------------------------------------------------

function onMutations(): void {
  const work = (): void => {
    // SPA navigation: hide the button if we left a commentable page.
    if (location.href !== lastUrl) {
      lastUrl = location.href
      if (!isInScope()) button.hide()
    }
    if (!button.isVisible()) return
    button.setTheme(detectDarkMode())
    const target = button.getTarget()
    if (target && !target.isConnected && button.getState() !== 'loading') {
      button.hide()
    }
  }
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(work, { timeout: 200 })
  } else {
    work()
  }
}

function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let timer: number | null = null
  return ((...args: never[]) => {
    if (timer) clearTimeout(timer)
    timer = window.setTimeout(() => fn(...args), ms)
  }) as T
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

function init(): void {
  document.addEventListener('focusin', onFocusIn, true)
  document.addEventListener('click', onDocClick, true)

  const observer = new MutationObserver(debounce(onMutations, 50))
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['contenteditable', 'aria-label', 'data-theme', 'class'],
  })

  debugLog('InlineAI content script ready')
}

init()
