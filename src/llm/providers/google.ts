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
 * Gemini thinking models count hidden reasoning against `maxOutputTokens`, so a
 * 200 token cap can be spent entirely on thinking and return no text. Keep
 * thinking minimal and reserve headroom for whatever thinking remains.
 */
export function geminiThinking(model: string): {
  thinkingConfig?: Record<string, unknown>
  headroom: number
} {
  const m = model.toLowerCase()
  if (/^gemini-(3|[4-9])/.test(m))
    return { thinkingConfig: { thinkingLevel: 'low' }, headroom: 2048 }
  if (/^gemini-2\.5-flash/.test(m)) return { thinkingConfig: { thinkingBudget: 0 }, headroom: 0 }
  if (/^gemini-2\.5-pro/.test(m)) return { thinkingConfig: { thinkingBudget: 128 }, headroom: 1024 }
  return { headroom: 0 }
}

const BLOCKED_FINISH = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII'])

/** Google Gemini generateContent / streamGenerateContent. Auth via the x-goog-api-key header. */
export class GoogleProvider implements LLMProvider {
  readonly id: ProviderId = 'google'
  private readonly config: ProviderRuntimeConfig

  constructor(config: ProviderRuntimeConfig) {
    this.config = config
  }

  /** The JSON body for a generateContent request (exposed for tests). */
  buildBody(systemPrompt: string, userPrompt: string): Record<string, unknown> {
    const { model, maxOutputTokens, temperature } = this.config
    const thinking = geminiThinking(model)
    const generationConfig: Record<string, unknown> = {
      temperature,
      maxOutputTokens: maxOutputTokens + thinking.headroom,
    }
    if (thinking.thinkingConfig) generationConfig.thinkingConfig = thinking.thinkingConfig
    return {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig,
    }
  }

  async generateComment({
    systemPrompt,
    userPrompt,
    signal,
  }: GenerateParams): Promise<GenerateResult> {
    const { baseUrl, model, apiKey, stream } = this.config
    const method = stream ? 'streamGenerateContent' : 'generateContent'
    // The key goes in a header, not the query string, so it never lands in URL logs.
    const url = `${baseUrl}/models/${encodeURIComponent(model)}:${method}${stream ? '?alt=sse' : ''}`
    const body = JSON.stringify(this.buildBody(systemPrompt, userPrompt))

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body,
        signal,
      })
    } catch (err) {
      throw toLlmError(err, 'Gemini')
    }

    if (!response.ok) {
      throw mapHttpError(response.status, await safeText(response), 'Gemini', this.id)
    }

    if (stream) {
      let acc = ''
      let finishReason: string | null = null
      try {
        for await (const data of iterateSSE(response, signal)) {
          const chunk = parseGemini(safeJson(data))
          if (chunk.blocked) finishReason = chunk.blocked
          if (chunk.text) {
            acc += chunk.text
            this.config.onToken?.(chunk.text)
          }
          if (chunk.finishReason) finishReason = chunk.finishReason
        }
      } catch (err) {
        throw toLlmError(err, 'Gemini')
      }
      return finish(acc, finishReason)
    }

    let json: unknown
    try {
      json = await response.json()
    } catch {
      throw new LlmError('bad_response', 'Gemini returned an unreadable response.')
    }
    const parsed = parseGemini(json)
    if (parsed.blocked) return finish('', parsed.blocked)
    if (parsed.text == null && !parsed.finishReason) {
      throw new LlmError('bad_response', 'Gemini returned an unexpected response shape.')
    }
    return finish(parsed.text ?? '', parsed.finishReason)
  }
}

function finish(text: string, finishReason: string | null): GenerateResult {
  if (finishReason && BLOCKED_FINISH.has(finishReason)) {
    throw new LlmError('refused', 'Gemini declined to write a comment for this post.')
  }
  return { text: text.trim(), truncated: finishReason === 'MAX_TOKENS' }
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean }> }
    finishReason?: string
  }>
  promptFeedback?: { blockReason?: string }
}

function safeJson(data: string): unknown {
  try {
    return JSON.parse(data)
  } catch {
    return null
  }
}

function parseGemini(json: unknown): {
  text: string | null
  finishReason: string | null
  blocked: string | null
} {
  const parsed = (json ?? {}) as GeminiResponse
  if (parsed.promptFeedback?.blockReason) {
    return { text: null, finishReason: null, blocked: 'SAFETY' }
  }
  const candidate = parsed.candidates?.[0]
  const parts = candidate?.content?.parts
  // Skip thought summaries; only the visible answer goes into the comment box.
  const text = parts
    ? parts
        .filter((p) => !p.thought)
        .map((p) => p.text ?? '')
        .join('')
    : null
  return {
    text: text && text.length > 0 ? text : null,
    finishReason: candidate?.finishReason ?? null,
    blocked: null,
  }
}
