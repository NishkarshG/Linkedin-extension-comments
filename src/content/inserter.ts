import { debugLog } from './linkedin-dom'

// ===========================================================================
// Inserting text into LinkedIn's React-controlled contenteditable comment box.
//
// The reliable path is execCommand('insertText'): it fires the real
// beforeinput/input events LinkedIn's editor listens to, so React state stays
// in sync and the Post button enables itself. We fall back to synthetic
// InputEvents if execCommand is unavailable. We never click Post (spec F4).
//
// Mentions: when replying, LinkedIn pre-fills an @mention of the person being
// replied to. Mentions are atomic entities (contenteditable="false" or links),
// and wiping them silently drops the tag. We keep any LEADING entities and only
// replace the text after them.
// ===========================================================================

/** Elements LinkedIn renders as atomic entities (mentions) inside the editor. */
const ENTITY_SELECTOR = [
  '[contenteditable="false"]',
  '.ql-mention',
  '[data-entity-urn]',
  'a[href*="/in/"]',
  'a[href*="/company/"]',
  'a[href*="/school/"]',
].join(', ')

function normalize(text: string | null): string {
  return (text ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * The last entity (mention) that comes before any typed text, or null. Text
 * inserted by the extension goes after it, so the mention survives.
 */
export function leadingEntity(el: HTMLElement): Element | null {
  let anchor: Element | null = null
  let done = false
  const visit = (node: Node): void => {
    if (done) return
    if (node.nodeType === Node.TEXT_NODE) {
      if ((node.textContent ?? '').trim().length > 0) done = true
      return
    }
    if (!(node instanceof Element)) return
    if (node !== el && node.matches(ENTITY_SELECTOR)) {
      anchor = node
      return
    }
    for (const child of Array.from(node.childNodes)) {
      visit(child)
      if (done) return
    }
  }
  visit(el)
  return anchor
}

/** Text the user typed in the box, ignoring mentions and placeholder whitespace. */
export function userDraftText(el: HTMLElement): string {
  const clone = el.cloneNode(true) as HTMLElement
  for (const entity of Array.from(clone.querySelectorAll(ENTITY_SELECTOR))) entity.remove()
  return normalize(clone.textContent)
}

/** Select the region we are allowed to overwrite: everything after `anchor`, or everything. */
function selectWritable(el: HTMLElement, anchor: Element | null): Range | null {
  const selection = window.getSelection()
  if (!selection) return null
  const range = document.createRange()
  if (anchor && el.contains(anchor)) {
    range.setStartAfter(anchor)
    range.setEnd(el, el.childNodes.length)
  } else {
    range.selectNodeContents(el)
  }
  selection.removeAllRanges()
  selection.addRange(range)
  return range
}

function dispatchInput(el: HTMLElement, data: string): void {
  el.dispatchEvent(
    new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data,
    }),
  )
  el.dispatchEvent(
    new InputEvent('input', {
      bubbles: true,
      cancelable: false,
      inputType: 'insertText',
      data,
    }),
  )
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

/**
 * Replace the writable part of the comment box with `text`: everything after
 * a leading mention when `anchor` is given, otherwise the whole box.
 * Returns success.
 */
export function replaceText(el: HTMLElement, text: string, anchor: Element | null = null): boolean {
  const keepAnchor = anchor !== null && el.contains(anchor)
  // A space keeps the mention and the comment from running together.
  const insert = keepAnchor && !/^\s/.test(text) ? ` ${text}` : text

  el.focus()
  selectWritable(el, keepAnchor ? anchor : null)

  let ok = false
  try {
    // Replaces the current selection with `insert`.
    ok = document.execCommand('insertText', false, insert)
  } catch {
    ok = false
  }

  if (ok && normalize(el.textContent).endsWith(normalize(text))) {
    return true
  }

  // Fallback: set content directly and fire the event sequence React responds to.
  debugLog('execCommand insertText fell back to synthetic events')
  const range = selectWritable(el, keepAnchor ? anchor : null)
  if (keepAnchor && anchor && range) {
    range.deleteContents()
    anchor.after(document.createTextNode(insert))
  } else {
    el.textContent = insert
  }
  // Place caret at the end so subsequent typing behaves normally.
  const selection = window.getSelection()
  if (selection) {
    const end = document.createRange()
    end.selectNodeContents(el)
    end.collapse(false)
    selection.removeAllRanges()
    selection.addRange(end)
  }
  dispatchInput(el, insert)
  return normalize(el.textContent).endsWith(normalize(text))
}

/**
 * Safety net for the Post button: if it's still disabled after insertion,
 * dispatch synthetic key events on the input so LinkedIn re-evaluates state.
 */
export function activatePostButton(el: HTMLElement): void {
  const scope =
    el.closest<HTMLElement>('.comments-comment-box, .comments-comment-texteditor, form') ??
    el.parentElement
  if (!scope) return

  const submit = findSubmitButton(scope)
  if (!submit || !submit.disabled) return

  el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ' ' }))
  el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ' }))
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ' ' }))
}

function findSubmitButton(scope: HTMLElement): HTMLButtonElement | null {
  const buttons = Array.from(scope.querySelectorAll<HTMLButtonElement>('button'))
  return (
    // Language independent signals first; English labels last.
    buttons.find((btn) => btn.type === 'submit') ??
    buttons.find((btn) => (btn.className?.toString().toLowerCase() ?? '').includes('submit')) ??
    buttons.find((btn) => {
      const label = (btn.getAttribute('aria-label') ?? '').toLowerCase()
      const text = (btn.textContent ?? '').trim().toLowerCase()
      return label.includes('comment') || text === 'post' || text === 'reply'
    }) ??
    null
  )
}
