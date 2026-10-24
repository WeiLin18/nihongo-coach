import type { AskRequest, Card } from '@shared/schema'

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
  cards: async (params: { category?: string; q?: string } = {}): Promise<Card[]> => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][])
    return (await request(`/cards?${qs}`)).json()
  },
  card: async (id: string): Promise<Card> => (await request(`/cards/${id}`)).json(),
  deleteCard: async (id: string) => {
    await request(`/cards/${id}`, { method: 'DELETE' })
  },
  transcribe: async (audio: Blob): Promise<string> => {
    const form = new FormData()
    form.append('audio', audio, `speech.${audio.type.includes('mp4') ? 'mp4' : 'webm'}`)
    return (await (await request('/transcribe', { method: 'POST', body: form })).json()).text
  },
  tts: async (text: string): Promise<Blob> => (await request('/tts', json({ text }))).blob(),
}
