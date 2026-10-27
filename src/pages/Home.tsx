import { MODE_LABELS, MODES, type Card, type Mode } from '@shared/schema'
import { useState } from 'react'
import { CardView } from '../components/CardView'
import { api } from '../lib/api'
import { useRecorder } from '../lib/useRecorder'

const PLACEHOLDERS: Record<Mode, string> = {
  lookup: '貼上看不懂的日文單字、文法或句子',
  zh2ja: '用中文說你想表達的話，例如：瀏海剪短一點但不要太短',
  naturalize: '輸入你講的日文，看自然的說法',
}

export function Home() {
  const [mode, setMode] = useState<Mode>('zh2ja')
  const [text, setText] = useState('')
  const [context, setContext] = useState('')
  const [busy, setBusy] = useState<'listening' | 'thinking' | null>(null)
  const [card, setCard] = useState<Partial<Card> | null>(null)
  const [error, setError] = useState('')

  async function run(input = text) {
    if (!input.trim()) return
    setBusy('thinking')
    setError('')
    try {
      setCard(null)
      setCard(await api.askStream({ mode, text: input, context: context || undefined, source: 'web' }, setCard))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const recorder = useRecorder(async (audio) => {
    setBusy('listening')
    try {
      const heard = await api.transcribe(audio)
      setText(heard)
      await run(heard)
    } catch (e) {
      setError((e as Error).message)
      setBusy(null)
    }
  })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-gray-100 p-1">
        {MODES.map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-md py-2 text-sm ${mode === m ? 'bg-white font-semibold shadow' : 'text-gray-500'}`}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={PLACEHOLDERS[mode]}
        rows={3}
        className="w-full rounded-lg border p-3 text-base"
      />
      <input
        value={context}
        onChange={(e) => setContext(e.target.value)}
        placeholder="情境（選填）：例如 在沙龍跟設計師說"
        className="w-full rounded-lg border p-2 text-sm"
      />

      <div className="flex items-center gap-3">
        <button
          onClick={recorder.toggle}
          disabled={busy !== null && !recorder.recording}
          aria-label={recorder.recording ? '停止錄音' : '開始錄音'}
          className={`h-16 w-16 shrink-0 rounded-full text-2xl text-white shadow-lg active:scale-95 disabled:opacity-40 ${
            recorder.recording ? 'animate-pulse bg-red-600' : 'bg-rose-500'
          }`}
        >
          {recorder.recording ? '■' : '🎤'}
        </button>
        <button
          onClick={() => run()}
          disabled={busy !== null || !text.trim()}
          className="h-12 flex-1 rounded-lg bg-gray-900 text-white disabled:opacity-40"
        >
          {busy === 'listening' ? '聽寫中…' : busy === 'thinking' ? '思考中…' : '送出'}
        </button>
      </div>

      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {card && (
        <div className="rounded-xl border p-4">
          <CardView card={card} />
        </div>
      )}
    </div>
  )
}
