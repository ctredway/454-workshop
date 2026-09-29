# Developing 454 Workshop

Design, CAM and machine control for hobby CNC routers running GRBL (Shapeoko, Nomad and similar), as
one desktop app: **454 Design** draws the parts and makes the toolpaths, **454 Control** runs the
machine. Both started as browser apps; this project turns them into a desktop app built from tested
packages. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how it fits together and where the move
stands.

## What's here

| Part | What it does |
|---|---|
| `apps/desktop` | **454 Workshop**, the Electron app: Design and Control in their own windows, the machine connection in its own process, everything bundled so it works offline |
| `packages/gcode` | G-code parsing and checking, as the machine side sees it, including the time estimate with the controller's acceleration |
| `packages/job` | Turning a G-code file into what 454 sends: spin-up waits, lifts before the spindle stops, tool changes, every job's ending |
| `packages/grbl` | A simulated GRBL 1.1 controller (buffers, holds, resets and alarms, homing, probing, soft limits) and the character-counting streamer |
| `packages/plugin-api` | The contract between the core and plugins, and the host that enforces it |

## Working on it

```sh
npm install
npm test                 # every package's tests, including the safety suite
npm run build            # compile the packages

cd apps/desktop
npm install
npm start                # run 454 Workshop from source
npm test                 # the serial connection, against the simulator over a virtual serial port
npm run test:e2e         # the whole app: Control runs a real job, Design makes and saves a toolpath
npm run dist             # build the Linux AppImage and Windows installer
```

## How it's tested

- **Golden tests** pin the moved code to the browser apps: real jobs whose parsed output, and whose
  lines as sent, must match what 454 Control produces. If a change alters one, the test fails, and
  the change needs a reason.
- **The safety suite** streams real jobs through the simulated controller and checks, on its record
  of what the machine did, the rules 454 promises: the spindle is up to speed before every cut and
  never stops in the material, tool changes lift with the spindle off, added moves never go into the
  material, and every job ends safely. It's proven to catch failures: deliberately breaking each of
  those protections makes it fail.
- **End-to-end tests** run the desktop app under a virtual screen, connected over a virtual serial
  port to the simulator.

## Why 454?

454 is a nod to my dad. He was a huge Chevy guy, and when I was five he bought a 1967 Corvette with a
454 big block in it. He's the one who taught me how to build things, so I named my making after his
love for Chevy big blocks.

## Licence

MIT, except where a package says otherwise. See `LICENSING.md` in the main repository for what stays
free and what may become commercial.

## Building for Windows on GitHub

The **windows build** workflow (`.github/workflows/windows.yml`) builds the installer and a zip on
GitHub's Windows machines, from this repository's own `index.html`, `design.html` and `docs/`:

- **By hand:** Actions tab, *windows build*, *Run workflow*. The installer and zip are attached to the
  run as an artifact.
- **For a release:** push a version tag (`git tag v0.5.0 && git push origin v0.5.0`). The same build,
  plus a **draft** release with the files attached, to review and publish.

CAM is included only if `cam.js` and `geom.js` are in the repository; until CAM is released they
aren't, and the build leaves CAM out (Design opens with it off). The builds aren't code-signed yet, so
Windows SmartScreen warns on first run ("More info", then "Run anyway").

## The docs

The documentation at 454workshop.com/docs is the Starlight site in `docs-site/`: see
[docs-site/README.md](docs-site/README.md) for writing pages, previewing them, and regenerating the
screenshots. The website build and the desktop app build both build it and include it; they need it
installed first (`npm ci --prefix docs-site`), and Node.js 22.12 or newer.

## Releasing, and updates

Installed copies of the desktop app update themselves from GitHub Releases (`apps/desktop/src/updater.js`,
tested in `apps/desktop/test/updater.test.mjs`). A release is what delivers an update:

1. Set the version in `apps/desktop/package.json` (say `0.6.3`), commit, and push to `main`. The Windows
   workflow sees the new version, builds the installer and zip, checks the update files (`latest.yml` or
   `beta.yml`, and the blockmap) were made, and drafts a release (`v0.6.3`) with all of them attached.
   (A change to package.json that keeps the version builds nothing, and so does pushing again while that
   version's draft is waiting. Pushing a tag by hand still works too.)
2. Look the draft over on the Releases page, then **publish it**. Publishing creates the tag. Installed
   copies are offered it at their next check. Don't create a release by hand for the version: publish the
   draft, which has the files.

**Why the tag waits for publishing:** installed copies find updates through GitHub's release feed, which
lists every tag, released or not. A tag made before its release is published looks to them like a newest
release with nothing in it, and they stop there, even with an older complete release published. (That's
what the workflow did up to 0.6.2-beta.11: beta.8 saw beta.11's tag, and never beta.9.)

**Before the first public release:** installed copies check for updates every 30 minutes, for testing
betas. Change it back to every 6 hours: `CHECK_EVERY` in `apps/desktop/src/updater.js` (it's marked TODO),
and the sentence about it on the docs' "The desktop app" page.

**Testing an update before a public release:** use a version with a suffix, such as `0.6.3-beta.1`. The workflow marks it a pre-release, which only copies on the **Beta** channel
(454 Workshop → Updates) are offered. Drafts are never offered.

Update settings are kept in `updates.json` in the app's data folder. For testing the updater itself against
a local server, see `setupUpdates()` in `src/main.js` (the `P454_UPDATE_*` variables, tests only).

## 454 Control's source

Control's `index.html` is assembled from `apps/control/src` by `node apps/control/build.mjs`: edit the
files there, then build, and commit both. GitHub checks they match on every push. See
[apps/control/README.md](apps/control/README.md) for what's in each file.

**Where things are:** 454 Control's version is `apps/control/src/js/version.js`. The G-code parser is
`packages/gcode/src/parser.cjs`, used by both Control and the `@454/gcode` package; change it there, and
run both test suites (`npm test`, and `node --test 'apps/control/test/*.test.mjs'`).

## Where each download goes

- **Source files** go in the repository: `index.html` (454 Control, assembled from `apps/control/src`),
  `design.html`, `apps/`, `packages/`, `site/`, `docs-site/`.
- **The website zip** (`454workshop-site.zip`) goes to Cloudflare only. Unzipped into the repository,
  its landing page replaces Control's `index.html`, and its built copies (`control/`, `design/`,
  `docs/*.html`) sit beside the sources. The Windows build now stops if that happens, rather than
  building from the wrong files; `tidy-repo` puts it right.

## Testing the BitSetter

The end-to-end test can run 454 Control's BitSetter test against the simulated machine, with a probe switch
where the BitSetter is (P454_SIM_PROBE is "x,y,z,radius", in machine coordinates):

```sh
cd apps/desktop
P454_SIM_PROBE=-100,-50,-70,5 P454_E2E_SCRIPT=test/e2e-bitsetter.js P454_E2E_NO_DESIGN=1 sh test/e2e.sh   # finds it
P454_E2E_SCRIPT=test/e2e-bitsetter.js P454_E2E_NO_DESIGN=1 sh test/e2e.sh                                # none: must stop
P454_SIM_PROBE=-100,-50,-70,5 P454_E2E_SCRIPT=test/e2e-tlo.js P454_E2E_NO_DESIGN=1 sh test/e2e.sh        # a leftover offset
```

`e2e-tlo.js` leaves a 20 mm tool length offset active (as an earlier job's tool change would), sets Z zero,
takes the BitSetter reference, and runs a job that starts with a tool change: its plunge must land exactly
1 mm below where Z was zeroed. Before 0.31.13 it landed 21 mm below.

The simulator answers a probe move as GRBL does: its [PRB:...] result, then ok; or ALARM:5 alone when it
finds nothing. `npm run build` compiles it (packages/grbl) with the rest.

## 454 Design's source

Design's `design.html` is assembled from `apps/design/src` by `node apps/design/build.mjs`, the same way as
Control's: edit the files there, then build, and commit both. GitHub checks they match. See
[apps/design/README.md](apps/design/README.md) for what's in each file. Design's version is
`apps/design/src/js/version.js`.

**Design's tests** run on its real source files in Node: `node --test 'apps/design/test/*.test.mjs'` (after
`npm ci`, which installs linkedom for them).
