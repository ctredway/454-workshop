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

MIT, except where a package says otherwise. All of 454 Workshop is free; there is no paid version. See
`LICENSING.md`.

## Building for Windows and Linux on GitHub

The **desktop build** workflow (`.github/workflows/windows.yml`; the file keeps its old name) builds the
Windows installer and a zip on GitHub's Windows machines, and the Linux AppImage on its Linux machines, from
this repository's own `index.html`, `design.html` and `docs/`. Before the AppImage is kept, it runs a real job
against the simulated machine (`apps/desktop/test/e2e-packaged.sh`). One job then drafts one release with both
systems' files: two jobs drafting would make two drafts, as a draft has no tag for the other to find.

- **By hand:** Actions tab, *desktop build*, *Run workflow*. The installer, zip and AppImage are attached to
  the run as artifacts.
- **For a release:** push a version tag (`git tag v0.5.0 && git push origin v0.5.0`). The same build,
  plus a **draft** release with the files attached, to review and publish.

CAM is included only if `cam.js` and `geom.js` are in the repository; until CAM is released they
aren't, and the build leaves CAM out (Design opens with it off). The builds aren't code-signed yet, so
Windows SmartScreen warns on first run ("More info", then "Run anyway").

**On Linux** the AppImage starts through `scripts/linux-launcher.sh` (put in place of the program by
`scripts/after-pack.js`), which adds `--no-sandbox` only where Chromium's sandbox can't work: Ubuntu 24.04 and
later (AppArmor), systems with user namespaces off, and root. To build one yourself on Linux:
`cd apps/desktop && npm run build:app && npx electron-builder --linux AppImage --x64 --publish never`, then
`sh test/e2e-packaged.sh` runs a job through it. Updates were tried by building two versions with
`-c.extraMetadata.version=9.9.1` (and 9.9.2), serving the newer one's AppImage and `latest-linux.yml` with
`python3 -m http.server`, and starting the older with `P454_UPDATE_FEED` set to that server.

## The docs

The documentation at 454workshop.com/docs is the Starlight site in `docs-site/`: see
[docs-site/README.md](docs-site/README.md) for writing pages, previewing them, and regenerating the
screenshots. The website build and the desktop app build both build it and include it; they need it
installed first (`npm ci --prefix docs-site`), and Node.js 22.12 or newer.

## Releasing, and updates

Installed copies of the desktop app update themselves from GitHub Releases (`apps/desktop/src/updater.js`,
tested in `apps/desktop/test/updater.test.mjs`). What a background check finds shows as a notice in the
headers of 454 Control and 454 Design: `apps/desktop/src/renderer/update-badge.js`, which both pages'
builds include (so a change to it means rebuilding both pages), talking to the app through `preload.js`,
and tested in `apps/desktop/test/update-badge.test.mjs`. In a browser it shows nothing. A release is what
delivers an update:

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

**How often installed copies check for updates:** every 6 hours while open (`CHECK_EVERY` in
`apps/desktop/src/updater.js`; its test and the docs' "The desktop app" page say so too). It was every 30
minutes while betas were tested by one person.

**Testing an update before a public release:** use a version with a suffix, such as `0.6.3-beta.1`. The workflow marks it a pre-release, which only copies on the **Beta** channel
(454 Workshop → Updates) are offered. Drafts are never offered.

Update settings are kept in `updates.json` in the app's data folder. For testing the updater itself against
a local server, see `setupUpdates()` in `src/main.js` (the `P454_UPDATE_*` variables, tests only). Running it
that way on Windows:

- A terminal inside VS Code sets `ELECTRON_RUN_AS_NODE=1`, which makes Electron start as plain Node
  ("Cannot find module 'electron'"). Clear it for the run: `env -u ELECTRON_RUN_AS_NODE …`.
- The app's data folder (`%APPDATA%\454`) is the installed copy's too: its drawing, tool library and update
  settings. To keep a test away from them, start the app from a small script that sends `userData`
  elsewhere before requiring `src/main.js`, with a `package.json` beside it giving the version to test from.
- Serve a file that isn't a program as the "installer". An update that's downloaded installs when the app
  quits, test runs included; a stand-in just fails to start. Its download is cached in
  `%LOCALAPPDATA%\p454-update-test`: delete that afterwards.

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
P454_SIM_PROBE=-100,-50,-70,5 P454_E2E_SCRIPT=test/e2e-toolchange.js P454_E2E_NO_DESIGN=1 sh test/e2e.sh # Change tool
```

`e2e-toolchange.js` zeroes Z (taking the reference), starts the spindle over the work, and presses the jog
panel's **Change tool…**: the spindle must stop only once Z is at the top, the machine must go to the
tool-change position, and the new bit must be measured and its offset applied, ending with the jog panel open.
(If the simulator package was built before, and `packages/grbl/dist` lacks `stream.js`, rebuild it with
`npx tsc -b packages/grbl --force`.)

`e2e-tlo.js` leaves a 20 mm tool length offset active (as an earlier job's tool change would), sets Z zero,
takes the BitSetter reference, and runs a job that starts with a tool change: its plunge must land exactly
1 mm below where Z was zeroed. Before 0.31.13 it landed 21 mm below.

The simulator answers a probe move as GRBL does: its [PRB:...] result, then ok; or ALARM:5 alone when it
finds nothing. `npm run build` compiles it (packages/grbl) with the rest.

## The soak test (long jobs)

`apps/desktop/test/soak.sh` runs one long, dense job (a 3D-finishing-style raster: about 83 short moves a second)
in the real desktop app against the simulated controller, and records whether the machine was ever left waiting
with the spindle running (**starvation**: on a real machine, the cutter standing still in the cut), the page's
memory and responsiveness, and each of the app's processes' memory. It needs `socat` and `xvfb-run`, like the
end-to-end tests, and the simulator built (`npm run build`).

```sh
cd apps/desktop
SOAK_MIN=10 sh test/soak.sh                                     # a 10-minute job, in real time
SOAK_MIN=60 SOAK_RENDER_FPS=-1 SOAK_SAMPLE=60 sh test/soak.sh   # an hour, the 3D view not drawn
SOAK_MIN=10 SOAK_FREEZES='[{"at":120,"ms":3000}]' SOAK_HIDE=470:90 sh test/soak.sh   # freeze the page; hide the window
```

Results go to `/tmp/p454-soak.json` (the page: samples of memory, timer lateness and lines a second),
`/tmp/p454-soak-sim.json` (the machine: lines received, starvation, errors) and `/tmp/p454-soak-ps.log` (memory
of each process, every 15 s). `P454_SIM_SPEED` runs the machine faster than real time. On a test computer with no
graphics card, the 3D view is drawn by the processor and slows everything else, so set `SOAK_RENDER_FPS` (10, or
-1 for not at all) to stand in for a PC that has one.

First results (17 October 2026, Control 0.33.0, on a cloud computer with 2 processor cores and no graphics card):

- **30 minutes in real time, 3D view not drawn:** 147,000 lines at a steady 83 a second; the machine waited 0.1 s
  in all. Memory flat: the page's JavaScript about 120 MB throughout, the window's process 320 MB, the machine
  process 165 MB. The page's size and the console's lines didn't grow.
- **A frozen page stops the machine almost at once,** with the spindle running: frozen 1 s, the machine waited
  0.95 s; 3 s, 2.9 s; 10 s, 9.9 s. The job is fed from the page, and the controller holds only about 50 ms of moves.
- **Drawing the 3D view can starve the machine.** It's redrawn 60 times a second, whatever has changed. Drawn by
  the processor (no graphics card), a 50,000-line job got 20 lines a second of the 83 it needed; a 1.2-million-line
  job, 1 or 2. With drawing limited to 10 a second, or off, both ran at full speed.
- **A very large file is heavy:** 1.2 million lines (35 MB) took about 690 MB of the page's memory, and the page
  stopped for 8 s while loading it.
- **Since Control 0.34.0** the 3D view is drawn only when it changes: the 50,000-line job drawn without a graphics
  card now runs at 83 lines a second, waiting 0.2 s in five minutes. (The 1.2-million-line job drawn that way is
  still slow: each frame of it takes the processor over a second.)
- **A hidden (minimised) window kept feeding the job at full speed;** the page's timers slowed to once a second
  (the position display updates less often), and once ran 31 s late just after the window came back.

## 454 Design's source

Design's `design.html` is assembled from `apps/design/src` by `node apps/design/build.mjs`, the same way as
Control's: edit the files there, then build, and commit both. GitHub checks they match. See
[apps/design/README.md](apps/design/README.md) for what's in each file. Design's version is
`apps/design/src/js/version.js`.

**Design's tests** run on its real source files in Node: `node --test 'apps/design/test/*.test.mjs'` (after
`npm ci`, which installs linkedom for them).
