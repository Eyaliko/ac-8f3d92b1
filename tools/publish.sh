#!/usr/bin/env bash
# Copy the freshly built page to the repo root and push everything to main.
# GitHub Pages is configured to serve this repo's main branch from / (root),
# so committing index.html here is what makes the live site update.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f build/index.html ]; then
  echo "ERROR: build/index.html missing — run tools/build_db.py then tools/render.py first" >&2
  exit 1
fi
cp build/index.html index.html

# Safety net: this repository is public. Refuse to publish if any personal data
# has found its way into the database or the page.
if grep -lE '"(guest|email)"[[:space:]]*:' db/*.jsonl 2>/dev/null | grep -q .; then
  echo "ABORT: personal data found in db/*.jsonl — not publishing." >&2
  echo "Strip the 'guest' and 'email' fields before committing (see RUNBOOK.md)." >&2
  exit 1
fi
if grep -qE '@(gmail|guest\.booking|hotmail|yahoo|outlook)\.' index.html 2>/dev/null; then
  echo "ABORT: what looks like a guest email address is present in index.html." >&2
  exit 1
fi

git add -A db/ tools/ index.html README.md RUNBOOK.md .gitignore .nojekyll 2>/dev/null || true
if git diff --cached --quiet; then
  echo "nothing to publish — no changes"
  exit 0
fi
git -c user.email=dashboard@localhost -c user.name="Athens dashboard" \
    commit -q -m "refresh $(date -u +%Y-%m-%d)"
git push origin HEAD:main
echo "pushed — https://eyaliko.github.io/ac-8f3d92b1/ updates within a minute or two"

# housekeeping: index.html is ~1.2 MB and is rewritten daily, so history grows
# roughly 0.5 GB a year. Warn well before GitHub starts complaining at 1 GB.
size_kb=$(du -sk .git | cut -f1)
if [ "$size_kb" -gt 500000 ]; then
  echo "NOTE: repo history is $((size_kb/1024)) MB. Consider squashing (see RUNBOOK.md)." >&2
fi
