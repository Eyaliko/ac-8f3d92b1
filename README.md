# Athens City Hotel — performance dashboard

A single-page dashboard built from the five spreadsheets the hotel emails every
morning. Published to GitHub Pages from the `gh-pages` branch; refreshed by a
scheduled task each afternoon.

```
db/     accumulated database (JSON Lines, one record per line)
tools/  parser, database builder, page renderer, publish script
build/  generated — data.json and the self-contained index.html (not committed)
raw/    downloaded spreadsheets (not committed; Gmail is the source of truth)
```

See **RUNBOOK.md** for the daily procedure.

## Rebuilding from scratch

```bash
python3 tools/harvest.py --purge      # after fetching emails via the Gmail tool
python3 tools/parse.py --raw raw
python3 tools/build_db.py
python3 tools/render.py
```

## What the numbers mean

- **Occupancy** — rooms sold ÷ rooms available after out-of-order.
- **ADR** — accommodation revenue ÷ rooms sold.
- **RevPAR** — accommodation revenue ÷ available rooms.
- **Pickup** — rooms added for a future arrival date since an earlier snapshot.
  Only possible because every day's booking plan is kept.

Guest names, email addresses and phone numbers are never written into the
published page.
