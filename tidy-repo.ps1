# Tidies the 454-workshop repository back to source files only, after the website zip was unzipped into it.
#
#   1. Unzip repo-sync.zip over your local copy of the repository (replace files when asked).
#   2. In PowerShell, in the repository's top folder:   powershell -ExecutionPolicy Bypass -File tidy-repo.ps1
#   3. Look over what git status lists, then commit and push.
#
# Everything removed goes with `git rm`, so it all stays in the repository's history.
# The website zip is for Cloudflare only: it doesn't belong in the repository.
$ErrorActionPreference = 'Stop'
if (-not (Test-Path .git)) { throw 'Run this in the top folder of your 454-workshop repository (the one with the .git folder).' }
if (-not (Select-String -Path index.html -Pattern 'CONTROL_VERSION' -Quiet)) { throw 'index.html is not 454 Control yet: unzip repo-sync.zip over the repository first.' }

$remove = @(
  'control', 'design',                          # the website's built copies of the apps
  '_headers', '_redirects', 'build.js', 'images', # the website's files (their sources are in site/)
  '454workshop-site.zip',                       # a built website
  'favicon.svg', 'icon.png', 'logo.svg', 'og.png', 'control.png', 'design.png',
  'gitignore',                                  # missing its dot, so git never used it
  'docs/_astro', 'docs/pagefind', 'docs/404.html', 'docs/favicon.svg', 'docs/docs.css',   # the built docs (their source is docs-site/)
  'apps/control/src/js/parser.js'               # the parser moved to packages/gcode/src/parser.cjs
)
$remove += Get-ChildItem docs -Filter *.html -File | ForEach-Object { 'docs/' + $_.Name }
$remove += Get-ChildItem docs -Filter 'sitemap*.xml' -File | ForEach-Object { 'docs/' + $_.Name }

foreach ($p in $remove) {
  if (Test-Path $p) {
    git rm -r -q --ignore-unmatch -- $p
    if (Test-Path $p) { Remove-Item -Recurse -Force $p }
    Write-Host "  removed  $p"
  }
}
git add -A

Write-Host ''
if (Get-Command node -ErrorAction SilentlyContinue) {
  Write-Host 'Checking 454 Control against its sources:'
  node apps/control/build.mjs --check
}
Write-Host ''
Write-Host 'Changes ready to commit (review, then: git commit -m "Tidy the repository: sources only" and git push):'
git status --short
