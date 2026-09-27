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
