// Pure, dependency-free domain types.
// IMPORTANT: this file must never import zod or anything heavy — it is imported
// (type-only) by the content script, which has a tight bundle budget.

/** Canonical repo URL (used for footer links + OpenRouter attribution). */
export const REPO_URL = 'https://github.com/NishkarshG/Linkedin-extension-comments'

/** Sites the content script runs on. Each has its own DOM adapter and skill prompt. */
export type Platform = 'linkedin' | 'x'

export type ProviderId = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'groq' | 'ollama'

export const PROVIDER_IDS: ProviderId[] = [
  'openai',
  'anthropic',
  'google',
  'openrouter',
  'groq',
  'ollama',
]

/** Heuristic classification of a post, refined by the model at write time. */
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
  /** Where the post was read, which picks the skill prompt. */
  platform: Platform
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
  /** A few of the user's own past comments, used only as a style reference. */
  voiceSamples: string
}

/** Stable error taxonomy surfaced to the user (mapped from provider failures). */
export type LlmErrorCode =
  | 'no_api_key'
  | 'no_permission'
  | 'invalid_key'
  | 'rate_limited'
  | 'server_error'
  | 'network'
  | 'timeout'
  | 'aborted'
  | 'bad_response'
  | 'empty_output'
  | 'refused'
  | 'unknown'
