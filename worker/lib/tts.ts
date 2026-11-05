import { splitMorae, toHiragana } from '../../shared/kana'
import { KANA, type TtsRequest } from '../../shared/schema'
import { lookupAccents } from './accent'

const escapeXml = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!)

const toKatakana = (s: string) => s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// The R2 cache binding is optional (R2 must be enabled on the account first).
type TtsEnv = Pick<Env, 'AZURE_SPEECH_KEY' | 'AZURE_SPEECH_REGION' | 'AZURE_SPEECH_VOICE' | 'DB'> & { AUDIO?: R2Bucket }

// Azure's ja-JP "sapi" phone set is katakana with ' before the accented mora (オ'カシ = 中高 [2]);
// no mark is 平板. Verified by ear and F0 in the 2026-11 spike; 頭高 marks are honoured less reliably.
export function accentPhonemes(reading: string, nucleus: number): string {
  const morae = splitMorae(toKatakana(toHiragana(reading)))
  if (nucleus <= 0 || nucleus > morae.length) return morae.join('')
  return [...morae.slice(0, nucleus - 1), "'", ...morae.slice(nucleus - 1)].join('')
}

// Plain text lets Azure guess readings, and a lone kanji is often guessed wrong (端 → たん).
// A word with a reading gets reading and dictionary accent pinned; sentence parts get readings pinned.
export async function buildSsml(env: Pick<TtsEnv, 'DB' | 'AZURE_SPEECH_VOICE'>, req: TtsRequest): Promise<string> {
  let body: string
  if (req.reading) {
    const [w] = await lookupAccents(env.DB, [{ surface: req.text, reading: req.reading }])
    body = w.accents?.length
      ? `<phoneme alphabet="sapi" ph="${accentPhonemes(w.reading, w.accents[0])}">${escapeXml(req.text)}</phoneme>`
      : `<sub alias="${escapeXml(req.reading)}">${escapeXml(req.text)}</sub>`
  } else if (req.parts?.length) {
    body = req.parts
      .map((p) => (KANA.test(p.reading) ? `<sub alias="${escapeXml(p.reading)}">${escapeXml(p.text)}</sub>` : escapeXml(p.text)))
      .join('')
  } else {
    body = escapeXml(req.text)
  }
  return `<speak version="1.0" xml:lang="ja-JP"><voice name="${env.AZURE_SPEECH_VOICE}">${body}</voice></speak>`
}

// Each distinct SSML is synthesized once: kept in R2 when bound, otherwise in the Workers
// Cache API (per data centre, can be evicted; works on workers.dev too).
export async function synthesize(env: TtsEnv, req: TtsRequest): Promise<ArrayBuffer> {
  const ssml = await buildSsml(env, req)
  const key = `tts/v2/${await sha256(ssml)}.mp3`
  const cacheUrl = `https://tts-cache.invalid/${key}`
  const cache = env.AUDIO ? null : await caches.open('tts')

  const hit = env.AUDIO ? await env.AUDIO.get(key) : await cache!.match(cacheUrl)
  if (hit) return hit.arrayBuffer()

  const res = await fetch(`https://${env.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': env.AZURE_SPEECH_KEY,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent': 'nihongo-coach',
    },
    body: ssml,
  })
  if (!res.ok) throw new Error(`Azure TTS failed: ${res.status} ${await res.text()}`)
  const audio = await res.arrayBuffer()
  if (env.AUDIO) await env.AUDIO.put(key, audio, { httpMetadata: { contentType: 'audio/mpeg' } })
  else
    await cache!.put(
      cacheUrl,
      new Response(audio, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=31536000' } }),
    )
  return audio
}
