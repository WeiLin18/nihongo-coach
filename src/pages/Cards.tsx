import { CATEGORIES, MODE_LABELS, type Card } from '@shared/schema'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../lib/api'

const PAGE_SIZE = 30

// Which category + search a loaded list belongs to, so pages from an old search are never mixed in.
type List = { key: string; cards: Card[]; nextCursor: string | null }

export function Cards() {
  const [category, setCategory] = useState('')
  const [q, setQ] = useState('')
  const [list, setList] = useState<List | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const currentKey = useRef('')
  const sentinel = useRef<HTMLDivElement>(null)
  const key = `${category}\n${q}`

  // No cursor loads the first page and replaces the list; a cursor appends the next page.
  const fetchPage = useCallback(
    (cursor?: string) => {
      const key = `${category}\n${q}`
      setLoading(true)
      setError('')
      api.cards({ category, q, cursor, limit: String(PAGE_SIZE) }).then(
        (page) => {
          if (key !== currentKey.current) return
          setList((prev) => ({
            key,
            cards: cursor && prev ? [...prev.cards, ...page.cards] : page.cards,
            nextCursor: page.nextCursor,
          }))
          setLoading(false)
        },
        (e: Error) => {
          if (key !== currentKey.current) return
          setError(e.message)
          setLoading(false)
        },
      )
    },
    [category, q],
  )

  useEffect(() => {
    currentKey.current = `${category}\n${q}`
    const t = setTimeout(() => fetchPage(), 250)
    return () => clearTimeout(t)
  }, [category, q, fetchPage])

  // Load the next page when the end of the list comes near. Observing again after each page
  // fires at once if the sentinel is still on screen, so short pages keep loading.
  const nextCursor = list?.key === key && !loading && !error ? list.nextCursor : null
  useEffect(() => {
    const el = sentinel.current
    if (!el || !nextCursor) return
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && fetchPage(nextCursor), {
      rootMargin: '400px',
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [nextCursor, fetchPage])

  const cards = list?.cards

  return (
    <div className="space-y-3">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="搜尋"
        className="w-full rounded-lg border p-2"
      />
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {['', ...CATEGORIES].map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`shrink-0 rounded-full px-3 py-1 text-sm ${category === c ? 'bg-gray-900 text-white' : 'bg-gray-100'}`}
          >
            {c || '全部'}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {cards?.length === 0 && <p className="py-8 text-center text-gray-400">還沒有卡片</p>}
      <ul className="divide-y">
        {cards?.map((card) => (
          <li key={card.id}>
            <Link to={`/cards/${card.id}`} className="block py-3">
              <p className="font-medium">{card.ja}</p>
              <p className="truncate text-sm text-gray-500">{card.zh}</p>
              <p className="text-xs text-gray-400">
                {card.category}・{MODE_LABELS[card.mode]}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      <div ref={sentinel} />
      {loading && cards && <p className="py-4 text-center text-sm text-gray-400">載入中…</p>}
      {error && list?.key === key && list.nextCursor && (
        <button onClick={() => fetchPage(list.nextCursor!)} className="w-full py-3 text-sm text-gray-500">
          重試
        </button>
      )}
    </div>
  )
}
