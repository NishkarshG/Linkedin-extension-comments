import type { PostData } from '@/shared/types'
import skillMd from '@/skills/linkedin-skill.md?raw'
import type { Persona, Settings } from './types'

/** The bundled LinkedIn skill — the default system prompt. This file IS the product. */
export const BUNDLED_SYSTEM_PROMPT: string = skillMd

/** Returns the user's custom prompt if set, otherwise the bundled skill. */
export function resolveSystemPrompt(settings: Settings): string {
  const custom = settings.customSystemPrompt.trim()
  return custom.length > 0 ? custom : BUNDLED_SYSTEM_PROMPT
}

/** True when the post has enough text to comment on specifically. */
export function hasUsableBody(post: PostData): boolean {
  return post.body.trim().length >= 15
}

export function effectiveTemperature(_post: PostData, base: number): number {
  return base
}

function field(value: string | undefined): string {
  const v = (value ?? '').trim()
  return v.length > 0 ? v : '(not provided)'
}

/** Build the structured user prompt from the extracted post + persona (spec template). */
export function buildUserPrompt(post: PostData, persona: Persona): string {
  const hashtags = post.hashtags.length > 0 ? post.hashtags.map((h) => `#${h}`).join(' ') : '(none)'
  const replyContext =
    post.isReply && post.repliedToText
      ? `\n  <replying_to>\n${indent(post.repliedToText)}\n  </replying_to>`
      : ''

  return [
    "Here is the LinkedIn post and the user's context. Write ONE comment following the rules in your instructions.",
    '',
    '<post>',
    `  <author>${field(post.author)}</author>`,
    `  <author_headline>${field(post.authorHeadline)}</author_headline>`,
    `  <post_type_heuristic>${post.postType}</post_type_heuristic>`,
    `  <media_type>${post.mediaType}</media_type>`,
    '  <body>',
    indent(post.body.trim().length > 0 ? post.body.trim() : '(no text body — media only)'),
    '  </body>',
    `  <hashtags>${hashtags}</hashtags>${replyContext}`,
    '</post>',
    '',
    '<commenter_persona>',
    `  <name>${field(persona.name)}</name>`,
    `  <role>${field(persona.role)}</role>`,
    `  <expertise>${field(persona.expertise)}</expertise>`,
    `  <industry>${field(persona.industry)}</industry>`,
    `  <voice_notes>${field(persona.voiceNotes)}</voice_notes>`,
    '</commenter_persona>',
    '',
    "Output: only the comment text. No preamble. No quotes around it. No 'Here's a comment:'.",
  ].join('\n')
}

function indent(text: string): string {
  return text
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n')
}
