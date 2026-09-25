import type { MediaType, PostData, PostType } from '@/shared/types'

// ===========================================================================
// LinkedIn DOM strategy
// ---------------------------------------------------------------------------
// LinkedIn renames hashed CSS classes constantly. Every selector here is
// anchored on a STABLE signal (role/aria/semantic structure/data-urn) first,
// with LinkedIn's semi-stable `*-components-*` class names only as a fallback.
// All selectors live in this one object so they can be patched in one place.
// Last verified against LinkedIn web: 2026-05. Logic reviewed: 2026-09.
// ===========================================================================

export const SELECTORS = {
  // A comment composer is a contenteditable element. LinkedIn's live feed uses
  // a Quill editor (`.ql-editor`) which often has `aria-multiline="true"` and
  // a `data-placeholder` but *no* `role="textbox"`. So we accept anything that:
  //   - is contenteditable (any value other than explicit "false"), AND
  //   - has one of the conventional signals (role=textbox / aria-multiline /
  //     data-placeholder / a class containing "editor").
  commentInput: [
    '[role="textbox"][contenteditable]:not([contenteditable="false"])',
    '[aria-multiline="true"][contenteditable]:not([contenteditable="false"])',
    '[contenteditable]:not([contenteditable="false"])[data-placeholder]',
    '.ql-editor[contenteditable]:not([contenteditable="false"])',
  ].join(', '),

  // Nearest post container. These selectors are ordered most-specific first.
  // data-urn anchors on activity/share/fsd_update URN types only — NOT generic
  // urn:li: which also matches comment items, profile cards, etc.
  postContainer: [
    '[data-urn^="urn:li:"]:not([data-urn*=":comment:"]):not([data-urn*=":member:"]):not([data-urn*=":profile:"]):not([data-urn*=":miniProfile:"])',
    '[data-id^="urn:li:"]:not([data-id*=":comment:"]):not([data-id*=":member:"]):not([data-id*=":profile:"]):not([data-id*=":miniProfile:"])',
    '[data-test-id="main-feed-activity-card"]',
    '[data-finite-scroll-hotkey-item]',
    'article',
    '.feed-shared-update-v2',
    '.fie-impression-container',
    '.feed-shared-update-detail-page-container',
  ].join(', '),

  // Composer scope (used by the click-outside check). The comment box typically
  // lives inside one of these regardless of locale.
  composerScope:
    '.comments-comment-box, .comments-comment-texteditor, .comments-comments-list, form, [data-test-id*="comment"]',

  // Author display name — ordered from most-specific to least-specific.
  // We ONLY search inside the actor block so social-proof headers (e.g.
  // "Sumit Singh likes this") are never matched.
  author: [
    '.update-components-actor__title span[dir="ltr"] span[aria-hidden="true"]',
    '.update-components-actor__title span[dir="ltr"]',
    '.update-components-actor__name span[aria-hidden="true"]',
    '.update-components-actor__name',
    '[class*="actor__name"] span[aria-hidden="true"]',
    '[class*="actor__name"]',
    '[class*="actor__title"] span[aria-hidden="true"]',
    '[class*="actor__title"]',
  ],

  // Author headline / sub-title (job title, one-liner).
  authorHeadline: [
    '.update-components-actor__description',
    '.update-components-actor__subtitle',
    '[class*="actor__description"]',
    '[class*="actor__subtitle"]',
    '[class*="actor-description"]',
  ],

  // Post body text — ordered from most-specific to least-specific.
  // We limit fallback selectors to dir=ltr which is LinkedIn's stable signal
  // for user-authored commentary text.
  body: [
    '.update-components-update-v2__commentary',
    '.feed-shared-update-v2__description .update-components-text',
    '.update-components-text',
    '.feed-shared-inline-show-more-text',
    '[data-test-id*="commentary"]',
    '[class*="commentary"]',
    '[class*="show-more-text"]',
    'span[dir="ltr"]:not(a *)',
    'div[dir="ltr"]:not(a *)',
  ],

  // "see more" expander (text + aria-label both vary; match loosely in code).
  seeMore: 'button',

  // Media signals.
  video: 'video, .update-components-linkedin-video, [data-test-id*="video"]',
  image: '.update-components-image img, .update-components-image',
  document: '.update-components-document, .document-s-container',
  article: '.update-components-article',
  reshare:
    '.update-components-mini-update-v2, .feed-shared-update-v2__update-content-wrapper article, [class*="reshared"]',

  // Hashtag links inside the body.
  hashtagLink: 'a[href*="/feed/hashtag/"], a[href*="keywords="]',

  // A reply composer lives inside a comment item.
  replyAncestor:
    '.comments-comment-item, article.comments-comment-entity, .comments-comment-entity',
  commentText:
    '.comments-comment-item__main-content, .update-components-text, .comments-comment-item-content-body',
} as const

let debugEnabled = false
export function setDebug(on: boolean): void {
  debugEnabled = on
}
export function debugLog(...args: unknown[]): void {
  if (debugEnabled) console.debug('[InlineAI]', ...args)
}

// ---------------------------------------------------------------------------
// Detection helpers
// ---------------------------------------------------------------------------

const IN_SCOPE_PREFIXES = [
  '/feed',
  '/in/',
  '/company/',
  '/school/',
  '/groups/',
  '/showcase/',
  '/events/',
  '/newsletters/',
  '/search/results/',
]

/** Pages where the pill may appear. Messaging is always excluded. */
export function isInScope(pathname: string = location.pathname): boolean {
  if (pathname.startsWith('/messaging')) return false
  return (
    IN_SCOPE_PREFIXES.some((p) => pathname.startsWith(p)) ||
    pathname.includes('/posts/') ||
    pathname.includes('/pulse/')
  )
}

export function isInsideMessaging(el: Element): boolean {
  let cur: Element | null = el
  while (cur && cur !== document.body) {
    const cls = (cur.className ?? '').toString()
    const id = (cur.getAttribute('id') ?? '').toString()
    const role = (cur.getAttribute('role') ?? '').toString()
    const label = (cur.getAttribute('aria-label') ?? '').toString().toLowerCase()
    if (
      cls.includes('msg-') ||
      cls.includes('messaging') ||
      cls.includes('conversation') ||
      cls.includes('chat') ||
      id.includes('messaging') ||
      label.includes('messaging') ||
      label.includes('message') ||
      (role === 'region' && label.includes('messaging'))
    ) {
      return true
    }
    cur = cur.parentElement
  }
  return false
}

/** The "Start a post" / share composer: not a comment box, never show the pill there. */
export function isInsideShareComposer(el: Element): boolean {
  return (
    el.closest(
      '.share-box, .share-creation-state, [class*="share-box"], [class*="share-creation"], [data-test-modal-id="sharebox"]',
    ) !== null
  )
}

export function isCommentInput(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false
  // Must match one of the composer signals (role=textbox, aria-multiline,
  // data-placeholder, Quill editor). LinkedIn's Quill editor does not always
  // carry role="textbox", so requiring it here hid the pill entirely.
  if (!el.matches(SELECTORS.commentInput)) return false
  const ce = el.getAttribute('contenteditable')
  if (ce === null || ce === 'false') return false
  if (isInsideMessaging(el)) return false
  if (isInsideShareComposer(el)) return false
  // We DON'T require a post container here — LinkedIn renames things; a
  // missing post container is handled with a friendly error on click.
  return true
}

/** From an arbitrary event target, return the comment input element if applicable. */
export function commentInputFrom(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null
  const candidate = target.closest<HTMLElement>(SELECTORS.commentInput)
  return candidate && isCommentInput(candidate) ? candidate : null
}

/**
 * Find the post container around a comment input.
 *
 * Stage 1: el.closest() with stable URN/class selectors.
 * Stage 2: Walk upward for article / known feed class signatures.
 * Stage 3: Walk upward and pick the SMALLEST element that contains
 *          both a profile link and non-trivial text — works even when
 *          LinkedIn has fully rotated every class name.
 */
export function findPostContainer(el: Element): HTMLElement | null {
  // ── Stage 1: closest() with stable selectors ──────────────────────────────
  const container = el.closest<HTMLElement>(SELECTORS.postContainer)
  if (container) {
    debugLog(
      'findPostContainer stage1 match:',
      container.tagName,
      container.getAttribute('data-urn') ?? container.className.toString().slice(0, 60),
    )
    return container
  }

  // ── Stage 1.5: Walk up and check if the ancestor contains a stable post identifier ──
  // A post card contains a post header (with URN) and/or an author block, which are
  // siblings of the comment box. The post card is the smallest ancestor containing them.
  let cur: HTMLElement | null = el.parentElement
  while (cur && cur !== document.body) {
    const tag = cur.tagName.toUpperCase()
    if (tag === 'SECTION' || cur.classList.contains('scaffold-layout__main')) {
      break
    }

    // Check if this ancestor matches or contains a stable post identifier
    const postSelector =
      '[data-urn^="urn:li:"]:not([data-urn*=":comment:"]):not([data-urn*=":member:"]):not([data-urn*=":profile:"]):not([data-urn*=":miniProfile:"]), ' +
      '[data-id^="urn:li:"]:not([data-id*=":comment:"]):not([data-id*=":member:"]):not([data-id*=":profile:"]):not([data-id*=":miniProfile:"])'

    const hasPostUrn = cur.matches(postSelector) || cur.querySelector(postSelector) !== null

    if (hasPostUrn) {
      debugLog(
        'findPostContainer stage1.5 sibling-URN match:',
        cur.tagName,
        (cur.className ?? '').toString().slice(0, 60),
      )
      return cur
    }
    cur = cur.parentElement
  }

  // ── Stage 2: walk up for article / known feed class names ─────────────────
  cur = el.parentElement
  while (cur && cur !== document.body) {
    const tag = cur.tagName.toUpperCase()
    const cls = (cur.className ?? '').toString()
    if (
      tag === 'ARTICLE' ||
      cls.includes('feed-shared-update-v2') ||
      cls.includes('fie-impression-container') ||
      cls.includes('activity-card') ||
      cls.includes('update-v2')
    ) {
      debugLog('findPostContainer stage2 match:', tag, cls.slice(0, 60))
      return cur
    }
    cur = cur.parentElement
  }

  // ── Stage 3: content-based heuristic with comment-filtering ────────────────────────
  // Walk upward and return the first ancestor that contains BOTH a profile
  // link (/in/ href) AND enough text to be a real post (> 20 chars).
  // We check if the FIRST profile link in the ancestor is outside of the comment/composer zone.
  cur = el.parentElement
  while (cur && cur !== document.body) {
    const tag = cur.tagName.toUpperCase()
    if (tag === 'SECTION' || cur.classList.contains('scaffold-layout__main')) {
      break
    }

    const firstLink = cur.querySelector('a[href*="/in/"]')
    let hasExternalProfileLink = false
    if (firstLink) {
      hasExternalProfileLink = (() => {
        let p: Element | null = firstLink.parentElement
        while (p && p !== cur) {
          const cls = (p.className ?? '').toString()
          const id = (p.getAttribute('id') ?? '').toString()
          const role = (p.getAttribute('role') ?? '').toString()
          if (
            cls.includes('comment') ||
            cls.includes('reply') ||
            cls.includes('composer') ||
            p.tagName === 'FORM' ||
            p.tagName === 'ARTICLE' ||
            role === 'textbox' ||
            role === 'article' ||
            id.includes('comment') ||
            p.contains(el)
          ) {
            return false // first link is inside the comment/composer zone
          }
          p = p.parentElement
        }
        return true // first link is outside the comment/composer zone!
      })()
    }

    if (hasExternalProfileLink) {
      const bodyText = (cur.textContent ?? '').trim()
      if (bodyText.length > 20) {
        debugLog(
          'findPostContainer stage3 heuristic match:',
          cur.tagName,
          (cur.className ?? '').toString().slice(0, 60),
        )
        return cur
      }
    }
    cur = cur.parentElement
  }

  debugLog('findPostContainer: no container found, ancestor chain:')
  cur = el.parentElement
  let i = 0
  while (cur && cur !== document.body && i < 20) {
    debugLog(
      `  [${i}] ${cur.tagName} data-urn=${cur.getAttribute('data-urn')} class=${(cur.className ?? '').toString().slice(0, 80)}`,
    )
    cur = cur.parentElement
    i++
  }

  return null
}

/** Composer scope around the input (used to keep the pill visible while clicking near the box). */
export function findComposerScope(el: Element): HTMLElement | null {
  return el.closest<HTMLElement>(SELECTORS.composerScope)
}

// ---------------------------------------------------------------------------
// Text extraction utilities
// ---------------------------------------------------------------------------

// Strings we never want to treat as post body/author text.
// Keep this list TIGHT — only exact UI control labels, never generic English words.
const SKIP_STRINGS = new Set([
  'video player is loading.',
  'play video',
  'mute',
  'unmute',
  'new posts',
  'see more',
  '…see more',
])

function isSkippable(text: string): boolean {
  const lower = text.toLowerCase().trim()
  if (SKIP_STRINGS.has(lower)) return true
  if (lower.includes('video player is loading')) return true
  // Very short strings (< 3 chars) are probably UI labels, not post content
  if (lower.length < 3) return true
  return false
}

/**
 * Return the first non-empty, non-skippable text from the first matching
 * selector in the given root. For author/headline we additionally skip any
 * node that lives inside the comments/reactions area.
 */
function firstText(
  root: ParentNode,
  selectors: readonly string[],
  type?: 'author' | 'headline' | 'body',
): string {
  for (const sel of selectors) {
    const nodes = root.querySelectorAll(sel)
    for (const node of nodes) {
      const text = node.textContent?.trim()
      if (!text) continue

      // For author/headline: skip nodes that live inside the comments list
      // or social-actions bar. We check up the ancestor chain (cheaply).
      if (type === 'author' || type === 'headline') {
        let cur: Element | null = node.parentElement
        let inBadZone = false
        while (cur && cur !== (root as unknown as Element)) {
          const cls = (cur.className ?? '').toString()
          const tag = cur.tagName.toUpperCase()
          const role = (cur.getAttribute('role') ?? '').toString()
          if (
            cls.includes('comment') ||
            cls.includes('reply') ||
            cls.includes('social') ||
            cls.includes('reaction') ||
            cls.includes('action') ||
            cls.includes('composer') ||
            cls.includes('editor') ||
            cls.includes('header-wrapper') ||
            cls.includes('update-v2__header') ||
            tag === 'FORM' ||
            tag === 'ARTICLE' ||
            role === 'textbox' ||
            role === 'article'
          ) {
            inBadZone = true
            break
          }
          cur = cur.parentElement
        }
        if (inBadZone) continue
      }

      // For body: skip nodes inside the actor block or the comments section
      if (type === 'body') {
        let cur: Element | null = node.parentElement
        let inBadZone = false
        while (cur && cur !== (root as unknown as Element)) {
          const cls = (cur.className ?? '').toString()
          const tag = cur.tagName.toUpperCase()
          const role = (cur.getAttribute('role') ?? '').toString()
          if (
            cls.includes('comment') ||
            cls.includes('reply') ||
            cls.includes('social') ||
            cls.includes('reaction') ||
            cls.includes('action') ||
            cls.includes('actor') ||
            tag === 'FORM' ||
            tag === 'ARTICLE' ||
            role === 'textbox' ||
            role === 'article'
          ) {
            inBadZone = true
            break
          }
          cur = cur.parentElement
        }
        if (inBadZone) continue
      }

      const cleaned = collapseWhitespace(text)
      if (isSkippable(cleaned)) continue
      return cleaned
    }
  }
  return ''
}

function collapseWhitespace(text: string): string {
  return text
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ---------------------------------------------------------------------------
// "see more" expansion
// ---------------------------------------------------------------------------

// "see more" in the languages LinkedIn ships most. Class names are checked
// first, so this list only matters when LinkedIn rotates class names.
const SEE_MORE_LABELS = [
  'see more',
  'voir plus',
  'mehr anzeigen',
  'ver más',
  'ver mais',
  'mostra altro',
  'meer weergeven',
  'zobacz więcej',
  'daha fazla',
  'visa mer',
  'se mere',
  'vis mer',
  'näytä lisää',
  'zobrazit více',
  'mai mult',
  'показать больше',
  'більше',
  'عرض المزيد',
  'הצג עוד',
  'अधिक देखें',
  'lihat selengkapnya',
  'xem thêm',
  'ดูเพิ่มเติม',
  '더보기',
  'もっと見る',
  '显示更多',
  '查看更多',
  '顯示更多',
]

export function isSeeMoreButton(btn: HTMLElement): boolean {
  const label = (btn.getAttribute('aria-label') ?? '').toLowerCase()
  const text = (btn.textContent ?? '')
    .toLowerCase()
    .replace(/[…\s.]+/g, ' ')
    .trim()
  if (SEE_MORE_LABELS.some((l) => text === l || text.endsWith(l) || label.includes(l))) {
    return true
  }
  // Language independent fallback. The same toggle turns into "see less" once
  // expanded, so only trust the class while LinkedIn says it is collapsed.
  const cls = (btn.className ?? '').toString().toLowerCase()
  const collapsed = btn.getAttribute('aria-expanded') === 'false'
  return collapsed && (cls.includes('see-more') || cls.includes('show-more-text__button'))
}

export async function expandSeeMore(container: HTMLElement): Promise<void> {
  const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>(SELECTORS.seeMore))
  const seeMore = buttons.find(
    (btn) => btn.getAttribute('aria-expanded') !== 'true' && isSeeMoreButton(btn),
  )
  if (seeMore) {
    seeMore.click()
    await delay(120)
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// Media + hashtags + post type
// ---------------------------------------------------------------------------

export function detectMediaType(container: HTMLElement): MediaType {
  if (container.querySelector(SELECTORS.reshare)) return 'repost'
  if (container.querySelector(SELECTORS.video)) return 'video'
  if (container.querySelector(SELECTORS.document)) return 'document'
  if (container.querySelector(SELECTORS.article)) return 'article'
  if (container.querySelector(SELECTORS.image)) return 'image'
  return 'text'
}

export function extractHashtags(container: HTMLElement, body: string): string[] {
  const tags = new Set<string>()
  for (const a of container.querySelectorAll<HTMLAnchorElement>(SELECTORS.hashtagLink)) {
    const text = (a.textContent ?? '').trim().replace(/^#/, '')
    if (text && /^[\wÀ-ɏऀ-ॿ]+$/.test(text)) tags.add(text)
  }
  for (const match of body.matchAll(/#([\wÀ-ɏऀ-ॿ]+)/g)) {
    if (match[1]) tags.add(match[1])
  }
  return Array.from(tags).slice(0, 12)
}

const TYPE_PATTERNS: Array<[PostType, RegExp]> = [
  // personal/vulnerable first — most important to handle gently
  [
    'personal',
    /\b(burnout|burnt out|laid off|layoff|redundan|mental health|grief|griev|passed away|anxiety|depress|therapy|struggl(e|ing)|vulnerab)\b/i,
  ],
  [
    'hiring',
    /(#hiring\b|\b(we'?re hiring|we are hiring|i'?m hiring|is hiring|are hiring|now hiring|hiring for|hiring an? |join (our|the) team|open (role|position)s?|apply now|we are recruiting|looking to hire)\b)/i,
  ],
  [
    'achievement',
    /\b(excited to (share|announce)|thrilled to|proud to (share|announce)|i'?m joining|i am joining|new role|new chapter|promoted|promotion|we (raised|closed)|fundrais|series [abc]|milestone|anniversary|honou?red to|received (an|the) award|graduated)\b/i,
  ],
  [
    'product_launch',
    /\b(launch(ing|ed)?|introducing|now live|just (shipped|released|launched)|we built|we shipped|in (public )?beta|v\d|version \d)\b/i,
  ],
  [
    'tutorial',
    /\b(how to|step[-\s]?by[-\s]?step|here'?s how|framework|playbook|a guide to|tips? (for|on)|step \d)\b/i,
  ],
  [
    'opinion',
    /\b(unpopular opinion|hot take|controversial|change my mind|here'?s why|in my opinion|i (strongly )?believe|let'?s be honest)\b/i,
  ],
  [
    'question',
    /\?\s*$|\b(what (do|are|is|would|should)|how (do|would) you|any (advice|recommendations|tips)|wdyt|thoughts\?)\b/i,
  ],
  [
    'story',
    /\b(lesson(s)? learned|the hard way|years? ago|looking back|i failed|biggest mistake|when i (was|started|joined)|early in my career)\b/i,
  ],
  [
    'news',
    /\b(announced|breaking|just in|according to|new (report|study|data)|the report (found|shows))\b/i,
  ],
]

/**
 * Heuristic post type from the post BODY only. The author's headline is not
 * used: a headline like "Hiring manager" or "Mental health advocate" used to
 * label every post by that author.
 */
export function classifyPostType(body: string): PostType {
  const text = body.trim()
  for (const [type, pattern] of TYPE_PATTERNS) {
    if (pattern.test(text)) return type
  }
  // Short, low-text content → likely a meme/observational one-liner.
  if (text.length > 0 && text.length < 80) return 'meme'
  return 'unknown'
}

// ---------------------------------------------------------------------------
// Reply context
// ---------------------------------------------------------------------------

function extractReplyContext(
  input: HTMLElement,
  container: HTMLElement,
): { isReply: boolean; repliedToText?: string } {
  const replyItem = input.closest<HTMLElement>(SELECTORS.replyAncestor)
  if (!replyItem || !container.contains(replyItem)) return { isReply: false }
  const text = firstText(replyItem, SELECTORS.commentText.split(', '))
  return text ? { isReply: true, repliedToText: text.slice(0, 600) } : { isReply: true }
}

// ---------------------------------------------------------------------------
// Class-name-independent fallback extractors
// ---------------------------------------------------------------------------
//
// LinkedIn periodically rotates EVERY class name on a post to short hashes
// like `_5d2a0f24 a465a26b …`. When that happens, none of the class-based
// selectors above match, even though the post is right there. These fallbacks
// look at structural signals only: profile-link <a href="/in/...">, the
// `dir="ltr"` attribute LinkedIn uses for user-authored text, and ancestry.

function isInsideBadZone(
  node: Element,
  container: Element,
  input: Element,
  type?: 'author' | 'body',
): boolean {
  let p: Element | null = node.parentElement
  while (p && p !== container) {
    if (p.contains(input)) return true
    const cls = (p.className ?? '').toString().toLowerCase()
    const role = (p.getAttribute('role') ?? '').toString()
    if (
      cls.includes('comment') ||
      cls.includes('reply') ||
      cls.includes('composer') ||
      cls.includes('editor') ||
      cls.includes('social') ||
      cls.includes('reaction') ||
      cls.includes('action-bar') ||
      p.tagName === 'FORM' ||
      p.tagName === 'ARTICLE' ||
      role === 'textbox' ||
      role === 'article'
    ) {
      return true
    }
    if (type === 'body') {
      if (
        cls.includes('actor') ||
        cls.includes('header-wrapper') ||
        cls.includes('update-v2__header')
      ) {
        return true
      }
    }
    p = p.parentElement
  }
  return false
}

function dedupeDoubled(text: string): string {
  // LinkedIn renders user text twice — once visible (aria-hidden="true") and
  // once for screen readers (visually-hidden). textContent merges them. If the
  // string is exactly its first half repeated, return just the first half.
  const half = Math.floor(text.length / 2)
  if (half > 4 && text.slice(0, half) === text.slice(half)) return text.slice(0, half)
  return text
}

function fallbackAuthor(container: HTMLElement, input: HTMLElement): string {
  for (const link of container.querySelectorAll<HTMLAnchorElement>(
    'a[href*="/in/"], a[href*="/company/"], a[href*="/school/"]',
  )) {
    if (link.contains(input)) continue
    if (isInsideBadZone(link, container, input, 'author')) continue
    const raw = (link.textContent ?? '').trim()
    if (!raw) continue
    const cleaned = dedupeDoubled(collapseWhitespace(raw))
    if (cleaned.length === 0 || cleaned.length > 100) continue
    return cleaned
  }
  return ''
}

function fallbackBody(container: HTMLElement, input: HTMLElement): string {
  let best = ''
  // `dir` is LinkedIn's stable marker for user-authored text ("ltr", or "rtl"
  // for Arabic/Hebrew posts). We exclude anything inside an <a> (those are
  // profile/hashtag links, not body) and anything inside the comment/composer
  // zone (other people's comments).
  for (const node of container.querySelectorAll<HTMLElement>(
    '[dir="ltr"], [dir="rtl"], [dir="auto"]',
  )) {
    if (node.contains(input)) continue
    if (node.closest('a')) continue
    if (isInsideBadZone(node, container, input, 'body')) continue
    const raw = (node.textContent ?? '').trim()
    if (raw.length < 20) continue
    const text = dedupeDoubled(raw)
    if (text.length > best.length) best = text
  }

  // Fallback to any span/div/p if no dir-marked elements matched
  if (best.length < 20) {
    for (const node of container.querySelectorAll<HTMLElement>('span, div, p')) {
      if (node.contains(input)) continue
      if (node.closest('a')) continue
      if (isInsideBadZone(node, container, input, 'body')) continue
      const raw = (node.textContent ?? '').trim()
      if (raw.length < 20 || raw.length > 5000) continue
      const text = dedupeDoubled(raw)
      if (text.length > best.length) best = text
    }
  }

  return collapseWhitespace(best).slice(0, 2000)
}

// ---------------------------------------------------------------------------
// Top-level extractor
// ---------------------------------------------------------------------------

/** Strip connection-degree and follow-button noise LinkedIn appends to names. */
function cleanAuthor(raw: string): string {
  return raw
    .replace(
      /\s*[•·]\s*(Following|Connect|Message|Pending|1st|2nd|3rd\+?|You|degree|member).*$/i,
      '',
    )
    .trim()
}

export function extractPost(input: HTMLElement, container: HTMLElement): PostData {
  let author = cleanAuthor(firstText(container, SELECTORS.author, 'author'))
  let authorHeadline = firstText(container, SELECTORS.authorHeadline, 'headline')
  let body = firstText(container, SELECTORS.body, 'body')

  // Class-name-independent fallbacks — fire when LinkedIn has hashed the classes
  if (!author) {
    author = cleanAuthor(fallbackAuthor(container, input))
    if (author) debugLog('author via fallback:', author)
  }
  if (!body) {
    body = fallbackBody(container, input)
    if (body) debugLog('body via fallback (len):', body.length)
  }
  // Headline often appears right after the author link as another `dir="ltr"`
  // text node. If we found an author via fallback and headline is still empty,
  // probe one or two siblings/descendants of the author link.
  if (!authorHeadline && author) {
    const authorLink = Array.from(
      container.querySelectorAll<HTMLAnchorElement>(
        'a[href*="/in/"], a[href*="/company/"], a[href*="/school/"]',
      ),
    ).find((a) => !a.contains(input) && (a.textContent ?? '').includes(author.slice(0, 8)))
    if (authorLink) {
      const wrapper = authorLink.closest('div')?.parentElement
      if (wrapper) {
        for (const cand of wrapper.querySelectorAll<HTMLElement>('[dir="ltr"], span, div')) {
          if (cand === authorLink || cand.contains(authorLink)) continue
          const text = (cand.textContent ?? '').trim()
          if (text.length > 5 && text.length < 200 && text !== author) {
            authorHeadline = collapseWhitespace(dedupeDoubled(text))
            break
          }
        }
      }
    }
  }

  const mediaType = detectMediaType(container)
  const hashtags = extractHashtags(container, body)
  const postType = classifyPostType(body)
  const reply = extractReplyContext(input, container)

  const post: PostData = {
    author,
    authorHeadline,
    body,
    mediaType,
    hashtags,
    postType,
    isReply: reply.isReply,
  }
  if (reply.repliedToText) post.repliedToText = reply.repliedToText
  return post
}

/** Never call the LLM with nothing. Requires at least an author or some body/hashtags. */
export function isExtractable(post: PostData): boolean {
  return post.author.length > 0 || post.body.length > 0 || post.hashtags.length > 0
}
