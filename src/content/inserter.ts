import { debugLog } from './linkedin-dom'

// ===========================================================================
// Inserting text into LinkedIn's React-controlled contenteditable comment box.
//
// The reliable path is execCommand('insertText'): it fires the real
// beforeinput/input events LinkedIn's editor listens to, so React state stays
// in sync and the Post button enables itself. We fall back to synthetic
// InputEvents if execCommand is unavailable. We never click Post (spec F4).
// ===========================================================================

function normalize(text: string | null): string {
  return (text ?? '').replace(/\s+/g, ' ').trim()
}

function selectAllIn(el: HTMLElement): void {
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(el)
  selection.removeAllRanges()
  selection.addRange(range)
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

/** Replace the entire contents of the comment box with `text`. Returns success. */
export function replaceText(el: HTMLElement, text: string): boolean {
  el.focus()
  selectAllIn(el)

  let ok = false
  try {
    // Replaces the current selection (everything) with `text`.
    ok = document.execCommand('insertText', false, text)
  } catch {
    ok = false
  }

  if (ok && normalize(el.textContent) === normalize(text)) {
    return true
  }

  // Fallback: set content directly and fire the event sequence React responds to.
  debugLog('execCommand insertText fell back to synthetic events')
  selectAllIn(el)
  try {
    document.execCommand('delete', false)
  } catch {
    /* ignore */
  }
  el.textContent = text
  // Place caret at the end so subsequent typing behaves normally.
  selectAllIn(el)
  window.getSelection()?.collapseToEnd()
  dispatchInput(el, text)
  return normalize(el.textContent) === normalize(text)
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
    buttons.find((btn) => {
      const cls = btn.className?.toString().toLowerCase() ?? ''
      const label = (btn.getAttribute('aria-label') ?? '').toLowerCase()
      const text = (btn.textContent ?? '').trim().toLowerCase()
      return (
        cls.includes('submit') || label.includes('comment') || text === 'post' || text === 'reply'
      )
    }) ?? null
  )
}
