import { toHiragana } from '../../shared/kana'
import type { WordAccent } from '../../shared/schema'

type Row = { surface: string; reading: string; accents: string }

const parse = (s: string) => s.split(',').map((n) => Number.parseInt(n, 10)).filter((n) => !Number.isNaN(n))

export async function lookupAccents(db: D1Database, words: { surface: string; reading: string }[]): Promise<WordAccent[]> {
  if (words.length === 0) return []
  const stmt = db.prepare('SELECT surface, reading, accents FROM accents WHERE surface = ?1 OR reading = ?2 LIMIT 20')
  const results = await db.batch<Row>(words.map((w) => stmt.bind(w.surface, toHiragana(w.reading))))

  return words.map((w, i) => {
    const reading = toHiragana(w.reading)
    const rows = results[i].results
    // Exact surface+reading first; then surface alone if unambiguous; then a kana-only word by reading.
    const exact = rows.find((r) => r.surface === w.surface && r.reading === reading)
    const bySurface = rows.filter((r) => r.surface === w.surface)
    const byReading = rows.filter((r) => r.reading === reading && r.surface === r.reading)
    const hit = exact ?? (bySurface.length === 1 ? bySurface[0] : undefined) ?? (w.surface === reading ? byReading[0] : undefined)
    return { surface: w.surface, reading: hit?.reading ?? reading, accents: hit ? parse(hit.accents) : null }
  })
}
