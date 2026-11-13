import { KIND_LABELS, PASSAGE_KINDS, type Passage, type PassageKind, type PassageState, type PassageSummary } from '@shared/reading'
import { Fragment, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
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

// Filters of the passage list. 全部 leaves out archived passages, which only show under 封存.
const FILTERS = [
  { key: 'all', label: '全部', empty: '還沒有短文，按「開始」出第一篇。' },
  { key: 'unread', label: '未讀', empty: '沒有未讀的短文。按「開始」出一篇新的，或到「已讀」把唸完的收進封存。' },
  { key: 'read', label: '已讀', empty: '還沒有唸完的短文。顯示讀音後會自動標成已讀。' },
  { key: 'archived', label: '封存', empty: '沒有封存的短文。' },
] as const
type Filter = (typeof FILTERS)[number]['key']

const matches = (p: PassageSummary, f: Filter) =>
  f === 'archived' ? !!p.archivedAt : !p.archivedAt && (f === 'all' || (f === 'read') === !!p.readAt)

// After 封存並換一篇 on a passage, the list shows an undo toast for it.
export type ReadingHomeState = { archived?: { id: string; title: string } }

// The last archive or unarchive, which 復原 reverses.
type Toast = { text: string; ids: string[]; archived: boolean }

const now = () => new Date().toISOString()

function ReadingHome() {
  const navigate = useNavigate()
  const location = useLocation()
  const [kind, setKind] = useState<PassageKind | undefined>()
  const [filter, setFilter] = useState<Filter>('all')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [recent, setRecent] = useState<PassageSummary[]>([])
  const [loaded, setLoaded] = useState(false)
  const [menu, setMenu] = useState<string | null>(null)
  const [confirmArchive, setConfirmArchive] = useState(false)
  // 封存並換一篇 on a passage lands here with that passage, to offer an undo.
  const [toast, setToast] = useState<Toast | null>(() => {
    const archived = (location.state as ReadingHomeState | null)?.archived
    return archived ? { text: `已封存「${archived.title}」`, ids: [archived.id], archived: true } : null
  })

  useEffect(() => {
    api
      .passages()
      .then(setRecent, (e: Error) => setError(e.message))
      .finally(() => setLoaded(true))
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  // Patches passages here at once, then on the server; reloads the list if that fails.
  async function update(ids: string[], patch: Partial<PassageState>, send: () => Promise<unknown>) {
    setRecent((list) => list.map((p) => (ids.includes(p.id) ? { ...p, ...patch } : p)))
    try {
      await send()
    } catch (e) {
      setToast(null)
      setError((e as Error).message)
      api.passages().then(setRecent, () => {})
    }
  }

  // Drop the history state, so a reload does not offer the undo again.
  useEffect(() => {
    if (location.state) navigate(location.pathname, { replace: true, state: null })
  }, [location.state, location.pathname, navigate])

  const setRead = (p: PassageSummary, read: boolean) =>
    update([p.id], { readAt: read ? (p.readAt ?? now()) : null }, () => api.updatePassage(p.id, { read }))

  const setArchived = (ids: string[], archived: boolean) =>
    update(ids, { archivedAt: archived ? now() : null }, () => Promise.all(ids.map((id) => api.updatePassage(id, { archived }))))

  function archiveOne(p: PassageSummary, archived: boolean) {
    void setArchived([p.id], archived)
    setToast({ text: archived ? `已封存「${p.title}」` : '已移回列表', ids: [p.id], archived })
  }

  async function archiveAllRead() {
    setConfirmArchive(false)
    const ids = recent.filter((p) => matches(p, 'read')).map((p) => p.id)
    setToast({ text: `已封存 ${ids.length} 篇`, ids, archived: true })
    await update(ids, { archivedAt: now() }, () => api.archiveReadPassages())
  }

  function undo() {
    if (toast) void setArchived(toast.ids, !toast.archived)
    setToast(null)
  }

  // Passages prepared for today and not read yet come first; 開始 opens the first one of the chosen kind.
  const queue = todayQueue(recent.filter((p) => !p.readAt && !p.archivedAt))
  const next = queue.find((p) => !kind || p.kind === kind)
  const older = recent.filter((p) => !queue.includes(p))
  const shown = older.filter((p) => matches(p, filter))
  const readCount = older.filter((p) => matches(p, 'read')).length

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
              className={`rounded-md py-2 text-sm ${kind === k ? 'bg-raised font-semibold shadow' : 'text-gray-500'}`}
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
                <span className="rounded bg-raised px-1.5 py-0.5 text-xs text-rose-700">{KIND_LABELS[p.kind]}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">{p.title}</span>
              </span>
              <span className="mt-1 block text-sm text-gray-600">{p.topic}</span>
            </Link>
          ))}
        </section>
      )}

      <p className="text-sm text-gray-500">
        {busy
          ? '產生短文中，約 20–30 秒…'
          : next
            ? `今天準備好的短文還有 ${queue.length} 篇，按開始從${KIND_LABELS[next.kind]}唸起；用完後改回即時出題。`
            : '一段含易錯漢字的對話或新聞稿。先不看假名唸一遍，再顯示讀音，把唸錯的字存成卡片。'}
      </p>

      {loaded && older.length > 0 && (
        <section className="space-y-2.5">
          <h3 className="pt-2 text-sm font-semibold text-gray-500">短文</h3>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
                className={`h-8 rounded-full px-3 text-[13px] ${filter === f.key ? 'bg-gray-900 font-semibold text-white' : 'bg-gray-100 text-gray-600'}`}
              >
                {f.label} {older.filter((p) => matches(p, f.key)).length}
              </button>
            ))}
          </div>

          {filter === 'read' && readCount > 0 && (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 py-2 pr-2 pl-3">
              <span className="text-[13px] text-gray-500">唸完的短文可以收進封存</span>
              <button onClick={() => setConfirmArchive(true)} className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-[13px]">
                <ArchiveIcon className="h-4 w-4" />
                全部封存
              </button>
            </div>
          )}
          {filter === 'archived' && shown.length > 0 && (
            <p className="text-[13px] text-gray-500">封存的短文不會出現在其他分類，出題時仍會避開這些主題。</p>
          )}

          {shown.length === 0 && <p className="py-8 text-center text-sm text-gray-500">{FILTERS.find((f) => f.key === filter)?.empty}</p>}
          <ul>
            {shown.map((p) => (
              <li key={p.id} className="relative flex min-h-12 items-center gap-2 border-b border-gray-200 text-sm">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${p.readAt ? '' : 'bg-rose-500'}`} aria-hidden="true" />
                <span className={`rounded bg-gray-100 px-2 py-0.5 text-xs ${p.readAt ? 'text-gray-500' : ''}`}>{KIND_LABELS[p.kind]}</span>
                <Link to={`/reading/${p.id}`} className={`min-w-0 flex-1 truncate py-3 ${p.readAt ? 'text-gray-500' : 'font-semibold'}`}>
                  {p.title}
                </Link>
                {p.readAt && <ReadMark />}
                {p.archivedAt ? (
                  <button onClick={() => archiveOne(p, false)} className="h-9 shrink-0 rounded-lg border border-gray-300 px-2.5 text-[13px]">
                    取消封存
                  </button>
                ) : (
                  <>
                    <span className="text-xs text-gray-400">{shortDate(p.createdAt)}</span>
                    <button
                      onClick={() => setMenu(menu === p.id ? null : p.id)}
                      aria-label="更多動作"
                      aria-expanded={menu === p.id}
                      className={`h-11 w-9 shrink-0 rounded-lg text-lg ${menu === p.id ? 'bg-gray-200' : 'text-gray-500'}`}
                    >
                      ⋯
                    </button>
                  </>
                )}
                {menu === p.id && (
                  <>
                    <button aria-label="關閉選單" className="fixed inset-0 z-10 cursor-default" onClick={() => setMenu(null)} />
                    <div role="menu" className="absolute top-full right-0 z-20 -mt-1 w-44 rounded-xl border border-gray-200 bg-raised p-1 shadow-lg">
                      <button
                        role="menuitem"
                        onClick={() => {
                          setMenu(null)
                          void setRead(p, !p.readAt)
                        }}
                        className="flex h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left active:bg-gray-100"
                      >
                        <CheckIcon className="h-4 w-4 text-green-700" />
                        {p.readAt ? '標記為未讀' : '標記為已讀'}
                      </button>
                      <button
                        role="menuitem"
                        onClick={() => {
                          setMenu(null)
                          archiveOne(p, true)
                        }}
                        className="flex h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left active:bg-gray-100"
                      >
                        <ArchiveIcon className="h-4 w-4 text-gray-500" />
                        封存
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {confirmArchive && (
        <div className="fixed inset-0 z-30 flex items-end bg-black/40" onClick={() => setConfirmArchive(false)}>
          <div
            role="dialog"
            aria-label="封存已讀短文"
            onClick={(e) => e.stopPropagation()}
            className="mx-auto w-full max-w-xl space-y-3 rounded-t-2xl bg-page px-4 pt-5 pb-[max(1.75rem,env(safe-area-inset-bottom))]"
          >
            <h2 className="text-[17px] font-bold">封存 {readCount} 篇已讀短文？</h2>
            <p className="text-sm text-gray-600">它們會從列表移到「封存」，隨時可以取消封存。已存的卡片不受影響。</p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button onClick={() => setConfirmArchive(false)} className="h-12 rounded-lg border border-gray-300">
                取消
              </button>
              <button onClick={archiveAllRead} className="h-12 rounded-lg bg-gray-900 text-white">
                封存
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 px-4">
          <div role="status" className="mx-auto flex h-12 max-w-xl items-center justify-between gap-2 rounded-xl bg-gray-900 pr-1.5 pl-3.5 text-sm text-white shadow-lg">
            <span className="min-w-0 truncate">{toast.text}</span>
            <button onClick={undo} className="h-10 shrink-0 px-3 font-semibold text-rose-200">
              復原
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ReadMark() {
  return (
    <span className="flex shrink-0 items-center gap-0.5 text-xs text-green-700">
      <CheckIcon className="h-3 w-3" />
      已讀
    </span>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M5 12l5 5L20 7" />
    </svg>
  )
}

function ArchiveIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <rect x="3" y="4" width="18" height="5" rx="1" />
      <path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4" />
    </svg>
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

  // Revealing the readings marks the passage read.
  function reveal() {
    setRevealed(true)
    if (!passage || passage.readAt) return
    setPassage({ ...passage, readAt: new Date().toISOString() })
    api.updatePassage(id, { read: true }).catch((e: Error) => setError(e.message))
  }

  async function setState(req: { read?: boolean; archived?: boolean }) {
    setError('')
    try {
      const state = await api.updatePassage(id, req)
      setPassage((p) => p && { ...p, ...state })
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    }
  }

  async function archiveAndNext() {
    if (!passage || !(await setState({ archived: true }))) return
    const state: ReadingHomeState = { archived: { id, title: passage.title } }
    navigate('/reading', { state })
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
          {passage.readAt && <ReadMark />}
          {passage.archivedAt && <span className="rounded bg-gray-100 px-1.5 py-0.5">已封存</span>}
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
        <button onClick={reveal} className="h-12 w-full rounded-lg bg-gray-900 text-white">
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

      <div className="space-y-2 border-t border-gray-200 pt-4">
        {passage.archivedAt ? (
          <button onClick={() => setState({ archived: false })} className="h-12 w-full rounded-lg border border-gray-300">
            取消封存
          </button>
        ) : (
          (revealed || passage.readAt) && (
            <button onClick={archiveAndNext} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-gray-900 text-white">
              <ArchiveIcon className="h-[18px] w-[18px]" />
              封存並換一篇
            </button>
          )
        )}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => navigate('/reading')} className="h-11 rounded-lg border border-gray-300 text-sm">
            換一篇
          </button>
          <button onClick={() => setState({ read: !passage.readAt })} className="h-11 rounded-lg border border-gray-300 text-sm text-gray-600">
            {passage.readAt ? '標記為未讀' : '標記為已讀'}
          </button>
        </div>
      </div>
    </div>
  )
}
