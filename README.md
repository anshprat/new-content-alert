# Regulatory Update Monitor

A Cloudflare Worker that watches **RBI**, **IRDAI**, and **NPCI** for newly published
regulatory items (notifications, circulars, press releases) and **alerts on new ones**.

This is **change detection**, not archival or search. An alert carries only **title +
link + source + published date** — there is **no content summary, no PDF fetching, no
text extraction, and no OCR** anywhere in the project (by design, and to stay within the
free-tier CPU limit). The linked document itself is never fetched.

```
Cron (hourly)
  └─ for each enabled source adapter (isolated):
       fetchLatest() → normalized Item[]
       diff against per-source seen-set (KV)
       cold start? → seed silently (no alerts)
       else → for each new item (oldest→newest): notify() then persist
  └─ optional heartbeat ping
```

## Layout

| Path | Role |
|---|---|
| `src/index.ts` | Worker entry: `scheduled()` (cron) + `fetch()` (manual/dev) |
| `src/config.ts` | All source URLs, flags, top-N, retention, notifier selection |
| `src/fetcher.ts` | Fetch wrapper: UA, timeout, retry+backoff, jitter |
| `src/core/{store,diff,run}.ts` | Seen-state (KV), diff, orchestration |
| `src/adapters/{rbi,irdai,npci}.ts` | One adapter per source (RBI=RSS, IRDAI=HTML, NPCI=JSON API) |
| `src/notifiers/{console,slack,email}.ts` | Pluggable notification sinks |
| `src/heartbeat.ts` | Optional end-of-run healthcheck ping |
| `test/` | Vitest suites + captured live fixtures |
| `VERIFICATION.md` | What was verified live vs. assumed (read this) |

## Setup

```bash
npm install

# Create the KV namespace and paste the returned id into wrangler.toml (id = "…")
npx wrangler kv namespace create SEEN
```

`compatibility_date` and the hourly cron are already set in `wrangler.toml`.

## Run locally

```bash
npm test          # unit tests (parsers, diff, cold-start, idempotency) — no network
npm run dev       # wrangler dev on http://localhost:8787
```

With `wrangler dev` running, drive it via the HTTP handler (the cron does not fire in
dev):

```bash
curl "http://localhost:8787/run?seed=1"   # FIRST: seed every source WITHOUT alerting
curl "http://localhost:8787/run"          # subsequent: alert only genuinely new items
```

`GET /run` returns a JSON run report (per-source `fetched`/`alerted`/`ok`). The default
notifier is `console`, so alerts appear in the `wrangler dev` log.

## Initial seed run (important)

On the very first run against an empty store, every source **seeds silently** — it
records what is currently listed and emits **no alerts** (otherwise the first run would
flood you with everything already published). Subsequent runs alert only on new items.

- First real deploy: just let the cron run once (it cold-starts per source), **or** hit
  `GET /run?seed=1` once to seed explicitly.
- To re-seed later (e.g. after enabling a new source): `GET /run?seed=1`.

## Deploy

```bash
# Secrets are sourced from Doppler and set as Worker secrets (never committed):
doppler run -- bash -c 'echo "$SLACK_WEBHOOK_URL" | npx wrangler secret put SLACK_WEBHOOK_URL'
doppler run -- bash -c 'echo "$HEARTBEAT_URL"     | npx wrangler secret put HEARTBEAT_URL'

npm run deploy
```

## Configuration

Non-secret knobs live in `wrangler.toml` `[vars]`; secrets are Worker secrets.

| Var | Default | Meaning |
|---|---|---|
| `ENABLED_SOURCES` | `RBI,IRDAI,NPCI` | Which sources to poll. Set to `RBI` to honour IRDAI/NPCI robots.txt strictly. |
| `ACTIVE_NOTIFIERS` | `console` | `console` \| `slack` \| `email` (comma-separated). |
| `TOP_N` | `25` | Rows/items inspected per surface. |
| `RETENTION_DAYS` | `90` | Seen ids older than this are pruned. |
| `USER_AGENT` | descriptive UA | Identifies the monitor. |
| `FETCH_TIMEOUT_MS` / `FETCH_RETRIES` | `10000` / `2` | Per-request timeout and retries. |
| `SLACK_WEBHOOK_URL` | — *(secret)* | Enables the Slack notifier. |
| `EMAIL_API_KEY` | — *(secret)* | Resend API key — enables the email notifier. |
| `EMAIL_FROM` | — | Verified Resend sender, e.g. `Monitor <alerts@domain>`. Required for email. |
| `EMAIL_TO` | `new-direction-alert@googlegroups.com` | Email recipient (the Google Group). |
| `HEARTBEAT_URL` | — *(secret)* | Pinged after each successful run. |

Cron schedule is the one line `crons = [...]` in `wrangler.toml`.

## How to add a source

1. Implement `SourceAdapter` (`fetchLatest(ctx): Promise<Item[]>`) in
   `src/adapters/<name>.ts`, returning normalized `Item`s. Keep the parser a pure
   function so it can be unit-tested against a fixture.
2. Register it in `src/adapters/index.ts` and add its name to the `SourceName` union in
   `src/types.ts`.
3. Add its URLs/config in `src/config.ts` and include the name in `ENABLED_SOURCES`.

## How to wire a real notifier

- **Slack:** create an Incoming Webhook, set `SLACK_WEBHOOK_URL`, add `slack` to
  `ACTIVE_NOTIFIERS`. (Implemented in `src/notifiers/slack.ts`.)
- **Email (Resend → Google Group):** `src/notifiers/email.ts` posts one email per new item
  via the [Resend](https://resend.com) API. To enable:
  1. Create a Resend account and **verify a sender domain**; create an API key.
  2. `wrangler secret put EMAIL_API_KEY` (the Resend key); set `EMAIL_FROM` (a verified
     sender like `Regulatory Monitor <alerts@your-domain>`) in `wrangler.toml`. `EMAIL_TO`
     defaults to `new-direction-alert@googlegroups.com`.
  3. Add `email` to `ACTIVE_NOTIFIERS`.
  4. Ensure the Google Group **accepts posts from `EMAIL_FROM`** — set it to *"Anyone on the
     web can post"* or add the sender as an allowed poster, otherwise the group bounces it.
  - To swap providers (SendGrid/SES/etc.), reimplement `notify()` in `email.ts`; the
     `buildResendPayload` helper and notifier wiring are the only Resend-specific parts.
- A **filter hook** (`applyFilter` in `src/core/run.ts`) is the place to add
  category/topic filtering later — it is identity today (out of scope).

## Guarantees & free-tier fit

- **Idempotency:** new items are processed oldest→newest; each is persisted to KV
  **immediately after** a successful notify. A crash mid-run therefore re-alerts **at
  most the one in-flight item**, never a flood, and never re-alerts an already-persisted
  item. (If multiple notifiers are active and only some fail, that item may re-alert to
  the ones that already succeeded.)
- **Per-source isolation:** each source runs in its own try/catch and its own KV key —
  if IRDAI is down, RBI and NPCI still process and no state is corrupted.
- **Free tier:** hourly cron = 24 runs/day (limit 100k requests/day); ~3–15 subrequests
  per run (limit 50); KV writes only when something new appears, one key per source
  (limit 1k writes/day). CPU stays under 10ms because the work is I/O-bound — **this
  relies on never fetching/parsing the linked PDFs.**
- **Storage choice:** Cloudflare **KV** — the state is a small set of seen ids; one key
  per source keeps writes to a handful per run. (D1 would be the choice only if we later
  wanted queryable history.)

See **VERIFICATION.md** for exactly what was confirmed live (including how the NPCI JSON
API endpoint was captured via headless Chrome/CDP) and the documented robots.txt deviation.
