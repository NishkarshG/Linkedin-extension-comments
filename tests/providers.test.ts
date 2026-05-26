import { AnthropicProvider } from '@/llm/providers/anthropic'
import { GoogleProvider } from '@/llm/providers/google'
import { OpenAIProvider } from '@/llm/providers/openai'
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

    expect(out).toBe('A specific comment.')
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.example.com/v1/chat/completions')
    const headers = init.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer sk-test-key-1234')
    const body = JSON.parse(init.body as string)
    expect(body.model).toBe('test-model')
    expect(body.stream).toBe(false)
    expect(body.max_tokens).toBe(50)
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
    expect(out).toBe('Hello world')
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

    expect(out).toBe('Claude reply.')
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.example.com/v1/messages')
    const headers = init.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('sk-test-key-1234')
    expect(headers['anthropic-version']).toBe('2023-06-01')
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true')
    const body = JSON.parse(init.body as string)
    expect(body.system).toBe('system')
    expect(body.messages).toEqual([{ role: 'user', content: 'user' }])
  })
})

describe('GoogleProvider', () => {
  it('uses generateContent with a key query param and parses candidates', async () => {
    const fetchFn = mockFetch(
      jsonResponse({ candidates: [{ content: { parts: [{ text: 'Gemini reply.' }] } }] }),
    )
    const out = await new GoogleProvider(baseConfig).generateComment(params())

    expect(out).toBe('Gemini reply.')
    const [url] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/models/test-model:generateContent')
    expect(url).toContain('key=sk-test-key-1234')
  })
})
