import { and, desc, eq, like, lt, or, type SQL } from 'drizzle-orm'
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

// Newest first. `cursor` is the `nextCursor` of the previous page; it is null on the last page.
export async function listCards(
  env: Env,
  { category, q, cursor, limit = 200 }: { category?: string; q?: string; cursor?: string; limit?: number },
): Promise<{ cards: Card[]; nextCursor: string | null }> {
  const filters: (SQL | undefined)[] = []
  if (category) filters.push(eq(cards.category, category))
  if (q) filters.push(or(like(cards.ja, `%${q}%`), like(cards.input, `%${q}%`), like(cards.draft, `%${q}%`)))
  if (cursor) {
    const [createdAt, id] = cursor.split('|')
    filters.push(or(lt(cards.createdAt, createdAt), and(eq(cards.createdAt, createdAt), lt(cards.id, id ?? ''))))
  }
  // One extra row tells us whether another page exists.
  const rows = await drizzle(env.DB)
    .select()
    .from(cards)
    .where(and(...filters))
    .orderBy(desc(cards.createdAt), desc(cards.id))
    .limit(limit + 1)
  const page = rows.slice(0, limit)
  const last = page.at(-1)
  return { cards: page.map(toCard), nextCursor: rows.length > limit && last ? `${last.createdAt}|${last.id}` : null }
}
