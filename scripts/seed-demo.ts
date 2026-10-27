// Saves the mock cards in scripts/demo-cards.json through the running demo server
// (`npm run demo`), so pitch accents are filled the same way as real cards.
//
//   node scripts/seed-demo.ts [http://localhost:5174]
import { readFileSync } from 'node:fs'

const base = process.argv[2] ?? 'http://localhost:5174'
const token = /^APP_TOKEN=(.*)$/m.exec(readFileSync('.dev.vars', 'utf8'))?.[1]
if (!token) throw new Error('APP_TOKEN not found in .dev.vars')

// Oldest first, so the list shows them in file order (newest on top).
const cards = JSON.parse(readFileSync('scripts/demo-cards.json', 'utf8')).reverse()
for (const card of cards) {
  const res = await fetch(`${base}/api/cards`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(card),
  })
  if (!res.ok) throw new Error(`${card.draft.ja}: ${res.status} ${await res.text()}`)
  console.log(`saved ${card.draft.ja}`)
}
