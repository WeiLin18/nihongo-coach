import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
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
    // SRS (FSRS) fields, used from Phase 2
    dueAt: text('due_at'),
    stability: real('stability'),
    difficulty: real('difficulty'),
    reps: integer('reps').notNull().default(0),
  },
  (t) => [index('cards_category_idx').on(t.category), index('cards_created_idx').on(t.createdAt)],
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

// Kanji reading passages, kept so recent topics and words are not repeated.
export const passages = sqliteTable(
  'passages',
  {
    id: text('id').primaryKey(),
    kind: text('kind').$type<PassageKind>().notNull(),
    topic: text('topic').notNull(),
    draft: text('draft', { mode: 'json' }).$type<PassageDraft>().notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('passages_created_idx').on(t.createdAt)],
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
  },
  (t) => [index('practice_sessions_created_idx').on(t.createdAt)],
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
  (t) => [index('practice_turns_session_idx').on(t.sessionId, t.idx)],
)
