import type { AskRequest, Card, ReviewQueue, ReviewRating, ReviewStats } from '@shared/schema'
import { parse as parsePartialJson } from 'partial-json'

const TOKEN_KEY = 'nihongo-coach-token'

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

export function setToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // private mode: token lives only for this page load
  }
}

const NEW_PER_DAY_KEY = 'nihongo-coach-new-per-day'

export function getNewPerDay(): number {
  try {
    const n = Number(localStorage.getItem(NEW_PER_DAY_KEY))
    return localStorage.getItem(NEW_PER_DAY_KEY) !== null && Number.isFinite(n) ? n : 20
  } catch {
    return 20
  }
}

export function setNewPerDay(n: number) {
  try {
    localStorage.setItem(NEW_PER_DAY_KEY, String(n))
  } catch {
    // private mode: falls back to the default
  }
}

// "Today" follows this device's clock; the new-card limit is a per-device setting.
const reviewQuery = () => `tz=${-new Date().getTimezoneOffset()}&new=${getNewPerDay()}`

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${getToken()}`, ...init.headers },
  })
  if (res.status === 401) throw new Error('Token 錯誤，請到設定頁重新輸入')
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(typeof body.error === 'string' ? body.error : `請求失敗 (${res.status})`)
  }
  return res
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const api = {
  ask: async (req: AskRequest): Promise<Card> => (await request('/ask', json(req))).json(),
  cards: async (
    params: { category?: string; q?: string; cursor?: string; limit?: string } = {},
  ): Promise<{ cards: Card[]; nextCursor: string | null }> => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][])
    return (await request(`/cards?${qs}`)).json()
  },
  card: async (id: string): Promise<Card> => (await request(`/cards/${id}`)).json(),
  // Streams the card as it is generated: onPartial gets the half-written card each time
  // more JSON arrives; resolves with the saved card (accents filled) at the end.
  askStream: async (req: AskRequest, onPartial: (card: Partial<Card>) => void): Promise<Card> => {
    const res = await request('/ask?stream=1', json(req))
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
    let buffer = ''
    let text = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += value
      let end
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, end)
        buffer = buffer.slice(end + 2)
        const event = /^event: (.*)$/m.exec(block)?.[1]
        const data = JSON.parse(/^data: (.*)$/m.exec(block)?.[1] ?? 'null')
        if (event === 'delta') {
          text += data
          try {
            onPartial(parsePartialJson(text))
          } catch {
            // not parseable yet; wait for more text
          }
        } else if (event === 'card') return data
        else if (event === 'error') throw new Error(data)
      }
    }
    throw new Error('連線中斷，請再試一次')
  },
  deleteCard: async (id: string) => {
    await request(`/cards/${id}`, { method: 'DELETE' })
  },
  transcribe: async (audio: Blob): Promise<string> => {
    const form = new FormData()
    form.append('audio', audio, `speech.${audio.type.includes('mp4') ? 'mp4' : 'webm'}`)
    return (await (await request('/transcribe', { method: 'POST', body: form })).json()).text
  },
  reviewQueue: async (): Promise<ReviewQueue> => (await request(`/review/queue?${reviewQuery()}`)).json(),
  reviewCount: async (): Promise<ReviewStats> => (await request(`/review/count?${reviewQuery()}`)).json(),
  review: async (id: string, rating: ReviewRating): Promise<ReviewStats> =>
    (await request(`/review/${id}?${reviewQuery()}`, json({ rating }))).json(),
  tts: async (text: string): Promise<Blob> => (await request('/tts', json({ text }))).blob(),
}
