---
name: jp-daily
description: Prepares today's Nihongo Coach practice (a news reading passage, a work-report passage, and 1-2 conversation drills) and saves them to the app's 今日 queue. Use when the user types /jp-daily, asks to prepare today's Japanese practice, or when the daily schedule runs it.
argument-hint: "[news|work|drill]... [@題材提示] [--local] [--date YYYY-MM-DD] [--extra]"
allowed-tools: Read, WebSearch, WebFetch, Bash(curl:*), Bash(grep:*), Bash(realpath:*), Bash(date:*)
---

# /jp-daily — today's practice for Nihongo Coach

Write the same reading passages and drills the app writes with OpenAI, using this session instead,
and save them to the app. The app shows them at the top of 練習 → 讀音 and 練習 → 會話 with a 今日 label
until the learner opens them; after that it generates on demand as before.

This may run unattended from a schedule. Never stop to ask a question: use the defaults below,
and if something is missing, say what in the final report.

The project folder is two levels above this skill's real location (`skills/jp-daily` inside the repo,
usually linked into `~/.claude/skills/jp-daily`). Find it once per run:

```bash
realpath "<this skill's base directory>/../.."
```

## 1. Options

From `$ARGUMENTS` (all optional):
- `news`, `work`, `drill` (also 新聞, 工作, 會話): make only these. Default: all three.
- `@<hint>`: a topic hint for this run, e.g. `@半導体` or `@リリース延期`. Applies to the items made in this run.
- `--local`: save to the local dev server (`http://localhost:5173`, token from `.dev.vars`) instead of production.
  `--local=5174` picks another port (demo mode).
- `--date YYYY-MM-DD`: prepare for another day. Default: today in Tokyo, `TZ=Asia/Tokyo date +%F`.
- `--extra`: add one more of each selected item even though today's are already saved (slots get a `-2`, `-3`… suffix).

## 2. Connection

Production reads `APP_URL` and `APP_TOKEN` from the project's `.prod.vars`; `--local` reads `APP_TOKEN` from `.dev.vars`.
Read them inside each command and never print the token. Every request below starts like this:

```bash
REPO='<project folder>'
APP_URL=$(grep '^APP_URL=' "$REPO/.prod.vars" | cut -d= -f2-)      # --local: APP_URL=http://localhost:5173
TOKEN=$(grep '^APP_TOKEN=' "$REPO/.prod.vars" | cut -d= -f2-)      # --local: "$REPO/.dev.vars"
```

- `401`: the token no longer matches the deployed one. Stop and report it.
- `404` on the `/prepared` routes: production is older than this skill (the API ships in the release after 0.4.0). Stop and report it.
- No `APP_URL`: stop and ask the user to add it to `.prod.vars`.

## 3. See what exists

```bash
curl -sS "$APP_URL/api/reading?status=all" -H "Authorization: Bearer $TOKEN"
curl -sS "$APP_URL/api/practice?limit=20" -H "Authorization: Bearer $TOKEN"
```

- Each item has `dailyKey` (`claude-daily:<date>:<slot>` for this skill). Skip slots already saved for the date,
  unless `--extra` was given. The saves are idempotent anyway, so a skipped check never makes duplicates.
- Collect recent passage `topic`s and drill `scenario.title`s: new items must be clearly different.
- For words already practiced, read the 5 newest passages with `?peek=1` (peek does not take them out of the 今日 queue)
  and collect `words[].lemma`:

```bash
curl -sS "$APP_URL/api/reading/<id>?peek=1" -H "Authorization: Bearer $TOKEN"
```

## 4. Read the app's prompts

Read these files in the project folder and follow them exactly. They are what the app sends to OpenAI;
your output must be indistinguishable from the app's.
- `worker/lib/reading.ts`: `READING_SYSTEM`, `KIND_TASKS`, `SCENES`
- `shared/reading.ts`: `PassageDraft` (field rules, 3-6 sentences, 4-10 words) and `SavePassageRequest`
- `worker/lib/practice.ts`: `THEMES`, `PRACTICE_RULES`, `SCENARIO_TASK`, and how `pickKind` and `startPractice` choose kind and theme
- `worker/lib/ai.ts`: `SYSTEM` (drills use it together with `PRACTICE_RULES`)
- `shared/schema.ts`: `PracticeScenario` and `SavePracticeRequest`, `CATEGORIES`

Never add pitch-accent data: no schema here has a field for it, and the app does not use model-written accents.
Readings are hiragana. Check every token: concatenating `text` must give the sentence exactly,
every token with kanji has its full reading (okurigana included), kana-only tokens have `""`,
and each `words[].surface` equals one token's `text`.

## 5. Write the items

### news (slot `news`) — 新聞 reading passage

1. Search today's Japanese news (WebSearch, e.g. `ニュース 今日 <date>` and a site like NHK, 日経, ITmedia, 共同).
   Pick one story that suits a front-end engineer living in Tokyo: technology, economy, society, transport, weather, culture.
   Skip crime and disaster stories with victims, and anything older than two days. With `@hint`, prefer a story on that topic.
2. Open the article (WebFetch) to get the facts right.
3. Write a `kind: "news"` passage following `READING_SYSTEM` and `KIND_TASKS.news`. Rewrite in your own words at N1 level for reading aloud:
   - use the facts only; never copy or closely paraphrase the article's sentences, and never quote it;
   - the `title` is your own, not the article's headline;
   - follow the tricky-word rules (5-8 words in the text, 4-10 in `words`), avoiding words already practiced.
4. `sourceUrl` is the article URL.

### work (slot `work`) — 工作報告 reading passage

Follow `READING_SYSTEM` with `SCENES.work`. Choose the kind: `conversation` (2-3 coworkers, `KIND_TASKS.conversation`)
or `news` for a written report such as a Slack 進捗報告 or a release note (`KIND_TASKS.news`, formal written style).
Alternate with the most recent work passage.

Situations for a front-end engineer: 進捗報告, レビュー依頼, 仕様確認, リリース相談, 障害報告, 見積もりの相談, デザインとの調整, 引き継ぎ.
Pick one not in the recent topics (or the `@hint`).

Everything is fictional and generic: invented people (common surnames), invented product and company names (e.g. 社内の予約アプリ),
generic tech (React, API, CI, ステージング環境). Never use the user's real company, team, product, or client names,
even if you know them from memory or other files.

No `sourceUrl`.

### drill (slots `drill-1`, `drill-2`) — 會話 scenarios

1. How many: 2, unless a prepared drill (`source: "claude-daily"`) from an earlier day is still unopened (`openedAt: null`); then 1,
   so unused drills do not pile up.
2. Kind, one drill at a time, as `pickKind` does: among drills created in the last 7 days (counting the ones you just made),
   if the share of `work` is below 4/7, make `work`, else `life`. No drills in the last 7 days: `work`.
3. Theme: as `startPractice` does, pick from `THEMES[kind]` one not used by recent drills of that kind, keeping at least 3 candidates.
   Prefer the report-style work themes (進捗報告, 仕様確認, コードレビュー依頼, リリース日の相談) when available.
   With `@hint`, you may use the hint as the theme.
4. Write a `PracticeScenario` following `SYSTEM`, `PRACTICE_RULES` and `SCENARIO_TASK`, with the kind, the theme,
   and the recent titles as the app's input does. End with the other person's line; never a model answer.
   Work scenes use the same fictional-company rule as above.

## 6. Save

One request per item. Send the JSON through a quoted heredoc so nothing in it is expanded.

```bash
curl -sS -w '\nHTTP %{http_code}\n' -X POST "$APP_URL/api/reading/prepared" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  --data-binary @- <<'DAILY_JSON'
{"date": "<YYYY-MM-DD>", "slot": "news", "source": "claude-daily", "kind": "news", "sourceUrl": "<article URL>", "draft": { ...PassageDraft... }}
DAILY_JSON
```

```bash
curl -sS -w '\nHTTP %{http_code}\n' -X POST "$APP_URL/api/practice/prepared" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  --data-binary @- <<'DAILY_JSON'
{"date": "<YYYY-MM-DD>", "slot": "drill-1", "source": "claude-daily", "kind": "<work|life>", "theme": "<theme>", "scenario": { ...PracticeScenario... }}
DAILY_JSON
```

- `201`: saved. `200`: this slot was already saved for the date; the response holds the existing item, and nothing changed.
- `400` lists the invalid fields: fix them and send once more.

## 7. Report

Reply in Traditional Chinese (Taiwan), short:
- each item: slot, title, kind, and the topic or goal; for passages, the tricky words with readings; for news, the source link
- items skipped because they already existed, and anything that failed
- where to find them: 練習 → 讀音 / 會話, marked 今日
