# What it costs to run

Checked on 2026-11-05 for one person using the app every day. Each number is marked:

- **measured**: read from a dashboard, an API or a real request
- **estimated**: worked out from measured token counts and the official price list

Prices change. Check the linked pages before you rely on a number here.

## Summary

| Service | Used for | Last 30 days | Free allowance, and what happens past it | Spending cap |
|---|---|---|---|---|
| OpenAI | Cards, drills, reading passages, voice input | $2.16, 159 requests (measured) | None. Prepaid credits; requests fail when credits run out | Set a hard spend limit on the organization or project (see below) |
| Azure Speech | 🔊 audio (`/api/tts`) | $0 on the F0 tier | F0: 0.5M characters a month. S0: $15 per 1M characters (japaneast) | F0 is free, so it cannot run up a bill |
| Cloudflare Workers | API and static files | $0. At most about 240 requests a day (measured, sampled) | Free: 100,000 requests a day, 10 ms CPU per request | Free plan has no charges; Paid starts at $5 a month |
| Cloudflare D1 | Cards, sessions, accent dictionary | $0. 10.8 MB; usually under 100 rows written a day (measured) | Free: 5M rows read and 100,000 rows written a day (reset at 00:00 UTC), 500 MB per database | Free plan has no charges |
| GitHub Actions | CI and releases | $0 (measured: public repo, standard runners) | Free for public repos | None needed |

Gemini TTS was tried in a spike, but the deployed app does not call it.

## Cost per action

Measured in one run of each mode on the local dev server, with reasoning set to `none` and no cache hits. The costs are estimated from those token counts and the [OpenAI price list](https://developers.openai.com/api/docs/pricing): gpt-5.5 costs $5 per 1M input tokens and $30 per 1M output tokens; gpt-5.4-mini costs $0.75 and $4.50.

| Action | Model | Input / output tokens (measured) | Cost (estimated) |
|---|---|---|---|
| Lookup (查詢) | gpt-5.4-mini | 794 / 487 | $0.0028 |
| Say it (zh2ja) | gpt-5.5 | 792 / 483 | $0.018 |
| Fix it (naturalize) | gpt-5.5 | 808 / 649 | $0.024 |
| Start a 會話 drill | gpt-5.5 | 809 / 209 | $0.010 |
| One 會話 reply | gpt-5.5 | about 1,270 / 170 | $0.012 |
| One 讀音 passage | gpt-5.5 | 1,045 / 1,930 | $0.063 |
| One minute of voice input | gpt-4o-transcribe | about 600 audio / 270 text | $0.006 (OpenAI's per-minute estimate) |
| One uncached 🔊 clip | Azure Neural TTS | 3–10 characters | $0 on F0; under $0.0002 on S0 |

The reading passage costs the most, because gpt-5.5 writes almost 2,000 output tokens for it.

## Monthly totals (estimated, 30 days)

| Use per day | OpenAI per month |
|---|---|
| Light: 5 lookups, 2 Say it, 2 Fix it, 1 minute of voice | about $3 |
| Typical: 10 lookups, 5 Say it, 5 Fix it, 1 drill with 4 replies, 1 passage, 2 minutes of voice | about $11 |
| Heavy: 30 lookups, 15 Say it, 15 Fix it, 3 drills, 3 passages, 10 minutes of voice | about $34 |

Real use so far is lower than the typical row: $2.16 in the last 30 days (measured).

## Limits

**OpenAI** ([rate limits](https://developers.openai.com/api/docs/guides/rate-limits))
- Usage tiers depend on total credit purchases: Free ($100 a month usage limit), Build after $5 ($500), Launch after $100 ($5,000), Grow after $500 ($200,000).
- On Build (measured on the Limits page): gpt-5.5 allows 1M tokens a minute, 5,000 requests a minute and 1.35M tokens a day; gpt-5.4-mini allows 2M tokens a minute; gpt-4o-transcribe allows 100,000 tokens a minute.
- Spend limits can be set on the organization or on a project. A *spend alert* only sends an email. A *hard spend limit* makes requests fail with `429` once it is reached. A limit shown as "not enforced" is only an alert.

**Azure Speech** ([pricing](https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/))
- F0: 0.5M characters of neural TTS a month, free. F0 has no billing, so going past the quota makes requests fail instead of costing money.
- S0: $15 per 1M characters for standard neural voices, with no free allowance.

**Cloudflare** ([Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/))
- Workers Free: 100,000 requests a day and 10 ms CPU per request. Workers Paid: $5 a month, with 10M requests and 30M CPU ms included.
- D1 Free: 5M rows read and 100,000 rows written a day, 500 MB per database, 5 GB per account. The pricing pages do not say what happens past a daily limit; a Free account is not billed for it. A big import (the accent dictionary is about 110,000 rows) can use up a whole day's writes, so run it in parts or on a day you can spare.

**GitHub Actions**: free on standard runners for public repositories.

## Recommendations

1. **Set a hard spend limit in OpenAI**, for example $20 a month, and an alert at about $10. Without one, a leaked `APP_TOKEN` lets anyone call gpt-5.5 at up to 1.35M tokens a day on the Build tier. With prepaid credits and auto-reload, the loss stops only when the credits and the reload allowance run out.
2. **Keep the tokens secret.** The repo is public. `APP_TOKEN` and `MCP_TOKEN` are only in `.dev.vars` and Cloudflare secrets, which git ignores. Rotate them with `npx wrangler secret put` if one is ever shared.
3. **Add a rate limit to `/api/*`** (for example the Workers Rate Limiting binding), so one stolen token cannot send thousands of requests a minute. The Worker has none today.
4. **Keep Azure Speech on F0.** It covers far more 🔊 clips than one person plays, and it cannot be billed.
5. **Cheaper models are optional.** Moving Say it, Fix it and reading passages to gpt-5.4-mini would cut their cost by about 85%. At current use that saves well under $2 a month, so compare the Japanese quality before you switch. The model for each mode is a `wrangler.jsonc` var (`OPENAI_MODEL_*`).
