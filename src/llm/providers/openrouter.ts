import { OPENROUTER_REFERER, OPENROUTER_TITLE, type ProviderRuntimeConfig } from '../types'
import { OpenAICompatibleProvider } from './shared'

/** OpenRouter — OpenAI-compatible /chat/completions, Bearer auth + attribution headers. */
export class OpenRouterProvider extends OpenAICompatibleProvider {
  constructor(config: ProviderRuntimeConfig) {
    super({
      ...config,
      id: 'openrouter',
      providerName: 'OpenRouter',
      extraHeaders: {
        'HTTP-Referer': OPENROUTER_REFERER,
        'X-Title': OPENROUTER_TITLE,
      },
    })
  }
}
