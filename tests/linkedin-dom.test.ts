import {
  classifyPostType,
  commentInputFrom,
  detectMediaType,
  expandSeeMore,
  extractPost,
  findPostContainer,
  isExtractable,
  isInScope,
  isSeeMoreButton,
} from '@/content/linkedin-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

describe('classifyPostType regressions', () => {
  it('detects a question even though the post is followed by other text', () => {
    // Previously the author headline was appended, so "ends with ?" never matched.
    expect(classifyPostType('Which tools do your teams actually use for this?')).toBe('question')
  })

  it('does not label a post "hiring" just because the word appears', () => {
    expect(
      classifyPostType(
        'Hiring is broken because interviews test the wrong skills, and nobody wants to admit it.',
      ),
    ).not.toBe('hiring')
    expect(classifyPostType('Our team is hiring for two backend roles in Berlin.')).toBe('hiring')
  })
})

describe('isCommentInput detection', () => {
  it('accepts a Quill editor without role="textbox"', () => {
    document.body.innerHTML = `
      <div data-urn="urn:li:activity:1">
        <div class="ql-editor" contenteditable="true" aria-multiline="true"
             data-placeholder="Add a comment…"></div>
      </div>`
    const input = document.querySelector<HTMLElement>('.ql-editor')!
    expect(commentInputFrom(input)).toBe(input)
  })

  it('ignores the "Start a post" share composer', () => {
    document.body.innerHTML = `
      <div class="share-creation-state">
        <div class="ql-editor" role="textbox" contenteditable="true"></div>
      </div>`
    const input = document.querySelector<HTMLElement>('.ql-editor')!
    expect(commentInputFrom(input)).toBeNull()
  })

  it('ignores non editable elements', () => {
    document.body.innerHTML = `<div role="textbox" contenteditable="false"></div>`
    expect(commentInputFrom(document.querySelector('[role="textbox"]'))).toBeNull()
  })
})

describe('isInScope', () => {
  it('covers feed, profiles, company, school and group pages but never messaging', () => {
    for (const path of [
      '/feed/',
      '/feed/update/urn:li:activity:1/',
      '/in/someone/recent-activity/all/',
      '/company/acme/posts/',
      '/school/stanford/',
      '/groups/123/',
      '/search/results/content/',
      '/posts/someone_activity-1',
    ]) {
      expect(isInScope(path)).toBe(true)
    }
    expect(isInScope('/messaging/thread/1/')).toBe(false)
    expect(isInScope('/jobs/view/1/')).toBe(false)
  })
})

describe('see more expansion', () => {
  it('recognises localized and class based "see more" buttons', () => {
    const make = (html: string) => {
      document.body.innerHTML = html
      return document.querySelector<HTMLElement>('button')!
    }
    expect(isSeeMoreButton(make('<button>…voir plus</button>'))).toBe(true)
    expect(isSeeMoreButton(make('<button>…mehr anzeigen</button>'))).toBe(true)
    expect(
      isSeeMoreButton(
        make(
          '<button class="feed-shared-inline-show-more-text__see-more-less-toggle" aria-expanded="false">x</button>',
        ),
      ),
    ).toBe(true)
    // Same toggle after expanding ("see less"): never click it again.
    expect(
      isSeeMoreButton(
        make(
          '<button class="feed-shared-inline-show-more-text__see-more-less-toggle" aria-expanded="true">…see less</button>',
        ),
      ),
    ).toBe(false)
    expect(isSeeMoreButton(make('<button>Like</button>'))).toBe(false)
  })

  it('clicks the expander once', async () => {
    document.body.innerHTML = `<div id="c"><button aria-expanded="false">…see more</button></div>`
    const btn = document.querySelector('button')!
    const click = vi.fn()
    btn.addEventListener('click', click)
    await expandSeeMore(document.getElementById('c')!)
    expect(click).toHaveBeenCalledTimes(1)
  })
})

describe('fallback extraction', () => {
  it('reads right to left post text when class names are hashed', () => {
    document.body.innerHTML = `
      <div class="x1">
        <div class="a"><a href="/in/jane"><span>Jane Doe</span></a></div>
        <div class="b"><span dir="rtl">هذا نص منشور طويل بما يكفي ليتم التقاطه بشكل صحيح</span></div>
        <div class="c"><div role="textbox" contenteditable="true"></div></div>
      </div>`
    const input = document.querySelector<HTMLElement>('[role="textbox"]')!
    const container = findPostContainer(input)!
    const post = extractPost(input, container)
    expect(post.author).toBe('Jane Doe')
    expect(post.body).toContain('هذا نص منشور')
  })
})
