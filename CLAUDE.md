# Nihongo Coach

A personal Japanese-learning PWA: Vite + React front end, Hono Worker on Cloudflare Workers, D1 with Drizzle. The repo is public.

## Development flow

- Branch from `main` (`feat/…`, `fix/…`, `claude/…`) and open a PR into `main`. Merging to `main` does not deploy.
- Run `npm run check` before opening a PR. It is what CI runs: lint, `tsc -b` + build, `scripts/check-pitch.ts`, `scripts/check-migrations.ts`.
- Every user-facing change adds a line under `## [Unreleased]` in `CHANGELOG.md` (Keep a Changelog: Added / Changed / Fixed, with the commit hash when known). This section becomes the GitHub Release notes as written.
- Keep `README.md` and `README.zh-TW.md` in step when either changes.
- Try UI changes in demo mode (`npm run demo`, port 5174) or `npm run dev` (port 5173); see `.claude/launch.json`.

## Database

- Change `worker/db/schema.ts`, then `npm run db:generate`. Don't hand-write or rename files in `migrations/`.
- Never edit a migration that is already on `main`; add a new one. Migrations are forward-only: only add tables, columns and indexes.
- If `check-migrations.ts` reports a number clash after merging `main`, regenerate yours (see "Database migrations" in `docs/RELEASING.md`).
- D1 free plan: 100k rows written per day. Don't run big imports or backfills against `--remote` without asking.

## Releases and production

- Releases use `npm run release -- <patch|minor|major>`, and the tag push deploys through `.github/workflows/release.yml` after the owner approves. Full flow: `docs/RELEASING.md`. To cut one, use the `release` skill.
- Never push to `main`, push tags, create releases, run `npm run deploy`, `npm run db:migrate:remote` or any `wrangler … --remote` write without the owner's explicit go-ahead in the conversation.

## Secrets and personal data

- `.dev.vars` and `.prod.vars` hold tokens and the app URL. Never print, paste or commit their values.
- `backups/` holds D1 exports with real user data. Never commit it, and never upload a database export as an Actions artifact or print it to a log.
