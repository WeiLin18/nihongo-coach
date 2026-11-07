import { and, asc, desc, eq, gte, isNull } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { zodTextFormat } from 'openai/helpers/zod'
import {
  PracticeReply,
  PracticeScenario,
  type Card,
  type PracticeKind,
  type PracticeSession,
  type PracticeTurn,
  type SavePracticeRequest,
} from '../../shared/schema'
import { stripRuby } from '../../shared/format'
import { cards, practiceSessions, practiceTurns } from '../db/schema'
import { draftCard, streamParsed, SYSTEM } from './ai'
import { saveCard, toCard } from './cards'

// A drill is the opening line plus this many learner replies at most, then a wrap-up.
export const MAX_TURNS = 4

// Seed themes. The server picks one the learner has not had recently; the model builds a concrete scene on it.
const THEMES: Record<PracticeKind, string[]> = {
  work: [
    '進捗報告（遅れの報告を含む）',
    '仕様確認（PM・デザイナーと）',
    'コードレビュー依頼',
    'レビューで指摘を受ける・返す',
    '優先順位の相談',
    'リリース日の相談',
    'E2E テストが落ちている',
    '本番障害の一次対応',
    '見積もり・工数の交渉',
    'デザインの実装可否を相談',
    '朝会・スタンドアップ',
    '上司との 1on1',
    '有給・早退の相談',
    '新メンバーのオンボーディング',
    'パフォーマンス改善の提案',
    'アクセシビリティの指摘を説明',
  ],
  life: [
    '買い物（返品・交換・在庫確認）',
    '飲食店（予約・注文・アレルギー）',
    '住まい（管理会社・不動産屋・修理）',
    '趣味の集まり・サークル',
    '美容院',
    '病院・薬局',
    '宅配の再配達・荷物',
    '役所の手続き',
    '携帯ショップ・ネット回線',
    'ご近所付き合い',
    '同僚との飲み会・雑談',
    '旅行・ホテルの予約',
    'ジム・習い事の体験',
  ],
}

const PRACTICE_RULES = `You run short spoken-conversation drills for this learner. They are a Taiwanese front-end engineer working at a Tokyo IT company.
- Scenes are realistic and specific to their life in Tokyo (people, product names, concrete details), not generic textbook dialogues.
- Japanese lines are natural spoken Japanese at the register the scene calls for (team chat tone with coworkers, polite with customers or seniors, keigo with shop staff when natural). Keep each line to 1-2 sentences.
- Mark readings as {漢字|かんじ} only on rare or hard-to-read words; an N1 learner reads 可能性 or 決済 fine, so most lines need no marks.
- Never show a model answer before the learner replies.`

const SCENARIO_TASK = `Create a new drill. Do not answer for the learner: end with the other person's opening line or question, which the learner must reply to.`

const REPLY_TASK = `The learner just replied. Coach them, then continue the conversation.
- Judge only naturalness for a native speaker in this scene: grammar, word choice, register, and what people actually say. Do not nitpick stylistic choices that are fine.
- \`natural\` keeps the learner's intent and content; do not add new information. If it is already natural, copy it unchanged and set verdict to natural.
- \`explanation\` is in Traditional Chinese (Taiwan), quoting Japanese only for the words in question. Keep it brief: what changed and why, focusing on nuance and register. No basic grammar lectures.
- \`partner\` reacts to what the learner actually said (as if they had said the natural version) and moves the scene forward.
- When the conversation is over, set \`wrapUp\`; \`partner\` may then be a short closing line that asks nothing, or null.`

// The transcript is all Japanese, so without a last reminder the model tends to explain in Japanese.
const LANGUAGE_REMINDER = 'Write `explanation` and `wrapUp` in Traditional Chinese (Taiwan), not Japanese.'

const db = (env: Env) => drizzle(env.DB)

// Aim for about 4 work / 3 life drills per week, based on the last 7 days.
async function pickKind(env: Env): Promise<PracticeKind> {
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
  const recent = await db(env)
    .select({ kind: practiceSessions.kind })
    .from(practiceSessions)
    .where(gte(practiceSessions.createdAt, since))
  if (recent.length === 0) return Math.random() < 4 / 7 ? 'work' : 'life'
  const work = recent.filter((r) => r.kind === 'work').length
  return work / recent.length < 4 / 7 ? 'work' : 'life'
}

export async function startPractice(
  env: Env,
  kindChoice: PracticeKind | undefined,
  onDelta: (text: string) => Promise<void>,
): Promise<PracticeSession> {
  const kind = kindChoice ?? (await pickKind(env))
  const recent = await db(env)
    .select({ kind: practiceSessions.kind, theme: practiceSessions.theme, scenario: practiceSessions.scenario })
    .from(practiceSessions)
    .orderBy(desc(practiceSessions.createdAt))
    .limit(15)

  // Skip themes of this kind used lately; keep a few candidates so it never runs dry.
  const themes = THEMES[kind]
  const used = recent.filter((r) => r.kind === kind).slice(0, themes.length - 3).map((r) => r.theme)
  const candidates = themes.filter((t) => !used.includes(t))
  const theme = candidates[Math.floor(Math.random() * candidates.length)]

  const input = [
    SCENARIO_TASK,
    `Kind: ${kind === 'work' ? 'work scene' : 'daily-life scene'}`,
    `Theme: ${theme}`,
    recent.length
      ? `Recent drills (make this one clearly different in setting, people, and what is asked):\n${recent.map((r) => `- ${r.scenario.title}`).join('\n')}`
      : null,
  ]
    .filter(Boolean)
    .join('\n\n')

  const scenario = await streamParsed(
    env,
    {
      model: env.OPENAI_MODEL_PRACTICE,
      instructions: `${SYSTEM}\n\n${PRACTICE_RULES}`,
      input,
      reasoning: { effort: 'none' },
      text: { format: zodTextFormat(PracticeScenario, 'scenario') },
    },
    PracticeScenario,
    onDelta,
  )

  const row = {
    id: crypto.randomUUID(),
    kind,
    theme,
    scenario,
    done: false,
    createdAt: new Date().toISOString(),
    source: null,
    preparedFor: null,
    dailyKey: null,
    openedAt: null,
  }
  await db(env).insert(practiceSessions).values(row)
  return { ...row, turns: [] }
}

// Saves a drill written elsewhere (the /jp-daily skill), so no API call is made here.
// The same source + date + slot is saved once: a second save returns the first drill.
export async function savePreparedPractice(env: Env, req: SavePracticeRequest): Promise<{ created: boolean; session: PracticeSession }> {
  const dailyKey = `${req.source}:${req.date}:${req.slot}`
  const inserted = await db(env)
    .insert(practiceSessions)
    .values({
      id: crypto.randomUUID(),
      kind: req.kind,
      theme: req.theme,
      scenario: req.scenario,
      done: false,
      createdAt: new Date().toISOString(),
      source: req.source,
      preparedFor: req.date,
      dailyKey,
      openedAt: null,
    })
    .onConflictDoNothing({ target: practiceSessions.dailyKey })
    .returning({ id: practiceSessions.id })
  const id =
    inserted[0]?.id ??
    (await db(env).select({ id: practiceSessions.id }).from(practiceSessions).where(eq(practiceSessions.dailyKey, dailyKey)).get())?.id
  const session = id && (await getPractice(env, id))
  if (!session) throw new Error('prepared drill not found after saving')
  return { created: inserted.length > 0, session }
}

// Takes a prepared drill out of the 今日 queue the first time the learner opens it.
export async function markPracticeOpened(env: Env, id: string) {
  await db(env)
    .update(practiceSessions)
    .set({ openedAt: new Date().toISOString() })
    .where(and(eq(practiceSessions.id, id), isNull(practiceSessions.openedAt)))
}

export async function getPractice(env: Env, id: string): Promise<PracticeSession | null> {
  const row = await db(env).select().from(practiceSessions).where(eq(practiceSessions.id, id)).get()
  if (!row) return null
  const { dailyKey: _, ...session } = row
  const turns = await db(env)
    .select({
      id: practiceTurns.id,
      idx: practiceTurns.idx,
      text: practiceTurns.text,
      reply: practiceTurns.reply,
      cardId: practiceTurns.cardId,
      createdAt: practiceTurns.createdAt,
    })
    .from(practiceTurns)
    .where(eq(practiceTurns.sessionId, id))
    .orderBy(asc(practiceTurns.idx))
  return { ...session, turns }
}

export async function listPractice(env: Env, limit: number) {
  return db(env)
    .select({
      id: practiceSessions.id,
      kind: practiceSessions.kind,
      scenario: practiceSessions.scenario,
      theme: practiceSessions.theme,
      done: practiceSessions.done,
      createdAt: practiceSessions.createdAt,
      source: practiceSessions.source,
      preparedFor: practiceSessions.preparedFor,
      openedAt: practiceSessions.openedAt,
      dailyKey: practiceSessions.dailyKey,
    })
    .from(practiceSessions)
    .orderBy(desc(practiceSessions.createdAt))
    .limit(limit)
}

// The line the learner was answering in turn `idx` (1-based).
const promptFor = (s: PracticeSession, idx: number) =>
  idx === 1 ? s.scenario.partner.ja : (s.turns[idx - 2]?.reply.partner?.ja ?? '')

function transcript(s: PracticeSession): string {
  const { scenario: sc } = s
  const lines = [
    `Scene: ${sc.title}`,
    `Situation: ${sc.situation}`,
    `Learner: ${sc.userRole}`,
    `Other person: ${sc.partnerRole}`,
    `Goal: ${sc.goal}`,
    '',
    'Conversation so far:',
    `Other: ${stripRuby(sc.partner.ja)}`,
  ]
  for (const t of s.turns) {
    lines.push(`Learner: ${t.text}`)
    if (t.reply.verdict !== 'natural') lines.push(`  (coach's natural version: ${stripRuby(t.reply.natural)})`)
    if (t.reply.partner) lines.push(`Other: ${stripRuby(t.reply.partner.ja)}`)
  }
  return lines.join('\n')
}

export async function replyPractice(
  env: Env,
  session: PracticeSession,
  text: string,
  onDelta: (text: string) => Promise<void>,
): Promise<{ turn: PracticeTurn; done: boolean }> {
  const idx = session.turns.length + 1
  const pacing =
    idx >= MAX_TURNS
      ? 'This is the last reply: end the conversation now (fill wrapUp).'
      : idx >= MAX_TURNS - 1
        ? `This is reply ${idx} of at most ${MAX_TURNS}. End now (fill wrapUp) if the goal is reached; otherwise continue.`
        : `This is reply ${idx} of at most ${MAX_TURNS}. Continue the conversation (wrapUp is null).`

  const reply = await streamParsed(
    env,
    {
      model: env.OPENAI_MODEL_PRACTICE,
      instructions: `${SYSTEM}\n\n${PRACTICE_RULES}`,
      input: [REPLY_TASK, transcript(session), `The learner's reply:\n${text}`, pacing, LANGUAGE_REMINDER].join('\n\n'),
      reasoning: { effort: 'none' },
      text: { format: zodTextFormat(PracticeReply, 'reply') },
    },
    PracticeReply,
    onDelta,
  )

  const done = reply.wrapUp !== null || idx >= MAX_TURNS
  const turn: PracticeTurn = { id: crypto.randomUUID(), idx, text, reply, cardId: null, createdAt: new Date().toISOString() }
  // (session_id, idx) is unique, so a second reply sent at the same time fails here instead of adding a duplicate turn.
  try {
    await db(env)
      .insert(practiceTurns)
      .values({ ...turn, sessionId: session.id })
  } catch (err) {
    if (String((err as Error).cause ?? err).includes('UNIQUE')) throw new Error('這一句已經回覆過了，請重新整理頁面')
    throw err
  }
  if (done) await db(env).update(practiceSessions).set({ done: true }).where(eq(practiceSessions.id, session.id))
  return { turn, done }
}

// Turns a correction into a regular naturalize card (accents filled by saveCard), and remembers it on the turn.
export async function saveTurnCard(env: Env, turnId: string): Promise<Card | null> {
  const row = await db(env).select().from(practiceTurns).where(eq(practiceTurns.id, turnId)).get()
  if (!row) return null
  // Already saved (a double tap or a retry): return that card instead of making another.
  if (row.cardId) {
    const existing = await db(env).select().from(cards).where(eq(cards.id, row.cardId)).get()
    if (existing) return toCard(existing)
  }
  const session = await getPractice(env, row.sessionId)
  if (!session) return null

  const { scenario: sc } = session
  const natural = stripRuby(row.reply.natural)
  const context = [
    `Conversation practice: ${sc.title}. ${sc.situation}`,
    `${sc.partnerRole} said: ${stripRuby(promptFor(session, row.idx))}`,
    `A coach already suggested this natural version; use it as \`ja\` unless it is wrong: ${natural}`,
  ].join('\n')
  const draft = await draftCard(env, { mode: 'naturalize', text: row.text, context })
  const card = await saveCard(env, { mode: 'naturalize', source: 'practice', input: row.text, draft })
  await db(env).update(practiceTurns).set({ cardId: card.id }).where(eq(practiceTurns.id, turnId))
  return card
}
