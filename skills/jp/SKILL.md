---
name: jp
description: Japanese speaking coach that saves a card to the user's Nihongo Coach app. Use when the user types /jp, or asks how to say something in Japanese, what a Japanese word or grammar means, or whether their Japanese sounds natural.
argument-hint: "[查|說|改] <text> [@情境]"
allowed-tools: Read, Bash(curl:*), Bash(grep:*)
---

# /jp — Nihongo Coach card

Make the same card the Nihongo Coach app makes, using this session instead of the app's API,
and save it to the app so it shows up on the phone.

Project: `<project folder>`
App: `https://nihongo-coach.<your-subdomain>.workers.dev`

## 1. Pick the mode

From `$ARGUMENTS`:
- Starts with `查` → `lookup`; `說` → `zh2ja`; `改` → `naturalize`. Strip the prefix.
- No prefix: mostly Chinese → `zh2ja`; a Japanese word, phrase, or grammar pattern → `lookup`;
  a full Japanese sentence the user wrote → `naturalize`.
- Text after `@` is the situation (context), e.g. `改 この件について確認してから返事します @會議中回答部長`.

If nothing was given, ask what they want to look up or say.

## 2. Write the draft

Read these two files once per session and follow them exactly — they are the app's own prompt and schema:
- `worker/lib/ai.ts`: the `SYSTEM` rules and `TASKS[mode]`
- `shared/schema.ts`: the `CardDraft` fields, `CATEGORIES`, and limits (2–3 examples, dictionary-form `words`)

Do not add pitch-accent marks; the server fills accents from its dictionary.

## 3. Save it

Send one request. Read the token from the project's `.prod.vars` inside the command; never print it.

```bash
TOKEN=$(grep '^APP_TOKEN=' <project folder>/.prod.vars | cut -d= -f2-)
curl -sS -X POST 'https://nihongo-coach.<your-subdomain>.workers.dev/api/cards?format=text' \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  --data-binary @- <<'CARD_JSON'
{"mode": "<mode>", "input": "<the user's original text>", "source": "claude-code", "draft": { ...CardDraft... }}
CARD_JSON
```

- Success returns the card as plain text: show it to the user as is.
- `400` lists the invalid fields: fix them and send once more.
- `401`: the token in `.prod.vars` no longer matches the deployed one; tell the user.
