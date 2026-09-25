import { AnthropicProvider } from './providers/anthropic'
import { GoogleProvider } from './providers/google'
import { GroqProvider } from './providers/groq'
import { OllamaProvider } from './providers/ollama'
import { OpenAIProvider } from './providers/openai'
import { OpenRouterProvider } from './providers/openrouter'
import {
  type LLMProvider,
  PROVIDERS,
  type ProviderRuntimeConfig,
  type Settings,
  resolveModel,
} from './types'

export interface ProviderOptions {
  onToken?: (delta: string) => void
  /** Force-disable streaming regardless of settings (used by Test connection). */
  stream?: boolean
  /** Override max output tokens (used by Test connection to keep it cheap). */
  maxOutputTokens?: number
  temperature?: number
}

/** Resolve a concrete LLMProvider from stored settings. */
export function getProvider(settings: Settings, opts: ProviderOptions = {}): LLMProvider {
  const meta = PROVIDERS[settings.providerId]
  const baseUrl = settings.baseUrlOverride.trim() || meta.baseUrl
  const model = resolveModel(settings)

  const config: ProviderRuntimeConfig = {
    apiKey: settings.apiKey.trim(),
    model,
    baseUrl,
    maxOutputTokens: opts.maxOutputTokens ?? settings.maxOutputTokens,
    temperature: opts.temperature ?? settings.temperature,
    stream: opts.stream ?? settings.streaming,
    onToken: opts.onToken,
  }

  switch (settings.providerId) {
    case 'openai':
      return new OpenAIProvider(config)
    case 'anthropic':
      return new AnthropicProvider(config)
    case 'google':
      return new GoogleProvider(config)
    case 'openrouter':
      return new OpenRouterProvider(config)
    case 'groq':
      return new GroqProvider(config)
    case 'ollama':
      return new OllamaProvider(config)
  }
}
