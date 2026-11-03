import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { CardDraft, Mode, WordAccent } from '../../shared/schema'

export const cards = sqliteTable(
  'cards',
  {
    id: text('id').primaryKey(),
    mode: text('mode').$type<Mode>().notNull(),
    source: text('source'),
    input: text('input').notNull(),
    ja: text('ja').notNull(),
    category: text('category').notNull(),
    draft: text('draft', { mode: 'json' }).$type<CardDraft>().notNull(),
    wordAccents: text('word_accents', { mode: 'json' }).$type<WordAccent[]>().notNull(),
    createdAt: text('created_at').notNull(),
    // SRS (FSRS, see worker/lib/review.ts). due_at is null until the card is first reviewed.
    dueAt: text('due_at'),
    stability: real('stability'),
    difficulty: real('difficulty'),
    reps: integer('reps').notNull().default(0),
    lapses: integer('lapses').notNull().default(0),
    state: integer('state').notNull().default(0), // ts-fsrs State: 0 new, 1 learning, 2 review, 3 relearning
    learningSteps: integer('learning_steps').notNull().default(0),
    scheduledDays: integer('scheduled_days').notNull().default(0),
    elapsedDays: integer('elapsed_days').notNull().default(0),
    lastReviewAt: text('last_review_at'),
  },
  (t) => [
    index('cards_category_idx').on(t.category),
    index('cards_created_idx').on(t.createdAt),
    index('cards_due_idx').on(t.dueAt),
  ],
)

// One row per review, for stats (reviewed today, streak) and future FSRS parameter tuning.
export const reviewLogs = sqliteTable(
  'review_logs',
  {
    id: text('id').primaryKey(),
    cardId: text('card_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(), // 1 Again, 2 Hard, 3 Good, 4 Easy
    state: integer('state').notNull(), // card state before this review
    dueAt: text('due_at').notNull(), // when the card was due before this review
    stability: real('stability').notNull(),
    difficulty: real('difficulty').notNull(),
    elapsedDays: integer('elapsed_days').notNull(),
    lastElapsedDays: integer('last_elapsed_days').notNull(),
    scheduledDays: integer('scheduled_days').notNull(),
    learningSteps: integer('learning_steps').notNull(),
    reviewedAt: text('reviewed_at').notNull(),
  },
  (t) => [index('review_logs_reviewed_idx').on(t.reviewedAt), index('review_logs_card_idx').on(t.cardId)],
)

// Pitch-accent dictionary, imported with scripts/import-accents.ts
export const accents = sqliteTable(
  'accents',
  {
    surface: text('surface').notNull(),
    reading: text('reading').notNull(), // hiragana
    accents: text('accents').notNull(), // e.g. "0" or "1,0"
  },
  (t) => [primaryKey({ columns: [t.surface, t.reading] }), index('accents_reading_idx').on(t.reading)],
)
