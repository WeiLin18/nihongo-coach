import type { Card } from '@shared/schema'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { CardView } from '../components/CardView'
import { api } from '../lib/api'

export function CardDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [card, setCard] = useState<Card | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (id) api.card(id).then(setCard, (e: Error) => setError(e.message))
  }, [id])

  async function remove() {
    if (!card || !confirm('刪除這張卡片？')) return
    await api.deleteCard(card.id)
    navigate('/cards')
  }

  if (error) return <p className="text-red-600">{error}</p>
  if (!card) return <p className="text-gray-400">載入中…</p>
  return (
    <div className="space-y-6">
      <CardView card={card} />
      <p className="text-xs text-gray-400">
        原輸入：{card.input}
        {card.source && `（${card.source}）`}
      </p>
      <button onClick={remove} className="text-sm text-red-600">
        刪除
      </button>
    </div>
  )
}
