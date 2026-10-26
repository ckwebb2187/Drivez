# Kaido Maps (repo: Drivez)

React + Vite web app served by a Cloudflare Worker (`worker/`), D1 database, MapLibre + three.js map.
Live: https://drivez.webb-home.workers.dev · Android wrapper in `android/`.

## Automated update runs

A scheduled cloud routine works through `plan/ROADMAP.md`, one ticket per run.
Follow these rules exactly. They keep each run small so usage limits last.

### Save usage
- Do ONE ticket per run. Never start a second one.
- Read only `plan/ROADMAP.md`, the last 5 lines of `plan/LOG.md`, and files the ticket needs.
- Find code with `grep -n` first, then read only the line ranges you need. Do not read whole files over 300 lines.
- Never open `node_modules/`, `dist/`, `worker/static/`, `android/`, `package-lock.json`, or `*.glb`/`*.bin`.
- Don't explore the codebase "to understand it". Don't refactor code the ticket doesn't need.
- If a ticket is bigger than expected: finish a working first part, add the rest as a new ticket right below it (`T12b`), and stop.
- Keep LOG lines to one line. No long summaries.

### Steps for each run
0. Check first: `git log -5 --format='%cr | %s'`. Stop without changes (no log line) if the newest commit
   that isn't a ticket commit (`T<number>:` or `plan:`) is under 90 minutes old (someone is working),
   or if any of the last 5 commit messages contains "WIP" or "not deployed" (unfinished work on main).
1. Pick the first ticket marked `- [ ]` in `plan/ROADMAP.md`. Skip tickets under "Needs a decision".
2. Build it. Match existing code style. Comments short and plain.
3. `npm ci` (only if `node_modules` is missing), then `npm run build`. Fix errors (max 2 tries).
4. `node scripts/perf-check.mjs <ticket-id>`. If it fails, make the change lighter
   (lazy-load with `import()`, smaller code) and retry once.
5. If build or speed check still fails: do not deploy. Push the work to branch `auto/<ticket-id>`,
   mark the ticket `- [!]` with a short reason, log it, and stop.
6. Bump `version` patch in `package.json`. Commit to `main` as `<ticket-id>: <what changed>`
   (include `perf/` and `plan/` changes). Push.
7. `npm run deploy`, then `node scripts/live-check.mjs <ticket-id>`.
8. If the live check fails: run `npx wrangler rollback --message "<ticket-id> live check failed"`,
   mark the ticket `- [!]`, log it, commit and push the log, stop.
9. Mark the ticket `- [x]`, add one line to `plan/LOG.md`, commit `plan/` and `perf/` as `plan: <ticket-id> done`, push.
   (Failed runs commit their log as `plan: <ticket-id> failed`.)

### Never do these automatically
- Never edit `wrangler.toml`, secrets, API keys, or auth/login code.
- Database: only add `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` to `worker/schema.js`
  (prefer the generic `records` table). Never drop, rename, or delete columns, tables, or user data.
  If a ticket needs that, mark it `- [?]` with the question and stop.
- Never add a paid service or a new API key. If one is needed, mark `- [?]` and stop.
- Never build the Android APK or bump the Android version.
- Never touch more than ~8 files in one ticket.

### Safety rules for driving features
- Anything the driver taps while the car is moving stays locked (follow the existing "locked while moving" pattern).
- Scores and stats reward smoothness and control, never raw top speed.
