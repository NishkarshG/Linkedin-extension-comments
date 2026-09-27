# Changelog

All notable changes to this project are documented here. This project adheres to
[Semantic Versioning](https://semver.org/) and the
[Keep a Changelog](https://keepachangelog.com/) format.

## [Unreleased]

### Added

- X (Twitter) support on `x.com` and `twitter.com`: the pill appears in the reply box under a post and in the reply dialog, never in the new-post box or direct messages.
- A dedicated X skill prompt (`src/skills/x-skill.md`): short, conversational replies that never exceed 280 characters.
- A separate custom system prompt for X, and a LinkedIn / X switch for the skill viewer in the options page.
- Quoted posts on X are passed to the model as context.
- **Voice samples** persona field: paste 3 to 5 of your own comments and InlineAI copies how you write (length, tone, punctuation, emoji, language mix), never what you said. Samples are escaped, marked as a style reference only, and trimmed to 1,500 characters.

### Changed

- The extension is now named "InlineAI for LinkedIn & X".
- Site specific code sits behind a small adapter (`src/content/platform.ts`), one per site.
- Pressing Escape to cancel a comment no longer reaches the page (on X it used to also close the reply dialog).
- The LinkedIn skill (0.4.0) and X skill (0.2.0) no longer carry one person's voice. Every user now gets their own voice from their persona and voice samples, with a plain, friendly default when those are empty.
- The persona fields start open on the settings page.

### Fixed

- Once the comment box holds text, the pill shrinks to an icon and moves just outside the box's right edge, so it no longer covers the first line of the comment.

### Fixed

- Replying to a comment now reads the original post (author, headline, body). LinkedIn renders comments as `<article>` elements, so the reply's own comment was mistaken for the post and the model only saw that comment.

## [0.2.0] - 2026-09-25

Fixes from the full audit of 0.1.0.

### Security

- Removed a committed private signing key (`dist.pem`) and blocked `*.pem` / `*.key` in `.gitignore`. The key remains in git history and must be rotated.
- The content script is no longer web accessible, so LinkedIn pages cannot detect the extension by probing its files.
- Provider hosts are now optional permissions requested per provider; `activeTab`, `scripting` and the LinkedIn host permission were removed.
- Gemini API key moved from the URL query string to the `x-goog-api-key` header.
- Post text is escaped in the prompt and marked as untrusted to resist prompt injection.
- The service worker only accepts generation requests from the extension itself.

### Fixed

- Updated retired default models (Gemini 1.5/2.0, Groq Llama 3.x, Mixtral). Saved retired models fall back to the provider default.
- OpenAI reasoning models (GPT-5 family, o series) now use `max_completion_tokens` and no `temperature`; newer Claude models (Opus 4.7 and later, Sonnet 5) no longer receive `temperature`, which they reject.
- Thinking models get output headroom so hidden reasoning cannot consume the whole budget.
- Empty answers show an error instead of a silent "success"; cut off answers are flagged; provider refusals are explained.
- Requests time out after 60 seconds; a lost worker connection resets the button.
- Comment boxes without `role="textbox"` (LinkedIn's Quill editor) are detected; the share composer is excluded.
- The pill now appears on company, school, group, event and search pages.
- A user's own draft is never replaced without confirmation; the @mention in replies is kept.
- Streaming writes are batched and never steal focus; typing or Esc cancels a running generation.
- Post type guessing: questions are detected again, and the author headline no longer biases every post.
- "See more" expansion and the Post button lookup work in non English LinkedIn; right to left posts are read.
- Settings inputs no longer jump the caret or drop characters; concurrent writes can no longer overwrite each other; one invalid stored value no longer wipes the API key.
- 403 from Ollama now explains `OLLAMA_ORIGINS`; 404 explains the model was not found.
- Console logging only happens with Debug logging on.
- CI lint failure fixed.

### Added

- Custom model id for every provider.
- Alt+Shift+W keyboard shortcut; Esc to cancel.
- Temperature setting; max output length field that no longer clamps while typing.
- Anthropic prompt caching for the system prompt.
- "What is sent" panel lists media type and replied-to comment text.
- CI checks the content script size budget and uploads a packaged zip.
- Tests grew from 19 to 54.

### Removed

- Dead `scripts/patch-loader.mjs`, stray `_tmp_*` files, a duplicate root `linkedin-skill.md`; the original build spec moved to `docs/agent-prompt.json`.

## [0.1.0] - 2026-05-26

### Added

- Inline **✦ Write with AI** pill that appears next to LinkedIn comment boxes (Shadow DOM, light + dark themes).
- Post extraction with resilient, single-source selectors (author, headline, body, media type, hashtags, post-type heuristic, reply context) plus automatic "see more" expansion.
- Streaming comment generation through the background service worker, inserted into the comment box via React-compatible input events. Never auto-posts.
- Six LLM providers via a thin native-`fetch` abstraction: OpenAI, Anthropic, Google Gemini, OpenRouter, Groq, and local Ollama — with shared error mapping, abort support, and SSE streaming.
- React popup and full options page: provider/model selection, masked API key with "Test connection", persona, and an Advanced section (custom system prompt with reset, max output length, streaming and see-more toggles, debug logging).
- The bundled LinkedIn skill prompt is viewable verbatim (with copy) and overridable from the options page.
- Privacy-first storage: API key lives only in `chrome.storage.local`; transparency section documents exactly what is and isn't sent.
- Unit tests for the provider abstraction, storage round-trip, and the DOM extractor.
- MIT license, CI workflow (lint, typecheck, build, test), and light/dark mockups.

[0.2.0]: https://github.com/NishkarshG/Linkedin-extension-comments/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/NishkarshG/Linkedin-extension-comments/releases/tag/v0.1.0
