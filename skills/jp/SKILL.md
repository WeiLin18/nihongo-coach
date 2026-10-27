---
name: jp
description: Japanese speaking coach that saves a card to the user's Nihongo Coach app. Use when the user types /jp, or asks how to say something in Japanese, what a Japanese word or grammar means, or whether their Japanese sounds natural.
argument-hint: "[查|說|改] <text> [@情境]"
allowed-tools: Read, Bash(curl:*), Bash(grep:*), Bash(realpath:*)
---

# /jp — Nihongo Coach card

Make the same card the Nihongo Coach app makes, using this session instead of the app's API,
and save it to the app so it shows up on the phone.

The project folder is two levels above this skill's real location (`skills/jp` inside the repo,
usually linked into `~/.claude/skills/jp`). Find it once per session:

```bash
realpath "<this skill's base directory>/../.."
```

The deployed app URL and token live in the project's `.prod.vars` (`APP_URL`, `APP_TOKEN`); see `.prod.vars.example`.

## 1. Pick the mode

From `$ARGUMENTS`:
- Starts with `查` → `lookup`; `說` → `zh2ja`; `改` → `naturalize`. Strip the prefix.
- No prefix: mostly Chinese → `zh2ja`; a Japanese word, phrase, or grammar pattern → `lookup`;
  a full Japanese sentence the user wrote → `naturalize`.
- Text after `@` is the situation (context), e.g. `改 この件について確認してから返事します @會議中回答部長`.

If nothing was given, ask what they want to look up or say.

## 2. Write the draft

Read these two files in the project folder once per session and follow them exactly — they are the app's own prompt and schema:
- `worker/lib/ai.ts`: the `SYSTEM` rules and `TASKS[mode]`
- `shared/schema.ts`: the `CardDraft` fields, `CATEGORIES`, and limits (2–3 examples, dictionary-form `words`)

Do not add pitch-accent marks; the server fills accents from its dictionary.

## 3. Save it

Send one request. Read the URL and token from `.prod.vars` inside the command; never print the token.

```bash
REPO='<project folder>'
APP_URL=$(grep '^APP_URL=' "$REPO/.prod.vars" | cut -d= -f2-)
TOKEN=$(grep '^APP_TOKEN=' "$REPO/.prod.vars" | cut -d= -f2-)
curl -sS -X POST "$APP_URL/api/cards?format=text" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  --data-binary @- <<'CARD_JSON'
{"mode": "<mode>", "input": "<the user's original text>", "source": "claude-code", "draft": { ...CardDraft... }}
CARD_JSON
```

- Success returns the card as plain text: show it to the user as is.
- `400` lists the invalid fields: fix them and send once more.
- `401`: the token in `.prod.vars` no longer matches the deployed one; tell the user.
- `APP_URL` missing: ask the user to add their app URL to `.prod.vars`.
