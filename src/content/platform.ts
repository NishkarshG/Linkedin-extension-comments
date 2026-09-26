import type { Platform, PostData } from '@/shared/types'
import {
  activatePostButton,
  leadingEntity,
  replaceText,
  replaceTextDraft,
  userDraftText,
} from './inserter'
import * as linkedin from './linkedin-dom'
import * as x from './x-dom'

/** Everything the content script needs to know about one site. */
export interface PlatformAdapter {
  id: Platform
  isInScope(): boolean
  commentInputFrom(target: EventTarget | null): HTMLElement | null
  findPostContainer(input: Element): HTMLElement | null
  findComposerScope(input: Element): HTMLElement | null
  expandSeeMore(container: HTMLElement): Promise<void>
  extractPost(input: HTMLElement, container: HTMLElement): PostData
  /** Text the user typed into the box themselves (mentions excluded). */
  draftText(input: HTMLElement): string
  /** A leading element to keep in front of the generated text (LinkedIn @mention). */
  anchor(input: HTMLElement): Element | null
  /** Whether partial text is written into the box while the answer streams in. */
  streamsIntoBox: boolean
  /** Replace the box's text with `text`, keeping `anchor`. Resolves to success. */
  write(input: HTMLElement, text: string, anchor: Element | null): Promise<boolean>
  /** Called once after the final text is written. */
  afterWrite(input: HTMLElement): void
}

const linkedinAdapter: PlatformAdapter = {
  id: 'linkedin',
  isInScope: () => linkedin.isInScope(),
  commentInputFrom: linkedin.commentInputFrom,
  findPostContainer: linkedin.findPostContainer,
  findComposerScope: linkedin.findComposerScope,
  expandSeeMore: linkedin.expandSeeMore,
  extractPost: linkedin.extractPost,
  draftText: userDraftText,
  anchor: leadingEntity,
  streamsIntoBox: true,
  write: async (input, text, anchor) => replaceText(input, text, anchor),
  afterWrite: activatePostButton,
}

const xAdapter: PlatformAdapter = {
  id: 'x',
  isInScope: () => x.isInScope(),
  commentInputFrom: x.commentInputFrom,
  findPostContainer: x.findPostContainer,
  findComposerScope: x.findComposerScope,
  expandSeeMore: x.expandSeeMore,
  extractPost: x.extractPost,
  draftText: (input) => (input.textContent ?? '').replace(/\s+/g, ' ').trim(),
  anchor: () => null,
  // Every write to Draft.js is an async select-all + paste. Streaming would
  // fire one every 80ms and race itself, so X gets the finished reply only.
  streamsIntoBox: false,
  write: (input, text) => replaceTextDraft(input, text),
  afterWrite: () => {},
}

/** The adapter for a hostname, or null on sites we do not run on. */
export function platformFor(hostname: string): PlatformAdapter | null {
  const host = hostname.toLowerCase()
  if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) return linkedinAdapter
  if (host === 'x.com' || host.endsWith('.x.com')) return xAdapter
  if (host === 'twitter.com' || host.endsWith('.twitter.com')) return xAdapter
  return null
}
