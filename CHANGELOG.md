# Changelog

All notable changes to Nihongo Coach are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/). While the version is 0.x, a minor version means a new set of features, and a database migration can come with any minor version.

How releases are cut and deployed: [docs/RELEASING.md](docs/RELEASING.md).

## [Unreleased]

## [0.5.0] - 2026-11-07

### Added

- **今日 queue and the `/jp-daily` skill**: `/jp-daily` writes the day's practice in Claude Code on the subscription (a news reading passage rewritten from today's Japanese news with a source link, a work-report passage, and 1–2 會話 drills) and saves it with the new `POST /api/reading/prepared` and `POST /api/practice/prepared`, which validate with the same schemas as generated content and call no AI. Saves are idempotent per `source` + `date` + `slot`. 練習 → 讀音 and 會話 list today's unopened items first with a 今日 label, and 開始 opens them before generating on demand. Migration `0005_prepared_content` adds `source`, `prepared_for`, `daily_key`, `opened_at` (and `source_url` on passages). Scheduling: [docs/daily-content.md](docs/daily-content.md).
- [docs/COSTS.md](docs/COSTS.md): measured cost per action and per month, the free-tier and rate limits of each service, and how to cap spending.

## [0.4.0] - 2026-11-05

### Added

- **Automated releases**: CI on every pull request and on `main` (lint, type check, build, pitch check, and a new migration-numbering check, `npm run check` locally). `npm run release -- <patch|minor|major>` bumps the version, moves these notes under a dated heading, commits, tags and pushes after a prompt. Pushing a `vX.Y.Z` tag creates the GitHub Release and, after approval on the `production` environment, applies remote D1 migrations and deploys. `npm run backup` exports the remote database to the git-ignored `backups/`. See [docs/RELEASING.md](docs/RELEASING.md).
- 🔊 on each sentence and each tricky word in 練習 → 讀音, shown after 顯示讀音.

### Changed

- `/api/tts` takes `{ text, reading?, parts? }`. With `reading` (card accent words, reading-practice words) the server looks up the Kanjium accent and sends Azure SSML `<phoneme alphabet="sapi">` (katakana, `'` before the accented mora), so a lone kanji is read right (端 was read たん, 命 めい) and the accent follows the dictionary. `parts` pins the readings of a sentence's tokens. Plain `{ text }` works as before.
- Audio is cached in the Workers Cache API when no R2 bucket is bound (R2 is still used when bound). Cache keys now hash the SSML, so audio cached by 0.3.0 is not reused.
- The browser-voice fallback flag moved to localStorage key `nihongo-coach-tts-off-v2`, so devices that remembered "server TTS off" from 0.3.0 try the server again right after Azure is configured.

## [0.3.0] - 2026-11-05

Practice and review. The app now has four tabs (查詢 / 練習 / 複習 / 卡片) and settings in a ☰ menu.

Commits `13731a0..` up to the v0.3.0 tag (merges of [#1](https://github.com/WeiLin18/nihongo-coach/pull/1) `claude/practice-reading`, the SRS review branch, and the pitch-recording branch).

### Added

- **Conversation practice (練習 → 會話)**: short work and daily-life role-plays. You answer in Japanese (typed or by voice), get a natural version with a note in Traditional Chinese, and can save the correction as a card (source `practice`). About 4 work scenes to 3 life scenes a week; recent drills are passed to the prompt to avoid repeats. Model: `OPENAI_MODEL_PRACTICE`. (`ea358bf`, `9e4719a`)
- **Kanji reading practice (練習 → 讀音)**: a passage with no furigana, alternating between a dialogue and a news-style report. Read it aloud (optionally record it), reveal readings and translations, mark the words you misread and save them as cards (source `reading`). Model: `OPENAI_MODEL_READING`. (`de6961c`, `83c6b59`)
- **Speaking review (複習)**: FSRS spaced repetition for speaking, with a due-count badge on the tab, ratings 重來 / 困難 / 良好 / 簡單, a daily new-card limit (default 20, set in 設定), today's count and a streak. Every review is logged in `review_logs`. (`e2963da`)
- **Pitch recording (🎙 錄音比對)**: on each word in a card's accent section, record yourself and see your pitch curve over the dictionary pattern, with a verdict on where the fall should be. Analysed on the device, never uploaded. `node scripts/check-pitch.ts` checks the analysis on synthetic voices. (`b8845df`)
- API: `/api/practice*`, `/api/reading*` and `/api/review*` routes.
- Migrations `0001_practice`, `0002_reading`, `0003_practice_turn_unique` and `0004_srs`.

### Changed

- 會話 and 讀音 share one 練習 tab with sub-tabs; the tab reopens the section used last. (`9b144be`)
- 設定 moved out of the bottom nav into a ☰ menu at the top right. (`e255e9c`)
- Reading passages label dialogues 對話 so they don't clash with the 會話 tab. (`83c6b59`)

### Fixed

- Saving the same practice correction or reading word twice returns the existing card instead of making a duplicate. (`7d0d3e6`)
- The microphone stops when you leave a page in the middle of recording. (`7d0d3e6`)
- A second practice reply sent while the first is in flight fails cleanly instead of adding a duplicate turn (unique index, migration 0003). (`7d0d3e6`)
- Recent lists show dates in local time instead of UTC. (`7d0d3e6`)
- 🔊 buttons no longer pile up repeated audio on iPhone: one tap plays once, tapping again (⏹) stops it, another 🔊 cuts off the current one, and playback stops when you leave the page. When server TTS isn't configured, the browser voice starts right away instead of asking the server on every tap. (`68c1555`)

## [0.2.0] - 2026-11-02

More ways in, faster answers, and a public repo.

Commits `a548a9f..13731a0` (`6e3f224` to `13731a0`).

### Added

- **`/jp` Claude Code skill** and `POST /api/cards`, which saves an already-written card without calling the AI, so cards can be made on a Claude subscription. (`6e3f224`)
- **Streaming**: `/api/ask?stream=1` sends the card over SSE as it is generated; the app shows the first text after about a second. (`b3857a8`)
- **MCP connector** at `/mcp/<MCP_TOKEN>` with `save_card` and `list_cards`, for the Claude web and mobile apps (source `claude-app`). (`5453242`)
- **Demo mode**: `npm run demo` uses a separate local database seeded with mock cards from `scripts/demo-cards.json`. (`d677791`)
- README screenshots, a demo GIF and MP4, an English README by default and `README.zh-TW.md`. (`d677791`, `5595ae8`, `d3db1bd`)
- MIT `LICENSE` and `.prod.vars.example`. (`7473b93`)
- **Pagination**: the card list loads 30 at a time with a cursor and infinite scroll (`GET /api/cards?cursor=&limit=` returns `{ cards, nextCursor }`). (`13731a0`)

### Changed

- The OpenAI model is set per mode (`OPENAI_MODEL_LOOKUP`, `OPENAI_MODEL_ZH2JA`, `OPENAI_MODEL_NATURALIZE`), and reasoning is off for all modes. (`b3857a8`)
- The `/jp` skill finds the project and the app URL from `.prod.vars` instead of hardcoded paths. (`7473b93`)
- **Breaking (API)**: `GET /api/cards` returns `{ cards, nextCursor }` instead of an array. (`13731a0`)

## [0.1.0] - 2026-10-24

Phase 1 MVP. Commit `a548a9f`.

### Added

- Three modes that each produce a flashcard: **查詞** (Look up), **我想說** (Say it, Chinese → natural Japanese) and **幫我改** (Fix it), with text or voice input (`gpt-4o-transcribe`).
- Dictionary pitch-accent lines from the [Kanjium](https://github.com/mifunetoshiro/kanjium) data (about 108k entries), imported with `scripts/import-accents.ts`.
- Azure neural-voice audio, with an optional R2 cache.
- Card list with categories and search; card detail with examples.
- iOS Shortcuts for the share sheet and screenshots (`docs/ios-shortcuts.md`).
- Vite + React PWA and a Hono API on Cloudflare Workers with D1 (migration `0000_init`).

[Unreleased]: https://github.com/WeiLin18/nihongo-coach/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/WeiLin18/nihongo-coach/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/WeiLin18/nihongo-coach/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/WeiLin18/nihongo-coach/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/WeiLin18/nihongo-coach/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/WeiLin18/nihongo-coach/releases/tag/v0.1.0
