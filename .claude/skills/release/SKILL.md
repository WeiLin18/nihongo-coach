---
name: release
description: Cut a Nihongo Coach release with npm run release and hand off to the tag-triggered deploy. Use when the user asks to release, ship, tag, publish a version, or deploy to production.
---

# Release Nihongo Coach

The full flow and recovery steps are in `docs/RELEASING.md`. This is the short version for running it.

## 1. Check what would ship

```bash
git switch main && git pull
git log --oneline "$(git describe --tags --abbrev=0)"..HEAD
```

Read `## [Unreleased]` in `CHANGELOG.md` and compare it with those commits. If a user-facing change is missing or the wording is unclear, propose the fix and make it in a PR first. The section becomes the GitHub Release notes as written.

Pick the bump and tell the user why:

- `patch`: bug fixes, copy or style, no migration, no API change.
- `minor`: new features, any new file in `migrations/`, or a breaking API change (while the version is 0.x).
- `major`: only after 1.0.0, for a breaking change to the routes used by iOS Shortcuts, `/jp` or MCP.

If `migrations/` changed since the last tag, say which migrations will run, and suggest `npm run backup` first when one rewrites existing data.

## 2. Dry run

```bash
npm run release -- <bump> --dry-run
```

Show the user the new version and section. Fix any check it fails before going on.

## 3. Release (needs the user's go-ahead)

Ask the user to confirm the version before this step. The script ends with a push prompt that starts the deploy, so either:

- let the user run `npm run release -- <bump>` in their own terminal, or
- run it with the answer piped in, only after the user said to push: `echo y | npm run release -- <bump>`.

Never push the tag or approve anything without that go-ahead.

## 4. After the push

Tell the user to open GitHub → Actions → Release → the new tag, wait for `verify`, then click Review deployments → production → Approve and deploy. Then check the app on the phone (one card, 練習, 複習).

If a job fails, read its log with `gh run view --log-failed` and follow "When a deploy fails halfway" in `docs/RELEASING.md`. If the app is broken after deploy, suggest `npx wrangler rollback` and a fix-forward patch.
