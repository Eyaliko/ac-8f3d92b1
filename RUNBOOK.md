# Daily refresh runbook

This is the procedure the scheduled task follows every afternoon. It is written
for a fresh session with no memory of how the dashboard was built.

**What this repo is.** Athens City Hotel emails five spreadsheets every morning
from `rsv@athenscityhotel.com`. This repo holds the accumulated database built
from those emails and the code that turns it into a one-page dashboard published
on GitHub Pages.

---

## The five attachments

| File | What it is | Grain |
|---|---|---|
| `athensct_manager_report_*.xlsx` | Actual results — occupancy, arrivals, revenue split, guests, plus the same figures for last year | one report date (usually yesterday), with MTD and YTD columns |
| `athensct_booking_plan_*.xlsx` ×3 | Forward bookings, 3 × 30-day blocks = 90 days out, by room type | one snapshot per day |
| `athensct_accommodations_list_*.xlsx` | Every reservation **created the previous day** — channel, country, rate, status | one row per reservation |

The accommodations list occasionally arrives as a different export (a full
reservations list rather than the previous day's new bookings). The parser
detects both and tags them `variant: a` / `variant: b`; only variant A days that
are genuinely "yesterday's bookings" feed the production charts.

---

## Where this runs

The repo is `Eyaliko/ac-8f3d92b1`. **It must be attached to the session** — the git
proxy only injects credentials for repositories in the session's authorized set, so
a session without it can read the repo but `git push` fails with 403.

GitHub Pages serves the **`main` branch from `/` (root)**, so the live site at
<https://eyaliko.github.io/ac-8f3d92b1/> is simply whatever `index.html` sits at the
repo root. Publishing = committing that file.

## Steps

### 1. Clone

```bash
git clone --depth 50 https://github.com/Eyaliko/ac-8f3d92b1.git /home/claude/hotel
cd /home/claude/hotel
```

Confirm push access before doing any work — better to fail here than after
downloading a day's email:

```bash
git push --dry-run origin main
```

If that returns `access denied by the git proxy`, stop and tell the user the
repository is not attached to this session.

### 2. Find any emails not yet in the manifest

Use the Gmail MCP tool `search_threads`:

- query: `from:rsv@athenscityhotel.com has:attachment newer_than:14d`
- pageSize: 50, view: `THREAD_VIEW_METADATA_ONLY`

Every thread has exactly one message. Append any message id **not already in
`db/manifest.tsv`** to that file as `<messageId><TAB><ISO date>`, then sort and
dedupe:

```bash
sort -u db/manifest.tsv -o db/manifest.tsv
```

If nothing new appears, the hotel has not sent today's report yet — stop, and say
so rather than republishing an unchanged page.

### 3. Download the attachments

For each new message id, call the Gmail tool `get_message` with
`messageFormat: "RAW"`.

**The call will return an error saying the result is too large and has been saved
to a file. That is the expected, successful outcome** — it keeps ~280 KB of
base64 per email out of the conversation. Do not retry with a different format,
do not read the spill files.

Then:

```bash
python3 tools/harvest.py --purge
```

It decodes every spill file it finds, writes the spreadsheets to `raw/<date>/`,
and prints `NEW_DAYS=<comma separated dates>`.

### 4. Parse and merge

```bash
python3 tools/parse.py --raw raw --days 2026-08-21 2026-08-22   # the NEW_DAYS values
```

This merges into the three JSON Lines stores under `db/`, keyed so re-running is
always safe:

| Store | Key |
|---|---|
| `db/daily_actuals.jsonl` | report date |
| `db/booking_snapshots.jsonl` | snapshot date + stay date |
| `db/reservations.jsonl` | snapshot date + reservation id + room + check-in |

### 5. Rebuild and publish

```bash
python3 tools/build_db.py     # -> build/data.json
python3 tools/render.py       # -> build/index.html (self-contained)
```

Sanity-check the printed summary: the daily row count should have grown by
roughly the number of new days, and `latest snapshot` should be today.

Then publish — this copies `build/index.html` to the repo root and pushes:

```bash
bash tools/publish.sh
```

The live site updates a minute or two later. If the script says *"nothing to
publish"*, the rebuild produced no change, which usually means step 2 found no new
email — do not force it.

### 6. Report

Tell the user which dates were added and the headline numbers for the newest
report date. If anything failed — no email, a parse error, a push failure — say
what happened and what is now stale.

---

## Notes and gotchas

- **Everything is idempotent.** Re-running any step cannot double-count; records
  are keyed and overwritten. If a day is missed entirely, the next run picks it
  up as long as its message id reaches `db/manifest.tsv`.
- **Missing days self-heal.** `build_db.py` reconstructs a missing report date
  from the month-to-date movement either side of it, and marks it as estimated so
  the dashboard can warn about it.
- **2025 comes from the prior-year columns** of the 2026 reports, which is why
  history reaches back to 1 Jan 2025 even though the oldest email is Sept 2025.
- The full backfill (355 emails) took six parallel subagents about four minutes.
  Only do that again if the stores are lost — normally one day is one email.
- **No guest identities, anywhere in this repo.** The repository is public, so
  `tools/parse.py` no longer maps the spreadsheets' "Full Name"/"Client" and
  "Email" columns at all — they are never written to `db/reservations.jsonl`.
  `tools/publish.sh` refuses to push if a `guest` or `email` field turns up in the
  database, or if anything resembling a guest email address appears in the page.
  If you ever change the parser, keep both guards.
- **History growth.** `index.html` is ~1.2 MB and is rewritten every day, so the
  repo grows about half a gigabyte a year. `publish.sh` warns past 500 MB. To
  squash when that happens:

  ```bash
  git checkout --orphan squashed && git add -A
  git commit -m "squash history $(date -u +%Y-%m-%d)"
  git branch -D main && git branch -m main && git push -f origin main
  ```

  Nothing is lost that matters — Gmail is the source of truth and the database
  rebuilds from it.
