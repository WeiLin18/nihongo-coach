import type { ReviewCard, ReviewRating, ReviewStats } from '@shared/schema'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { CardView } from '../components/CardView'
import { api } from '../lib/api'
import { useRecorder } from '../lib/useRecorder'

// Lets the nav badge refresh after each rating.
export const REVIEW_CHANGED = 'review-changed'

const RATINGS: { rating: ReviewRating; label: string; className: string }[] = [
  { rating: 1, label: '重來', className: 'bg-red-50 text-red-700' },
  { rating: 2, label: '困難', className: 'bg-amber-50 text-amber-700' },
  { rating: 3, label: '良好', className: 'bg-green-50 text-green-700' },
  { rating: 4, label: '簡單', className: 'bg-sky-50 text-sky-700' },
]

function interval(ms: number): string {
  const min = Math.max(Math.round(ms / 60_000), 1)
  if (min < 60) return `${min} 分鐘`
  if (min < 60 * 24) return `${Math.round(min / 60)} 小時`
  const days = Math.round(min / (60 * 24))
  if (days < 31) return `${days} 天`
  if (days < 365) return `${Math.round(days / 30)} 個月`
  return `${(days / 365).toFixed(1)} 年`
}

// What to say out loud. zh2ja / naturalize: say the Japanese for the Chinese meaning.
// lookup: the card is about a Japanese word, so explain it and use it in a sentence.
function Prompt({ card }: { card: ReviewCard }) {
  if (card.mode === 'lookup')
    return (
      <>
        <p className="text-sm text-gray-500">說出意思和用法，並用它說一句話</p>
        <p className="text-3xl font-bold leading-snug">{card.ja}</p>
      </>
    )
  const original = card.mode === 'naturalize' ? (card.correction?.original ?? card.input) : card.input
  return (
    <>
      <p className="text-sm text-gray-500">{card.mode === 'naturalize' ? '用自然的日文說說看' : '用日文說說看'}</p>
      <p className="text-2xl font-bold leading-snug">{card.zh}</p>
      {original && original !== card.zh && (
        <p className="rounded-lg bg-gray-50 p-2 text-sm text-gray-600">
          {card.mode === 'naturalize' ? '你原本說：' : '你當初寫：'}
          {original}
        </p>
      )}
    </>
  )
}

function StatsLine({ stats }: { stats: ReviewStats }) {
  return (
    <p className="text-xs text-gray-500">
      今天已複習 {stats.reviewedToday} 張・連續 {stats.streak} 天
    </p>
  )
}

export function Review() {
  const [queue, setQueue] = useState<ReviewCard[] | null>(null)
  const [stats, setStats] = useState<ReviewStats | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const card = queue?.[0]

  function load() {
    api.reviewQueue().then(
      (q) => {
        setQueue(q.cards)
        setStats(q.stats)
      },
      (e: Error) => setError(e.message),
    )
  }
  useEffect(load, [])

  async function rate(rating: ReviewRating) {
    if (!card) return
    setBusy(true)
    setError('')
    try {
      setStats(await api.review(card.id, rating))
      window.dispatchEvent(new Event(REVIEW_CHANGED))
      window.scrollTo(0, 0)
      const rest = queue.slice(1)
      // Cards rated Again come back in a few minutes; fetch them once the rest are done.
      if (rest.length) setQueue(rest)
      else load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (error && !queue) return <p className="text-red-600">{error}</p>
  if (!queue || !stats) return <p className="text-gray-400">載入中…</p>

  if (!card)
    return (
      <div className="space-y-3 py-16 text-center">
        <p className="text-4xl">🎉</p>
        <p className="font-semibold">今天的複習都完成了</p>
        <StatsLine stats={stats} />
        <p className="text-sm text-gray-500">
          新卡片會自動加入，或到 <Link to="/" className="text-rose-600 underline">練習</Link> 多存幾張。
        </p>
      </div>
    )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <StatsLine stats={stats} />
        <p className="text-xs text-gray-500">
          剩 {queue.length} 張{card.srs.state === 0 && <span className="ml-1 rounded bg-rose-50 px-1.5 text-rose-700">新</span>}
        </p>
      </div>
      {/* Keyed by card, so each card starts hidden and without the previous recording. */}
      <ReviewItem key={card.id} card={card} busy={busy} onRate={rate} />
      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </div>
  )
}

function ReviewItem({ card, busy, onRate }: { card: ReviewCard; busy: boolean; onRate: (r: ReviewRating) => void }) {
  const [revealed, setRevealed] = useState(false)
  const [recording, setRecording] = useState<string | null>(null)
  const recorder = useRecorder((audio) => setRecording(URL.createObjectURL(audio)))
  useEffect(() => () => void (recording && URL.revokeObjectURL(recording)), [recording])

  return (
    <>
      <section className="space-y-3 rounded-xl border p-4">
        <Prompt card={card} />
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={recorder.toggle}
            className={`rounded-full px-4 py-2 text-sm text-white active:scale-95 ${
              recorder.recording ? 'animate-pulse bg-red-600' : 'bg-rose-500'
            }`}
          >
            {recorder.recording ? '■ 停止' : '🎤 錄音自己說'}
          </button>
          {recording && <audio src={recording} controls className="h-9 min-w-0 flex-1" />}
        </div>
      </section>

      {revealed ? (
        <>
          <div className="rounded-xl border p-4">
            <CardView card={card} />
          </div>
          <div className="sticky bottom-[calc(3rem+env(safe-area-inset-bottom))] grid grid-cols-4 gap-2 bg-white/95 py-2 backdrop-blur">
            {RATINGS.map((r) => (
              <button
                key={r.rating}
                disabled={busy}
                onClick={() => onRate(r.rating)}
                className={`rounded-lg py-2 text-sm font-semibold active:scale-95 disabled:opacity-40 ${r.className}`}
              >
                {r.label}
                <span className="block text-xs font-normal">{interval(card.intervals[r.rating])}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <button onClick={() => setRevealed(true)} className="h-12 w-full rounded-lg bg-gray-900 text-white">
          看答案
        </button>
      )}
    </>
  )
}
