import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import type { z } from 'zod'
import { CardDraft, CATEGORIES, type AskRequest, type Mode } from '../../shared/schema'
import { nonChineseFields } from './language'

export const SYSTEM = `You are a Japanese speaking coach for a Taiwanese front-end engineer working in Tokyo.
They are around JLPT N1: they understand most things but their spoken Japanese can sound textbook-like or unnatural.
Their goal is to communicate smoothly in daily life and at work, with natural, easy-to-remember spoken Japanese.

Rules:
- Prefer what native speakers actually say in conversation over textbook or written forms.
- Write all explanations (\`zh\`, \`nuance\`, \`correction.why\`, example \`zh\`) in Traditional Chinese as used in Taiwan (not Simplified, not Mainland wording), even when the input is all Japanese. Never write them in Japanese or Korean; quote Japanese only for the words in question.
- Skip basic grammar explanations; focus on nuance, register, and what sounds natural.
- Readings are always in hiragana, including for katakana words.
- Do not write pitch-accent marks; accent is handled separately.
- Always give 2-3 examples: different natural sentences that reuse the expression in other everyday situations, never just a copy of \`ja\`. Put them only in \`examples\`, never inside \`nuance\`.
- \`words\` is for a pitch-accent dictionary lookup: list 1-6 single lexical words in dictionary form (e.g. 短い, not 短く or 短くなる; お願い, not お願いします).
  No phrases, no particles, no conjugated forms. For a compound like 推し活, list the compound itself before its parts.
- Pick the single best category from: ${CATEGORIES.join('、')}.`

export const TASKS: Record<Mode, string> = {
  lookup: `The learner saw this Japanese word, phrase, or grammar pattern (maybe copied from social media, YouTube, or Slack) and does not know it.
Explain it. \`ja\` is the expression itself in its most useful form. If the input is a longer passage, pick the expression most likely to be the unknown part and explain that.`,
  zh2ja: `The learner wants to say the following in Japanese but does not know how (input is usually Chinese).
\`ja\` is the most natural way to say it out loud in that situation. Use \`nuance\` to mention a more casual or more polite alternative when useful.`,
  naturalize: `The learner said or wrote the following Japanese and feels it sounds strange.
\`ja\` is the natural version a native speaker would say in the same situation. Fill \`correction\` with their original and why it sounded off.
If the original is already natural, keep it and say so in \`correction.why\`.`,
}

export class RefusalError extends Error {}

// The input is usually all Japanese, so a last reminder keeps the explanations in Chinese.
const LANGUAGE_REMINDER = 'Write every explanation field in Traditional Chinese (Taiwan), not Japanese or Korean.'

export const buildInput = (req: AskRequest) =>
  [TASKS[req.mode], req.context ? `Situation: ${req.context}` : null, `Input:\n${req.text}`, LANGUAGE_REMINDER]
    .filter(Boolean)
    .join('\n\n')

// The fields of a card that must be in Chinese, for the language check.
const cardExplanations = (d: CardDraft) => ({
  zh: d.zh,
  nuance: d.nuance,
  'correction.why': d.correction?.why,
  ...Object.fromEntries(d.examples.map((e, i) => [`examples.${i}.zh`, e.zh])),
})

// Model per mode, from wrangler.jsonc vars so it can be changed without code edits.
// Reasoning is off: in benchmarks it cut time-to-first-token from ~3s to <1s with no visible quality loss.
function cardRequest(env: Env, req: AskRequest) {
  const models: Record<Mode, string> = {
    lookup: env.OPENAI_MODEL_LOOKUP,
    zh2ja: env.OPENAI_MODEL_ZH2JA,
    naturalize: env.OPENAI_MODEL_NATURALIZE,
  }
  return {
    model: models[req.mode],
    instructions: SYSTEM,
    input: buildInput(req),
    reasoning: { effort: 'none' as const },
    text: { format: zodTextFormat(CardDraft, 'card') },
  }
}

export async function draftCard(env: Env, req: AskRequest): Promise<CardDraft> {
  return parseStructured(env, cardRequest(env, req), CardDraft, cardExplanations)
}

// A structured-output request: the JSON schema is in `text.format` (from zodTextFormat).
type StructuredRequest = { model: string; instructions: string; input: string; reasoning: { effort: 'none' }; text: object }

// Picks the fields of a result that must be in Traditional Chinese, keyed by a name for the log.
export type Explanations<T> = (result: T) => Record<string, string | null | undefined>

// Runs `attempt`; if any of the `explanations` fields comes back in another language (Japanese,
// Korean, English), tries once more and logs it. A second miss is returned anyway, since a card
// with an odd note is better than an error.
async function checkedLanguage<T>(label: string, explanations: Explanations<T> | undefined, attempt: (retry: boolean) => Promise<T>) {
  const first = await attempt(false)
  const bad = explanations ? nonChineseFields(explanations(first)) : []
  if (!bad.length) return first
  console.warn(`${label}: explanation not in Chinese (${bad.join(', ')}), retrying`)
  const second = await attempt(true)
  const stillBad = nonChineseFields(explanations!(second))
  if (stillBad.length) console.error(`${label}: explanation still not in Chinese after retry (${stillBad.join(', ')})`)
  return second
}

// Runs a structured-output request and parses the JSON with `schema`.
export async function parseStructured<T>(
  env: Env,
  body: StructuredRequest,
  schema: z.ZodType<T>,
  explanations?: Explanations<T>,
): Promise<T> {
  return checkedLanguage(body.model, explanations, () => parseOnce(env, body, schema))
}

async function parseOnce<T>(env: Env, body: StructuredRequest, schema: z.ZodType<T>): Promise<T> {
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY })
  const response = await client.responses.create({ ...body, stream: false })
  const refused = response.output.some((o) => o.type === 'message' && o.content.some((c) => c.type === 'refusal'))
  if (refused) throw new RefusalError('AI declined this request')
  if (!response.output_text) throw new Error(`AI returned no output (status: ${response.status})`)
  return schema.parse(JSON.parse(response.output_text))
}

// Gets each chunk of the JSON text as it is generated. `restart` is set on the first chunk of a
// retry: the text so far is thrown away and this chunk starts a new JSON document.
export type OnDelta = (text: string, restart?: boolean) => Promise<void>

// Same as draftCard, but hands each chunk of the JSON text to onDelta as it is generated.
export async function streamCard(env: Env, req: AskRequest, onDelta: OnDelta): Promise<CardDraft> {
  return streamParsed(env, cardRequest(env, req), CardDraft, onDelta, cardExplanations)
}

// Streams a structured-output request and parses the finished JSON with `schema`.
export async function streamParsed<T>(
  env: Env,
  body: StructuredRequest,
  schema: z.ZodType<T>,
  onDelta: OnDelta,
  explanations?: Explanations<T>,
): Promise<T> {
  return checkedLanguage(body.model, explanations, (retry) => streamOnce(env, body, schema, onDelta, retry))
}

async function streamOnce<T>(env: Env, body: StructuredRequest, schema: z.ZodType<T>, onDelta: OnDelta, restart: boolean): Promise<T> {
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY })
  const stream = await client.responses.create({ ...body, stream: true })
  let text = ''
  for await (const ev of stream) {
    if (ev.type === 'response.output_text.delta') {
      await onDelta(ev.delta, restart && !text)
      text += ev.delta
    } else if (ev.type === 'response.refusal.delta') {
      throw new RefusalError('AI declined this request')
    } else if (ev.type === 'response.failed' || ev.type === 'error') {
      throw new Error('AI request failed')
    }
  }
  return schema.parse(JSON.parse(text))
}
