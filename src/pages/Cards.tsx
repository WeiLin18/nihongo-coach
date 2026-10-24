import { CATEGORIES, MODE_LABELS, type Card } from '@shared/schema'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../lib/api'

export function Cards() {
  const [category, setCategory] = useState('')
  const [q, setQ] = useState('')
  const [cards, setCards] = useState<Card[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const t = setTimeout(() => {
      api.cards({ category, q }).then(setCards, (e: Error) => setError(e.message))
    }, 250)
    return () => clearTimeout(t)
  }, [category, q])

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
    </div>
  )
}
