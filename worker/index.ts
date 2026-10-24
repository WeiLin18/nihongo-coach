import { and, desc, eq, like, or, type SQL } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Hono, type Context } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'
import { HTTPException } from 'hono/http-exception'
import { cardToText } from '../shared/format'
import { AskRequest, type Card } from '../shared/schema'
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

// ?format=text returns a plain-text card for iOS Shortcuts
app.post('/ask', async (c) => {
  const parsed = AskRequest.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: parsed.error.issues }, 400)
  const req = parsed.data
  if (!c.env.OPENAI_API_KEY) return c.json({ error: 'OPENAI_API_KEY not set' }, 501)

  const draft = await draftCard(c.env, req)
  const row: Row = {
    id: crypto.randomUUID(),
    mode: req.mode,
    source: req.source ?? null,
    input: req.text,
    ja: draft.ja,
    category: draft.category,
    draft,
    wordAccents: await lookupAccents(c.env.DB, draft.words),
    createdAt: new Date().toISOString(),
    dueAt: null,
    stability: null,
    difficulty: null,
    reps: 0,
  }
  await drizzle(c.env.DB).insert(cards).values(row)

  const card = toCard(row)
  return c.req.query('format') === 'text' ? c.text(cardToText(card)) : c.json(card)
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
