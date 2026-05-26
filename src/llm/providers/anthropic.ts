import type { ProviderId } from '@/shared/types'
import {
  type GenerateParams,
  type LLMProvider,
  LlmError,
  type ProviderRuntimeConfig,
} from '../types'
import { iterateSSE, mapHttpError, safeText, toLlmError } from './shared'

/** Anthropic Messages API (/messages). Browser-direct access via the dangerous header. */
export class AnthropicProvider implements LLMProvider {
  readonly id: ProviderId = 'anthropic'
  private readonly config: ProviderRuntimeConfig

  constructor(config: ProviderRuntimeConfig) {
    this.config = config
  }

  async generateComment({ systemPrompt, userPrompt, signal }: GenerateParams): Promise<string> {
    const { baseUrl, model, apiKey, maxOutputTokens, temperature, stream } = this.config
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    }
    const body = JSON.stringify({
      model,
      max_tokens: maxOutputTokens,
      temperature,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      stream,
    })

    let response: Response
    try {
      response = await fetch(`${baseUrl}/messages`, { method: 'POST', headers, body, signal })
    } catch (err) {
      throw toLlmError(err, 'Anthropic')
    }

    if (!response.ok) {
      throw mapHttpError(response.status, await safeText(response), 'Anthropic')
    }

    if (stream) {
      let acc = ''
      try {
        for await (const data of iterateSSE(response, signal)) {
          const delta = extractAnthropicDelta(data)
          if (delta) {
            acc += delta
            this.config.onToken?.(delta)
          }
        }
      } catch (err) {
        throw toLlmError(err, 'Anthropic')
      }
      return acc.trim()
    }

    const json = (await response.json()) as { content?: Array<{ type?: string; text?: string }> }
    const text = (json.content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('')
    if (!text) {
      throw new LlmError('bad_response', 'Anthropic returned an unexpected response shape.')
    }
    return text.trim()
  }
}

function extractAnthropicDelta(data: string): string | null {
  try {
    const parsed = JSON.parse(data) as {
      type?: string
      delta?: { type?: string; text?: string }
    }
    if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
      return parsed.delta.text ?? null
    }
    return null
  } catch {
    return null
  }
}
