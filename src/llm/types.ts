import { type LlmErrorCode, type ProviderId, REPO_URL } from '@/shared/types'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Settings + persona schemas (validated on every read from chrome.storage.local)
// ---------------------------------------------------------------------------

export const PersonaSchema = z.object({
  name: z.string().default(''),
  role: z.string().default(''),
  expertise: z.string().default(''),
  industry: z.string().default(''),
  voiceNotes: z.string().default(''),
})

export type Persona = z.infer<typeof PersonaSchema>

export const SettingsSchema = z.object({
  providerId: z
    .enum(['openai', 'anthropic', 'google', 'openrouter', 'groq', 'ollama'])
    .default('openai'),
  /** Empty string means "use the provider's default model". */
  model: z.string().default(''),
  apiKey: z.string().default(''),
  /** Optional base-URL override (mainly for self-hosted Ollama on a non-default host). */
  baseUrlOverride: z.string().default(''),
  persona: PersonaSchema.default({}),

  // ----- Advanced (options page) -----
  /** When non-empty, overrides the bundled linkedin-skill.md system prompt. */
  customSystemPrompt: z.string().default(''),
  maxOutputTokens: z.number().int().positive().max(2000).default(200),
  temperature: z.number().min(0).max(2).default(1.0),
  streaming: z.boolean().default(true),
  autoExpandSeeMore: z.boolean().default(true),
  debug: z.boolean().default(false),
})

export type Settings = z.infer<typeof SettingsSchema>

/** A patch for setSettings/useSettings.update — persona may be partial (deep-merged). */
export type SettingsPatch = Partial<Omit<Settings, 'persona'>> & { persona?: Partial<Persona> }

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({})

// ---------------------------------------------------------------------------
// Provider abstraction
// ---------------------------------------------------------------------------

/** Per-call inputs. Mirrors the spec's narrow LLMProvider contract. */
export interface GenerateParams {
  systemPrompt: string
  userPrompt: string
  signal: AbortSignal
}

/** Config a provider class is constructed with (resolved from Settings). */
export interface ProviderRuntimeConfig {
  apiKey: string
  model: string
  baseUrl: string
  maxOutputTokens: number
  temperature: number
  stream: boolean
  /** Called with each streamed delta when streaming is enabled. */
  onToken?: (delta: string) => void
}

export interface LLMProvider {
  readonly id: ProviderId
  generateComment(params: GenerateParams): Promise<string>
}

/** Typed error with a stable code; providers map HTTP/network failures into this. */
export class LlmError extends Error {
  readonly code: LlmErrorCode
  constructor(code: LlmErrorCode, message: string) {
    super(message)
    this.name = 'LlmError'
    this.code = code
  }
}

// ---------------------------------------------------------------------------
// Provider registry (UI metadata + defaults). Imported by popup/options + factory.
// ---------------------------------------------------------------------------

export interface ProviderMeta {
  id: ProviderId
  displayName: string
  baseUrl: string
  defaultModel: string
  /** Known model list, or 'freeform' when the user must type a model id. */
  models: string[] | 'freeform'
  requiresKey: boolean
  keyHelpUrl?: string
  note?: string
}

export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  openai: {
    id: 'openai',
    displayName: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o4-mini'],
    requiresKey: true,
    keyHelpUrl: 'https://platform.openai.com/api-keys',
  },
  anthropic: {
    id: 'anthropic',
    displayName: 'Anthropic (Claude)',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-haiku-4-5-20251001',
    models: [
      'claude-opus-4-7',
      'claude-opus-4-6',
      'claude-sonnet-4-6',
      'claude-haiku-4-5-20251001',
    ],
    requiresKey: true,
    keyHelpUrl: 'https://console.anthropic.com/settings/keys',
  },
  google: {
    id: 'google',
    displayName: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-1.5-flash',
    models: [
      'gemini-1.5-flash',
      'gemini-1.5-flash-latest',
      'gemini-1.5-pro',
      'gemini-1.5-pro-latest',
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
      'gemini-2.5-pro',
    ],
    requiresKey: true,
    keyHelpUrl: 'https://aistudio.google.com/app/apikey',
  },
  openrouter: {
    id: 'openrouter',
    displayName: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    models: 'freeform',
    requiresKey: true,
    keyHelpUrl: 'https://openrouter.ai/keys',
    note: 'OpenRouter exposes hundreds of models — type any model id (e.g. anthropic/claude-3.5-sonnet).',
  },
  groq: {
    id: 'groq',
    displayName: 'Groq (fastest, free tier)',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
    requiresKey: true,
    keyHelpUrl: 'https://console.groq.com/keys',
  },
  ollama: {
    id: 'ollama',
    displayName: 'Local (Ollama)',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.1:8b',
    models: 'freeform',
    requiresKey: false,
    keyHelpUrl: 'https://ollama.com/download',
    note: 'Requires Ollama running locally. No API key needed. Type any installed model id.',
  },
}

/** OpenRouter attribution headers (see provider spec). */
export const OPENROUTER_REFERER = REPO_URL
export const OPENROUTER_TITLE = 'InlineAI for LinkedIn'
