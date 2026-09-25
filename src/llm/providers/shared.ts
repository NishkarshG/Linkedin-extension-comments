import type { ProviderId } from '@/shared/types'
import {
  type GenerateParams,
  type GenerateResult,
  type LLMProvider,
  LlmError,
  type ProviderRuntimeConfig,
} from '../types'

// ---------------------------------------------------------------------------
// Error mapping (shared by every provider) — spec: F3 / provider error_handling
// ---------------------------------------------------------------------------

export function mapHttpError(
  status: number,
  bodyText: string,
  provider: string,
  providerId?: ProviderId,
): LlmError {
  if (providerId === 'ollama' && status === 403) {
    return new LlmError(
      'invalid_key',
      'Ollama blocked the request. Restart Ollama with OLLAMA_ORIGINS=chrome-extension://* set.',
    )
  }
  if (status === 401 || status === 403) {
    return new LlmError('invalid_key', 'Invalid API key. Open InlineAI settings to update it.')
  }
  if (status === 404) {
    return new LlmError(
      'bad_response',
      `${provider} could not find that model. Pick another model in InlineAI settings.`,
    )
  }
  if (status === 429) {
    return new LlmError('rate_limited', 'Rate limited by provider. Try again in a few seconds.')
  }
  if (status >= 500) {
    return new LlmError('server_error', `${provider} is having issues. Try again.`)
  }
  const detail = bodyText ? ` ${truncate(bodyText, 160)}` : ''
  return new LlmError('bad_response', `${provider} request failed (${status}).${detail}`)
}

export function toLlmError(err: unknown, provider: string): LlmError {
  if (err instanceof LlmError) return err
  if (err instanceof DOMException && err.name === 'TimeoutError') {
    return new LlmError('timeout', `${provider} took too long to respond. Try again.`)
  }
  if (err instanceof DOMException && err.name === 'AbortError') {
    return new LlmError('aborted', 'Request cancelled.')
  }
  if (err instanceof Error && err.name === 'AbortError') {
    return new LlmError('aborted', 'Request cancelled.')
  }
  return new LlmError('network', `No internet or ${provider} unreachable.`)
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s
}

// ---------------------------------------------------------------------------
// Server-Sent Events line iterator (works in the MV3 service worker)
// ---------------------------------------------------------------------------

/** Yields the JSON payload string after each `data:` line, stopping on `[DONE]`. */
export async function* iterateSSE(
  response: Response,
  signal: AbortSignal,
): AsyncGenerator<string, void, unknown> {
  const reader = response.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      if (signal.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError')
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let nl = buffer.indexOf('\n')
      while (nl !== -1) {
        const line = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        if (line.startsWith('data:')) {
          const data = line.slice(5).trim()
          if (data === '[DONE]') return
          if (data.length > 0) yield data
        }
        nl = buffer.indexOf('\n')
      }
    }
  } finally {
    reader.releaseLock()
  }
}

// ---------------------------------------------------------------------------
// Per-model request tuning for OpenAI-compatible APIs
// ---------------------------------------------------------------------------

/** How a specific model wants its Chat Completions request shaped. */
export interface ModelTuning {
  /** Name of the output cap parameter. */
  tokenParam: 'max_tokens' | 'max_completion_tokens'
  /** Reasoning models reject custom temperature. */
  sendTemperature: boolean
  /** Sent as `reasoning_effort` when set. */
  reasoningEffort?: string
  /** Extra output budget for hidden reasoning tokens, which count against the cap. */
  reasoningHeadroom: number
}

export const STANDARD_TUNING: ModelTuning = {
  tokenParam: 'max_tokens',
  sendTemperature: true,
  reasoningHeadroom: 0,
}

/**
 * OpenAI models: reasoning models (o series, GPT-5 family) reject `temperature`
 * and `max_tokens`. Every current OpenAI chat model accepts `max_completion_tokens`.
 */
export function openAITuning(model: string): ModelTuning {
  const m = model.toLowerCase()
  if (/^o\d/.test(m)) {
    return {
      tokenParam: 'max_completion_tokens',
      sendTemperature: false,
      reasoningEffort: 'low',
      reasoningHeadroom: 2048,
    }
  }
  const gpt5 = m.match(/^gpt-5(?:\.(\d+))?/)
  if (gpt5 && !m.includes('-chat')) {
    const minor = Number(gpt5[1] ?? '0')
    // GPT-5.1 and later support effort "none" (no hidden reasoning at all);
    // the original GPT-5 family bottoms out at "minimal".
    return minor >= 1
      ? {
          tokenParam: 'max_completion_tokens',
          sendTemperature: false,
          reasoningEffort: 'none',
          reasoningHeadroom: 0,
        }
      : {
          tokenParam: 'max_completion_tokens',
          sendTemperature: false,
          reasoningEffort: 'minimal',
          reasoningHeadroom: 1024,
        }
  }
  return { tokenParam: 'max_completion_tokens', sendTemperature: true, reasoningHeadroom: 0 }
}

/** Groq: gpt-oss models reason before answering, so give them room and keep effort low. */
export function groqTuning(model: string): ModelTuning {
  if (model.toLowerCase().includes('gpt-oss')) {
    return {
      tokenParam: 'max_completion_tokens',
      sendTemperature: true,
      reasoningEffort: 'low',
      reasoningHeadroom: 1024,
    }
  }
  return { tokenParam: 'max_completion_tokens', sendTemperature: true, reasoningHeadroom: 0 }
}

// ---------------------------------------------------------------------------
// OpenAI-compatible Chat Completions provider (OpenAI, OpenRouter, Groq, Ollama)
// ---------------------------------------------------------------------------

export interface OpenAICompatOptions extends ProviderRuntimeConfig {
  id: ProviderId
  providerName: string
  /** Builds auth headers from the API key. Default: Bearer. Ollama overrides to none. */
  authHeaders?: (apiKey: string) => Record<string, string>
  extraHeaders?: Record<string, string>
  /** Shapes the request for the selected model. Default: plain max_tokens + temperature. */
  tuning?: (model: string) => ModelTuning
}

export class OpenAICompatibleProvider implements LLMProvider {
  readonly id: ProviderId
  protected readonly opts: OpenAICompatOptions

  constructor(opts: OpenAICompatOptions) {
    this.id = opts.id
    this.opts = opts
  }

  /** The JSON body for a Chat Completions request (exposed for tests). */
  buildBody(systemPrompt: string, userPrompt: string): Record<string, unknown> {
    const { model, maxOutputTokens, temperature, stream } = this.opts
    const tuning = (this.opts.tuning ?? (() => STANDARD_TUNING))(model)
    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      [tuning.tokenParam]: maxOutputTokens + tuning.reasoningHeadroom,
      stream,
    }
    if (tuning.sendTemperature) body.temperature = temperature
    if (tuning.reasoningEffort) body.reasoning_effort = tuning.reasoningEffort
    return body
  }

  async generateComment({
    systemPrompt,
    userPrompt,
    signal,
  }: GenerateParams): Promise<GenerateResult> {
    const { baseUrl, apiKey, stream, providerName } = this.opts
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...(this.opts.authHeaders ?? defaultBearer)(apiKey),
      ...(this.opts.extraHeaders ?? {}),
    }
    const body = JSON.stringify(this.buildBody(systemPrompt, userPrompt))

    let response: Response
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body,
        signal,
      })
    } catch (err) {
      throw toLlmError(err, providerName)
    }

    if (!response.ok) {
      throw mapHttpError(response.status, await safeText(response), providerName, this.id)
    }

    if (stream) {
      let acc = ''
      let finish: string | null = null
      try {
        for await (const data of iterateSSE(response, signal)) {
          const chunk = parseOpenAIChunk(data)
          if (chunk.delta) {
            acc += chunk.delta
            this.opts.onToken?.(chunk.delta)
          }
          if (chunk.finish) finish = chunk.finish
        }
      } catch (err) {
        throw toLlmError(err, providerName)
      }
      return { text: acc.trim(), truncated: finish === 'length' }
    }

    let json: unknown
    try {
      json = await response.json()
    } catch {
      throw new LlmError('bad_response', `${providerName} returned an unreadable response.`)
    }
    const message = extractOpenAIMessage(json)
    if (message == null) {
      throw new LlmError('bad_response', `${providerName} returned an unexpected response shape.`)
    }
    return { text: message.text.trim(), truncated: message.finish === 'length' }
  }
}

export function defaultBearer(apiKey: string): Record<string, string> {
  return { authorization: `Bearer ${apiKey}` }
}

export function noAuth(): Record<string, string> {
  return {}
}

export async function safeText(response: Response): Promise<string> {
  try {
    return await response.text()
  } catch {
    return ''
  }
}

function parseOpenAIChunk(data: string): { delta: string | null; finish: string | null } {
  try {
    const parsed = JSON.parse(data) as {
      choices?: Array<{ delta?: { content?: string | null }; finish_reason?: string | null }>
    }
    const choice = parsed.choices?.[0]
    return { delta: choice?.delta?.content ?? null, finish: choice?.finish_reason ?? null }
  } catch {
    return { delta: null, finish: null }
  }
}

function extractOpenAIMessage(json: unknown): { text: string; finish: string | null } | null {
  const parsed = json as {
    choices?: Array<{ message?: { content?: string | null }; finish_reason?: string | null }>
  }
  const choice = parsed.choices?.[0]
  if (!choice?.message) return null
  return { text: choice.message.content ?? '', finish: choice.finish_reason ?? null }
}
