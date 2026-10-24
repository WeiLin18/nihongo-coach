const escapeXml = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!)

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// The R2 cache binding is optional (R2 must be enabled on the account first).
type TtsEnv = Pick<Env, 'AZURE_SPEECH_KEY' | 'AZURE_SPEECH_REGION' | 'AZURE_SPEECH_VOICE'> & { AUDIO?: R2Bucket }

// Azure neural voices follow standard (Tokyo) pitch accent far more reliably than
// browser speechSynthesis. Audio is cached in R2, when bound, so each phrase is synthesized once.
export async function synthesize(env: TtsEnv, text: string): Promise<ArrayBuffer> {
  const voice = env.AZURE_SPEECH_VOICE
  const key = `tts/${voice}/${await sha256(text)}.mp3`
  const cached = await env.AUDIO?.get(key)
  if (cached) return cached.arrayBuffer()

  const ssml = `<speak version="1.0" xml:lang="ja-JP"><voice name="${voice}">${escapeXml(text)}</voice></speak>`
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
  await env.AUDIO?.put(key, audio, { httpMetadata: { contentType: 'audio/mpeg' } })
  return audio
}
