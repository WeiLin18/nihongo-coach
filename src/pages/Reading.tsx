import { KIND_LABELS, PASSAGE_KINDS, type Passage, type PassageKind } from '@shared/reading'
import type { Card } from '@shared/schema'
import { Fragment, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api } from '../lib/api'
import { rubyParts } from '../lib/furigana'
import { useRecorder } from '../lib/useRecorder'

type Summary = Awaited<ReturnType<typeof api.passages>>[number]

export function Reading() {
  const { id } = useParams()
  return id ? <PassageView key={id} id={id} /> : <ReadingHome />
}

function ReadingHome() {
  const navigate = useNavigate()
  const [kind, setKind] = useState<PassageKind | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [recent, setRecent] = useState<Summary[]>([])

  useEffect(() => {
    api.passages().then(setRecent, (e: Error) => setError(e.message))
  }, [])

  async function generate() {
    setBusy(true)
    setError('')
    try {
      const passage = await api.newPassage(kind)
      navigate(`/reading/${passage.id}`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">漢字讀音練習</h1>
        <p className="mt-1 text-sm text-gray-500">先不看假名自己唸一遍，再顯示讀音，把唸錯的字存成卡片複習。</p>
      </header>

      <div className="grid grid-cols-3 gap-1 rounded-lg bg-gray-100 p-1">
        {[undefined, ...PASSAGE_KINDS].map((k) => (
          <button
            key={k ?? 'auto'}
            onClick={() => setKind(k)}
            className={`rounded-md py-2 text-sm ${kind === k ? 'bg-white font-semibold shadow' : 'text-gray-500'}`}
          >
            {k ? KIND_LABELS[k] : '輪流'}
          </button>
        ))}
      </div>

      <button onClick={generate} disabled={busy} className="h-12 w-full rounded-lg bg-gray-900 text-white disabled:opacity-40">
        {busy ? '產生中…（約 10–20 秒）' : '產生新段落'}
      </button>

      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {recent.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500">最近的段落</h2>
          <ul className="divide-y">
            {recent.map((p) => (
              <li key={p.id}>
                <Link to={`/reading/${p.id}`} className="block py-3">
                  <p className="font-medium">
                    <span className="mr-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">{KIND_LABELS[p.kind]}</span>
                    {p.title}
                  </p>
                  <p className="mt-0.5 text-sm text-gray-500">{p.topic}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function PassageView({ id }: { id: string }) {
  const navigate = useNavigate()
  const [passage, setPassage] = useState<Passage | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [misread, setMisread] = useState<Set<number>>(new Set())
  const [saved, setSaved] = useState<Card[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [audioUrl, setAudioUrl] = useState('')

  useEffect(() => {
    api.passage(id).then(setPassage, (e: Error) => setError(e.message))
  }, [id])

  // Recorded only for playback on this device; nothing is uploaded.
  const recorder = useRecorder((audio) => setAudioUrl(URL.createObjectURL(audio)))
  useEffect(() => () => URL.revokeObjectURL(audioUrl), [audioUrl])

  if (!passage) return error ? <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p> : <p className="text-gray-400">載入中…</p>

  // Token text → index into passage.words, so tricky words can be tapped in the passage itself.
  const wordIndex = new Map(passage.words.map((w, i) => [w.surface, i]))
  const toggle = (i: number) =>
    setMisread((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  async function save() {
    setBusy(true)
    setError('')
    try {
      setSaved(await api.saveReadingCards(id, [...misread].sort((a, b) => a - b)))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <Link to="/reading" className="text-sm text-gray-500">
          ← 讀音練習
        </Link>
        <h1 className="mt-1 text-xl font-bold">{passage.title}</h1>
        <p className="mt-1 text-xs text-gray-500">
          <span className="mr-2 rounded bg-gray-100 px-1.5 py-0.5">{KIND_LABELS[passage.kind]}</span>
          {passage.category}
        </p>
      </header>

      {!revealed && <p className="rounded-lg bg-amber-50 p-3 text-sm">先自己大聲唸一遍，唸完再按「顯示讀音」對答案。</p>}

      <section className={`space-y-3 text-lg ${revealed ? 'leading-[2.4]' : 'leading-loose'}`}>
        {passage.sentences.map((s, si) => (
          <div key={si} className={s.speaker ? 'flex gap-2' : ''}>
            {s.speaker && <span className="shrink-0 pt-1 text-sm font-semibold text-gray-500">{s.speaker}</span>}
            <div>
              <p>
                {s.tokens.map((t, ti) => {
                  const wi = wordIndex.get(t.text)
                  if (!revealed) return <Fragment key={ti}>{t.text}</Fragment>
                  const ruby = rubyParts(t.text, t.reading).map((p, pi) =>
                    p.rt ? (
                      <ruby key={pi} className="[ruby-align:center]">
                        {p.base}
                        <rt className="text-[0.6em] text-gray-500">{p.rt}</rt>
                      </ruby>
                    ) : (
                      <Fragment key={pi}>{p.base}</Fragment>
                    ),
                  )
                  if (wi === undefined) return <Fragment key={ti}>{ruby}</Fragment>
                  return (
                    <button
                      key={ti}
                      onClick={() => toggle(wi)}
                      className={`rounded px-0.5 underline decoration-dotted underline-offset-4 ${
                        misread.has(wi) ? 'bg-rose-100 decoration-rose-500' : 'decoration-gray-400'
                      }`}
                    >
                      {ruby}
                    </button>
                  )
                })}
              </p>
              {revealed && <p className="text-sm leading-normal text-gray-500">{s.zh}</p>}
            </div>
          </div>
        ))}
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={recorder.toggle}
          aria-label={recorder.recording ? '停止錄音' : '錄下自己唸'}
          className={`h-12 w-12 shrink-0 rounded-full text-xl text-white shadow active:scale-95 ${
            recorder.recording ? 'animate-pulse bg-red-600' : 'bg-rose-500'
          }`}
        >
          {recorder.recording ? '■' : '🎤'}
        </button>
        {audioUrl ? (
          <audio src={audioUrl} controls className="h-10 min-w-0 flex-1" />
        ) : (
          <p className="text-sm text-gray-500">{recorder.recording ? '錄音中，唸完再按一次' : '可以錄下來回放（只存在手機上）'}</p>
        )}
      </div>

      {!revealed ? (
        <button onClick={() => setRevealed(true)} className="h-12 w-full rounded-lg bg-gray-900 text-white">
          顯示讀音
        </button>
      ) : (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-500">容易唸錯的字・點選你唸錯的</h2>
          <ul className="space-y-2">
            {passage.words.map((w, i) => (
              <li key={i}>
                <button
                  onClick={() => toggle(i)}
                  disabled={saved !== null}
                  className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left ${
                    misread.has(i) ? 'border-rose-300 bg-rose-50' : ''
                  }`}
                >
                  <span
                    className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${
                      misread.has(i) ? 'border-rose-500 bg-rose-500 text-white' : 'border-gray-300'
                    }`}
                  >
                    {misread.has(i) && '✓'}
                  </span>
                  <span className="min-w-0">
                    <span className="text-lg font-semibold">{w.lemma}</span>
                    <span className="ml-2 text-rose-600">{w.reading}</span>
                    <span className="block text-sm">{w.zh}</span>
                    {w.note && <span className="block text-xs text-gray-500">{w.note}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {saved ? (
            <div className="rounded-lg bg-green-50 p-3 text-sm">
              <p>已存成 {saved.length} 張卡片：</p>
              <p className="mt-1 flex flex-wrap gap-x-3">
                {saved.map((c) => (
                  <Link key={c.id} to={`/cards/${c.id}`} className="text-rose-600 underline">
                    {c.ja}
                  </Link>
                ))}
              </p>
            </div>
          ) : (
            <button
              onClick={save}
              disabled={busy || misread.size === 0}
              className="h-12 w-full rounded-lg bg-rose-600 text-white disabled:opacity-40"
            >
              {busy ? '儲存中…' : misread.size ? `把 ${misread.size} 個字存成卡片` : '點選唸錯的字'}
            </button>
          )}
        </section>
      )}

      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <button onClick={() => navigate('/reading')} className="h-11 w-full rounded-lg border text-sm">
        換一篇
      </button>
    </div>
  )
}
