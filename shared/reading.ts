import { z } from 'zod'
import { CATEGORIES, PreparedFields, type PreparedInfo } from './schema'

export const PASSAGE_KINDS = ['conversation', 'news'] as const
export type PassageKind = (typeof PASSAGE_KINDS)[number]

export const KIND_LABELS: Record<PassageKind, string> = { conversation: '對話', news: '新聞' }

export const ReadingRequest = z.object({
  // Omitted: alternate with the previous passage.
  kind: z.enum(PASSAGE_KINDS).optional(),
})
export type ReadingRequest = z.infer<typeof ReadingRequest>

// What the model returns for a kanji reading passage. Readings live on the tokens so
// furigana can be hidden first and revealed later.
export const PassageDraft = z.object({
  title: z.string().describe('Short Japanese title for the passage'),
  topic: z.string().describe('One-line summary of the topic in Traditional Chinese, used to avoid repeating topics'),
  category: z.enum(CATEGORIES),
  sentences: z
    .array(
      z.object({
        speaker: z.string().nullable().describe('Speaker name for conversation lines, e.g. 田中; null for news'),
        tokens: z
          .array(
            z.object({
              text: z.string(),
              reading: z.string().describe('Hiragana reading if `text` contains kanji, otherwise an empty string'),
            }),
          )
          .describe('The sentence split into tokens; concatenating `text` gives the exact sentence'),
        zh: z.string().describe('Traditional Chinese (Taiwan) translation'),
      }),
    )
    .min(3)
    .max(6),
  words: z
    .array(
      z.object({
        surface: z.string().describe('The word exactly as written in one token of the passage'),
        lemma: z.string().describe('Dictionary form, e.g. 賄う for 賄って'),
        reading: z.string().describe('Hiragana reading of `lemma`'),
        zh: z.string().describe('Traditional Chinese (Taiwan) meaning'),
        en: z.string().describe('English meaning'),
        note: z.string().describe('In Traditional Chinese, briefly: the usual misreading and why; empty string if nothing to add'),
        example: z
          .object({ ja: z.string(), reading: z.string(), zh: z.string() })
          .describe('Another natural sentence using the word, not taken from the passage'),
      }),
    )
    .min(4)
    .max(10)
    .describe('The tricky kanji words of the passage, in passage order'),
})
export type PassageDraft = z.infer<typeof PassageDraft>

// A word of the passage already saved as a card (from this or an earlier passage).
export type SavedWord = { index: number; cardId: string }

export type Passage = PassageDraft &
  PreparedInfo & {
    id: string
    kind: PassageKind
    createdAt: string
    // The news article a prepared passage was rewritten from.
    sourceUrl: string | null
    saved: SavedWord[]
  } & PassageState

// Read when the readings were revealed (or marked by hand); archived passages leave the main list.
// Both can be set at once.
export type PassageState = { readAt: string | null; archivedAt: string | null }

export type PassageSummary = Pick<
  Passage,
  'id' | 'kind' | 'title' | 'topic' | 'createdAt' | 'source' | 'preparedFor' | 'openedAt' | 'readAt' | 'archivedAt'
> & {
  dailyKey: string | null
}

// GET /api/reading?status=… — omitted: everything except archived passages.
export const PASSAGE_STATUSES = ['unread', 'read', 'archived', 'all'] as const
export type PassageStatus = (typeof PASSAGE_STATUSES)[number]
export const PassageListQuery = z.object({
  status: z.enum(PASSAGE_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
})

export const UpdatePassageRequest = z
  .object({ read: z.boolean().optional(), archived: z.boolean().optional() })
  .refine((r) => r.read !== undefined || r.archived !== undefined, 'read or archived is required')
export type UpdatePassageRequest = z.infer<typeof UpdatePassageRequest>

// A passage someone else already wrote, saved without calling the AI.
export const SavePassageRequest = z.object({
  ...PreparedFields,
  kind: z.enum(PASSAGE_KINDS),
  sourceUrl: z.url({ protocol: /^https?$/ }).max(500).optional(),
  draft: PassageDraft,
})
export type SavePassageRequest = z.infer<typeof SavePassageRequest>

export const SaveReadingCardsRequest = z.object({
  // Indexes into `words` of the words the learner misread.
  words: z.array(z.number().int().min(0)).min(1).max(10),
})
