#!/usr/bin/env bash
# Commit the database to main and force-push the built page to gh-pages.
set -euo pipefail
cd "$(dirname "$0")/.."
git add -A db/ tools/ *.md .gitignore 2>/dev/null || true
if ! git diff --cached --quiet; then
  git commit -m "data: refresh $(date -u +%Y-%m-%d)"
  git push origin HEAD:main
else
  echo "no database changes to commit"
fi
# ---- gh-pages: single orphan commit, force-pushed ----
rm -rf /tmp/ghp && mkdir -p /tmp/ghp
cp build/index.html /tmp/ghp/index.html
touch /tmp/ghp/.nojekyll
printf 'User-agent: *\nDisallow: /\n' > /tmp/ghp/robots.txt
cd /tmp/ghp
git init -q -b gh-pages
git add -A
git -c user.email=dashboard@localhost -c user.name=dashboard commit -q -m "site: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
git remote add origin "$(cd - >/dev/null && git remote get-url origin)"
git push -q --force origin gh-pages
echo "published gh-pages"
