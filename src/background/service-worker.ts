import { getProvider } from '@/llm/factory'
import { buildUserPrompt, effectiveTemperature, resolveSystemPrompt } from '@/llm/prompt'
import { LlmError, PROVIDERS } from '@/llm/types'
import {
  GENERATE_PORT,
  type GeneratePortRequest,
  type GeneratePortResponse,
  type RuntimeMessage,
  type RuntimeResponse,
  SKIP_TOKEN,
} from '@/shared/messages'
import type { PostData } from '@/shared/types'
import { getSettings } from '@/storage/storage'

// ---------------------------------------------------------------------------
// Generation: content script connects a port, we stream the comment back.
// Cross-origin provider fetches run here (the service worker has host
// permissions), which also keeps zod + the skill out of the content bundle.
// ---------------------------------------------------------------------------

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== GENERATE_PORT) return

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
      void runGeneration(msg.post, controller.signal, send)
    }
  })

  port.onDisconnect.addListener(() => controller.abort())
})

async function runGeneration(
  post: PostData,
  signal: AbortSignal,
  send: (msg: GeneratePortResponse) => void,
): Promise<void> {
  const settings = await getSettings()
  const meta = PROVIDERS[settings.providerId]

  if (meta.requiresKey && settings.apiKey.trim().length === 0) {
    send({ type: 'error', code: 'no_api_key', message: 'Add your API key in InlineAI settings.' })
    return
  }

  const systemPrompt = resolveSystemPrompt(settings)
  const userPrompt = buildUserPrompt(post, settings.persona)
  const temperature = effectiveTemperature(post, settings.temperature)

  // SKIP guard: hold output until we know the model isn't returning the SKIP
  // sentinel, so we never flash "SKIP" into the comment box.
  let acc = ''
  let forwarded = 0
  let gateOpen = false

  const onToken = settings.streaming
    ? (delta: string): void => {
        acc += delta
        if (!gateOpen) {
          const t = acc.trim().toUpperCase()
          if (t.length <= SKIP_TOKEN.length && SKIP_TOKEN.startsWith(t)) return
          gateOpen = true
        }
        if (acc.length > forwarded) {
          send({ type: 'chunk', delta: acc.slice(forwarded) })
          forwarded = acc.length
        }
      }
    : undefined

  try {
    const provider = getProvider(settings, { onToken, temperature })
    const text = (await provider.generateComment({ systemPrompt, userPrompt, signal })).trim()

    if (text.toUpperCase() === SKIP_TOKEN) {
      send({ type: 'skip' })
      return
    }
    send({ type: 'done', text })
  } catch (err) {
    if (signal.aborted) return
    if (err instanceof LlmError) {
      if (err.code === 'aborted') return
      send({ type: 'error', code: err.code, message: err.message })
    } else {
      send({ type: 'error', code: 'unknown', message: 'Something went wrong. Try again.' })
    }
  }
}

// ---------------------------------------------------------------------------
// One-shot runtime messages
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(
  (raw: unknown, _sender, sendResponse: (r: RuntimeResponse) => void) => {
    const msg = raw as RuntimeMessage
    if (msg.type === 'OPEN_SETTINGS') {
      chrome.runtime.openOptionsPage()
      sendResponse({ ok: true })
      return true
    }
    if (msg.type === 'PING') {
      sendResponse({ ok: true })
      return true
    }
    return false
  },
)

// ---------------------------------------------------------------------------
// First-run onboarding: open the settings/options tab on install.
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage()
  }
})
