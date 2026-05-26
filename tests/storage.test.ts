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
    await setSettings({ providerId: 'groq', apiKey: 'sk-xyz', model: 'llama-3.1-8b-instant' })
    const s = await getSettings()
    expect(s.providerId).toBe('groq')
    expect(s.apiKey).toBe('sk-xyz')
    expect(s.model).toBe('llama-3.1-8b-instant')
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
