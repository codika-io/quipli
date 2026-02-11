# Quipli

AI-powered comment generator for LinkedIn posts. Quipli uses your preferred AI provider (Anthropic, OpenAI, or Google) to generate thoughtful, context-aware comments as you scroll through your LinkedIn feed.

## Features

- **Multi-provider support** — Claude, GPT, or Gemini, your choice
- **Tone selection** — Professional, casual, witty, supportive, or insightful
- **Custom system prompt** — Full control over how comments are generated
- **Auto-generation** — Comments appear as you scroll, ready to review
- **Accept / Dismiss / Regenerate** — You stay in control, nothing posts automatically
- **Language matching** — Replies in the same language as the original post

## Installation

### From the Chrome Web Store

*Coming soon.*

### From source

1. Clone this repository:
   ```bash
   git clone https://github.com/codika-io/quipli.git
   ```
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (toggle in top-right)
4. Click **Load unpacked** and select the `quipli` folder
5. The Quipli icon appears in your toolbar

## Setup

1. Click the Quipli icon in your Chrome toolbar
2. Select your **API provider** (Anthropic, OpenAI, or Google)
3. Choose a **model**
4. Paste your **API key** — it's validated automatically
5. Pick a **comment tone**
6. Optionally add a **custom system prompt** for fine-grained control
7. Toggle **Generate Comments** on
8. Browse LinkedIn — comments will appear under each post

## How it works

Quipli runs entirely in your browser. Post text is sent directly from the extension to the AI provider's API using your own API key. No data passes through any intermediary server.

```
LinkedIn feed → Content script detects posts → Background worker calls AI API → Comment preview shown → You accept, dismiss, or regenerate
```

## Project structure

```
quipli/
├── manifest.json           # Chrome extension manifest (v3)
├── background/
│   └── background.js       # Service worker — API calls and message handling
├── content/
│   ├── content.js          # LinkedIn DOM observation and UI injection
│   └── content.css         # Styles for injected elements (lac- prefix)
├── popup/
│   ├── popup.html          # Settings popup
│   ├── popup.css           # Popup styles
│   └── popup.js            # Popup logic and settings management
└── icons/
    ├── icon.svg            # Source SVG icon
    ├── icon16.png          # Toolbar icon
    ├── icon48.png          # Extension management icon
    ├── icon128.png         # Chrome Web Store icon
    └── providers/          # Provider logos for the popup
        ├── anthropic.svg
        ├── openai.svg
        └── google.svg
```

## Privacy

- Your API key is stored locally in Chrome's extension storage and is only sent to the AI provider you selected
- Post text is sent to the AI provider to generate comments — no other data is collected or transmitted
- Quipli has no analytics, no tracking, and no backend server

## Contributing

Contributions are welcome. If LinkedIn changes their DOM and breaks selectors, PRs to update `content/content.js` → `SELECTORS` are especially appreciated.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-change`)
3. Commit your changes
4. Open a pull request against `main`

## License

[MIT](LICENSE) — built by [Codika](https://codika.io)
