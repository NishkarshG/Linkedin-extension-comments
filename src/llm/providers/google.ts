import type { ProviderId } from '@/shared/types'
import {
  type GenerateParams,
  type LLMProvider,
  LlmError,
  type ProviderRuntimeConfig,
} from '../types'
import { iterateSSE, mapHttpError, safeText, toLlmError } from './shared'

/** Google Gemini generateContent / streamGenerateContent. Auth via ?key= query param. */
export class GoogleProvider implements LLMProvider {
  readonly id: ProviderId = 'google'
  private readonly config: ProviderRuntimeConfig

  constructor(config: ProviderRuntimeConfig) {
    this.config = config
  }

  async generateComment({ systemPrompt, userPrompt, signal }: GenerateParams): Promise<string> {
    const { baseUrl, model, apiKey, maxOutputTokens, temperature, stream } = this.config
    const method = stream ? 'streamGenerateContent' : 'generateContent'
    const query = stream
      ? `?alt=sse&key=${encodeURIComponent(apiKey)}`
      : `?key=${encodeURIComponent(apiKey)}`
    const url = `${baseUrl}/models/${model}:${method}${query}`

    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature,
        maxOutputTokens,
      },
    })

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        signal,
      })
    } catch (err) {
      throw toLlmError(err, 'Gemini')
    }

    if (!response.ok) {
      throw mapHttpError(response.status, await safeText(response), 'Gemini')
    }

    if (stream) {
      let acc = ''
      try {
        for await (const data of iterateSSE(response, signal)) {
          const delta = extractGeminiText(data)
          if (delta) {
            acc += delta
            this.config.onToken?.(delta)
          }
        }
      } catch (err) {
        throw toLlmError(err, 'Gemini')
      }
      return acc.trim()
    }

    const json = await response.json()
    const text = extractGeminiTextFromJson(json)
    if (text == null) {
      throw new LlmError('bad_response', 'Gemini returned an unexpected response shape.')
    }
    return text.trim()
  }
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
}

function extractGeminiText(data: string): string | null {
  try {
    return extractGeminiTextFromJson(JSON.parse(data))
  } catch {
    return null
  }
}

function extractGeminiTextFromJson(json: unknown): string | null {
  const parsed = json as GeminiResponse
  const parts = parsed.candidates?.[0]?.content?.parts
  if (!parts) return null
  const text = parts.map((p) => p.text ?? '').join('')
  return text.length > 0 ? text : null
}
