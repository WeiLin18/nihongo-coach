import { KIND_LABELS, PASSAGE_KINDS, type Passage, type PassageKind, type PassageSummary } from '@shared/reading'
import { Fragment, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { RubyParts } from '../components/Ruby'
import { SpeakButton } from '../components/SpeakButton'
import { TodayBadge } from '../components/TodayBadge'
import { api } from '../lib/api'
import { localDate, shortDate, todayQueue } from '../lib/date'
import { rubyParts } from '../lib/furigana'
import { useRecorder } from '../lib/useRecorder'

export function Reading() {
  const { id } = useParams()
  return id ? <PassageView key={id} id={id} /> : <ReadingHome />
}

function ReadingHome() {
  const navigate = useNavigate()
  const [kind, setKind] = useState<PassageKind | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [recent, setRecent] = useState<PassageSummary[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    api
      .passages()
      .then(setRecent, (e: Error) => setError(e.message))
      .finally(() => setLoaded(true))
  }, [])

  // Passages prepared for today come first; 開始 opens the first one of the chosen kind.
  const queue = todayQueue(recent)
  const next = queue.find((p) => !kind || p.kind === kind)
  const older = recent.filter((p) => !queue.includes(p))

  async function generate() {
    if (next) return navigate(`/reading/${next.id}`)
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
      <div className="flex items-center gap-2">
        <div className="grid flex-1 grid-cols-3 gap-1 rounded-lg bg-gray-100 p-1">
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
        <button onClick={generate} disabled={busy || !loaded} className="h-11 rounded-lg bg-rose-500 px-4 text-sm text-white disabled:opacity-40">
          {busy ? '出題中…' : '開始'}
        </button>
      </div>

      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {queue.length > 0 && (
        <section className="space-y-2">
          {queue.map((p) => (
            <Link key={p.id} to={`/reading/${p.id}`} className="block rounded-xl bg-rose-50/60 p-3 active:bg-rose-100">
              <span className="flex items-center gap-2">
                <TodayBadge />
                <span className="rounded bg-white px-1.5 py-0.5 text-xs text-rose-700">{KIND_LABELS[p.kind]}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">{p.title}</span>
              </span>
              <span className="mt-1 block text-sm text-gray-600">{p.topic}</span>
            </Link>
          ))}
        </section>
      )}

      <section className="space-y-2">
        <p className="text-sm text-gray-500">
          {busy
            ? '產生短文中，約 20–30 秒…'
            : next
              ? `今天準備好的短文還有 ${queue.length} 篇，按開始從${KIND_LABELS[next.kind]}唸起；用完後改回即時出題。`
              : '一段含易錯漢字的對話或新聞稿。先不看假名唸一遍，再顯示讀音，把唸錯的字存成卡片。'}
        </p>
        {older.length > 0 && <h3 className="pt-2 text-sm font-semibold text-gray-500">最近的短文</h3>}
        {older.map((p) => (
          <Link key={p.id} to={`/reading/${p.id}`} className="flex items-center gap-2 border-b py-2 text-sm">
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">{KIND_LABELS[p.kind]}</span>
            <span className="flex-1 truncate">{p.title}</span>
            <span className="text-xs text-gray-400">{shortDate(p.createdAt)}</span>
          </Link>
        ))}
      </section>
    </div>
  )
}

function PassageView({ id }: { id: string }) {
  const navigate = useNavigate()
  const [passage, setPassage] = useState<Passage | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [misread, setMisread] = useState<Set<number>>(new Set())
  // Word index → card id, for words already saved as cards (now or from an earlier visit).
  const [saved, setSaved] = useState<Map<number, string>>(new Map())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [audioUrl, setAudioUrl] = useState('')

  useEffect(() => {
    api.passage(id).then(
      (p) => {
        setPassage(p)
        setSaved(new Map(p.saved.map((w) => [w.index, w.cardId])))
      },
      (e: Error) => setError(e.message),
    )
  }, [id])

  // Recorded only for playback on this device; nothing is uploaded.
  const recorder = useRecorder((audio) => setAudioUrl(URL.createObjectURL(audio)))
  useEffect(() => () => URL.revokeObjectURL(audioUrl), [audioUrl])

  if (!passage) return error ? <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p> : <p className="text-gray-400">載入中…</p>

  // Token text → index into passage.words, so tricky words can be tapped in the passage itself.
  const wordIndex = new Map(passage.words.map((w, i) => [w.surface, i]))
  const toggle = (i: number) => {
    if (saved.has(i)) return
    setMisread((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  async function save() {
    setBusy(true)
    setError('')
    try {
      const words = await api.saveReadingCards(id, [...misread].sort((a, b) => a - b))
      setSaved(new Map(words.map((w) => [w.index, w.cardId])))
      setMisread(new Set())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold">{passage.title}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
          {passage.preparedFor === localDate() && <TodayBadge />}
          <span className="rounded bg-gray-100 px-1.5 py-0.5">{KIND_LABELS[passage.kind]}</span>
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
                  const ruby = <RubyParts parts={rubyParts(t.text, t.reading)} />
                  if (wi === undefined) return <Fragment key={ti}>{ruby}</Fragment>
                  return (
                    <button
                      key={ti}
                      onClick={() => toggle(wi)}
                      disabled={saved.has(wi)}
                      className={`rounded px-0.5 underline decoration-dotted underline-offset-4 ${
                        misread.has(wi) || saved.has(wi) ? 'bg-rose-100 decoration-rose-500' : 'decoration-gray-400'
                      }`}
                    >
                      {ruby}
                    </button>
                  )
                })}
              </p>
              {revealed && (
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 text-sm leading-normal text-gray-500">{s.zh}</p>
                  <SpeakButton text={s.tokens.map((t) => t.text).join('')} parts={s.tokens} />
                </div>
              )}
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
            {passage.words.map((w, i) => {
              const cardId = saved.get(i)
              const marked = misread.has(i) || cardId !== undefined
              return (
                <li key={i} className={`rounded-lg border ${marked ? 'border-rose-300 bg-rose-50' : ''}`}>
                  <div className="flex items-start">
                    <button onClick={() => toggle(i)} disabled={cardId !== undefined} className="flex min-w-0 flex-1 items-start gap-3 p-3 text-left">
                      <span
                        className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${
                          marked ? 'border-rose-500 bg-rose-500 text-white' : 'border-gray-300'
                        }`}
                      >
                        {marked && '✓'}
                      </span>
                      <span className="min-w-0">
                        <span className="text-lg font-semibold">{w.lemma}</span>
                        <span className="ml-2 text-rose-600">{w.reading}</span>
                        <span className="block text-sm">{w.zh}</span>
                        {w.note && <span className="block text-xs text-gray-500">{w.note}</span>}
                      </span>
                    </button>
                    <div className="p-3 pl-0">
                      <SpeakButton text={w.lemma} reading={w.reading} />
                    </div>
                  </div>
                  {cardId && (
                    <Link to={`/cards/${cardId}`} className="-mt-1 block px-11 pb-3 text-xs text-rose-600 underline">
                      已存成卡片 →
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>

          <button
            onClick={save}
            disabled={busy || misread.size === 0}
            className="h-12 w-full rounded-lg bg-rose-600 text-white disabled:opacity-40"
          >
            {busy ? '儲存中…' : misread.size ? `把 ${misread.size} 個字存成卡片` : saved.size ? `已存 ${saved.size} 張卡片` : '點選唸錯的字'}
          </button>
        </section>
      )}

      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {passage.sourceUrl && (
        <p className="text-xs text-gray-500">
          改寫自新聞：
          <a href={passage.sourceUrl} target="_blank" rel="noreferrer" className="break-all text-rose-600 underline">
            {new URL(passage.sourceUrl).hostname}
          </a>
        </p>
      )}

      <button onClick={() => navigate('/reading')} className="h-11 w-full rounded-lg border text-sm">
        換一篇
      </button>
    </div>
  )
}
