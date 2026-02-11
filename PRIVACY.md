# Privacy Policy

**Quipli** — AI-powered comment generator for LinkedIn
**Last updated:** February 2025

## Summary

Quipli runs entirely in your browser. It has no backend server, collects no analytics, and sends no data to anyone except the AI provider you choose to configure.

## What data Quipli accesses

- **LinkedIn post text** — When generation is enabled, Quipli reads the text content of posts visible in your LinkedIn feed. This text is sent to your chosen AI provider (Anthropic, OpenAI, or Google) to generate a comment suggestion.
- **API key** — You provide your own API key for the AI provider. This key is stored locally in your browser's extension storage and is only transmitted to the corresponding provider's API.

## What data Quipli stores

All data is stored locally in your browser using Chrome's `chrome.storage.local` API:

- API provider selection
- Model selection
- API key
- Tone preference
- Custom system prompt (if set)
- Enabled/disabled state

No data is stored on any external server.

## What data Quipli shares

Quipli sends data only to the AI provider you configure — and only when generation is enabled:

| Provider | Data sent | Endpoint |
|---|---|---|
| Anthropic (Claude) | Post text + system prompt | `api.anthropic.com` |
| OpenAI (GPT) | Post text + system prompt | `api.openai.com` |
| Google (Gemini) | Post text + system prompt | `generativelanguage.googleapis.com` |

No data is sent to Codika or any other third party.

## What data Quipli does NOT collect

- No personal information
- No browsing history
- No LinkedIn profile data
- No analytics or telemetry
- No cookies or tracking pixels

## Permissions explained

- **storage** — Save your settings locally in the browser
- **activeTab** — Access the active LinkedIn tab to detect posts
- **Host permissions** — Connect to AI provider APIs and LinkedIn

## Your control

- Quipli is disabled by default — no data is accessed until you enable it
- Comments are never posted automatically — you always review and approve
- You can disable Quipli at any time from the popup
- Uninstalling the extension removes all locally stored data

## Changes to this policy

Updates to this policy will be reflected in this document with an updated date. Since Quipli is open source, all changes are visible in the repository history.

## Contact

If you have questions about this privacy policy, open an issue at [github.com/codika-io/quipli](https://github.com/codika-io/quipli/issues) or reach out at [codika.io](https://codika.io).
