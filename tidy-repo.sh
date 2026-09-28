#!/bin/sh
# The same as tidy-repo.ps1, for macOS or Linux: run in the repository's top folder after unzipping repo-sync.zip over it.
set -e
[ -d .git ] || { echo 'Run this in the top folder of your 454-workshop repository (the one with the .git folder).'; exit 1; }
grep -q CONTROL_VERSION index.html || { echo 'index.html is not 454 Control yet: unzip repo-sync.zip over the repository first.'; exit 1; }
for p in control design _headers _redirects build.js images 454workshop-site.zip favicon.svg icon.png logo.svg og.png control.png design.png gitignore \
         docs/_astro docs/pagefind docs/404.html docs/favicon.svg docs/docs.css docs/*.html docs/sitemap*.xml apps/control/src/js/parser.js; do
  if [ -e "$p" ]; then git rm -r -q --ignore-unmatch -- "$p"; rm -rf "$p"; echo "  removed  $p"; fi
done
git add -A
echo; if command -v node >/dev/null; then echo 'Checking 454 Control against its sources:'; node apps/control/build.mjs --check; fi
echo; echo 'Changes ready to commit (review, then: git commit -m "Tidy the repository: sources only" and git push):'
git status --short
