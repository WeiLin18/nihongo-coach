import { api, ApiError } from './api'

// One shared player for every 🔊 button: starting a phrase stops whatever is playing,
// so utterances never pile up in the speechSynthesis queue.

export type Engine = 'server' | 'browser'

const cache = new Map<string, string>()

// /api/tts answers 501 when Azure is not configured. Remember that, so later taps skip the
// request and call speechSynthesis synchronously inside the tap (iOS needs the user gesture).
// Expires after a day in case TTS gets configured later.
const SERVER_OFF_KEY = 'nihongo-coach-tts-off'
const SERVER_OFF_TTL = 24 * 60 * 60 * 1000

function readServerOff(): boolean {
  try {
    return Date.now() - Number(localStorage.getItem(SERVER_OFF_KEY) ?? 0) < SERVER_OFF_TTL
  } catch {
    return false
  }
}

let serverOff = readServerOff()

function rememberServerOff() {
  serverOff = true
  try {
    localStorage.setItem(SERVER_OFF_KEY, String(Date.now()))
  } catch {
    // private mode: remembered for this page load only
  }
}

let seq = 0 // bumped on every start/stop, so a slow /api/tts response can't play after a newer tap
let audio: HTMLAudioElement | null = null
// Held until it ends: iOS can garbage-collect an unreferenced utterance and never fire onend.
let utterance: SpeechSynthesisUtterance | null = null
let owner: string | null = null
const listeners = new Set<() => void>()

function setOwner(next: string | null) {
  if (owner === next) return
  owner = next
  listeners.forEach((l) => l())
}

export function subscribeSpeaking(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Which button (by id) is playing now, or null.
export const speakingOwner = () => owner

export function stopSpeaking() {
  seq++
  if (audio) {
    audio.onended = audio.onerror = null
    audio.pause()
    audio = null
  }
  if (utterance) {
    utterance.onend = utterance.onerror = null
    utterance = null
  }
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
  setOwner(null)
}

function speakBrowser(text: string): Engine | null {
  if (typeof speechSynthesis === 'undefined') {
    setOwner(null)
    return null
  }
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'ja-JP'
  u.onend = u.onerror = () => {
    if (utterance !== u) return
    utterance = null
    setOwner(null)
  }
  utterance = u
  speechSynthesis.speak(u)
  return 'browser'
}

// Prefer server TTS (correct pitch accent); fall back to the browser voice.
// Resolves with the engine used, or null when a newer tap or stopSpeaking() superseded it.
export async function speak(text: string, id: string): Promise<Engine | null> {
  stopSpeaking()
  const mine = seq
  setOwner(id)
  if (serverOff) return speakBrowser(text)

  try {
    let url = cache.get(text)
    if (!url) {
      url = URL.createObjectURL(await api.tts(text))
      cache.set(text, url)
    }
    if (mine !== seq) return null
    const a = new Audio(url)
    a.onended = a.onerror = () => {
      if (audio !== a) return
      audio = null
      setOwner(null)
    }
    audio = a
    await a.play()
    return 'server'
  } catch (e) {
    if (mine !== seq) return null
    if (e instanceof ApiError && e.status === 501) rememberServerOff()
    if (audio) {
      audio.onended = audio.onerror = null
      audio = null
    }
    return speakBrowser(text)
  }
}

// Leaving the page (closing the tab, switching apps) stops playback.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', stopSpeaking)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') stopSpeaking()
  })
}
