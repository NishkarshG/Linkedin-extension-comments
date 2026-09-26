import type { ProviderId } from '@/shared/types'
import {
  type GenerateParams,
  type GenerateResult,
  type LLMProvider,
  LlmError,
  type ProviderRuntimeConfig,
} from '../types'
import { iterateSSE, mapHttpError, safeText, toLlmError } from './shared'

/**
 * Claude models released before Opus 4.7 accept sampling parameters. Newer
 * models (Opus 4.7 and later, Sonnet 5, Fable) reject `temperature` with a 400
 * and are steered with `output_config.effort` instead.
 */
export function anthropicAcceptsTemperature(model: string): boolean {
  const m = model.toLowerCase().replace(/-\d{8}$/, '')
  if (m.startsWith('claude-3')) return true
  return /^claude-(haiku|sonnet|opus)-4(-[0-6])?$/.test(m)
}

/** Output budget reserved for thinking on newer models, which may think by default. */
const THINKING_HEADROOM = 2048

/** Anthropic Messages API (/messages). Browser-direct access via the dangerous header. */
export class AnthropicProvider implements LLMProvider {
  readonly id: ProviderId = 'anthropic'
  private readonly config: ProviderRuntimeConfig

  constructor(config: ProviderRuntimeConfig) {
    this.config = config
  }

  /** The JSON body for a Messages request (exposed for tests). */
  buildBody(systemPrompt: string, userPrompt: string): Record<string, unknown> {
    const { model, maxOutputTokens, temperature, stream } = this.config
    const legacy = anthropicAcceptsTemperature(model)
    const body: Record<string, unknown> = {
      model,
      max_tokens: legacy ? maxOutputTokens : maxOutputTokens + THINKING_HEADROOM,
      // The skill prompt is identical on every click, so cache it: repeat
      // requests then bill the prompt at a fraction of the normal input price.
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userPrompt }],
      stream,
    }
    if (legacy) {
      body.temperature = Math.min(temperature, 1)
    } else {
      body.output_config = { effort: 'low' }
    }
    return body
  }

  async generateComment({
    systemPrompt,
    userPrompt,
    signal,
  }: GenerateParams): Promise<GenerateResult> {
    const { baseUrl, apiKey, stream } = this.config
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    }
    const body = JSON.stringify(this.buildBody(systemPrompt, userPrompt))

    let response: Response
    try {
      response = await fetch(`${baseUrl}/messages`, { method: 'POST', headers, body, signal })
    } catch (err) {
      throw toLlmError(err, 'Anthropic')
    }

    if (!response.ok) {
      throw mapHttpError(response.status, await safeText(response), 'Anthropic', this.id)
    }

    if (stream) {
      let acc = ''
      let stopReason: string | null = null
      try {
        for await (const data of iterateSSE(response, signal)) {
          const event = parseAnthropicEvent(data)
          if (event.error) {
            throw new LlmError('server_error', `Anthropic stream failed: ${event.error}`)
          }
          if (event.delta) {
            acc += event.delta
            this.config.onToken?.(event.delta)
          }
          if (event.stopReason) stopReason = event.stopReason
        }
      } catch (err) {
        throw toLlmError(err, 'Anthropic')
      }
      return finish(acc, stopReason)
    }

    let json: {
      content?: Array<{ type?: string; text?: string }>
      stop_reason?: string | null
    }
    try {
      json = await response.json()
    } catch {
      throw new LlmError('bad_response', 'Anthropic returned an unreadable response.')
    }
    if (!Array.isArray(json.content)) {
      throw new LlmError('bad_response', 'Anthropic returned an unexpected response shape.')
    }
    const text = json.content
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('')
    return finish(text, json.stop_reason ?? null)
  }
}

function finish(text: string, stopReason: string | null): GenerateResult {
  if (stopReason === 'refusal') {
    throw new LlmError('refused', 'Claude declined to write a comment for this post.')
  }
  return { text: text.trim(), truncated: stopReason === 'max_tokens' }
}

function parseAnthropicEvent(data: string): {
  delta: string | null
  stopReason: string | null
  error: string | null
} {
  const none = { delta: null, stopReason: null, error: null }
  try {
    const parsed = JSON.parse(data) as {
      type?: string
      delta?: { type?: string; text?: string; stop_reason?: string | null }
      error?: { message?: string }
    }
    if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
      return { ...none, delta: parsed.delta.text ?? null }
    }
    if (parsed.type === 'message_delta') {
      return { ...none, stopReason: parsed.delta?.stop_reason ?? null }
    }
    if (parsed.type === 'error') {
      return { ...none, error: parsed.error?.message ?? 'unknown error' }
    }
    return none
  } catch {
    return none
  }
}
