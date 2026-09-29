# 454 Workshop: notes for Claude

Read this first in every session. It's what a new session needs to work on this project safely. The detail is
in `DEVELOPING.md`, `apps/control/README.md`, `apps/design/README.md` and `CHANGELOG.md`.

## What this is

**454 Workshop** is free, open-source (MIT) CNC software for GRBL routers like the Shapeoko and Nomad, in beta:

- **454 Design**: browser CAD with CAM (toolpaths, G-code, job sheets). The page is `design.html`; the CAM
  engine is `cam.js` and `geom.js` beside it.
- **454 Control**: a GRBL sender (connect, home, jog, probe with BitZero and BitSetter, run jobs). The page is
  `index.html`.
- **454 Workshop desktop app**: both, plus the docs, in one Electron app for Windows (`apps/desktop`), updating
  itself from GitHub Releases.
- **Website**: https://454workshop.com, with the docs at /docs (Cloudflare).
- **Repository**: https://github.com/ctredway/454-workshop (`main`).
- **Working folder**: `C:\projects\454-workshop`, cloned fresh on 2026-09-29. Two old folders are left over
  and hold nothing GitHub doesn't: `C:\projects\kerf-repo` (the previous clone, from when the repository
  was named `kerf-repo`) and `C:\projects\454-workshop-old` (an unzipped website build mixed with older
  copies of project files). Don't work in either; they can be deleted.

The owner is Clint Tredway, who runs a Shapeoko XXL (VFD spindle, BitSetter, BitZero v2) and is getting a
Shapeoko 5.1 Pro. He's a woodworker, not a git expert: explain git and GitHub steps plainly, and offer to run
them.

**This software moves a spinning cutter.** A wrong depth, a missed lift or a thin tab can ruin work or throw a
part. Correctness beats speed. Prove changes; don't assume them.

## Layout

| Path | What |
| --- | --- |
| `index.html` | 454 Control, **generated** from `apps/control/src` |
| `design.html` | 454 Design, **generated** from `apps/design/src` |
| `cam.js`, `geom.js` | the CAM engine (edited directly) |
| `apps/control/` | Control's sources (`src/`), build (`build.mjs`), tests (`test/`), README |
| `apps/design/` | Design's sources, build, tests (with `test/harness.mjs`), README |
| `apps/desktop/` | the Electron app: `src/main.js`, `src/updater.js`, `scripts/build-app.js`, tests |
| `packages/gcode/src/parser.cjs` | **the G-code parser**, shared: Control's build includes it |
| `packages/grbl/` | a GRBL simulator, for the end-to-end tests |
| `docs-site/` | the docs (Astro Starlight): `src/content/docs/*.mdx`, screenshots in `src/assets/shots` |
| `site/` | the website's landing page and `build.js` |
| `.github/workflows/` | `test.yml` (every push), `windows.yml` (desktop builds and releases) |

## Rules

1. **Never edit `index.html` or `design.html` directly.** Edit `apps/control/src` or `apps/design/src`, then
   run `node apps/control/build.mjs` or `node apps/design/build.mjs`, and commit both. GitHub checks they
   match (`--check`), and the Windows build refuses to build if they don't.
2. **The website zip is for Cloudflare only, never the repository.** Unzipped into the repo, its landing page
   replaces Control's `index.html`, and its built copies (`control/`, `design/`, `docs/*.html`) land beside
   the sources. This has happened twice. The site is built with `node site/build.js` into `site-dist/`,
   which is git-ignored.
3. **Line endings are LF** (`.gitattributes`). The builds read either, but keep files LF.
4. **Versions:** Control's is in `apps/control/src/js/version.js`, Design's in `apps/design/src/js/version.js`,
   the desktop app's in `apps/desktop/package.json`. Bump the right one for any change in behaviour, and add a
   `CHANGELOG.md` entry that says what changed and why, in plain words.
5. **Confirm before anything leaves the machine**: pushing, publishing a release, deleting tags or releases.
6. **Write for woodworkers.** On-screen text and docs are plain and specific: say what happens and what to do.
   Don't blame the connection for errors that aren't connection errors.

## Building and testing

```sh
npm ci                                            # root: the packages, and linkedom for Design's tests
npm run build                                     # the packages (plugin-api, gcode, grbl)
npm test                                          # package tests, including the parser's golden tests
node --test 'apps/control/test/*.test.mjs'        # Control: parser, job builder, BitSetter
node --test 'apps/design/test/*.test.mjs'         # Design: file formats and toolpaths, on its real sources
cd apps/desktop && npm ci && npx vitest run       # the desktop app: updater, serial
cd docs-site && npm ci && npm run build           # the docs (Node 22.12 or later)
```

- **Design's tests** load its real source files into Node through `apps/design/test/harness.mjs` (Design's
  own markup as the page, linkedom for the DOM, page startup run, drawing a no-op). Its values come from
  another JavaScript context: compare plain copies (`JSON.parse(JSON.stringify(v))`), not the objects.
- **The end-to-end tests** (`apps/desktop/test/e2e.sh`, and the BitSetter and tool-offset variants in
  `DEVELOPING.md`) drive the real app against the simulated GRBL machine. They use `socat` and `xvfb-run`,
  which are Linux tools: on Windows they need WSL or adapting.
- **Screenshots for the docs**: `cd docs-site && npm run shots` retakes all of them (`SHOTS_ONLY=name` for one).
- **Check that tests can fail.** After writing a test, break the code it covers on purpose and confirm the
  test fails, then restore the code. Several tests here passed for the wrong reason until checked this way.
- **Prove refactors.** Moving code without changing behaviour was proven byte for byte (the source splits)
  or by running old and new side by side on many inputs (the job builder). Keep doing that.

## Releases (the desktop app)

1. Set the new version in `apps/desktop/package.json` (a suffix such as `-beta.13` makes a pre-release,
   offered only on the app's **Beta** update channel), commit, and push to `main`.
2. The Windows workflow builds it and **drafts** a release with the installer, zip, `latest.yml` and blockmap.
   It creates **no tag**: GitHub creates the tag when the draft is published.
3. **Publish that draft.** Never create a release by hand: a hand-made release has no files, and installed
   copies can't update from it.

Why the tag waits: installed copies find updates through GitHub's release feed, which lists every tag. A tag
without a published release looks to them like a newest release with nothing in it, and they stop there.
(`gh release list`, `gh release view vX`, and `gh release edit vX --draft=false` publish from the command line.)

## How it behaves, on purpose

- **Nothing interrupts a job.** A new version shows as a notice in Control's and Design's headers
  (`apps/desktop/src/renderer/update-badge.js`), never a window; **Restart to update** is refused while
  454 Control's `machineBusy()` is true. The menu's Check for updates… asks in windows, which wait for it.
- **Profiles and pockets ramp in by default** (4× the cutter's diameter, at least 4 mm, or a set length);
  **Ramp in: Plunge** goes straight down. A profile that ramps uses only its lead-out. (`tpRamp` in
  `toolpath-generate.js`; the CAM engine takes ramp length 0 as a plunge.)
- **Copy and paste bring dimensions** (`clipboard.js`): a dimension whose shapes were all copied is pasted
  measuring the copies; one to a shape left behind stays. Ctrl+V pastes at the pointer, Ctrl+Shift+V in place.
- **Design asks before closing an unsaved drawing** (not saved to a file since it changed; `unsaved.js`):
  the desktop app asks Save… / Don't save / Cancel, for the window, a quit and a restart to update.
  Don't save, New, or opening another drawing puts it aside; File → Recover last drawing brings it back.
- **The job builder** (`apps/control/src/js/job-builder.js`, tested) adds: a spin-up wait after every M3 **or
  M4** (default 7 s; a saved setting is never lowered), a lift before a spindle stop (never downwards), at a
  tool change a lift, a stop, and a restart if the file assumes the spindle is running, and at the end lift,
  stop, back to XY zero, park, with the file's M2 or M30 last.
- **Setting Z zero cancels the controller's tool length offset (G49) first**, by every route, so an old
  BitSetter offset can't be built into the new zero. (One once made a job cut 20 mm too deep.)
- **The BitSetter searches fast** (the speed that coasts at most 0.5 mm, from `$122`), then measures slowly.
- **A tab's thickness is the material it leaves**, measured from the bottom of the material. Tabs are **Flat**
  or **3D (tapered)**. Profiles sit at the cutter's radius, padded by up to 0.011 mm on purpose (never closer).
- **Dimensions remember which edge they measure** (a rectangle's side, an outline's segment), not a point.

## Open items

- **Before the first public release:** change the update check back to every 6 hours: `CHECK_EVERY` in
  `apps/desktop/src/updater.js` (marked TODO), its test in `apps/desktop/test/updater.test.mjs`, and the
  sentence on the docs' "The desktop app" page.
- **Offered, not done:** publishing beta releases automatically instead of as drafts.
- **Next restructuring steps:** tests for Control's status parsing, time estimates and recovery; for Design,
  nesting and the geometry operations; the small quirks each README lists from the byte-identical splits.
- **Later:** code signing (Windows shows a SmartScreen warning), a Linux AppImage release, GitHub Sponsors,
  and seeing the Shapeoko 5.1 Pro connect for real (Control should name it "Shapeoko 5 Pro 4×4, ballscrew Z").
