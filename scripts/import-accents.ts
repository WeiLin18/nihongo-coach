// Turns a pitch-accent TSV (surface<TAB>reading<TAB>accents) into SQL for D1.
// Works with Kanjium accents.txt (https://github.com/mifunetoshiro/kanjium, CC BY-SA 4.0).
//
//   node scripts/import-accents.ts data/kanjium/accents.txt > data/kanjium/accents.sql
//   npx wrangler d1 execute nihongo-coach --local --file data/kanjium/accents.sql
import { readFileSync } from 'node:fs'
import { toHiragana } from '../shared/kana.ts'

const file = process.argv[2]
if (!file) {
  console.error('usage: node scripts/import-accents.ts <accents.tsv>')
  process.exit(1)
}

const q = (s: string) => `'${s.replaceAll("'", "''")}'`
const rows = new Map<string, string>()

for (const line of readFileSync(file, 'utf8').split('\n')) {
  const [surface, reading, raw] = line.split('\t')
  if (!surface || !reading || !raw) continue
  // Keep only the numbers; some sources annotate variants like "1(名)" or "0,2".
  const accents = [...raw.matchAll(/\d+/g)].map((m) => m[0]).join(',')
  if (!accents) continue
  rows.set(`${surface}\t${toHiragana(reading)}`, accents)
}

const values = [...rows].map(([k, accents]) => {
  const [surface, reading] = k.split('\t')
  return `(${q(surface)},${q(reading)},${q(accents)})`
})
for (let i = 0; i < values.length; i += 500) {
  console.log(`INSERT OR REPLACE INTO accents (surface, reading, accents) VALUES\n${values.slice(i, i + 500).join(',\n')};`)
}
console.error(`${rows.size} entries`)
