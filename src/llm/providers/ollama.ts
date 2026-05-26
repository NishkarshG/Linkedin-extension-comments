import type { ProviderRuntimeConfig } from '../types'
import { OpenAICompatibleProvider, noAuth } from './shared'

/** Local Ollama — OpenAI-compatible /chat/completions, no auth. */
export class OllamaProvider extends OpenAICompatibleProvider {
  constructor(config: ProviderRuntimeConfig) {
    super({ ...config, id: 'ollama', providerName: 'Ollama', authHeaders: noAuth })
  }
}
