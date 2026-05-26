import type { ProviderRuntimeConfig } from '../types'
import { OpenAICompatibleProvider } from './shared'

/** Groq — OpenAI-compatible /chat/completions, Bearer auth. */
export class GroqProvider extends OpenAICompatibleProvider {
  constructor(config: ProviderRuntimeConfig) {
    super({ ...config, id: 'groq', providerName: 'Groq' })
  }
}
