// Typed message protocol between content script, background worker, and popup.
// Pure types + constants only (imported type-only by the content script).

import type { LlmErrorCode, PostData } from './types'

/** Long-lived port name used to stream a generated comment back to the content script. */
export const GENERATE_PORT = 'inlineai:generate'

/** Sentinel the model may return for low-value posts (see linkedin-skill.md §9). */
export const SKIP_TOKEN = 'SKIP'

/** Letters only, upper cased: "Skip." and "**SKIP**" both normalise to "SKIP". */
function lettersOnly(text: string): string {
  return text.replace(/[^a-z]/gi, '').toUpperCase()
}

/** True when the model's whole answer is the SKIP sentinel (tolerating punctuation/case). */
export function isSkipResponse(text: string): boolean {
  const trimmed = text.trim()
  return trimmed.length <= SKIP_TOKEN.length + 6 && lettersOnly(trimmed) === SKIP_TOKEN
}

/**
 * True while a streamed prefix could still turn out to be the SKIP sentinel,
 * so the worker holds it back instead of flashing "SKIP" into the comment box.
 */
export function couldBeSkipPrefix(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length > SKIP_TOKEN.length + 6) return false
  return SKIP_TOKEN.startsWith(lettersOnly(trimmed))
}

/** Messages the content script sends over the generate port. */
export type GeneratePortRequest = { type: 'start'; post: PostData } | { type: 'abort' }

/** Messages the background worker streams back over the generate port. */
export type GeneratePortResponse =
  | { type: 'chunk'; delta: string }
  | { type: 'done'; text: string; truncated: boolean }
  | { type: 'skip' }
  | { type: 'error'; code: LlmErrorCode; message: string }

/** One-shot runtime messages (chrome.runtime.sendMessage). */
export type RuntimeMessage = { type: 'OPEN_SETTINGS' } | { type: 'PING' }

export type RuntimeResponse = { ok: true } | { ok: false; error: string }
