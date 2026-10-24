import { api } from './api'

const cache = new Map<string, string>()

// Prefer server TTS (correct pitch accent); fall back to the browser voice.
export async function speak(text: string): Promise<'server' | 'browser'> {
  try {
    let url = cache.get(text)
    if (!url) {
      url = URL.createObjectURL(await api.tts(text))
      cache.set(text, url)
    }
    await new Audio(url).play()
    return 'server'
  } catch {
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'ja-JP'
    speechSynthesis.speak(u)
    return 'browser'
  }
}
