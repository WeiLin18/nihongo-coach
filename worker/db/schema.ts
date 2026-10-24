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
