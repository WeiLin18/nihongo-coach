import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Hono, type Context } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'
import { HTTPException } from 'hono/http-exception'
import { streamSSE } from 'hono/streaming'
import { cardToText } from '../shared/format'
import { AskRequest, SaveCardRequest, type Card } from '../shared/schema'
import { cards } from './db/schema'
import { lookupAccents } from './lib/accent'
import { listCards, saveCard, toCard } from './lib/cards'
import { mcp } from './mcp'
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

const respond = (c: Context, card: Card) => (c.req.query('format') === 'text' ? c.text(cardToText(card)) : c.json(card))

// ?format=text returns a plain-text card for iOS Shortcuts
app.post('/ask', async (c) => {
  const parsed = AskRequest.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: parsed.error.issues }, 400)
  const req = parsed.data
  if (!c.env.OPENAI_API_KEY) return c.json({ error: 'OPENAI_API_KEY not set' }, 501)

  const meta = { mode: req.mode, source: req.source, input: req.text }

  // ?stream=1: Server-Sent Events. `delta` events carry raw JSON text as it is generated,
  // then one `card` event with the saved card (accents filled), or an `error` event.
  if (c.req.query('stream') === '1') {
    return streamSSE(c, async (sse) => {
      try {
        const draft = await streamCard(c.env, req, (text) => sse.writeSSE({ event: 'delta', data: JSON.stringify(text) }))
        const card = await saveCard(c.env, { ...meta, draft })
        await sse.writeSSE({ event: 'card', data: JSON.stringify(card) })
      } catch (err) {
        console.error(err)
        const message = err instanceof RefusalError ? 'AI 拒絕回答這個內容，換個說法試試' : (err as Error).message
        await sse.writeSSE({ event: 'error', data: JSON.stringify(message) })
      }
    })
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
  const { category, q } = c.req.query()
  return c.json(await listCards(c.env, { category, q }))
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

// Claude app connector (MCP), outside /api: it authenticates with a secret path instead of a bearer token.
export default new Hono<{ Bindings: Env }>().route('/', app).route('/mcp', mcp)
