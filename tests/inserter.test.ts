import { leadingEntity, replaceText, userDraftText } from '@/content/inserter'
import { beforeEach, describe, expect, it } from 'vitest'

beforeEach(() => {
  // happy-dom has no execCommand; force the synthetic event fallback path.
  ;(document as unknown as { execCommand: () => boolean }).execCommand = () => false
})

describe('inserter', () => {
  it('keeps a leading @mention and replaces only the text after it', () => {
    document.body.innerHTML = `
      <div id="box" contenteditable="true"><p><a class="ql-mention" href="/in/ann">Ann Lee</a>&nbsp;</p></div>`
    const box = document.getElementById('box')!
    const anchor = leadingEntity(box)
    expect(anchor?.textContent).toBe('Ann Lee')
    expect(userDraftText(box)).toBe('')

    expect(replaceText(box, 'Loved the point about onboarding.', anchor)).toBe(true)
    expect(box.querySelector('a.ql-mention')).not.toBeNull()
    expect(box.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Ann Lee Loved the point about onboarding.',
    )
  })

  it('reports text the user typed, ignoring mentions', () => {
    document.body.innerHTML = `
      <div id="box" contenteditable="true"><p><a href="/in/ann">Ann Lee</a> my own draft</p></div>`
    const box = document.getElementById('box')!
    expect(userDraftText(box)).toBe('my own draft')
    expect(leadingEntity(box)?.textContent).toBe('Ann Lee')
  })

  it('replaces everything when there is no mention', () => {
    document.body.innerHTML = `<div id="box" contenteditable="true"><p>old</p></div>`
    const box = document.getElementById('box')!
    expect(leadingEntity(box)).toBeNull()
    expect(replaceText(box, 'new comment')).toBe(true)
    expect(box.textContent).toBe('new comment')
  })
})
