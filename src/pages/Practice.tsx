import { stripRuby } from '@shared/format'
import { PRACTICE_KIND_LABELS, type PracticeKind, type PracticeReply, type PracticeSession, type PracticeTurn } from '@shared/schema'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Ruby } from '../components/Ruby'
import { SpeakButton } from '../components/SpeakButton'
import { TodayBadge } from '../components/TodayBadge'
import { api, type DeepPartial, type PracticeSummary } from '../lib/api'
import { localDate, shortDate, todayQueue } from '../lib/date'
import { useRecorder } from '../lib/useRecorder'

const VERDICTS = {
  natural: { label: '✓ 很自然', className: 'bg-emerald-50 text-emerald-700' },
  minor: { label: '小修正', className: 'bg-amber-50 text-amber-700' },
  unnatural: { label: '不太自然', className: 'bg-rose-50 text-rose-700' },
}

type Partner = { ja?: string; zh?: string } | null | undefined

function PartnerBubble({ line, done }: { line: Partner; done: boolean }) {
  const [showZh, setShowZh] = useState(false)
  if (!line?.ja) return null
  return (
    <div className="flex items-start gap-2">
      <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-gray-100 px-4 py-2 text-lg leading-loose">
        <Ruby text={line.ja} />
        {showZh && line.zh && <p className="text-sm leading-normal text-gray-500">{line.zh}</p>}
      </div>
      {done && (
        <div className="flex flex-col gap-1">
          <SpeakButton text={stripRuby(line.ja)} />
          {line.zh && (
            <button onClick={() => setShowZh((v) => !v)} className="rounded-full bg-gray-100 px-2 py-1 text-xs">
              中
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Feedback({ reply, turn, onSaved }: { reply: DeepPartial<PracticeReply>; turn?: PracticeTurn; onSaved: (cardId: string) => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const verdict = reply.verdict && VERDICTS[reply.verdict]
  if (!verdict) return null

  async function save() {
    if (!turn) return
    setSaving(true)
    setError('')
    try {
      onSaved((await api.saveTurnCard(turn.id)).id)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="ml-auto max-w-[92%] space-y-2 rounded-xl border border-dashed p-3 text-sm">
      <span className={`rounded px-2 py-0.5 text-xs ${verdict.className}`}>{verdict.label}</span>
      {reply.verdict !== 'natural' && reply.natural && (
        <div className="flex items-start gap-2">
          <p className="text-base leading-loose">
            <Ruby text={reply.natural} />
          </p>
          {turn && <SpeakButton text={stripRuby(reply.natural)} />}
        </div>
      )}
      {reply.explanation && <p className="text-gray-600">{reply.explanation}</p>}
      {turn &&
        reply.verdict !== 'natural' &&
        (turn.cardId ? (
          <Link to={`/cards/${turn.cardId}`} className="inline-block text-xs text-rose-600 underline">
            已存成卡片 →
          </Link>
        ) : (
          <button onClick={save} disabled={saving} className="rounded-full bg-gray-900 px-3 py-1 text-xs text-white disabled:opacity-40">
            {saving ? '製作卡片中…' : '＋ 存成卡片'}
          </button>
        ))}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  )
}

export function Practice() {
  const [params, setParams] = useSearchParams()
  const id = params.get('id')
  const [kind, setKind] = useState<PracticeKind | undefined>(undefined)
  const [loaded, setSession] = useState<PracticeSession | null>(null)
  const session = id && loaded?.id === id ? loaded : null
  const [draftScene, setDraftScene] = useState<DeepPartial<PracticeSession['scenario']> | null>(null)
  const [pending, setPending] = useState<{ text: string; reply: DeepPartial<PracticeReply> } | null>(null)
  const [recent, setRecent] = useState<PracticeSummary[]>([])
  // The list holds today's queue, so 開始 waits for it on the start screen.
  const [listed, setListed] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState<'starting' | 'listening' | 'thinking' | null>(null)
  const [error, setError] = useState('')

  // Load the session in the URL (e.g. from the recent list or after a reload).
  useEffect(() => {
    if (!id)
      api
        .practiceList()
        .then(setRecent, () => {})
        .finally(() => setListed(true))
    else if (loaded?.id !== id) api.practice(id).then(setSession, (e: Error) => setError(e.message))
  }, [id, loaded?.id])

  // Drills prepared for today come first; 開始 opens the first one of the chosen kind.
  const queue = todayQueue(recent)
  const next = queue.find((r) => !kind || r.kind === kind)
  const older = recent.filter((r) => !queue.includes(r))

  async function start() {
    if (next) {
      // Opening it marks it used on the server; drop it here too so 換一題 moves on.
      setRecent((list) => list.map((r) => (r.id === next.id ? { ...r, openedAt: new Date().toISOString() } : r)))
      setError('')
      setParams({ id: next.id })
      return
    }
    setBusy('starting')
    setError('')
    setParams({})
    setDraftScene({})
    try {
      const s = await api.startPractice(kind, setDraftScene)
      setSession(s)
      setParams({ id: s.id })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setDraftScene(null)
      setBusy(null)
    }
  }

  async function send(input = text) {
    if (!session || !input.trim()) return
    setBusy('thinking')
    setError('')
    setPending({ text: input, reply: {} })
    try {
      const { turn, done } = await api.replyPractice(session.id, input, (reply) => setPending({ text: input, reply }))
      setSession((s) => s && { ...s, done, turns: [...s.turns, turn] })
      setText('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPending(null)
      setBusy(null)
    }
  }

  const recorder = useRecorder(async (audio) => {
    setBusy('listening')
    try {
      const heard = await api.transcribe(audio)
      setText(heard)
      await send(heard)
    } catch (e) {
      setError((e as Error).message)
      setBusy(null)
    }
  })

  const markSaved = (turnId: string) => (cardId: string) =>
    setSession((s) => s && { ...s, turns: s.turns.map((t) => (t.id === turnId ? { ...t, cardId } : t)) })

  // Follow the conversation as replies stream in.
  const end = useRef<HTMLDivElement>(null)
  const turnCount = session?.turns.length
  useEffect(() => {
    if (pending || turnCount) end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [pending, turnCount])

  const scene = session?.scenario ?? draftScene
  const wrapUp = session?.turns.at(-1)?.reply.wrapUp

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="grid flex-1 grid-cols-3 gap-1 rounded-lg bg-gray-100 p-1">
          {([undefined, 'work', 'life'] as const).map((k) => (
            <button
              key={k ?? 'auto'}
              onClick={() => setKind(k)}
              className={`rounded-md py-2 text-sm ${kind === k ? 'bg-raised font-semibold shadow' : 'text-gray-500'}`}
            >
              {k ? PRACTICE_KIND_LABELS[k] : '隨機'}
            </button>
          ))}
        </div>
        <button onClick={start} disabled={busy !== null || (!id && !listed)} className="h-11 rounded-lg bg-rose-500 px-4 text-sm text-white disabled:opacity-40">
          {busy === 'starting' ? '出題中…' : session ? '換一題' : '開始'}
        </button>
      </div>

      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {scene && (
        <section className="space-y-1 rounded-xl bg-rose-50/60 p-4 text-sm">
          <div className="flex items-center gap-2">
            {session?.preparedFor === localDate() && <TodayBadge />}
            {session && <span className="rounded bg-raised px-2 py-0.5 text-xs text-rose-700">{PRACTICE_KIND_LABELS[session.kind]}</span>}
            <h2 className="text-base font-semibold">{scene.title}</h2>
          </div>
          <p>{scene.situation}</p>
          {scene.userRole && <p className="text-gray-600">你：{scene.userRole}</p>}
          {scene.partnerRole && <p className="text-gray-600">對方：{scene.partnerRole}</p>}
          {scene.goal && <p className="text-gray-600">目標：{scene.goal}</p>}
        </section>
      )}

      {scene && (
        <div className="space-y-3">
          <PartnerBubble line={scene.partner} done={!!session} />
          {session?.turns.map((t) => (
            <div key={t.id} className="space-y-3">
              <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-tr-sm bg-rose-500 px-4 py-2 text-white">{t.text}</p>
              <Feedback reply={t.reply} turn={t} onSaved={markSaved(t.id)} />
              <PartnerBubble line={t.reply.partner} done />
            </div>
          ))}
          {pending && (
            <div className="space-y-3">
              <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-tr-sm bg-rose-500 px-4 py-2 text-white">{pending.text}</p>
              <Feedback reply={pending.reply} onSaved={() => {}} />
              <PartnerBubble line={pending.reply.partner} done={false} />
              <p className="animate-pulse text-xs text-gray-400">思考中…</p>
            </div>
          )}
          {!session && <p className="animate-pulse text-xs text-gray-400">出題中…</p>}
          <div ref={end} />
        </div>
      )}

      {session?.done && (
        <section className="space-y-3 rounded-xl border p-4 text-sm">
          <h3 className="font-semibold">練習結束</h3>
          {wrapUp && <p className="whitespace-pre-wrap leading-relaxed">{wrapUp}</p>}
          <button onClick={start} disabled={busy !== null} className="w-full rounded-lg bg-gray-900 py-2 text-white disabled:opacity-40">
            再練一題
          </button>
        </section>
      )}

      {session && !session.done && (
        // Sits right above the bottom nav (py-3 + text-sm + border ≈ 2.8rem).
        <div className="sticky bottom-[calc(2.8rem+env(safe-area-inset-bottom))] space-y-2 bg-page pt-2 pb-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="用日文回答…（不會先給範例）"
            rows={2}
            className="w-full rounded-lg border p-3 text-base"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={recorder.toggle}
              disabled={busy !== null && !recorder.recording}
              aria-label={recorder.recording ? '停止錄音' : '開始錄音'}
              className={`h-12 w-12 shrink-0 rounded-full text-xl text-white shadow active:scale-95 disabled:opacity-40 ${
                recorder.recording ? 'animate-pulse bg-red-600' : 'bg-rose-500'
              }`}
            >
              {recorder.recording ? '■' : '🎤'}
            </button>
            <button
              onClick={() => send()}
              disabled={busy !== null || !text.trim()}
              className="h-12 flex-1 rounded-lg bg-gray-900 text-white disabled:opacity-40"
            >
              {busy === 'listening' ? '聽寫中…' : busy === 'thinking' ? '思考中…' : '送出'}
            </button>
          </div>
        </div>
      )}

      {!id && !scene && queue.length > 0 && (
        <section className="space-y-2">
          {queue.map((r) => (
            <Link key={r.id} to={`/practice?id=${r.id}`} className="block rounded-xl bg-rose-50/60 p-3 active:bg-rose-100">
              <span className="flex items-center gap-2">
                <TodayBadge />
                <span className="rounded bg-raised px-1.5 py-0.5 text-xs text-rose-700">{PRACTICE_KIND_LABELS[r.kind]}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">{r.scenario.title}</span>
              </span>
              <span className="mt-1 block text-sm text-gray-600">{r.scenario.goal}</span>
            </Link>
          ))}
        </section>
      )}

      {!id && !scene && (
        <section className="space-y-2">
          <p className="text-sm text-gray-500">
            {next
              ? `今天準備好的練習還有 ${queue.length} 題，按開始從${PRACTICE_KIND_LABELS[next.kind]}場景練起；用完後改回即時出題。`
              : '每次一個工作或生活場景，3–4 來回，用日文回答後幫你改成自然的說法。'}
          </p>
          {older.length > 0 && <h3 className="pt-2 text-sm font-semibold text-gray-500">最近的練習</h3>}
          {older.map((r) => (
            <Link key={r.id} to={`/practice?id=${r.id}`} className="flex items-center gap-2 border-b py-2 text-sm">
              <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">{PRACTICE_KIND_LABELS[r.kind]}</span>
              <span className="flex-1 truncate">{r.scenario.title}</span>
              <span className="text-xs text-gray-400">{r.done ? shortDate(r.createdAt) : '進行中'}</span>
            </Link>
          ))}
        </section>
      )}
    </div>
  )
}
