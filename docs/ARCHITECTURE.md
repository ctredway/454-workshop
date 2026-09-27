# 454 architecture

454 is **one desktop application built from plugins**: design, CAM, machine control and file
import are separate plugins sharing one core. It replaces the two single-file browser apps
(454 Design and 454 Control), whose behaviour it carries over unchanged and tested.

## Goals, in order

1. **The machine is never at the mercy of the screen.** Streaming to the controller runs in its
   own process. A frozen window or busy redraw cannot stall a running job.
2. **Safety is enforced by the core, not by plugins.** No plugin can switch it off.
3. **Behaviour is pinned by tests before code is changed.** Real job files are the reference.
4. **Carbide Motion's process, step for step.** People's habits come from Carbide Motion: when
   they're prompted, what they press, when the machine moves. 454 follows that order; its extra
   safety lives in quiet guards that don't change it, and any unavoidable difference is documented.
5. **One app, many plugins.** Drawing, toolpaths, the machine and VCarve import are plugins;
   a paid CAM would be one more plugin.

## Layout

```
packages/
  plugin-api/   the contract between core and plugins, and the host that enforces it   (MIT)
  gcode/        G-code parsing and checking, as the machine side sees it               (MIT)
  grbl/         the controller protocol: streaming, status, alarms, the simulator      (MIT)   next
  geom/         geometry: offsets, distance fields, tessellation                        (MIT)   next
  vcarve/       reading VCarve .crv projects and .vtdb tool libraries                   (MIT)   next
  cam/          toolpaths: profile, pocket, drill, chamfer                     (private if paid)
  ui/           theme, dialogs, help, shared controls                                   (MIT)
apps/
  desktop/      the Electron shell: main process (machine service) and window
plugins/
  design/  cam/  control/  vcarve/  tools/     first-party plugins
```

## The core

The core owns only what every plugin shares:

| Service | What it holds |
|---|---|
| Document | shapes with stable ids, dimensions, material (size, thickness, Z zero) |
| Undo | one history for the document; plugins contribute undoable operations |
| Settings | per plugin, kept apart from every other plugin's |
| Tool library | tools, machines, materials, feeds and speeds; shared by all plugins |
| Commands and shortcuts | registered by plugins; clashing shortcuts are refused |
| Files | which plugin opens which file type; one owner per type |
| Machine | the controller connection and job runner, in the main process |
| Theme and help | appearance, dialogs, the ⓘ help topics |

## Plugins

A plugin is a manifest plus contributions:

```ts
{
  manifest: { id: '454.design', name: 'Design', version: '1.0.0', apiVersion: 1, trusted: true },
  contributes: {
    commands:     [{ id: 'sketch.fillet', title: 'Fillet', run }],
    keybindings:  [{ key: 'F', command: 'sketch.fillet' }],
    panels:       [...],
    fileHandlers: [{ id: 'crv', extensions: ['.crv'], open }],
    help:         [...],
  },
  activate(host) { ... },
}
```

Extension points planned beyond these: drawing tools, toolpath types, post-processors,
machine drivers (GRBL now; grblHAL and FluidNC later), accessories (BitSetter, BitZero),
checks (drawing and job), and settings pages.

### Rules the host enforces

- **Shortcuts can't clash.** Registering a key already taken is refused, naming both plugins.
  (The browser version had F meaning Fillet in some tools and Fit in others.)
- **Registration is all or nothing.** A refused plugin leaves nothing behind.
- **API versions and dependencies are checked.** A plugin for a newer 454, or missing a plugin
  it needs, is refused with a reason.
- **One owner per file type.**
- **Only trusted, first-party plugins receive the machine.**

## The machine service

Runs in the Electron main process, not the window. It owns the serial port and streams jobs
with GRBL's character-counting protocol. It applies every safety step itself, whatever the
job or plugin: spin-up dwells after M3, lifts that never move down, homing required, the
BitSetter reference taken at Z zero, the end-of-job sequence, and a controlled End job. The
window receives status over IPC and sends requests; if the window hangs, the job does not.

## Testing

- **Golden tests** pin behaviour to real files: every segment the parser produces for real
  jobs is compared with what 454 Control produced.
- **A simulated GRBL controller** (next) will let whole jobs run in tests, including tool
  changes, End job, BitSetter and recovery, with the moves the machine would make checked.
- **CI** runs every test on every push.

## Migration

Not a rewrite. Each module moves across **unchanged**, is pinned by golden tests, and only
then is refactored and typed. The browser apps keep working until the desktop app replaces
them, so there is always a working sender.

| Step | Status |
|---|---|
| Plugin API and host, with tests | done |
| G-code parser, moved unchanged, golden-tested on 4 real jobs | done |
| GRBL protocol and a simulated controller | next |
| Job builder (spin-up, lifts, tool changes, ending), golden-tested | next |
| Geometry and CAM engines | then |
| VCarve readers | then |
| Electron shell with the machine service in the main process | then |
| Design, CAM and Control as plugins | then |


## The job builder, the simulated controller and the safety suite

**`@454/job`** turns a G-code file into the lines 454 sends, adding what files leave out: spin-up
waits after M3, lifts before the spindle stops, tool-change handling (lift, stop, and restart a
spindle the file thinks is still running), and every job's ending. It was moved verbatim from
Control; the three objects it reads (machine profile, controller state, loaded file) are passed in.
Its **golden tests** pin it to Control line for line: six machine setups (homed, not homed, park
captured, no waits, a machine counting up, no park) across five job files, recorded by running
Control itself.

**`@454/grbl`** is a **simulated GRBL 1.1 controller**, faithful where 454 depends on it: 128-byte
receive buffer and 15-block planner with `ok` on acceptance; status reports; feed hold decelerating
to Hold:0; soft reset raising ALARM:3 and losing position if moving; power-up alarm and homing;
probing against a simulated switch (ALARM:5 on a miss); soft limits; M6 rejected with error:20;
spindle changes in order with the moves. Time is virtual. Its own tests check each behaviour against
GRBL. Plus the **character-counting streamer** 454 uses.

**The safety suite** (`packages/job/test/safety.test.ts`) streams every job through the simulator
and checks the rules on the timeline:

1. no controller errors, no overfilled receive buffer
2. the spindle is running and up to speed for every cut below Z0
3. the spindle never stops with the tool in the material
4. at every tool change the spindle is off and Z at the top
5. moves 454 adds never go into the material; its lifts end at a safe height
6. every job ends with the spindle off, parked (or lifted when not homed)

**It is proven to catch failures**: six deliberate breaks of the job builder (no spin-up wait, no
lift before a stop, tool change without lifting, tool change with the spindle on, no restart after
a change, no park) are each caught. One fixture, `awkward.nc`, is deliberately badly behaved (M5 in
the cut, M6 with the spindle running, no restart, ending in the material); the well-behaved files
can't exercise those protections. Building the suite found two real problems in Control, fixed in
v0.31.1 and v0.31.2.

**Keeping them in step**: Control is still the source of truth until it becomes a plugin. After
changing Control's job builder, re-sync `packages/job/src/build.js` and re-record the fixture (the
scripts are in the session notes); the golden tests then show exactly what changed.


## The desktop app: 454 Workshop (apps/desktop)

**The name**: 454 Workshop, the umbrella for 454 Design and 454 Control (which keep their names). The
data folder stays "454" whatever the app is called (`app.setPath('userData', …/454)` in `main.js`):
renaming the app must never move where saved data lives. The same goes for the pages' address,
`app://454`, which is part of where the browser storage lives.

**Electron**, chosen over Tauri because it gives Windows and Linux the same Chromium engine Control
and Design are built and tested in, and runs the tested JavaScript packages unchanged; Tauri would put
Linux (the first platform) on WebKitGTK and the machine side in Rust. The shell is replaceable: the
packages and plugin API don't depend on it.

**Three parts:**
- **Main process** (`src/main.js`): the window, and a dialog when Control's own guard blocks closing
  while the machine is busy. Context isolation and the sandbox are on; the page gets no Node access.
- **Machine process** (`src/machine/`): an Electron utility process that owns the serial port
  (`serialport`), so nothing the window does can delay the machine. It watches for plugging in and
  out, and turns OS errors into instructions (Linux `dialout` permission, a port in use). It talks to
  the window over a direct MessageChannel handed over by the main process.
- **Web Serial stand-in** (`src/renderer/desktop-serial.js`): loaded before Control's own code, so
  Control runs **unchanged**: `navigator.serial` goes to the machine process, with a port picker in
  place of Chrome's.

**Both apps, each in its own window**: 454 Control (opens first) and 454 Design (menu, Ctrl+2, or any
link to it), plus the docs in their own window; web links open in the browser. Pages are served through
a private `app://` scheme rather than as files, so they can fetch their bundled files (fetch doesn't
work on plain files) and share one home for saved data: Design sees Control's work area, both share the
tool library. A View menu has the developer tools, for seeing the console when something goes wrong.

**Built from pinned copies**: `scripts/build-app.js` builds each page from `control/` and `design/`
(Design with its CAM engine). Each runs unchanged except: a Content Security Policy (only the app's own
files run; Design may also run WebAssembly, for the tool-database reader); everything it would fetch
from the internet comes bundled (three.js r128; opentype.js 1.3.4; sql.js 1.14.2 with its WebAssembly;
the Text tool's 20 fonts, at the versions Design names), so the app works offline; and Control loads the
Web Serial stand-in first. Every substitution is checked: if a page changes an address, the build stops.

**Tested three ways:**
1. `npm test`: the serial code over a real (virtual, socat) serial link to the simulated GRBL.
2. `npm run test:e2e`: the whole app under a virtual screen. Control, through its own code: connect,
   settings, home, zero, a real job against the simulator in real time, checked from both ends. Design,
   at the same time: the CAM engine, a Text font, the tool-database reader (WebAssembly), a toolpath
   saved as G-code, and a note left by Control read back (shared storage). Nothing blocked or failing
   to load in either window.
3. `npm run test:e2e:packaged`: the same, through the built AppImage.

**The icon** (`build/icon.svg`, rendered by `build/`): 454 drawn as a single-stroke toolpath in the
apps' amber on their dark slate. Numerals spaced so they read down to 16 px; at 32 px and below a
bolder version without the grid. `icon.ico` carries seven sizes for Windows; `icon.png` (512 px) for
Linux and the window.

**Windows builds on Linux** need Wine (64-bit is enough for the app and its icon; the NSIS installer
also needs 32-bit Wine). The release pipeline builds Windows on a real Windows runner instead, so
none of that is needed there. Until then, a ready-to-run zip (`electron-builder --win zip`) is the
Windows build.

**Step 1 of 5 done.** The streaming loop still runs in Control's page; only the port has moved. Next:
the release pipeline (tests gate every build; AppImage and Windows installer to GitHub Releases), then
the updater, then moving settings over from the browser, then Design as a plugin, then the streamer
into the machine process using `@454/grbl` and `@454/job`.

**For release builds (do with the release pipeline):**
- **Developer tools off** in release builds: `webPreferences.devTools: false` on every window, and the
  View menu's developer-tools item removed. Decided automatically from whether the build is a release
  (`app.isPackaged` together with the release channel), not a separate setting to remember. Test builds
  keep them, since they're how problems get diagnosed.
- **A hidden way back for support**: starting the app with `--debug` turns them back on, so a user can
  be walked through it when needed without it being in everyone's menu.
- **Help → Save diagnostic report**: saves the console log, app and Electron versions, operating
  system, and the machine's controller settings to one file a user can email. More useful than
  developer tools for most problem reports.
- **Not code protection**: the app's files are in `app.asar`, which anyone can unpack. That's fine for
  the open-source parts. If CAM becomes paid (see `LICENSING.md`), protect it with a license-key check,
  not by trying to hide the code; minifying makes it harder to read, not impossible.
