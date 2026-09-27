import { InlineButton } from '@/content/button'
import { afterEach, describe, expect, it } from 'vitest'

/** A comment box that reports a fixed on-screen position (happy-dom has no layout). */
function makeBox(): HTMLDivElement {
  const box = document.createElement('div')
  box.contentEditable = 'true'
  box.getBoundingClientRect = () =>
    ({ left: 100, top: 200, right: 600, bottom: 240, width: 500, height: 40 }) as DOMRect
  document.body.appendChild(box)
  return box
}

function pillOf(_button: InlineButton): HTMLButtonElement {
  const host = document.querySelector('[data-inlineai-host]') as HTMLElement
  return host.shadowRoot?.querySelector('.pill') as HTMLButtonElement
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('InlineButton placement', () => {
  it('sits inside an empty comment box as the full pill', () => {
    const button = new InlineButton()
    const box = makeBox()
    button.attachTo(box, false)
    const host = document.querySelector('[data-inlineai-host]') as HTMLElement
    expect(pillOf(button).classList.contains('compact')).toBe(false)
    // Right aligned inside the box: left edge is before the box's right edge.
    expect(Number.parseFloat(host.style.left)).toBeLessThan(600)
    button.destroy()
  })

  it('shrinks and moves outside the box once it holds text, so it never covers it', () => {
    const button = new InlineButton()
    const box = makeBox()
    button.attachTo(box, false)
    box.textContent = 'A comment that fills the first line'
    box.dispatchEvent(new Event('input'))
    const host = document.querySelector('[data-inlineai-host]') as HTMLElement
    expect(pillOf(button).classList.contains('compact')).toBe(true)
    expect(Number.parseFloat(host.style.left)).toBeGreaterThanOrEqual(600)

    // Clearing the box brings the full pill back.
    box.textContent = ''
    box.dispatchEvent(new Event('input'))
    expect(pillOf(button).classList.contains('compact')).toBe(false)
    button.destroy()
  })

  it('stops listening to a box it has left', () => {
    const button = new InlineButton()
    const first = makeBox()
    const second = makeBox()
    button.attachTo(first, false)
    button.attachTo(second, false)
    first.textContent = 'typing in the old box'
    first.dispatchEvent(new Event('input'))
    expect(pillOf(button).classList.contains('compact')).toBe(false)
    button.destroy()
  })
})
