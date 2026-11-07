import { Hono } from 'hono'
import { ReadingRequest, SavePassageRequest, SaveReadingCardsRequest } from '../shared/reading'
import { generatePassage, getPassage, listPassages, markPassageOpened, savePreparedPassage, saveReadingCards } from './lib/reading'

// Kanji reading practice, mounted at /api/reading (auth and errors are handled by the parent app).
export const reading = new Hono<{ Bindings: Env }>()

reading.get('/', async (c) => c.json(await listPassages(c.env)))

reading.post('/', async (c) => {
  const parsed = ReadingRequest.safeParse(await c.req.json().catch(() => ({})))
  if (!parsed.success) return c.json({ error: parsed.error.issues }, 400)
  if (!c.env.OPENAI_API_KEY) return c.json({ error: 'OPENAI_API_KEY not set' }, 501)
  return c.json(await generatePassage(c.env, parsed.data.kind))
})

// Save a passage someone else already wrote (the /jp-daily skill), without an API call.
// 201 when saved, 200 with the existing passage when this source + date + slot was saved before.
reading.post('/prepared', async (c) => {
  const parsed = SavePassageRequest.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: parsed.error.issues }, 400)
  const result = await savePreparedPassage(c.env, parsed.data)
  return c.json(result, result.created ? 201 : 200)
})

// The app opening a passage takes it out of the 今日 queue; ?peek=1 reads it without that.
reading.get('/:id', async (c) => {
  const passage = await getPassage(c.env, c.req.param('id'))
  if (!passage) return c.json({ error: 'not found' }, 404)
  if (passage.preparedFor && !passage.openedAt && c.req.query('peek') !== '1') await markPassageOpened(c.env, passage.id)
  return c.json(passage)
})

// Saves the misread words as cards.
reading.post('/:id/cards', async (c) => {
  const parsed = SaveReadingCardsRequest.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: parsed.error.issues }, 400)
  const passage = await getPassage(c.env, c.req.param('id'))
  if (!passage) return c.json({ error: 'not found' }, 404)
  return c.json(await saveReadingCards(c.env, passage, parsed.data.words))
})
