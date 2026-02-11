# CLAUDE.md

## Project overview

Quipli is a Chrome extension (Manifest V3) that generates AI-powered comments for LinkedIn posts. It supports Anthropic Claude, OpenAI GPT, and Google Gemini as providers. Users supply their own API key — there is no backend server.

## Architecture

```
popup/          → Settings UI (provider, model, API key, tone, system prompt, enable toggle)
background/     → Service worker handling API calls to AI providers
content/        → Content script injected on LinkedIn — DOM observation, comment preview, injection
icons/          → Extension icons (SVG source + PNG exports) and provider logos
manifest.json   → Chrome extension manifest v3
```

**Data flow:** Content script detects posts via MutationObserver/IntersectionObserver → sends `generateComment` message to background → background reads settings from `chrome.storage.local` and calls provider API → returns comment → content script shows preview (Accept/Dismiss/Regenerate).

## Key conventions

- **No build step.** Pure HTML/CSS/JS. No bundler, no transpiler, no node_modules.
- **No frameworks.** Vanilla JS throughout.
- **CSS class prefix:** All content script injected elements use `lac-` prefix to avoid LinkedIn CSS collisions.
- **Storage:** All settings stored in `chrome.storage.local`. Keys: `provider`, `model`, `apiKey`, `tone`, `enabled`, `systemPrompt`.
- **Logging:** All console output is prefixed — `[Quipli]` (content), `[Quipli BG]` (background), `[Quipli popup]` (popup).
- **Chrome API compatibility:** Storage and messaging wrappers handle both Promise and callback APIs for browser compatibility (Chrome, Arc, etc.).

## LinkedIn DOM selectors

LinkedIn frequently changes its DOM structure. All selectors are centralized in `content/content.js` → `SELECTORS` object. When LinkedIn breaks, update selectors there — nowhere else.

## Testing changes

1. Edit files
2. Go to `chrome://extensions`
3. Click the reload button on Quipli
4. Refresh LinkedIn
5. For background script changes, click "service worker" link to see console logs

## Things to watch out for

- **API keys are sensitive.** Never log full keys — the codebase already masks them (shows only last 4 chars).
- **Content script mutations.** The MutationObserver filters out its own DOM changes (elements with `lac-` class prefix) to avoid infinite loops.
- **Concurrency limit.** Max 3 simultaneous API calls (`MAX_CONCURRENCY` in content script) with a queue for the rest.
- **Custom system prompt replaces the default entirely.** When a user sets a custom system prompt, the built-in template (including tone) is not used at all.

## Releases

- Tag each release with `vX.Y.Z`
- `main` branch = stable, publishable to Chrome Web Store
- Use feature branches for new work
