// Checks that migrations/ is consistent: every .sql file has a unique number,
// is listed in meta/_journal.json in order, and has a snapshot.
// Catches two branches that both generated the same migration number.
//
//   node scripts/check-migrations.ts
import { existsSync, readdirSync, readFileSync } from 'node:fs'

const dir = 'migrations'
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
const journal: { entries: { idx: number; tag: string }[] } = JSON.parse(
  readFileSync(`${dir}/meta/_journal.json`, 'utf8'),
)
const errors: string[] = []

const seen = new Map<string, string>()
for (const f of files) {
  const num = /^(\d{4})_/.exec(f)?.[1]
  if (!num) errors.push(`${f}: name does not start with a 4-digit number`)
  else if (seen.has(num)) errors.push(`${f}: number ${num} is also used by ${seen.get(num)}`)
  else seen.set(num, f)
}

const tags = journal.entries.map((e) => e.tag)
const names = files.map((f) => f.replace(/\.sql$/, ''))
for (const n of names) if (!tags.includes(n)) errors.push(`${n}.sql is not in meta/_journal.json`)
for (const t of tags) if (!names.includes(t)) errors.push(`meta/_journal.json lists ${t}, but ${t}.sql is missing`)
journal.entries.forEach((e, i) => {
  if (e.idx !== i) errors.push(`meta/_journal.json: entry ${e.tag} has idx ${e.idx}, expected ${i}`)
  const num = e.tag.slice(0, 4)
  if (!existsSync(`${dir}/meta/${num}_snapshot.json`)) errors.push(`${e.tag}: meta/${num}_snapshot.json is missing`)
})

if (errors.length) {
  for (const e of errors) console.error(`FAIL ${e}`)
  console.error('\nSee "Database migrations" in docs/RELEASING.md for how to renumber a migration.')
  process.exit(1)
}
console.log(`ok   ${files.length} migrations, numbers unique, journal and snapshots match`)
