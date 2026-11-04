import { Hono } from 'hono'
import { ReadingRequest, SaveReadingCardsRequest } from '../shared/reading'
import { generatePassage, getPassage, listPassages, saveReadingCards } from './lib/reading'

// Kanji reading practice, mounted at /api/reading (auth and errors are handled by the parent app).
export const reading = new Hono<{ Bindings: Env }>()

reading.get('/', async (c) => c.json(await listPassages(c.env)))

reading.post('/', async (c) => {
  const parsed = ReadingRequest.safeParse(await c.req.json().catch(() => ({})))
  if (!parsed.success) return c.json({ error: parsed.error.issues }, 400)
  if (!c.env.OPENAI_API_KEY) return c.json({ error: 'OPENAI_API_KEY not set' }, 501)
  return c.json(await generatePassage(c.env, parsed.data.kind))
})

reading.get('/:id', async (c) => {
  const passage = await getPassage(c.env, c.req.param('id'))
  return passage ? c.json(passage) : c.json({ error: 'not found' }, 404)
})

// Saves the misread words as cards.
reading.post('/:id/cards', async (c) => {
  const parsed = SaveReadingCardsRequest.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: parsed.error.issues }, 400)
  const passage = await getPassage(c.env, c.req.param('id'))
  if (!passage) return c.json({ error: 'not found' }, 404)
  return c.json(await saveReadingCards(c.env, passage, parsed.data.words))
})
