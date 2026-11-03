import type {
  AskRequest,
  Card,
  PracticeKind,
  PracticeReply,
  PracticeScenario,
  PracticeSession,
  PracticeTurn,
} from '@shared/schema'
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
  askStream: (req: AskRequest, onPartial: (card: Partial<Card>) => void): Promise<Card> =>
    stream('/ask?stream=1', req, 'card', onPartial),
  deleteCard: async (id: string) => {
    await request(`/cards/${id}`, { method: 'DELETE' })
  },
  transcribe: async (audio: Blob): Promise<string> => {
    const form = new FormData()
    form.append('audio', audio, `speech.${audio.type.includes('mp4') ? 'mp4' : 'webm'}`)
    return (await (await request('/transcribe', { method: 'POST', body: form })).json()).text
  },
  tts: async (text: string): Promise<Blob> => (await request('/tts', json({ text }))).blob(),

  practiceList: async (): Promise<PracticeSummary[]> => (await request('/practice')).json(),
  practice: async (id: string): Promise<PracticeSession> => (await request(`/practice/${id}`)).json(),
  startPractice: (kind: PracticeKind | undefined, onPartial: (s: DeepPartial<PracticeScenario>) => void): Promise<PracticeSession> =>
    stream('/practice', { kind }, 'session', onPartial),
  replyPractice: (
    id: string,
    text: string,
    onPartial: (r: DeepPartial<PracticeReply>) => void,
  ): Promise<{ turn: PracticeTurn; done: boolean }> => stream(`/practice/${id}/turns`, { text }, 'turn', onPartial),
  saveTurnCard: async (turnId: string): Promise<Card> =>
    (await request(`/practice/turns/${turnId}/card`, { method: 'POST' })).json(),
}

export type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T

export type PracticeSummary = Pick<PracticeSession, 'id' | 'kind' | 'scenario' | 'done' | 'createdAt'>

// Reads a streamJob response (worker/index.ts): onPartial gets the half-written JSON each time
// more arrives; resolves with the data of the final `event`.
async function stream<P, T>(path: string, body: unknown, event: string, onPartial: (partial: P) => void): Promise<T> {
  const res = await request(path, json(body))
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
      const name = /^event: (.*)$/m.exec(block)?.[1]
      const data = JSON.parse(/^data: (.*)$/m.exec(block)?.[1] ?? 'null')
      if (name === 'delta') {
        text += data
        try {
          onPartial(parsePartialJson(text))
        } catch {
          // not parseable yet; wait for more text
        }
      } else if (name === event) return data
      else if (name === 'error') throw new Error(data)
    }
  }
  throw new Error('連線中斷，請再試一次')
}
