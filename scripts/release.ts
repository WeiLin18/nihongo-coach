// Cuts a release: bumps the version, moves the CHANGELOG [Unreleased] items under a
// dated heading, commits "Release vX.Y.Z", makes an annotated tag and, after you
// confirm, pushes the branch and the tag. The tag push starts the Release workflow
// (.github/workflows/release.yml), which publishes the GitHub Release and deploys.
//
//   npm run release -- <patch|minor|major|X.Y.Z> [--dry-run] [--skip-checks]
//   node scripts/release.ts notes X.Y.Z      # print that version's CHANGELOG section
//
// --dry-run runs the git checks and `npm run check`, prints what would change, and
// writes nothing. Run from a clean `main`, or from `release/X.Y` for a hotfix.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'

const REMOTE = 'origin'
const READMES: [string, RegExp][] = [
  ['README.md', /\*\*Version \d+\.\d+\.\d+\*\*/],
  ['README.zh-TW.md', /\*\*版本 \d+\.\d+\.\d+\*\*/],
]

function fail(msg: string): never {
  console.error(`release: ${msg}`)
  process.exit(1)
}

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

// The text between "## [<name>]" and the next "## [" heading, without the heading line.
function section(changelog: string, name: string): string | undefined {
  const lines = changelog.split('\n')
  const start = lines.findIndex((l) => l.startsWith(`## [${name}]`))
  if (start < 0) return undefined
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## ['))
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim()
}

const args = process.argv.slice(2)

if (args[0] === 'notes') {
  const notes = args[1] && section(readFileSync('CHANGELOG.md', 'utf8'), args[1])
  if (!notes) fail(`no non-empty "## [${args[1]}]" section in CHANGELOG.md`)
  console.log(notes)
  process.exit(0)
}

const dryRun = args.includes('--dry-run')
const skipChecks = args.includes('--skip-checks')
const bump = args.find((a) => !a.startsWith('--'))
if (!bump) fail('usage: npm run release -- <patch|minor|major|X.Y.Z> [--dry-run] [--skip-checks]')

// --- Version ---
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const current: string = pkg.version
const [maj, min, pat] = current.split('.').map(Number)
const next =
  bump === 'major' ? `${maj + 1}.0.0`
  : bump === 'minor' ? `${maj}.${min + 1}.0`
  : bump === 'patch' ? `${maj}.${min}.${pat + 1}`
  : /^\d+\.\d+\.\d+$/.test(bump) ? bump
  : fail(`"${bump}" is not patch, minor, major or X.Y.Z`)
const tag = `v${next}`
const newer = (a: string, b: string) => {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number))
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]
}
if (newer(next, current) <= 0) fail(`${next} is not newer than the current version ${current}`)

// --- Git state ---
const branch = git('rev-parse', '--abbrev-ref', 'HEAD')
const hotfix = /^release\/(\d+\.\d+)$/.exec(branch)
if (branch !== 'main' && !hotfix) fail(`run this on main or a release/X.Y branch, not "${branch}"`)
if (hotfix && !next.startsWith(`${hotfix[1]}.`)) fail(`${branch} can only release ${hotfix[1]}.x, not ${next}`)
if (git('status', '--porcelain')) fail('the working tree has uncommitted changes; commit or stash them first')

git('fetch', '--quiet', '--tags', REMOTE)
let upstream: string
try {
  upstream = git('rev-parse', `${REMOTE}/${branch}`)
} catch {
  fail(`${REMOTE}/${branch} does not exist; push the branch first`)
}
if (git('rev-parse', 'HEAD') !== upstream) {
  fail(`${branch} is not the same as ${REMOTE}/${branch}; pull or push first`)
}
if (git('tag', '--list', tag)) fail(`tag ${tag} already exists`)

// --- CHANGELOG ---
const changelog = readFileSync('CHANGELOG.md', 'utf8')
const unreleased = section(changelog, 'Unreleased')
if (unreleased === undefined) fail('CHANGELOG.md has no "## [Unreleased]" heading')
if (!unreleased) fail('the [Unreleased] section of CHANGELOG.md is empty; there is nothing to release')

const today = new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD in local time
const linkRe = /^\[Unreleased\]: (.+)\/compare\/v[\d.]+\.\.\.HEAD$/m
const base = linkRe.exec(changelog)?.[1]
if (!base) fail('CHANGELOG.md has no "[Unreleased]: …/compare/vX.Y.Z...HEAD" link')
const newChangelog = changelog
  .replace(/^## \[Unreleased\]\n/m, `## [Unreleased]\n\n## [${next}] - ${today}\n`)
  .replace(linkRe, `[Unreleased]: ${base}/compare/${tag}...HEAD\n[${next}]: ${base}/compare/v${current}...${tag}`)

const readmes = READMES.flatMap(([file, re]) => {
  const text = readFileSync(file, 'utf8')
  if (!re.test(text)) {
    console.warn(`release: no version line in ${file}, leaving it alone`)
    return []
  }
  return [[file, text.replace(re, (m) => m.replace(/\d+\.\d+\.\d+/, next))]]
})

console.log(`\nRelease ${current} -> ${next} on ${branch}${dryRun ? ' (dry run)' : ''}\n`)

if (!skipChecks) {
  console.log('Running npm run check …')
  execFileSync('npm', ['run', 'check'], { stdio: 'inherit' })
}

if (dryRun) {
  console.log(`\n--- CHANGELOG.md: new section ---\n## [${next}] - ${today}\n\n${unreleased}\n`)
  console.log('--- CHANGELOG.md: links ---')
  console.log(newChangelog.split('\n').filter((l) => /^\[(Unreleased|[\d.]+)\]:/.test(l)).slice(0, 3).join('\n'))
  console.log(`\nWould update: package.json, package-lock.json, CHANGELOG.md, ${readmes.map(([f]) => f).join(', ')}`)
  console.log(`Would run:    git commit -m "Release ${tag}"`)
  console.log(`              git tag -a ${tag} -m "${tag}"`)
  console.log(`              git push --atomic ${REMOTE} ${branch} ${tag}   (after a prompt)`)
  process.exit(0)
}

// --- Write, commit, tag ---
writeFileSync('CHANGELOG.md', newChangelog)
for (const [file, text] of readmes) writeFileSync(file, text)
execFileSync('npm', ['version', next, '--no-git-tag-version'], { stdio: 'ignore' })
git('add', 'package.json', 'package-lock.json', 'CHANGELOG.md', ...readmes.map(([f]) => f))
git('commit', '--quiet', '-m', `Release ${tag}`)
git('tag', '-a', tag, '-m', tag)
console.log(`\nCommitted "Release ${tag}" and tagged ${tag}.`)

// --- Push ---
const rl = createInterface({ input: process.stdin, output: process.stdout })
const answer = await rl.question(`Push ${branch} and ${tag} to ${REMOTE}? This starts the deploy. [y/N] `)
rl.close()
if (answer.trim().toLowerCase() === 'y') {
  execFileSync('git', ['push', '--atomic', REMOTE, branch, tag], { stdio: 'inherit' })
  console.log(`\nPushed. Approve the deploy in GitHub → Actions → Release (${tag}).`)
} else {
  console.log(`\nNot pushed. To push later:   git push --atomic ${REMOTE} ${branch} ${tag}`)
  console.log(`To undo the release commit:  git tag -d ${tag} && git reset --hard HEAD~1`)
}
