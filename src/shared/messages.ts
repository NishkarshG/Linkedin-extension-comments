// Typed message protocol between content script, background worker, and popup.
// Pure types + constants only (imported type-only by the content script).

import type { LlmErrorCode, PostData } from './types'

/** Long-lived port name used to stream a generated comment back to the content script. */
export const GENERATE_PORT = 'inlineai:generate'

/** Sentinel the model may return for low-value posts (see linkedin-skill.md §9). */
export const SKIP_TOKEN = 'SKIP'

/** Messages the content script sends over the generate port. */
export type GeneratePortRequest = { type: 'start'; post: PostData } | { type: 'abort' }

/** Messages the background worker streams back over the generate port. */
export type GeneratePortResponse =
  | { type: 'chunk'; delta: string }
  | { type: 'done'; text: string }
  | { type: 'skip' }
  | { type: 'error'; code: LlmErrorCode; message: string }

/** One-shot runtime messages (chrome.runtime.sendMessage). */
export type RuntimeMessage = { type: 'OPEN_SETTINGS' } | { type: 'PING' }

export type RuntimeResponse = { ok: true } | { ok: false; error: string }
