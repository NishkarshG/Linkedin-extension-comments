import type { MediaType, PostData } from '@/shared/types'
import { classifyPostType, debugLog } from './linkedin-dom'

// ===========================================================================
// X (Twitter) DOM strategy
// ---------------------------------------------------------------------------
// X ships hashed, rotating class names, but its `data-testid` attributes are
// stable (its own end to end tests depend on them). Every selector here is
// anchored on a data-testid or ARIA role. All selectors live in this one
// object so they can be patched in one place.
//
// The reply box is a Draft.js editor. It lives in one of two places:
//   - the inline composer under the focused post on a /status/ page, which is
//     a sibling cell AFTER that post's <article>, not inside it;
//   - the reply dialog, which shows the post being replied to above the box.
// Either way, the post we reply to is the last one before the box in document
// order. A composer with no post before it (home "What's happening?", the
// compose dialog) is a new post, not a reply, and gets no pill.
// Last reviewed: 2026-09.
// ===========================================================================

export const X_SELECTORS = {
  composer:
    '[data-testid^="tweetTextarea_"][contenteditable="true"], .public-DraftEditor-content[contenteditable="true"]',
  tweet: 'article[data-testid="tweet"]',
  tweetText: '[data-testid="tweetText"]',
  userName: '[data-testid="User-Name"]',
  /** A quoted post is rendered as a clickable card inside the quoting post. */
  quote: '[role="link"]',
  dialog: '[role="dialog"]',
  cell: '[data-testid="cellInnerDiv"]',
  photo: '[data-testid="tweetPhoto"]',
  video: '[data-testid="videoPlayer"], [data-testid="videoComponent"], video',
  card: '[data-testid="card.wrapper"]',
  hashtagLink: 'a[href^="/hashtag/"]',
  dmComposer: '[data-testid="dmComposerTextInput"], [data-testid="DmActivityContainer"]',
} as const

const OUT_OF_SCOPE_PREFIXES = ['/messages', '/i/chat', '/i/grok', '/settings', '/compose/articles']

/** Pages where the pill may appear. Direct messages are always excluded. */
export function isInScope(pathname: string = location.pathname): boolean {
  return !OUT_OF_SCOPE_PREFIXES.some((p) => pathname.startsWith(p))
}

function precedes(a: Node, b: Node): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
}

/** True when `el` is inside a quoted post card of `root`. */
function insideQuote(el: Element, root: Element): boolean {
  const link = el.closest(X_SELECTORS.quote)
  return link !== null && link !== root && root.contains(link)
}

/**
 * The post a composer replies to: the last post before it, searched inside
 * the reply dialog when there is one, otherwise the whole page.
 */
export function findPostContainer(input: Element): HTMLElement | null {
  const dialog = input.closest<HTMLElement>(X_SELECTORS.dialog)
  const scope: ParentNode = dialog ?? document

  let best: HTMLElement | null = null
  for (const article of scope.querySelectorAll<HTMLElement>(X_SELECTORS.tweet)) {
    if (article.contains(input) || !precedes(article, input)) continue
    // A quoted post nested in another post is part of that post.
    if (article.parentElement?.closest(X_SELECTORS.tweet)) continue
    best = article
  }
  if (best) return best

  // The reply dialog may show the post without an <article> wrapper. Take the
  // smallest ancestor of its text that also holds the author's name.
  if (dialog) {
    let text: Element | null = null
    for (const t of dialog.querySelectorAll(X_SELECTORS.tweetText)) {
      if (precedes(t, input)) text = t
    }
    let cur = text?.parentElement ?? null
    while (cur && cur !== dialog) {
      if (cur.querySelector(X_SELECTORS.userName)) return cur
      cur = cur.parentElement
    }
  }

  debugLog('x: no post before this composer, not a reply box')
  return null
}

export function isCommentInput(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false
  if (!el.matches(X_SELECTORS.composer)) return false
  if (el.closest(X_SELECTORS.dmComposer)) return false
  // Only replies: a composer with no post to reply to is a brand new post.
  return findPostContainer(el) !== null
}

/** From an arbitrary event target, return the reply box if applicable. */
export function commentInputFrom(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null
  const candidate = target.closest<HTMLElement>(X_SELECTORS.composer)
  return candidate && isCommentInput(candidate) ? candidate : null
}

/** Composer scope around the input (keeps the pill visible while clicking near the box). */
export function findComposerScope(el: Element): HTMLElement | null {
  return el.closest<HTMLElement>(`${X_SELECTORS.dialog}, ${X_SELECTORS.cell}`)
}

/**
 * X's "Show more" opens the post page instead of expanding in place, and the
 * post page and reply dialog already show the full text. Nothing to do.
 */
export async function expandSeeMore(_container: HTMLElement): Promise<void> {}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

/** Text of a node with emoji kept: X renders emoji as <img alt="😀">. */
export function readableText(el: Element): string {
  let out = ''
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? ''
      return
    }
    if (node instanceof HTMLImageElement) {
      out += node.alt
      return
    }
    for (const child of Array.from(node.childNodes)) walk(child)
  }
  walk(el)
  return out
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** First match of `selector` in `root` that is not inside a quoted post. */
function own(root: HTMLElement, selector: string): HTMLElement | null {
  for (const el of root.querySelectorAll<HTMLElement>(selector)) {
    if (!insideQuote(el, root)) return el
  }
  return null
}

/** "Display Name (@handle)" from X's User-Name block. */
export function authorFrom(userName: Element | null): string {
  if (!userName) return ''
  let name = ''
  let handle = ''
  for (const span of userName.querySelectorAll('span')) {
    if (span.querySelector('span')) continue // leaves only
    const text = readableText(span)
    if (!text || text === '·') continue
    if (text.startsWith('@')) {
      if (!handle) handle = text
    } else if (!name) {
      name = text
    }
  }
  if (!name && !handle) return readableText(userName).split('·')[0]?.trim() ?? ''
  if (name && handle) return `${name} (${handle})`
  return name || handle
}

function detectMediaType(container: HTMLElement): MediaType {
  if (own(container, X_SELECTORS.video)) return 'video'
  if (own(container, X_SELECTORS.photo)) return 'image'
  if (own(container, X_SELECTORS.card)) return 'article'
  const quoted = container.querySelector(X_SELECTORS.quote)
  if (quoted?.querySelector(X_SELECTORS.tweetText)) return 'repost'
  return 'text'
}

function extractHashtags(container: HTMLElement, body: string): string[] {
  const tags = new Set<string>()
  for (const a of container.querySelectorAll<HTMLAnchorElement>(X_SELECTORS.hashtagLink)) {
    if (insideQuote(a, container)) continue
    const text = (a.textContent ?? '').trim().replace(/^#/, '')
    if (text) tags.add(text)
  }
  for (const match of body.matchAll(/#([\p{L}\p{N}_]+)/gu)) {
    if (match[1]) tags.add(match[1])
  }
  return Array.from(tags).slice(0, 12)
}

/** The quoted post's author and text, appended to the body as context. */
function quotedContext(container: HTMLElement): string {
  const quoted = container.querySelector<HTMLElement>(X_SELECTORS.quote)
  const text = quoted?.querySelector(X_SELECTORS.tweetText)
  if (!quoted || !text) return ''
  const who = authorFrom(quoted.querySelector(X_SELECTORS.userName))
  const body = readableText(text).slice(0, 600)
  return who ? `[Quoting ${who}: ${body}]` : `[Quoting: ${body}]`
}

export function extractPost(_input: HTMLElement, container: HTMLElement): PostData {
  const author = authorFrom(own(container, X_SELECTORS.userName))
  const textEl = own(container, X_SELECTORS.tweetText)
  const text = textEl ? readableText(textEl).slice(0, 2000) : ''
  const quote = quotedContext(container)
  const body = [text, quote].filter(Boolean).join('\n\n')

  const post: PostData = {
    platform: 'x',
    author,
    authorHeadline: '',
    body,
    mediaType: detectMediaType(container),
    hashtags: extractHashtags(container, text),
    postType: classifyPostType(text),
    isReply: false,
  }
  debugLog('x: extracted post', post)
  return post
}
