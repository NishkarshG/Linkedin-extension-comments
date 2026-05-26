import type { ProviderId } from '@/shared/types'
import {
  type GenerateParams,
  type LLMProvider,
  LlmError,
  type ProviderRuntimeConfig,
} from '../types'

// ---------------------------------------------------------------------------
// Error mapping (shared by every provider) — spec: F3 / provider error_handling
// ---------------------------------------------------------------------------

export function mapHttpError(status: number, bodyText: string, provider: string): LlmError {
  if (status === 401 || status === 403) {
    return new LlmError('invalid_key', 'Invalid API key. Open InlineAI settings to update it.')
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
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
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
// OpenAI-compatible Chat Completions provider (OpenAI, OpenRouter, Groq, Ollama)
// ---------------------------------------------------------------------------

export interface OpenAICompatOptions extends ProviderRuntimeConfig {
  id: ProviderId
  providerName: string
  /** Builds auth headers from the API key. Default: Bearer. Ollama overrides to none. */
  authHeaders?: (apiKey: string) => Record<string, string>
  extraHeaders?: Record<string, string>
}

export class OpenAICompatibleProvider implements LLMProvider {
  readonly id: ProviderId
  protected readonly opts: OpenAICompatOptions

  constructor(opts: OpenAICompatOptions) {
    this.id = opts.id
    this.opts = opts
  }

  async generateComment({ systemPrompt, userPrompt, signal }: GenerateParams): Promise<string> {
    const { baseUrl, model, apiKey, maxOutputTokens, temperature, stream, providerName } = this.opts
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...(this.opts.authHeaders ?? defaultBearer)(apiKey),
      ...(this.opts.extraHeaders ?? {}),
    }
    const body = JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature,
      max_tokens: maxOutputTokens,
      stream,
    })

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
      throw mapHttpError(response.status, await safeText(response), providerName)
    }

    if (stream) {
      let acc = ''
      try {
        for await (const data of iterateSSE(response, signal)) {
          const delta = extractOpenAIDelta(data)
          if (delta) {
            acc += delta
            this.opts.onToken?.(delta)
          }
        }
      } catch (err) {
        throw toLlmError(err, providerName)
      }
      return acc.trim()
    }

    const json = (await response.json()) as unknown
    const text = extractOpenAIMessage(json)
    if (text == null) {
      throw new LlmError('bad_response', `${providerName} returned an unexpected response shape.`)
    }
    return text.trim()
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

function extractOpenAIDelta(data: string): string | null {
  try {
    const parsed = JSON.parse(data) as {
      choices?: Array<{ delta?: { content?: string | null } }>
    }
    return parsed.choices?.[0]?.delta?.content ?? null
  } catch {
    return null
  }
}

function extractOpenAIMessage(json: unknown): string | null {
  const parsed = json as { choices?: Array<{ message?: { content?: string | null } }> }
  return parsed.choices?.[0]?.message?.content ?? null
}
