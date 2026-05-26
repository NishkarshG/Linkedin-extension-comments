# Changelog

All notable changes to this project are documented here. This project adheres to
[Semantic Versioning](https://semver.org/) and the
[Keep a Changelog](https://keepachangelog.com/) format.

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

[0.1.0]: https://github.com/inlineai/inlineai/releases/tag/v0.1.0
