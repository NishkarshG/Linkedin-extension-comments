import type { ProviderRuntimeConfig } from '../types'
import { OpenAICompatibleProvider, openAITuning } from './shared'

/** OpenAI Chat Completions (/chat/completions, Bearer auth). */
export class OpenAIProvider extends OpenAICompatibleProvider {
  constructor(config: ProviderRuntimeConfig) {
    super({ ...config, id: 'openai', providerName: 'OpenAI', tuning: openAITuning })
  }
}
