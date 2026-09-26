import { PROVIDERS, resolveModel } from '@/llm/types'
import { getSettings, maskApiKey, resetSettings, setSettings } from '@/storage/storage'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Minimal in-memory chrome.storage.local mock.
function installChromeMock() {
  const store: Record<string, unknown> = {}
  const chromeMock = {
    storage: {
      local: {
        get: vi.fn(async (key: string) => (key in store ? { [key]: store[key] } : {})),
        set: vi.fn(async (obj: Record<string, unknown>) => {
          Object.assign(store, obj)
        }),
        remove: vi.fn(async (key: string) => {
          delete store[key]
        }),
      },
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
  }
  vi.stubGlobal('chrome', chromeMock)
  return store
}

beforeEach(() => {
  installChromeMock()
})

describe('storage', () => {
  it('returns validated defaults when nothing is stored', async () => {
    const s = await getSettings()
    expect(s.providerId).toBe('openai')
    expect(s.maxOutputTokens).toBe(200)
    expect(s.temperature).toBe(1.0)
    expect(s.streaming).toBe(true)
    expect(s.persona.role).toBe('')
  })

  it('round-trips a settings patch', async () => {
    await setSettings({ providerId: 'groq', apiKey: 'sk-xyz', model: 'openai/gpt-oss-20b' })
    const s = await getSettings()
    expect(s.providerId).toBe('groq')
    expect(s.apiKey).toBe('sk-xyz')
    expect(s.model).toBe('openai/gpt-oss-20b')
  })

  it('keeps the API key when another stored field is invalid', async () => {
    const store = installChromeMock()
    store['inlineai:settings'] = { apiKey: 'sk-keep', maxOutputTokens: 99999, providerId: 'nope' }
    const s = await getSettings()
    expect(s.apiKey).toBe('sk-keep')
    expect(s.maxOutputTokens).toBe(200)
    expect(s.providerId).toBe('openai')
  })

  it('never loses a field when two writes race', async () => {
    await Promise.all([setSettings({ apiKey: 'sk-a' }), setSettings({ model: 'gpt-5.5' })])
    const s = await getSettings()
    expect(s.apiKey).toBe('sk-a')
    expect(s.model).toBe('gpt-5.5')
  })

  it('falls back from retired models to the provider default', () => {
    expect(resolveModel({ providerId: 'google', model: 'gemini-1.5-flash' })).toBe(
      PROVIDERS.google.defaultModel,
    )
    expect(resolveModel({ providerId: 'groq', model: 'llama-3.3-70b-versatile' })).toBe(
      PROVIDERS.groq.defaultModel,
    )
    expect(resolveModel({ providerId: 'openai', model: 'my-fine-tune' })).toBe('my-fine-tune')
  })

  it('deep-merges the persona across patches', async () => {
    await setSettings({ persona: { role: 'Product Designer' } })
    await setSettings({ persona: { name: 'Ann' } })
    const s = await getSettings()
    expect(s.persona.role).toBe('Product Designer')
    expect(s.persona.name).toBe('Ann')
  })

  it('resets settings back to defaults', async () => {
    await setSettings({ apiKey: 'sk-secret' })
    await resetSettings()
    const s = await getSettings()
    expect(s.apiKey).toBe('')
  })

  it('masks API keys safely', () => {
    expect(maskApiKey('')).toBe('(none)')
    expect(maskApiKey('ab')).toBe('••••')
    expect(maskApiKey('sk-abcd1234')).toBe('••••1234')
  })
})
