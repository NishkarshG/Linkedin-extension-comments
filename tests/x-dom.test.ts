import { platformFor } from '@/content/platform'
import {
  authorFrom,
  commentInputFrom,
  extractPost,
  findPostContainer,
  isInScope,
  readableText,
} from '@/content/x-dom'
import { describe, expect, it } from 'vitest'

// Markup mirrors x.com: data-testid anchors, User-Name block, emoji as <img alt>.
const userName = (name: string, handle: string) => `
  <div data-testid="User-Name">
    <div><a href="/${handle}"><div><span><span>${name}</span></span></div></a></div>
    <div><a href="/${handle}"><span>@${handle}</span></a><span>·</span><a href="/${handle}/status/1"><time>2h</time></a></div>
  </div>`

const composer = `<div class="public-DraftEditor-content" contenteditable="true" role="textbox" data-testid="tweetTextarea_0"></div>`

const STATUS_PAGE = `
  <main>
    <div data-testid="cellInnerDiv">
      <article data-testid="tweet">${userName('Parent Poster', 'parent')}
        <div data-testid="tweetText">Most startups should not build their own auth.</div>
      </article>
    </div>
    <div data-testid="cellInnerDiv">
      <article data-testid="tweet" id="focal">${userName('Sarah Chen', 'sarahbuilds')}
        <div data-testid="tweetText">Shipped it today <img alt="🚀" src=""> p99 went from 180ms to 9ms. <a href="/hashtag/buildinpublic">#buildinpublic</a></div>
        <div data-testid="tweetPhoto"><img alt="Image"></div>
      </article>
    </div>
    <div data-testid="cellInnerDiv">${composer}</div>
    <div data-testid="cellInnerDiv">
      <article data-testid="tweet">${userName('Someone Else', 'else')}
        <div data-testid="tweetText">What about backups?</div>
      </article>
    </div>
  </main>`

const box = () => document.querySelector<HTMLElement>('[data-testid="tweetTextarea_0"]')!

describe('X: reply under a post (/status/ page)', () => {
  it('replies to the post right above the box, not the thread parent or later replies', () => {
    document.body.innerHTML = STATUS_PAGE
    expect(findPostContainer(box())?.id).toBe('focal')
    expect(commentInputFrom(box())).toBe(box())
  })

  it('extracts author, text with emoji, media and hashtags', () => {
    document.body.innerHTML = STATUS_PAGE
    const post = extractPost(box(), findPostContainer(box())!)
    expect(post.platform).toBe('x')
    expect(post.author).toBe('Sarah Chen (@sarahbuilds)')
    expect(post.authorHeadline).toBe('')
    expect(post.body).toBe('Shipped it today 🚀 p99 went from 180ms to 9ms. #buildinpublic')
    expect(post.mediaType).toBe('image')
    expect(post.hashtags).toEqual(['buildinpublic'])
    expect(post.isReply).toBe(false)
  })
})

describe('X: reply dialog', () => {
  it('reads the post shown in the dialog even without an <article>', () => {
    document.body.innerHTML = `
      <main><article data-testid="tweet">${userName('Other', 'other')}
        <div data-testid="tweetText">A different post in the timeline.</div></article></main>
      <div role="dialog">
        <div class="replying-to">${userName('Dev Rao', 'devrao')}
          <div data-testid="tweetText">Underrated advice for first time founders.</div>
        </div>
        ${composer}
      </div>`
    const container = findPostContainer(box())!
    expect(container).not.toBeNull()
    const post = extractPost(box(), container)
    expect(post.author).toBe('Dev Rao (@devrao)')
    expect(post.body).toBe('Underrated advice for first time founders.')
  })

  it('adds a quoted post as context and marks it as a repost', () => {
    document.body.innerHTML = `
      <main>
        <article data-testid="tweet">${userName('Dev Rao', 'devrao')}
          <div data-testid="tweetText">Still the most underrated advice.</div>
          <div role="link">${userName('Paul G', 'paulg')}
            <div data-testid="tweetText">Do things that do not scale.</div>
          </div>
        </article>
        <div data-testid="cellInnerDiv">${composer}</div>
      </main>`
    const post = extractPost(box(), findPostContainer(box())!)
    expect(post.author).toBe('Dev Rao (@devrao)')
    expect(post.body).toBe(
      'Still the most underrated advice.\n\n[Quoting Paul G (@paulg): Do things that do not scale.]',
    )
    expect(post.mediaType).toBe('repost')
  })
})

describe('X: where the pill must not appear', () => {
  it('ignores the new-post composer (nothing to reply to)', () => {
    document.body.innerHTML = `
      <main><div data-testid="cellInnerDiv">${composer}</div>
        <article data-testid="tweet">${userName('Later', 'later')}
          <div data-testid="tweetText">A post below the composer.</div></article></main>`
    expect(commentInputFrom(box())).toBeNull()
  })

  it('ignores the compose dialog even when posts exist on the page behind it', () => {
    document.body.innerHTML = `
      <main><article data-testid="tweet">${userName('Behind', 'behind')}
        <div data-testid="tweetText">A post behind the dialog.</div></article></main>
      <div role="dialog">${composer}</div>`
    expect(commentInputFrom(box())).toBeNull()
  })

  it('never runs in direct messages', () => {
    expect(isInScope('/messages/123-456')).toBe(false)
    expect(isInScope('/i/chat/1')).toBe(false)
    expect(isInScope('/sarahbuilds/status/1')).toBe(true)
    expect(isInScope('/home')).toBe(true)
  })
})

describe('X helpers', () => {
  it('parses the User-Name block', () => {
    document.body.innerHTML = userName('Jo 🌱', 'jo')
    expect(authorFrom(document.querySelector('[data-testid="User-Name"]'))).toBe('Jo 🌱 (@jo)')
    expect(authorFrom(null)).toBe('')
  })

  it('keeps emoji rendered as images', () => {
    document.body.innerHTML = '<p>Hi <img alt="👋" src=""> there</p>'
    expect(readableText(document.querySelector('p')!)).toBe('Hi 👋 there')
  })
})

describe('platformFor', () => {
  it('maps hostnames to adapters', () => {
    expect(platformFor('www.linkedin.com')?.id).toBe('linkedin')
    expect(platformFor('x.com')?.id).toBe('x')
    expect(platformFor('twitter.com')?.id).toBe('x')
    expect(platformFor('mobile.x.com')?.id).toBe('x')
    expect(platformFor('notx.com')).toBeNull()
    expect(platformFor('example.com')).toBeNull()
  })
})
