import {
  classifyPostType,
  commentInputFrom,
  detectMediaType,
  extractPost,
  findPostContainer,
  isExtractable,
} from '@/content/linkedin-dom'
import { beforeEach, describe, expect, it } from 'vitest'

const POST_HTML = `
  <div data-urn="urn:li:activity:7123456789">
    <div class="update-components-actor__title">
      <span dir="ltr"><span aria-hidden="true">Priya Nair • Following</span></span>
    </div>
    <div class="update-components-actor__description">Head of Product · Fintech</div>
    <div class="update-components-update-v2__commentary">
      Unpopular opinion: most "AI strategy" decks in 2026 are 2019 transformation
      decks with find-and-replace. The budget conversations, though, are different
      this time. #AI #Strategy
    </div>
    <a href="/feed/hashtag/AI">#AI</a>
    <div class="comments-comment-box">
      <div role="textbox" contenteditable="true" aria-label="Add a comment"></div>
    </div>
  </div>
`

describe('extractPost', () => {
  beforeEach(() => {
    document.body.innerHTML = POST_HTML
  })

  it('finds the post container from the comment input', () => {
    const input = document.querySelector<HTMLElement>('[role="textbox"]')!
    const container = findPostContainer(input)
    expect(container).not.toBeNull()
    expect(container?.getAttribute('data-urn')).toBe('urn:li:activity:7123456789')
  })

  it('identifies the comment input from an event target', () => {
    const input = document.querySelector<HTMLElement>('[role="textbox"]')!
    expect(commentInputFrom(input)).toBe(input)
  })

  it('extracts author, headline, body, type and hashtags', () => {
    const input = document.querySelector<HTMLElement>('[role="textbox"]')!
    const container = findPostContainer(input)!
    const post = extractPost(input, container)

    expect(post.author).toBe('Priya Nair')
    expect(post.authorHeadline).toContain('Head of Product')
    expect(post.body).toContain('Unpopular opinion')
    expect(post.postType).toBe('opinion')
    expect(post.mediaType).toBe('text')
    expect(post.hashtags).toEqual(expect.arrayContaining(['AI', 'Strategy']))
    expect(post.isReply).toBe(false)
    expect(isExtractable(post)).toBe(true)
  })
})

describe('classifyPostType', () => {
  it('detects common post types from the body', () => {
    expect(classifyPostType('We are hiring a Senior PM! Apply now.')).toBe('hiring')
    expect(classifyPostType("Excited to announce I'm joining Acme as Head of Product!")).toBe(
      'achievement',
    )
    expect(classifyPostType('What is the best hire you made in year one?')).toBe('question')
    expect(classifyPostType('After 9 months we just shipped v1 of our new tool.')).toBe(
      'product_launch',
    )
    expect(classifyPostType('Took six months off after burnout last year.')).toBe('personal')
  })

  it('falls back to unknown for vague long text', () => {
    expect(
      classifyPostType(
        'This is a fairly generic paragraph that goes on for a while without any of the ' +
          'specific signals that would let a classifier bucket it into a known category at all.',
      ),
    ).toBe('unknown')
  })
})

describe('detectMediaType', () => {
  it('detects a video post', () => {
    document.body.innerHTML = `
      <div data-urn="urn:li:activity:1"><video src="x.mp4"></video></div>`
    const container = document.querySelector<HTMLElement>('[data-urn]')!
    expect(detectMediaType(container)).toBe('video')
  })
})

describe('isCommentInput', () => {
  it('excludes inputs inside messaging or chat components', () => {
    document.body.innerHTML = `
      <div class="msg-overlay-conversation-bubble">
        <div role="textbox" contenteditable="true"></div>
      </div>
    `
    const input = document.querySelector<HTMLElement>('[role="textbox"]')!
    expect(commentInputFrom(input)).toBeNull()
  })
})
