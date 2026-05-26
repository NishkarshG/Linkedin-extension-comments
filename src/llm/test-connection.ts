import { getProvider } from './factory'
import { LlmError, PROVIDERS, type Settings } from './types'

export interface TestResult {
  ok: boolean
  message: string
}

/** Fire a minimal, cheap request to verify the provider + key work. */
export async function testConnection(settings: Settings, signal: AbortSignal): Promise<TestResult> {
  const meta = PROVIDERS[settings.providerId]
  if (meta.requiresKey && !settings.apiKey.trim()) {
    return { ok: false, message: 'Add an API key first.' }
  }
  try {
    const provider = getProvider(settings, { stream: false, maxOutputTokens: 5, temperature: 0 })
    await provider.generateComment({
      systemPrompt: 'You are a connection test. Reply with the single word: ok.',
      userPrompt: 'Say ok.',
      signal,
    })
    return { ok: true, message: 'Connected successfully.' }
  } catch (err) {
    if (err instanceof LlmError) return { ok: false, message: err.message }
    return { ok: false, message: 'Connection failed. Check the model id and base URL.' }
  }
}
