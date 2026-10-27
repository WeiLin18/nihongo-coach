// Minimal stateless MCP server (Streamable HTTP, JSON responses) so the Claude apps can save
// cards with a subscription instead of the app's OpenAI key. Mounted at /mcp/<MCP_TOKEN>:
// claude.ai custom connectors take a URL, so the secret lives in the path.
import { Hono } from 'hono'
import { z } from 'zod'
import { cardToText } from '../shared/format'
import { CATEGORIES, MODE_LABELS, MODES, SaveCardRequest } from '../shared/schema'
import { SYSTEM, TASKS } from './lib/ai'
import { listCards, saveCard } from './lib/cards'

const SaveCardArgs = SaveCardRequest.omit({ source: true })
const ListCardsArgs = z.object({
  category: z.enum(CATEGORIES).optional().describe('Only cards in this category'),
  query: z.string().optional().describe('Text to search for in the Japanese, the original input, or the explanation'),
  limit: z.number().int().min(1).max(50).optional().describe('How many recent cards to return (default 10)'),
})

const RULES = `${SYSTEM}

Modes (pick from the user's message; mostly Chinese → zh2ja, a Japanese word or grammar → lookup, a full Japanese sentence they said → naturalize):
${MODES.map((m) => `- ${m} (${MODE_LABELS[m]}): ${TASKS[m]}`).join('\n')}`

const jsonSchema = (schema: z.ZodType) => {
  const { $schema: _, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>
  return rest
}

const TOOLS = [
  {
    name: 'save_card',
    title: 'Save a Japanese card',
    description: `Write a Japanese speaking-coach card for the user and save it to their Nihongo Coach app.
Use it whenever the user asks how to say something in Japanese, what a Japanese word or grammar means, or whether their Japanese sounds natural.
Write the card yourself following these rules, then call this tool once. The server adds pitch accents from a dictionary and returns the saved card; show that text to the user as is.

${RULES}`,
    inputSchema: jsonSchema(SaveCardArgs),
  },
  {
    name: 'list_cards',
    title: 'List saved cards',
    description: "Read the user's recently saved Japanese cards, optionally filtered by category or text. Use it for review or when they ask what they saved.",
    inputSchema: jsonSchema(ListCardsArgs),
    annotations: { readOnlyHint: true },
  },
]

type RpcRequest = { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: Record<string, unknown> }
type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean }

const text = (t: string, isError = false): ToolResult => ({ content: [{ type: 'text', text: t }], ...(isError && { isError }) })

async function callTool(env: Env, name: string, args: unknown): Promise<ToolResult> {
  if (name === 'save_card') {
    const parsed = SaveCardArgs.safeParse(args)
    // Hand validation errors back to the model so it can fix the card and retry.
    if (!parsed.success) return text(`Invalid card, fix these fields and call again:\n${z.prettifyError(parsed.error)}`, true)
    return text(cardToText(await saveCard(env, { ...parsed.data, source: 'claude-app' })))
  }
  if (name === 'list_cards') {
    const parsed = ListCardsArgs.safeParse(args ?? {})
    if (!parsed.success) return text(z.prettifyError(parsed.error), true)
    const { category, query, limit = 10 } = parsed.data
    const found = await listCards(env, { category, q: query, limit })
    if (found.length === 0) return text('No cards found.')
    return text(found.map((c) => `${c.ja}（${c.reading}）— ${c.zh} #${c.category}`).join('\n'))
  }
  return text(`Unknown tool: ${name}`, true)
}

async function handle(env: Env, req: RpcRequest) {
  const ok = (result: unknown) => ({ jsonrpc: '2.0', id: req.id, result })
  switch (req.method) {
    case 'initialize':
      return ok({
        protocolVersion: (req.params?.protocolVersion as string) ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'nihongo-coach', version: '1.0.0' },
        instructions: 'Japanese speaking coach. Use save_card to make and save a card, list_cards to review saved ones.',
      })
    case 'ping':
      return ok({})
    case 'tools/list':
      return ok({ tools: TOOLS })
    case 'tools/call':
      return ok(await callTool(env, req.params?.name as string, req.params?.arguments))
    default:
      return { jsonrpc: '2.0', id: req.id, error: { code: -32601, message: `Method not found: ${req.method}` } }
  }
}

export const mcp = new Hono<{ Bindings: Env }>()

mcp.post('/:token', async (c) => {
  if (!c.env.MCP_TOKEN || c.req.param('token') !== c.env.MCP_TOKEN) return c.text('Not found', 404)
  const body = await c.req.json().catch(() => null)
  if (!body) return c.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400)

  const messages: RpcRequest[] = Array.isArray(body) ? body : [body]
  const requests = messages.filter((m) => m.id !== undefined && m.id !== null)
  // Notifications (e.g. notifications/initialized) get no response body.
  if (requests.length === 0) return c.body(null, 202)
  const responses = await Promise.all(requests.map((r) => handle(c.env, r)))
  return c.json(Array.isArray(body) ? responses : responses[0])
})

// No server-initiated stream or sessions in this stateless server.
mcp.on(['GET', 'DELETE'], '/:token', (c) => c.body(null, 405, { Allow: 'POST' }))
