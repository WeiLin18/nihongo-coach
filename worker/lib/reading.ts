import { and, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { zodTextFormat } from 'openai/helpers/zod'
import {
  PassageDraft,
  type Passage,
  type PassageKind,
  type PassageState,
  type PassageStatus,
  type PassageSummary,
  type SavedWord,
  type SavePassageRequest,
  type UpdatePassageRequest,
} from '../../shared/reading'
import type { CardDraft } from '../../shared/schema'
import { cards, passages } from '../db/schema'
import { parseStructured } from './ai'
import { saveCard } from './cards'

const READING_SYSTEM = `You write short Japanese passages for kanji reading practice.
The learner is a Taiwanese front-end engineer working in Tokyo, around JLPT N1. They read the passage aloud without furigana first, then check the readings.

Rules:
- 3-6 sentences, natural modern Japanese as written or spoken by native speakers. No furigana or readings inside the text.
- Include 5-8 words whose readings even advanced learners misread: on/kun choice, rendaku, irregular or easily confused readings, and words Chinese speakers misread by analogy.
  The kind of word meant (examples only; do not just reuse them, vary widely): 重複 ちょうふく, 相殺 そうさい, 早急 さっきゅう, 手続き てつづき, 為替 かわせ, 境内 けいだい, 発足 ほっそく, 依存 いぞん, 貼付 ちょうふ, 有無 うむ.
  Skip trivial words like 会議 or 仕事. The passage must read naturally: pick words that fit the story, not a story built around a word list.
- Give the standard reading. When two readings are both in use (早急 さっきゅう/そうきゅう), use the more standard one and mention the other in \`note\`.
- Tokens: split every sentence into tokens so that concatenating \`text\` gives the sentence exactly. A token is a word or a run of kana/punctuation.
  Every token that contains kanji gets its full reading in hiragana in \`reading\` (including okurigana: 確かめる → たしかめる); kana-only tokens get "".
  Keep each tricky word in a single token so its reading can be shown as one unit.
- \`words\`: 4-10 of the trickiest kanji words, in passage order. \`surface\` must equal the \`text\` of one token.
- Write \`zh\`, \`topic\` and \`note\` in Traditional Chinese as used in Taiwan. Readings are always hiragana.`

const KIND_TASKS: Record<PassageKind, string> = {
  conversation: 'Write a conversation between 2-3 people. Each sentence is one line; set `speaker` to a Japanese surname.',
  news: 'Write a news-style report (as in NHK or a tech news site), formal written style. `speaker` is null.',
}

const SCENES = {
  work: 'Scene: work at a Japanese tech company (meetings, releases, specs, incidents, code review, contracts, hiring, budgets).',
  life: 'Scene: everyday life in Tokyo (housing and ward office procedures, trains, weather and disasters, shops, events, health, neighborhoods).',
}

const RECENT = 12

// The previous kind and recent topics/words, so the next passage alternates and does not repeat.
async function recentPassages(env: Env) {
  const rows = await drizzle(env.DB).select().from(passages).orderBy(desc(passages.createdAt)).limit(RECENT)
  return {
    lastKind: rows[0]?.kind,
    topics: rows.map((r) => r.topic),
    words: [...new Set(rows.flatMap((r) => r.draft.words.map((w) => w.lemma)))],
  }
}

export async function generatePassage(env: Env, requested?: PassageKind): Promise<Passage> {
  const recent = await recentPassages(env)
  const kind = requested ?? (recent.lastKind === 'conversation' ? 'news' : 'conversation')
  const scene = Math.random() < 0.5 ? SCENES.work : SCENES.life
  const input = [
    KIND_TASKS[kind],
    scene,
    recent.topics.length ? `Recent topics (pick something different):\n${recent.topics.map((t) => `- ${t}`).join('\n')}` : null,
    recent.words.length ? `Words already practiced (do not use them as tricky words):\n${recent.words.join('、')}` : null,
  ]
    .filter(Boolean)
    .join('\n\n')

  const draft = alignSurfaces(
    await parseStructured(
      env,
      {
        model: env.OPENAI_MODEL_READING,
        instructions: READING_SYSTEM,
        input,
        reasoning: { effort: 'none' },
        text: { format: zodTextFormat(PassageDraft, 'passage') },
      },
      PassageDraft,
    ),
  )
  const row = { ...NOT_PREPARED, id: crypto.randomUUID(), kind, topic: draft.topic, draft, createdAt: new Date().toISOString() }
  await drizzle(env.DB).insert(passages).values(row)
  return { ...toPassage(row), saved: [] }
}

const NOT_PREPARED = { source: null, preparedFor: null, dailyKey: null, openedAt: null, sourceUrl: null, readAt: null, archivedAt: null }

// Saves a passage written elsewhere (the /jp-daily skill), so no API call is made here.
// The same source + date + slot is saved once: a second save returns the first passage.
export async function savePreparedPassage(env: Env, req: SavePassageRequest): Promise<{ created: boolean; passage: Passage }> {
  const draft = alignSurfaces(req.draft)
  const dailyKey = `${req.source}:${req.date}:${req.slot}`
  const inserted = await drizzle(env.DB)
    .insert(passages)
    .values({
      id: crypto.randomUUID(),
      kind: req.kind,
      topic: draft.topic,
      draft,
      createdAt: new Date().toISOString(),
      source: req.source,
      preparedFor: req.date,
      dailyKey,
      openedAt: null,
      sourceUrl: req.sourceUrl ?? null,
      readAt: null,
      archivedAt: null,
    })
    .onConflictDoNothing({ target: passages.dailyKey })
    .returning({ id: passages.id })
  const id = inserted[0]?.id ?? (await drizzle(env.DB).select({ id: passages.id }).from(passages).where(eq(passages.dailyKey, dailyKey)).get())?.id
  const passage = id && (await getPassage(env, id))
  if (!passage) throw new Error('prepared passage not found after saving')
  return { created: inserted.length > 0, passage }
}

// Takes a prepared passage out of the 今日 queue the first time the learner opens it.
export async function markPassageOpened(env: Env, id: string) {
  await drizzle(env.DB)
    .update(passages)
    .set({ openedAt: new Date().toISOString() })
    .where(and(eq(passages.id, id), isNull(passages.openedAt)))
}

type Sentence = PassageDraft['sentences'][number]
const sentenceText = (s: Sentence) => s.tokens.map((t) => t.text).join('')
const sentenceReading = (s: Sentence) => s.tokens.map((t) => t.reading || t.text).join('')

// The model sometimes writes a word's surface differently from its token (伴う for 伴い, or a token
// that also holds a particle). Point each word at the token that contains it, so it can be tapped.
function alignSurfaces(draft: PassageDraft): PassageDraft {
  const tokens = draft.sentences.flatMap((s) => s.tokens).filter((t) => t.reading)
  const words = draft.words.map((w) => {
    if (tokens.some((t) => t.text === w.surface)) return w
    const stem = w.lemma.slice(0, -1) || w.lemma
    const hit = tokens.find((t) => t.text.includes(w.surface)) ?? tokens.find((t) => t.text.startsWith(stem))
    return hit ? { ...w, surface: hit.text } : w
  })
  return { ...draft, words }
}

const toPassage = (r: typeof passages.$inferSelect): Omit<Passage, 'saved'> => ({
  ...r.draft,
  id: r.id,
  kind: r.kind,
  createdAt: r.createdAt,
  source: r.source,
  preparedFor: r.preparedFor,
  openedAt: r.openedAt,
  sourceUrl: r.sourceUrl,
  readAt: r.readAt,
  archivedAt: r.archivedAt,
})

// Words of the passage that already have a reading card, matched by dictionary form.
async function savedWords(env: Env, words: PassageDraft['words']): Promise<SavedWord[]> {
  const rows = await drizzle(env.DB)
    .select({ id: cards.id, ja: cards.ja })
    .from(cards)
    .where(and(eq(cards.source, 'reading'), inArray(cards.ja, words.map((w) => w.lemma))))
  return words.flatMap((w, index) => {
    const card = rows.find((r) => r.ja === w.lemma)
    return card ? [{ index, cardId: card.id }] : []
  })
}

export async function getPassage(env: Env, id: string): Promise<Passage | null> {
  const row = await drizzle(env.DB).select().from(passages).where(eq(passages.id, id)).get()
  if (!row) return null
  const passage = toPassage(row)
  return { ...passage, saved: await savedWords(env, passage.words) }
}

const STATUS_FILTERS: Record<PassageStatus | 'default', SQL | undefined> = {
  default: isNull(passages.archivedAt),
  unread: and(isNull(passages.readAt), isNull(passages.archivedAt)),
  read: and(isNotNull(passages.readAt), isNull(passages.archivedAt)),
  archived: isNotNull(passages.archivedAt),
  all: undefined,
}

// Newest first. Without a status, archived passages are left out.
export async function listPassages(env: Env, status?: PassageStatus, limit = 50): Promise<PassageSummary[]> {
  return drizzle(env.DB)
    .select({
      id: passages.id,
      kind: passages.kind,
      topic: passages.topic,
      // Only the title of the draft, so the list does not carry every passage's full text.
      title: sql<string>`json_extract(${passages.draft}, '$.title')`,
      createdAt: passages.createdAt,
      source: passages.source,
      preparedFor: passages.preparedFor,
      openedAt: passages.openedAt,
      dailyKey: passages.dailyKey,
      readAt: passages.readAt,
      archivedAt: passages.archivedAt,
    })
    .from(passages)
    .where(STATUS_FILTERS[status ?? 'default'])
    .orderBy(desc(passages.createdAt))
    .limit(limit)
}

// Marks a passage read/unread and archived/unarchived. Setting a flag that is already set keeps its first time.
export async function updatePassageState(env: Env, id: string, req: UpdatePassageRequest): Promise<PassageState | null> {
  const now = new Date().toISOString()
  const set: { readAt?: SQL | null; archivedAt?: SQL | null } = {}
  if (req.read !== undefined) set.readAt = req.read ? sql`coalesce(${passages.readAt}, ${now})` : null
  if (req.archived !== undefined) set.archivedAt = req.archived ? sql`coalesce(${passages.archivedAt}, ${now})` : null
  return (
    (await drizzle(env.DB)
      .update(passages)
      .set(set)
      .where(eq(passages.id, id))
      .returning({ readAt: passages.readAt, archivedAt: passages.archivedAt })
      .get()) ?? null
  )
}

// Archives every read passage that is not archived yet; returns their ids (so the app can undo).
export async function archiveReadPassages(env: Env): Promise<string[]> {
  const rows = await drizzle(env.DB)
    .update(passages)
    .set({ archivedAt: new Date().toISOString() })
    .where(and(isNotNull(passages.readAt), isNull(passages.archivedAt)))
    .returning({ id: passages.id })
  return rows.map((r) => r.id)
}

// Turns misread words into lookup cards, with the passage sentence as the first example.
// Words that already have a reading card are skipped. Returns every saved word of the passage.
export async function saveReadingCards(env: Env, passage: Passage, indexes: number[]): Promise<SavedWord[]> {
  const already = new Set(passage.saved.map((s) => s.index))
  const todo = [...new Set(indexes)].filter((i) => passage.words[i] && !already.has(i))
  const added = await Promise.all(
    todo.map(async (index): Promise<SavedWord> => {
      const w = passage.words[index]
      const sentence =
        passage.sentences.find((s) => sentenceText(s).includes(w.surface)) ??
        passage.sentences.find((s) => sentenceText(s).includes(w.lemma.slice(0, -1) || w.lemma))
      const draft: CardDraft = {
        ja: w.lemma,
        reading: w.reading,
        zh: w.zh,
        en: w.en,
        nuance: [w.note, `出自讀音練習「${passage.title}」`].filter(Boolean).join('\n'),
        politeness: 'neutral',
        category: passage.category,
        examples: sentence ? [{ ja: sentenceText(sentence), reading: sentenceReading(sentence), zh: sentence.zh }, w.example] : [w.example],
        words: [{ surface: w.lemma, reading: w.reading }],
        correction: null,
      }
      const card = await saveCard(env, { mode: 'lookup', source: 'reading', input: w.surface, draft })
      return { index, cardId: card.id }
    }),
  )
  return [...passage.saved, ...added].sort((a, b) => a.index - b.index)
}
