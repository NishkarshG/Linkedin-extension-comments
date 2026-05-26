// Pure, dependency-free domain types.
// IMPORTANT: this file must never import zod or anything heavy — it is imported
// (type-only) by the content script, which has a tight bundle budget.

/** Canonical repo URL (used for footer links + OpenRouter attribution). */
export const REPO_URL = 'https://github.com/inlineai/inlineai'

export type ProviderId = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'groq' | 'ollama'

export const PROVIDER_IDS: ProviderId[] = [
  'openai',
  'anthropic',
  'google',
  'openrouter',
  'groq',
  'ollama',
]

/** Heuristic classification of a LinkedIn post, refined by the model at write time. */
export type PostType =
  | 'achievement'
  | 'opinion'
  | 'question'
  | 'story'
  | 'news'
  | 'product_launch'
  | 'hiring'
  | 'personal'
  | 'tutorial'
  | 'meme'
  | 'unknown'

export const POST_TYPES: PostType[] = [
  'achievement',
  'opinion',
  'question',
  'story',
  'news',
  'product_launch',
  'hiring',
  'personal',
  'tutorial',
  'meme',
  'unknown',
]

export type MediaType = 'text' | 'article' | 'image' | 'video' | 'document' | 'repost' | 'unknown'

/** Sanitised post data extracted from the DOM. Never raw page HTML. */
export interface PostData {
  author: string
  authorHeadline: string
  body: string
  mediaType: MediaType
  hashtags: string[]
  postType: PostType
  /** True when commenting on a reply thread rather than the top-level post. */
  isReply: boolean
  /** When replying, the text of the comment being replied to (extra context). */
  repliedToText?: string
}

/** The commenter persona, supplied by the user in settings. All fields optional. */
export interface Persona {
  name: string
  role: string
  expertise: string
  industry: string
  voiceNotes: string
}

/** Stable error taxonomy surfaced to the user (mapped from provider failures). */
export type LlmErrorCode =
  | 'no_api_key'
  | 'invalid_key'
  | 'rate_limited'
  | 'server_error'
  | 'network'
  | 'aborted'
  | 'bad_response'
  | 'empty_post'
  | 'unknown'
