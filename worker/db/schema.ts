import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { CardDraft, Mode, PracticeKind, PracticeReply, PracticeScenario, WordAccent } from '../../shared/schema'
import type { PassageDraft, PassageKind } from '../../shared/reading'

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

// Columns for content written ahead of time (e.g. by the /jp-daily skill) instead of on demand.
// All null for content generated in the app.
const prepared = {
  // Who wrote it, e.g. claude-daily.
  source: text('source'),
  // The day it is meant for (YYYY-MM-DD, the learner's local date); shown in the 今日 queue that day.
  preparedFor: text('prepared_for'),
  // `${source}:${preparedFor}:${slot}`, unique, so saving the same slot twice keeps one row.
  dailyKey: text('daily_key'),
  // First time the learner opened it; prepared items leave the 今日 queue once opened.
  openedAt: text('opened_at'),
}

// Kanji reading passages, kept so recent topics and words are not repeated.
export const passages = sqliteTable(
  'passages',
  {
    id: text('id').primaryKey(),
    kind: text('kind').$type<PassageKind>().notNull(),
    topic: text('topic').notNull(),
    draft: text('draft', { mode: 'json' }).$type<PassageDraft>().notNull(),
    createdAt: text('created_at').notNull(),
    ...prepared,
    // Link to the news article a prepared passage was rewritten from.
    sourceUrl: text('source_url'),
    // When the learner revealed the readings (or marked it read by hand); null = unread.
    readAt: text('read_at'),
    // When the learner archived it; archived passages leave the main list but still count as recent topics.
    archivedAt: text('archived_at'),
  },
  (t) => [index('passages_created_idx').on(t.createdAt), uniqueIndex('passages_daily_key_idx').on(t.dailyKey)],
)

// Conversation practice: one row per drill, one per learner reply.
export const practiceSessions = sqliteTable(
  'practice_sessions',
  {
    id: text('id').primaryKey(),
    kind: text('kind').$type<PracticeKind>().notNull(),
    // The seed theme picked by the server (e.g. レビュー依頼), used to avoid recent repeats.
    theme: text('theme').notNull(),
    scenario: text('scenario', { mode: 'json' }).$type<PracticeScenario>().notNull(),
    done: integer('done', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull(),
    ...prepared,
  },
  (t) => [index('practice_sessions_created_idx').on(t.createdAt), uniqueIndex('practice_sessions_daily_key_idx').on(t.dailyKey)],
)

export const practiceTurns = sqliteTable(
  'practice_turns',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => practiceSessions.id, { onDelete: 'cascade' }),
    idx: integer('idx').notNull(),
    text: text('text').notNull(),
    reply: text('reply', { mode: 'json' }).$type<PracticeReply>().notNull(),
    // Set once the correction is saved as a card.
    cardId: text('card_id'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [uniqueIndex('practice_turns_session_idx').on(t.sessionId, t.idx)],
)
