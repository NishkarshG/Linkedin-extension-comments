import { type LlmErrorCode, type ProviderId, REPO_URL } from '@/shared/types'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Settings + persona schemas (validated on every read from chrome.storage.local)
//
// Every field has a `.catch()` so one bad or out-of-range value only resets
// THAT field. Previously a single invalid field threw the whole object away,
// silently wiping the user's API key.
// ---------------------------------------------------------------------------

const str = () => z.string().default('').catch('')

export const PersonaSchema = z
  .object({
    name: str(),
    role: str(),
    expertise: str(),
    industry: str(),
    voiceNotes: str(),
    /** A few of the user's own past comments, pasted as a style reference. */
    voiceSamples: str(),
  })
  .default({})
  .catch({ name: '', role: '', expertise: '', industry: '', voiceNotes: '', voiceSamples: '' })

export type Persona = z.infer<typeof PersonaSchema>

export const MAX_OUTPUT_TOKENS_MIN = 20
export const MAX_OUTPUT_TOKENS_MAX = 2000

export const SettingsSchema = z.object({
  providerId: z
    .enum(['openai', 'anthropic', 'google', 'openrouter', 'groq', 'ollama'])
    .default('openai')
    .catch('openai'),
  /** Empty string means "use the provider's default model". */
  model: str(),
  apiKey: str(),
  /** Optional base URL override (mainly for self hosted Ollama on a non default host). */
  baseUrlOverride: str(),
  persona: PersonaSchema,

  // ----- Advanced (options page) -----
  /** When non-empty, overrides the bundled linkedin-skill.md system prompt. */
  customSystemPrompt: str(),
  /** When non-empty, overrides the bundled x-skill.md system prompt. */
  customSystemPromptX: str(),
  maxOutputTokens: z
    .number()
    .int()
    .min(MAX_OUTPUT_TOKENS_MIN)
    .max(MAX_OUTPUT_TOKENS_MAX)
    .default(200)
    .catch(200),
  temperature: z.number().min(0).max(2).default(1.0).catch(1.0),
  streaming: z.boolean().default(true).catch(true),
  autoExpandSeeMore: z.boolean().default(true).catch(true),
  debug: z.boolean().default(false).catch(false),
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

/** What a provider returns: the text plus whether the model hit the output cap. */
export interface GenerateResult {
  text: string
  /** True when the provider stopped because of the max output tokens limit. */
  truncated: boolean
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
  generateComment(params: GenerateParams): Promise<GenerateResult>
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
//
// Model lists go stale quickly (providers retire models every few months), so
// every provider also accepts a custom model id in the UI. Last reviewed: 2026-09.
// ---------------------------------------------------------------------------

export interface ProviderMeta {
  id: ProviderId
  displayName: string
  baseUrl: string
  defaultModel: string
  /** Suggested models, or 'freeform' when the user must type a model id. */
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
    defaultModel: 'gpt-5.4-mini',
    models: ['gpt-5.4-mini', 'gpt-5.5', 'gpt-5-mini', 'gpt-4.1-mini', 'gpt-4o-mini'],
    requiresKey: true,
    keyHelpUrl: 'https://platform.openai.com/api-keys',
  },
  anthropic: {
    id: 'anthropic',
    displayName: 'Anthropic (Claude)',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-haiku-4-5',
    models: ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-sonnet-5', 'claude-opus-4-8'],
    requiresKey: true,
    keyHelpUrl: 'https://console.anthropic.com/settings/keys',
  },
  google: {
    id: 'google',
    displayName: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-3.5-flash-lite',
    models: ['gemini-3.5-flash-lite', 'gemini-3.8-flash'],
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
    note: 'OpenRouter exposes hundreds of models. Type any model id, for example anthropic/claude-haiku-4.5.',
  },
  groq: {
    id: 'groq',
    displayName: 'Groq (fastest, free tier)',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'openai/gpt-oss-120b',
    models: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'],
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
    note: 'Requires Ollama running locally, started with OLLAMA_ORIGINS=chrome-extension://* so the extension may call it. No API key needed. Type any installed model id.',
  },
}

/**
 * Model ids that providers have shut down. A stored value matching one of
 * these falls back to the provider default instead of failing every request.
 */
const RETIRED_MODEL_PATTERNS: RegExp[] = [
  /^gemini-1\.5/,
  /^gemini-2\.0/,
  /^mixtral-8x7b-32768$/,
  /^llama-3\.3-70b-versatile$/,
  /^llama-3\.1-8b-instant$/,
  /^llama3-(8b|70b)-8192$/,
]

export function isRetiredModel(model: string): boolean {
  return RETIRED_MODEL_PATTERNS.some((re) => re.test(model))
}

/** The model a request will actually use: the stored choice, or the provider default. */
export function resolveModel(settings: Pick<Settings, 'providerId' | 'model'>): string {
  const model = settings.model.trim()
  if (!model || isRetiredModel(model)) return PROVIDERS[settings.providerId].defaultModel
  return model
}

/** OpenRouter attribution headers (see provider spec). */
export const OPENROUTER_REFERER = REPO_URL
export const OPENROUTER_TITLE = 'InlineAI'
