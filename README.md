# InlineAI for LinkedIn

Open-source, bring-your-own-key Chrome extension that drafts genuinely personalised LinkedIn comments inline.

When you focus a LinkedIn comment box, a small **✦ Write with AI** pill appears next to it. Click it, and InlineAI reads the post, calls *your* chosen LLM with a carefully engineered LinkedIn skill prompt, and writes a thoughtful, post-specific comment straight into the box for you to review, edit, and post. It never posts for you.

![InlineAI inline button, light theme](docs/inline-button-light.svg)
![InlineAI inline button, dark theme](docs/inline-button-dark.svg)

## Why this exists

Most LinkedIn comment AI tools produce generic, obviously-AI comments ("Great post!", "Couldn't agree more!") that quietly damage your brand. InlineAI is different on four axes:

- **Truly open source** (MIT). Read every line, including the prompt.
- **Bring-your-own-key.** You pay your provider directly. No subscriptions, no proxy, no markup.
- **Privacy-first.** No backend. Your API key lives in `chrome.storage.local` and never leaves your device except to the provider you pick.
- **Comment quality.** The whole product is the [LinkedIn skill prompt](src/skills/linkedin-skill.md): specific over generic, human over corporate, one sharp idea per comment.

## Supported providers

You only need a key for one. Pick whichever you already use:

| Provider | Default model | Notes |
| --- | --- | --- |
| OpenAI | `gpt-5.4-mini` | Reasoning models (GPT-5 family, o series) handled automatically |
| Anthropic (Claude) | `claude-haiku-4-5` | Browser direct via the official header; system prompt is prompt cached |
| Google Gemini | `gemini-3.5-flash-lite` | Thinking kept low so it cannot eat the output budget |
| OpenRouter | `openai/gpt-4o-mini` | Type any model id (hundreds available) |
| Groq | `openai/gpt-oss-120b` | Fastest, generous free tier |
| Local (Ollama) | `llama3.1:8b` | No key needed; start Ollama with `OLLAMA_ORIGINS=chrome-extension://*` |

Every provider also accepts a **custom model id**, because providers retire models every few months. If a saved model has been retired (for example `gemini-1.5-flash` or Groq's `llama-3.3-70b-versatile`), InlineAI falls back to the provider default and tells you in settings. Model lists were last reviewed in September 2026.

## Install (load unpacked)

1. Install dependencies and build:
   ```bash
   pnpm install
   pnpm build
   ```
2. Open `chrome://extensions`, enable **Developer mode** (top-right).
3. Click **Load unpacked** and select the generated `dist/` folder.
4. The settings tab opens automatically. Pick a provider, click **Allow access** so the extension may contact that provider (it asks for that one host only), paste your API key, optionally fill in your persona, and hit **Test connection**.
5. Go to your LinkedIn feed, focus any comment box, and click **✦ Write with AI** or press **Alt+Shift+W**.

### Using it

* **Alt+Shift+W** in a comment box writes a comment. **Esc** (or typing in the box) cancels a comment that is still being written.
* If the box already contains **your own draft**, InlineAI asks before replacing it.
* When replying, the **@mention** LinkedIn adds for the person you reply to is kept.
* Works on the feed, single posts, profiles, company, school, group, event and search pages. Never in messaging.

### Install (Chrome Web Store)

A Web Store listing is planned. Until then, use the load-unpacked steps above.

## Permissions

InlineAI asks for as little as possible:

* `storage`: to keep your settings on this device.
* The LinkedIn content script runs only on `linkedin.com` pages.
* **One AI provider host, on demand.** Provider hosts are optional permissions. Chrome asks you when you pick a provider (or click **Allow access**), so you never grant access to AI services you do not use.

The content script is intentionally **not** web accessible, so LinkedIn pages cannot probe for the extension's files to detect it.

## Where your API key is stored

Your key is written **only** to `chrome.storage.local` on this device. It is:

- never stored in `chrome.storage.sync`, `localStorage`, or cookies;
- never logged (debug logging masks all but the last 4 characters);
- never sent anywhere except the provider you selected.

The Gemini key is sent in the `x-goog-api-key` header, never in the URL.

The options page has a **"What is sent to your AI provider"** section spelling out exactly what leaves your browser (the post's author name and headline, body text, hashtags, media type, a post type guess, the comment you are replying to when you reply, and your persona fields) and what never does (your full LinkedIn page, profile, or activity history). Post text is escaped and marked as untrusted in the prompt, so a post cannot smuggle instructions to the model.

## Customising the skill prompt

The [`src/skills/linkedin-skill.md`](src/skills/linkedin-skill.md) file is the system prompt and the heart of the product. You can:

- **View it** verbatim in the options page (with a copy button), so you always know what's being sent on your behalf.
- **Override it** in the options page under *Advanced → Custom system prompt*. A **Reset to default** button restores the bundled skill at any time.

If you improve the prompt, please open a PR — prompt changes are treated like product launches.

## How it works (architecture)

- **Content script** (vanilla TS + Shadow DOM, no React, no zod) detects the comment box, renders the pill, extracts the post via resilient selectors, and inserts the result. Kept under a 30 KB gzipped budget (CI enforces it). Logging only happens when **Debug logging** is on.
- **Background service worker** does the cross-origin LLM call (it holds the provider host permission, which content scripts don't in MV3) and streams the comment back to the content script over a Port. Requests time out after 60 seconds, empty or cut off answers are reported instead of failing silently.
- **Popup + options** (React + Tailwind) handle settings, with four hand-built UI primitives (Button, Input, Select, Toggle).
- **LLM layer** is native `fetch` with a thin per-provider abstraction — no vendor SDKs, saving 500 KB+ of bundle weight.

## Develop

```bash
pnpm dev         # Vite + CRXJS with HMR (load dist/ unpacked, then it hot-reloads)
pnpm typecheck   # tsc --noEmit, strict
pnpm test        # Vitest unit tests
pnpm lint        # Biome
pnpm build       # typecheck + production build to dist/
```

CI runs lint, typecheck, tests and the build on every pull request, checks the content script budget, and uploads a ready to load `inlineai-extension.zip` as a build artifact.

### Signing keys

Never commit a `.pem` file. `.gitignore` blocks `*.pem` and `*.key`. If a key was ever pushed, treat it as compromised: generate a new one, and remove the old file from git history.

## Contributing

1. Fork and create a feature branch.
2. Run `pnpm lint && pnpm typecheck && pnpm test` before opening a PR.
3. For DOM-selector fixes (LinkedIn changes often), edit the single `SELECTORS` object in [`src/content/linkedin-dom.ts`](src/content/linkedin-dom.ts) and note the date you verified it.
4. For prompt changes, run a few post types through it first and describe what you tested.

## Roadmap (v2)

- Multi-platform (X, Reddit) via per-platform skill files.
- "Improve my draft" mode — rewrite a draft you already typed.
- Regenerate-with-variation chip (shorter / sharper / add a question).
- Selectable voices (contrarian / witty / supportive) per click.
- Pin a preferred reply language.

## License

MIT — see [LICENSE](LICENSE).
