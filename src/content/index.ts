import {
  GENERATE_PORT,
  type GeneratePortRequest,
  type GeneratePortResponse,
  type RuntimeMessage,
} from '@/shared/messages'
import type { PostData } from '@/shared/types'
import { InlineButton } from './button'
import { activatePostButton, leadingEntity, replaceText, userDraftText } from './inserter'
import {
  commentInputFrom,
  debugLog,
  expandSeeMore,
  extractPost,
  findComposerScope,
  findPostContainer,
  isExtractable,
  isInScope,
  setDebug,
} from './linkedin-dom'

// Hardcoded here (not imported from storage.ts) so the content bundle never
// pulls in zod — keeping it under the 30KB gzipped budget.
const SETTINGS_KEY = 'inlineai:settings'

/** Streamed text is written to the box at most this often (ms). */
const STREAM_FLUSH_MS = 80
/** Client side safety net, slightly longer than the worker's own 60s timeout. */
const WATCHDOG_MS = 75_000

const button = new InlineButton()
button.onClick(() => void handleClick())

/** One in-flight generation. */
interface Session {
  port: chrome.runtime.Port
  target: HTMLElement
  /** Leading @mention to keep in front of the generated text. */
  anchor: Element | null
  accumulated: string
  flushTimer: number | null
  watchdog: number
}

let session: Session | null = null
let lastUrl = location.href
/** The comment we last wrote into each box, so "regenerate" never asks to confirm. */
const lastInserted = new WeakMap<HTMLElement, string>()

// ---------------------------------------------------------------------------
// Scope + theme
// ---------------------------------------------------------------------------

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
// Keyboard: Alt+Shift+W writes, Escape or typing cancels a running generation
// ---------------------------------------------------------------------------

function isShortcut(e: KeyboardEvent): boolean {
  return e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyW'
}

function onKeyDown(e: KeyboardEvent): void {
  if (!e.isTrusted) return

  if (session && button.getState() === 'loading') {
    const inTarget = e.target instanceof Node && session.target.contains(e.target)
    if (e.key === 'Escape' || (inTarget && !isModifierOnly(e) && !isShortcut(e))) {
      cancelGeneration(e.key === 'Escape' ? 'Cancelled' : 'Stopped because you started typing')
      return
    }
  }

  if (!isShortcut(e) || !isInScope()) return
  const input = commentInputFrom(e.target)
  if (!input) return
  e.preventDefault()
  e.stopPropagation()
  showButtonFor(input)
  void handleClick()
}

function isModifierOnly(e: KeyboardEvent): boolean {
  return ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)
}

// ---------------------------------------------------------------------------
// Generation flow
// ---------------------------------------------------------------------------

/** True when the extension was reloaded or updated and this page still runs the old script. */
function extensionContextLost(): boolean {
  try {
    return !chrome.runtime?.id
  } catch {
    return true
  }
}

const RELOAD_MESSAGE = 'InlineAI was updated. Refresh this page to use it.'

async function handleClick(): Promise<void> {
  const target = button.getTarget()
  if (!target) return

  // Clicking while writing cancels the in-flight request (spec F1 loading state).
  if (button.getState() === 'loading') {
    cancelGeneration()
    return
  }

  if (extensionContextLost()) {
    button.showError(RELOAD_MESSAGE)
    return
  }

  // Never silently overwrite something the user typed themselves.
  const draft = userDraftText(target)
  const ours = lastInserted.get(target)
  if (draft.length > 0 && draft !== normalizeText(ours)) {
    if (!window.confirm('Replace your draft with an AI comment?')) return
  }

  button.setState('loading')
  try {
    const flags = await readContentFlags()
    setDebug(flags.debug)

    const container = findPostContainer(target)
    if (!container) {
      button.showError("Couldn't read the post. Please report this")
      return
    }
    if (flags.autoExpandSeeMore) {
      await expandSeeMore(container)
    }
    const post = extractPost(target, container)
    debugLog('extracted post data:', post)

    if (!isExtractable(post)) {
      debugLog('post data is not extractable (all fields empty)')
      button.showError("Couldn't read the post. Please report this")
      return
    }
    startGeneration(target, post)
  } catch (err) {
    debugLog('handleClick error:', err)
    button.showError(extensionContextLost() ? RELOAD_MESSAGE : 'Something went wrong. Try again.')
  }
}

function normalizeText(text: string | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim()
}

function startGeneration(target: HTMLElement, post: PostData): void {
  endSession(true) // never run two requests at once

  const port = chrome.runtime.connect({ name: GENERATE_PORT })
  const current: Session = {
    port,
    target,
    anchor: leadingEntity(target),
    accumulated: '',
    flushTimer: null,
    watchdog: window.setTimeout(() => {
      if (session === current) {
        endSession(true)
        button.showError('The AI provider took too long. Try again.')
      }
    }, WATCHDOG_MS),
  }
  session = current

  port.onMessage.addListener((raw: unknown) => {
    if (session !== current) return
    const msg = raw as GeneratePortResponse
    switch (msg.type) {
      case 'chunk': {
        current.accumulated += msg.delta
        scheduleFlush(current)
        break
      }
      case 'done': {
        endSession(false)
        replaceText(current.target, msg.text, current.anchor)
        lastInserted.set(current.target, msg.text)
        activatePostButton(current.target)
        button.flashSuccess()
        if (msg.truncated) {
          button.showInfo('The comment was cut off. Raise "Max output length" in settings.', 5000)
        }
        break
      }
      case 'skip': {
        endSession(false)
        button.setState('default')
        button.showInfo('Not worth a comment')
        break
      }
      case 'error': {
        endSession(false)
        button.showError(msg.message)
        if (msg.code === 'no_api_key' || msg.code === 'no_permission') {
          chrome.runtime
            .sendMessage({ type: 'OPEN_SETTINGS' } satisfies RuntimeMessage)
            .catch(() => {})
        }
        break
      }
    }
  })

  // Fires only when the WORKER side goes away (crash, update, reload).
  port.onDisconnect.addListener(() => {
    if (session !== current) return
    endSession(false)
    button.showError(
      extensionContextLost() ? RELOAD_MESSAGE : 'Lost connection to InlineAI. Try again.',
    )
  })

  const startMsg: GeneratePortRequest = { type: 'start', post }
  port.postMessage(startMsg)
}

/**
 * Coalesce streamed tokens into one DOM write per STREAM_FLUSH_MS, and only
 * while the user is still in that comment box, so streaming never steals focus.
 */
function scheduleFlush(current: Session): void {
  if (current.flushTimer !== null) return
  current.flushTimer = window.setTimeout(() => {
    current.flushTimer = null
    if (session !== current) return
    const active = document.activeElement
    if (active && (active === current.target || current.target.contains(active))) {
      const partial = current.accumulated.trimStart()
      replaceText(current.target, partial, current.anchor)
      lastInserted.set(current.target, partial)
    }
  }, STREAM_FLUSH_MS)
}

function cancelGeneration(reason?: string): void {
  endSession(true)
  button.setState('default')
  if (reason) button.showInfo(reason)
}

/** Tear down the current session. `abort` tells the worker to stop the request. */
function endSession(abort: boolean): void {
  const current = session
  if (!current) return
  session = null
  if (current.flushTimer !== null) clearTimeout(current.flushTimer)
  clearTimeout(current.watchdog)
  if (abort) {
    try {
      const abortMsg: GeneratePortRequest = { type: 'abort' }
      current.port.postMessage(abortMsg)
    } catch {
      /* port may already be closed */
    }
  }
  try {
    current.port.disconnect()
  } catch {
    /* ignore */
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

function onDomChange(): void {
  // SPA navigation: hide the button if we left a commentable page.
  if (location.href !== lastUrl) {
    lastUrl = location.href
    if (!isInScope() && button.getState() !== 'loading') button.hide()
  }
  if (!button.isVisible()) return
  const target = button.getTarget()
  if (target && !target.isConnected && button.getState() !== 'loading') {
    button.hide()
  }
}

function onThemeChange(): void {
  if (button.isVisible()) button.setTheme(detectDarkMode())
}

/**
 * Run `fn` at most once per `ms`, always including a trailing call. Unlike a
 * debounce, a page that never stops mutating cannot starve it.
 */
function throttle(fn: () => void, ms: number): () => void {
  let timer: number | null = null
  let last = 0
  return () => {
    if (timer !== null) return
    const wait = Math.max(0, last + ms - Date.now())
    timer = window.setTimeout(() => {
      timer = null
      last = Date.now()
      fn()
    }, wait)
  }
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

function init(): void {
  document.addEventListener('focusin', onFocusIn, true)
  document.addEventListener('click', onDocClick, true)
  document.addEventListener('keydown', onKeyDown, true)

  // Structure changes only (navigation, removed composers). Attribute changes
  // across LinkedIn's whole tree fire constantly and are not needed here.
  new MutationObserver(throttle(onDomChange, 150)).observe(document.body, {
    childList: true,
    subtree: true,
  })

  // Theme lives on <html>/<body> only.
  const themeObserver = new MutationObserver(throttle(onThemeChange, 150))
  const themeAttrs = { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] }
  themeObserver.observe(document.documentElement, themeAttrs)
  themeObserver.observe(document.body, themeAttrs)

  debugLog('InlineAI content script ready')
}

init()
