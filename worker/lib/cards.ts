import { and, desc, eq, like, or, type SQL } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import type { Card, SaveCardRequest } from '../../shared/schema'
import { cards } from '../db/schema'
import { lookupAccents } from './accent'

type Row = typeof cards.$inferSelect

export const toCard = (r: Row): Card => ({
  ...r.draft,
  id: r.id,
  mode: r.mode,
  source: r.source,
  input: r.input,
  wordAccents: r.wordAccents,
  createdAt: r.createdAt,
})

export async function saveCard(env: Env, input: SaveCardRequest): Promise<Card> {
  const row: Row = {
    id: crypto.randomUUID(),
    mode: input.mode,
    source: input.source ?? null,
    input: input.input,
    ja: input.draft.ja,
    category: input.draft.category,
    draft: input.draft,
    wordAccents: await lookupAccents(env.DB, input.draft.words),
    createdAt: new Date().toISOString(),
    dueAt: null,
    stability: null,
    difficulty: null,
    reps: 0,
  }
  await drizzle(env.DB).insert(cards).values(row)
  return toCard(row)
}

export async function listCards(env: Env, { category, q, limit = 200 }: { category?: string; q?: string; limit?: number }) {
  const filters: (SQL | undefined)[] = []
  if (category) filters.push(eq(cards.category, category))
  if (q) filters.push(or(like(cards.ja, `%${q}%`), like(cards.input, `%${q}%`), like(cards.draft, `%${q}%`)))
  const rows = await drizzle(env.DB)
    .select()
    .from(cards)
    .where(and(...filters))
    .orderBy(desc(cards.createdAt))
    .limit(limit)
  return rows.map(toCard)
}
