# Daily content: running `/jp-daily` on a schedule

[`/jp-daily`](../skills/jp-daily/SKILL.md) prepares the day's 讀音 passages and 會話 drills on your Claude subscription and saves them to the app's 今日 queue. It is safe to run more than once a day: each slot (`news`, `work`, `drill-1`, `drill-2`) is saved once per date.

Before scheduling it:

1. Deploy a release that includes `POST /api/reading/prepared` and `POST /api/practice/prepared` (the release after 0.4.0). Against an older deployment the skill stops with a 404.
2. Install the skill: `ln -s "$PWD/skills/jp-daily" ~/.claude/skills/jp-daily`.
3. Run it once by hand (`/jp-daily`) and check the result in 練習 → 讀音 / 會話.

What it costs: nothing on the API (it uses the subscription), and it saves about $2/month of OpenAI calls (see [COSTS.md](COSTS.md)). The value is that practice is ready every morning. Correcting your 會話 answers still calls OpenAI.

## Recommended: a local scheduled task in the Claude desktop app

The task runs on your Mac with the repo's `.prod.vars`, so no secret leaves the machine.

1. In the Claude desktop app, open the scheduled tasks list (or ask Claude Code in the app to create the task for you).
2. New task, every day at 07:00 (cron `0 7 * * *`, local time), with a prompt like:

   > Run the /jp-daily skill for today. The project folder is `<path to nihongo-coach>`. Do not ask questions; report what was saved.

3. Give the task permission for `WebSearch`, `WebFetch`, `curl`, `grep`, `realpath` and `date` (the skill's `allowed-tools`), or it stops at the first prompt.

Scheduled tasks run while the desktop app is open. If the Mac is asleep or the app is closed at 07:00, the task runs the next time the app opens; the date is taken at run time, so a late run still fills today's queue.

## Alternative: a cloud routine

A Claude Code routine (`/schedule` in Claude Code, or claude.ai/code → Routines) runs in the cloud even when the Mac is off. Differences:

- It works from a fresh clone of the GitHub repo, which has no `.prod.vars`. Store `APP_URL` and `APP_TOKEN` as **secrets of the cloud environment** (environment variables), never in the repo or the routine prompt, and tell the prompt to read them from the environment instead of `.prod.vars`.
- The skill must be in the repo the routine checks out (`skills/jp-daily/SKILL.md`); the prompt can say "follow `skills/jp-daily/SKILL.md`".
- The cloud environment must allow outbound requests to your Worker's URL and to news sites.

Rotate `APP_TOKEN` (`npx wrangler secret put APP_TOKEN`, then update `.prod.vars`, the phone, and the cloud secret) if the cloud environment is ever shared.
