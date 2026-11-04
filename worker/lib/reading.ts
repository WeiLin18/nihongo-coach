import { desc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { PassageDraft, type Passage, type PassageKind } from '../../shared/reading'
import type { Card, CardDraft } from '../../shared/schema'
import { passages } from '../db/schema'
import { RefusalError } from './ai'
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

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY })
  const response = await client.responses.parse({
    model: env.OPENAI_MODEL_READING,
    instructions: READING_SYSTEM,
    input,
    reasoning: { effort: 'none' },
    text: { format: zodTextFormat(PassageDraft, 'passage') },
  })
  const refused = response.output.some((o) => o.type === 'message' && o.content.some((c) => c.type === 'refusal'))
  if (refused) throw new RefusalError('AI declined this request')
  if (!response.output_parsed) throw new Error(`Could not parse passage (status: ${response.status})`)

  const row = {
    id: crypto.randomUUID(),
    kind,
    topic: response.output_parsed.topic,
    draft: response.output_parsed,
    createdAt: new Date().toISOString(),
  }
  await drizzle(env.DB).insert(passages).values(row)
  return toPassage(row)
}

export const toPassage = (r: typeof passages.$inferSelect): Passage => ({ ...r.draft, id: r.id, kind: r.kind, createdAt: r.createdAt })

export async function getPassage(env: Env, id: string): Promise<Passage | null> {
  const row = await drizzle(env.DB).select().from(passages).where(eq(passages.id, id)).get()
  return row ? toPassage(row) : null
}

export async function listPassages(env: Env, limit = 20): Promise<Pick<Passage, 'id' | 'kind' | 'title' | 'topic' | 'createdAt'>[]> {
  const rows = await drizzle(env.DB).select().from(passages).orderBy(desc(passages.createdAt)).limit(limit)
  return rows.map(({ id, kind, topic, draft, createdAt }) => ({ id, kind, topic, title: draft.title, createdAt }))
}

const sentenceText = (s: PassageDraft['sentences'][number]) => s.tokens.map((t) => t.text).join('')
const sentenceReading = (s: PassageDraft['sentences'][number]) => s.tokens.map((t) => t.reading || t.text).join('')

// Turns misread words into lookup cards, with the passage sentence as the first example.
export async function saveReadingCards(env: Env, passage: Passage, indexes: number[]): Promise<Card[]> {
  const saved: Card[] = []
  for (const i of [...new Set(indexes)]) {
    const w = passage.words[i]
    if (!w) continue
    const sentence = passage.sentences.find((s) => s.tokens.some((t) => t.text === w.surface)) ?? passage.sentences[0]
    const draft: CardDraft = {
      ja: w.lemma,
      reading: w.reading,
      zh: w.zh,
      en: w.en,
      nuance: [w.note, `出自讀音練習「${passage.title}」`].filter(Boolean).join('\n'),
      politeness: 'neutral',
      category: passage.category,
      examples: [{ ja: sentenceText(sentence), reading: sentenceReading(sentence), zh: sentence.zh }, w.example],
      words: [{ surface: w.lemma, reading: w.reading }],
      correction: null,
    }
    saved.push(await saveCard(env, { mode: 'lookup', source: 'reading', input: w.surface, draft }))
  }
  return saved
}
