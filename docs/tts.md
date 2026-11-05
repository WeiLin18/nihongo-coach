# Text-to-speech: why Azure, and how readings are pinned

Decision record for the 🔊 audio, from the spike on 2026-11-05 that led to v0.4.0 ([#4](https://github.com/WeiLin18/nihongo-coach/pull/4)).

**Decision:** Azure Speech (`ja-JP-NanamiNeural`, Free F0, Japan East), with the reading and the Kanjium accent pinned in SSML. Gemini TTS was tried first and dropped.

## The problem that decided it: readings

Text-to-speech has to guess the reading from plain text, and it often guesses wrong for a lone kanji. We checked by transcribing the output with `gpt-4o-transcribe`:

| Text | Azure, plain text | Gemini 3.8 Flash, plain text | Azure, reading pinned |
| --- | --- | --- | --- |
| 端 | たん | たん | はし |
| 命 | めい / み | – | いのち |
| 重複 | じゅうふく | – | ちょうふく |
| 貼付 | げんぷ | – | ちょうふ |

For a reading-practice app a wrong reading is worse than a wrong accent. Azure can pin the reading in SSML. Gemini has no way to do that: it reads the `text` field as a verbatim transcript.

## Comparison

| | Azure Nanami | Gemini 3.8 Flash TTS |
| --- | --- | --- |
| Latency per word | about 170 ms | 4–9 s, up to 17 s (free tier) |
| Free tier | 500k characters a month | 10 requests a day and 3 a minute, per model |
| Price after the free tier | pay-as-you-go S0 | $9 per 1M audio tokens until 2026-12-31, then $18. Audio is 25 tokens a second, so about $0.0003 a word |
| Pin the reading | yes, `<phoneme>` or `<sub>` | no |
| Pin the accent | partly, see below | no. A style prompt asking for 標準語アクセント made no difference |
| Output | mp3 (`audio-24khz-48kbitrate-mono-mp3`) | WAV, 24 kHz mono 16-bit (unary). iOS Safari plays it, but it is about 48 KB a second |

Gemini API notes, in case it is tried again: `POST https://generativelanguage.googleapis.com/v1beta/interactions` with header `x-goog-api-key`. The text goes in `input[].content[]`. The style goes in a `speech_metadata` annotation on that text item. The voice goes in `generation_config.speech_config: [{ voice }]`. Ask for WAV with `response_format: { type: 'audio', mime_type: 'audio/wav' }`; the audio comes back base64 in `steps[].content[].data`. The older `gemini-3.1-flash-tts-preview` and `gemini-2.5-flash-preview-tts` reject both `mime_type` and `speech_metadata`.

## Pinning reading and accent in Azure

`worker/lib/tts.ts` builds the SSML:

- **A single word with `reading`:** the server looks up the accent in the `accents` table and sends `<phoneme alphabet="sapi" ph="オ'カシ">お菓子</phoneme>`. The phonemes are katakana, with `'` placed before the accented mora; no mark means 平板. This was verified by shifting the mark: `オ'カシ` gives 中高 [2], and `オカ'シ` moves the fall one mora later. When a word has no dictionary entry, the server sends `<sub alias="reading">` instead.
- **A sentence with `parts`:** each token that has a kana reading becomes `<sub alias="…">`. Azure chooses the phrase accent itself.
- **Known gap:** a `'` before the first mora (頭高) is not always honoured. 命 (いのち [1]) still sounds rising. The card's dictionary pitch line stays the reference.

## Measuring accent: how far the numbers go

The spike ran every voice through the app's own F0 analysis (`src/lib/pitch.ts`) and compared the result with Kanjium. It used 23 words that cover heiban, atamadaka, nakadaka and odaka, including the minimal pairs 箸/橋/端 and 雨/飴, plus 10 of them followed by が.

| Voice | Match | Unreliable |
| --- | --- | --- |
| macOS Kyoko (baseline, words read as a list) | 22/33 | 0 |
| Gemini 3.8 Flash-Lite, list | 17/33 | 2 |
| Gemini 3.8 Flash-Lite with a 標準語 style prompt, list | 17/33 | 3 |
| Gemini 3.1 Flash preview, list | 16/33 | 5 |
| Gemini 3.8 Flash, one word per request (stopped by the quota) | 7/11 | 3 |
| Azure Nanami, one word per request | 16/33 | 6 |
| Azure Nanami with the reading and accent pinned | 16–18/33 | 4–5 |

Treat these as rough. The analyser was built for the user's own recordings. Natural neural voices often put the pitch peak in the mora after the accent, so the analyser tends to report a 頭高 word as "no fall". Reading the words as a list adds phrase-final lowering, which makes some 平板 words look like they fall. The male voice (Keita) was mostly too breathy for the analyser to track. In the end the choice rested on readings, latency and quota, and on listening, not on these numbers.

## Caching

`synthesize()` hashes the SSML and caches the mp3 in R2 when the `AUDIO` binding exists, and in the Workers Cache API otherwise. A repeated identical request on production (`*.workers.dev`) took 0.08 s, against 1.3 s for the first one, so the Cache API does work there. It is still per data centre and can be evicted; bind R2 if a durable cache is ever needed.
