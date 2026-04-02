# sub.translate

A lightweight, browser-based subtitle translator powered by the **Gemini API**. Import subtitles, translate them into any language, and export — all without installing anything.

[![Try it live](https://img.shields.io/badge/Try%20it%20live-▶%20Open%20app-5b7cf6?style=for-the-badge)](https://unairosende.github.io/sub-translate)

---

## Features

- **Import** SRT, TXT, or CSV subtitle files — drag & drop, browse, or paste directly
- **Translate** using Gemini 2.0 Flash with batched requests for speed
- **Two output modes:**
  - **Horizontal** — max 42 characters per line
  - **Vertical** — max 32 characters per line, with automatic splitting of long subtitles (timecodes are divided at the midpoint)
- **Live character-length indicators** on every subtitle card — warnings at 85% of the limit, errors above it
- **Export** as SRT (with timecodes), TXT (plain text), or CSV
- **No backend, no installation** — runs entirely in the browser
- **API key stays in memory only** — never stored or sent anywhere except directly to Google's API

## Supported languages

Spanish · French · German · Italian · Portuguese · Dutch · Polish · Russian · Turkish · Arabic · Japanese · Korean · Chinese (Simplified) · Catalan · and any language Gemini supports

## How to use

1. Get a free Gemini API key at [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Open the app and paste your key in the top-right field (the dot turns green when it looks valid)
3. Drop or open your subtitle file
4. Choose your target language and output format (horizontal or vertical)
5. Click **Translate**
6. Click **Export** to download the result

## Character limits

| Output type | Max chars per line | Auto-split |
|---|---|---|
| Horizontal | 42 | No |
| Vertical | 32 | Yes — splits subtitle and timecode in half |

## Running locally

No build step needed. Just open the file:

```bash
git clone https://github.com/unairosende/sub-translate.git
cd sub-translate
open index.html   # or double-click the file
```

## License

MIT
