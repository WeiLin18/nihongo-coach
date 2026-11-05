import { and, asc, count, eq, gte, lte, ne, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { createEmptyCard, fsrs, Rating, State, type Card as FsrsCard, type Grade } from 'ts-fsrs'
import type { ReviewCard, ReviewQueue, ReviewStats } from '../../shared/schema'
import { cards, reviewLogs } from '../db/schema'
import { toCard } from './cards'

type Row = typeof cards.$inferSelect

// Fuzz spreads reviews out so cards saved together don't stay due together. The button labels use the
// un-fuzzed interval, since the fuzz is drawn again (differently) when the rating is submitted.
const scheduler = fsrs({ enable_fuzz: true })
const previewScheduler = fsrs({ enable_fuzz: false })
const GRADES: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]
// Learning cards due within this window are shown now rather than making the user wait (Anki's "learn ahead").
const LEARN_AHEAD_MS = 20 * 60_000
const DAY_MS = 86_400_000

// `tz` is the client's UTC offset in minutes (e.g. 480 for Taipei), so "today" follows the user's clock.
export const dayStart = (now: Date, tz: number) =>
  new Date(Math.floor((now.getTime() + tz * 60_000) / DAY_MS) * DAY_MS - tz * 60_000)

const toFsrs = (r: Row): FsrsCard =>
  r.state === State.New
    ? createEmptyCard(new Date(r.createdAt))
    : {
        due: new Date(r.dueAt ?? r.createdAt),
        stability: r.stability ?? 0,
        difficulty: r.difficulty ?? 0,
        elapsed_days: r.elapsedDays,
        scheduled_days: r.scheduledDays,
        learning_steps: r.learningSteps,
        reps: r.reps,
        lapses: r.lapses,
        state: r.state,
        last_review: r.lastReviewAt ? new Date(r.lastReviewAt) : undefined,
      }

function toReviewCard(r: Row, now: Date): ReviewCard {
  const preview = previewScheduler.repeat(toFsrs(r), now)
  return {
    ...toCard(r),
    srs: { state: r.state, dueAt: r.dueAt, reps: r.reps, lapses: r.lapses },
    intervals: Object.fromEntries(
      GRADES.map((g) => [g, preview[g].card.due.getTime() - now.getTime()]),
    ) as ReviewCard['intervals'],
  }
}

export async function reviewStats(env: Env, tz: number, newPerDay: number, now = new Date()): Promise<ReviewStats> {
  const db = drizzle(env.DB)
  const today = dayStart(now, tz).toISOString()
  const ahead = new Date(now.getTime() + LEARN_AHEAD_MS).toISOString()
  const [[due], [fresh], [done], [newDone], days] = await Promise.all([
    db
      .select({ n: count() })
      .from(cards)
      .where(and(ne(cards.state, State.New), lte(cards.dueAt, ahead))),
    db.select({ n: count() }).from(cards).where(eq(cards.state, State.New)),
    db.select({ n: count() }).from(reviewLogs).where(gte(reviewLogs.reviewedAt, today)),
    db
      .select({ n: count() })
      .from(reviewLogs)
      .where(and(gte(reviewLogs.reviewedAt, today), eq(reviewLogs.state, State.New))),
    // Local calendar days with at least one review, newest first.
    db
      .selectDistinct({ day: sql<string>`date(${reviewLogs.reviewedAt}, ${`${tz} minutes`})` })
      .from(reviewLogs)
      .orderBy(sql`1 desc`)
      .limit(400),
  ])
  return {
    due: due.n,
    new: Math.min(fresh.n, Math.max(newPerDay - newDone.n, 0)),
    reviewedToday: done.n,
    streak: streak(
      days.map((d) => d.day),
      now,
      tz,
    ),
  }
}

// Consecutive days with reviews, ending today (or yesterday, so the streak is not lost before today's review).
function streak(days: string[], now: Date, tz: number): number {
  const set = new Set(days)
  const local = (offset: number) => new Date(now.getTime() + tz * 60_000 - offset * DAY_MS).toISOString().slice(0, 10)
  const start = set.has(local(0)) ? 0 : 1
  let n = 0
  while (set.has(local(start + n))) n++
  return n
}

// Due cards first (most overdue first), then today's remaining new cards (oldest saved first).
export async function reviewQueue(env: Env, tz: number, newPerDay: number, now = new Date()): Promise<ReviewQueue> {
  const db = drizzle(env.DB)
  const stats = await reviewStats(env, tz, newPerDay, now)
  const ahead = new Date(now.getTime() + LEARN_AHEAD_MS).toISOString()
  const [due, fresh] = await Promise.all([
    db
      .select()
      .from(cards)
      .where(and(ne(cards.state, State.New), lte(cards.dueAt, ahead)))
      .orderBy(asc(cards.dueAt))
      .limit(200),
    stats.new > 0
      ? db.select().from(cards).where(eq(cards.state, State.New)).orderBy(asc(cards.createdAt)).limit(stats.new)
      : [],
  ])
  return { cards: [...due, ...fresh].map((r) => toReviewCard(r, now)), stats }
}

export async function submitReview(env: Env, id: string, rating: Grade, now = new Date()): Promise<boolean> {
  const db = drizzle(env.DB)
  const row = await db.select().from(cards).where(eq(cards.id, id)).get()
  if (!row) return false
  const { card, log } = scheduler.next(toFsrs(row), now, rating)
  await db.batch([
    db
      .update(cards)
      .set({
        dueAt: card.due.toISOString(),
        stability: card.stability,
        difficulty: card.difficulty,
        reps: card.reps,
        lapses: card.lapses,
        state: card.state,
        learningSteps: card.learning_steps,
        scheduledDays: card.scheduled_days,
        elapsedDays: card.elapsed_days,
        lastReviewAt: now.toISOString(),
      })
      .where(eq(cards.id, id)),
    db.insert(reviewLogs).values({
      id: crypto.randomUUID(),
      cardId: id,
      rating: log.rating,
      state: log.state,
      dueAt: log.due.toISOString(),
      stability: log.stability,
      difficulty: log.difficulty,
      elapsedDays: log.elapsed_days,
      lastElapsedDays: log.last_elapsed_days,
      scheduledDays: log.scheduled_days,
      learningSteps: log.learning_steps,
      reviewedAt: now.toISOString(),
    }),
  ])
  return true
}
