import { z } from 'zod'

export const MODES = ['lookup', 'zh2ja', 'naturalize'] as const
export type Mode = (typeof MODES)[number]

export const MODE_LABELS: Record<Mode, string> = {
  lookup: '查詞',
  zh2ja: '我想說',
  naturalize: '幫我改',
}

export const CATEGORIES = [
  '食',
  '美容・沙龍',
  '工作・會議',
  '購物',
  '交通',
  '住・生活',
  '行政・醫療',
  '社交・閒聊',
  '網路用語',
  '其他',
] as const

export const AskRequest = z.object({
  mode: z.enum(MODES),
  text: z.string().trim().min(1).max(2000),
  // Optional situation hint, e.g. "在沙龍跟設計師說話"
  context: z.string().max(500).optional(),
  // Where the text came from, e.g. "threads", "youtube", "shortcut"
  source: z.string().max(50).optional(),
})
export type AskRequest = z.infer<typeof AskRequest>

// 🔊 playback. With `reading` (a single word), the server takes the accent from the dictionary and
// pins reading and accent with SSML, so a lone kanji like 端 or 命 is not read as たん or めい.
// `parts` (a sentence split into tokens with readings) pins the readings only; a part whose
// reading is not plain kana is just read as written.
export const KANA = /^[\u3041-\u309f\u30a0-\u30ffー]+$/
export const TtsRequest = z.object({
  text: z.string().trim().min(1).max(300),
  reading: z.string().regex(KANA).max(40).optional(),
  parts: z
    .array(z.object({ text: z.string().max(80), reading: z.string().max(80) }))
    .max(120)
    .optional(),
})
export type TtsRequest = z.infer<typeof TtsRequest>

// What Claude returns. Pitch accent is deliberately NOT part of this: LLMs get
// it wrong too often, so it is filled from the accent dictionary instead.
export const CardDraft = z.object({
  ja: z.string().describe('The main Japanese expression: the looked-up word, or the natural spoken sentence'),
  reading: z.string().describe('Full reading of `ja` in hiragana'),
  zh: z.string().describe('Traditional Chinese (Taiwan) meaning'),
  en: z.string().describe('English meaning'),
  nuance: z.string().describe('In Traditional Chinese: when/how to use it, register, nuance, common pitfalls'),
  politeness: z.enum(['casual', 'neutral', 'polite', 'keigo']),
  category: z.enum(CATEGORIES),
  examples: z
    .array(z.object({ ja: z.string(), reading: z.string(), zh: z.string() }))
    .min(2)
    .max(3)
    .describe('2-3 natural spoken example sentences'),
  words: z
    .array(z.object({ surface: z.string(), reading: z.string() }))
    .describe('Key vocabulary in dictionary form with hiragana reading, used for pitch-accent lookup; the head word first'),
  correction: z
    .object({ original: z.string(), why: z.string() })
    .nullable()
    .describe('naturalize mode only: the learner original and, in Traditional Chinese, why it sounded unnatural; null otherwise'),
})
export type CardDraft = z.infer<typeof CardDraft>

export const SaveCardRequest = z.object({
  mode: z.enum(MODES),
  input: z.string().trim().min(1).max(2000),
  source: z.string().max(50).optional(),
  draft: CardDraft,
})
export type SaveCardRequest = z.infer<typeof SaveCardRequest>

// Content written ahead of time (e.g. by the /jp-daily skill) for the 今日 queue.
// Saving the same source + date + slot again returns the existing item instead of adding one.
export const PreparedFields = {
  date: z.iso.date().describe("The learner's local date the item is for, YYYY-MM-DD"),
  slot: z
    .string()
    .regex(/^[a-z0-9-]{1,30}$/)
    .describe('Which item of the day, e.g. news, work, drill-1'),
  source: z.string().regex(/^[a-z0-9-]{1,50}$/).default('claude-daily'),
}

// Set on prepared items; all null for items generated in the app.
export type PreparedInfo = { source: string | null; preparedFor: string | null; openedAt: string | null }

export type WordAccent = {
  surface: string
  reading: string
  // Accent nucleus positions from the dictionary (several when variants exist);
  // null when the word is not in the dictionary.
  accents: number[] | null
}

export type Card = CardDraft & {
  id: string
  mode: Mode
  source: string | null
  input: string
  wordAccents: WordAccent[]
  createdAt: string
}

// Conversation practice (會話練習)

export const PRACTICE_KINDS = ['work', 'life'] as const
export type PracticeKind = (typeof PRACTICE_KINDS)[number]

export const PRACTICE_KIND_LABELS: Record<PracticeKind, string> = { work: '工作', life: '生活' }

// Japanese lines may mark hard words with readings as {漢字|かんじ}; see src/components/Ruby.tsx.
const RUBY =
  'Mark readings as {漢字|かんじ} only on rare or hard-to-read words (beyond JLPT N1, uncommon kanji, irregular readings); most lines need none.'

const PartnerLine = z.object({
  ja: z.string().describe(`The other person's line in natural spoken Japanese. ${RUBY}`),
  zh: z.string().describe('Traditional Chinese (Taiwan) translation, shown only on request'),
})

// What the AI writes to open a drill. No model answer: the learner replies first.
export const PracticeScenario = z.object({
  title: z.string().describe('Short scene title in Traditional Chinese, e.g. 跟 PM 回報進度延遲'),
  situation: z.string().describe('In Traditional Chinese, 1-2 sentences: where, who, what is going on'),
  userRole: z.string().describe("In Traditional Chinese: the learner's role in the scene"),
  partnerRole: z.string().describe('In Traditional Chinese: who the other person is, e.g. PM 佐藤さん'),
  goal: z.string().describe('In Traditional Chinese, one short line: what the learner should try to get done'),
  partner: PartnerLine.describe('The opening line or question the learner must reply to'),
})
export type PracticeScenario = z.infer<typeof PracticeScenario>

// What the AI writes after each learner reply.
export const PracticeReply = z.object({
  verdict: z
    .enum(['natural', 'minor', 'unnatural'])
    .describe('natural: fine as is; minor: small wording or register fix; unnatural: a native speaker would not say it'),
  natural: z
    .string()
    .describe(`The natural spoken version keeping the learner's intent and register; their reply unchanged when verdict is natural. ${RUBY}`),
  explanation: z
    .string()
    .describe('In Traditional Chinese, 1-3 short sentences on what changed and why (nuance, register); empty string when natural'),
  partner: PartnerLine.nullable().describe("The other person's next line; when the conversation is over, a short closing line or null"),
  wrapUp: z
    .string()
    .nullable()
    .describe('Only when the conversation is over: 2-3 short sentences in Traditional Chinese on how it went and 1-2 expressions to remember; otherwise null'),
})
export type PracticeReply = z.infer<typeof PracticeReply>

export const StartPracticeRequest = z.object({ kind: z.enum(PRACTICE_KINDS).optional() })

// A drill someone else already wrote, saved without calling the AI.
export const SavePracticeRequest = z.object({
  ...PreparedFields,
  kind: z.enum(PRACTICE_KINDS),
  theme: z.string().trim().min(1).max(60).describe('Seed theme, e.g. one of the THEMES in worker/lib/practice.ts'),
  scenario: PracticeScenario,
})
export type SavePracticeRequest = z.infer<typeof SavePracticeRequest>
export const PracticeTurnRequest = z.object({ text: z.string().trim().min(1).max(500) })

export type PracticeTurn = {
  id: string
  idx: number
  text: string
  reply: PracticeReply
  cardId: string | null
  createdAt: string
}

export type PracticeSession = PreparedInfo & {
  id: string
  kind: PracticeKind
  theme: string
  scenario: PracticeScenario
  turns: PracticeTurn[]
  done: boolean
  createdAt: string
}

// Spaced-repetition speaking review (FSRS). Ratings follow ts-fsrs: 1 Again, 2 Hard, 3 Good, 4 Easy.
export const REVIEW_RATINGS = [1, 2, 3, 4] as const
export type ReviewRating = (typeof REVIEW_RATINGS)[number]

export const ReviewRequest = z.object({ rating: z.union(REVIEW_RATINGS.map((r) => z.literal(r))) })

export type ReviewStats = {
  due: number // learned cards due now
  new: number // new cards still allowed today
  reviewedToday: number
  streak: number // consecutive days with at least one review
}

export type ReviewCard = Card & {
  srs: { state: number; dueAt: string | null; reps: number; lapses: number }
  // Milliseconds until the card would be due again for each rating, shown on the buttons.
  intervals: Record<ReviewRating, number>
}

export type ReviewQueue = { cards: ReviewCard[]; stats: ReviewStats }
