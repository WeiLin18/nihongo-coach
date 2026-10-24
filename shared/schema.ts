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
