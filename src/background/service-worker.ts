import { getProvider } from '@/llm/factory'
import { hasHostAccess, providerHost } from '@/llm/permissions'
import { buildUserPrompt, resolveSystemPrompt } from '@/llm/prompt'
import { LlmError, PROVIDERS } from '@/llm/types'
import {
  GENERATE_PORT,
  type GeneratePortRequest,
  type GeneratePortResponse,
  type RuntimeMessage,
  type RuntimeResponse,
  couldBeSkipPrefix,
  isSkipResponse,
} from '@/shared/messages'
import type { PostData } from '@/shared/types'
import { getSettings } from '@/storage/storage'

/** A request that has not finished after this long is cancelled with a clear error. */
export const GENERATION_TIMEOUT_MS = 60_000

// ---------------------------------------------------------------------------
// Generation: content script connects a port, we stream the comment back.
// Cross-origin provider fetches run here (the service worker has host
// permissions), which also keeps zod + the skill out of the content bundle.
// ---------------------------------------------------------------------------

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== GENERATE_PORT) return
  // Only our own content scripts (running in a tab) may start generations.
  if (port.sender?.id !== chrome.runtime.id) {
    port.disconnect()
    return
  }

  const controller = new AbortController()
  let started = false

  const send = (msg: GeneratePortResponse): void => {
    try {
      port.postMessage(msg)
    } catch {
      /* port closed */
    }
  }

  port.onMessage.addListener((raw: unknown) => {
    const msg = raw as GeneratePortRequest
    if (msg.type === 'abort') {
      controller.abort()
      return
    }
    if (msg.type === 'start') {
      if (started) return
      started = true
      void runGeneration(msg.post, controller, send)
    }
  })

  port.onDisconnect.addListener(() => controller.abort())
})

async function runGeneration(
  post: PostData,
  controller: AbortController,
  send: (msg: GeneratePortResponse) => void,
): Promise<void> {
  const signal = controller.signal
  const settings = await getSettings()
  const meta = PROVIDERS[settings.providerId]

  if (meta.requiresKey && settings.apiKey.trim().length === 0) {
    send({ type: 'error', code: 'no_api_key', message: 'Add your API key in InlineAI settings.' })
    return
  }

  if (!(await hasHostAccess(settings))) {
    send({
      type: 'error',
      code: 'no_permission',
      message: `Allow InlineAI to reach ${providerHost(settings)} in settings.`,
    })
    return
  }

  const systemPrompt = resolveSystemPrompt(settings, post.platform)
  const userPrompt = buildUserPrompt(post, settings.persona)

  // SKIP guard: hold output until we know the model isn't returning the SKIP
  // sentinel, so we never flash "SKIP" into the comment box.
  let acc = ''
  let forwarded = 0
  let gateOpen = false

  const onToken = settings.streaming
    ? (delta: string): void => {
        acc += delta
        if (!gateOpen) {
          if (couldBeSkipPrefix(acc)) return
          gateOpen = true
        }
        if (acc.length > forwarded) {
          send({ type: 'chunk', delta: acc.slice(forwarded) })
          forwarded = acc.length
        }
      }
    : undefined

  const timer = setTimeout(
    () => controller.abort(new DOMException('Generation timed out', 'TimeoutError')),
    GENERATION_TIMEOUT_MS,
  )

  try {
    const provider = getProvider(settings, { onToken })
    const { text, truncated } = await provider.generateComment({
      systemPrompt,
      userPrompt,
      signal,
    })

    if (isSkipResponse(text)) {
      send({ type: 'skip' })
      return
    }
    if (text.length === 0) {
      send({
        type: 'error',
        code: 'empty_output',
        message: truncated
          ? 'The model used its whole output budget before writing. Raise "Max output length" in settings.'
          : 'The model returned an empty comment. Try again or pick another model.',
      })
      return
    }
    send({ type: 'done', text, truncated })
  } catch (err) {
    const timedOut = signal.reason instanceof DOMException && signal.reason.name === 'TimeoutError'
    if (timedOut) {
      send({
        type: 'error',
        code: 'timeout',
        message: `${meta.displayName} took too long to respond. Try again.`,
      })
      return
    }
    if (signal.aborted) return
    if (err instanceof LlmError) {
      if (err.code === 'aborted') return
      send({ type: 'error', code: err.code, message: err.message })
    } else {
      send({ type: 'error', code: 'unknown', message: 'Something went wrong. Try again.' })
    }
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// One-shot runtime messages
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(
  (raw: unknown, sender, sendResponse: (r: RuntimeResponse) => void) => {
    if (sender.id !== chrome.runtime.id) return false
    const msg = raw as RuntimeMessage
    if (msg.type === 'OPEN_SETTINGS') {
      void chrome.runtime.openOptionsPage()
      sendResponse({ ok: true })
      return false
    }
    if (msg.type === 'PING') {
      sendResponse({ ok: true })
      return false
    }
    return false
  },
)

// ---------------------------------------------------------------------------
// First-run onboarding: open the settings/options tab on install.
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    void chrome.runtime.openOptionsPage()
  }
})
