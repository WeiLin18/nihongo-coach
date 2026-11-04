import { z } from 'zod'
import { CATEGORIES } from './schema'

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

export type Passage = PassageDraft & { id: string; kind: PassageKind; createdAt: string }

export const SaveReadingCardsRequest = z.object({
  // Indexes into `words` of the words the learner misread.
  words: z.array(z.number().int().min(0)).min(1).max(10),
})
