import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { CardDraft, CATEGORIES, type AskRequest, type Mode } from '../../shared/schema'

const SYSTEM = `You are a Japanese speaking coach for a Taiwanese software engineer living in Japan.
They are around JLPT N2: they understand most things but their spoken Japanese can sound textbook-like or unnatural.
Their goal is to communicate smoothly in daily life and at work, with natural, easy-to-remember spoken Japanese.

Rules:
- Prefer what native speakers actually say in conversation over textbook or written forms.
- Write all explanations in Traditional Chinese as used in Taiwan (not Simplified, not Mainland wording).
- Skip basic grammar explanations; focus on nuance, register, and what sounds natural.
- Readings are always in hiragana, including for katakana words.
- Do not write pitch-accent marks; accent is handled separately.
- Always give 2-3 examples: different natural sentences that reuse the expression in other everyday situations, never just a copy of \`ja\`. Put them only in \`examples\`, never inside \`nuance\`.
- \`words\` is for a pitch-accent dictionary lookup: list 1-6 single lexical words in dictionary form (e.g. 短い, not 短く or 短くなる; お願い, not お願いします).
  No phrases, no particles, no conjugated forms. For a compound like 推し活, list the compound itself before its parts.
- Pick the single best category from: ${CATEGORIES.join('、')}.`

const TASKS: Record<Mode, string> = {
  lookup: `The learner saw this Japanese word, phrase, or grammar pattern (maybe copied from social media, YouTube, or Slack) and does not know it.
Explain it. \`ja\` is the expression itself in its most useful form. If the input is a longer passage, pick the expression most likely to be the unknown part and explain that.`,
  zh2ja: `The learner wants to say the following in Japanese but does not know how (input is usually Chinese).
\`ja\` is the most natural way to say it out loud in that situation. Use \`nuance\` to mention a more casual or more polite alternative when useful.`,
  naturalize: `The learner said or wrote the following Japanese and feels it sounds strange.
\`ja\` is the natural version a native speaker would say in the same situation. Fill \`correction\` with their original and why it sounded off.
If the original is already natural, keep it and say so in \`correction.why\`.`,
}

export class RefusalError extends Error {}

// Fast cheap model for lookups; a stronger model where naturalness judgement matters.
// Model names come from wrangler.jsonc vars so they can be changed without code edits.
export async function draftCard(env: Env, req: AskRequest): Promise<CardDraft> {
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY })
  const input = [TASKS[req.mode], req.context ? `Situation: ${req.context}` : null, `Input:\n${req.text}`]
    .filter(Boolean)
    .join('\n\n')

  const response = await client.responses.parse({
    model: req.mode === 'lookup' ? env.OPENAI_MODEL_FAST : env.OPENAI_MODEL_SMART,
    instructions: SYSTEM,
    input,
    reasoning: { effort: 'low' },
    text: { format: zodTextFormat(CardDraft, 'card') },
  })

  const refused = response.output.some((o) => o.type === 'message' && o.content.some((c) => c.type === 'refusal'))
  if (refused) throw new RefusalError('AI declined this request')
  if (!response.output_parsed) throw new Error(`Could not parse card (status: ${response.status})`)
  return response.output_parsed
}
