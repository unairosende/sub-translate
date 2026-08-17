# sub-translate — Claude Code Project Guide

## Project snapshot

Single-file browser app: `index.html` (~4400 lines, HTML + CSS + JS).
Serverless API: `api/translate.js` (Vercel, calls Gemini/Groq/OpenRouter/Mistral).
Stack: vanilla JS, no bundler, no framework. Deployed on Vercel.
Accounts and usage live in PocketBase at `PB_URL` (defaults to `api.captio.studio`).

---

## Agentic architecture — routing rules

### Tier 1 · Locate (model: haiku)
**Use `cavecrew-investigator` for ALL code location tasks.**
Never read large file chunks in the main thread.

Trigger when:
- "Where is function X defined?"
- "What line does Y happen on?"
- "Find all uses of Z"
- Any grep/Read needed before planning a change

```
Agent({ subagent_type: "caveman:cavecrew-investigator", model: "haiku", ... })
```

### Tier 2 · Edit (model: haiku)
**Use `cavecrew-builder` for surgical 1–3 spot edits with clear scope.**
Handles GateGuard fact-forcing automatically.

Trigger when:
- Change is bounded, obvious, mechanical
- Up to 3 edit locations, no new architectural decisions
- Renames, removals, single-function rewrites

```
Agent({ subagent_type: "caveman:cavecrew-builder", model: "haiku", ... })
```

### Tier 3 · Implement (model: sonnet — main thread)
**Main thread direct edits for multi-change features and logic.**

Trigger when:
- Multiple interdependent changes across the file
- New features requiring design decisions
- Debugging subtle logic bugs

Do edits directly with the Edit tool. Pass GateGuard facts before each Edit call.

### Tier 4 · Architect (model: opus)
**Spawn with `model: "opus"` only for:**
- Fundamental architectural changes
- Complex algorithmic design
- Decisions with broad downstream impact

---

## File structure

```
index.html          — entire frontend (HTML + CSS + JS, ~4400 lines)
api/translate.js    — Vercel serverless: Gemini/Groq/OpenRouter/Mistral
api/transcribe.js   — ElevenLabs Scribe transcription
api/models.js       — lists available model names; monitor-key bypass for health checks
api/_auth.js        — PocketBase session check and usage/cost accounting (shared, not a route)
```

There is **no alignment endpoint**. This section used to list `api/align.js`, and
it has never existed — `index.html` has no caller for it either. That one line
cost a day of planning a port of a feature that was never built, so: this
listing is the four files above, and nothing else.

There is no `vercel.json` either. The deployment is configured in the Vercel
dashboard, not in the repo.

## Key globals (index.html JS)

| Variable | Purpose |
|---|---|
| `subtitles` | Source subtitle array `{index, start, end, text}` |
| `translations[lang]` | Per-language translated arrays |
| `backTranslations[lang]` | Back-translation arrays |
| `activeTab` | Currently visible tab (`'source'` or lang name) |
| `viewMode` | `'list'` or `'compare'` |
| `outputMode` | `'horizontal'` or `'vertical'` |
| `settings` | `{maxCharsH, maxCharsV, maxLinesPerSub, elModel}` |
| `pillFilter` | `null | 'warn' | 'err'` — active filter on subtitle list |
| `tlPlayhead` | Timeline playhead position (seconds) |
| `tlIsCollapsed` | Timeline collapsed state |
| `jklSpeed` | Current JKL transport speed multiplier |

## Key functions (index.html JS)

| Function | Purpose |
|---|---|
| `renderCurrentView()` | Re-renders editor area; applies `pillFilter` |
| `rebuildTabs()` | Rebuilds language tab bar |
| `makeCard(sub, editable, lang)` | Creates a subtitle card DOM element |
| `openEdit(card, sub, lang)` | Opens inline edit; syncs timeline |
| `splitSubtitle(idx)` | Splits cue at midpoint, renumbers all langs |
| `deleteSubtitle(idx)` | Removes cue from all langs, renumbers |
| `startTranslation()` | Batched AI translation, auto-switches to compare |
| `afterLoad()` | Called after any file import; detects language |
| `detectAndSetSrcLang(subs)` | Word-frequency language detection |
| `tlSeek(t)` | Seeks timeline to time `t` (seconds) |
| `tlRender()` | Redraws timeline canvas |
| `jklPlay(dir)` | JKL transport — dir: 1=forward, -1=reverse |
| `setDarkMode(on)` | Toggles dark theme, persists to localStorage |
| `saveStateLocally()` | Persists full state to localStorage |
| `pushUndo()` | Saves undo snapshot |

## Timecode conventions

- SRT format: `HH:MM:SS,mmm` (comma before ms)
- All internal times stored as SRT strings
- `secToSrt(sec)` — float → SRT, snaps to 25fps frame boundary
- `tlSrtToSec(srt)` — SRT → float seconds
- `normalizeTc(s)` — normalizes import timecodes (handles HH:MM:SS:FF frame-based CSV)

## Commit discipline

- Commit after every logical change, never batch unrelated work
- Short imperative summary + bullet points per change
- Always append: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`
- Push via `git push` (HTTPS credential helper configured)

## GateGuard compliance

Before every Edit/Write call state:
1. No files import this file (standalone HTML app)
2. Which function is affected
3. No data file I/O
4. User instruction verbatim

---

## Known constraints

- `maxOutputTokens: 16000` required for Gemini 2.5 Flash (thinking mode consumes output budget)
- Timeline reverse (J key) = time-scrub only; Web Audio API rejects negative `playbackRate`
- Auth restricted to `@keweke.com` Google accounts
- Vercel env vars: `gemini_key`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `MISTRAL_API_KEY`, `ELEVENLABS_API_KEY`
