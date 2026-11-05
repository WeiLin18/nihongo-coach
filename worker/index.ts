import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Hono, type Context } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'
import { HTTPException } from 'hono/http-exception'
import { streamSSE } from 'hono/streaming'
import { cardToText } from '../shared/format'
import {
  AskRequest,
  PracticeTurnRequest,
  ReviewRequest,
  SaveCardRequest,
  StartPracticeRequest,
  type Card,
} from '../shared/schema'
import { cards } from './db/schema'
import { lookupAccents } from './lib/accent'
import { listCards, saveCard, toCard } from './lib/cards'
import { reviewQueue, reviewStats, submitReview } from './lib/review'
import { mcp } from './mcp'
import { reading } from './reading'
import { getPractice, listPractice, replyPractice, saveTurnCard, startPractice } from './lib/practice'
import { draftCard, RefusalError, streamCard } from './lib/ai'
import { transcribe } from './lib/transcribe'
import { synthesize } from './lib/tts'

const app = new Hono<{ Bindings: Env }>().basePath('/api')

app.use('*', bearerAuth({ verifyToken: (token, c: Context<{ Bindings: Env }>) => token === c.env.APP_TOKEN }))

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse()
  if (err instanceof RefusalError) return c.json({ error: 'AI 拒絕回答這個內容，換個說法試試' }, 422)
  console.error(err)
  return c.json({ error: err.message }, 500)
})

// Server-Sent Events: `delta` events carry raw JSON text as the AI writes it,
// then one `event` with the job's result, or an `error` event.
const streamJob = <T>(c: Context, event: string, job: (onDelta: (text: string) => Promise<void>) => Promise<T>) =>
  streamSSE(c, async (sse) => {
    try {
      const result = await job((text) => sse.writeSSE({ event: 'delta', data: JSON.stringify(text) }))
      await sse.writeSSE({ event, data: JSON.stringify(result) })
    } catch (err) {
      console.error(err)
      const message = err instanceof RefusalError ? 'AI 拒絕回答這個內容，換個說法試試' : (err as Error).message
      await sse.writeSSE({ event: 'error', data: JSON.stringify(message) })
    }
  })

const respond = (c: Context, card: Card) => (c.req.query('format') === 'text' ? c.text(cardToText(card)) : c.json(card))

// ?format=text returns a plain-text card for iOS Shortcuts
app.post('/ask', async (c) => {
  const parsed = AskRequest.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: parsed.error.issues }, 400)
  const req = parsed.data
  if (!c.env.OPENAI_API_KEY) return c.json({ error: 'OPENAI_API_KEY not set' }, 501)

  const meta = { mode: req.mode, source: req.source, input: req.text }

  // ?stream=1: streams the card, ending with a `card` event with the saved card (accents filled).
  if (c.req.query('stream') === '1') {
    return streamJob(c, 'card', async (onDelta) => saveCard(c.env, { ...meta, draft: await streamCard(c.env, req, onDelta) }))
  }

  const draft = await draftCard(c.env, req)
  return respond(c, await saveCard(c.env, { ...meta, draft }))
})

// Save a card someone else already wrote (e.g. the /jp Claude Code skill on a subscription),
// so no API call is made here. Pitch accent is still filled from the dictionary.
app.post('/cards', async (c) => {
  const parsed = SaveCardRequest.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: parsed.error.issues }, 400)
  return respond(c, await saveCard(c.env, parsed.data))
})

app.get('/cards', async (c) => {
  const { category, q, cursor } = c.req.query()
  const limit = Math.min(Math.max(Number(c.req.query('limit')) || 30, 1), 100)
  return c.json(await listCards(c.env, { category, q, cursor, limit }))
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

// Conversation practice. POSTs that call the AI always stream (see streamJob).
app.get('/practice', async (c) => {
  const limit = Math.min(Math.max(Number(c.req.query('limit')) || 10, 1), 50)
  return c.json(await listPractice(c.env, limit))
})

app.post('/practice', async (c) => {
  const parsed = StartPracticeRequest.safeParse(await c.req.json().catch(() => ({})))
  if (!parsed.success) return c.json({ error: parsed.error.issues }, 400)
  if (!c.env.OPENAI_API_KEY) return c.json({ error: 'OPENAI_API_KEY not set' }, 501)
  return streamJob(c, 'session', (onDelta) => startPractice(c.env, parsed.data.kind, onDelta))
})

app.get('/practice/:id', async (c) => {
  const session = await getPractice(c.env, c.req.param('id'))
  return session ? c.json(session) : c.json({ error: 'not found' }, 404)
})

app.post('/practice/:id/turns', async (c) => {
  const parsed = PracticeTurnRequest.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: parsed.error.issues }, 400)
  if (!c.env.OPENAI_API_KEY) return c.json({ error: 'OPENAI_API_KEY not set' }, 501)
  const session = await getPractice(c.env, c.req.param('id'))
  if (!session) return c.json({ error: 'not found' }, 404)
  if (session.done) return c.json({ error: '這段會話已經結束了' }, 409)
  return streamJob(c, 'turn', (onDelta) => replyPractice(c.env, session, parsed.data.text, onDelta))
})

app.post('/practice/turns/:id/card', async (c) => {
  if (!c.env.OPENAI_API_KEY) return c.json({ error: 'OPENAI_API_KEY not set' }, 501)
  const card = await saveTurnCard(c.env, c.req.param('id'))
  return card ? c.json(card) : c.json({ error: 'not found' }, 404)
})

// Spaced-repetition review. ?tz= is the client's UTC offset in minutes (for "today"),
// ?new= the number of new cards per day (default 20).
const reviewParams = (c: Context) => ({
  tz: Math.min(Math.max(Number(c.req.query('tz')) || 0, -840), 840),
  newPerDay: Math.min(Math.max(Number(c.req.query('new') ?? 20) || 0, 0), 500),
})

app.get('/review/queue', async (c) => {
  const { tz, newPerDay } = reviewParams(c)
  return c.json(await reviewQueue(c.env, tz, newPerDay))
})

app.get('/review/count', async (c) => {
  const { tz, newPerDay } = reviewParams(c)
  return c.json(await reviewStats(c.env, tz, newPerDay))
})

app.post('/review/:id', async (c) => {
  const parsed = ReviewRequest.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: parsed.error.issues }, 400)
  if (!(await submitReview(c.env, c.req.param('id'), parsed.data.rating))) return c.json({ error: 'not found' }, 404)
  const { tz, newPerDay } = reviewParams(c)
  return c.json(await reviewStats(c.env, tz, newPerDay))
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

app.route('/reading', reading)

// Claude app connector (MCP), outside /api: it authenticates with a secret path instead of a bearer token.
export default new Hono<{ Bindings: Env }>().route('/', app).route('/mcp', mcp)
