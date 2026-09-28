# 454 Control: source

454 Control is one self-contained page, `index.html` at the top of the repository, used as it is by the
website and the desktop app. It's assembled from the files here, so it can be worked on in pieces.

```sh
node apps/control/build.mjs            # assemble index.html from src/
node apps/control/build.mjs --check    # does index.html match src/? (GitHub checks this on every push)
```

**Edit the files in `src/`, then build.** Don't edit `index.html` itself: the check fails if it doesn't
match its sources, so a direct edit can't slip through.

`src/control.html` is the page, with an `@@include` line wherever a file's contents go. They're included
exactly as they are, in the order listed, and everything shares one scope, as it did before the split: a
function in one file can call one in another. An include can also come from elsewhere in the repository:
**the G-code parser is `packages/gcode/src/parser.cjs`**, one file shared with the `@454/gcode` package, so
Control runs exactly the parser the package's golden tests check.

**Control's version** is in `src/js/version.js`.

## The files, in the order they're included

| File | Lines | What's in it |
| --- | ---: | --- |
| `styles/control.css` | 263 | all of Control’s styles |
| `js/browser-check.js` | 37 | the Chrome-or-Edge check; runs ahead of everything else, even if the rest fails to load |
| `js/version.js` | 5 | Control's version number |
| `../../packages/gcode/src/parser.cjs` | 470 | **the G-code parser** (GRBL / Carbide Motion dialect), shared with the `@454/gcode` package: moves, arcs, units, the file's issues, tools and toolpath names from CAM comments |
| `js/checks.js` | 44 | checks that depend on settings: outside the work area, deeper than the stock, rapids below zero |
| `js/viewer.js` | 398 | the three.js 3D view: the toolpath, the table, the view cube, the camera |
| `js/playback.js` | 146 | simulated playback of the job, and progress colouring |
| `js/code-panel.js` | 51 | the Code tab: a virtualised list of the file’s lines |
| `js/checks-panel.js` | 28 | the Checks tab, and the summary stats above the tabs |
| `js/job-summary.js` | 185 | the Toolpaths tab: each toolpath’s tool, depths, feeds and time |
| `js/wiring.js` | 254 | reading settings from the page, loading files, and wiring the page’s controls |
| `js/machine-state.js` | 43 | the machine layer’s shared state (SERIAL and friends) |
| `js/jogging.js` | 91 | jogging: steps, continuous jogs, and their safety limits |
| `js/estop.js` | 22 | the emergency stop |
| `js/probing.js` | 54 | the probing engine |
| `js/bitsetter.js` | 149 | the BitSetter: measuring tool length, and tool changes that use it |
| `js/bitzero.js` | 72 | the BitZero: setting Z zero with the touch plate |
| `js/overrides.js` | 80 | real-time feed and spindle overrides, and the Z nudge |
| `js/jog-panel.js` | 115 | the jog panel and its keyboard, and the tool-change prompt’s jog actions |
| `js/serial.js` | 219 | the connection: connecting, sending lines, the read loop, handling each line from the controller |
| `js/status.js` | 141 | status reports: machine and work position, state, and the status display |
| `js/profile-defaults.js` | 17 | the machine profile’s defaults |
| `js/quick-actions-state.js` | 7 | quick actions’ state |
| `js/dialogs.js` | 62 | in-app dialogs, notes and the ⓘ help |
| `js/controller-check.js` | 62 | checking the controller’s $ settings after connecting; the connect prompt |
| `js/theme.js` | 64 | theme and accent colour, shared with 454 Design |
| `js/home-prompt.js` | 23 | asking to home after connecting |
| `js/quick-actions.js` | 160 | quick actions: running them a line at a time, and editing them |
| `js/profile.js` | 188 | saving, loading, importing and applying the machine profile |
| `js/controller-config.js` | 158 | reading the controller’s configuration ($$, $#) |
| `js/job-streaming.js` | 29 | the job’s shared state while it streams |
| `js/recovery-state.js` | 74 | the modal state at any line of a file, for recovery |
| `js/job-builder.js` | 181 | what a job actually sends: the file plus spin-up dwells, lifts, tool-change handling and the ending |
| `js/job-run.js` | 378 | running a job: filling the controller’s buffer, hold, resume, End job, finishing |
| `js/recovery.js` | 147 | restarting a stopped job from a line |
| `js/machine-tab.js` | 355 | wiring the Machine tab, and guarding against leaving mid-job |

## How the split was made, and what's next

The split was mechanical: `tools/split.py` cut the single file into these pieces at whole lines, so that
the build reassembled the original **byte for byte** (checked: 289,384 bytes, identical SHA-256). Nothing
about how Control behaves changed; `index.html` differs from before the split only by the note at its top.

A byte-identical split can't move anything, so a few things sit where the original file had them. They're
for the next stage, where code moves and tests are added:

- `quick-actions-state.js` holds the quick actions' banner and state; their code is in `quick-actions.js`.
- `dialogs.js` starts with a comment about offering to home, which belongs with `home-prompt.js`.
- `jog-panel.js` also holds the tool-change prompt's jog actions.

## Tests

```sh
node --test 'apps/control/test/*.test.mjs'     # GitHub runs these on every push
```

**The job builder** (`js/job-builder.js`) is the first piece with tests of its own: what a job actually
sends, beyond the file. `JobBuilder.build(lines, m)` is a pure function, given everything it needs about
the machine and the settings; `buildJobList()` gathers those from Control and calls it. The same file
loads in Node for its tests (`test/job-builder.test.mjs`), one per safety rule: spin-up waits, lifting
before a spindle stop (and never downwards), tool changes, the ending, and the file's own lines. Each
rule's test was checked by breaking the rule on purpose and watching the test fail.

When it was made a pure function, the old and new builders were run side by side in the real Control page
on 488 cases (15 files, including real VCarve output, each with every combination of homed, work offset,
Start & stop high, spin-up and parking), and gave identical results in every case.

**The G-code parser** (`packages/gcode/src/parser.cjs`) is shared with the `@454/gcode` package. Its golden
tests (`packages/gcode/test/golden.test.ts`) pin four real job files move by move; Control's
`test/parser.test.mjs` covers the rest: units, relative moves, arcs, every kind of problem it reports,
and reading CAM comments. Before it was shared, the package kept a copy of it, and its tests checked the
copy; the four files were checked inside Control's page too, and matched move for move.

**Next:** status parsing, time estimates and recovery.
