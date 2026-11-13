import { Hono } from 'hono'
import { PassageListQuery, ReadingRequest, SavePassageRequest, SaveReadingCardsRequest, UpdatePassageRequest } from '../shared/reading'
import {
  archiveReadPassages,
  generatePassage,
  getPassage,
  listPassages,
  markPassageOpened,
  savePreparedPassage,
  saveReadingCards,
  updatePassageState,
} from './lib/reading'

// Kanji reading practice, mounted at /api/reading (auth and errors are handled by the parent app).
export const reading = new Hono<{ Bindings: Env }>()

// ?status=unread|read|archived|all (omitted: everything but archived), ?limit= (default 50).
reading.get('/', async (c) => {
  const parsed = PassageListQuery.safeParse(c.req.query())
  if (!parsed.success) return c.json({ error: parsed.error.issues }, 400)
  return c.json(await listPassages(c.env, parsed.data.status, parsed.data.limit))
})

// Archives every read passage at once; returns the ids archived.
reading.post('/archive-read', async (c) => c.json({ ids: await archiveReadPassages(c.env) }))

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

// { read?, archived? } marks the passage read/unread and archived/unarchived.
reading.patch('/:id', async (c) => {
  const parsed = UpdatePassageRequest.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: parsed.error.issues }, 400)
  const state = await updatePassageState(c.env, c.req.param('id'), parsed.data)
  if (!state) return c.json({ error: 'not found' }, 404)
  return c.json(state)
})
