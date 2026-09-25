import { AnthropicProvider, anthropicAcceptsTemperature } from '@/llm/providers/anthropic'
import { GoogleProvider, geminiThinking } from '@/llm/providers/google'
import { GroqProvider } from '@/llm/providers/groq'
import { OllamaProvider } from '@/llm/providers/ollama'
import { OpenAIProvider } from '@/llm/providers/openai'
import { mapHttpError, openAITuning, toLlmError } from '@/llm/providers/shared'
import { LlmError, type ProviderRuntimeConfig } from '@/llm/types'
import { afterEach, describe, expect, it, vi } from 'vitest'

const baseConfig: ProviderRuntimeConfig = {
  apiKey: 'sk-test-key-1234',
  model: 'test-model',
  baseUrl: 'https://api.example.com/v1',
  maxOutputTokens: 50,
  temperature: 0.7,
  stream: false,
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 400,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

function sseResponse(lines: string[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line))
      controller.close()
    },
  })
  return { ok: true, status: 200, body: stream } as unknown as Response
}

function mockFetch(response: Response) {
  const fn = vi.fn(async () => response)
  vi.stubGlobal('fetch', fn)
  return fn
}

const params = () => ({
  systemPrompt: 'system',
  userPrompt: 'user',
  signal: new AbortController().signal,
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('OpenAIProvider', () => {
  it('sends a correct Chat Completions request and parses the message', async () => {
    const fetchFn = mockFetch(
      jsonResponse({ choices: [{ message: { content: 'A specific comment.' } }] }),
    )
    const provider = new OpenAIProvider(baseConfig)
    const out = await provider.generateComment(params())

    expect(out).toEqual({ text: 'A specific comment.', truncated: false })
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.example.com/v1/chat/completions')
    const headers = init.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer sk-test-key-1234')
    const body = JSON.parse(init.body as string)
    expect(body.model).toBe('test-model')
    expect(body.stream).toBe(false)
    // Unknown (non reasoning) OpenAI models: max_completion_tokens + temperature.
    expect(body.max_completion_tokens).toBe(50)
    expect(body.temperature).toBe(0.7)
    expect(body.reasoning_effort).toBeUndefined()
    expect(body.messages).toEqual([
      { role: 'system', content: 'system' },
      { role: 'user', content: 'user' },
    ])
  })

  it('streams SSE deltas through onToken', async () => {
    const tokens: string[] = []
    mockFetch(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n',
        'data: {"choices":[{"delta":{"content":" world"}}]}\n',
        'data: [DONE]\n',
      ]),
    )
    const provider = new OpenAIProvider({
      ...baseConfig,
      stream: true,
      onToken: (d) => tokens.push(d),
    })
    const out = await provider.generateComment(params())
    expect(out).toEqual({ text: 'Hello world', truncated: false })
    expect(tokens).toEqual(['Hello', ' world'])
  })

  it('maps 401 to an invalid_key error', async () => {
    mockFetch(jsonResponse({ error: 'nope' }, 401))
    const provider = new OpenAIProvider(baseConfig)
    await expect(provider.generateComment(params())).rejects.toMatchObject({
      code: 'invalid_key',
    })
  })

  it('maps 429 to rate_limited and 500 to server_error', async () => {
    mockFetch(jsonResponse({}, 429))
    await expect(new OpenAIProvider(baseConfig).generateComment(params())).rejects.toMatchObject({
      code: 'rate_limited',
    })
    mockFetch(jsonResponse({}, 500))
    await expect(new OpenAIProvider(baseConfig).generateComment(params())).rejects.toMatchObject({
      code: 'server_error',
    })
  })

  it('maps network failures to a network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    await expect(new OpenAIProvider(baseConfig).generateComment(params())).rejects.toBeInstanceOf(
      LlmError,
    )
    await expect(new OpenAIProvider(baseConfig).generateComment(params())).rejects.toMatchObject({
      code: 'network',
    })
  })
})

describe('AnthropicProvider', () => {
  it('sends the Messages API shape with required headers and parses content', async () => {
    const fetchFn = mockFetch(jsonResponse({ content: [{ type: 'text', text: 'Claude reply.' }] }))
    const out = await new AnthropicProvider(baseConfig).generateComment(params())

    expect(out).toEqual({ text: 'Claude reply.', truncated: false })
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.example.com/v1/messages')
    const headers = init.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('sk-test-key-1234')
    expect(headers['anthropic-version']).toBe('2023-06-01')
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true')
    const body = JSON.parse(init.body as string)
    expect(body.system).toEqual([
      { type: 'text', text: 'system', cache_control: { type: 'ephemeral' } },
    ])
    expect(body.messages).toEqual([{ role: 'user', content: 'user' }])
  })
})

describe('GoogleProvider', () => {
  it('uses generateContent with the key in a header, never the URL', async () => {
    const fetchFn = mockFetch(
      jsonResponse({ candidates: [{ content: { parts: [{ text: 'Gemini reply.' }] } }] }),
    )
    const out = await new GoogleProvider(baseConfig).generateComment(params())

    expect(out).toEqual({ text: 'Gemini reply.', truncated: false })
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/models/test-model:generateContent')
    expect(url).not.toContain('sk-test-key-1234')
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('sk-test-key-1234')
  })

  it('flags MAX_TOKENS as truncated and skips thought parts', async () => {
    mockFetch(
      jsonResponse({
        candidates: [
          {
            content: { parts: [{ text: 'thinking…', thought: true }, { text: 'Half a comm' }] },
            finishReason: 'MAX_TOKENS',
          },
        ],
      }),
    )
    const out = await new GoogleProvider(baseConfig).generateComment(params())
    expect(out).toEqual({ text: 'Half a comm', truncated: true })
  })

  it('maps safety blocks to a refused error', async () => {
    mockFetch(jsonResponse({ promptFeedback: { blockReason: 'SAFETY' } }))
    await expect(new GoogleProvider(baseConfig).generateComment(params())).rejects.toMatchObject({
      code: 'refused',
    })
  })

  it('keeps thinking small so it cannot eat the whole output budget', () => {
    expect(geminiThinking('gemini-3.5-flash-lite')).toEqual({
      thinkingConfig: { thinkingLevel: 'low' },
      headroom: 2048,
    })
    expect(geminiThinking('gemini-2.5-flash').thinkingConfig).toEqual({ thinkingBudget: 0 })
    const body = new GoogleProvider({ ...baseConfig, model: 'gemini-3.8-flash' }).buildBody(
      's',
      'u',
    ) as { generationConfig: { maxOutputTokens: number } }
    expect(body.generationConfig.maxOutputTokens).toBe(50 + 2048)
  })
})

describe('reasoning model request shapes', () => {
  it('drops temperature and max_tokens for OpenAI reasoning models', () => {
    const body = new OpenAIProvider({ ...baseConfig, model: 'gpt-5.4-mini' }).buildBody('s', 'u')
    expect(body.temperature).toBeUndefined()
    expect(body.max_tokens).toBeUndefined()
    expect(body.max_completion_tokens).toBe(50)
    expect(body.reasoning_effort).toBe('none')

    expect(openAITuning('gpt-5-mini').reasoningEffort).toBe('minimal')
    expect(openAITuning('o4-mini')).toMatchObject({
      sendTemperature: false,
      reasoningEffort: 'low',
    })
    expect(openAITuning('gpt-4o-mini').sendTemperature).toBe(true)
  })

  it('gives Groq gpt-oss reasoning headroom', () => {
    const body = new GroqProvider({ ...baseConfig, model: 'openai/gpt-oss-120b' }).buildBody(
      's',
      'u',
    )
    expect(body.max_completion_tokens).toBe(50 + 1024)
    expect(body.reasoning_effort).toBe('low')
  })

  it('keeps plain max_tokens + temperature for Ollama', () => {
    const body = new OllamaProvider({ ...baseConfig, model: 'llama3.1:8b' }).buildBody('s', 'u')
    expect(body.max_tokens).toBe(50)
    expect(body.temperature).toBe(0.7)
  })

  it('only sends temperature to Claude models that accept it', () => {
    expect(anthropicAcceptsTemperature('claude-haiku-4-5')).toBe(true)
    expect(anthropicAcceptsTemperature('claude-haiku-4-5-20251001')).toBe(true)
    expect(anthropicAcceptsTemperature('claude-sonnet-4-6')).toBe(true)
    expect(anthropicAcceptsTemperature('claude-opus-4-8')).toBe(false)
    expect(anthropicAcceptsTemperature('claude-sonnet-5')).toBe(false)

    const modern = new AnthropicProvider({ ...baseConfig, model: 'claude-sonnet-5' }).buildBody(
      's',
      'u',
    )
    expect(modern.temperature).toBeUndefined()
    expect(modern.output_config).toEqual({ effort: 'low' })
    expect(modern.max_tokens).toBe(50 + 2048)

    const legacy = new AnthropicProvider({
      ...baseConfig,
      model: 'claude-haiku-4-5',
      temperature: 1.5,
    }).buildBody('s', 'u')
    expect(legacy.temperature).toBe(1) // Anthropic caps temperature at 1
    expect(legacy.output_config).toBeUndefined()
  })
})

describe('truncation and refusals', () => {
  it('reports OpenAI finish_reason length as truncated (streaming)', async () => {
    mockFetch(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"Cut"}}]}\n',
        'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n',
        'data: [DONE]\n',
      ]),
    )
    const out = await new OpenAIProvider({ ...baseConfig, stream: true }).generateComment(params())
    expect(out).toEqual({ text: 'Cut', truncated: true })
  })

  it('reports Anthropic max_tokens as truncated and refusal as an error', async () => {
    mockFetch(
      sseResponse([
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}\n',
        'data: {"type":"message_delta","delta":{"stop_reason":"max_tokens"}}\n',
      ]),
    )
    const out = await new AnthropicProvider({ ...baseConfig, stream: true }).generateComment(
      params(),
    )
    expect(out).toEqual({ text: 'Hi', truncated: true })

    mockFetch(jsonResponse({ content: [], stop_reason: 'refusal' }))
    await expect(new AnthropicProvider(baseConfig).generateComment(params())).rejects.toMatchObject(
      { code: 'refused' },
    )
  })
})

describe('error mapping', () => {
  it('explains Ollama origin blocks instead of blaming the API key', () => {
    const err = mapHttpError(403, '', 'Ollama', 'ollama')
    expect(err.message).toContain('OLLAMA_ORIGINS')
    expect(mapHttpError(403, '', 'OpenAI', 'openai').message).toContain('Invalid API key')
  })

  it('maps 404 to a model not found message', () => {
    expect(mapHttpError(404, '', 'OpenAI').message).toContain('could not find that model')
  })

  it('maps timeouts to a timeout error', () => {
    expect(toLlmError(new DOMException('slow', 'TimeoutError'), 'OpenAI').code).toBe('timeout')
  })
})
