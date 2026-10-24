import { and, desc, eq, like, or, type SQL } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Hono, type Context } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'
import { HTTPException } from 'hono/http-exception'
import { cardToText } from '../shared/format'
import { AskRequest, SaveCardRequest, type Card } from '../shared/schema'
import { cards } from './db/schema'
import { lookupAccents } from './lib/accent'
import { draftCard, RefusalError } from './lib/ai'
import { transcribe } from './lib/transcribe'
import { synthesize } from './lib/tts'

type Row = typeof cards.$inferSelect

const toCard = (r: Row): Card => ({
  ...r.draft,
  id: r.id,
  mode: r.mode,
  source: r.source,
  input: r.input,
  wordAccents: r.wordAccents,
  createdAt: r.createdAt,
})

const app = new Hono<{ Bindings: Env }>().basePath('/api')

app.use('*', bearerAuth({ verifyToken: (token, c: Context<{ Bindings: Env }>) => token === c.env.APP_TOKEN }))

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse()
  if (err instanceof RefusalError) return c.json({ error: 'AI 拒絕回答這個內容，換個說法試試' }, 422)
  console.error(err)
  return c.json({ error: err.message }, 500)
})

async function saveCard(env: Env, input: SaveCardRequest): Promise<Card> {
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

const respond = (c: Context, card: Card) => (c.req.query('format') === 'text' ? c.text(cardToText(card)) : c.json(card))

// ?format=text returns a plain-text card for iOS Shortcuts
app.post('/ask', async (c) => {
  const parsed = AskRequest.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: parsed.error.issues }, 400)
  const req = parsed.data
  if (!c.env.OPENAI_API_KEY) return c.json({ error: 'OPENAI_API_KEY not set' }, 501)

  const draft = await draftCard(c.env, req)
  return respond(c, await saveCard(c.env, { mode: req.mode, source: req.source, input: req.text, draft }))
})

// Save a card someone else already wrote (e.g. the /jp Claude Code skill on a subscription),
// so no API call is made here. Pitch accent is still filled from the dictionary.
app.post('/cards', async (c) => {
  const parsed = SaveCardRequest.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: parsed.error.issues }, 400)
  return respond(c, await saveCard(c.env, parsed.data))
})

app.get('/cards', async (c) => {
  const { category, q } = c.req.query()
  const filters: (SQL | undefined)[] = []
  if (category) filters.push(eq(cards.category, category))
  if (q) filters.push(or(like(cards.ja, `%${q}%`), like(cards.input, `%${q}%`), like(cards.draft, `%${q}%`)))
  const rows = await drizzle(c.env.DB)
    .select()
    .from(cards)
    .where(and(...filters))
    .orderBy(desc(cards.createdAt))
    .limit(200)
  return c.json(rows.map(toCard))
})

app.get('/cards/:id', async (c) => {
  const row = await drizzle(c.env.DB).select().from(cards).where(eq(cards.id, c.req.param('id'))).get()
  if (!row) return c.json({ error: 'not found' }, 404)
  // Re-check the dictionary so cards made before an accent import also get accents.
  return c.json({ ...toCard(row), wordAccents: await lookupAccents(c.env.DB, row.draft.words) })
})

app.delete('/cards/:id', async (c) => {
  await drizzle(c.env.DB).delete(cards).where(eq(cards.id, c.req.param('id')))
  return c.body(null, 204)
})

app.post('/transcribe', async (c) => {
  const audio = (await c.req.formData()).get('audio')
  if (!(audio instanceof File)) return c.json({ error: 'audio file required' }, 400)
  if (!c.env.OPENAI_API_KEY) return c.json({ error: 'OPENAI_API_KEY not set' }, 501)
  return c.json({ text: await transcribe(c.env.OPENAI_API_KEY, audio) })
})

app.post('/tts', async (c) => {
  const { text } = await c.req.json<{ text?: string }>()
  if (!text || text.length > 300) return c.json({ error: 'text required (max 300 chars)' }, 400)
  if (!c.env.AZURE_SPEECH_KEY) return c.json({ error: 'AZURE_SPEECH_KEY not set' }, 501)
  return c.body(await synthesize(c.env, text), 200, { 'Content-Type': 'audio/mpeg' })
})

export default app
